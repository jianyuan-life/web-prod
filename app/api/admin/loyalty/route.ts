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

// GET — 客戶忠誠度總覽
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  try {
    const supabase = getSupabase()

    // 查詢所有 user_points 記錄
    const { data: points, error: pointsErr } = await supabase
      .from('user_points')
      .select('user_id, balance, total_earned, total_used')

    if (pointsErr) {
      return NextResponse.json({ error: pointsErr.message }, { status: 500 })
    }

    // 查詢所有推薦碼（含推薦人數）
    const { data: codes, error: codesErr } = await supabase
      .from('referral_codes')
      .select('user_id, code, total_referrals, is_active')

    if (codesErr) {
      return NextResponse.json({ error: codesErr.message }, { status: 500 })
    }

    // 建立 user_id → referral_codes 映射
    const codeMap = new Map<string, { code: string; total_referrals: number; is_active: boolean }>()
    for (const c of (codes || [])) {
      codeMap.set(c.user_id, {
        code: c.code,
        total_referrals: c.total_referrals || 0,
        is_active: c.is_active,
      })
    }

    // 收集所有需要查詢的 user_id（user_points + referral_codes 的聯集）
    const allUserIds = new Set<string>()
    for (const p of (points || [])) allUserIds.add(p.user_id)
    for (const c of (codes || [])) allUserIds.add(c.user_id)

    // 批量查詢用戶資訊（auth.users）
    const userMap = new Map<string, { email: string; full_name: string; created_at: string }>()
    const userIdArray = [...allUserIds]
    // Supabase admin API 不支援批量 getUserById，需逐個查（限制前 200 位）
    for (const uid of userIdArray.slice(0, 200)) {
      const { data: userData } = await supabase.auth.admin.getUserById(uid)
      if (userData?.user) {
        userMap.set(uid, {
          email: userData.user.email || '',
          full_name: userData.user.user_metadata?.full_name || '',
          created_at: userData.user.created_at,
        })
      }
    }

    // 組合客戶忠誠度資料
    const pointsMap = new Map<string, { balance: number; total_earned: number; total_used: number }>()
    for (const p of (points || [])) {
      pointsMap.set(p.user_id, {
        balance: p.balance || 0,
        total_earned: p.total_earned || 0,
        total_used: p.total_used || 0,
      })
    }

    const customers = userIdArray.map(uid => {
      const user = userMap.get(uid)
      const pt = pointsMap.get(uid)
      const ref = codeMap.get(uid)
      return {
        userId: uid,
        email: user?.email || uid,
        fullName: user?.full_name || '',
        balance: pt?.balance || 0,
        totalEarned: pt?.total_earned || 0,
        totalUsed: pt?.total_used || 0,
        referralCount: ref?.total_referrals || 0,
        referralCode: ref?.code || '',
        createdAt: user?.created_at || '',
      }
    })

    // 按累計獲得降序排列
    customers.sort((a, b) => b.totalEarned - a.totalEarned)

    // 統計卡片數據
    const totalReferrers = codes?.length || 0
    const totalPointsCirculation = (points || []).reduce((sum, p) => sum + (p.total_earned || 0), 0)
    const activeReferrers = (codes || []).filter(c => (c.total_referrals || 0) > 0).length

    return NextResponse.json({
      stats: {
        totalReferrers,
        totalPointsCirculation,
        activeReferrers,
      },
      customers,
    })
  } catch (err) {
    console.error('查詢忠誠度數據失敗:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
