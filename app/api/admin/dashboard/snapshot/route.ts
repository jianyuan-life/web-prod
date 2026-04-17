// Dashboard 今日快照 API（L7+ BI 2026-04-17）
// GET /api/admin/dashboard/snapshot
// Headers: x-admin-key
//
// 回傳：
//   - 今日新訂單 / 今日營收（USD / TWD）
//   - 今日生成成功 / 失敗報告
//   - 今日活躍用戶數（DAU）
//   - 今日免費工具使用
//   - vs 昨天的差值（比較）

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

// 簡易 USD → TWD 匯率（用於報表顯示，非 Stripe 扣款）
const USD_TO_TWD = 31.5

function todayWindow() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 3600 * 1000)
  return {
    startOfToday: startOfToday.toISOString(),
    startOfYesterday: startOfYesterday.toISOString(),
  }
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const { startOfToday, startOfYesterday } = todayWindow()

  // ==== 並行查詢 ====
  const [
    todayReportsRes,
    yesterdayReportsRes,
    todayVisitorsRes,
    yesterdayVisitorsRes,
    todayFreeToolRes,
  ] = await Promise.all([
    supabase
      .from('paid_reports')
      .select('id, plan_code, amount_usd, status, customer_email, created_at')
      .gte('created_at', startOfToday),
    supabase
      .from('paid_reports')
      .select('id, amount_usd, status, customer_email')
      .gte('created_at', startOfYesterday)
      .lt('created_at', startOfToday),
    supabase
      .from('visitor_events')
      .select('session_id, user_agent')
      .gte('created_at', startOfToday),
    supabase
      .from('visitor_events')
      .select('session_id, user_agent')
      .gte('created_at', startOfYesterday)
      .lt('created_at', startOfToday),
    supabase
      .from('free_tool_usage')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfToday),
  ])

  const BOT_PATTERNS = ['HeadlessChrome', 'vercel-screenshot', 'bot', 'crawler', 'spider', 'Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider', 'YandexBot', 'facebookexternalhit', 'Twitterbot']
  const isBot = (ua: string) => BOT_PATTERNS.some(p => ua.toLowerCase().includes(p.toLowerCase()))

  const todayReports = todayReportsRes.data || []
  const yesterdayReports = yesterdayReportsRes.data || []

  const todayRevenue = todayReports.filter(r => parseFloat(r.amount_usd) > 0).reduce((s, r) => s + parseFloat(r.amount_usd), 0)
  const yesterdayRevenue = yesterdayReports.filter(r => parseFloat(r.amount_usd) > 0).reduce((s, r) => s + parseFloat(r.amount_usd), 0)

  const todayOrders = todayReports.length
  const yesterdayOrders = yesterdayReports.length

  const todayCompleted = todayReports.filter(r => r.status === 'completed').length
  const todayFailed = todayReports.filter(r => r.status === 'failed').length
  const todayGenerating = todayReports.filter(r => r.status === 'generating' || r.status === 'pending').length

  // DAU（去重 session_id + 排除 bot）
  const todayDauSessions = new Set(
    (todayVisitorsRes.data || [])
      .filter(v => !isBot(v.user_agent || ''))
      .map(v => v.session_id)
  )
  const yesterdayDauSessions = new Set(
    (yesterdayVisitorsRes.data || [])
      .filter(v => !isBot(v.user_agent || ''))
      .map(v => v.session_id)
  )
  const todayDau = todayDauSessions.size
  const yesterdayDau = yesterdayDauSessions.size

  // 活躍付費用戶（今日下單的獨立 email）
  const todayUniqueCustomers = new Set(todayReports.map(r => (r.customer_email || '').toLowerCase())).size
  const yesterdayUniqueCustomers = new Set(yesterdayReports.map(r => (r.customer_email || '').toLowerCase())).size

  const deltaPct = (today: number, yesterday: number): number | null => {
    if (yesterday === 0) return today === 0 ? 0 : null
    return Math.round(((today - yesterday) / yesterday) * 1000) / 10
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    today: {
      orders: todayOrders,
      orders_delta_pct: deltaPct(todayOrders, yesterdayOrders),
      revenue_usd: Math.round(todayRevenue * 100) / 100,
      revenue_twd: Math.round(todayRevenue * USD_TO_TWD * 100) / 100,
      revenue_delta_pct: deltaPct(todayRevenue, yesterdayRevenue),
      reports_completed: todayCompleted,
      reports_failed: todayFailed,
      reports_generating: todayGenerating,
      dau: todayDau,
      dau_delta_pct: deltaPct(todayDau, yesterdayDau),
      paying_customers: todayUniqueCustomers,
      paying_customers_delta_pct: deltaPct(todayUniqueCustomers, yesterdayUniqueCustomers),
      free_tool_usage: todayFreeToolRes.count ?? 0,
    },
    yesterday: {
      orders: yesterdayOrders,
      revenue_usd: Math.round(yesterdayRevenue * 100) / 100,
      dau: yesterdayDau,
      paying_customers: yesterdayUniqueCustomers,
    },
    exchange_rate: { usd_to_twd: USD_TO_TWD },
  })
}
