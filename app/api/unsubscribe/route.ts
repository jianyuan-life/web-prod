// ============================================================
// Email 退訂 API
// GET /api/unsubscribe?email=xxx&token=xxx
//
// 驗證 token 後在 Supabase email_unsubscribes 表記錄退訂
// 回傳簡單的 HTML 頁面告知退訂成功
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  const token = req.nextUrl.searchParams.get('token')

  // 參數驗證
  if (!email || !token) {
    return new NextResponse(buildHtmlPage('參數錯誤', '缺少必要的 email 或 token 參數。'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 驗證 token
  if (!verifyUnsubscribeToken(email, token)) {
    return new NextResponse(buildHtmlPage('驗證失敗', '退訂連結無效或已過期，請確認連結是否正確。'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 寫入 Supabase email_unsubscribes 表（upsert，重複退訂不報錯）
  const supabase = getSupabase()
  const { error } = await supabase
    .from('email_unsubscribes')
    .upsert(
      { email, unsubscribed_at: new Date().toISOString() },
      { onConflict: 'email' },
    )

  if (error) {
    console.error('❌ 退訂寫入失敗:', error)
    return new NextResponse(buildHtmlPage('系統錯誤', '退訂處理失敗，請稍後再試或聯繫 support@jianyuan.life。'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  console.info(`✅ Email 退訂成功: ${email}`)

  return new NextResponse(buildHtmlPage('已成功退訂', `${email} 已成功退訂鑒源命理的郵件通知。<br/>如需重新訂閱，請聯繫 <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a>。`), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function buildHtmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — 鑒源命理</title>
  <style>
    body { margin: 0; padding: 0; background: #0d1117; font-family: 'PingFang TC', 'Microsoft JhengHei', sans-serif; color: #e5e7eb; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: linear-gradient(135deg, #1a2a4a, #0d1a2e); border: 1px solid #2a3a5a; border-radius: 16px; padding: 48px 32px; max-width: 420px; text-align: center; }
    .brand { color: #c9a84c; font-size: 20px; font-weight: 700; letter-spacing: 4px; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 11px; margin-bottom: 32px; }
    h1 { color: #fff; font-size: 22px; margin: 0 0 16px 0; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.8; }
    a { color: #c9a84c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">鑒 源</div>
    <div class="subtitle">JIANYUAN</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}
