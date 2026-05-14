// v5.10.338 (Sprint 6 IA L2 IDOR mitigation step 2):per-token rate limit + share abuse detection
//
// 場景:
//   1. token 被 share 給多人(社群 / 論壇)→ 短時間多 IP 同 token 大量 read
//   2. token 被 leak / sold → 攻擊者大量 download
//   3. 客戶自己頻繁刷新(SPA 或 retry)→ 不應太低門檻
//
// 設計:
//   - per-token + per-minute count(soft limit)
//   - per-token unique-IP count(detect sharing)
//   - 超 hard limit → 返 429 + 冷卻
//   - 達 sharing threshold → log alert(後續可發 email 給客戶)
//
// 限制:in-memory、Vercel multi-region 不一致(同一 token 在 6 region 各跑一份)
//   未來改 Upstash Redis / Edge Config 跨區同步

interface TokenStats {
  count: number
  uniqueIps: Set<string>
  firstSeen: number
  resetAt: number
  sharingAlerted: boolean
}

const tokenStats = new Map<string, TokenStats>()

const WINDOW_MS = 60_000 // 1 分鐘窗
const MAX_PER_MIN = 60 // 同一 token 60 reads/min(高門檻、容忍 SPA 刷新)
const SHARING_IP_THRESHOLD = 8 // 同 token 短時間 8+ unique IP = 高機率被 share

export interface TokenRateLimitResult {
  allowed: boolean
  count: number
  uniqueIps: number
  isSharing: boolean
  retryAfter?: number
}

/**
 * 檢查 token 速率 + share abuse
 *
 * @param token URL access_token
 * @param ip client IP(從 getClientIp() 來、已過 trust filter)
 */
export function checkTokenRateLimit(token: string, ip: string): TokenRateLimitResult {
  const now = Date.now()
  const stats = tokenStats.get(token)

  // 第一次 / 過期 → 重建
  if (!stats || now > stats.resetAt) {
    tokenStats.set(token, {
      count: 1,
      uniqueIps: new Set([ip]),
      firstSeen: now,
      resetAt: now + WINDOW_MS,
      sharingAlerted: false,
    })
    return {
      allowed: true,
      count: 1,
      uniqueIps: 1,
      isSharing: false,
    }
  }

  // 累加
  stats.count++
  stats.uniqueIps.add(ip)

  // Hard limit:同 token 60+ reads/min → 429
  if (stats.count > MAX_PER_MIN) {
    return {
      allowed: false,
      count: stats.count,
      uniqueIps: stats.uniqueIps.size,
      isSharing: stats.uniqueIps.size >= SHARING_IP_THRESHOLD,
      retryAfter: Math.ceil((stats.resetAt - now) / 1000),
    }
  }

  // Sharing detection(8+ unique IP / min 用同一 token)
  const isSharing = stats.uniqueIps.size >= SHARING_IP_THRESHOLD
  if (isSharing && !stats.sharingAlerted) {
    stats.sharingAlerted = true
    console.warn('[TOKEN-SHARING-DETECTED]', JSON.stringify({
      ts: new Date().toISOString(),
      tokenPrefix: token.slice(0, 8) + '...', // log 不洩漏完整 token
      uniqueIps: stats.uniqueIps.size,
      countPerMin: stats.count,
      // 未來可:從 paid_reports 反查客戶 + 發 email 告知 token 可能被 leak
    }))
  }

  return {
    allowed: true,
    count: stats.count,
    uniqueIps: stats.uniqueIps.size,
    isSharing,
  }
}

/**
 * 定期清理過期 entry(避免長時間運行 memory leak)
 * 呼叫端應在 ~1% 機率下跑一次
 */
export function cleanupTokenStats() {
  const now = Date.now()
  for (const [k, v] of tokenStats.entries()) {
    if (now > v.resetAt) tokenStats.delete(k)
  }
}

export function getTokenStatsSize(): number {
  return tokenStats.size
}
