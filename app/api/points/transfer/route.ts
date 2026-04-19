import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// POST — 會員之間積分贈與
export async function POST(req: NextRequest) {
  try {
    // 認證：從 cookie 或 header 取得使用者身份
    const authHeader = req.headers.get('authorization')
    const cookieToken = req.cookies.get('sb-access-token')?.value
    const token = authHeader?.replace('Bearer ', '') || cookieToken

    if (!token) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const supabase = getSupabase()
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) {
      return NextResponse.json({ error: '認證失敗' }, { status: 401 })
    }

    const { recipientEmail, points, message } = await req.json()

    // 強化輸入驗證
    if (typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
      return NextResponse.json({ error: '請提供有效的收件人 Email' }, { status: 400 })
    }
    if (typeof points !== 'number' || !Number.isInteger(points) || points <= 0) {
      return NextResponse.json({ error: '積分必須為正整數' }, { status: 400 })
    }
    if (points > 1000) {
      return NextResponse.json({ error: '單次最多贈與 1,000 點' }, { status: 400 })
    }
    // 限制 message 長度，避免塞入超長字串或潛在 SSRF / 日誌污染
    if (message !== undefined && (typeof message !== 'string' || message.length > 200)) {
      return NextResponse.json({ error: '留言最多 200 字' }, { status: 400 })
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : ''
    const normalizedRecipientEmail = recipientEmail.trim().toLowerCase()

    // 不能贈與給自己
    if (normalizedRecipientEmail === user.email?.toLowerCase()) {
      return NextResponse.json({ error: '不能贈與給自己' }, { status: 400 })
    }

    // v5.3.34：用 auth_users_view 直接查 email → user_id，
    //   取代 admin.listUsers()（O(N)、會拉整個用戶表、隨用戶量變慢且浪費頻寬）
    type RecipientRow = { id: string; email: string | null; user_metadata?: { full_name?: string } | null }
    let recipient: RecipientRow | null = null
    const { data: recipientFromView } = await supabase
      .from('auth_users_view')
      .select('id, email')
      .ilike('email', normalizedRecipientEmail)
      .maybeSingle()
    if (recipientFromView?.id) {
      recipient = { id: recipientFromView.id, email: recipientFromView.email }
    } else {
      // Fallback：view 不存在時再走 admin.listUsers（極少用戶量時才退回）
      const { data: list } = await supabase.auth.admin.listUsers()
      const found = list?.users?.find(u => u.email?.toLowerCase() === normalizedRecipientEmail)
      if (found) recipient = { id: found.id, email: found.email || null, user_metadata: found.user_metadata as RecipientRow['user_metadata'] }
    }
    if (!recipient) {
      return NextResponse.json({ error: '找不到該 Email 的用戶' }, { status: 404 })
    }

    // 檢查贈送者餘額
    const { data: senderPts } = await supabase
      .from('user_points')
      .select('balance, total_used')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!senderPts || senderPts.balance < points) {
      return NextResponse.json({ error: `積分不足，目前餘額 ${senderPts?.balance || 0} 點` }, { status: 400 })
    }

    // 扣除贈送者積分（帶 .gte 條件防止 race condition 造成負餘額）
    const senderNewBalance = senderPts.balance - points
    const { error: deductErr } = await supabase
      .from('user_points')
      .update({
        balance: senderNewBalance,
        total_used: (senderPts.total_used || 0) + points,
      })
      .eq('user_id', user.id)
      .gte('balance', points)
    if (deductErr) {
      console.error('扣除贈送者積分失敗:', deductErr)
      return NextResponse.json({ error: '贈與失敗，請稍後再試' }, { status: 500 })
    }

    // 增加收件人積分
    const { data: recipientPts } = await supabase
      .from('user_points')
      .select('balance, total_earned')
      .eq('user_id', recipient.id)
      .maybeSingle()

    const recipientNewBalance = (recipientPts?.balance || 0) + points
    if (recipientPts) {
      await supabase.from('user_points').update({
        balance: recipientNewBalance,
        total_earned: recipientPts.total_earned + points,
      }).eq('user_id', recipient.id)
    } else {
      await supabase.from('user_points').insert({
        user_id: recipient.id,
        balance: points,
        total_earned: points,
        total_used: 0,
      })
    }

    // 記錄雙方交易
    const refId = `transfer_${Date.now()}_${user.id.slice(0, 8)}`
    const senderName = user.user_metadata?.full_name || user.email
    const recipientName = recipient.user_metadata?.full_name || recipient.email
    const messageSuffix = normalizedMessage ? `：${normalizedMessage}` : ''

    await supabase.from('point_transactions').insert([
      {
        user_id: user.id,
        type: 'transfer_out',
        amount: -points,
        balance_after: senderNewBalance,
        description: `贈與 ${recipientName} ${points} 點${messageSuffix}`,
        reference_id: refId,
      },
      {
        user_id: recipient.id,
        type: 'transfer_in',
        amount: points,
        balance_after: recipientNewBalance,
        description: `收到 ${senderName} 贈與 ${points} 點${messageSuffix}`,
        reference_id: refId,
      },
    ])

    return NextResponse.json({
      success: true,
      pointsTransferred: points,
      senderNewBalance,
      recipientEmail: normalizedRecipientEmail,
    })
  } catch (err) {
    console.error('積分贈與失敗:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
