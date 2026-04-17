import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSafeRedirect } from '@/lib/safe-redirect'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 取得正確的 site URL（Vercel 環境變數優先）
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  // OAuth 完成後導向原始頁面或儀表板（Open Redirect 防護）
  const safeRedirect = getSafeRedirect(requestUrl.searchParams.get('redirect'), '/dashboard')
  return NextResponse.redirect(`${siteUrl}${safeRedirect}`)
}
