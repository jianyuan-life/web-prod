// ============================================================
// Langfuse — AI 觀察台（LLM call tracing）
// ============================================================
// 用途：包裝所有 LLM call，記錄 input/output/latency/cost/model/user_id
// 依賴：npm install langfuse（未安裝時自動退化為 console.log）
// 環境變數：
//   LANGFUSE_PUBLIC_KEY
//   LANGFUSE_SECRET_KEY
//   LANGFUSE_HOST=https://cloud.langfuse.com（預設）
//
// 設計原則：
// 1. 零 env 時不 crash，只 console.log（開發環境友善）
// 2. 不加外部依賴（langfuse SDK 透過 dynamic import + try/catch，沒裝也能 compile）
// 3. traceLLMCall 是主要 wrapper，createTrace/endTrace 提供進階用法
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

// ── 型別 ────────────────────────────────────────────────────

export type LLMUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** USD */
  costUsd?: number
}

export type LLMCallMeta = {
  /** 業務用 trace 名稱（如 "generate-report-call1"）*/
  name: string
  /** 模型 ID（如 "claude-opus-4-6"）*/
  model: string
  /** 客戶/使用者 ID（用於 Langfuse user-level 分析）*/
  userId?: string
  /** 關聯 session（如 reportId）*/
  sessionId?: string
  /** 任意 tag */
  tags?: string[]
  /** 任意 metadata */
  metadata?: Record<string, unknown>
}

export type TraceHandle = {
  id: string
  flush: () => Promise<void>
  /** 回寫最終輸出和 usage（optional）*/
  end: (args?: { output?: unknown; usage?: LLMUsage; error?: unknown }) => Promise<void>
}

// ── 內部 state ──────────────────────────────────────────────

let langfuseClient: any = null
let langfuseInitAttempted = false

function isConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

/**
 * 惰性初始化 Langfuse client。
 * - env 未設定 → 回 null（退化為 console.log）
 * - SDK 未安裝 → 回 null（退化為 console.log）
 */
async function getClient(): Promise<any> {
  if (langfuseInitAttempted) return langfuseClient
  langfuseInitAttempted = true

  if (!isConfigured()) {
    return null
  }

  try {
    // Dynamic import：沒裝 langfuse 套件也不會 compile 失敗
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- optional dependency
    const mod = await import('langfuse').catch(() => null)
    if (!mod) {
      console.warn('[langfuse] 套件未安裝（npm install langfuse），退化為 console.log')
      return null
    }
    const Langfuse = (mod as any).Langfuse || (mod as any).default
    if (!Langfuse) {
      console.warn('[langfuse] SDK 結構未預期，退化為 console.log')
      return null
    }
    langfuseClient = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    })
    return langfuseClient
  } catch (err) {
    console.warn('[langfuse] 初始化失敗，退化為 console.log:', err)
    return null
  }
}

// ── 工具 ────────────────────────────────────────────────────

function makeFallbackId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function consoleLogTrace(stage: string, meta: LLMCallMeta, extra?: Record<string, unknown>): void {
  // 開發環境友善輸出：結構化單行 JSON，避免洗版
  try {
    console.log(
      `[langfuse:${stage}]`,
      JSON.stringify({ name: meta.name, model: meta.model, userId: meta.userId, sessionId: meta.sessionId, ...(extra || {}) }),
    )
  } catch {
    console.log(`[langfuse:${stage}]`, meta.name, meta.model)
  }
}

// ── 公開 API ────────────────────────────────────────────────

/**
 * 建立一個 trace handle，可在多個 generation 之間共用。
 * - Langfuse 已初始化：回傳真實 trace
 * - 未初始化：回傳 console-only handle（不 crash）
 */
export async function createTrace(meta: LLMCallMeta): Promise<TraceHandle> {
  const client = await getClient()

  if (!client) {
    const id = makeFallbackId('trace')
    consoleLogTrace('start', meta, { traceId: id })
    return {
      id,
      flush: async () => {},
      end: async (args) => {
        consoleLogTrace('end', meta, {
          traceId: id,
          usage: args?.usage,
          hasOutput: args?.output !== undefined,
          hasError: args?.error !== undefined,
        })
      },
    }
  }

  try {
    const trace = client.trace({
      name: meta.name,
      userId: meta.userId,
      sessionId: meta.sessionId,
      tags: meta.tags,
      metadata: meta.metadata,
    })
    return {
      id: trace.id || makeFallbackId('trace'),
      flush: async () => {
        try { await client.flushAsync?.() } catch { /* ignore */ }
      },
      end: async (args) => {
        try {
          trace.update?.({
            output: args?.output,
            metadata: {
              ...(meta.metadata || {}),
              usage: args?.usage,
              error: args?.error ? String(args.error) : undefined,
            },
          })
        } catch (err) {
          console.warn('[langfuse] trace.update 失敗:', err)
        }
      },
    }
  } catch (err) {
    console.warn('[langfuse] createTrace 失敗，退化為 console.log:', err)
    return {
      id: makeFallbackId('trace'),
      flush: async () => {},
      end: async () => {},
    }
  }
}

