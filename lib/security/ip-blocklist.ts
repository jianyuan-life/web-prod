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
 * v5.10.333 (Codex P1 #1 修):
 * 原問題:只看 UA 字串、attacker 可塞 'vercel-cron/1.0' UA 繞所有防線
 * 修補:UA 字串 + Vercel cron secret header 雙因子驗證
 * Vercel cron 自動帶 x-vercel-cron-secret(只有 Vercel 邊緣 platform 知道)
 *
 * @deprecated 改用 isTrustedInternalRequest(req) 驗 secret + UA
 */
export function isTrustedInternalUa(ua: string | null | undefined): boolean {
  if (!ua) return false
  const trusted = ['vercel-cron/1.0', 'vercel-internal']
  return trusted.some((t) => ua.toLowerCase().includes(t))
}

/**
 * v5.10.333:用 request 同時驗 cron secret + UA 雙因子(防 UA 偽造)
 * Vercel cron 自動帶 Authorization: Bearer <CRON_SECRET>(env CRON_SECRET 設後生效)
 */
export function isTrustedInternalRequest(req: {
  headers: { get(name: string): string | null }
}): boolean {
  const ua = req.headers.get('user-agent')
  // 必先 UA 命中、再驗 secret(雙因子)
  if (!isTrustedInternalUa(ua)) return false

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false // 沒設 env、保守拒絕

  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth || auth.length !== cronSecret.length) return false

  // timing-safe 比對(防 timing attack)
  let mismatch = 0
  for (let i = 0; i < auth.length; i++) {
    mismatch |= auth.charCodeAt(i) ^ cronSecret.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * v5.10.341(Codex round 2 P0 #1 修):統一檢查、雙因子驗證 cron secret
 * 原問題:isTrustedInternalUa() 只看 UA、attacker 塞 'vercel-cron/1.0' 可繞 STAGE 5 rate limit
 * 修補:用 isTrustedInternalRequest(req) 雙因子(UA + CRON_SECRET timing-safe)
 *
 * @param ip client IP(已過 trust matrix)
 * @param req full request(用於讀 Authorization header for CRON_SECRET 驗證)
 */
export function classifyTraffic(
  ip: string,
  req: { headers: { get(name: string): string | null } },
): 'block' | 'allow' | 'normal' {
  if (isBlockedIp(ip)) return 'block'
  if (isAllowedIp(ip) || isTrustedInternalRequest(req)) return 'allow'
  return 'normal'
}

/**
 * @deprecated v5.10.341 用 classifyTraffic(ip, req) 取代
 * 原 UA-only 簽名暫保留向後相容、但內部只走 ip 黑名單檢查
 */
export function classifyTrafficLegacy(
  ip: string,
  ua: string | null | undefined,
): 'block' | 'allow' | 'normal' {
  if (isBlockedIp(ip)) return 'block'
  // 不再信 UA-only allow(已是漏洞)、保守回 normal
  if (isAllowedIp(ip)) return 'allow'
  return 'normal'
}
