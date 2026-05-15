import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

// GET — 取得所有客戶反饋（需 ADMIN_KEY）
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('report_feedback')
    .select(`
      id,
      rating,
      most_valuable,
      suggestion,
      would_recommend,
      created_at,
      updated_at,
      report_id,
      paid_reports!inner(client_name, plan_code, customer_email)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ feedback: data || [] })
}
