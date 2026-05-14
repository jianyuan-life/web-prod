import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthEmail } from '@/lib/auth-helper'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 搜尋已完成的人生藍圖（C 方案）報告（需登入）
// GET /api/checkout/search-reports?email=xxx          → 取得該 email 下所有已完成 C 報告
// GET /api/checkout/search-reports?q=keyword           → 用姓名模糊搜尋
export async function GET(req: NextRequest) {
  try {
    // 身份驗證：必須登入才能使用
    const authEmail = await getAuthEmail(req)
    if (!authEmail) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const emailParam = searchParams.get('email')?.trim().toLowerCase()
    const query = searchParams.get('q')?.trim()

    // 安全限制：email 參數必須與登入用戶一致，防止查詢其他用戶的報告
    if (emailParam && emailParam !== authEmail.toLowerCase()) {
      return NextResponse.json({ error: '只能查詢自己的報告' }, { status: 403 })
    }

    // 如果沒帶 email 也沒帶 q，但有登入 → 自動用登入 email 查詢「我的報告」
    const email = emailParam || (!query ? authEmail : null)

    if (!email && !query) {
      return NextResponse.json({ error: '請提供 email 或搜尋關鍵字' }, { status: 400 })
    }

    const supabase = getSupabase()

    if (email) {
      // 精確搜尋：取得該 email 下所有已完成的 C 方案報告
      // v5.10.283 soft delete filter:已軟刪報告不應出現在 G15 家族藍圖選單
      // v5.10.293:select user_id 供 audit log 比對
      const { data, error } = await supabase
        .from('paid_reports')
        .select('id, client_name, plan_code, status, created_at, user_id')
        .eq('customer_email', email)
        .eq('plan_code', 'C')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('search-reports DB error:', error)
        return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
      }

      // v5.10.293 audit log:G15 家族成員查詢 = email_fallback 路徑
      try {
        const { logAccessMatch } = await import('@/lib/auth-helper-server')
        for (const r of (data || [])) {
          void logAccessMatch(r.id, 'email_fallback', { email })
        }
      } catch { /* silent */ }

      return NextResponse.json({
        reports: (data || []).map(r => ({
          id: r.id,
          name: r.client_name || '未知',
          createdAt: r.created_at,
        })),
      })
    }

    // 模糊搜尋：用姓名搜尋（ilike）
    // 安全限制：只搜尋當前登入用戶 email 下的報告，防止探測其他用戶資料
    if (query && query.length >= 1) {
      // v5.10.283 soft delete filter:已軟刪報告不應出現在搜尋結果
      const { data, error } = await supabase
        .from('paid_reports')
        .select('id, client_name, plan_code, status, created_at')
        .eq('plan_code', 'C')
        .eq('status', 'completed')
        .ilike('customer_email', authEmail)
        .ilike('client_name', `%${query.replace(/[%_]/g, '\\$&')}%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('search-reports DB error:', error)
        return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
      }

      return NextResponse.json({
        reports: (data || []).map(r => ({
          id: r.id,
          name: r.client_name || '未知',
          createdAt: r.created_at,
        })),
      })
    }

    return NextResponse.json({ reports: [] })
  } catch (err) {
    console.error('search-reports error:', err)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
