// Dashboard 今日快照 API（L7+ BI 2026-04-17，v5.3.38 RPC 化）
// GET /api/admin/dashboard/snapshot
// Headers: x-admin-key
//
// 回傳：
//   - 今日新訂單 / 今日營收（USD / TWD）
//   - 今日生成成功 / 失敗報告
//   - 今日活躍用戶數（DAU）
//   - 今日免費工具使用
//   - vs 昨天的差值（比較）
//
// v5.3.38：改用 admin_dashboard_snapshot RPC，SQL 層聚合，不再把全表拉進 Node 記憶體。

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
    endTs: now.toISOString(),
  }
}

type SnapshotRpcPayload = {
  generated_at: string
  today: {
    orders: number
    revenue_usd: number
    net_revenue_usd: number          // v5.10.283 新增:扣退款後實際入帳
    reports_completed: number
    reports_failed: number
    reports_generating: number
    dau: number
    paying_customers: number
    free_tool_usage: number
  }
  yesterday: {
    orders: number
    revenue_usd: number
    net_revenue_usd: number          // v5.10.283 新增
    dau: number
    paying_customers: number
  }
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const { startOfToday, startOfYesterday, endTs } = todayWindow()

  const { data, error } = await supabase.rpc('admin_dashboard_snapshot', {
    start_today: startOfToday,
    start_yesterday: startOfYesterday,
    end_ts: endTs,
  })

  if (error) {
    return NextResponse.json(
      { error: 'snapshot_rpc_failed', detail: error.message },
      { status: 500 },
    )
  }

  const payload = (data ?? {
    generated_at: new Date().toISOString(),
    today: {
      orders: 0, revenue_usd: 0, net_revenue_usd: 0, reports_completed: 0, reports_failed: 0,
      reports_generating: 0, dau: 0, paying_customers: 0, free_tool_usage: 0,
    },
    yesterday: { orders: 0, revenue_usd: 0, net_revenue_usd: 0, dau: 0, paying_customers: 0 },
  }) as SnapshotRpcPayload

  const today = payload.today
  const yesterday = payload.yesterday

  const todayRevenue = Number(today.revenue_usd) || 0
  const yesterdayRevenue = Number(yesterday.revenue_usd) || 0
  // v5.10.283 net revenue:扣退款後實際入帳
  const todayNetRevenue = Number(today.net_revenue_usd) || 0
  const yesterdayNetRevenue = Number(yesterday.net_revenue_usd) || 0

  const deltaPct = (t: number, y: number): number | null => {
    if (y === 0) return t === 0 ? 0 : null
    return Math.round(((t - y) / y) * 1000) / 10
  }

  return NextResponse.json({
    generated_at: payload.generated_at,
    today: {
      orders: today.orders,
      orders_delta_pct: deltaPct(today.orders, yesterday.orders),
      revenue_usd: Math.round(todayRevenue * 100) / 100,
      revenue_twd: Math.round(todayRevenue * USD_TO_TWD * 100) / 100,
      revenue_delta_pct: deltaPct(todayRevenue, yesterdayRevenue),
      // v5.10.283 net revenue(扣退款後)
      net_revenue_usd: Math.round(todayNetRevenue * 100) / 100,
      net_revenue_twd: Math.round(todayNetRevenue * USD_TO_TWD * 100) / 100,
      net_revenue_delta_pct: deltaPct(todayNetRevenue, yesterdayNetRevenue),
      refund_loss_usd: Math.round((todayRevenue - todayNetRevenue) * 100) / 100,
      reports_completed: today.reports_completed,
      reports_failed: today.reports_failed,
      reports_generating: today.reports_generating,
      dau: today.dau,
      dau_delta_pct: deltaPct(today.dau, yesterday.dau),
      paying_customers: today.paying_customers,
      paying_customers_delta_pct: deltaPct(today.paying_customers, yesterday.paying_customers),
      free_tool_usage: today.free_tool_usage,
    },
    yesterday: {
      orders: yesterday.orders,
      revenue_usd: Math.round(yesterdayRevenue * 100) / 100,
      net_revenue_usd: Math.round(yesterdayNetRevenue * 100) / 100,
      dau: yesterday.dau,
      paying_customers: yesterday.paying_customers,
    },
    exchange_rate: { usd_to_twd: USD_TO_TWD },
  })
}
