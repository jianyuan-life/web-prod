const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// v5.3.34 健壯化：加 30 秒 timeout（Python 排盤 API Fly.io 冷啟動可能慢）
//   原本無 timeout → 若 Fly.io 死掉整個 fetch 會 hang 住 Next.js serverless 直到平台 kill
const DEFAULT_TIMEOUT_MS = 30_000

// T10 v5.10.353 (Master Plan Sprint 7):RateLimitError 帶 retryAfter 給 client UI 顯示倒數
// 使用:catch (e) { if (e instanceof RateLimitError) { setRetryAfter(e.retryAfter) } }
export class RateLimitError extends Error {
  retryAfter: number  // 秒數
  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

// T10:其他 HTTP error 也分類、便於 UI 友好顯示
export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// T10:統一 response 處理(429 → RateLimitError、其他 4xx/5xx → ApiError)
async function handleResponse(res: Response): Promise<unknown> {
  if (res.ok) {
    return res.json()
  }

  // T10:429 特殊處理、解析 Retry-After header(秒數 or HTTP-date format)
  if (res.status === 429) {
    const retryAfterRaw = res.headers.get('Retry-After') || ''
    let retryAfter = 60  // default 60 秒
    const parsed = parseInt(retryAfterRaw, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed < 86400) {
      retryAfter = parsed
    } else if (retryAfterRaw) {
      // HTTP-date format(RFC 7231)— 算秒差
      const dateMs = Date.parse(retryAfterRaw)
      if (!isNaN(dateMs)) {
        retryAfter = Math.max(1, Math.ceil((dateMs - Date.now()) / 1000))
      }
    }
    let errBody: { error?: string; detail?: string } = {}
    try { errBody = await res.json() } catch { /* 失敗用 default */ }
    throw new RateLimitError(
      errBody.error || errBody.detail || `請求過於頻繁、請等 ${retryAfter} 秒後重試`,
      retryAfter,
    )
  }

  // 其他 error
  const err = await res.json().catch(() => ({ detail: res.statusText }))
  throw new ApiError(
    err.detail || err.error || `請求失敗 (HTTP ${res.status})`,
    res.status,
    err,
  )
}

export async function apiPost(path: string, body: Record<string, unknown>) {
  let res: Response
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

export async function apiGet(path: string) {
  let res: Response
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, { method: 'GET' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

// ─── T10b v5.10.372:Internal Next.js API helpers(client-side、相對路徑、自動帶 RateLimitError + ApiError) ───
//
// 為什麼:99 個 fetch caller 散落各 client-side hook、各自無 429/503 處理、無 timeout
// 設計:internalFetch 統一加 timeout + RateLimitError 解析、可選帶 auth header
//
// 用法(取代散落 raw fetch):
//   import { internalGet, internalPost, RateLimitError } from '@/lib/api'
//   try {
//     const data = await internalPost('/api/checkout', { plan, amount }, { authToken })
//   } catch (e) {
//     if (e instanceof RateLimitError) {
//       toast(`稍後再試(${e.retryAfter}s)`)
//     }
//   }

interface InternalFetchOptions {
  /** Bearer token(會塞 Authorization header) */
  authToken?: string
  /** 額外 headers */
  headers?: Record<string, string>
  /** timeout(預設 30s、與外部 API 一致) */
  timeoutMs?: number
}

export async function internalGet(path: string, opts: InternalFetchOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`
  let res: Response
  try {
    res = await fetchWithTimeout(path, { method: 'GET', headers }, opts.timeoutMs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

export async function internalPost(
  path: string,
  body: Record<string, unknown> | unknown,
  opts: InternalFetchOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`
  let res: Response
  try {
    res = await fetchWithTimeout(
      path,
      { method: 'POST', headers, body: JSON.stringify(body) },
      opts.timeoutMs,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

// T10b v5.10.373 加 internalDelete / internalPut / internalPatch — 完整 REST verb 覆蓋
export async function internalDelete(path: string, opts: InternalFetchOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`
  let res: Response
  try {
    res = await fetchWithTimeout(path, { method: 'DELETE', headers }, opts.timeoutMs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

export async function internalPut(
  path: string,
  body: Record<string, unknown> | unknown,
  opts: InternalFetchOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`
  let res: Response
  try {
    res = await fetchWithTimeout(
      path,
      { method: 'PUT', headers, body: JSON.stringify(body) },
      opts.timeoutMs,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}

export async function internalPatch(
  path: string,
  body: Record<string, unknown> | unknown,
  opts: InternalFetchOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  if (opts.authToken) headers['Authorization'] = `Bearer ${opts.authToken}`
  let res: Response
  try {
    res = await fetchWithTimeout(
      path,
      { method: 'PATCH', headers, body: JSON.stringify(body) },
      opts.timeoutMs,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  return handleResponse(res)
}
