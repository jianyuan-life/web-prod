import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 註冊推薦關係：被推薦人完成註冊後呼叫此 API
// 寫入 referrals 表，status='registered'，等首次購買時觸發點數發放
export async function POST(req: NextRequest) {
  try {
    const { referralCode, userId, email } = await req.json()

    if (!referralCode || !userId) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // 格式驗證
    const code = referralCode.trim().toUpperCase()
    if (!/^JY-[A-HJ-NP-Z2-9]{5}$/.test(code)) {
      return NextResponse.json({ error: '推薦碼格式無效' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 查詢推薦碼，取得推薦人 user_id
    const { data: referralCodeRow } = await supabase
      .from('referral_codes')
      .select('user_id, is_active')
      .eq('code', code)
      .single()

    if (!referralCodeRow) {
      return NextResponse.json({ error: '推薦碼不存在' }, { status: 404 })
    }

    if (!referralCodeRow.is_active) {
      return NextResponse.json({ error: '推薦碼已停用' }, { status: 400 })
    }

    // 防止自己推薦自己
    if (referralCodeRow.user_id === userId) {
      return NextResponse.json({ error: '不能使用自己的推薦碼' }, { status: 400 })
    }

    // 防止重複推薦：同一個被推薦人只能有一筆推薦記錄
    const { data: existing } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_user_id', userId)
      .maybeSingle()

    if (existing) {
      // 已有推薦記錄，靜默成功（冪等性）
      return NextResponse.json({ success: true, message: '推薦關係已存在' })
    }

    // 寫入 referrals 表
    const { error: insertErr } = await supabase
      .from('referrals')
      .insert({
        referrer_user_id: referralCodeRow.user_id,
        referred_user_id: userId,
        referred_email: (email || '').toLowerCase(),
        referral_code: code,
        status: 'registered',
      })

    if (insertErr) {
      // unique constraint 碰撞也靜默成功
      if (insertErr.code === '23505') {
        return NextResponse.json({ success: true, message: '推薦關係已存在' })
      }
      console.error('referrals insert 失敗:', insertErr)
      return NextResponse.json({ error: '建立推薦關係失敗' }, { status: 500 })
    }

    console.log(`✅ 推薦關係建立：${code} → ${userId}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
