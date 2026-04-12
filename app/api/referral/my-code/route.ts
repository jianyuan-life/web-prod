import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 從 Authorization header 或 cookie 取得已認證的 user_id
async function getAuthUserId(req: NextRequest): Promise<string | null> {
  try {
    let token: string | null = null

    // 優先用 Authorization header
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }

    // fallback: cookie
    if (!token) {
      const cookies = req.headers.get('cookie') || ''
      const match = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
      if (match) {
        const tokenData = JSON.parse(decodeURIComponent(match[1]))
        token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
      }
    }

    if (!token || typeof token !== 'string' || token.length <= 20) return null

    const supabase = getSupabase()
    const { data } = await supabase.auth.getUser(token)
    return data?.user?.id || null
  } catch {
    return null
  }
}

// 生成推薦碼：JY-XXXXX（排除容易混淆的字元 O/0/I/1）
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'JY-'
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const supabase = getSupabase()

    // 查詢現有推薦碼
    const { data: existing } = await supabase
      .from('referral_codes')
      .select('code, total_referrals, is_active')
      .eq('user_id', userId)
      .single()

    if (existing) {
      return NextResponse.json({
        code: existing.code,
        totalReferrals: existing.total_referrals,
        isActive: existing.is_active,
      })
    }

    // 沒有推薦碼，自動生成（碰撞重試最多 3 次）
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateReferralCode()
      const { data: inserted, error } = await supabase
        .from('referral_codes')
        .insert({ user_id: userId, code })
        .select('code, total_referrals, is_active')
        .single()

      if (inserted && !error) {
        return NextResponse.json({
          code: inserted.code,
          totalReferrals: inserted.total_referrals,
          isActive: inserted.is_active,
        })
      }

      // 如果是 unique 碰撞（code 重複），重試
      if (error?.code === '23505' && error?.message?.includes('code')) {
        continue
      }

      // 如果是 user_id unique 碰撞（同時並發請求），重新查詢
      if (error?.code === '23505' && error?.message?.includes('user')) {
        const { data: retry } = await supabase
          .from('referral_codes')
          .select('code, total_referrals, is_active')
          .eq('user_id', userId)
          .single()

        if (retry) {
          return NextResponse.json({
            code: retry.code,
            totalReferrals: retry.total_referrals,
            isActive: retry.is_active,
          })
        }
      }

      // 其他錯誤直接回報
      return NextResponse.json({ error: '生成推薦碼失敗' }, { status: 500 })
    }

    return NextResponse.json({ error: '生成推薦碼失敗，請稍後再試' }, { status: 500 })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
