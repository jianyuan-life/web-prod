// 鑑源完整會計系統 lib（v5.3.3 2026-04-18）
//
// 用途：
//   1. revenue_log 寫入（Stripe webhook 付款成功時）
//   2. expense_log 寫入（退款、手動記錄、固定月費 cron）
//   3. Stripe 手續費計算
//   4. 期間 P&L 計算
//
// 關鍵公式：
//   Stripe 手續費 = amount * 2.9% + $0.30
//   毛利 = 實收 - 退款
//   淨利 = 毛利 - AI - Hosting - Marketing - Other

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Types
// ============================================================

export type ExpenseCategory =
  | 'ai_cost'
  | 'hosting_monthly'
  | 'api_setup'
  | 'domain'
  | 'refund'
  | 'marketing'
  | 'email'
  | 'other'

export type ExpenseSource = 'auto' | 'manual' | 'refund_api' | 'webhook' | 'cron' | 'backfill'

export type RevenueLogInput = {
  reportId?: string | null
  planCode: string
  amountUsd: number
  stripeSessionId?: string | null
  pointsDiscountUsd?: number
  couponDiscountUsd?: number
  customerEmail?: string | null
  currency?: string
  metadata?: Record<string, unknown>
}

export type ExpenseLogInput = {
  category: ExpenseCategory
  subcategory?: string | null
  reportId?: string | null
  amountUsd: number
  description?: string | null
  source?: ExpenseSource
  createdBy?: string | null
  occurredAt?: string | Date | null
  metadata?: Record<string, unknown>
}

export type PnLSummary = {
  period: { start: string; end: string; label: string }
  revenue: {
    total_usd: number
    net_usd: number                // 扣 Stripe fee 後實收
    stripe_fee_total_usd: number
    points_discount_total_usd: number
    coupon_discount_total_usd: number
    count: number
  }
  expense: {
    total_usd: number
    ai_cost_usd: number
    hosting_cost_usd: number
    refund_usd: number
    marketing_cost_usd: number
    email_cost_usd: number
    other_usd: number
  }
  profit: {
    gross_profit_usd: number       // net_revenue - refund
    net_profit_usd: number         // gross - ai - hosting - marketing - other
    profit_margin_pct: number      // net / total_revenue * 100
  }
  report_count: number
  refund_count: number
  avg_revenue_per_report: number
  avg_cost_per_report: number      // 總支出 / 報告數
  avg_profit_per_report: number
}

// ============================================================
// Stripe 手續費
// ============================================================

/**
 * Stripe 標準費率：2.9% + $0.30（美國卡，海外卡更高）
 * 我們用最保守的國際 3.5% + $0.30（覆蓋大多數情況）
 * 可透過 env var STRIPE_FEE_PCT 和 STRIPE_FEE_FIXED 調整
 */
export function calcStripeFee(amountUsd: number): number {
  if (!amountUsd || amountUsd <= 0) return 0
  const pct = Number(process.env.STRIPE_FEE_PCT) || 0.029
  const fixed = Number(process.env.STRIPE_FEE_FIXED) || 0.3
  const fee = amountUsd * pct + fixed
  return Math.round(fee * 10000) / 10000
}

// ============================================================
// Supabase helpers
// ============================================================

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

// ============================================================
// Revenue log 寫入
// ============================================================

/**
 * 記錄一筆收入（Stripe webhook 付款成功時呼叫）
 * 失敗不拋錯（業務流程優先），只 console.error
 */
