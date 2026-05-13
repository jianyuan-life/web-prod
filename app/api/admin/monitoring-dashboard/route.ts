// v5.3.2 監控儀表板聚合 API（2026-04-18）
//
// GET /api/admin/monitoring-dashboard
// Headers: x-admin-key
//
// 回傳所有監控即時指標，讓前端 /jamie/monitoring 一次把資料拿完。
// 前端每 30 秒 refresh 一次。
//
// 包含：
//   - llm_balances：各 LLM provider 最新餘額 + status
//   - today：今日報告數（成功/失敗/卡住）、今日 AI 成本
//   - month：本月累計 AI 成本 vs 預算
//   - funnel：7 日漏斗轉化
//   - email：7 日寄信成功/失敗統計
//   - feedback：7 日客戶評分分佈
//   - stuck：目前卡住 > 20 分的 generating 報告
//   - cost_by_provider：今日各 provider 花費

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 每月 AI 預算（可透過 env 覆蓋）
const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_AI_BUDGET_USD || 500)
const DAILY_BUDGET_USD = Number(process.env.DAILY_AI_BUDGET_USD || MONTHLY_BUDGET_USD / 30)

type LlmBalanceRow = {
  provider: string
  balance: number | null
  currency: string
  balance_usd: number | null
  status: string
  error_message: string | null
  checked_at: string
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000)

  // ── 並行查詢所有模組 ─────────────────────────────────
  const [
    llmLatestRes,
    todayReportsRes,
    stuckReportsRes,
    todayCostRes,
    monthCostRes,
    emailRes,
    feedbackRes,
    funnelRes,
  ] = await Promise.all([
    // 1. LLM 餘額（最新一筆/provider）
    supabase
      .from('llm_balance_latest')
      .select('*')
      .order('provider', { ascending: true }),

    // 2. 今日報告（paid_reports 無 updated_at 欄位，改用 created_at 排序與計時）
    // v5.10.287 soft delete filter
    supabase
      .from('paid_reports')
      .select('id, client_name, plan_code, status, created_at, error_message, generation_progress, amount_usd')
      .gte('created_at', todayStart.toISOString())
      .is('deleted_at', null),

    // 3. 卡住 > 20 分的 generating
    // v5.10.287 soft delete filter:軟刪 stuck 報告不該 alert
    supabase
      .from('paid_reports')
      .select('id, client_name, plan_code, status, created_at, generation_progress')
      .eq('status', 'generating')
      .lt('created_at', twentyMinAgo.toISOString())
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(20),

    // 4. 今日成本（分 provider）
    supabase
      .from('ai_cost_log')
      .select('provider, model, cost_usd, status, created_at')
      .gte('created_at', todayStart.toISOString()),

    // 5. 本月成本
    supabase
      .from('ai_cost_log')
      .select('provider, cost_usd')
      .gte('created_at', monthStart.toISOString()),

    // 6. 7 日寄信紀錄（table 實際欄位：status / template / sent_at；無 email_type、無 created_at）
    supabase
      .from('email_send_log')
      .select('status, template, sent_at')
      .gte('sent_at', sevenDaysAgo.toISOString()),

    // 7. 7 日客戶評分
    supabase
      .from('report_feedback')
      .select('rating, report_id, created_at')
      .gte('created_at', sevenDaysAgo.toISOString()),

    // 8. 7 日漏斗事件（若表存在）
    supabase
      .from('customer_funnel_events')
      .select('step, plan_code, created_at')
      .gte('created_at', sevenDaysAgo.toISOString()),
  ])

  // ── LLM 餘額（view 可能不存在 fallback） ─────────────
  let llmBalances: LlmBalanceRow[] = []
  if (!llmLatestRes.error && llmLatestRes.data) {
    llmBalances = llmLatestRes.data as LlmBalanceRow[]
  } else {
    // fallback：直接查 ai-balance endpoint（如果表未建，view 也會 fail）
    llmBalances = []
  }

  // ── 今日報告狀態 ─────────────────────────────────────
  const todayReports = todayReportsRes.data || []
  const todayByStatus = {
    total: todayReports.length,
    completed: todayReports.filter(r => r.status === 'completed').length,
    failed: todayReports.filter(r => r.status === 'failed').length,
    generating: todayReports.filter(r => r.status === 'generating').length,
    pending: todayReports.filter(r => r.status === 'pending').length,
  }
  const todayRevenue = todayReports
    .filter(r => r.status !== 'failed')
    .reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)

  // ── 卡住的報告 ───────────────────────────────────────
  const stuckReports = (stuckReportsRes.data || []).map(r => {
    const createdMs = new Date(r.created_at).getTime()
    const minutesStuck = Math.round((Date.now() - createdMs) / 60000)
    const progress = (r.generation_progress || null) as Record<string, string> | null
    return {
      id: r.id,
      client_name: r.client_name,
      plan_code: (r.plan_code || '').split(/\s/)[0],
      minutes_stuck: minutesStuck,
      current_step: progress?.current_step || null,
      started_at: progress?.started_at || r.created_at,
    }
  })

  // ── 今日成本（分 provider） ──────────────────────────
  const todayCosts = todayCostRes.data || []
  const todayCostByProvider: Record<string, { calls: number; total: number; failed: number }> = {}
  let todayTotalCost = 0
  for (const c of todayCosts) {
    const p = c.provider || 'unknown'
    if (!todayCostByProvider[p]) todayCostByProvider[p] = { calls: 0, total: 0, failed: 0 }
    todayCostByProvider[p].calls++
    todayCostByProvider[p].total += Number(c.cost_usd || 0)
    if (c.status !== 'success') todayCostByProvider[p].failed++
    todayTotalCost += Number(c.cost_usd || 0)
  }
  // 精度
  for (const p of Object.keys(todayCostByProvider)) {
    todayCostByProvider[p].total = Math.round(todayCostByProvider[p].total * 10000) / 10000
  }
  todayTotalCost = Math.round(todayTotalCost * 10000) / 10000

  // ── 本月成本 ────────────────────────────────────────
  const monthCosts = monthCostRes.data || []
  let monthTotalCost = 0
  const monthCostByProvider: Record<string, number> = {}
  for (const c of monthCosts) {
    const p = c.provider || 'unknown'
    const v = Number(c.cost_usd || 0)
    monthTotalCost += v
    monthCostByProvider[p] = (monthCostByProvider[p] || 0) + v
  }
  monthTotalCost = Math.round(monthTotalCost * 100) / 100
  for (const p of Object.keys(monthCostByProvider)) {
    monthCostByProvider[p] = Math.round(monthCostByProvider[p] * 100) / 100
  }
  const monthBudgetUsagePct = MONTHLY_BUDGET_USD > 0
    ? Math.round(monthTotalCost / MONTHLY_BUDGET_USD * 1000) / 10
    : 0

  // ── Email 送達 ─────────────────────────────────────
  const emailRows = emailRes.error ? [] : (emailRes.data || [])
  const emailSummary = {
    total: emailRows.length,
    sent: emailRows.filter(e => e.status === 'sent' || e.status === 'delivered').length,
    failed: emailRows.filter(e => e.status === 'failed' || e.status === 'bounced').length,
    by_type: {} as Record<string, { sent: number; failed: number }>,
  }
  for (const e of emailRows) {
    // template 作為 email 類型分類（transactional_report / welcome / 等）
    const t = (e as { template?: string | null }).template || 'other'
    if (!emailSummary.by_type[t]) emailSummary.by_type[t] = { sent: 0, failed: 0 }
    if (e.status === 'failed' || e.status === 'bounced') emailSummary.by_type[t].failed++
    else emailSummary.by_type[t].sent++
  }
  const emailSuccessRate = emailSummary.total > 0
    ? Math.round((emailSummary.sent / emailSummary.total) * 1000) / 10
    : 100

  // ── 客戶評分 ────────────────────────────────────────
  const feedback = feedbackRes.error ? [] : (feedbackRes.data || [])
  const ratingDist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const f of feedback) {
    const r = Math.max(1, Math.min(5, Math.round(Number(f.rating) || 0)))
    if (r >= 1 && r <= 5) ratingDist[String(r)]++
  }
  const totalRatings = feedback.length
  const avgRating = totalRatings > 0
    ? Math.round(feedback.reduce((s, f) => s + (Number(f.rating) || 0), 0) / totalRatings * 10) / 10
    : 0
  const lowRatings = feedback.filter(f => Number(f.rating) < 3).length

  // ── 轉化漏斗 ────────────────────────────────────────
  const funnelRows = funnelRes.error ? [] : (funnelRes.data || [])
  const funnelCounts: Record<string, number> = {}
  for (const f of funnelRows) {
    funnelCounts[f.step] = (funnelCounts[f.step] || 0) + 1
  }
  const pct = (num: number, den: number) => den > 0 ? Math.round(num / den * 1000) / 10 : 0
  const funnelSummary = {
    visit_pricing: funnelCounts['visit_pricing'] || 0,
    start_checkout: funnelCounts['start_checkout'] || 0,
    begin_payment: funnelCounts['begin_payment'] || 0,
    payment_success: funnelCounts['payment_success'] || 0,
    report_generated: funnelCounts['report_generated'] || 0,
    report_viewed: funnelCounts['report_viewed'] || 0,
    pdf_downloaded: funnelCounts['pdf_downloaded'] || 0,
    conversion_pct: {
      visit_to_checkout: pct(funnelCounts['start_checkout'] || 0, funnelCounts['visit_pricing'] || 0),
      checkout_to_pay: pct(funnelCounts['payment_success'] || 0, funnelCounts['start_checkout'] || 0),
      pay_to_view: pct(funnelCounts['report_viewed'] || 0, funnelCounts['payment_success'] || 0),
    },
  }

  // ── 告警判斷（給前端紅綠燈） ────────────────────────
  const alerts: string[] = []
  for (const b of llmBalances) {
    if (b.status === 'critical') alerts.push(`${b.provider} 餘額告急`)
    else if (b.status === 'low') alerts.push(`${b.provider} 餘額偏低`)
  }
  if (stuckReports.length > 0) alerts.push(`${stuckReports.length} 份報告卡住 > 20 分`)
  if (todayTotalCost > DAILY_BUDGET_USD) alerts.push(`今日 AI 成本超預算 ($${todayTotalCost.toFixed(2)} / $${DAILY_BUDGET_USD.toFixed(2)})`)
  if (emailSuccessRate < 95 && emailSummary.total > 10) alerts.push(`Email 送達率偏低 (${emailSuccessRate}%)`)
  if (lowRatings > 2) alerts.push(`${lowRatings} 份低評分 (<3星)`)

  return NextResponse.json({
    timestamp: now.toISOString(),
    alerts,
    llm_balances: llmBalances,
    today: {
      reports: todayByStatus,
      revenue_usd: Math.round(todayRevenue * 100) / 100,
      cost_usd: todayTotalCost,
      cost_by_provider: todayCostByProvider,
      budget_usd: DAILY_BUDGET_USD,
      budget_usage_pct: DAILY_BUDGET_USD > 0
        ? Math.round(todayTotalCost / DAILY_BUDGET_USD * 1000) / 10
        : 0,
    },
    month: {
      cost_usd: monthTotalCost,
      cost_by_provider: monthCostByProvider,
      budget_usd: MONTHLY_BUDGET_USD,
      budget_usage_pct: monthBudgetUsagePct,
    },
    stuck_reports: stuckReports,
    funnel_7d: funnelSummary,
    email_7d: {
      ...emailSummary,
      success_rate_pct: emailSuccessRate,
    },
    feedback_7d: {
      total: totalRatings,
      avg: avgRating,
      distribution: ratingDist,
      low_ratings_count: lowRatings,
    },
  })
}
