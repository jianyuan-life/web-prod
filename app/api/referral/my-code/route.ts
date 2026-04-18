import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUserId } from '@/lib/auth-helper'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
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
    const { data: existing, error: queryErr } = await supabase
      .from('referral_codes')
      .select('code, total_referrals, is_active')
      .eq('user_id', userId)
      .maybeSingle()

    if (queryErr) {
      console.error('[referral/my-code] 查詢現有推薦碼失敗:', queryErr.message, 'userId:', userId)
    }

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
  } catch (e) {
    console.error('[referral/my-code] 未預期錯誤:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
