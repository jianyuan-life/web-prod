// ============================================================
// Cron 點數過期端點 — 自動清除已過期的點數
// 每天凌晨 3 點由 Vercel Cron 呼叫一次
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

export const maxDuration = 60

export async function GET(req: NextRequest) {
  // v5.10.279 fail-closed auth(Codex P0#3)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const supabase = createServiceClient()

  const now = new Date().toISOString()
  let expiredUsersCount = 0
  let totalExpiredPoints = 0

  // 查詢已過期且尚未處理的點數交易（有 expires_at、已過期、type 不是 expire、amount > 0）
  // v5.3.33：補強 race 防護——查詢加 not('expires_at', 'is', null) 避免漏判
  const { data: expiredTransactions, error: queryErr } = await supabase
    .from('point_transactions')
    .select('id, user_id, amount')
    .not('expires_at', 'is', null)
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
  // v5.3.33：改順序——先原子搶佔 txs 標記為 expire（防 race），再扣餘額 + 寫 log
  // 若中途失敗，txs 已被標記不會重複處理；餘額可人工補救（總比重複扣款好）
  for (const [userId, { total, txIds }] of userExpiredMap) {
    // 步驟 1：原子搶佔——只有 type != 'expire' 的 tx 能被搶到
    const { data: grabbed, error: grabErr } = await supabase
      .from('point_transactions')
      .update({ type: 'expire' })
      .in('id', txIds)
      .neq('type', 'expire') // 再次驗證，防 cron 重疊
      .select('id, amount')

    if (grabErr) {
      console.error(`❌ 搶佔用戶 ${userId} 過期 tx 失敗:`, grabErr)
      continue
    }

    const grabbedTxs = grabbed || []
    if (grabbedTxs.length === 0) {
      // 全部已被其他程序搶佔（同時運行的 cron）
      console.info(`⏭️ 用戶 ${userId} 的過期 tx 已被其他程序處理，跳過`)
      continue
    }

    // 以實際搶到的 tx 重新計算總額
    const grabbedTotal = grabbedTxs.reduce((s, t) => s + (t.amount || 0), 0)

    // 步驟 2：查詢用戶當前餘額
    const { data: userPoints } = await supabase
      .from('user_points')
      .select('balance')
      .eq('user_id', userId)
      .single()

    const currentBalance = userPoints?.balance || 0
    // 實際扣除不超過當前餘額（防止負數）
    const actualDeduct = Math.min(grabbedTotal, currentBalance)

    if (actualDeduct <= 0) {
      // 餘額已經是 0，tx 標記完成即可
      continue
    }

    const newBalance = currentBalance - actualDeduct

    // 步驟 3：原子更新用戶餘額：帶 .gte('balance', actualDeduct) 條件防止併發扣成負數
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

    // 步驟 4：插入過期扣除的交易記錄
    await supabase.from('point_transactions').insert({
      user_id: userId,
      type: 'expire',
      amount: -actualDeduct,
      balance_after: newBalance,
      description: `${actualDeduct} 點已過期`,
    })

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
