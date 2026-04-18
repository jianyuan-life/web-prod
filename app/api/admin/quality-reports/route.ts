// ============================================================
// /api/admin/quality-reports — 5 LLM Post-Gen QA 儀表板 API
// ============================================================
// Post-Gen 5 LLM QA Pipeline (2026-04-18)
// 支撐 /jamie/quality-reports：列最近 N 份報告的 5 LLM 評分摘要，
// 並可點開看每位 reviewer 的 issues/critical_errors。
//
// GET  /api/admin/quality-reports?filter=low_min|low_avg|needs_review|all&limit=50
//   Headers: x-admin-key
//   回傳：reports 陣列，每筆含 scores / avg / min / max / issues
//
// GET  /api/admin/quality-reports?report_id=<uuid>
//   回傳單一報告的 5 LLM 詳細評分（issues、strengths、suggestions…）
//
// PATCH /api/admin/quality-reports
//   Body: { report_id, action: 'release'|'regenerate', reason?: string }
//   release    = 手動放行，status needs_human_review → completed
//   regenerate = 手動觸發重生，status → pending + 呼叫 workflow
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

type QaLogRow = {
  id: string
  report_id: string | null
  plan_code: string | null
  round: number
  reviewer: string
  model: string
  score: number
  issues: unknown
  critical_errors: unknown
  strengths: unknown
  suggestions: unknown
  passed: boolean
  latency_ms: number | null
  cost_usd: number | string | null
  error_message: string | null
  created_at: string | null
}

