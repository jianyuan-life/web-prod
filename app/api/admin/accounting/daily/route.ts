// Admin Accounting Daily API（v5.3.3 2026-04-18）
// GET /api/admin/accounting/daily?period=30d
// Headers: x-admin-key
//
// 回傳：每日收入 vs 支出 vs 淨利 時序

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { resolvePeriod, PeriodKey } from '@/lib/accounting'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = (req.nextUrl.searchParams.get('period') || '30d') as PeriodKey
  const range = resolvePeriod(period)

  const supabase = getSupabase()

  // Revenue
  const { data: revRows, error: revErr } = await supabase
    .from('revenue_log')
    .select('amount_usd, net_revenue_usd, stripe_fee_usd, created_at')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .limit(50000)

  // Expense
  const { data: expRows, error: expErr } = await supabase
    .from('expense_log')
    .select('category, amount_usd, occurred_at')
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .limit(50000)

  if (revErr && !(String(revErr.message).includes('revenue_log') || revErr.code === '42P01')) {
    return NextResponse.json({ error: revErr.message }, { status: 500 })
  }
  if (expErr && !(String(expErr.message).includes('expense_log') || expErr.code === '42P01')) {
    return NextResponse.json({ error: expErr.message }, { status: 500 })
  }

  type DailyBucket = {
    date: string
    revenue: number
    net_revenue: number
    stripe_fee: number
    ai_cost: number
    hosting: number
    refund: number
    marketing: number
    email: number
    other: number
    total_expense: number
    net_profit: number
    report_count: number
  }

  const buckets: Record<string, DailyBucket> = {}

  function ensure(date: string): DailyBucket {
    if (!buckets[date]) {
      buckets[date] = {
        date,
        revenue: 0, net_revenue: 0, stripe_fee: 0,
        ai_cost: 0, hosting: 0, refund: 0, marketing: 0, email: 0, other: 0,
        total_expense: 0, net_profit: 0, report_count: 0,
      }
    }
    return buckets[date]
  }

  for (const r of (revRows || [])) {
    const d = (r.created_at || '').slice(0, 10)
    if (!d) continue
    const b = ensure(d)
    b.revenue += Number(r.amount_usd || 0)
    b.net_revenue += Number(r.net_revenue_usd || 0)
    b.stripe_fee += Number(r.stripe_fee_usd || 0)
    b.report_count += 1
  }

  for (const e of (expRows || [])) {
    const d = (e.occurred_at || '').slice(0, 10)
    if (!d) continue
    const b = ensure(d)
    const amt = Number(e.amount_usd || 0)
    b.total_expense += amt
    switch (e.category) {
      case 'ai_cost': b.ai_cost += amt; break
      case 'hosting_monthly': b.hosting += amt; break
      case 'refund': b.refund += amt; break
      case 'marketing': b.marketing += amt; break
      case 'email': b.email += amt; break
      default: b.other += amt; break
    }
  }

  const round = (n: number) => Math.round(n * 10000) / 10000
  const daily = Object.values(buckets)
    .map(b => ({
      ...b,
      revenue: round(b.revenue),
      net_revenue: round(b.net_revenue),
      stripe_fee: round(b.stripe_fee),
      ai_cost: round(b.ai_cost),
      hosting: round(b.hosting),
      refund: round(b.refund),
      marketing: round(b.marketing),
      email: round(b.email),
      other: round(b.other),
      total_expense: round(b.total_expense),
      // 日淨利 = 當日實收 - 當日退款 - 當日 AI - 當日 Hosting - 當日 Marketing - 當日其他
      net_profit: round(b.net_revenue - b.refund - b.ai_cost - b.hosting - b.marketing - b.email - b.other),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({ period: range, daily })
}
