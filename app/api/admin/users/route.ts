import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

// 延遲初始化 Supabase（避免建置時 env var 不存在報錯）
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const sort = req.nextUrl.searchParams.get('sort') || 'created_at'
  const order = req.nextUrl.searchParams.get('order') || 'desc'

  try {
    // 取得所有用戶（Supabase Admin API，分頁取前 500 位）
    const { data: usersData, error: usersError } = await getSupabase().auth.admin.listUsers({
      page: 1,
      perPage: 500,
    })

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const users = usersData?.users || []

    // 取得所有付費報告（用 customer_email 關聯用戶，因為 paid_reports 沒有 user_id 欄位）
    // v5.10.287:soft delete filter — admin/users 不算軟刪
    const { data: reports } = await getSupabase()
      .from('paid_reports')
      .select('id, client_name, customer_email, plan_code, amount_usd, status, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    // 按 customer_email 分組報告
    const reportsByEmail: Record<string, typeof reports> = {}
    for (const r of (reports || [])) {
      const email = (r.customer_email || '').toLowerCase().trim()
      if (!email) continue
      if (!reportsByEmail[email]) reportsByEmail[email] = []
      reportsByEmail[email]!.push(r)
    }

    // 組合用戶資料
    const userList = users.map(u => {
      const email = (u.email || '').toLowerCase().trim()
      const userReports = reportsByEmail[email] || []
      const totalSpent = userReports.reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)
      return {
        id: u.id,
        email: u.email || '',
        full_name: u.user_metadata?.full_name || '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        purchase_count: userReports.length,
        total_spent: Math.round(totalSpent * 100) / 100,
        reports: userReports.map(r => ({
          id: r.id,
          plan_code: (r.plan_code || '').split(/\s/)[0],
          client_name: r.client_name,
          amount_usd: r.amount_usd,
          status: r.status,
          created_at: r.created_at,
        })),
      }
    })

    // 排序
    userList.sort((a, b) => {
      if (sort === 'purchase_count') {
        return order === 'desc' ? b.purchase_count - a.purchase_count : a.purchase_count - b.purchase_count
      }
      if (sort === 'total_spent') {
        return order === 'desc' ? b.total_spent - a.total_spent : a.total_spent - b.total_spent
      }
      // 預設按註冊時間
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      return order === 'desc' ? db - da : da - db
    })

    return NextResponse.json({
      total: userList.length,
      users: userList,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '查詢失敗' }, { status: 500 })
  }
}
