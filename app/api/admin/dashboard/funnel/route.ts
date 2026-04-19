// Dashboard Funnel API（L7+ BI 2026-04-17，v5.3.38 RPC 化）
// GET /api/admin/dashboard/funnel?days=30
// Headers: x-admin-key
//
// 漏斗步驟：visit_pricing → start_checkout → begin_payment → payment_success
//            → report_generated → report_viewed → pdf_downloaded
//
// v5.3.38：改用 admin_funnel_analysis RPC，SQL 層一次聚合 customer_funnel_events
//          + visitor_events / paid_reports 回退補位。

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

type FunnelStep = {
  step: string
  label: string
  count: number
  conversion_from_prev_pct: number | null
  conversion_from_top_pct: number | null
}

type FunnelRpcPayload = {
  since: string
  funnel: FunnelStep[]
  funnel_events_count: number
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') || '30')))
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  const endTs = new Date().toISOString()

  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('admin_funnel_analysis', {
    since_ts: since,
    end_ts: endTs,
  })

  if (error) {
    return NextResponse.json(
      { error: 'funnel_rpc_failed', detail: error.message },
      { status: 500 },
    )
  }

  const payload = (data ?? {
    since,
    funnel: [],
    funnel_events_count: 0,
  }) as FunnelRpcPayload

  return NextResponse.json({
    days,
    since: payload.since,
    funnel: payload.funnel,
    funnel_events_count: payload.funnel_events_count,
    note: (payload.funnel_events_count ?? 0) === 0
      ? '尚無 customer_funnel_events 數據，目前 visit_pricing / start_checkout 由 visitor_events 推算、payment_success / report_generated 由 paid_reports 推算'
      : undefined,
  })
}
