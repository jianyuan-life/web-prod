// Admin Accounting Monthly Snapshots API（v5.3.3 2026-04-18）
// GET  /api/admin/accounting/monthly-snapshots           列出歷史月結
// POST /api/admin/accounting/monthly-snapshots          手動觸發產出指定月份月結（body: { year_month: '2026-04' }）
// Headers: x-admin-key

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { calcPeriodPnL, monthRange } from '@/lib/accounting'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('monthly_pnl_snapshot')
    .select('*')
    .order('year_month', { ascending: false })
    .limit(36)

  if (error && !(String(error.message).includes('monthly_pnl_snapshot') || error.code === '42P01')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ snapshots: data || [] })
}

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: { year_month?: string; key?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const ym = (body.year_month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: 'year_month 格式需為 YYYY-MM' }, { status: 400 })
  }

  const { start, end } = monthRange(ym)
  const pnl = await calcPeriodPnL(start, end, ym)

  // by_plan 細節
  const supabase = getSupabase()
  const { data: revRows } = await supabase
    .from('revenue_log')
    .select('plan_code, amount_usd, net_revenue_usd')
    .gte('created_at', start)
    .lt('created_at', end)
    .limit(50000)

  const byPlan: Record<string, { count: number; revenue: number; net_revenue: number }> = {}
  for (const r of (revRows || [])) {
    const code = (r.plan_code || 'UNKNOWN').toUpperCase()
    if (!byPlan[code]) byPlan[code] = { count: 0, revenue: 0, net_revenue: 0 }
    byPlan[code].count += 1
    byPlan[code].revenue += Number(r.amount_usd || 0)
    byPlan[code].net_revenue += Number(r.net_revenue_usd || 0)
  }

  const snapshotData = {
    year_month: ym,
    total_revenue_usd: pnl.revenue.total_usd,
    net_revenue_usd: pnl.revenue.net_usd,
    stripe_fee_total_usd: pnl.revenue.stripe_fee_total_usd,
    points_discount_total_usd: pnl.revenue.points_discount_total_usd,
    coupon_discount_total_usd: pnl.revenue.coupon_discount_total_usd,
    ai_cost_usd: pnl.expense.ai_cost_usd,
    hosting_cost_usd: pnl.expense.hosting_cost_usd,
    refund_usd: pnl.expense.refund_usd,
    marketing_cost_usd: pnl.expense.marketing_cost_usd,
    other_expense_usd: pnl.expense.other_usd + pnl.expense.email_cost_usd,
    total_expense_usd: pnl.expense.total_usd,
    gross_profit_usd: pnl.profit.gross_profit_usd,
    net_profit_usd: pnl.profit.net_profit_usd,
    profit_margin_pct: pnl.profit.profit_margin_pct,
    report_count: pnl.report_count,
    refund_count: pnl.refund_count,
    avg_revenue_per_report: pnl.avg_revenue_per_report,
    avg_cost_per_report: pnl.avg_cost_per_report,
    avg_profit_per_report: pnl.avg_profit_per_report,
    by_plan: byPlan,
    is_finalized: true,
    finalized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Upsert
  const { error: upErr } = await supabase
    .from('monthly_pnl_snapshot')
    .upsert(snapshotData, { onConflict: 'year_month' })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await writeAuditLog(req, 'create', 'revenue', ym, {
    resource: 'monthly_pnl_snapshot',
    year_month: ym,
    total_revenue_usd: pnl.revenue.total_usd,
    net_profit_usd: pnl.profit.net_profit_usd,
  })

  return NextResponse.json({ success: true, snapshot: snapshotData })
}
