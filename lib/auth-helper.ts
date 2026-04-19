// ============================================================
// 統一的 Supabase 認證輔助模組（v5.3.37+ 簡化版）
// 用途：解決 supabase.auth.getUser 失敗時客戶看不到自己付費資料的問題
//
// 設計決策（v5.3.37）：
//   新版 Supabase 2025 拿掉了 Dashboard 的 JWT Secret 暴露，無法用 HS256 驗簽 fallback。
//   直接簡化為「只信 Supabase admin.getUser 的驗簽結果」：
//   - admin.getUser 成功 → 認證通過
//   - admin.getUser 失敗 → 回傳 null（客戶被迫重登）
//   安全性提升：完全沒有 fallback 路徑 = 零攻擊面
//   代價：Supabase auth service 短暫掛掉時使用者需重登（Supabase uptime 99.9%+，風險可接受）
//
// 歷史：v5.3.34 的 HS256 fallback 在 Supabase 新版無 JWT Secret 後無法運作，移除
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
 * 取得認證用戶（email + user_id）— 只信 Supabase admin.getUser 驗簽
 *
 * 回傳 null 代表：無 token / token 無效 / Supabase 認證服務暫時掛掉
 * source 欄位用於 log 與診斷：
 *   - 'no-token': 沒帶 token
 *   - 'admin-verified': 驗證成功
 *   - 'admin-rejected': Supabase 拒絕此 token（失效或偽造）
 */
export async function getAuthUser(
  req: NextRequest,
): Promise<{ email: string | null; userId: string | null; source: string }> {
  const token = extractToken(req)
  if (!token) return { email: null, userId: null, source: 'no-token' }

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

  return { email: null, userId: null, source: 'admin-rejected' }
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
 * 嚴格模式 — 與 getAuthUser 相同（已無 fallback，兩者等價）
 * 保留 API 相容性，給之前 import getAuthUserStrict 的 code 用
 */
export async function getAuthUserStrict(
  req: NextRequest,
): Promise<{ email: string | null; userId: string | null }> {
  const { email, userId, source } = await getAuthUser(req)
  if (source !== 'admin-verified') {
    return { email: null, userId: null }
  }
  return { email, userId }
}
