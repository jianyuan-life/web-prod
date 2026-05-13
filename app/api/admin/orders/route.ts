import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// GET — 取得所有訂單（完整資料）
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const { data, error } = await getSupabase()
    .from('paid_reports')
    .select('id, client_name, customer_email, plan_code, amount_usd, status, created_at, error_message, retry_count, access_token, birth_data')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orders: (data || []).map(r => ({
      ...r,
      plan_code: (r.plan_code || '').split(/\s/)[0],
      // 移除 birth_data 中的敏感個資（只保留摘要欄位供後台排查）
      birth_data: r.birth_data ? {
        plan: (r.birth_data as Record<string, unknown>)?.plan,
        plan_type: (r.birth_data as Record<string, unknown>)?.plan_type,
        locale: (r.birth_data as Record<string, unknown>)?.locale,
        year: (r.birth_data as Record<string, unknown>)?.year,
        gender: (r.birth_data as Record<string, unknown>)?.gender,
      } : null,
    })),
  })
}

// PATCH — 管理員強制重試報告（任何狀態都可以）
export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const body = await req.json()
  const { id, key } = body
  // 相容舊路徑：key 可由 header 或 body 傳入
  const authFail = checkAdminAuth(req, key)
  if (authFail) return authFail
  if (!id) return NextResponse.json({ error: '缺少報告 ID' }, { status: 400 })

  const supabase = getSupabase()

  // 查詢報告(v5.10.274 加 report_result 給 history backup)
  const { data: report, error: fetchErr } = await supabase
    .from('paid_reports')
    .select('id, status, retry_count, report_result')
    .eq('id', id)
    .single()

  if (fetchErr || !report) {
    return NextResponse.json({ error: '找不到報告' }, { status: 404 })
  }

  // 重置狀態為 pending，讓 workflow 重新搶佔
  // 管理員可對任何狀態重新生成（包括 completed — 用於報告被截斷需要重跑的情況）
  // v5.10.274:backup 原 report_result 給 dispute restore 用(對應 Gemini P0#4)
  await supabase.from('paid_reports').update({
    status: 'pending',
    error_message: null,
    report_result: null,
    pdf_url: null,
    retry_count: (report.retry_count ?? 0) + 1,
    previous_report_result: report.report_result || null,
    recalculated_at: new Date().toISOString(),
    recalculated_by: 'admin:orders-patch',
  }).eq('id', id)

  // 觸發 Workflow
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  let workflowTriggered = false
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ reportId: id }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (wfRes.ok) workflowTriggered = true
  } catch { /* 靜默 */ }

  // Fallback
  if (!workflowTriggered) {
    try {
      const fbController = new AbortController()
      const fbTimeout = setTimeout(() => fbController.abort(), 8000)
      await fetch(`${siteUrl}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({ reportId: id }),
        signal: fbController.signal,
      })
      clearTimeout(fbTimeout)
    } catch { /* 靜默 */ }
  }

  // 稽核紀錄
  await writeAuditLog(req, 'retry_report', 'report', String(id), {
    previous_status: report.status,
    new_retry_count: (report.retry_count ?? 0) + 1,
  })

  return NextResponse.json({ success: true, message: '已重新觸發報告生成' })
}

// v5.10.276 P0 補完(Codex P0#6 + Gemini P0#4):restore previous_report_result
//   action='restore':把 previous_report_result swap 回 report_result(client undo recalculate)
//   action='get_history':只回 previous_report_result 給 ops 預覽
//
// POST /api/admin/orders
//   body: { id: string, action: 'restore' | 'get_history', key?: string }
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const body = await req.json()
  const { id, action, key } = body
  const authFail = checkAdminAuth(req, key)
  if (authFail) return authFail
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = getSupabase()

  // get_history:回 backup 給 ops 預覽
  if (action === 'get_history') {
    const { data, error } = await supabase
      .from('paid_reports')
      .select('id, status, report_result, previous_report_result, recalculated_at, recalculated_by')
      .eq('id', id)
      .single()
    if (error || !data) return NextResponse.json({ error: '找不到報告' }, { status: 404 })
    return NextResponse.json({
      current: data.report_result,
      previous: data.previous_report_result,
      recalculated_at: data.recalculated_at,
      recalculated_by: data.recalculated_by,
      has_backup: !!data.previous_report_result,
    })
  }

  // restore:swap previous → current
  if (action === 'restore') {
    const { data, error: fetchErr } = await supabase
      .from('paid_reports')
      .select('id, report_result, previous_report_result, status')
      .eq('id', id)
      .single()
    if (fetchErr || !data) return NextResponse.json({ error: '找不到報告' }, { status: 404 })
    if (!data.previous_report_result) {
      return NextResponse.json({ error: '無備份可復原(從未 recalculate)' }, { status: 400 })
    }

    // swap:current → backup, backup → current(可二次 undo)
    const { error: updateErr } = await supabase
      .from('paid_reports')
      .update({
        report_result: data.previous_report_result,
        previous_report_result: data.report_result,
        recalculated_at: new Date().toISOString(),
        recalculated_by: 'admin:restore',
        status: 'completed',  // restore 假設舊版是 completed(若不對 admin 可手動改)
        error_message: null,
      })
      .eq('id', id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    await writeAuditLog(req, 'update', 'report', String(id), {
      action: 'restore_previous_report_result',
      restored_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: '已還原至 previous_report_result' })
  }

  return NextResponse.json({ error: 'action 無效(支援:restore / get_history)' }, { status: 400 })
}
