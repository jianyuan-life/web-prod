const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// v5.3.34 健壯化：加 30 秒 timeout（Python 排盤 API Fly.io 冷啟動可能慢）
//   原本無 timeout → 若 Fly.io 死掉整個 fetch 會 hang 住 Next.js serverless 直到平台 kill
const DEFAULT_TIMEOUT_MS = 30_000

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `請求失敗 (HTTP ${res.status})`)
  }
  return res.json()
}

export async function apiGet(path: string) {
  let res: Response
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, { method: 'GET' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('abort') ? `請求逾時 (${DEFAULT_TIMEOUT_MS}ms)` : `網路錯誤：${msg}`)
  }
  if (!res.ok) throw new Error(`請求失敗 (HTTP ${res.status})`)
  return res.json()
}
