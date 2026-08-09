import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helper'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)
import {
  projectG15SearchReports,
  type G15SearchReportRow,
} from '@/lib/checkout/g15-search-results'

function getSupabase() {
  return createServiceClient()
}

// 搜尋已完成的人生藍圖（C 方案）報告（需登入）
// GET /api/checkout/search-reports?email=xxx          → 取得該 email 下所有已完成 C 報告
// GET /api/checkout/search-reports?q=keyword           → 用姓名模糊搜尋
export async function GET(req: NextRequest) {
  try {
    // 身份驗證：必須登入才能使用
    const authUser = await getAuthUser(req)
    if (!authUser.email || !authUser.userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }
    const normalizedAuthEmail = authUser.email.trim().toLowerCase()
    const authUserId = authUser.userId.trim().toLowerCase()

    const { searchParams } = new URL(req.url)
    const emailParam = searchParams.get('email')?.trim().toLowerCase()
    const query = searchParams.get('q')?.trim()

    // 安全限制：email 參數必須與登入用戶一致，防止查詢其他用戶的報告
    if (emailParam && emailParam !== normalizedAuthEmail) {
      return NextResponse.json({ error: '只能查詢自己的報告' }, { status: 403 })
    }

    const supabase = getSupabase()
    const selectColumns = 'id, client_name, plan_code, status, deleted_at, created_at, user_id, customer_email, birth_data'
    const limit = query ? 10 : 20
    const runOwnedQuery = (ownerColumn: 'user_id' | 'customer_email', ownerValue: string) => {
      const baseQuery = supabase
        .from('paid_reports')
        .select(selectColumns)
        .eq('plan_code', 'C')
        .eq('status', 'completed')
      const ownerBound = ownerColumn === 'customer_email'
        ? baseQuery.eq('customer_email', ownerValue).is('user_id', null)
        : baseQuery.eq('user_id', ownerValue)
      const owned = ownerBound
        .is('deleted_at', null)
      const filtered = query
        ? owned.ilike('client_name', `%${query.replace(/[%_]/g, '\\$&')}%`)
        : owned
      return filtered.order('created_at', { ascending: false }).limit(limit)
    }

    // user_id 是現在帳戶的主鍵；精確 email 僅用來找回早期尚未回填 user_id 的舊報告。
    // 分成兩次等值查詢，避免把 email 塞進 PostgREST `.or()` 字串造成 filter injection。
    const [byUserId, byLegacyEmail] = await Promise.all([
      runOwnedQuery('user_id', authUserId),
      runOwnedQuery('customer_email', normalizedAuthEmail),
    ])
    if (byUserId.error || byLegacyEmail.error) {
      console.error('search-reports DB error:', byUserId.error || byLegacyEmail.error)
      return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    }

    const rowsById = new Map<string, G15SearchReportRow>()
    for (const row of [...(byUserId.data || []), ...(byLegacyEmail.data || [])] as G15SearchReportRow[]) {
      rowsById.set(row.id, row)
    }
    const rows = [...rowsById.values()]
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .slice(0, limit)

    try {
      const { logAccessMatch } = await import('@/lib/auth-helper-server')
      for (const row of rows) {
        const matchedVia = row.user_id?.trim().toLowerCase() === authUserId
          ? 'user_id'
          : 'email_fallback'
        void logAccessMatch(row.id, matchedVia, { userId: authUserId, email: normalizedAuthEmail })
      }
    } catch { /* audit log 不阻塞報告選擇 */ }

    return NextResponse.json(projectG15SearchReports(rows))
  } catch (err) {
    console.error('search-reports error:', err)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
