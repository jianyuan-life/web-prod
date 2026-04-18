// ============================================================
// Sentry（生產錯誤監控）
// ============================================================
// 用途：在 Webhook / 背景 Workflow 裡報錯到 Sentry（透過 HTTP Store API）
// 環境變數：SENTRY_DSN
//
// 設計原則：
// 1. 不依賴 @sentry/node SDK（避免增加 bundle size + 在 Edge/Workflow 環境跑不動）
// 2. 用 Sentry Store API（HTTP POST）— 只需 DSN
// 3. DSN 未設定 → 退回 console.error（不 crash）
// 4. 失敗不影響主流程（catch + warn）
//
// 參考：https://develop.sentry.dev/sdk/overview/
// ============================================================

/* eslint-disable no-console */

export type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

export type CaptureContext = {
  /** 任意 tags（會變成 Sentry 可搜尋的 tag）*/
  tags?: Record<string, string | number | boolean>
  /** 任意 extra 資料（非索引）*/
  extra?: Record<string, unknown>
  /** 關聯使用者 */
  user?: { id?: string; email?: string; username?: string }
  /** 關聯 request context */
  request?: { url?: string; method?: string }
  /** 附加事件指紋（控制聚合）*/
  fingerprint?: string[]
  /** 環境名稱覆寫（預設 VERCEL_ENV || NODE_ENV）*/
  environment?: string
  /** Release 版本（預設 VERCEL_GIT_COMMIT_SHA || package version）*/
  release?: string
}

// ── DSN 解析 ────────────────────────────────────────────────

type ParsedDsn = {
  publicKey: string
  projectId: string
  host: string
  protocol: string
  path: string
}

let cachedDsn: ParsedDsn | null | undefined = undefined

function parseDsn(dsn: string): ParsedDsn | null {
  // Sentry DSN 格式：https://<publicKey>@<host>/<projectId>
  // 或有 path： https://<publicKey>@<host>/<path>/<projectId>
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    if (!publicKey) return null
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts.length === 0) return null
    const projectId = pathParts[pathParts.length - 1]
    const path = pathParts.slice(0, -1).join('/')
    return {
      publicKey,
      projectId,
      host: url.host,
      protocol: url.protocol.replace(':', ''),
      path: path ? `/${path}` : '',
    }
  } catch {
    return null
  }
}

function getDsn(): ParsedDsn | null {
  if (cachedDsn !== undefined) return cachedDsn
  const raw = process.env.SENTRY_DSN
  if (!raw) {
    cachedDsn = null
    return null
  }
  cachedDsn = parseDsn(raw)
  if (!cachedDsn) {
    console.warn('[sentry] SENTRY_DSN 格式無效，退化為 console.error')
  }
  return cachedDsn
}

// ── Store API ──────────────────────────────────────────────

function makeEventId(): string {
  // 32 個 hex 字元（無破折號）— Sentry 要求格式
  const chars = '0123456789abcdef'
  let id = ''
  for (let i = 0; i < 32; i++) id += chars[Math.floor(Math.random() * 16)]
  return id
}

function getEnvironment(ctx?: CaptureContext): string {
  return (
    ctx?.environment ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'production'
  )
}

function getRelease(ctx?: CaptureContext): string | undefined {
  return (
    ctx?.release ||
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  )
}

function errorToException(err: unknown): { type: string; value: string; stacktrace?: { frames: Array<{ filename: string; lineno?: number; function?: string }> } } {
  if (err instanceof Error) {
    const frames: Array<{ filename: string; lineno?: number; function?: string }> = []
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1)
      for (const line of lines) {
        // e.g.   at funcName (file.ts:123:45)
        const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
        if (m) {
          frames.push({
            function: m[1] || '<anonymous>',
            filename: m[2],
            lineno: parseInt(m[3], 10),
          })
        }
      }
    }
    return {
      type: err.name || 'Error',
      value: err.message || String(err),
      stacktrace: frames.length ? { frames: frames.reverse() } : undefined,
    }
  }
  return { type: 'Error', value: String(err) }
}

async function sendEvent(payload: Record<string, unknown>): Promise<string | null> {
  const dsn = getDsn()
  if (!dsn) return null

  const eventId = (payload.event_id as string) || makeEventId()
  payload.event_id = eventId

  const url = `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/store/`
  const authHeader =
    `Sentry sentry_version=7,` +
    `sentry_client=jianyuan-sentry-prod/1.0,` +
    `sentry_timestamp=${Math.floor(Date.now() / 1000)},` +
    `sentry_key=${dsn.publicKey}`

  try {
    // v5.3.19：Workflow 沙箱相容（Promise.race 取代 AbortSignal）
    const TIMEOUT_MS = 5000
    const res = await Promise.race<Response>([
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': authHeader,
        },
        body: JSON.stringify(payload),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error(`[sentry] timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ])
    if (!res.ok) {
      console.warn(`[sentry] Store API 回 ${res.status}`)
      return null
    }
    return eventId
  } catch (err) {
    console.warn('[sentry] Store API 失敗:', err)
    return null
  }
}

function buildBasePayload(ctx?: CaptureContext): Record<string, unknown> {
  return {
    timestamp: Date.now() / 1000,
    platform: 'node',
    sdk: { name: 'jianyuan-sentry-prod', version: '1.0.0' },
    environment: getEnvironment(ctx),
    release: getRelease(ctx),
    server_name: process.env.VERCEL_REGION || 'unknown',
    tags: ctx?.tags,
    extra: ctx?.extra,
    user: ctx?.user,
    request: ctx?.request,
    fingerprint: ctx?.fingerprint,
  }
}

// ── 公開 API ────────────────────────────────────────────────

/**
 * 記錄一個例外（exception）到 Sentry。
 * - 沒 DSN → console.error
 * - 回傳 event_id（無 DSN 時回 null）
 */
export async function captureException(
  err: unknown,
  ctx?: CaptureContext,
): Promise<string | null> {
  const dsn = getDsn()
  if (!dsn) {
    console.error('[sentry:fallback]', err, ctx ? { ctx } : '')
    return null
  }

  const exception = errorToException(err)
  const payload = {
    ...buildBasePayload(ctx),
    level: 'error' as SentryLevel,
    exception: { values: [exception] },
    message: exception.value,
  }

  return sendEvent(payload)
}

/**
 * 記錄一則訊息（message）到 Sentry，預設 level=info。
 * - 沒 DSN → console.log/warn/error（依 level）
 */
export async function captureMessage(
  msg: string,
  level: SentryLevel = 'info',
  ctx?: CaptureContext,
): Promise<string | null> {
  const dsn = getDsn()
  if (!dsn) {
    const tag = `[sentry:fallback:${level}]`
    if (level === 'fatal' || level === 'error') console.error(tag, msg, ctx)
    else if (level === 'warning') console.warn(tag, msg, ctx)
    else console.log(tag, msg, ctx)
    return null
  }

  const payload = {
    ...buildBasePayload(ctx),
    level,
    message: { formatted: msg },
  }

  return sendEvent(payload)
}

/**
 * 方便的 helper：在 try/catch 裡包著使用
 *   await withSentry(async () => { ... }, { tags: { scope: 'webhook' } })
 * 發生錯誤會自動捕捉再拋出（讓上層還能處理）。
 */
export async function withSentry<T>(
  fn: () => Promise<T>,
  ctx?: CaptureContext,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    await captureException(err, ctx)
    throw err
  }
}
