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

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const supabase = getSupabase()

    // 查詢點數餘額
    const { data: points } = await supabase
      .from('user_points')
      .select('balance, total_earned, total_used')
      .eq('user_id', userId)
      .single()

    // 查詢最近 10 筆交易記錄
    const { data: transactions } = await supabase
      .from('point_transactions')
      .select('id, type, amount, balance_after, description, expires_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    // 計算 30 天內即將到期的點數
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const { data: expiringRows } = await supabase
      .from('point_transactions')
      .select('amount')
      .eq('user_id', userId)
      .gt('amount', 0)
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', in30Days.toISOString())

    const expiringIn30Days = expiringRows?.reduce((sum, row) => sum + row.amount, 0) || 0

    return NextResponse.json({
      balance: points?.balance || 0,
      totalEarned: points?.total_earned || 0,
      totalUsed: points?.total_used || 0,
      expiringIn30Days,
      transactions: (transactions || []).map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        description: t.description,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
      })),
    })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
