// ============================================================
// 統一的 Supabase 認證輔助模組（v5.3.1+）
// 用途：解決 supabase.auth.getUser 失敗時客戶看不到自己付費資料的問題
//
// 問題背景：
//   - Supabase auth.getUser(token) 偶爾會 timeout 或 network error
//   - 若直接 return null，客戶會看到「請先登入」或空陣列（誤以為資料消失）
//
// 安全性（v5.3.34+ 修復）：
//   - **重要**：舊版 JWT fallback 只做 base64 decode 不驗簽，任何人都能偽造
//     email/sub payload 冒充別人 → 已改為使用 Supabase 專案的 JWT secret
//     驗證 HS256 簽名，驗證失敗直接 reject。
//   - 若未設定 SUPABASE_JWT_SECRET，退回只信任 admin.getUser 的結果，
//     不做任何 fallback（寧可讓使用者重新登入，也不要開 bypass）。
//   - JWT 過期（exp < now）會直接 reject，不會放水
// ============================================================

import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

function base64UrlDecode(input: string): Buffer {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

/**
 * 驗證 Supabase JWT 的 HS256 簽名並取出 payload。
 * 若未設定 SUPABASE_JWT_SECRET（或驗簽失敗）回傳 null，
 * 不進行任何「只 decode 不驗簽」的放水行為。
 */
function verifyJwtPayload(token: string): { email: string | null; sub: string | null } | null {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) return null

    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, signatureB64] = parts

    // 只允許 HS256（Supabase 預設）
    const headerJson = base64UrlDecode(headerB64).toString('utf-8')
    const header = JSON.parse(headerJson) as { alg?: string; typ?: string }
    if (header.alg !== 'HS256') return null

    // HMAC-SHA256 驗簽
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest()
    const actualSig = base64UrlDecode(signatureB64)
    if (expectedSig.length !== actualSig.length) return null
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null

    // 簽章有效 → 解析 payload
    const payloadJson = base64UrlDecode(payloadB64).toString('utf-8')
    const parsed = JSON.parse(payloadJson) as {
      email?: string
      sub?: string
      exp?: number
      user_metadata?: { email?: string }
    }
    if (parsed.exp && parsed.exp * 1000 < Date.now() - 30_000) return null

    const email = parsed.email || parsed.user_metadata?.email || null
    const sub = parsed.sub || null
    return { email, sub }
  } catch {
    return null
  }
}

/**
 * 從 request 取出 supabase access token
 * 優先順序：Authorization header > cookie
 */
function extractToken(req: NextRequest): string | null {
  let token: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }
  if (!token) {
    try {
      const cookies = req.headers.get('cookie') || ''
      const match = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
      if (match) {
        const tokenData = JSON.parse(decodeURIComponent(match[1]))
        token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
      }
    } catch {
      /* 忽略 cookie 解析錯誤 */
    }
  }
  if (!token || typeof token !== 'string' || token.length < 20) return null
  return token
}

/**
 * 取得認證用戶（email + user_id）— 雙層 fallback
 *
 * 第一層：supabase.auth.getUser(token)（最嚴謹，驗 JWT 簽名）
 * 第二層：JWT 直接 decode（第一層失敗時 fallback，仍驗 exp）
 *
 * 回傳 null 代表：無 token / token 格式錯誤 / JWT 過期
 * 回傳值包含 source 欄位用於 log 與診斷
 */
export async function getAuthUser(
  req: NextRequest,
): Promise<{ email: string | null; userId: string | null; source: string }> {
  const token = extractToken(req)
  if (!token) return { email: null, userId: null, source: 'no-token' }

  // 第一層：嚴謹驗證
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase.auth.getUser(token)
    if (data?.user?.id && data.user.email) {
      return {
        email: data.user.email.toLowerCase(),
        userId: data.user.id,
        source: 'admin-verified',
      }
    }
    if (error) {
      console.warn('[auth-helper] admin.getUser error:', error.message)
    }
  } catch (e) {
    console.warn(
      '[auth-helper] admin.getUser exception:',
      e instanceof Error ? e.message : String(e),
    )
  }

  // 第二層 fallback：驗 HS256 簽名後再取 payload（需要 SUPABASE_JWT_SECRET）
  // 不再做「只 decode 不驗簽」的放水行為，否則任何人偽造 JWT payload 即可冒充他人。
  const verified = verifyJwtPayload(token)
  if (verified && verified.email && verified.sub) {
    return {
      email: verified.email.toLowerCase(),
      userId: verified.sub,
      source: 'jwt-verified',
    }
  }

  return { email: null, userId: null, source: 'jwt-verify-failed' }
}

/**
 * 簡化版：只取 user_id（給 points / referral / family-members 等用 user_id 查表的 API）
 */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const { userId } = await getAuthUser(req)
  return userId
}

/**
 * 簡化版：只取 email（給 paid_reports / feedback / checkout 等用 email 查表的 API）
 */
export async function getAuthEmail(req: NextRequest): Promise<string | null> {
  const { email } = await getAuthUser(req)
  return email
}

/**
 * v5.3.34 新增：嚴格模式 — 只接受 Supabase admin.getUser 驗簽成功的結果
 * 給需要高安全性的端點用（例如：以 email 查詢 paid_reports / refund / 敏感寫入）
 *
 * 與 getAuthUser 的差別：
 *   - getAuthUser 會在 Supabase auth 掛掉時 fallback 到 JWT 驗簽（仍安全，但依賴 env SUPABASE_JWT_SECRET）
 *   - getAuthUserStrict 不 fallback：只要 admin.getUser 沒回成功（例如 Supabase 服務短暫掛掉）就算未認證
 *     好處：即使 JWT secret 不小心外洩，攻擊者也無法透過偽造 token 通過此端點
 */
export async function getAuthUserStrict(
  req: NextRequest,
): Promise<{ email: string | null; userId: string | null }> {
  const user = await getAuthUser(req)
  if (user.source !== 'admin-verified') {
    return { email: null, userId: null }
  }
  return { email: user.email, userId: user.userId }
}
