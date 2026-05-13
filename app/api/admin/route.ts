import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit, clearAdminAuthFail } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

// 管理後台 API — x-admin-key header 驗證 + timing-safe compare + rate limit
//
// v5.3.35：visitor_events 聚合改走 RPC `admin_visitor_stats`，
//          不再把整張表拉進 Node 記憶體。Bot 過濾在 SQL 層用 ILIKE 完成。

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

type VisitorStatRow = {
  bucket: 'overview' | 'top_page' | 'country' | 'device' | string
  key: string
  sessions: number
  pageviews: number
  is_bot: boolean
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
  const endISO = new Date().toISOString()
  const supabase = getSupabase()

  // 並行查詢所有數據（visitor_events 走 RPC；其他表維持 select）
  const [
    visitorStatsRes,
    reportsRes,
    freeToolRes,
  ] = await Promise.all([
    // 訪客聚合（overview / top_page / country / device + bot 分桶）
    supabase.rpc('admin_visitor_stats', { start_date: sinceISO, end_date: endISO }),
    // 付費報告（只選統計需要的欄位，不拉 report_result 大 JSON）
    // v5.10.287:soft delete filter — admin overview 統計不算軟刪
    supabase.from('paid_reports').select('id, plan_code, amount_usd, status, created_at, customer_email, client_name, stripe_session_id').gte('created_at', sinceISO).is('deleted_at', null).order('created_at', { ascending: false }),
    // 免費工具使用
    supabase.from('free_tool_usage').select('*', { count: 'exact', head: true }).gte('created_at', sinceISO),
  ])

  // ====== 解析 visitor 聚合 ======
  const statRows: VisitorStatRow[] = (visitorStatsRes.data as VisitorStatRow[] | null) || []

  // Overview：取 is_bot = false 的那筆
  const overviewReal = statRows.find(r => r.bucket === 'overview' && r.is_bot === false)
  const overviewBot = statRows.find(r => r.bucket === 'overview' && r.is_bot === true)
  const uniqueSessions = overviewReal?.sessions ?? 0
  const totalPageviews = overviewReal?.pageviews ?? 0
  const botCount = overviewBot?.pageviews ?? 0

  // Top pages（過濾 bot）— 同 key 取 non-bot
  const pageAgg: Record<string, number> = {}
  for (const r of statRows) {
    if (r.bucket !== 'top_page' || r.is_bot) continue
    pageAgg[r.key] = (pageAgg[r.key] || 0) + r.pageviews
  }
  const topPages = Object.entries(pageAgg)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 國家分佈（過濾 bot）
  const countryAgg: Record<string, number> = {}
  for (const r of statRows) {
    if (r.bucket !== 'country' || r.is_bot) continue
    const country = r.key || 'Unknown'
    countryAgg[country] = (countryAgg[country] || 0) + r.pageviews
  }
  const geoDistribution = Object.entries(countryAgg)
    .map(([country, count]) => ({ country, count, pct: Math.round(count / Math.max(totalPageviews, 1) * 100) }))
    .sort((a, b) => b.count - a.count)

  // 設備分佈（過濾 bot）
  const deviceCounts: Record<string, number> = {}
  for (const r of statRows) {
    if (r.bucket !== 'device' || r.is_bot) continue
    const k = r.key || 'unknown'
    deviceCounts[k] = (deviceCounts[k] || 0) + r.pageviews
  }

  // ====== 付費報告統計 ======
  const reports = reportsRes.data || []
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
