import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthEmail } from '@/lib/auth-helper'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 驗證每個 email 是否有已完成的人生藍圖（C 方案）報告
export async function POST(req: NextRequest) {
  try {
    // 身份驗證：必須登入才能使用（防止任意探測 email）
    const authEmail = await getAuthEmail(req)
    if (!authEmail) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 })
    }

    const { emails } = await req.json()

    if (!Array.isArray(emails) || emails.length < 2) {
      return NextResponse.json({ error: '至少需要 2 位家庭成員' }, { status: 400 })
    }
    if (emails.length > 8) {
      return NextResponse.json({ error: '最多 8 位家庭成員' }, { status: 400 })
    }

    const supabase = getSupabase()
    const results = []

    for (const email of emails) {
      const trimmed = (email || '').trim().toLowerCase()
      if (!trimmed || !trimmed.includes('@')) {
        results.push({ email: trimmed, valid: false, error: '請輸入有效的 Email' })
        continue
      }

      // 查詢該 email 是否有 completed 的 C 方案報告
      const { data: reports, error: dbErr } = await supabase
        .from('paid_reports')
        .select('id, client_name, status, plan_code')
        .eq('customer_email', trimmed)
        .eq('plan_code', 'C')
        .eq('status', 'completed')
        .limit(1)

      if (dbErr) {
        console.error('verify-family DB error:', dbErr)
        results.push({ email: trimmed, valid: false, error: '系統查詢失敗，請稍後再試' })
        continue
      }

      if (!reports || reports.length === 0) {
        results.push({ email: trimmed, valid: false, error: '找不到已完成的人生藍圖報告，請確認 Email 是否正確' })
      } else {
        results.push({ email: trimmed, valid: true, name: reports[0].client_name || '' })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('verify-family error:', err)
    return NextResponse.json({ error: '驗證失敗' }, { status: 500 })
  }
}
