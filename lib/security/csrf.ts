// v5.10.336 (Sprint 6 IA L2 attack vector #3 修):CSRF protection
// IA L2 抓到:`/api/referral/register`、`/api/points/transfer` 用 cookie auth、無 CSRF token、僅靠 rate limit 5/min
//
// 實作:Origin/Referer header validation(雙保險)
// - Origin header:由瀏覽器設、跨來源 fetch / form submit 必含、可信
// - Referer header:fallback、舊瀏覽器
// - 兩者都缺 = 拒絕(可能是 server-to-server 或舊 client、視 strict 程度決定)
//
// 不用 token-based CSRF 的原因:
// - SameSite=Lax cookie 已預設(Supabase auth 帶 sb-* cookie 時)
// - Origin check 對現代瀏覽器(>97% 涵蓋)足夠
// - 避免每 form 加 hidden token 維護成本
//
// 業界主流:OWASP CSRF cheat sheet "Verifying Origin With Standard Headers"

import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = [
  'https://jianyuan.life',
  'https://www.jianyuan.life',
  'http://localhost:3000', // dev
  'http://localhost:3001',
  'http://127.0.0.1:3000',
]

// Vercel preview deploys 動態加(*.vercel.app)
function isVercelPreview(origin: string): boolean {
  return /^https:\/\/[a-z0-9-]+-jianyuan(-life)?\.vercel\.app$/.test(origin)
}

export interface CsrfCheckResult {
  valid: boolean
  reason?: string
  origin?: string | null
  referer?: string | null
}

/**
 * 驗證 request 是不是 CSRF 攻擊
 *
 * @param req NextRequest 或 Web Request
 * @param strict 嚴格模式(true = 兩 header 都需有效;false = 至少一個有效就 pass)
 * @returns valid: boolean, reason: string(失敗時)
 */
export function checkCsrf(
  req: NextRequest | Request,
  strict = false,
): CsrfCheckResult {
  const headers =
    'headers' in req && typeof (req as NextRequest).headers.get === 'function'
      ? (req as NextRequest).headers
      : (req as Request).headers

  const origin = headers.get('origin')
  const referer = headers.get('referer')

  // 兩 header 全缺 → 高度可疑(server-to-server 不該打到這)
  if (!origin && !referer) {
    return {
      valid: false,
      reason: 'no-origin-no-referer',
      origin,
      referer,
    }
  }

  // Origin 檢查
  let originValid = false
  if (origin) {
    originValid = ALLOWED_ORIGINS.includes(origin) || isVercelPreview(origin)
  }

  // Referer 檢查(只比對 origin 部分)
  let refererValid = false
  if (referer) {
    try {
      const refUrl = new URL(referer)
      const refOrigin = refUrl.origin
      refererValid = ALLOWED_ORIGINS.includes(refOrigin) || isVercelPreview(refOrigin)
    } catch {
      refererValid = false
    }
  }

  if (strict) {
    // 嚴格:必有 origin 且 valid;referer 同時 valid
    if (!origin || !originValid) {
      return { valid: false, reason: 'origin-missing-or-invalid', origin, referer }
    }
    if (referer && !refererValid) {
      return { valid: false, reason: 'referer-invalid', origin, referer }
    }
    return { valid: true, origin, referer }
  }

  // 非嚴格:任一 valid 就 pass
  if (originValid || refererValid) {
    return { valid: true, origin, referer }
  }

  return {
    valid: false,
    reason: origin ? 'origin-invalid' : 'referer-invalid',
    origin,
    referer,
  }
}

/**
 * 直接回 NextResponse 403(若 CSRF check 失敗、給 API route 用)
 */
export function csrfFailResponse(result: CsrfCheckResult): Response {
  return new Response(
    JSON.stringify({
      error: 'CSRF check failed',
      reason: result.reason,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Block': result.reason || '1',
        'Cache-Control': 'no-store',
      },
    },
  )
}
