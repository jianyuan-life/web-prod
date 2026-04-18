// ============================================================
// Upstash Redis — 排盤快取（REST API）
// ============================================================
// 用途：把 Python 排盤結果快取起來（同樣生辰資料→同樣結果，不必重算）
// 環境變數：
//   UPSTASH_REDIS_REST_URL    — e.g. https://xxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN  — Bearer token
//
// 設計原則：
// 1. 用 REST API，不加 redis client 依賴（只用 fetch）
// 2. env 未設 → 所有操作直接回 null/no-op（快取失效但不 throw）
// 3. 任何錯誤都 swallow + warn（快取是輔助，壞了不能影響主流程）
// ============================================================

/* eslint-disable no-console */

// ── 設定 ────────────────────────────────────────────────────

function getConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

// ── 底層 REST 呼叫 ──────────────────────────────────────────

type UpstashResponse = {
  result?: unknown
  error?: string
}

async function callUpstash(
  pathSegments: string[],
  opts: { method?: 'GET' | 'POST'; body?: string; timeoutMs?: number } = {},
): Promise<UpstashResponse | null> {
  const cfg = getConfig()
  if (!cfg) return null

  // Upstash REST 路徑：command 組成為 /CMD/key/value...
  // e.g. https://xxx.upstash.io/GET/mykey
  const path = pathSegments.map((s) => encodeURIComponent(s)).join('/')
  const url = `${cfg.url}/${path}`

  try {
    // v5.3.17：Vercel Workflow 沙箱沒 AbortController 全域，改 AbortSignal.timeout
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[upstash] ${pathSegments[0]} ${res.status}: ${text.slice(0, 200)}`)
      return null
    }
    return (await res.json()) as UpstashResponse
  } catch (err) {
    console.warn(`[upstash] ${pathSegments[0]} 失敗:`, err)
    return null
  }
}

// ── 公開 API ────────────────────────────────────────────────

/**
 * 取得快取值。
 * - env 未設 / key 不存在 / 解析失敗 → 回 null
 * - 值預期為 JSON 字串（由 setCache 寫入）
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  if (!key) return null
  const res = await callUpstash(['GET', key])
  if (!res || res.result === null || res.result === undefined) return null

  const raw = res.result
  if (typeof raw !== 'string') {
    // 少數情況 Upstash 會回非字串型（ex. number），直接回
    return raw as T
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    // 不是 JSON 就原樣回（兼容直接存字串的 case）
    return raw as unknown as T
  }
}

/**
 * 寫入快取。
 * - value 會被 JSON.stringify（除非是 string）
 * - ttlSeconds 必填，避免無限留存
 * - 失敗回 false（不 throw）
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  if (!key || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return false

  const serialized = typeof value === 'string' ? value : JSON.stringify(value)

  // Upstash REST：SET/key/value + 查詢參數 EX=ttl
  // 用 POST + body 傳 value，避免超長值塞 URL
  const cfg = getConfig()
  if (!cfg) return false

  try {
    // v5.3.17：Workflow 沙箱相容
    const res = await fetch(`${cfg.url}/SET/${encodeURIComponent(key)}?EX=${Math.floor(ttlSeconds)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'text/plain',
      },
      body: serialized,
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[upstash] SET ${res.status}: ${text.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[upstash] SET 失敗:', err)
    return false
  }
}

/**
 * 刪除快取。
 * - 失敗回 false（不 throw）
 */
export async function delCache(key: string): Promise<boolean> {
  if (!key) return false
  const res = await callUpstash(['DEL', key])
  return Boolean(res && res.result)
}

// ── 排盤 cache key ──────────────────────────────────────────

export type BirthCacheInput = {
  year: number
  month: number
  day: number
  hour: number
  minute?: number
  /** 緯度（小數）*/
  lat?: number | null
  /** 經度（小數）*/
  lng?: number | null
  /** 時區偏移（小時，例如 +8 = 8）*/
  timezone?: number | null
  /** solar / lunar */
  calendarType?: 'solar' | 'lunar' | string
  /** 農曆閏月 */
  lunarLeap?: boolean
  /** 可選：方案代碼（不同方案排盤欄位可能不同）*/
  planCode?: string
  /** 可選：額外修飾 */
  namespace?: string
}

/**
 * 生成排盤快取 key。
 * 格式：YYYYMMDDHHMM_lat_lng_tz_calendarType（+可選尾碼）
 * - lat/lng 保留 2 位小數（避免浮點造成 key miss）
 * - lat/lng 缺失時用 'NA' 佔位（避免 key 裡出現空段）
 */
export function hashKey(input: BirthCacheInput): string {
  const pad = (n: number, len: number = 2) => String(Math.max(0, Math.floor(n))).padStart(len, '0')

  const yyyy = pad(input.year, 4)
  const mm = pad(input.month)
  const dd = pad(input.day)
  const hh = pad(Math.max(0, Math.min(23, input.hour || 0)))
  const mi = pad(Math.max(0, Math.min(59, input.minute || 0)))

  const lat =
    typeof input.lat === 'number' && Number.isFinite(input.lat)
      ? input.lat.toFixed(2)
      : 'NA'
  const lng =
    typeof input.lng === 'number' && Number.isFinite(input.lng)
      ? input.lng.toFixed(2)
      : 'NA'

  const tz =
    typeof input.timezone === 'number' && Number.isFinite(input.timezone)
      ? input.timezone.toFixed(1)
      : 'NA'

  const cal = input.calendarType || 'solar'
  const leap = input.lunarLeap ? 'L' : ''

  const base = `${yyyy}${mm}${dd}${hh}${mi}_${lat}_${lng}_${tz}_${cal}${leap}`

  const parts: string[] = []
  if (input.namespace) parts.push(input.namespace)
  parts.push('paipan')
  if (input.planCode) parts.push(input.planCode)
  parts.push(base)

  // Upstash key 建議 < 512 位元組；加上 prefix 後遠遠夠用
  return parts.join(':')
}

/**
 * 便捷 wrapper：取不到就跑 loader，回寫快取。
 * - env 未設 → 直接跑 loader，不快取
 */
export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await getCache<T>(key)
  if (cached !== null && cached !== undefined) return cached
  const fresh = await loader()
  // 非同步寫，不阻塞主流程
  setCache(key, fresh, ttlSeconds).catch(() => {})
  return fresh
}
