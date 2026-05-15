// 退款列表 API（L7+ BI 2026-04-17）
// GET /api/admin/refunds?status=all|refunded|candidate
// Headers: x-admin-key
//
// 用途：退款管理頁列表。
//   - status=refunded：已退款訂單（paid_reports.refunded_at 非 NULL）
//   - status=candidate：可退款訂單（status=completed 或 failed 且未退款）
//   - status=all：全部

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const status = req.nextUrl.searchParams.get('status') || 'all'
  const supabase = getSupabase()

  // v5.10.287:soft delete filter — refunds 列表不顯示軟刪報告
  let query = supabase
    .from('paid_reports')
    .select('id, client_name, customer_email, plan_code, amount_usd, status, created_at, refunded_at, refunded_amount_usd, refund_reason, stripe_refund_id, stripe_session_id, error_message')
    .gt('amount_usd', 0)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (status === 'refunded') {
    query = query.not('refunded_at', 'is', null)
  } else if (status === 'candidate') {
    query = query.is('refunded_at', null)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).map(r => ({
    ...r,
    plan_code: (r.plan_code || '').split(/\s/)[0],
  }))

  // 統計：退款理由分布
  const refundedOnly = rows.filter(r => r.refunded_at)
  const reasonBreakdown: Record<string, { count: number; total_usd: number }> = {}
  for (const r of refundedOnly) {
    const reason = r.refund_reason || 'unspecified'
    if (!reasonBreakdown[reason]) reasonBreakdown[reason] = { count: 0, total_usd: 0 }
    reasonBreakdown[reason].count++
    reasonBreakdown[reason].total_usd += Number(r.refunded_amount_usd || 0)
  }

  const totalRefundedUsd = refundedOnly.reduce((s, r) => s + Number(r.refunded_amount_usd || 0), 0)

  return NextResponse.json({
    rows,
    summary: {
      total_rows: rows.length,
      refunded_count: refundedOnly.length,
      total_refunded_usd: Math.round(totalRefundedUsd * 100) / 100,
      reason_breakdown: reasonBreakdown,
    },
  })
}
