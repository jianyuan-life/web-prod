import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_KEY = process.env.ADMIN_KEY

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// POST — 管理員手動發放積分
export async function POST(req: NextRequest) {
  try {
    const { key, email, points, description } = await req.json()
    if (key !== ADMIN_KEY) {
      return NextResponse.json({ error: '無權限' }, { status: 403 })
    }
    if (!email || !points || points <= 0) {
      return NextResponse.json({ error: '請提供 Email 和正數的積分數量' }, { status: 400 })
    }
    if (points > 10000) {
      return NextResponse.json({ error: '單次最多發放 10,000 點' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 找到用戶
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return NextResponse.json({ error: `找不到 Email 為 ${email} 的用戶` }, { status: 404 })
    }

    // 更新積分
    const { data: existing } = await supabase
      .from('user_points')
      .select('balance, total_earned')
      .eq('user_id', user.id)
      .maybeSingle()

    const newBalance = (existing?.balance || 0) + points
    const newEarned = (existing?.total_earned || 0) + points

    if (existing) {
      await supabase.from('user_points').update({
        balance: newBalance,
        total_earned: newEarned,
      }).eq('user_id', user.id)
    } else {
      await supabase.from('user_points').insert({
        user_id: user.id,
        balance: points,
        total_earned: points,
        total_used: 0,
      })
    }

    // 記錄交易
    await supabase.from('point_transactions').insert({
      user_id: user.id,
      type: 'admin_grant',
      amount: points,
      balance_after: newBalance,
      description: description || '管理員手動發放',
      reference_id: `admin_${Date.now()}`,
    })

    return NextResponse.json({
      success: true,
      email,
      pointsGranted: points,
      newBalance,
    })
  } catch (err) {
    console.error('發放積分失敗:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
