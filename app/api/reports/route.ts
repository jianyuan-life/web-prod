import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser as getAuthUserHelper } from '@/lib/auth-helper'

// Service role client
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// v5.3.34：改用統一的 auth-helper（會驗 JWT 簽名，不再是「只 decode 不驗簽」的放水版本）
async function getAuthEmail(req: NextRequest): Promise<{ email: string | null; source: string }> {
  const { email, source } = await getAuthUserHelper(req)
  return { email, source }
}

// GET — 取得用戶的報告
// 驗證方式（按優先順序）：
// 1. Supabase auth admin.getUser（最嚴謹）
// 2. JWT 直接 decode（admin 失敗時 fallback，仍驗 exp）
// 3. Stripe checkout session ID → Stripe 重導回來後 auth 丟失時使用
export async function GET(req: NextRequest) {
  const { email: authEmail, source: authSource } = await getAuthEmail(req)

  let queryEmail = authEmail
  let querySource = authSource
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
        querySource = 'stripe-session'
        console.info(`✅ Stripe session fallback: ${sessionId} → ${queryEmail}`)
      }
    }
  }

  if (!queryEmail) {
    return NextResponse.json({ error: '請先登入', authSource: querySource }, { status: 401 })
  }

  console.info(`[reports] querying email=${queryEmail} source=${querySource}`)

  const supabase = getServiceSupabase()

  // v5.10.193 P0 個資洩漏修(Codex L3 + Claude 機械驗證 audit、2026-05-12)
  //   stripe-session fallback 走最小欄位 + 縮窄到單筆(僅該 session 的 report)
  //   JWT auth 走原邏輯(用戶 dashboard 拿全部 50 筆 + 完整欄位)
  //   原 bug:任何人拿 stripe session_id → 反查 email → 拿該 email 全部 50 筆
  //          含 access_token / report_result / birth_city / customer_email / pdf_url
  if (querySource === 'stripe-session') {
    const sessionId = req.nextUrl.searchParams.get('session_id') || ''
    // QA Agent L1 finding 2/2:同 session 對多筆 report 用 .order().limit(1) 防 maybeSingle null + console 噪音
    const { data: oneReport, error: oneErr } = await supabase
      .from('paid_reports')
      .select('id, plan_code, status, created_at, access_token, generation_progress, retry_count, error_message, self_update_count')
      .eq('stripe_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (oneErr) {
      console.error('[reports] stripe-session query error:', oneErr.message)
      return NextResponse.json({ error: oneErr.message, authSource: querySource }, { status: 500 })
    }
    console.info(`[reports] stripe-session source=${querySource} found=${oneReport ? 1 : 0}`)
    return NextResponse.json({
      reports: oneReport ? [oneReport] : [],
      _debug: { source: querySource, count: oneReport ? 1 : 0 },
    })
  }

  // JWT / Supabase admin auth 走原 dashboard 邏輯(50 筆 + 完整欄位)
  // v5.10.272:filter deleted_at IS NULL(對應 soft delete migration、客戶刪除後不再顯示)
  const { data, error } = await supabase
    .from('paid_reports')
    .select('id, plan_code, status, created_at, access_token, customer_email, report_result, pdf_url, retry_count, error_message, client_name, amount_usd, generation_progress, timezone, birth_city, self_update_count')
    .ilike('customer_email', queryEmail)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[reports] query error:', error.message, 'email:', queryEmail)
    return NextResponse.json({ error: error.message, authSource: querySource }, { status: 500 })
  }

  // 診斷：記錄查到幾筆
  console.info(`[reports] email=${queryEmail} source=${querySource} found=${(data || []).length}`)

  return NextResponse.json({
    reports: data || [],
    _debug: { email: queryEmail, source: querySource, count: (data || []).length },
  })
}

// PATCH — 重試失敗的報告（需登入驗證）
export async function PATCH(req: NextRequest) {
  const { email: authEmail } = await getAuthEmail(req)
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
  const { email: authEmail } = await getAuthEmail(req)
  if (!authEmail) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

  const supabase = getServiceSupabase()

  // v5.10.272 P0 修(Codex L3 backend audit P0#2):
  //   原:hard delete paid_reports → revenue_log 仍有 row → 後台會計 vs 報告數永久分叉
  //   原:客戶刪自己報告後、若 dispute「我沒買過」、平台無 evidence
  //   修:soft delete(set deleted_at = NOW())、preserve audit trail + revenue 對齊
  //   注意:其他 query 需配合 .is('deleted_at', null) 過濾(已在 dashboard/* 跟 reports GET 加)
  const { error } = await supabase
    .from('paid_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .ilike('customer_email', authEmail.toLowerCase())
    .is('deleted_at', null) // 已軟刪除不重複

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