export async function recordRevenue(input: RevenueLogInput): Promise<void> {
  try {
    const supabase = getSupabase()
    if (!supabase) return

    const amount = Math.max(0, Number(input.amountUsd) || 0)
    const stripeFee = calcStripeFee(amount)

    await supabase.from('revenue_log').insert({
      report_id: input.reportId || null,
      plan_code: input.planCode,
      amount_usd: amount,
      stripe_session_id: input.stripeSessionId || null,
      stripe_fee_usd: stripeFee,
      points_discount_usd: Math.max(0, Number(input.pointsDiscountUsd) || 0),
      coupon_discount_usd: Math.max(0, Number(input.couponDiscountUsd) || 0),
      customer_email: input.customerEmail || null,
      currency: input.currency || 'usd',
      metadata: input.metadata || {},
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[accounting] recordRevenue failed:', err)
  }
}

// ============================================================
// Expense log 寫入
// ============================================================

/**
 * 記錄一筆支出
 * 失敗不拋錯，只 console.error
 */
export async function recordExpense(input: ExpenseLogInput): Promise<void> {
  try {
    const supabase = getSupabase()
    if (!supabase) return

    const amount = Math.max(0, Number(input.amountUsd) || 0)
    const occurredAt = input.occurredAt
      ? (input.occurredAt instanceof Date
          ? input.occurredAt.toISOString()
          : String(input.occurredAt))
      : new Date().toISOString()

    await supabase.from('expense_log').insert({
      category: input.category,
      subcategory: input.subcategory || null,
      report_id: input.reportId || null,
      amount_usd: amount,
      description: input.description || null,
      source: input.source || 'manual',
      created_by: input.createdBy || null,
      occurred_at: occurredAt,
      metadata: input.metadata || {},
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[accounting] recordExpense failed:', err)
  }
}

// ============================================================
// 期間 P&L 計算
// ============================================================

type RevenueRow = {
  amount_usd: number | string | null
  net_revenue_usd: number | string | null
  stripe_fee_usd: number | string | null
  points_discount_usd: number | string | null
  coupon_discount_usd: number | string | null
  plan_code: string | null
}

type ExpenseRow = {
  category: string
  amount_usd: number | string | null
  occurred_at: string | null
}

function toNum(v: unknown): number {
  return Number(v || 0) || 0
}

/**
 * 計算任意期間 P&L
 * @param startISO 開始日期 ISO
 * @param endISO 結束日期 ISO（不含）
 * @param label 期間標籤（顯示用）
 */
export async function calcPeriodPnL(
  startISO: string,
  endISO: string,
  label: string,
): Promise<PnLSummary> {
  const empty: PnLSummary = {
    period: { start: startISO, end: endISO, label },
    revenue: { total_usd: 0, net_usd: 0, stripe_fee_total_usd: 0, points_discount_total_usd: 0, coupon_discount_total_usd: 0, count: 0 },
    expense: { total_usd: 0, ai_cost_usd: 0, hosting_cost_usd: 0, refund_usd: 0, marketing_cost_usd: 0, email_cost_usd: 0, other_usd: 0 },
    profit: { gross_profit_usd: 0, net_profit_usd: 0, profit_margin_pct: 0 },
    report_count: 0, refund_count: 0,
    avg_revenue_per_report: 0, avg_cost_per_report: 0, avg_profit_per_report: 0,
  }

  const supabase = getSupabase()
  if (!supabase) return empty

  // Revenue
  const { data: revRows, error: revErr } = await supabase
    .from('revenue_log')
    .select('amount_usd, net_revenue_usd, stripe_fee_usd, points_discount_usd, coupon_discount_usd, plan_code')
    .gte('created_at', startISO)
    .lt('created_at', endISO)
    .limit(50000)

  // Expense
  const { data: expRows, error: expErr } = await supabase
    .from('expense_log')
    .select('category, amount_usd, occurred_at')
    .gte('occurred_at', startISO)
    .lt('occurred_at', endISO)
    .limit(50000)

  // Tables may not exist yet
  if (revErr && (String(revErr.message).includes('revenue_log') || revErr.code === '42P01')) return empty
  if (expErr && (String(expErr.message).includes('expense_log') || expErr.code === '42P01')) return empty

  const revenues = (revRows as RevenueRow[]) || []
  const expenses = (expRows as ExpenseRow[]) || []

  const totalRevenue = revenues.reduce((s, r) => s + toNum(r.amount_usd), 0)
  const netRevenue = revenues.reduce((s, r) => s + toNum(r.net_revenue_usd), 0)
  const stripeFeeTotal = revenues.reduce((s, r) => s + toNum(r.stripe_fee_usd), 0)
  const pointsDiscountTotal = revenues.reduce((s, r) => s + toNum(r.points_discount_usd), 0)
  const couponDiscountTotal = revenues.reduce((s, r) => s + toNum(r.coupon_discount_usd), 0)

  const expByCategory: Record<string, number> = {}
  let totalExpense = 0
  let refundCount = 0
  for (const e of expenses) {
    const amt = toNum(e.amount_usd)
    expByCategory[e.category] = (expByCategory[e.category] || 0) + amt
    totalExpense += amt
    if (e.category === 'refund') refundCount += 1
  }

  const aiCost = expByCategory['ai_cost'] || 0
  const hostingCost = expByCategory['hosting_monthly'] || 0
  const refundCost = expByCategory['refund'] || 0
  const marketingCost = expByCategory['marketing'] || 0
  const emailCost = expByCategory['email'] || 0
  const otherCost = (expByCategory['api_setup'] || 0) + (expByCategory['domain'] || 0) + (expByCategory['other'] || 0)

  const grossProfit = netRevenue - refundCost
  const netProfit = grossProfit - aiCost - hostingCost - marketingCost - emailCost - otherCost
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const reportCount = revenues.length
  const round2 = (n: number) => Math.round(n * 100) / 100
  const round4 = (n: number) => Math.round(n * 10000) / 10000

  return {
    period: { start: startISO, end: endISO, label },
    revenue: {
      total_usd: round2(totalRevenue),
      net_usd: round2(netRevenue),
      stripe_fee_total_usd: round2(stripeFeeTotal),
      points_discount_total_usd: round2(pointsDiscountTotal),
      coupon_discount_total_usd: round2(couponDiscountTotal),
      count: reportCount,
    },
    expense: {
      total_usd: round4(totalExpense),
      ai_cost_usd: round4(aiCost),
      hosting_cost_usd: round2(hostingCost),
      refund_usd: round2(refundCost),
      marketing_cost_usd: round2(marketingCost),
      email_cost_usd: round4(emailCost),
      other_usd: round2(otherCost),
    },
    profit: {
      gross_profit_usd: round2(grossProfit),
      net_profit_usd: round2(netProfit),
      profit_margin_pct: Math.round(marginPct * 100) / 100,
    },
    report_count: reportCount,
    refund_count: refundCount,
    avg_revenue_per_report: reportCount > 0 ? round2(totalRevenue / reportCount) : 0,
    avg_cost_per_report: reportCount > 0 ? round4(totalExpense / reportCount) : 0,
    avg_profit_per_report: reportCount > 0 ? round2(netProfit / reportCount) : 0,
  }
}

// ============================================================
// 期間輔助
// ============================================================

export type PeriodKey = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'quarter' | 'year' | 'all'

/**
 * 解析期間為 [start, end)（end 不含）
 */
export function resolvePeriod(period: PeriodKey | string): { start: string; end: string; label: string } {
  const now = new Date()
  const endISO = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  switch (period) {
    case '7d':
      return { start: new Date(now.getTime() - 7 * 86400000).toISOString(), end: endISO, label: '過去 7 天' }
    case '30d':
      return { start: new Date(now.getTime() - 30 * 86400000).toISOString(), end: endISO, label: '過去 30 天' }
    case '90d':
      return { start: new Date(now.getTime() - 90 * 86400000).toISOString(), end: endISO, label: '過去 90 天' }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      return { start, end: endISO, label: '本月' }
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const end = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      return { start, end, label: '上個月' }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1).toISOString()
      return { start, end: endISO, label: '本季' }
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1).toISOString()
      return { start, end: endISO, label: '本年度' }
    }
    case 'all':
    default:
      return { start: '2020-01-01T00:00:00.000Z', end: endISO, label: '全期間' }
  }
}

/**
 * 從 year_month '2026-04' 回推 [start, end)
 */
export function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = new Date(y, m - 1, 1).toISOString()
  const end = new Date(y, m, 1).toISOString()
  return { start, end }
}