type ReportRow = {
  id: string
  plan_code: string | null
  client_name: string | null
  customer_email: string | null
  status: string | null
  created_at: string | null
  error_message: string | null
}

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const { searchParams } = req.nextUrl
  const singleReportId = searchParams.get('report_id')

  const supabase = getSupabase()

  // 單一報告詳細評分
  if (singleReportId) {
    const { data: logs, error: logErr } = await supabase
      .from('report_qa_log')
      .select('*')
      .eq('report_id', singleReportId)
      .order('round', { ascending: true })
      .order('reviewer', { ascending: true })

    if (logErr) {
      if (isTableMissing(logErr)) return NextResponse.json({ report_id: singleReportId, rounds: [] })
      return NextResponse.json({ error: logErr.message }, { status: 500 })
    }

    const { data: rep } = await supabase
      .from('paid_reports')
      .select('id, plan_code, client_name, customer_email, status, created_at, error_message')
      .eq('id', singleReportId)
      .maybeSingle()

    // 依 round 分組
    const rounds: Record<string, QaLogRow[]> = {}
    for (const row of (logs as QaLogRow[] | null) || []) {
      const r = String(row.round ?? 1)
      if (!rounds[r]) rounds[r] = []
      rounds[r].push(row)
    }

    return NextResponse.json({
      report: rep || null,
      rounds: Object.entries(rounds).map(([round, reviewers]) => ({
        round: Number(round),
        reviewers: reviewers.map(r => ({
          reviewer: r.reviewer,
          model: r.model,
          score: r.score,
          passed: r.passed,
          issues: normArr(r.issues),
          critical_errors: normArr(r.critical_errors),
          strengths: normArr(r.strengths),
          suggestions: normArr(r.suggestions),
          latency_ms: r.latency_ms,
          cost_usd: toNum(r.cost_usd),
          error_message: r.error_message,
        })),
        summary: summarizeRound(reviewers),
      })),
    })
  }

  // 列表模式
  const filter = (searchParams.get('filter') || 'all') as
    | 'all' | 'low_min' | 'low_avg' | 'needs_review' | 'red'
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200)

  // 先取最近 N 份有 QA log 的報告 ID
  const { data: logs, error: logErr } = await supabase
    .from('report_qa_log')
    .select('report_id, plan_code, reviewer, score, passed, critical_errors, round, created_at')
    .order('created_at', { ascending: false })
    .limit(limit * 6)  // 5 reviewer + 可能有 retry，放寬

  if (logErr) {
    if (isTableMissing(logErr)) {
      return NextResponse.json({
        reports: [],
        note: 'report_qa_log 表尚未建立，請先執行 migration create_report_qa_log.sql',
      })
    }
    return NextResponse.json({ error: logErr.message }, { status: 500 })
  }

  // 按 report_id 聚合最新一輪的評分
  type AggRow = {
    report_id: string
    plan_code: string
    latest_round: number
    scores: Record<string, number>
    avg: number
    min: number
    max: number
    critical_count: number
    latest_ts: string
  }
  const agg = new Map<string, AggRow>()

  for (const r of (logs as QaLogRow[] | null) || []) {
    if (!r.report_id) continue
    const roundNum = r.round ?? 1
    let row = agg.get(r.report_id)
    if (!row) {
      row = {
        report_id: r.report_id,
        plan_code: r.plan_code || '',
        latest_round: roundNum,
        scores: {},
        avg: 0,
        min: 101,
        max: -1,
        critical_count: 0,
        latest_ts: r.created_at || '',
      }
      agg.set(r.report_id, row)
    }
    // 只看最新一輪
    if (roundNum > row.latest_round) {
      row.latest_round = roundNum
      row.scores = {}
      row.min = 101
      row.max = -1
      row.critical_count = 0
      row.latest_ts = r.created_at || row.latest_ts
    }
    if (roundNum === row.latest_round) {
      row.scores[r.reviewer] = r.score
      if (r.score < row.min) row.min = r.score
      if (r.score > row.max) row.max = r.score
      row.critical_count += normArr(r.critical_errors).length
    }
  }

  // 計算每份的 avg
  const aggs = Array.from(agg.values()).map(r => {
    const values = Object.values(r.scores)
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
    return {
      ...r,
      avg: Math.round(avg * 10) / 10,
      min: r.min === 101 ? 0 : r.min,
      max: r.max === -1 ? 0 : r.max,
    }
  })

  // filter
  let filtered = aggs
  if (filter === 'low_min') filtered = aggs.filter(a => a.min < 95)
  else if (filter === 'low_avg') filtered = aggs.filter(a => a.avg < 93)
  else if (filter === 'red') filtered = aggs.filter(a => a.avg < 85)

  // 附上 paid_reports 基本資訊
  const ids = filtered.slice(0, limit).map(a => a.report_id)
  const { data: reportsData } = ids.length > 0
    ? await supabase
        .from('paid_reports')
        .select('id, plan_code, client_name, customer_email, status, created_at, error_message')
        .in('id', ids)
    : { data: [] as ReportRow[] }

  const byId = new Map<string, ReportRow>()
  for (const r of (reportsData as ReportRow[] | null) || []) byId.set(r.id, r)

  // needs_review filter：status = needs_human_review 的（從 paid_reports 額外補上）
  let needsReviewExtra: Array<AggRow & { avg: number }> = []
  if (filter === 'needs_review' || filter === 'all') {
    const { data: pending } = await supabase
      .from('paid_reports')
      .select('id, plan_code, client_name, customer_email, status, created_at, error_message')
      .eq('status', 'needs_human_review')
      .order('created_at', { ascending: false })
      .limit(50)

    for (const p of (pending as ReportRow[] | null) || []) {
      if (!byId.has(p.id)) byId.set(p.id, p)
      if (!agg.has(p.id)) {
        // 沒 QA log 的 needs_review 報告
        needsReviewExtra.push({
          report_id: p.id,
          plan_code: p.plan_code || '',
          latest_round: 0,
          scores: {},
          avg: 0,
          min: 0,
          max: 0,
          critical_count: 0,
          latest_ts: p.created_at || '',
        })
      }
    }
  }
  if (filter === 'needs_review') {
    filtered = [
      ...aggs.filter(a => (byId.get(a.report_id)?.status || '') === 'needs_human_review'),
      ...needsReviewExtra,
    ]
  }

  filtered.sort((a, b) => (b.latest_ts || '').localeCompare(a.latest_ts || ''))
  const sliced = filtered.slice(0, limit)

  const payload = sliced.map(a => {
    const rep = byId.get(a.report_id)
    return {
      report_id: a.report_id,
      plan_code: a.plan_code || rep?.plan_code || '',
      client_name: rep?.client_name || '',
      customer_email: rep?.customer_email || '',
      status: rep?.status || '',
      error_message: rep?.error_message || '',
      latest_round: a.latest_round,
      scores: a.scores,
      avg: a.avg,
      min: a.min,
      max: a.max,
      critical_count: a.critical_count,
      created_at: rep?.created_at || null,
      updated_at: a.latest_ts || rep?.created_at || null,
    }
  })

  return NextResponse.json({
    filter,
    count: payload.length,
    reports: payload,
    // 統計
    summary: {
      total: payload.length,
      avg_below_93: payload.filter(p => p.avg < 93 && p.avg > 0).length,
      avg_below_85: payload.filter(p => p.avg < 85 && p.avg > 0).length,
      min_below_95: payload.filter(p => p.min < 95 && p.min > 0).length,
      needs_review: payload.filter(p => p.status === 'needs_human_review').length,
    },
  })
}

