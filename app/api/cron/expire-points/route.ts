// ============================================================
// Cron 點數過期端點 — 自動清除已過期的點數
// 每天凌晨 3 點由 Vercel Cron 呼叫一次
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  // 驗證 cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  const now = new Date().toISOString()
  let expiredUsersCount = 0
  let totalExpiredPoints = 0

  // 查詢已過期且尚未處理的點數交易（有 expires_at、已過期、type 不是 expire、amount > 0）
  const { data: expiredTransactions, error: queryErr } = await supabase
    .from('point_transactions')
    .select('id, user_id, amount')
    .lt('expires_at', now)
    .gt('amount', 0)
    .neq('type', 'expire')
    .order('expires_at', { ascending: true })
    .limit(500)

  if (queryErr) {
    console.error('❌ 查詢過期點數失敗:', queryErr)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  if (!expiredTransactions || expiredTransactions.length === 0) {
    return NextResponse.json({ message: '無過期點數', expiredUsersCount: 0, totalExpiredPoints: 0 })
  }

  // 按 user_id 分組計算每個用戶的過期點數
  const userExpiredMap = new Map<string, { total: number; txIds: string[] }>()
  for (const tx of expiredTransactions) {
    const existing = userExpiredMap.get(tx.user_id) || { total: 0, txIds: [] }
    existing.total += tx.amount
    existing.txIds.push(tx.id)
    userExpiredMap.set(tx.user_id, existing)
  }

  // 逐個用戶處理過期點數
  for (const [userId, { total, txIds }] of userExpiredMap) {
    // 查詢用戶當前餘額
    const { data: userPoints } = await supabase
      .from('user_points')
      .select('balance')
      .eq('user_id', userId)
      .single()

    const currentBalance = userPoints?.balance || 0
    // 實際扣除不超過當前餘額（防止負數）
    const actualDeduct = Math.min(total, currentBalance)

    if (actualDeduct <= 0) {
      // 餘額已經是 0，只需要標記交易為已過期
      for (const txId of txIds) {
        await supabase
          .from('point_transactions')
          .update({ type: 'expire' })
          .eq('id', txId)
      }
      continue
    }

    const newBalance = currentBalance - actualDeduct

    // 原子更新用戶餘額：帶 .gte('balance', actualDeduct) 條件防止併發扣成負數
    const { error: updateErr, count: updateCount } = await supabase
      .from('user_points')
      .update({ balance: newBalance })
      .eq('user_id', userId)
      .gte('balance', actualDeduct) // 確保餘額足夠才扣除

    if (updateErr) {
      console.error(`❌ 更新用戶 ${userId} 餘額失敗:`, updateErr)
      continue
    }

    // 如果 .gte 條件不滿足（餘額在查詢後被其他操作扣減），count 會是 0
    if (updateCount === 0) {
      console.warn(`⚠️ 用戶 ${userId} 餘額不足以扣除 ${actualDeduct} 點（可能併發操作），跳過`)
      continue
    }

    // 插入過期扣除的交易記錄
    await supabase.from('point_transactions').insert({
      user_id: userId,
      type: 'expire',
      amount: -actualDeduct,
      balance_after: newBalance,
      description: `${actualDeduct} 點已過期`,
    })

    // 標記原始交易為已處理（改 type 為 expire 防止重複處理）
    for (const txId of txIds) {
      await supabase
        .from('point_transactions')
        .update({ type: 'expire' })
        .eq('id', txId)
    }

    expiredUsersCount++
    totalExpiredPoints += actualDeduct
    console.info(`✅ 用戶 ${userId} 過期 ${actualDeduct} 點，餘額 ${currentBalance} → ${newBalance}`)
  }

  return NextResponse.json({
    message: '點數過期處理完成',
    expiredUsersCount,
    totalExpiredPoints,
    processedTransactions: expiredTransactions.length,
  })
}
