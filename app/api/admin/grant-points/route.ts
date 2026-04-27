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

    // 取得當前餘額(before_balance)
    const { data: existing, error: selErr } = await supabase
      .from('user_points')
      .select('balance, total_earned, total_used')
      .eq('user_id', user.id)
      .maybeSingle()
    if (selErr) {
      return NextResponse.json({ error: `查詢餘額失敗:${selErr.message}` }, { status: 500 })
    }

    const beforeBalance = existing?.balance || 0
    const newBalance = beforeBalance + points  // points 可為負

    // 防呆:扣點不可讓餘額 < 0
    if (newBalance < 0) {
      return NextResponse.json({
        error: `扣點 ${Math.abs(points)} 點會讓餘額變負(目前 ${beforeBalance}、扣後 ${newBalance})`,
        before_balance: beforeBalance,
        attempted_delta: points,
      }, { status: 400 })
    }

    // 更新 user_points(扣點 total_used+、發點 total_earned+)
    const newEarned = (existing?.total_earned || 0) + (isDeduct ? 0 : points)
    const newUsed = (existing?.total_used || 0) + (isDeduct ? Math.abs(points) : 0)

    if (existing) {
      // v5.4.8 P1 修:optimistic locking(race condition 防呆)
      // 加 .eq('balance', beforeBalance) 條件、若 race conflict、affected = 0
      const { data: updated, error: updErr } = await supabase.from('user_points').update({
        balance: newBalance,
        total_earned: newEarned,
        total_used: newUsed,
      })
        .eq('user_id', user.id)
        .eq('balance', beforeBalance)  // optimistic lock
        .select()
      if (updErr) {
        return NextResponse.json({ error: `更新餘額失敗:${updErr.message}` }, { status: 500 })
      }
      if (!updated || updated.length === 0) {
        return NextResponse.json({
          error: 'race condition:餘額在查詢與更新之間被別人改了、請重試',
          before_balance: beforeBalance,
          attempted_delta: points,
        }, { status: 409 })
      }
    } else {
      // 新用戶:扣點不允許(無歷史餘額)
      if (isDeduct) {
        return NextResponse.json({ error: '新用戶無歷史餘額、無法扣點' }, { status: 400 })
      }
      const { error: insErr } = await supabase.from('user_points').insert({
        user_id: user.id,
        balance: points,
        total_earned: points,
        total_used: 0,
      })
      if (insErr) {
        return NextResponse.json({ error: `初始化餘額失敗:${insErr.message}` }, { status: 500 })
      }
    }

    // 記錄交易(amount 帶符號、type 區分 grant vs deduct)
    // v5.4.8 P2 註:type='admin_deduct' 為新增、若 DB enum/check constraint 限制、insert 會失敗
    // 已知 type 欄位:admin_grant / signup_bonus / referral_reward / repeat_purchase / use_at_checkout / transfer_in/out
    // admin_deduct 為新 enum、若 schema check_type constraint 限制需先 migration 加入
    const { error: txErr } = await supabase.from('point_transactions').insert({
      user_id: user.id,
      type: isDeduct ? 'admin_deduct' : 'admin_grant',
      amount: points,
      balance_after: newBalance,
      description: description.trim(),
      reference_id: `admin_${Date.now()}`,
    })
    if (txErr) {
      // 若是 enum constraint、fallback 用 admin_grant + 註明是扣點
      if (isDeduct && (txErr.message.includes('check') || txErr.message.includes('enum') || txErr.message.includes('constraint'))) {
        await supabase.from('point_transactions').insert({
          user_id: user.id,
          type: 'admin_grant',
          amount: points,  // 仍帶負號
          balance_after: newBalance,
          description: `[扣點] ${description.trim()}`,
          reference_id: `admin_${Date.now()}`,
        })
      } else {
        // 非 constraint 錯、回 500
        return NextResponse.json({ error: `寫入交易紀錄失敗:${txErr.message}` }, { status: 500 })
      }
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