// ── PATCH（手動放行 / 重生成）──────────────────────────────────

export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  type Body = {
    report_id?: string
    action?: 'release' | 'regenerate'
    reason?: string
    key?: string
  }
  let body: Body = {}
  try { body = await req.json() as Body } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const { report_id, action, reason } = body
  if (!report_id || !action) {
    return NextResponse.json({ error: '需提供 report_id 與 action' }, { status: 400 })
  }

  const supabase = getSupabase()

  if (action === 'release') {
    // needs_human_review → completed（手動放行）
    const { error } = await supabase.from('paid_reports')
      .update({
        status: 'completed',
        error_message: null,
      })
      .eq('id', report_id)
      .eq('status', 'needs_human_review')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try {
      await writeAuditLog(req, 'retry_report', 'report', report_id, {
        action: 'quality_release',
        reason: reason || '手動放行 (5 LLM QA)',
      })
    } catch { /* 不阻塞 */ }

    return NextResponse.json({ ok: true, action: 'release', report_id })
  }

  if (action === 'regenerate') {
    // 把 status 拉回 pending，觸發 workflow 重生成
    const { error } = await supabase.from('paid_reports')
      .update({
        status: 'pending',
        error_message: null,
      })
      .eq('id', report_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try {
      await writeAuditLog(req, 'retry_report', 'report', report_id, {
        action: 'quality_regenerate',
        reason: reason || '手動觸發重生 (5 LLM QA)',
      })
    } catch { /* 不阻塞 */ }

    // 觸發 workflow
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const internalSecret = process.env.CRON_SECRET || ''
    let triggered = false
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 6000)
      const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ reportId: report_id }),
        signal: controller.signal,
      })
      clearTimeout(t)
      if (wfRes.ok) triggered = true
    } catch { /* workflow 觸發失敗不阻塞 */ }

    return NextResponse.json({ ok: true, action: 'regenerate', report_id, triggered })
  }

  return NextResponse.json({ error: `不支援的 action: ${action}` }, { status: 400 })
}

// ── 工具函式 ────────────────────────────────────────────────────

function isTableMissing(err: { message?: string; code?: string }): boolean {
  if (!err) return false
  if (String(err.code) === '42P01') return true
  const msg = String(err.message || '')
  return msg.includes('report_qa_log') && (msg.includes('does not exist') || msg.includes('not found'))
}

function normArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x))
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      if (Array.isArray(p)) return p.map(x => String(x))
    } catch { /* ignore */ }
  }
  return []
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v) || 0
  return 0
}

function summarizeRound(reviewers: QaLogRow[]): {
  avg: number
  min: number
  max: number
  scores: Record<string, number>
  passed: boolean
  total_cost_usd: number
  total_critical: number
} {
  const scores: Record<string, number> = {}
  let sum = 0, min = 101, max = -1, cost = 0, critical = 0
  for (const r of reviewers) {
    scores[r.reviewer] = r.score
    sum += r.score
    if (r.score < min) min = r.score
    if (r.score > max) max = r.score
    cost += toNum(r.cost_usd)
    critical += normArr(r.critical_errors).length
  }
  const avg = reviewers.length > 0 ? sum / reviewers.length : 0
  return {
    scores,
    avg: Math.round(avg * 10) / 10,
    min: min === 101 ? 0 : min,
    max: max === -1 ? 0 : max,
    passed: min >= 95 && avg >= 93,
    total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    total_critical: critical,
  }
}
