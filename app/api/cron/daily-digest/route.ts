// v5.3.2 每日晨報 Cron（2026-04-18）
//
// GET /api/cron/daily-digest
// Header: Authorization: Bearer ${CRON_SECRET}
// 每天台灣時間 08:00（UTC+8）= Vercel UTC 00:00 跑一次
//
// 邏輯：彙總昨日（00:00 ~ 23:59 UTC+8 = 前日 16:00 ~ 當日 16:00 UTC）
//      並發 Telegram 訊息給老闆。
//
// 內容：報告數、成功率、AI 成本、營收、新客戶、熱門方案、低評分、異常告警。

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyDaily, notify } from '@/lib/ai/observability/telegram'
import { checkCronAuth } from '@/lib/cron-auth'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  // v5.10.279 fail-closed auth(Codex P0#3)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  // 昨日台灣時間（UTC+8）
  const tzOffsetMs = 8 * 60 * 60 * 1000
  const nowTw = new Date(Date.now() + tzOffsetMs)
  const ydTw = new Date(nowTw.getTime() - 24 * 60 * 60 * 1000)
  const yearMonthDay = ydTw.toISOString().slice(0, 10)
  // UTC 對應：台灣 00:00 = UTC (昨日) 16:00，台灣 24:00 = UTC (今日) 16:00
  const startUtc = new Date(Date.UTC(
    ydTw.getUTCFullYear(), ydTw.getUTCMonth(), ydTw.getUTCDate(), -8, 0, 0,
  ))
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)

  const startIso = startUtc.toISOString()
  const endIso = endUtc.toISOString()

  const [reportsRes, costRes, feedbackRes, adminAuditRes] = await Promise.all([
    // v5.10.283 soft delete filter:daily digest 不算軟刪報告
    supabase
      .from('paid_reports')
      .select('id, plan_code, status, amount_usd, customer_email, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .is('deleted_at', null),
    supabase
      .from('ai_cost_log')
      .select('cost_usd, provider, status')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('report_feedback')
      .select('rating, comment, report_id, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    // v5.4.12 P3:加 admin 操作昨日統計(grant/deduct/refund 等)
    supabase
      .from('admin_audit_log')
      .select('action, metadata, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
  ])

  const reports = reportsRes.data || []
  const costs = costRes.data || []
  const feedback = feedbackRes.data || []
  const adminAudit = adminAuditRes.data || []

  // ── 報告統計 ─
  const totalReports = reports.length
  const successReports = reports.filter(r => r.status === 'completed').length
  const failedReports = reports.filter(r => r.status === 'failed').length
  const totalRevenue = reports
    .filter(r => r.status !== 'failed')
    .reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)

  // 熱門方案
  const planCount: Record<string, number> = {}
  for (const r of reports) {
    const p = (r.plan_code || 'unknown').split(/\s/)[0]
    planCount[p] = (planCount[p] || 0) + 1
  }
  const topPlans = Object.entries(planCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([plan, count]) => ({ plan, count }))

  // 新客戶（昨日 distinct email - 過去出現過的 = 真新客）
  // v5.3.33：分批查詢避免 URL 過長（Supabase .in() 超過 ~100 email 會超出 8KB URL 限制）
  const yesterdayEmails = new Set<string>(
    reports.map(r => r.customer_email).filter((e): e is string => !!e),
  )
  let newCustomers = 0
  if (yesterdayEmails.size > 0) {
    const priorSet = new Set<string>()
    const emails = Array.from(yesterdayEmails)
    const BATCH = 50
    for (let i = 0; i < emails.length; i += BATCH) {
      const chunk = emails.slice(i, i + BATCH)
      // v5.10.283 soft delete filter:新客戶判斷不算軟刪歷史
      const { data: priorReports } = await supabase
        .from('paid_reports')
        .select('customer_email')
        .in('customer_email', chunk)
        .lt('created_at', startIso)
        .is('deleted_at', null)
      for (const r of (priorReports || [])) {
        if (r.customer_email) priorSet.add(r.customer_email)
      }
    }
    for (const e of yesterdayEmails) {
      if (!priorSet.has(e)) newCustomers++
    }
  }

  // ── 成本 ─
  const totalCost = costs.reduce((sum, c) => sum + Number(c.cost_usd || 0), 0)
  const costByProvider: Record<string, number> = {}
  for (const c of costs) {
    const p = c.provider || 'unknown'
    costByProvider[p] = (costByProvider[p] || 0) + Number(c.cost_usd || 0)
  }
  const failedCalls = costs.filter(c => c.status !== 'success').length

  // ── 評分 ─
  const lowFeedback = feedback.filter(f => Number(f.rating) < 3)
  const avgRating = feedback.length > 0
    ? Math.round(feedback.reduce((s, f) => s + Number(f.rating || 0), 0) / feedback.length * 10) / 10
    : 0

  // ── 組裝摘要 ──
  const costBreakdownText = Object.entries(costByProvider)
    .sort((a, b) => b[1] - a[1])
    .map(([p, v]) => `${p}: $${v.toFixed(3)}`)
    .join(', ') || '無'

  // v5.4.12 P3:統計昨日 admin 操作(透明化、給老闆看)
  const adminStats = {
    grant_points: adminAudit.filter(a => a.action === 'grant_points').length,
    deduct_points: adminAudit.filter(a => a.action === 'deduct_points').length,
    refund: adminAudit.filter(a => a.action === 'refund').length,
    other: adminAudit.filter(a => !['grant_points', 'deduct_points', 'refund'].includes(a.action)).length,
  }
  const adminTotal = adminAudit.length

  const notesLines: string[] = []
  if (failedCalls > 0) notesLines.push(`失敗 API 呼叫: ${failedCalls}`)
  if (avgRating > 0) notesLines.push(`評分: ${avgRating}★ × ${feedback.length}`)
  if (lowFeedback.length > 0) notesLines.push(`⚠️ 低評分 ${lowFeedback.length} 份`)
  if (adminTotal > 0) {
    const parts: string[] = []
    if (adminStats.grant_points > 0) parts.push(`發${adminStats.grant_points}`)
    if (adminStats.deduct_points > 0) parts.push(`扣${adminStats.deduct_points}`)
    if (adminStats.refund > 0) parts.push(`退${adminStats.refund}`)
    if (adminStats.other > 0) parts.push(`其他${adminStats.other}`)
    notesLines.push(`Admin 操作: ${parts.join('/')}(${adminTotal} 筆)`)
  }
  notesLines.push(`成本明細: ${costBreakdownText}`)

  const sent = await notifyDaily({
    date: yearMonthDay,
    totalReports,
    successReports,
    failedReports,
    totalCostUsd: Math.round(totalCost * 100) / 100,
    totalRevenueUsd: Math.round(totalRevenue * 100) / 100,
    newCustomers,
    topPlans,
    notes: notesLines.join(' · '),
  })

  // 若有低評分，另發一則細節通知
  if (lowFeedback.length > 0) {
    const lines = lowFeedback.slice(0, 5).map(f =>
      `• ${f.report_id?.slice(0, 8)} · ${f.rating}★${f.comment ? ` · ${String(f.comment).slice(0, 80)}` : ''}`,
    ).join('\n')
    await notify(
      `😞 昨日低評分 ${lowFeedback.length} 份`,
      `建議主動聯繫客戶了解原因：\n\n${lines}`,
    )
  }

  return NextResponse.json({
    message: '每日晨報已發送',
    date: yearMonthDay,
    summary: {
      total: totalReports,
      success: successReports,
      failed: failedReports,
      revenue: totalRevenue,
      cost: totalCost,
      newCustomers,
      topPlans,
      lowFeedbackCount: lowFeedback.length,
      adminActions: { total: adminTotal, ...adminStats },
      telegramSent: sent,
    },
  })
}
