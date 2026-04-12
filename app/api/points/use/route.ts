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
    const { data: points } = await supabase
      .from('user_points')
      .select('balance')
      .eq('user_id', userId)
      .single()

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
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
