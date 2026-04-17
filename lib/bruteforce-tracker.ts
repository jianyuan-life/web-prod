// 防推薦碼爆破：記錄連續失敗次數，達閾值封鎖 1 小時
// 注意：in-memory 僅對單實例有效；Vercel serverless 冷啟動會清除，
// 這是「最低成本防禦」，若要跨 region 穩固應升級 Upstash Redis。

type FailEntry = { fails: number; blockUntil: number; firstAt: number }

const failMap = new Map<string, FailEntry>()
const THRESHOLD = 5
const BLOCK_MS = 60 * 60 * 1000 // 1 小時
const WINDOW_MS = 10 * 60 * 1000 // 10 分鐘內累計

export function isBlocked(ip: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = failMap.get(ip)
  if (!entry) return { blocked: false, retryAfter: 0 }
  if (entry.blockUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockUntil - now) / 1000) }
  }
  return { blocked: false, retryAfter: 0 }
}

/** 某個 IP 驗證失敗 +1；達閾值就封鎖 */
export function recordFailure(ip: string): void {
  const now = Date.now()
  const existing = failMap.get(ip)

  // 超過統計窗口就歸零
  if (existing && now - existing.firstAt > WINDOW_MS) {
    failMap.set(ip, { fails: 1, firstAt: now, blockUntil: 0 })
    return
  }

  const next: FailEntry = existing
    ? { ...existing, fails: existing.fails + 1 }
    : { fails: 1, firstAt: now, blockUntil: 0 }

  if (next.fails >= THRESHOLD) {
    next.blockUntil = now + BLOCK_MS
    next.fails = 0 // reset 以免重複延長封鎖
  }
  failMap.set(ip, next)
}

/** 驗證成功：清零 */
export function recordSuccess(ip: string): void {
  failMap.delete(ip)
}

/** 取得客戶端 IP（對應 middleware 的取法）*/
export function getClientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
