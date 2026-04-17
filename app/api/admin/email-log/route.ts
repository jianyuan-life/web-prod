// Email 送達紀錄 API（L7+ BI 2026-04-17）
// GET /api/admin/email-log?days=30&type=report_ready&status=sent
// Headers: x-admin-key

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

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const days = Math.min(Number(req.nextUrl.searchParams.get('days') || '30'), 180)
  const type = req.nextUrl.searchParams.get('type')
  const status = req.nextUrl.searchParams.get('status')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '500'), 1000)

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  const supabase = getSupabase()

  let query = supabase
    .from('email_send_log')
    .select('id, resend_id, to_email, from_email, email_type, subject, report_id, user_id, status, error_message, delivered_at, bounced_at, complained_at, metadata, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (type) query = query.eq('email_type', type)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    if (String(error.code) === '42P01' || String(error.message).includes('email_send_log')) {
      return NextResponse.json({
        logs: [],
        summary: { total: 0 },
        note: 'email_send_log 表未建立（請於 Supabase 執行 create_email_send_log.sql）',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs = data || []
  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const l of logs) {
    byType[l.email_type] = (byType[l.email_type] || 0) + 1
    byStatus[l.status] = (byStatus[l.status] || 0) + 1
  }

  return NextResponse.json({
    logs,
    summary: {
      total: logs.length,
      by_type: byType,
      by_status: byStatus,
    },
  })
}
