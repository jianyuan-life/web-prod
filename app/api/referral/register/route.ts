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
    // 認證：從 cookie 或 header 取得使用者身份
    const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
    const authHeader = req.headers.get('authorization')
    const cookieToken = req.cookies.get('sb-access-token')?.value
    const token = authHeader?.replace('Bearer ', '') || cookieToken

    if (!token) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    // 用 anon key 驗證 token，取得真實 user id
    const authClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    )
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) {
      return NextResponse.json({ error: '認證失敗' }, { status: 401 })
    }

    const { referralCode, userId, email } = await req.json()

    if (!referralCode || !userId) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // 防止偽造：request body 的 userId 必須與認證的 user.id 一致
    if (userId !== user.id) {
      return NextResponse.json({ error: '身份驗證不一致' }, { status: 403 })
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
