// ============================================================
// Sprint 5 — 列出 timezone 尚未補填的報告
// GET /api/admin/timezone-missing?limit=50&offset=0
// Headers: x-admin-key（對應 env var ADMIN_KEY）
//
// 權限：使用 lib/admin-auth.ts 的 checkAdminAuth() 驗證 ADMIN_KEY env var
//
// 回傳：
//   { reports: [{ id, client_name, plan_code, birth_data, timezone, birth_city, birth_country, created_at }] }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { lookupCityTz } from '@/lib/cities-with-tz'

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

  const url = new URL(req.url)
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50'))
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const supabase = getSupabase()
  const { data, error, count } = await supabase
    .from('paid_reports')
    .select(
      'id, client_name, plan_code, status, birth_data, timezone, birth_city, birth_country, birth_lat, birth_lng, tz_migrated_at, customer_email, created_at',
      { count: 'exact' },
    )
    .is('timezone', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[timezone-missing] query 失敗:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  // 為每筆 report 計算「建議的 timezone」（用 lookupCityTz 預測，方便管理員一鍵採用）
  type Row = {
    id: string
    client_name: string | null
    plan_code: string
    status: string
    birth_data: Record<string, unknown> | null
    timezone: string | null
    birth_city: string | null
    birth_country: string | null
    birth_lat: number | null
    birth_lng: number | null
    tz_migrated_at: string | null
    customer_email: string | null
    created_at: string
  }
  const reports = ((data || []) as Row[]).map((r) => {
    const bd = r.birth_data || {}
    const candidateCity =
      r.birth_city ||
      (typeof bd.birth_city === 'string' ? bd.birth_city : '') ||
      (typeof bd.city === 'string' ? bd.city : '') ||
      ''
    const suggested = candidateCity ? lookupCityTz(candidateCity) : null
    return {
      ...r,
      suggested_timezone: suggested?.timezone || null,
      suggested_country: suggested?.countryCode || null,
      suggested_lat: suggested?.lat || null,
      suggested_lng: suggested?.lng || null,
      derived_birth_city: candidateCity || null,
    }
  })

  return NextResponse.json({
    reports,
    total: count || 0,
    limit,
    offset,
  })
}
