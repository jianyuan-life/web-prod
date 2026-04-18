// Dashboard 營收趨勢 API（L7+ BI 2026-04-17）
// GET /api/admin/dashboard/revenue?period=30d|90d|12m
// Headers: x-admin-key
//
// 回傳：
//   - 每日（或每月）堆疊營收（by 方案 C/D/G15/R/E1/E2）
//   - AOV（客戶單價）
//   - MRR（主要來自 E2 訂閱）
//   - 同比成長率（昨日 vs 前日、同期間 vs 前期間）
//   - 方案銷售排行 + E2 續訂率（M2/M3/M6/M12）

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

type Report = {
  id: string
  plan_code: string | null
  amount_usd: number | string | null
  status: string | null
  customer_email: string | null
  created_at: string | null
}

const PLAN_CODES = ['C', 'D', 'G15', 'R', 'E1', 'E2'] as const

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = req.nextUrl.searchParams.get('period') || '30d'
  let days = 30
  let granularity: 'day' | 'month' = 'day'
  if (period === '90d') { days = 90; granularity = 'day' }
  else if (period === '12m') { days = 365; granularity = 'month' }
  else if (period === '7d') { days = 7 }
  else if (period === '30d') { days = 30 }

  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000)
  const previousSince = new Date(since.getTime() - days * 24 * 3600 * 1000)

  const supabase = getSupabase()

  const [currRes, prevRes] = await Promise.all([
    supabase
      .from('paid_reports')
      .select('id, plan_code, amount_usd, status, customer_email, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('paid_reports')
      .select('id, amount_usd, status, created_at, customer_email')
      .gte('created_at', previousSince.toISOString())
      .lt('created_at', since.toISOString()),
  ])

  const reports: Report[] = (currRes.data as Report[]) || []
  const prevReports: Report[] = (prevRes.data as Report[]) || []

  // 過濾只算「有付費」的訂單
  const paying = reports.filter(r => Number(r.amount_usd) > 0)
  const prevPaying = prevReports.filter(r => Number(r.amount_usd) > 0)

  // ==== 時間序列（by day 或 month） ====
  const trendMap: Record<string, { total: number } & Record<string, number>> = {}
  for (const r of paying) {
    const day = (r.created_at || '').slice(0, 10)
    if (!day) continue
    const bucket = granularity === 'month' ? day.slice(0, 7) : day
    if (!trendMap[bucket]) {
      trendMap[bucket] = { total: 0 } as { total: number } & Record<string, number>
      for (const p of PLAN_CODES) trendMap[bucket][p] = 0
    }
    const plan = ((r.plan_code || '').split(/\s/)[0] || 'other').toUpperCase()
    const amt = Number(r.amount_usd) || 0
    trendMap[bucket].total += amt
    if (PLAN_CODES.includes(plan as typeof PLAN_CODES[number])) {
      trendMap[bucket][plan] += amt
    } else {
      trendMap[bucket]['other'] = (trendMap[bucket]['other'] || 0) + amt
    }
  }
  const trend = Object.entries(trendMap)
    .map(([bucket, v]) => ({
      bucket,
      total: Math.round(v.total * 100) / 100,
      C: Math.round((v['C'] || 0) * 100) / 100,
      D: Math.round((v['D'] || 0) * 100) / 100,
      G15: Math.round((v['G15'] || 0) * 100) / 100,
      R: Math.round((v['R'] || 0) * 100) / 100,
      E1: Math.round((v['E1'] || 0) * 100) / 100,
      E2: Math.round((v['E2'] || 0) * 100) / 100,
      other: Math.round((v['other'] || 0) * 100) / 100,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))

  // ==== 方案銷售排行 ====
  const planStats: Record<string, { count: number; revenue: number; unique_customers: Set<string> }> = {}
  for (const r of paying) {
    const plan = ((r.plan_code || '').split(/\s/)[0] || 'other').toUpperCase()
    if (!planStats[plan]) planStats[plan] = { count: 0, revenue: 0, unique_customers: new Set() }
    planStats[plan].count++
    planStats[plan].revenue += Number(r.amount_usd) || 0
    if (r.customer_email) planStats[plan].unique_customers.add(r.customer_email.toLowerCase())
  }
  const planRanking = Object.entries(planStats).map(([plan, s]) => ({
    plan,
    orders: s.count,
    revenue_usd: Math.round(s.revenue * 100) / 100,
    unique_customers: s.unique_customers.size,
    aov: s.count > 0 ? Math.round((s.revenue / s.count) * 100) / 100 : 0,
  })).sort((a, b) => b.revenue_usd - a.revenue_usd)

  // ==== AOV（整體） ====
  const totalRevenue = paying.reduce((s, r) => s + Number(r.amount_usd), 0)
  const aov = paying.length > 0 ? Math.round((totalRevenue / paying.length) * 100) / 100 : 0

  // ==== 成長率（vs 前期間） ====
  const prevRevenue = prevPaying.reduce((s, r) => s + Number(r.amount_usd), 0)
  const growthPct = prevRevenue > 0
    ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10
    : null

  // ==== E2 續訂率（月度出門訣 — 以 email 為單位計算 M2/M3/M6/M12） ====
  // 邏輯：抓出所有 E2 訂單，按 email group，計算同一 email 跨月購買次數
  const { data: allE2 } = await supabase
    .from('paid_reports')
    .select('customer_email, created_at, amount_usd, status')
    .ilike('plan_code', 'E2%')
    .gt('amount_usd', 0)
    .order('created_at', { ascending: true })

  const e2ByEmail: Record<string, string[]> = {}
  for (const r of (allE2 || [])) {
    const email = (r.customer_email || '').toLowerCase()
    const ts = r.created_at || ''
    if (!email || !ts) continue
    if (!e2ByEmail[email]) e2ByEmail[email] = []
    e2ByEmail[email].push(ts)
  }
  const e2Cohort = {
    first_purchase_users: Object.keys(e2ByEmail).length,
    m2_retention_users: 0,
    m3_retention_users: 0,
    m6_retention_users: 0,
    m12_retention_users: 0,
  }
  for (const dates of Object.values(e2ByEmail)) {
    if (dates.length < 1) continue
    const first = new Date(dates[0]).getTime()
    const hasAfter = (months: number) => dates.some(d => {
      const diff = new Date(d).getTime() - first
      const neededMs = months * 28 * 24 * 3600 * 1000  // 以 28 天當 1 月，寬鬆判定
      return diff >= neededMs
    })
    if (hasAfter(1)) e2Cohort.m2_retention_users++
    if (hasAfter(2)) e2Cohort.m3_retention_users++
    if (hasAfter(5)) e2Cohort.m6_retention_users++
    if (hasAfter(11)) e2Cohort.m12_retention_users++
  }

  // ==== MRR 估算（最近 30 天內 E2 新訂+續訂總收入，當作月訂閱貢獻） ====
  const last30Start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const mrrCandidates = (allE2 || []).filter(r => {
    return r.created_at && new Date(r.created_at) >= last30Start && Number(r.amount_usd) > 0 && r.status !== 'refunded'
  })
  const mrr = mrrCandidates.reduce((s, r) => s + Number(r.amount_usd), 0)

  return NextResponse.json({
    period,
    granularity,
    since: since.toISOString(),
    total_revenue_usd: Math.round(totalRevenue * 100) / 100,
    previous_total_revenue_usd: Math.round(prevRevenue * 100) / 100,
    growth_pct: growthPct,
    aov,
    mrr_usd: Math.round(mrr * 100) / 100,
    trend,
    plan_ranking: planRanking,
    e2_cohort: e2Cohort,
  })
}
