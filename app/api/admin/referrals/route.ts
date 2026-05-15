import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
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

  // 嘗試取得推薦人 email
  // v5.3.34：N+1 修復 — 改用一次 listUsers 抓全部，不再逐個 getUserById
  const referrerIds = new Set((referrals || []).map(r => r.referrer_user_id).filter(Boolean) as string[])
  const referrerEmailMap = new Map<string, string>()
  if (referrerIds.size > 0) {
    try {
      let page = 1
      const perPage = 1000
      while (true) {
        const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
          page,
          perPage,
        })
        if (usersErr || !usersData?.users) break
        for (const u of usersData.users) {
          if (referrerIds.has(u.id) && u.email) {
            referrerEmailMap.set(u.id, u.email)
          }
        }
        if (usersData.users.length < perPage) break
        page++
      }
    } catch (err) {
      console.error('[referrals] listUsers 失敗:', err)
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
