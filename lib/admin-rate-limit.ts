// 後台 API 專屬 Rate Limit（L7 P0 修復 2026-04-17）
// 目的：
// 1. /api/admin/* 每 IP 每分鐘 10 次上限（比一般 API 的 30 次更嚴格）
// 2. 防止 ADMIN_KEY 被暴力破解
// 3. 超過回 429，附 Retry-After
//
// 注意：用 in-memory Map 單實例內追蹤。Vercel 多區域部署時每區各自追蹤，
// 未來可升級 Upstash Redis 做跨區共享。

import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'

const ADMIN_LIMIT_PER_MIN = 10
const WINDOW_MS = 60_000
const adminRateMap = new Map<string, { count: number; resetTime: number }>()

// 失敗次數追蹤（連續 5 次錯誤後，同一 IP 鎖 30 分鐘）
const FAILED_ATTEMPTS_LIMIT = 5
const LOCKOUT_MS = 30 * 60_000
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

// v5.10.326:消「getClientIp 在 admin-rate-limit + middleware + 各 API route」3 處重複
// 改 import 共用 lib/security/get-client-ip(SSOT、防 drift)

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
 *
 * v5.3.34 安全修復（嚴重 bug）：
 *   原邏輯 `if (!entry || entry.lockedUntil < now)` 在 entry 存在且 lockedUntil=0（從未鎖過）
 *   時條件永遠為 true（因為 0 < now），導致 count 每次都被重置為 1 → 永遠達不到 5 次閾值
 *   → ADMIN_KEY 可被無限次暴力破解！
 *
 * 修正邏輯：
 *   - 沒紀錄 → 新建 count=1
 *   - 鎖定期已過（lockedUntil > 0 且 < now）→ 重置為 count=1（舊鎖已消）
 *   - 其他情況（count 累計中、或剛建立還沒鎖）→ 累加 count
 */
export function recordAdminAuthFail(req: NextRequest): void {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = failedAttempts.get(ip)

  // 已在鎖定中：不再累加（避免惡意請求延長封鎖）
  if (entry && entry.lockedUntil > now) return

  // 第一次失敗 or 鎖定期已過 → 重建
  if (!entry || (entry.lockedUntil > 0 && entry.lockedUntil < now)) {
    failedAttempts.set(ip, { count: 1, lockedUntil: 0 })
    return
  }

  // 累加 count；達閾值則鎖 30 分鐘
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

/**
 * v5.4.16 P1(Codex 真審):檢查 IP 是否還在 lockout 內
 * 用於 checkAdminAuth 失敗前先擋:鎖定中的 IP 直接拒絕、不浪費判斷
 * 回:NextResponse(已鎖)或 null(未鎖)
 */
export function checkAdminAuthLockout(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req)
  const entry = failedAttempts.get(ip)
  if (!entry) return null
  const now = Date.now()
  if (entry.lockedUntil > now) {
    const retryAfterSec = Math.ceil((entry.lockedUntil - now) / 1000)
    return NextResponse.json(
      { error: `IP 因連續 ${FAILED_ATTEMPTS_LIMIT} 次認證失敗已被鎖定、請 ${Math.ceil(retryAfterSec / 60)} 分鐘後再試` },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      },
    )
  }
  return null
}
