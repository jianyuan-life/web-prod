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

    if (!recipientEmail || !points || points <= 0) {
      return NextResponse.json({ error: '請提供收件人 Email 和正數的積分數量' }, { status: 400 })
    }
    if (points > 1000) {
      return NextResponse.json({ error: '單次最多贈與 1,000 點' }, { status: 400 })
    }

    // 不能贈與給自己
    if (recipientEmail.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json({ error: '不能贈與給自己' }, { status: 400 })
    }

    // 找到收件人
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const recipient = users?.find(u => u.email?.toLowerCase() === recipientEmail.toLowerCase())
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

    // 扣除贈送者積分
    const senderNewBalance = senderPts.balance - points
    await supabase.from('user_points').update({
      balance: senderNewBalance,
      total_used: senderPts.total_used + points,
    }).eq('user_id', user.id).gte('balance', points)

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
    const refId = `transfer_${Date.now()}`
    const senderName = user.user_metadata?.full_name || user.email
    const recipientName = recipient.user_metadata?.full_name || recipient.email

    await supabase.from('point_transactions').insert([
      {
        user_id: user.id,
        type: 'transfer_out',
        amount: -points,
        balance_after: senderNewBalance,
        description: `贈與 ${recipientName} ${points} 點${message ? `：${message}` : ''}`,
        reference_id: refId,
      },
      {
        user_id: recipient.id,
        type: 'transfer_in',
        amount: points,
        balance_after: recipientNewBalance,
        description: `收到 ${senderName} 贈與 ${points} 點${message ? `：${message}` : ''}`,
        reference_id: refId,
      },
    ])

    return NextResponse.json({
      success: true,
      pointsTransferred: points,
      senderNewBalance,
      recipientEmail,
    })
  } catch (err) {
    console.error('積分贈與失敗:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
