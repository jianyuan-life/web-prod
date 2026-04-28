// Admin Accounting By-Plan API（v5.3.3 2026-04-18）
// GET /api/admin/accounting/by-plan?period=30d
// Headers: x-admin-key
//
// 回傳：每個方案的收入、成本、毛利、平均成本分解

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { resolvePeriod, PeriodKey } from '@/lib/accounting'
import { PLAN_NAMES } from '@/lib/plan-names'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}


export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = (req.nextUrl.searchParams.get('period') || '30d') as PeriodKey
  const range = resolvePeriod(period)

  const supabase = getSupabase()

  // 該期間每個方案的收入
  const { data: revRows } = await supabase
    .from('revenue_log')
    .select('plan_code, amount_usd, net_revenue_usd, stripe_fee_usd, report_id')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .limit(50000)

  // 該期間每個報告的 AI 成本（expense_log 有 report_id 的）
  const { data: expRows } = await supabase
    .from('expense_log')
    .select('report_id, category, amount_usd')
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .not('report_id', 'is', null)
    .limit(50000)

  type PlanStats = {
    code: string
    name: string
    count: number
    revenue: number
    net_revenue: number
    stripe_fee: number
    ai_cost: number
    refund: number
    gross_profit: number
    avg_revenue: number
    avg_ai_cost: number
    avg_profit: number
    margin_pct: number
  }

  const reportPlan: Record<string, string> = {}
  const byPlan: Record<string, PlanStats> = {}

  function ensure(code: string): PlanStats {
    const key = (code || 'UNKNOWN').toUpperCase()
    if (!byPlan[key]) {
      byPlan[key] = {
        code: key,
        name: PLAN_NAMES[key] || key,
        count: 0, revenue: 0, net_revenue: 0, stripe_fee: 0,
        ai_cost: 0, refund: 0, gross_profit: 0,
        avg_revenue: 0, avg_ai_cost: 0, avg_profit: 0, margin_pct: 0,
      }
    }
    return byPlan[key]
  }

  for (const r of (revRows || [])) {
    const p = ensure(r.plan_code || '')
    p.count += 1
    p.revenue += Number(r.amount_usd || 0)
    p.net_revenue += Number(r.net_revenue_usd || 0)
    p.stripe_fee += Number(r.stripe_fee_usd || 0)
    if (r.report_id) reportPlan[r.report_id] = (r.plan_code || '').toUpperCase()
  }

  for (const e of (expRows || [])) {
    if (!e.report_id) continue
    const code = reportPlan[e.report_id]
    if (!code) continue
    const p = ensure(code)
    const amt = Number(e.amount_usd || 0)
    if (e.category === 'ai_cost') p.ai_cost += amt
    else if (e.category === 'refund') p.refund += amt
  }

  const round = (n: number) => Math.round(n * 10000) / 10000
  const round2 = (n: number) => Math.round(n * 100) / 100

  const result = Object.values(byPlan).map(p => {
    const gross = p.net_revenue - p.refund - p.ai_cost
    return {
      code: p.code,
      name: p.name,
      count: p.count,
      revenue: round2(p.revenue),
      net_revenue: round2(p.net_revenue),
      stripe_fee: round(p.stripe_fee),
      ai_cost: round(p.ai_cost),
      refund: round2(p.refund),
      gross_profit: round2(gross),
      avg_revenue: p.count > 0 ? round2(p.revenue / p.count) : 0,
      avg_ai_cost: p.count > 0 ? round(p.ai_cost / p.count) : 0,
      avg_profit: p.count > 0 ? round2(gross / p.count) : 0,
      margin_pct: p.revenue > 0 ? Math.round((gross / p.revenue) * 10000) / 100 : 0,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  return NextResponse.json({ period: range, by_plan: result })
}
