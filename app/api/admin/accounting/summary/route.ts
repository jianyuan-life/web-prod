// Admin Accounting Summary API（v5.3.3 2026-04-18）
// GET /api/admin/accounting/summary?period=30d|7d|90d|this_month|last_month|quarter|year|all
// Headers: x-admin-key
//
// 回傳：期間 P&L 總覽 + 累計 + 本月對比 + 警報狀態

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { calcPeriodPnL, resolvePeriod, PeriodKey } from '@/lib/accounting'

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

  // 期間 P&L
  const periodPnL = await calcPeriodPnL(range.start, range.end, range.label)

  // 累計總覽（全期間）
  const allTime = resolvePeriod('all')
  const allPnL = await calcPeriodPnL(allTime.start, allTime.end, allTime.label)

  // 本月 vs 上月
  const thisMonth = resolvePeriod('this_month')
  const lastMonth = resolvePeriod('last_month')
  const thisMonthPnL = await calcPeriodPnL(thisMonth.start, thisMonth.end, thisMonth.label)
  const lastMonthPnL = await calcPeriodPnL(lastMonth.start, lastMonth.end, lastMonth.label)

  // AI 預算（與既有 AI 成本監控一致）
  const aiBudget = Number(process.env.AI_BUDGET_USD_PER_MONTH) || 500
  const aiBudgetPct = aiBudget > 0 ? Math.round((thisMonthPnL.expense.ai_cost_usd / aiBudget) * 1000) / 10 : 0

  // 警報判斷
  const alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string }> = []
  if (thisMonthPnL.expense.total_usd > thisMonthPnL.revenue.total_usd && thisMonthPnL.revenue.total_usd > 0) {
    alerts.push({ level: 'critical', message: `本月支出 $${thisMonthPnL.expense.total_usd} > 收入 $${thisMonthPnL.revenue.total_usd}（虧損中）` })
  }
  if (aiBudgetPct >= 100) {
    alerts.push({ level: 'critical', message: `AI 成本超月預算：$${thisMonthPnL.expense.ai_cost_usd} / $${aiBudget}（${aiBudgetPct}%）` })
  } else if (aiBudgetPct >= 80) {
    alerts.push({ level: 'warning', message: `AI 成本接近預算上限：${aiBudgetPct}% of $${aiBudget}` })
  }
  if (thisMonthPnL.profit.net_profit_usd < 0) {
    alerts.push({ level: 'warning', message: `本月淨利為負：$${thisMonthPnL.profit.net_profit_usd}` })
  }

  // 單日異常（過去 7 天平均 vs 今日）
  const supabase = getSupabase()
  let dailyAnomaly: { today: number; avg7d: number; ratio: number } | null = null
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const sevenAgo = new Date(todayStart.getTime() - 7 * 86400000)

    const { data: recent } = await supabase
      .from('expense_log')
      .select('amount_usd, occurred_at')
      .gte('occurred_at', sevenAgo.toISOString())
      .lt('occurred_at', new Date(todayStart.getTime() + 86400000).toISOString())
      .limit(10000)

    if (recent && recent.length > 0) {
      const dayBuckets: Record<string, number> = {}
      for (const r of recent) {
        const d = (r.occurred_at || '').slice(0, 10)
        if (!d) continue
        dayBuckets[d] = (dayBuckets[d] || 0) + Number(r.amount_usd || 0)
      }
      const todayKey = todayStart.toISOString().slice(0, 10)
      const today = dayBuckets[todayKey] || 0
      const pastKeys = Object.keys(dayBuckets).filter(k => k !== todayKey)
      const avg7d = pastKeys.length > 0
        ? pastKeys.reduce((s, k) => s + (dayBuckets[k] || 0), 0) / pastKeys.length
        : 0
      const ratio = avg7d > 0 ? today / avg7d : 0
      dailyAnomaly = {
        today: Math.round(today * 10000) / 10000,
        avg7d: Math.round(avg7d * 10000) / 10000,
        ratio: Math.round(ratio * 100) / 100,
      }
      if (ratio > 3 && today > 1) {
        alerts.push({ level: 'warning', message: `今日支出 $${dailyAnomaly.today} 為過去 7 天平均 $${dailyAnomaly.avg7d} 的 ${dailyAnomaly.ratio}x` })
      }
    }
  } catch { /* noop */ }

  // 損益兩平：算平均單報告毛利 → 本月固定支出要賣幾份才回本
  const PLAN_PRICES: Record<string, number> = { C: 89, D: 39, G15: 59, R: 59, E1: 89, E2: 99 }
  const avgMarginPerPlan: Record<string, number> = {}
  for (const [code, price] of Object.entries(PLAN_PRICES)) {
    // 毛利率用 = 實收 / 原價
    const estFee = price * 0.029 + 0.3
    const margin = price - estFee
    avgMarginPerPlan[code] = Math.round(margin * 100) / 100
  }
  const thisMonthFixedCost = thisMonthPnL.expense.hosting_cost_usd + thisMonthPnL.expense.other_usd
  const breakEvenPerPlan: Record<string, number> = {}
  for (const [code, margin] of Object.entries(avgMarginPerPlan)) {
    breakEvenPerPlan[code] = margin > 0 ? Math.ceil(thisMonthFixedCost / margin) : 0
  }

  return NextResponse.json({
    period: range,
    period_pnl: periodPnL,
    all_time_pnl: allPnL,
    this_month_pnl: thisMonthPnL,
    last_month_pnl: lastMonthPnL,
    ai_budget_usd: aiBudget,
    ai_budget_pct: aiBudgetPct,
    alerts,
    daily_anomaly: dailyAnomaly,
    break_even: {
      this_month_fixed_cost_usd: Math.round(thisMonthFixedCost * 100) / 100,
      avg_margin_per_plan: avgMarginPerPlan,
      break_even_count_per_plan: breakEvenPerPlan,
    },
  })
}
