import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit, clearAdminAuthFail } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

// 管理後台 API — x-admin-key header 驗證 + timing-safe compare + rate limit

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
  // 認證成功 → 清空失敗紀錄 + 紀錄登入（限總覽 route 紀錄一次）
  clearAdminAuthFail(req)
  // 登入/總覽載入 → 寫稽核（不擋主流程）
  void writeAuditLog(req, 'login', 'system', null, { range: req.nextUrl.searchParams.get('range') || '7d' })

  const range = req.nextUrl.searchParams.get('range') || '7d'
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 7

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()
  const supabase = getSupabase()

  // 已知 bot User-Agent 關鍵字（用於過濾非真人訪客）
  const BOT_UA_PATTERNS = ['HeadlessChrome', 'vercel-screenshot', 'bot', 'crawler', 'spider', 'Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider', 'YandexBot', 'facebookexternalhit', 'Twitterbot']

  // 並行查詢所有數據
  const [
    visitorsRes,
    reportsRes,
    freeToolRes,
    topPagesRes,
    countriesRes,
    devicesRes,
  ] = await Promise.all([
    // 訪客總數（去重 session_id）— 包含 user_agent 用於 bot 過濾
    supabase.from('visitor_events').select('session_id, user_agent', { count: 'exact' }).gte('created_at', sinceISO),
    // 付費報告（只選統計需要的欄位，不拉 report_result 大 JSON）
    supabase.from('paid_reports').select('id, plan_code, amount_usd, status, created_at, customer_email, client_name, stripe_session_id').gte('created_at', sinceISO).order('created_at', { ascending: false }),
    // 免費工具使用
    supabase.from('free_tool_usage').select('*', { count: 'exact' }).gte('created_at', sinceISO),
    // 熱門頁面 Top 10（含 user_agent 用於 bot 過濾）
    supabase.from('visitor_events').select('page_path, user_agent').gte('created_at', sinceISO),
    // 國家分佈（含 user_agent 用於 bot 過濾）
    supabase.from('visitor_events').select('country, user_agent').gte('created_at', sinceISO),
    // 設備分佈（含 user_agent 用於 bot 過濾）
    supabase.from('visitor_events').select('device_type, user_agent').gte('created_at', sinceISO),
  ])

  // Bot 過濾函式
  const isBot = (ua: string) => BOT_UA_PATTERNS.some(p => ua.toLowerCase().includes(p.toLowerCase()))

  // 計算統計（過濾 bot）
  const allVisitors = visitorsRes.data || []
  const visitors = allVisitors.filter(v => !isBot(v.user_agent || ''))
  const uniqueSessions = new Set(visitors.map(v => v.session_id)).size
  const totalPageviews = visitors.length
  // bot 統計（供參考）
  const botCount = allVisitors.length - visitors.length

  const reports = reportsRes.data || []
  const totalRevenue = reports.reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)
  const completedReports = reports.filter(r => r.status === 'completed').length

  // 產品銷售排行
  const planCounts: Record<string, { count: number; revenue: number }> = {}
  for (const r of reports) {
    // 正規化：取第一個英數字段（相容舊資料如「C 全方位十五合一」→「C」）
    const plan = (r.plan_code || 'unknown').split(/\s/)[0]
    if (!planCounts[plan]) planCounts[plan] = { count: 0, revenue: 0 }
    planCounts[plan].count++
    planCounts[plan].revenue += parseFloat(r.amount_usd) || 0
  }
  const topProducts = Object.entries(planCounts)
    .map(([plan, data]) => ({ plan, ...data }))
    .sort((a, b) => b.revenue - a.revenue)

  // 熱門頁面（過濾 bot）
  const pageCounts: Record<string, number> = {}
  for (const p of (topPagesRes.data || [])) {
    if (isBot(p.user_agent || '')) continue
    pageCounts[p.page_path] = (pageCounts[p.page_path] || 0) + 1
  }
  const topPages = Object.entries(pageCounts)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 國家分佈（過濾 bot）
  const countryCounts: Record<string, number> = {}
  for (const c of (countriesRes.data || [])) {
    if (isBot(c.user_agent || '')) continue
    const country = c.country || 'Unknown'
    countryCounts[country] = (countryCounts[country] || 0) + 1
  }
  const geoDistribution = Object.entries(countryCounts)
    .map(([country, count]) => ({ country, count, pct: Math.round(count / Math.max(totalPageviews, 1) * 100) }))
    .sort((a, b) => b.count - a.count)

  // 設備分佈（過濾 bot）
  const deviceCounts: Record<string, number> = {}
  for (const d of (devicesRes.data || [])) {
    if (isBot(d.user_agent || '')) continue
    deviceCounts[d.device_type || 'unknown'] = (deviceCounts[d.device_type || 'unknown'] || 0) + 1
  }

  // 免費工具轉化率
  const freeToolCount = freeToolRes.count || 0
  const conversionRate = freeToolCount > 0 ? Math.round(reports.length / freeToolCount * 100) : 0

  // 每日收入匯總
  const dailyMap: Record<string, { revenue: number; orders: number }> = {}
  for (const r of reports) {
    const day = (r.created_at || '').slice(0, 10)
    if (!day) continue
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, orders: 0 }
    dailyMap[day].revenue += parseFloat(r.amount_usd) || 0
    dailyMap[day].orders++
  }
  const dailyRevenue = Object.entries(dailyMap)
    .map(([date, d]) => ({ date, revenue: Math.round(d.revenue * 100) / 100, orders: d.orders }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 真實營收（排除 $0 測試訂單）
  const realRevenue = reports.filter(r => parseFloat(r.amount_usd) > 0).reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)
  const testOrders = reports.filter(r => parseFloat(r.amount_usd) === 0).length

  return NextResponse.json({
    range,
    overview: {
      unique_visitors: uniqueSessions,
      total_pageviews: totalPageviews,
      total_orders: reports.length,
      completed_reports: completedReports,
      total_revenue_usd: Math.round(realRevenue * 100) / 100,
      free_tool_usage: freeToolCount,
      conversion_rate_pct: conversionRate,
      // 額外統計供後台參考
      bot_pageviews: botCount,
      test_orders: testOrders,
    },
    top_products: topProducts,
    top_pages: topPages,
    geo_distribution: geoDistribution,
    device_distribution: deviceCounts,
    daily_revenue: dailyRevenue,
    recent_orders: reports.slice(0, 10).map(r => ({
      id: r.id,
      client_name: r.client_name,
      plan_code: (r.plan_code || '').split(/\s/)[0],
      amount_usd: r.amount_usd,
      status: r.status,
      created_at: r.created_at,
    })),
  })
}