/**
 * 結束 trace（flush + 最終輸出）
 * 若拿到 TraceHandle 直接調用 handle.end()/handle.flush() 也可以。
 */
export async function endTrace(
  handle: TraceHandle,
  args?: { output?: unknown; usage?: LLMUsage; error?: unknown },
): Promise<void> {
  try {
    await handle.end(args)
    await handle.flush()
  } catch (err) {
    console.warn('[langfuse] endTrace 失敗:', err)
  }
}

/**
 * 主要 wrapper — 包裝一次 LLM 呼叫，自動記錄 input/output/latency/usage/cost。
 *
 * 用法：
 *   const result = await traceLLMCall(
 *     { name: 'call1', model: 'claude-opus-4-6', userId, sessionId: reportId },
 *     { input: { system, user } },
 *     async () => {
 *       const content = await claudeStreamingCall(...)
 *       return { output: content, usage: { promptTokens: 1234, completionTokens: 5678 } }
 *     },
 *   )
 */
export async function traceLLMCall<T>(
  meta: LLMCallMeta,
  payload: { input?: unknown },
  fn: () => Promise<{ output: T; usage?: LLMUsage }>,
): Promise<T> {
  const startedAt = Date.now()
  const client = await getClient()

  // 沒 client：直接執行 + console.log
  if (!client) {
    consoleLogTrace('generation:start', meta)
    try {
      const { output, usage } = await fn()
      consoleLogTrace('generation:success', meta, {
        latencyMs: Date.now() - startedAt,
        usage,
      })
      return output
    } catch (err) {
      consoleLogTrace('generation:error', meta, {
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  // 有 client：建 trace + generation
  let trace: any = null
  let generation: any = null
  try {
    trace = client.trace({
      name: meta.name,
      userId: meta.userId,
      sessionId: meta.sessionId,
      tags: meta.tags,
      metadata: meta.metadata,
      input: payload.input,
    })
    generation = trace.generation?.({
      name: meta.name,
      model: meta.model,
      input: payload.input,
      startTime: new Date(startedAt),
    })
  } catch (err) {
    console.warn('[langfuse] trace/generation 建立失敗，繼續執行本體:', err)
  }

  try {
    const { output, usage } = await fn()
    const endedAt = Date.now()

    try {
      generation?.end?.({
        output,
        endTime: new Date(endedAt),
        usage: usage
          ? {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens:
                usage.totalTokens ??
                ((usage.promptTokens ?? 0) + (usage.completionTokens ?? 0) || undefined),
            }
          : undefined,
        usageDetails: usage?.costUsd !== undefined ? { cost_usd: usage.costUsd } : undefined,
      })
      trace?.update?.({
        output,
        metadata: {
          ...(meta.metadata || {}),
          latencyMs: endedAt - startedAt,
          usage,
        },
      })
      // 非同步 flush，不阻塞主流程
      client.flushAsync?.().catch(() => {})
    } catch (err) {
      console.warn('[langfuse] generation.end 失敗:', err)
    }

    return output
  } catch (err) {
    try {
      generation?.end?.({
        level: 'ERROR',
        statusMessage: err instanceof Error ? err.message : String(err),
        endTime: new Date(),
      })
      trace?.update?.({
        metadata: {
          ...(meta.metadata || {}),
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - startedAt,
        },
      })
      client.flushAsync?.().catch(() => {})
    } catch { /* ignore */ }
    throw err
  }
}

/**
 * 明確 flush（Vercel serverless function 結束前可呼叫，確保資料送達）
 */
export async function flushLangfuse(): Promise<void> {
  const client = await getClient()
  if (!client) return
  try {
    await client.flushAsync?.()
  } catch (err) {
    console.warn('[langfuse] flush 失敗:', err)
  }
}
