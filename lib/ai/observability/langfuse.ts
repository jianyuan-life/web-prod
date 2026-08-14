// ============================================================
// Langfuse — AI 觀察台（LLM call tracing）
// ============================================================
// 用途：包裝 LLM call，只記錄 allowlist 標籤、不可逆識別指紋與用量/延遲。
// 隱私邊界：prompt、output、任意 metadata、原始客戶 ID 與錯誤訊息不得外送或落 console。
// 依賴：npm install langfuse（未安裝時自動退化為 console.log）
// 環境變數：
//   LANGFUSE_PUBLIC_KEY
//   LANGFUSE_SECRET_KEY
//   LANGFUSE_HOST=https://cloud.langfuse.com（預設）
//
// 設計原則：
// 1. 零 env 時不 crash，只輸出已去識別的本機計數（開發環境友善）
// 2. 不加外部依賴（langfuse SDK 透過 dynamic import + try/catch，沒裝也能 compile）
// 3. traceLLMCall 是主要 wrapper，createTrace/endTrace 提供進階用法
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import {
  operationalErrorClass,
  operationalFingerprint,
} from '../../security/operational-telemetry.ts'

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
  /** 客戶/使用者 ID；有 telemetry HMAC key 時只外送不可逆指紋，否則省略。*/
  userId?: string
  /** 關聯 session（如 reportId）；外送規則同 userId。*/
  sessionId?: string
  /** 任意 tag */
  tags?: string[]
  /** 呼叫端相容欄位；內容不外送。*/
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

const ALLOWED_TRACE_NAMES = new Set([
  'consultation-report',
  'free-tool-analysis',
  'generate-report',
  'llm-call',
  'quality-review',
  'report-generation',
])
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'deepseek-chat',
  'deepseek-reasoner',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gpt-4o',
  'gpt-4o-mini',
  'kimi-k2-thinking',
  'kimi-k2.5',
])
const ALLOWED_TAGS = new Set([
  'C', 'D', 'E1', 'E2', 'E3', 'E4', 'G15', 'R',
  'development', 'error', 'preview', 'production', 'success',
])

function fingerprintIfConfigured(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const fingerprint = operationalFingerprint(value)
  return fingerprint === 'unavailable' ? undefined : fingerprint
}

function safeLabel(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  const raw = String(value ?? '')
  if (!raw) return undefined
  if (allowed.has(raw)) return raw
  const fingerprint = fingerprintIfConfigured(raw)
  return fingerprint ? `fingerprint:${fingerprint}` : undefined
}

function sanitizedUsage(usage?: LLMUsage): LLMUsage | undefined {
  if (!usage) return undefined
  const number = (value: unknown, integer = false): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
    return integer ? Math.floor(value) : value
  }
  const sanitized: LLMUsage = {
    promptTokens: number(usage.promptTokens, true),
    completionTokens: number(usage.completionTokens, true),
    totalTokens: number(usage.totalTokens, true),
    costUsd: number(usage.costUsd),
  }
  return Object.values(sanitized).some((value) => value !== undefined) ? sanitized : undefined
}

