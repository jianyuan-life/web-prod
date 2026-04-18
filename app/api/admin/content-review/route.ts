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

  // 實際 moderation_log schema 較精簡，只查實際存在的欄位
  // action_taken / admin_override / notes / categories / ai_scores / severity / layer / content_sample
  let query = supabase
    .from('moderation_log')
    .select(`
      id,
      report_id,
      action_taken,
      admin_override,
      severity,
      layer,
      categories,
      ai_scores,
      content_sample,
      admin_id,
      notes,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  // status 改用 action_taken 對應（flagged → action_taken is null；其他 → action_taken）
  if (status && status !== 'all') {
    if (status === 'flagged') {
      query = query.is('action_taken', null)
    } else {
      query = query.eq('action_taken', status)
    }
  }

  const { data, error } = await query
  if (error) {
    if (String(error.code) === '42P01') {
      return NextResponse.json({
        items: [],
        stats: { total_flagged: 0 },
        note: 'moderation_log 表未建立',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 回傳時把實際欄位 shim 成前端預期的 shape
  const items = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    report_id: row.report_id || null,
    plan_code: '',
    action: (row.action_taken as string) || 'flagged',
    blocked: row.severity === 'block',
    reason: (row.notes as string) || (row.severity as string) || '',
    hits: Array.isArray(row.categories) ? row.categories : [],
    ai_scores: row.ai_scores || {},
    content_preview: (row.content_sample as string) || '',
    retry_attempt: 0,
    status: (row.action_taken as string) || 'flagged',
    admin_note: (row.notes as string) || null,
    reviewed_by: (row.admin_id as string) || null,
    reviewed_at: row.updated_at || null,
    created_at: row.created_at,
    paid_reports: null,
  }))

  // 附帶總數統計（for dashboard header）— 用 action_taken IS NULL 代表待審
  const { count: totalFlagged } = await supabase
    .from('moderation_log')
    .select('*', { count: 'exact', head: true })
    .is('action_taken', null)

  return NextResponse.json({
    items,
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
    .select('id, report_id, action_taken, severity')
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
        action_taken: 'dismissed',
        notes: note || null,
        admin_id: 'admin',
        updated_at: new Date().toISOString(),
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
        action_taken: 'force_passed',
        admin_override: 'force_pass',
        notes: note || null,
        admin_id: 'admin',
        updated_at: new Date().toISOString(),
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
        action_taken: 'regenerated',
        admin_override: 'regenerated',
        notes: note || null,
        admin_id: 'admin',
        updated_at: new Date().toISOString(),
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
