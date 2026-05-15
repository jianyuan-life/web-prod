// 後台稽核日誌查詢 API（L7+ BI 2026-04-17）
// GET /api/admin/audit-log?action=refund&target_type=order&limit=200
// Headers: x-admin-key
//
// 對應 table: admin_audit_log（create_admin_audit_log.sql）

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

  const action = req.nextUrl.searchParams.get('action')
  const targetType = req.nextUrl.searchParams.get('target_type')
  const targetId = req.nextUrl.searchParams.get('target_id')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '200'), 1000)
  const days = Math.min(Number(req.nextUrl.searchParams.get('days') || '30'), 180)

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const supabase = getSupabase()
  let query = supabase
    .from('admin_audit_log')
    .select('id, action, target_type, target_id, metadata, ip, user_agent, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) query = query.eq('action', action)
  if (targetType) query = query.eq('target_type', targetType)
  if (targetId) query = query.eq('target_id', targetId)

  const { data, error } = await query

  if (error) {
    // 表不存在時優雅回退
    if (String(error.code) === '42P01' || String(error.message).includes('admin_audit_log')) {
      return NextResponse.json({
        logs: [],
        summary: { total: 0, by_action: {} },
        note: 'admin_audit_log 表未建立（請於 Supabase 執行 create_admin_audit_log.sql）',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs = data || []

  // 聚合 action 次數
  const byAction: Record<string, number> = {}
  for (const l of logs) {
    byAction[l.action] = (byAction[l.action] || 0) + 1
  }

  return NextResponse.json({
    logs,
    summary: {
      total: logs.length,
      by_action: byAction,
    },
    filters: { action, target_type: targetType, target_id: targetId, days, limit },
  })
}
