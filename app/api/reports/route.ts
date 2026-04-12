import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 從 Authorization header 或 cookie 驗證 Supabase Auth 登入狀態
async function getAuthEmail(req: NextRequest): Promise<string | null> {
  try {
    let token: string | null = null
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }
    if (!token) {
      const cookies = req.headers.get('cookie') || ''
      const match = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
      if (match) {
        const tokenData = JSON.parse(decodeURIComponent(match[1]))
        token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
      }
    }
    if (!token || typeof token !== 'string' || token.length < 20) return null
    const supabase = getServiceSupabase()
    const { data } = await supabase.auth.getUser(token)
    return data?.user?.email || null
  } catch {
    return null
  }
}

// GET — 取得用戶的報告
// 驗證方式（按優先順序）：
// 1. Supabase auth token（header 或 cookie）→ 最安全
// 2. Stripe checkout session ID → Stripe 重導回來後 auth 丟失時使用
export async function GET(req: NextRequest) {
  const authEmail = await getAuthEmail(req)

  let queryEmail = authEmail
  if (!queryEmail) {
    // Fallback: 用 Stripe checkout session ID 驗證（安全，因為 session ID 只有付款者知道）
    const sessionId = req.nextUrl.searchParams.get('session_id')
    if (sessionId && (sessionId.startsWith('cs_') || sessionId.startsWith('free_'))) {
      const supabase = getServiceSupabase()
      // 透過 paid_reports 中的 stripe_session_id 反查 customer_email
      const { data: report } = await supabase
        .from('paid_reports')
        .select('customer_email')
        .eq('stripe_session_id', sessionId)
        .limit(1)
        .maybeSingle()
      if (report?.customer_email) {
        queryEmail = report.customer_email.toLowerCase()
        console.info(`✅ Stripe session fallback: ${sessionId} → ${queryEmail}`)
      }
    }
  }

  if (!queryEmail) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('paid_reports')
    .select('id, plan_code, status, created_at, access_token, customer_email, report_result, pdf_url, retry_count, error_message, client_name, amount_usd, generation_progress')
    .ilike('customer_email', queryEmail)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reports: data || [] })
}

// PATCH — 重試失敗的報告（需登入驗證）
export async function PATCH(req: NextRequest) {
  const authEmail = await getAuthEmail(req)
  if (!authEmail) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '缺少參數' }, { status: 400 })
  const email = authEmail

  const supabase = getServiceSupabase()

  const { data: report, error: fetchErr } = await supabase
    .from('paid_reports')
    .select('*')
    .eq('id', id)
    .ilike('customer_email', email.toLowerCase())
    .single()

  if (fetchErr || !report) {
    return NextResponse.json({ error: '找不到報告' }, { status: 404 })
  }

  if (report.status !== 'failed') {
    return NextResponse.json({ error: '只能重試失敗的報告' }, { status: 400 })
  }

  if ((report.retry_count ?? 0) >= 3) {
    return NextResponse.json({ error: '已達最大重試次數（3次），請聯繫客服' }, { status: 429 })
  }

  await supabase.from('paid_reports').update({
    status: 'pending',
    error_message: null,
    retry_count: (report.retry_count ?? 0) + 1,
  }).eq('id', id)

  // 觸發 Workflow 報告生成（不用舊版 Fly.io 端點）
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  let workflowTriggered = false
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ reportId: report.id }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (wfRes.ok) workflowTriggered = true
    else console.error('重試 Workflow 觸發失敗:', await wfRes.text())
  } catch (err) {
    console.error('重試 Workflow 觸發異常:', err)
  }

  // Workflow 失敗時回退到 generate-report
  if (!workflowTriggered) {
    try {
      const fbController = new AbortController()
      const fbTimeout = setTimeout(() => fbController.abort(), 8000)
      const fbRes = await fetch(`${siteUrl}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({ reportId: report.id }),
        signal: fbController.signal,
      })
      clearTimeout(fbTimeout)
      if (!fbRes.ok) {
        console.error('重試 Fallback 也失敗:', await fbRes.text())
        await supabase.from('paid_reports').update({
          error_message: '重試觸發：Workflow 和 Fallback 都失敗',
        }).eq('id', id)
      }
    } catch (fbErr) {
      console.error('重試 Fallback 觸發異常:', fbErr)
      await supabase.from('paid_reports').update({
        error_message: `重試觸發全部失敗: ${fbErr}`,
      }).eq('id', id)
    }
  }

  return NextResponse.json({ success: true, message: '報告已重新排入生成佇列' })
}

// DELETE — 刪除報告（需登入驗證）
export async function DELETE(req: NextRequest) {
  const authEmail = await getAuthEmail(req)
  if (!authEmail) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('paid_reports')
    .delete()
    .eq('id', id)
    .ilike('customer_email', authEmail.toLowerCase())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
