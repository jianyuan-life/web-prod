// Admin Accounting By-Expense-Category API（v5.3.3 2026-04-18）
// GET /api/admin/accounting/by-expense-category?period=30d
// Headers: x-admin-key
//
// 回傳：支出按大類 + 小類分解（含最新 10 筆明細）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { resolvePeriod, PeriodKey } from '@/lib/accounting'

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

  const { data: rows, error } = await supabase
    .from('expense_log')
    .select('id, category, subcategory, amount_usd, description, source, occurred_at, report_id')
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .order('occurred_at', { ascending: false })
    .limit(10000)

  if (error && !(String(error.message).includes('expense_log') || error.code === '42P01')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expenses = rows || []

  type CategoryBucket = { category: string; subcategory_breakdown: Record<string, number>; total: number; count: number }
  const byCat: Record<string, CategoryBucket> = {}

  for (const e of expenses) {
    const cat = e.category || 'other'
    if (!byCat[cat]) byCat[cat] = { category: cat, subcategory_breakdown: {}, total: 0, count: 0 }
    const amt = Number(e.amount_usd || 0)
    byCat[cat].total += amt
    byCat[cat].count += 1
    const sub = e.subcategory || 'other'
    byCat[cat].subcategory_breakdown[sub] = (byCat[cat].subcategory_breakdown[sub] || 0) + amt
  }

  const round = (n: number) => Math.round(n * 10000) / 10000
  const categories = Object.values(byCat).map(c => ({
    category: c.category,
    total_usd: round(c.total),
    count: c.count,
    subcategories: Object.entries(c.subcategory_breakdown)
      .map(([k, v]) => ({ name: k, amount_usd: round(v) }))
      .sort((a, b) => b.amount_usd - a.amount_usd),
  })).sort((a, b) => b.total_usd - a.total_usd)

  // 最近支出明細
  const recent = expenses.slice(0, 50).map(e => ({
    id: e.id,
    category: e.category,
    subcategory: e.subcategory,
    amount_usd: round(Number(e.amount_usd || 0)),
    description: e.description,
    source: e.source,
    report_id: e.report_id,
    occurred_at: e.occurred_at,
  }))

  return NextResponse.json({
    period: range,
    categories,
    total_expense_usd: round(expenses.reduce((s, e) => s + Number(e.amount_usd || 0), 0)),
    recent_entries: recent,
  })
}
