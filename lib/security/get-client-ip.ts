// v5.10.324 (P0 #2 rate-limit DRY)
// 統一 client IP 解析 — middleware / admin-rate-limit / API route 共用
// 修「同個函式在三處複製」的 drift 風險(QA agent #2 finding)

import type { NextRequest } from 'next/server'

/**
 * 從多種 proxy header 取得真實 client IP(優先順序:reliability)
 *
 * 順序依據:
 * 1. x-real-ip — Vercel Edge / Nginx 設定的真實 IP(最可靠)
 * 2. cf-connecting-ip — Cloudflare Proxy 給的真實 IP
 * 3. x-forwarded-for — 通用 proxy header(取第一個 = 最原始 client、可被偽造)
 * 4. 'unknown' — 完全沒 header 時 fallback
 *
 * 注意:x-forwarded-for 可被偽造、僅作 fallback 使用、不用於計費 / 強驗證場景
 */
export function getClientIp(request: NextRequest | Request): string {
  const headers =
    'headers' in request && typeof (request as NextRequest).headers.get === 'function'
      ? (request as NextRequest).headers
      : (request as Request).headers

  const xRealIp = headers.get('x-real-ip')
  if (xRealIp && xRealIp.trim()) return xRealIp.trim()

  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp && cfIp.trim()) return cfIp.trim()

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }

  return 'unknown'
}

/**
 * v5.10.324 加:取得 IP + 國家(CF/Vercel header)、用於 IP-based geo 攻擊偵測
 */
export function getClientContext(request: NextRequest | Request): {
  ip: string
  country: string
  userAgent: string
} {
  const headers =
    'headers' in request && typeof (request as NextRequest).headers.get === 'function'
      ? (request as NextRequest).headers
      : (request as Request).headers

  return {
    ip: getClientIp(request),
    country: headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || 'unknown',
    userAgent: headers.get('user-agent') || '',
  }
}
