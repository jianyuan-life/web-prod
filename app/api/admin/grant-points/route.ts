import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// POST — 管理員手動發放/扣除積分
// v5.4.8 P3 修(對齊 v5.4.3 前端 UI、Codex C3 P2 audit log 完整性):
//   - 接受負數 points(扣點)
//   - 扣點不可讓 balance < 0
//   - audit log 加 before_balance + after_balance + delta + action(grant/deduct)
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  try {
    const { key, email, points, description } = await req.json()
    const authFail = checkAdminAuth(req, key)
    if (authFail) return authFail
    if (!email || typeof points !== 'number' || points === 0) {
      return NextResponse.json({ error: '請提供 Email 和非零積分數量(可為負數扣點)' }, { status: 400 })
    }
    if (Math.abs(points) > 10000) {
      return NextResponse.json({ error: '單次絕對值最多 10,000 點' }, { status: 400 })
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: '請填寫操作原因(audit log 必含)' }, { status: 400 })
    }

    const isDeduct = points < 0
    const action = isDeduct ? 'deduct_points' : 'grant_points'

    const supabase = getSupabase()

    // v5.4.8 P0 Codex 修:listUsers 分頁問題、改用 search-users RPC 或全量分頁查
    // 暫用 search 模式:多頁 fetch 直到找到 OR 達上限
    let user: { id: string; email: string | undefined } | undefined
    let nextPage = 1
    const MAX_PAGES = 50  // 每頁 1000、最多查 50000 用戶
    while (nextPage <= MAX_PAGES) {
      const { data, error: listErr } = await supabase.auth.admin.listUsers({ page: nextPage, perPage: 1000 })
      if (listErr) {
        return NextResponse.json({ error: `查詢用戶列表失敗:${listErr.message}` }, { status: 500 })
      }
      const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (found) {
        user = { id: found.id, email: found.email }
        break
      }
      if (data.users.length < 1000) break  // 已最後一頁
      nextPage++
    }
    if (!user) {
      return NextResponse.json({ error: `找不到 Email 為 ${email} 的用戶(查 ${nextPage} 頁)` }, { status: 404 })
    }

    // v5.4.16 P1 修(Codex 真審):用 atomic RPC 替代多步操作
    // 解原跨表 race condition(update + insert 不在同 transaction)
    // RPC 內部用 SELECT FOR UPDATE 鎖列 + 同 transaction insert
    // 若 RPC 不存在(migration 未跑)、fallback 舊邏輯
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_grant_or_deduct_points', {
      p_user_id: user.id,
      p_points: points,
      p_description: description.trim(),
      p_reference_id: `admin_${Date.now()}`,
    })

    let beforeBalance: number
    let newBalance: number

    if (rpcErr && (rpcErr.message.includes('function') || rpcErr.code === '42883')) {
      // RPC 不存在(migration 未跑)、fallback 舊邏輯(optimistic lock)
      console.warn('[grant-points] RPC admin_grant_or_deduct_points 不存在、fallback 舊邏輯')
      const { data: existing, error: selErr } = await supabase
        .from('user_points')
        .select('balance, total_earned, total_used')
        .eq('user_id', user.id)
        .maybeSingle()
      if (selErr) {
        return NextResponse.json({ error: `查詢餘額失敗:${selErr.message}` }, { status: 500 })
      }
      beforeBalance = existing?.balance || 0
      newBalance = beforeBalance + points
      if (newBalance < 0) {
        return NextResponse.json({
          error: `扣點 ${Math.abs(points)} 點會讓餘額變負(目前 ${beforeBalance}、扣後 ${newBalance})`,
          before_balance: beforeBalance,
          attempted_delta: points,
        }, { status: 400 })
      }
      const newEarned = (existing?.total_earned || 0) + (isDeduct ? 0 : points)
      const newUsed = (existing?.total_used || 0) + (isDeduct ? Math.abs(points) : 0)
      if (existing) {
        const { data: updated, error: updErr } = await supabase.from('user_points').update({
          balance: newBalance,
          total_earned: newEarned,
          total_used: newUsed,
        })
          .eq('user_id', user.id)
          .eq('balance', beforeBalance)
          .select()
        if (updErr) return NextResponse.json({ error: `更新餘額失敗:${updErr.message}` }, { status: 500 })
        if (!updated || updated.length === 0) {
          return NextResponse.json({ error: 'race condition、請重試', before_balance: beforeBalance }, { status: 409 })
        }
      } else {
        if (isDeduct) {
          return NextResponse.json({ error: '新用戶無歷史餘額、無法扣點' }, { status: 400 })
        }
        const { error: insErr } = await supabase.from('user_points').insert({
          user_id: user.id, balance: points, total_earned: points, total_used: 0,
        })
        if (insErr) return NextResponse.json({ error: `初始化失敗:${insErr.message}` }, { status: 500 })
      }
      const { error: txErr } = await supabase.from('point_transactions').insert({
        user_id: user.id,
        type: isDeduct ? 'admin_deduct' : 'admin_grant',
        amount: points,
        balance_after: newBalance,
        description: description.trim(),
        reference_id: `admin_${Date.now()}`,
      })
      if (txErr) return NextResponse.json({ error: `寫入交易失敗:${txErr.message}` }, { status: 500 })
    } else if (rpcErr) {
      // RPC 真錯(餘額不足、新用戶扣點等業務錯)
      const isBusinessErr = rpcErr.message.includes('餘額變負') || rpcErr.message.includes('無法扣點')
      return NextResponse.json({
        error: rpcErr.message,
      }, { status: isBusinessErr ? 400 : 500 })
    } else {
      // RPC 成功、解析結果(回傳 array)
      const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
      beforeBalance = row?.before_balance ?? 0
      newBalance = row?.after_balance ?? 0
    }

    // 稽核紀錄(Codex C3 P2:加 before/after balance + delta + action)
    await writeAuditLog(req, action, 'user', user.id, {
      email,
      action,
      delta: points,
      before_balance: beforeBalance,
      after_balance: newBalance,
      description: description.trim(),
    })

    return NextResponse.json({
      success: true,
      email,
      action,
      delta: points,
      beforeBalance,
      newBalance,
    })
  } catch (err) {
    console.error('積分操作失敗:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
