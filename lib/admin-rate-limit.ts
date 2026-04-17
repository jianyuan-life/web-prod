// 後台 API 專屬 Rate Limit（L7 P0 修復 2026-04-17）
// 目的：
// 1. /api/admin/* 每 IP 每分鐘 10 次上限（比一般 API 的 30 次更嚴格）
// 2. 防止 ADMIN_KEY 被暴力破解
// 3. 超過回 429，附 Retry-After
//
// 注意：用 in-memory Map 單實例內追蹤。Vercel 多區域部署時每區各自追蹤，
// 未來可升級 Upstash Redis 做跨區共享。

import { NextRequest, NextResponse } from 'next/server'

const ADMIN_LIMIT_PER_MIN = 10
const WINDOW_MS = 60_000
const adminRateMap = new Map<string, { count: number; resetTime: number }>()

// 失敗次數追蹤（連續 5 次錯誤後，同一 IP 鎖 30 分鐘）
const FAILED_ATTEMPTS_LIMIT = 5
const LOCKOUT_MS = 30 * 60_000
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * 檢查 admin API 的速率限制。超過回 429 NextResponse，通過回 null。
 * 呼叫方式：
 *   const rlFail = checkAdminRateLimit(req);
 *   if (rlFail) return rlFail;
 */
export function checkAdminRateLimit(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req)
  const now = Date.now()

  // 先檢查是否已鎖定
  const lockEntry = failedAttempts.get(ip)
  if (lockEntry && lockEntry.lockedUntil > now) {
    const retryAfter = Math.ceil((lockEntry.lockedUntil - now) / 1000)
    return NextResponse.json(
      { error: '登入失敗次數過多，請 30 分鐘後再試' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-Admin-Locked': '1',
        },
      },
    )
  }

  // 速率檢查
  const key = `admin:${ip}`
  const entry = adminRateMap.get(key)

  if (entry && now < entry.resetTime) {
    if (entry.count >= ADMIN_LIMIT_PER_MIN) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
      return NextResponse.json(
        { error: '後台請求過於頻繁，請稍後再試' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(ADMIN_LIMIT_PER_MIN),
            'X-RateLimit-Remaining': '0',
          },
        },
      )
    }
    entry.count++
  } else {
    adminRateMap.set(key, { count: 1, resetTime: now + WINDOW_MS })
  }

  // 定期清理過期條目（約 1% 機率）
  if (Math.random() < 0.01) {
    for (const [k, v] of adminRateMap.entries()) {
      if (now > v.resetTime) adminRateMap.delete(k)
    }
    for (const [k, v] of failedAttempts.entries()) {
      if (now > v.lockedUntil) failedAttempts.delete(k)
    }
  }

  return null
}

/**
 * 記錄一次認證失敗（達 5 次後鎖 30 分鐘）
 */
export function recordAdminAuthFail(req: NextRequest): void {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = failedAttempts.get(ip)
  if (entry && entry.lockedUntil > now) return // 已鎖定不再累加

  if (!entry || entry.lockedUntil < now) {
    failedAttempts.set(ip, { count: 1, lockedUntil: 0 })
    return
  }
  entry.count++
  if (entry.count >= FAILED_ATTEMPTS_LIMIT) {
    entry.lockedUntil = now + LOCKOUT_MS
  }
}

/**
 * 認證成功時清空該 IP 的失敗紀錄
 */
export function clearAdminAuthFail(req: NextRequest): void {
  const ip = getClientIp(req)
  failedAttempts.delete(ip)
}
