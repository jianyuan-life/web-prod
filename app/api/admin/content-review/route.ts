// ============================================================
// Content Moderation 後台 API（/jamie/content-review）
// ============================================================
// 功能：
//   GET  /api/admin/content-review?status=flagged    列出 flagged 報告
//   POST /api/admin/content-review                   action=force_pass / regenerate / dismiss
//
// 權限：checkAdminAuth + checkAdminRateLimit
// 稽核：所有寫入動作都會 writeAuditLog
// ============================================================

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

// ── GET：列出 moderation_log 項目 ──────────────────────────
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'flagged'
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500)
  const planCode = url.searchParams.get('plan_code')

  const supabase = getSupabase()

  let query = supabase
    .from('moderation_log')
    .select(`
      id,
      report_id,
      plan_code,
      action,
      blocked,
      reason,
      hits,
      ai_scores,
      content_preview,
      retry_attempt,
      status,
      admin_note,
      reviewed_by,
      reviewed_at,
      created_at,
      paid_reports(client_name, customer_email, plan_code, status)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (planCode) {
    query = query.eq('plan_code', planCode)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 附帶總數統計（for dashboard header）
  const { count: totalFlagged } = await supabase
    .from('moderation_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'flagged')

  return NextResponse.json({
    items: data || [],
    stats: {
      total_flagged: totalFlagged || 0,
    },
  })
}

// ── POST：處置 moderation 紀錄 ─────────────────────────────
// body: { logId, action, note? }
//   action = 'force_pass' | 'regenerate' | 'dismiss'
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  type Body = {
    logId?: string
    action?: 'force_pass' | 'regenerate' | 'dismiss'
    note?: string
    key?: string
  }

  let body: Body = {}
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const { logId, action, note } = body
  if (!logId || !action) {
    return NextResponse.json({ error: '缺少 logId 或 action' }, { status: 400 })
  }
  if (!['force_pass', 'regenerate', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: `不支援的 action: ${action}` }, { status: 400 })
  }

  const supabase = getSupabase()

  // 取得 moderation_log 紀錄 + 對應 report
  const { data: logRow, error: readErr } = await supabase
    .from('moderation_log')
    .select('id, report_id, plan_code, status, action')
    .eq('id', logId)
    .maybeSingle()

  if (readErr || !logRow) {
    return NextResponse.json({ error: '找不到 moderation 紀錄' }, { status: 404 })
  }

  // 分發動作
  if (action === 'dismiss') {
    const { error: updErr } = await supabase
      .from('moderation_log')
      .update({
        status: 'dismissed',
        admin_note: note || null,
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', logId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await writeAuditLog(req, 'retry_report', 'report', logRow.report_id, {
      moderation_log_id: logId,
      sub_action: 'content_review_dismiss',
      note,
    })
    return NextResponse.json({ ok: true, status: 'dismissed' })
  }

  if (action === 'force_pass') {
    const { error: updErr } = await supabase
      .from('moderation_log')
      .update({
        status: 'force_passed',
        action: 'force_pass',
        admin_note: note || null,
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', logId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await writeAuditLog(req, 'retry_report', 'report', logRow.report_id, {
      moderation_log_id: logId,
      sub_action: 'content_review_force_pass',
      note,
    })
    return NextResponse.json({ ok: true, status: 'force_passed' })
  }

  if (action === 'regenerate') {
    // 1. 把報告狀態拉回 pending
    if (logRow.report_id) {
      const { error: reportErr } = await supabase
        .from('paid_reports')
        .update({ status: 'pending', error_message: null })
        .eq('id', logRow.report_id)
      if (reportErr) {
        console.error('[content-review] 更新報告狀態失敗:', reportErr)
      }
    }

    // 2. 更新 moderation_log 狀態
    await supabase
      .from('moderation_log')
      .update({
        status: 'regenerated',
        action: 'regenerated',
        admin_note: note || null,
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', logId)

    // 3. 觸發 workflow（fire-and-forget）
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const internalSecret = process.env.CRON_SECRET || ''
    let triggered = false
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 6000)
      const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ reportId: logRow.report_id }),
        signal: controller.signal,
      })
      clearTimeout(t)
      triggered = wfRes.ok
    } catch (e) {
      console.warn('[content-review] workflow 觸發失敗，改走 fallback:', e)
    }
    if (!triggered) {
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 8000)
        await fetch(`${siteUrl}/api/generate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
          body: JSON.stringify({ reportId: logRow.report_id }),
          signal: controller.signal,
        })
        clearTimeout(t)
        triggered = true
      } catch (e) {
        console.error('[content-review] fallback 也失敗:', e)
      }
    }

    await writeAuditLog(req, 'retry_report', 'report', logRow.report_id, {
      moderation_log_id: logId,
      sub_action: 'content_review_regenerate',
      triggered,
      note,
    })

    return NextResponse.json({ ok: true, status: 'regenerated', triggered })
  }

  return NextResponse.json({ error: '未知 action' }, { status: 400 })
}
