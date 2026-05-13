// Unit Economics API (v5.3.5 2026-04-18)
//
// GET /api/admin/accounting/unit-economics?period=30d|90d|all
// Headers: x-admin-key
//
// 用途：戰略層 BI。每份報告的：
//   - 售價 vs 實際 AI 成本 vs Stripe 手續費 vs 毛利
//   - 按方案分組貢獻排行
//   - 異常清單（成本超售價 30%、retry 率過高）
//   - 自動戰略建議（CAC 上限、值得加廣告的方案）
//
// 資料來源：paid_reports JOIN ai_cost_log + revenue_log
//           不虛構，樣本太少時在 response 標註 samples_too_few

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { resolvePeriod, PeriodKey, calcStripeFee } from '@/lib/accounting'
import { PLAN_NAMES } from '@/lib/plan-names'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

type ReportRow = {
  id: string
  client_name: string | null
  plan_code: string | null
  amount_usd: number | string | null
  stripe_session_id: string | null
  status: string | null
  created_at: string | null
}

type CostRow = {
  report_id: string | null
  call_stage: string | null
  cost_usd: number | string | null
  model: string | null
  provider: string | null
}

type RevenueRow = {
  stripe_session_id: string | null
  stripe_fee_usd: number | string | null
  amount_usd: number | string | null
}

const PLAN_PRICES: Record<string, number> = { C: 89, D: 39, G15: 59, R: 59, E1: 89, E2: 99 }

function marginColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 80) return 'green'
  if (pct >= 60) return 'yellow'
  return 'red'
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = (req.nextUrl.searchParams.get('period') || '30d') as PeriodKey
  const range = resolvePeriod(period)
  const supabase = getSupabase()

  // 1. 抓期間內的已完成報告
  // v5.10.287:soft delete filter — accounting 不算軟刪、對齊 v_revenue_metrics
  const { data: reportsData, error: repErr } = await supabase
    .from('paid_reports')
    .select('id, client_name, plan_code, amount_usd, stripe_session_id, status, created_at')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .is('deleted_at', null)
    .limit(10000)

  if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 })
  const reports = (reportsData as ReportRow[]) || []

  if (reports.length === 0) {
    return NextResponse.json({
      period: range,
      samples_too_few: true,
      note: `期間內無報告記錄（${range.label}）`,
      plans: [],
      strategy: null,
      anomalies: [],
      suggestions: [],
    })
  }

  const reportIds = reports.map(r => r.id).filter(Boolean)
  const stripeSessionIds = reports.map(r => r.stripe_session_id).filter((s): s is string => !!s)

  // 2. 抓這些報告的 AI 成本
  const { data: costsData } = reportIds.length > 0
    ? await supabase
        .from('ai_cost_log')
        .select('report_id, call_stage, cost_usd, model, provider')
        .in('report_id', reportIds)
        .limit(50000)
    : { data: [] }
  const costs = (costsData as CostRow[]) || []

  // 3. 抓 Stripe fee
  const { data: revData } = stripeSessionIds.length > 0
    ? await supabase
        .from('revenue_log')
        .select('stripe_session_id, stripe_fee_usd, amount_usd')
        .in('stripe_session_id', stripeSessionIds)
        .limit(10000)
    : { data: [] }
  const revenues = (revData as RevenueRow[]) || []

  const revBySession = new Map<string, RevenueRow>()
  for (const r of revenues) {
    if (r.stripe_session_id) revBySession.set(r.stripe_session_id, r)
  }

  // 4. 每份報告的成本聚合
  const costByReport = new Map<string, { total: number; by_stage: Record<string, number>; by_model: Record<string, number> }>()
  for (const c of costs) {
    if (!c.report_id) continue
    if (!costByReport.has(c.report_id)) {
      costByReport.set(c.report_id, { total: 0, by_stage: {}, by_model: {} })
    }
    const bucket = costByReport.get(c.report_id)!
    const amt = Number(c.cost_usd || 0)
    bucket.total += amt
    const stage = c.call_stage || 'unknown'
    bucket.by_stage[stage] = (bucket.by_stage[stage] || 0) + amt
    const model = c.model || 'unknown'
    bucket.by_model[model] = (bucket.by_model[model] || 0) + amt
  }

  // 5. 方案維度聚合
  type PlanAgg = {
    plan_code: string
    name: string
    price: number
    sold_count: number
    completed_count: number
    total_revenue: number
    total_cost: number
    total_stripe_fee: number
    contribution: number       // 毛利總和
    per_report_costs: number[] // 每份成本（算平均/中位用）
    anomaly_count: number      // 毛利率 < 50% 的報告
  }
  const planAgg = new Map<string, PlanAgg>()

  type ReportDetail = {
    id: string
    client_name: string
    plan_code: string
    created_at: string
    price: number
    ai_cost: number
    stripe_fee: number
    gross_margin: number
    margin_pct: number
    status: string
    cost_by_stage: Record<string, number>
    cost_by_model: Record<string, number>
  }
  const details: ReportDetail[] = []

  for (const r of reports) {
    const plan = r.plan_code || 'UNKNOWN'
    const price = Number(r.amount_usd || 0)
    const costBucket = costByReport.get(r.id) || { total: 0, by_stage: {}, by_model: {} }
    const aiCost = costBucket.total

    // Stripe fee：優先 revenue_log，否則估算
    const rev = r.stripe_session_id ? revBySession.get(r.stripe_session_id) : null
    const stripeFee = rev?.stripe_fee_usd !== undefined
      ? Number(rev.stripe_fee_usd || 0)
      : calcStripeFee(price)

    const margin = price - aiCost - stripeFee
    const marginPct = price > 0 ? (margin / price) : 0

    if (!planAgg.has(plan)) {
      planAgg.set(plan, {
        plan_code: plan,
        name: PLAN_NAMES[plan] || plan,
        price: PLAN_PRICES[plan] || price,
        sold_count: 0,
        completed_count: 0,
        total_revenue: 0,
        total_cost: 0,
        total_stripe_fee: 0,
        contribution: 0,
        per_report_costs: [],
        anomaly_count: 0,
      })
    }
    const agg = planAgg.get(plan)!
    agg.sold_count += 1
    if (r.status === 'completed') agg.completed_count += 1
    agg.total_revenue += price
    agg.total_cost += aiCost
    agg.total_stripe_fee += stripeFee
    agg.contribution += margin
    agg.per_report_costs.push(aiCost)
    if (marginPct < 0.5 && price > 0) agg.anomaly_count += 1

    details.push({
      id: r.id,
      client_name: r.client_name || '',
      plan_code: plan,
      created_at: r.created_at || '',
      price: Math.round(price * 100) / 100,
      ai_cost: Math.round(aiCost * 10000) / 10000,
      stripe_fee: Math.round(stripeFee * 10000) / 10000,
      gross_margin: Math.round(margin * 10000) / 10000,
      margin_pct: Math.round(marginPct * 10000) / 100,
      status: r.status || 'unknown',
      cost_by_stage: Object.fromEntries(
        Object.entries(costBucket.by_stage).map(([k, v]) => [k, Math.round(v * 10000) / 10000]),
      ),
      cost_by_model: Object.fromEntries(
        Object.entries(costBucket.by_model).map(([k, v]) => [k, Math.round(v * 10000) / 10000]),
      ),
    })
  }

  // 方案結果
  const plans = Array.from(planAgg.values())
    .map(a => {
      const avgCost = a.sold_count > 0 ? a.total_cost / a.sold_count : 0
      const avgMargin = a.sold_count > 0 ? a.contribution / a.sold_count : 0
      const marginRate = a.total_revenue > 0 ? a.contribution / a.total_revenue : 0
      return {
        plan_code: a.plan_code,
        name: a.name,
        price: a.price,
        sold_count: a.sold_count,
        completed_count: a.completed_count,
        total_revenue: Math.round(a.total_revenue * 100) / 100,
        total_cost: Math.round(a.total_cost * 10000) / 10000,
        total_stripe_fee: Math.round(a.total_stripe_fee * 10000) / 10000,
        contribution: Math.round(a.contribution * 100) / 100,
        avg_cost: Math.round(avgCost * 10000) / 10000,
        avg_margin: Math.round(avgMargin * 100) / 100,
        margin_rate: Math.round(marginRate * 10000) / 100,     // 百分比
        color: marginColor(marginRate * 100),
        anomaly_count: a.anomaly_count,
      }
    })
    .sort((a, b) => b.contribution - a.contribution)

  // 戰略 KPI
  const totalSold = plans.reduce((s, p) => s + p.sold_count, 0)
  const totalContribution = plans.reduce((s, p) => s + p.contribution, 0)
  const avgMarginUsd = totalSold > 0 ? totalContribution / totalSold : 0
  const bestPlan = plans.length > 0 ? plans.reduce((best, p) => (p.margin_rate > best.margin_rate ? p : best), plans[0]) : null
  const worstPlan = plans.length > 0 ? plans.reduce((worst, p) => (p.margin_rate < worst.margin_rate ? p : worst), plans[0]) : null

  // CAC 上限：80% of avg margin
  const cacCeiling = Math.round(avgMarginUsd * 0.8 * 100) / 100

  const strategy = {
    total_sold: totalSold,
    total_contribution_usd: Math.round(totalContribution * 100) / 100,
    avg_margin_usd: Math.round(avgMarginUsd * 100) / 100,
    best_plan: bestPlan ? { code: bestPlan.plan_code, name: bestPlan.name, margin_rate: bestPlan.margin_rate } : null,
    worst_plan: worstPlan ? { code: worstPlan.plan_code, name: worstPlan.name, margin_rate: worstPlan.margin_rate } : null,
    cac_ceiling_usd: cacCeiling,
  }

  // 異常清單
  const anomalies = details
    .filter(d => d.margin_pct < 50 && d.price > 0)
    .sort((a, b) => a.margin_pct - b.margin_pct)
    .slice(0, 30)
    .map(d => ({
      report_id: d.id,
      client_name: d.client_name,
      plan_code: d.plan_code,
      price: d.price,
      ai_cost: d.ai_cost,
      margin_pct: d.margin_pct,
      message: `${d.plan_code} 毛利率 ${d.margin_pct.toFixed(1)}%（$${d.price} 售價、$${d.ai_cost.toFixed(2)} AI 成本）`,
    }))

  // 自動戰略建議（規則型，不用 AI）
  const suggestions: string[] = []
  for (const p of plans) {
    if (p.sold_count < 3) {
      suggestions.push(`${p.name}(${p.plan_code}) 樣本僅 ${p.sold_count} 份，建議先累積數據再下結論`)
      continue
    }
    if (p.margin_rate >= 85) {
      suggestions.push(`${p.name}(${p.plan_code}) 毛利率 ${p.margin_rate.toFixed(1)}% 很優秀，可加大行銷投放（CAC ≤ $${(p.avg_margin * 0.8).toFixed(1)} 都划算）`)
    } else if (p.margin_rate < 70) {
      suggestions.push(`${p.name}(${p.plan_code}) 毛利率僅 ${p.margin_rate.toFixed(1)}%，建議檢查 AI prompt 是否過長或調整售價`)
    }
    if (p.anomaly_count > 0) {
      suggestions.push(`${p.name}(${p.plan_code}) 有 ${p.anomaly_count} 份毛利率 < 50%，建議查單份成本明細找異常`)
    }
  }

  const samplesTooFew = totalSold < 10
  if (samplesTooFew) {
    suggestions.unshift(`樣本總數 ${totalSold} 份，可信度低，建議累積到 10+ 份再做戰略決策`)
  }

  return NextResponse.json({
    period: range,
    samples_too_few: samplesTooFew,
    total_samples: totalSold,
    plans,
    strategy,
    anomalies,
    suggestions,
    details: details.slice(0, 200),  // 前 200 份供前端 table 顯示
  })
}
