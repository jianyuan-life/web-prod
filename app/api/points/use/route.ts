import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helper'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const body = await req.json()
    const { pointsToUse, planCode, orderAmount } = body

    // 參數驗證
    if (typeof pointsToUse !== 'number' || pointsToUse <= 0 || !Number.isInteger(pointsToUse)) {
      return NextResponse.json({ error: '點數必須為正整數' }, { status: 400 })
    }
    if (typeof orderAmount !== 'number' || orderAmount <= 0) {
      return NextResponse.json({ error: '訂單金額無效' }, { status: 400 })
    }
    if (typeof planCode !== 'string' || !planCode) {
      return NextResponse.json({ error: '方案代碼無效' }, { status: 400 })
    }

    // 折抵金額不超過訂單 100%（可全額積分支付）
    const maxDiscount = Math.floor(orderAmount)
    if (pointsToUse > maxDiscount) {
      return NextResponse.json({ error: `最多折抵 ${maxDiscount} 點` }, { status: 400 })
    }

    const supabase = getSupabase()

    // 查詢用戶可用點數餘額
    const { data: points, error: pointsErr } = await supabase
      .from('user_points')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle()

    if (pointsErr) {
      console.error('[points/use] 查詢 user_points 失敗:', pointsErr.message, 'userId:', userId)
    }

    const balance = points?.balance || 0

    if (pointsToUse > balance) {
      return NextResponse.json({ error: `可用點數不足，目前餘額 ${balance} 點` }, { status: 400 })
    }

    // 計算折抵後金額（1 點 = $1）
    const discountAmount = pointsToUse
    const finalAmount = Math.max(0, orderAmount - discountAmount)

    return NextResponse.json({
      success: true,
      pointsUsed: pointsToUse,
      discountAmount,
      finalAmount,
    })
  } catch (e) {
    console.error('[points/use] 未預期錯誤:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
