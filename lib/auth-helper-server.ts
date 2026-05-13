// v5.10.205 Sprint 1 step C — Server Component 版 auth helper
//
// 對應:lesson #117(Next 16 process.env Feature Flag build-time inline 不可靠 + Vercel runtime env safe)
// Codex Top 2 推薦 + Gemini 共識:Feature Flag 改 cookie/user role
//
// 用途:
//   - app/report/[type]/[id]/page.tsx server component(force-dynamic)拿 logged-in user email
//   - 對齊既有 lib/auth-helper.ts(NextRequest 版、API route 用)、本檔是 ServerComponent 版(cookies() 用)
//   - Sprint 2 加 RLS user role 時可擴展為 user_metadata.is_beta_tester
//
// 注意:
//   - 必在 server component 內 call(client component 用會報錯)
//   - 強制 dynamic rendering(因為 cookies() 觸發 dynamic)
//   - Supabase admin.getUser 失敗時回 null(對齊既有 auth-helper.ts 設計)

import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

/**
 * 從 Server Component 的 cookies() 拿 Supabase access token
 */
async function extractTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    // Supabase JS v2 cookie name pattern:`sb-<project-ref>-auth-token` 或 v1 chunked
    for (const c of cookieStore.getAll()) {
      if (!c.name.startsWith('sb-') || !c.name.includes('auth-token')) continue
      try {
        const tokenData = JSON.parse(decodeURIComponent(c.value))
        const token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
        if (typeof token === 'string' && token.length >= 20) return token
      } catch {
        // continue trying next cookie
      }
    }
  } catch {
    // cookies() throws in static rendering、fall through
  }
  return null
}

/**
 * Server Component 拿 logged-in user email(只信 Supabase admin.getUser 驗簽)
 *
 * Returns: email lowercased、無 token / 無效 / Supabase 拒絕 → null
 */
export async function getServerComponentUserEmail(): Promise<string | null> {
  const token = await extractTokenFromCookies()
  if (!token) return null

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user?.email) return null
    return data.user.email.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Beta tester whitelist check
 *
 * env var: BETA_TESTER_EMAILS=jamie@example.com,beta1@example.com
 * - 沒設 env / email 不在 whitelist → false(default deny)
 * - email 在 whitelist → true
 *
 * 對應 lesson #117:server-side runtime env(非 NEXT_PUBLIC_)在 Vercel reliable
 */
export async function isBetaTester(): Promise<boolean> {
  const whitelist = (process.env.BETA_TESTER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (whitelist.length === 0) return false // 沒設 env = 全擋(production safe default)

  const email = await getServerComponentUserEmail()
  if (!email) return false

  return whitelist.includes(email)
}
