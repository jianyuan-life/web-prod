import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDisposableEmail } from '@/lib/disposable-email-domains'
import { getClientIp } from '@/lib/bruteforce-tracker'

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
    // 注意：新用戶剛註冊完呼叫此 API 時，session cookie 可能還沒設好
    // 所以不強制 token 認證，改用 Supabase service role 驗證 userId 是否存在
    const { referralCode, userId, email } = await req.json()

    if (!referralCode || !userId) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // 用 service role 驗證 userId 是真實存在的用戶（防偽造）
    const supabaseAdmin = getSupabase()
    const { data: { user: verifiedUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (!verifiedUser) {
      return NextResponse.json({ error: '用戶不存在' }, { status: 403 })
    }

    // 反作弊：拒絕拋棄式/臨時信箱註冊推薦關係
    const verifiedEmail = verifiedUser.email || email || ''
    if (isDisposableEmail(verifiedEmail)) {
      return NextResponse.json(
        { error: '此信箱類型不支援推薦獎勵，請使用常用信箱' },
        { status: 400 },
      )
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

    // 寫入 referrals 表（關鍵：帶上 referred_email 修復 L5 bug #2）
    // 注意：referred_email / referred_ip 欄位由 add_referred_email migration 建立
    // 若 migration 尚未執行，下方 insert 會報錯；透過 try/catch 做 fallback
    const clientIp = getClientIp(req)
    let insertErr: { code?: string; message?: string } | null = null
    {
      const { error } = await supabase
        .from('referrals')
        .insert({
          referrer_user_id: referralCodeRow.user_id,
          referred_user_id: userId,
          referral_code: code,
          status: 'registered',
          referred_email: verifiedEmail.toLowerCase(),
          referred_ip: clientIp,
        })
      insertErr = error
    }

    // 若 migration 尚未執行，欄位不存在時退回舊格式（確保不 break 既有功能）
    if (insertErr && /column .*(referred_email|referred_ip)/i.test(insertErr.message || '')) {
      console.warn('[referral/register] referred_email/ip 欄位未建立，退回舊格式寫入')
      const { error } = await supabase
        .from('referrals')
        .insert({
          referrer_user_id: referralCodeRow.user_id,
          referred_user_id: userId,
          referral_code: code,
          status: 'registered',
        })
      insertErr = error
    }

    if (insertErr) {
      // unique constraint 碰撞也靜默成功
      if (insertErr.code === '23505') {
        return NextResponse.json({ success: true, message: '推薦關係已存在' })
      }
      console.error('referrals insert 失敗:', insertErr)
      return NextResponse.json({ error: '建立推薦關係失敗' }, { status: 500 })
    }

    // 註冊獎勵：推薦人 3 點 + 被推薦人 5 點
    const REGISTER_REFERRER_POINTS = 3
    const REGISTER_REFERRED_POINTS = 5

    // 發放推薦人積分
    const { data: refPts } = await supabase.from('user_points').select('balance, total_earned').eq('user_id', referralCodeRow.user_id).maybeSingle()
    if (refPts) {
      await supabase.from('user_points').update({ balance: refPts.balance + REGISTER_REFERRER_POINTS, total_earned: refPts.total_earned + REGISTER_REFERRER_POINTS }).eq('user_id', referralCodeRow.user_id)
    } else {
      await supabase.from('user_points').insert({ user_id: referralCodeRow.user_id, balance: REGISTER_REFERRER_POINTS, total_earned: REGISTER_REFERRER_POINTS, total_used: 0 })
    }
    await supabase.from('point_transactions').insert({ user_id: referralCodeRow.user_id, type: 'earn_referral_register', amount: REGISTER_REFERRER_POINTS, balance_after: (refPts?.balance || 0) + REGISTER_REFERRER_POINTS, description: '推薦朋友完成註冊獎勵', reference_id: `register_${userId}` })

    // 發放被推薦人積分
    const { data: newPts } = await supabase.from('user_points').select('balance, total_earned').eq('user_id', userId).maybeSingle()
    if (newPts) {
      await supabase.from('user_points').update({ balance: newPts.balance + REGISTER_REFERRED_POINTS, total_earned: newPts.total_earned + REGISTER_REFERRED_POINTS }).eq('user_id', userId)
    } else {
      await supabase.from('user_points').insert({ user_id: userId, balance: REGISTER_REFERRED_POINTS, total_earned: REGISTER_REFERRED_POINTS, total_used: 0 })
    }
    await supabase.from('point_transactions').insert({ user_id: userId, type: 'earn_welcome', amount: REGISTER_REFERRED_POINTS, balance_after: (newPts?.balance || 0) + REGISTER_REFERRED_POINTS, description: '透過推薦碼註冊歡迎獎勵', reference_id: `register_${userId}` })

    console.info(`✅ 推薦關係建立：${code} → ${userId}，已發放積分（推薦人 +${REGISTER_REFERRER_POINTS}，被推薦人 +${REGISTER_REFERRED_POINTS}）`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
