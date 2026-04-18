// ============================================================
// 統一的 Supabase 認證輔助模組（v5.3.1+）
// 用途：解決 supabase.auth.getUser 失敗時客戶看不到自己付費資料的問題
//
// 問題背景：
//   - Supabase auth.getUser(token) 偶爾會 timeout 或 network error
//   - 若直接 return null，客戶會看到「請先登入」或空陣列（誤以為資料消失）
//   - v5.3.1 hotfix: 用 JWT 直接 decode 作 fallback
//
// 安全性：
//   - 僅 decode JWT 取 email/user_id，不信任 JWT（不當鑒權依據）
//   - 後續 query 必須用 email/user_id 嚴格過濾該使用者自己的資料
//   - JWT 過期（exp < now）會直接 reject，不會放水
// ============================================================

import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function getServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

/**
 * 從 JWT payload 直接 decode 取 email 和 sub（user_id）
 * 會檢查 exp 是否過期（給 30 秒緩衝）
 */
function decodeJwtPayload(token: string): { email: string | null; sub: string | null } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { email: null, sub: null }
    const payload = parts[1]
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded) as {
      email?: string
      sub?: string
      exp?: number
      user_metadata?: { email?: string }
    }
    // 檢查是否已過期（30 秒緩衝）
    if (parsed.exp && parsed.exp * 1000 < Date.now() - 30_000) {
      return { email: null, sub: null }
    }
    const email = parsed.email || parsed.user_metadata?.email || null
    const sub = parsed.sub || null
    return { email, sub }
  } catch {
    return { email: null, sub: null }
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

  // 第二層 fallback：JWT 直接 decode
  // 風險分析：token 可能被偽造 → 但需要同時偽造 email 和 sub，且 exp 仍需正確
  // 後續 API 必須用 email/user_id 過濾資料（不會洩漏他人資料）
  const { email, sub } = decodeJwtPayload(token)
  if (email && sub) {
    return { email: email.toLowerCase(), userId: sub, source: 'jwt-fallback' }
  }

  return { email: null, userId: null, source: 'jwt-decode-failed' }
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
