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

// GET — 取得推薦碼統計與記錄
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()

  // 查詢所有推薦記錄（JOIN referral_codes 取得推薦碼）
  const { data: referrals, error: refErr } = await supabase
    .from('referrals')
    .select('id, referrer_user_id, referred_user_id, referred_email, referral_code, status, referrer_points_awarded, referred_points_awarded, created_at, purchased_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

  // 查詢所有推薦碼
  const { data: codes } = await supabase
    .from('referral_codes')
    .select('user_id, code, total_referrals, is_active')

  // 建立 user_id → code 的映射
  const codeMap = new Map<string, string>()
  for (const c of (codes || [])) {
    codeMap.set(c.user_id, c.code)
  }

  // 統計數據
  const totalReferrals = referrals?.length || 0
  const purchasedCount = referrals?.filter(r => r.status === 'purchased').length || 0
  const totalPointsAwarded = referrals?.reduce((sum, r) =>
    sum + (r.referrer_points_awarded || 0) + (r.referred_points_awarded || 0), 0) || 0

  // 嘗試取得推薦人 email（批量查詢）
  const referrerIds = [...new Set((referrals || []).map(r => r.referrer_user_id).filter(Boolean))]
  const referrerEmailMap = new Map<string, string>()

  // 逐個查詢（Supabase admin API 不支援批量 getUserById）
  for (const uid of referrerIds.slice(0, 50)) {
    const { data: userData } = await supabase.auth.admin.getUserById(uid)
    if (userData?.user?.email) {
      referrerEmailMap.set(uid, userData.user.email)
    }
  }

  const records = (referrals || []).map(r => ({
    id: r.id,
    referrerEmail: referrerEmailMap.get(r.referrer_user_id) || r.referrer_user_id,
    referrerCode: codeMap.get(r.referrer_user_id) || r.referral_code || '-',
    referredEmail: r.referred_email || r.referred_user_id,
    status: r.status,
    referrerPoints: r.referrer_points_awarded || 0,
    referredPoints: r.referred_points_awarded || 0,
    createdAt: r.created_at,
    purchasedAt: r.purchased_at,
  }))

  return NextResponse.json({
    stats: { totalReferrals, purchasedCount, totalPointsAwarded },
    records,
    totalCodes: codes?.length || 0,
  })
}
