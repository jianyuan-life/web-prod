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

import { operationalErrorClass, operationalFingerprint } from '../../security/operational-telemetry.ts'

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

const SAFE_SCHEMA_KEYS = new Set([
  'amount', 'attempts', 'auditType', 'callStage', 'code', 'count', 'country',
  'critical', 'errorType', 'incidentFingerprint', 'isFinalFail', 'method',
  'model', 'path', 'planCode', 'provider', 'reportFingerprint', 'requestFingerprint',
  'retryCount', 'sessionFingerprint', 'severity', 'source', 'stage', 'status',
])
const KNOWN_ENVIRONMENTS = new Set(['development', 'local', 'preview', 'production', 'staging', 'test'])

function safeTelemetryKey(value: string): string {
  return SAFE_SCHEMA_KEYS.has(value) ? value : `field_${operationalFingerprint(value)}`
}

function sanitizeTelemetryValue(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth >= 12) return '[redacted-depth]'
  if (value === null || value === undefined || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const bounded = value.slice(0, 2048)
    return `fingerprint:${operationalFingerprint(bounded)}`
  }
  if (typeof value !== 'object') return `fingerprint:${operationalFingerprint(String(value))}`
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((item) => sanitizeTelemetryValue(item, key, depth + 1, seen))
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 64).map(
    ([childKey, childValue]) => [
      safeTelemetryKey(childKey),
      sanitizeTelemetryValue(childValue, childKey, depth + 1, seen),
    ],
  ))
}

function sanitizeContext(ctx?: CaptureContext): CaptureContext | undefined {
  if (!ctx) return undefined
  const tags = ctx.tags
    ? Object.fromEntries(Object.entries(ctx.tags).slice(0, 64).map(([key, value]) => {
      const safeKey = safeTelemetryKey(key)
      return [safeKey, sanitizeTelemetryValue(value, key)]
    })) as Record<string, string | number | boolean>
    : undefined
  const extra = ctx.extra
    ? sanitizeTelemetryValue(ctx.extra, 'extra') as Record<string, unknown>
    : undefined
  const user = ctx.user
    ? {
      id: ctx.user.id ? `fingerprint:${operationalFingerprint(ctx.user.id)}` : undefined,
      email: undefined,
      username: undefined,
    }
    : undefined
  const request = ctx.request
    ? {
      method: typeof ctx.request.method === 'string' && /^[A-Z]{3,10}$/u.test(ctx.request.method)
        ? ctx.request.method
        : undefined,
      url: ctx.request.url ? `fingerprint:${operationalFingerprint(ctx.request.url)}` : undefined,
    }
    : undefined
  return {
    tags,
    extra,
    user,
    request,
    fingerprint: ctx.fingerprint?.slice(0, 16).map(value => `fingerprint:${operationalFingerprint(value)}`),
    environment: ctx.environment,
    release: ctx.release,
  }
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
  const candidate = (
    ctx?.environment ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'production'
  )
  return KNOWN_ENVIRONMENTS.has(candidate)
    ? candidate
    : `fingerprint:${operationalFingerprint(candidate)}`
}

function getRelease(ctx?: CaptureContext): string | undefined {
  if (ctx?.release) return `fingerprint:${operationalFingerprint(ctx.release)}`
  const candidate = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined
  if (!candidate) return undefined
  if (/^(?:[0-9a-f]{7,64}|v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/u.test(candidate)) {
    return candidate
  }
  return `fingerprint:${operationalFingerprint(candidate)}`
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
            function: m[1] ? `fingerprint:${operationalFingerprint(m[1])}` : '<anonymous>',
            filename: `fingerprint:${operationalFingerprint(m[2])}`,
            lineno: parseInt(m[3], 10),
          })
        }
      }
    }
    return {
      type: operationalErrorClass(err),
      value: `fingerprint:${operationalFingerprint(err.message || String(err))}`,
      stacktrace: frames.length ? { frames: frames.reverse() } : undefined,
    }
  }
  return { type: operationalErrorClass(err), value: `fingerprint:${operationalFingerprint(err)}` }
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
    console.warn('[sentry] Store API 失敗', { errorType: operationalErrorClass(err) })
    return null
  }
}

function buildBasePayload(ctx?: CaptureContext): Record<string, unknown> {
  const safeContext = sanitizeContext(ctx)
  return {
    timestamp: Date.now() / 1000,
    platform: 'node',
    sdk: { name: 'jianyuan-sentry-prod', version: '1.0.0' },
    environment: getEnvironment(safeContext),
    release: getRelease(safeContext),
    server_name: process.env.VERCEL_REGION && /^[a-z]{2,4}\d{1,2}$/u.test(process.env.VERCEL_REGION)
      ? process.env.VERCEL_REGION
      : 'unknown',
    tags: safeContext?.tags,
    extra: safeContext?.extra,
    user: safeContext?.user,
    request: safeContext?.request,
    fingerprint: safeContext?.fingerprint,
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
    console.error('[sentry:fallback]', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? err.message : err),
      context: sanitizeContext(ctx),
    })
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
    const fallback = { messageFingerprint: operationalFingerprint(msg), context: sanitizeContext(ctx) }
    if (level === 'fatal' || level === 'error') console.error(tag, fallback)
    else if (level === 'warning') console.warn(tag, fallback)
    else console.log(tag, fallback)
    return null
  }

  const payload = {
    ...buildBasePayload(ctx),
    level,
    message: { formatted: `fingerprint:${operationalFingerprint(msg)}` },
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
