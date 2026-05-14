// v5.10.326 (P0 #3 Anti-DDoS — 手動 IP 黑名單 / 白名單)
// 用於:
//   - 已知惡意 IP / IP range(repeat offender)直接 403
//   - 已知第三方服務 IP(Stripe webhook / Sentry / cron job)放行 rate limit
//
// 黑名單目前 hardcode 在這個檔案、未來可改 DB-backed(supabase ip_blocklist table)
// 白名單用於 webhook 等可信任源、繞過全站 hard-cap

/**
 * 已知惡意 IP / range(支援 IPv4 + 簡單 prefix 比對)
 *
 * 加入規則:
 *   1. server logs 看到單 IP 在 1 小時內 > 1000 次 4xx/5xx → 加
 *   2. 每月 review、過 90 天無新 hit 的可移除
 *   3. 整個 /24 都壞 → 加 prefix(如 "203.0.113.")
 */
const BLOCKED_IPS = new Set<string>([
  // 範例(需要時加):
  // '203.0.113.42',  // 2026-05 attempted SQL injection 200+ requests
  // '198.51.100.',   // /24 known scanning network
])

/**
 * 已知可信第三方服務(繞過 rate limit、不繞 bot classifier)
 *
 * Stripe webhook IP ranges:
 *   - https://stripe.com/docs/ips#webhook-notifications
 *   (Stripe 自家用 signature verification、IP-based 是 defense in depth)
 *
 * Vercel cron job:
 *   - Vercel internal traffic、UA 含 'vercel-cron/1.0'(用 UA 比對更可靠)
 */
const ALLOWED_IPS = new Set<string>([
  // Stripe webhook(2026 latest 公開 IP 清單、需定期更新)
  '3.18.12.63',
  '3.130.192.231',
  '13.235.14.237',
  '13.235.122.149',
  '18.211.135.69',
  '35.154.171.200',
  '52.15.183.38',
  '54.88.130.119',
  '54.88.130.237',
  '54.187.174.169',
  '54.187.205.235',
  '54.187.216.72',
])

/**
 * 檢查 IP 是否在黑名單(直接 403)
 * 支援 prefix 比對("203.0.113." 比對任何 203.0.113.x)
 */
export function isBlockedIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false
  if (BLOCKED_IPS.has(ip)) return true
  // Prefix 比對(/24 等)
  for (const prefix of BLOCKED_IPS) {
    if (prefix.endsWith('.') && ip.startsWith(prefix)) return true
  }
  return false
}

/**
 * 檢查 IP 是否在白名單(繞過 rate limit)
 */
export function isAllowedIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false
  return ALLOWED_IPS.has(ip)
}

/**
 * 檢查 UA 是否屬可信內部服務(Vercel cron 等)
 */
export function isTrustedInternalUa(ua: string | null | undefined): boolean {
  if (!ua) return false
  const trusted = ['vercel-cron/1.0', 'vercel-internal']
  return trusted.some((t) => ua.toLowerCase().includes(t))
}

/**
 * 統一檢查:回 'block' / 'allow' / 'normal'
 * middleware 用、依此決定是否提早 return
 */
export function classifyTraffic(
  ip: string,
  ua: string | null | undefined,
): 'block' | 'allow' | 'normal' {
  if (isBlockedIp(ip)) return 'block'
  if (isAllowedIp(ip) || isTrustedInternalUa(ua)) return 'allow'
  return 'normal'
}