function sanitizedMeta(meta: LLMCallMeta): Record<string, unknown> {
  const tags = meta.tags
    ?.map((tag) => safeLabel(tag, ALLOWED_TAGS))
    .filter((tag): tag is string => Boolean(tag))
  return compactRecord({
    name: safeLabel(meta.name, ALLOWED_TRACE_NAMES),
    model: safeLabel(meta.model, ALLOWED_MODELS),
    userId: fingerprintIfConfigured(meta.userId),
    sessionId: fingerprintIfConfigured(meta.sessionId),
    tags: tags?.length ? tags : undefined,
  })
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function operationalMetrics(args: {
  latencyMs?: number
  usage?: LLMUsage
  hasInput?: boolean
  hasOutput?: boolean
  error?: unknown
}): Record<string, unknown> {
  return compactRecord({
    latencyMs:
      typeof args.latencyMs === 'number' && Number.isFinite(args.latencyMs) && args.latencyMs >= 0
        ? Math.floor(args.latencyMs)
        : undefined,
    usage: sanitizedUsage(args.usage),
    hasInput: args.hasInput,
    hasOutput: args.hasOutput,
    errorClass: args.error === undefined ? undefined : operationalErrorClass(args.error),
  })
}

function isConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

/**
 * 惰性初始化 Langfuse client。
 * - env 未設定 → 回 null（退化為去識別的本機計數）
 * - SDK 未安裝 → 回 null（退化為去識別的本機計數）
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
      console.warn('[langfuse] 套件未安裝（npm install langfuse），退化為本機計數')
      return null
    }
    const Langfuse = (mod as any).Langfuse || (mod as any).default
    if (!Langfuse) {
      console.warn('[langfuse] SDK 結構未預期，退化為本機計數')
      return null
    }
    langfuseClient = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    })
    return langfuseClient
  } catch (err) {
    console.warn('[langfuse] 初始化失敗，退化為本機計數:', operationalErrorClass(err))
    return null
  }
}

// ── 工具 ────────────────────────────────────────────────────

function makeFallbackId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function consoleLogTrace(
  stage: string,
  meta: LLMCallMeta,
  metrics: Parameters<typeof operationalMetrics>[0] = {},
): void {
  // 開發環境友善輸出：結構化單行 JSON，避免洗版
  try {
    console.log(
      `[langfuse:${stage}]`,
      JSON.stringify({ ...sanitizedMeta(meta), ...operationalMetrics(metrics) }),
    )
  } catch {
    console.log(`[langfuse:${stage}]`)
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
    consoleLogTrace('start', meta)
    return {
      id,
      flush: async () => {},
      end: async (args) => {
        consoleLogTrace('end', meta, {
          usage: args?.usage,
          hasOutput: args?.output !== undefined,
          error: args?.error,
        })
      },
    }
  }

  try {
    const safeMeta = sanitizedMeta(meta)
    const trace = client.trace(compactRecord({
      name: safeMeta.name,
      userId: safeMeta.userId,
      sessionId: safeMeta.sessionId,
      tags: safeMeta.tags,
    }))
    return {
      id: trace.id || makeFallbackId('trace'),
      flush: async () => {
        try { await client.flushAsync?.() } catch { /* ignore */ }
      },
      end: async (args) => {
        try {
          trace.update?.({
            metadata: operationalMetrics({
              usage: args?.usage,
              hasOutput: args?.output !== undefined,
              error: args?.error,
            }),
          })
        } catch (err) {
          console.warn('[langfuse] trace.update 失敗:', operationalErrorClass(err))
        }
      },
    }
  } catch (err) {
    console.warn('[langfuse] createTrace 失敗，退化為本機計數:', operationalErrorClass(err))
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
    console.warn('[langfuse] endTrace 失敗:', operationalErrorClass(err))
  }
}

/**
 * 主要 wrapper — 包裝一次 LLM 呼叫，只記錄是否有 input/output、延遲、usage 與 cost。
 * input/output 原值只在業務函式與呼叫端之間傳遞，不送往觀測平台。
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

  // 沒 client：直接執行 + 去識別的本機計數
  if (!client) {
    consoleLogTrace('generation:start', meta, { hasInput: payload.input !== undefined })
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
        error: err,
      })
      throw err
    }
  }

  // 有 client：建 trace + generation
  let trace: any = null
  let generation: any = null
  try {
    const safeMeta = sanitizedMeta(meta)
    trace = client.trace(compactRecord({
      name: safeMeta.name,
      userId: safeMeta.userId,
      sessionId: safeMeta.sessionId,
      tags: safeMeta.tags,
      metadata: { hasInput: payload.input !== undefined },
    }))
    generation = trace.generation?.(compactRecord({
      name: safeMeta.name,
      model: safeMeta.model,
      metadata: { hasInput: payload.input !== undefined },
      startTime: new Date(startedAt),
    }))
  } catch (err) {
    console.warn('[langfuse] trace/generation 建立失敗，繼續執行本體:', operationalErrorClass(err))
  }

  try {
    const { output, usage } = await fn()
    const endedAt = Date.now()
    const safeUsage = sanitizedUsage(usage)
    const metrics = operationalMetrics({
      latencyMs: endedAt - startedAt,
      usage,
      hasOutput: output !== undefined,
    })

    try {
      generation?.end?.({
        endTime: new Date(endedAt),
        metadata: metrics,
        usage: safeUsage
          ? {
              promptTokens: safeUsage.promptTokens,
              completionTokens: safeUsage.completionTokens,
              totalTokens:
                safeUsage.totalTokens ??
                ((safeUsage.promptTokens ?? 0) + (safeUsage.completionTokens ?? 0) || undefined),
            }
          : undefined,
        usageDetails: safeUsage?.costUsd !== undefined ? { cost_usd: safeUsage.costUsd } : undefined,
      })
      trace?.update?.({
        metadata: metrics,
      })
      // 非同步 flush，不阻塞主流程
      client.flushAsync?.().catch(() => {})
    } catch (err) {
      console.warn('[langfuse] generation.end 失敗:', operationalErrorClass(err))
    }

    return output
  } catch (err) {
    const metrics = operationalMetrics({
      latencyMs: Date.now() - startedAt,
      error: err,
    })
    try {
      generation?.end?.({
        level: 'ERROR',
        statusMessage: operationalErrorClass(err),
        metadata: metrics,
        endTime: new Date(),
      })
      trace?.update?.({
        metadata: metrics,
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
    console.warn('[langfuse] flush 失敗:', operationalErrorClass(err))
  }
}
