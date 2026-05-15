import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser as getAuthUserHelper } from '@/lib/auth-helper'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getServiceSupabase() {
  return createServiceClient()
}

// 從 Authorization header 或 cookie 驗證用戶身份，回傳 user_id 和 email
async function getAuthUser(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const { email, userId } = await getAuthUserHelper(req)
  if (!email || !userId) return null
  return { id: userId, email }
}

// 驗證用戶是否為此報告的付費客戶
async function verifyReportOwner(reportId: string, userEmail: string): Promise<boolean> {
  const supabase = getServiceSupabase()
  // v5.10.281 soft delete filter:軟刪報告不可寄 feedback
  const { data } = await supabase
    .from('paid_reports')
    .select('customer_email')
    .eq('id', reportId)
    .is('deleted_at', null)
    .single()
  if (!data?.customer_email) return false
  return data.customer_email.toLowerCase() === userEmail.toLowerCase()
}

const VALID_SECTIONS = [
  '命格名片', '事業', '財運', '感情', '健康',
  '大運', '流年', '刻意練習', '寫給你的話',
  '出門訣', '家族互動', '合盤分析',
]

// POST — 提交或更新反饋（upsert）
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  let body: { report_id?: string; rating?: number; most_valuable?: string[]; suggestion?: string; would_recommend?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { report_id, rating, most_valuable, suggestion, would_recommend } = body

  // 驗證必填欄位
  if (!report_id || typeof report_id !== 'string') {
    return NextResponse.json({ error: '缺少 report_id' }, { status: 400 })
  }
  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json({ error: '評分必須為 1-5 的整數' }, { status: 400 })
  }

  // 驗證 most_valuable 陣列
  if (most_valuable && Array.isArray(most_valuable)) {
    for (const item of most_valuable) {
      if (!VALID_SECTIONS.includes(item)) {
        return NextResponse.json({ error: `無效的選項：${item}` }, { status: 400 })
      }
    }
  }

  // 驗證 suggestion 長度
  if (suggestion && typeof suggestion === 'string' && suggestion.length > 500) {
    return NextResponse.json({ error: '改善建議最多 500 字' }, { status: 400 })
  }

  // 驗證用戶是否為報告擁有者
  const isOwner = await verifyReportOwner(report_id, user.email)
  if (!isOwner) {
    return NextResponse.json({ error: '您不是此報告的擁有者' }, { status: 403 })
  }

  const supabase = getServiceSupabase()

  // Upsert：新增或更新（依 report_id + user_id 唯一約束）
  const { data, error } = await supabase
    .from('report_feedback')
    .upsert(
      {
        report_id,
        user_id: user.id,
        rating,
        most_valuable: most_valuable || [],
        suggestion: suggestion?.trim() || null,
        would_recommend: would_recommend ?? null,
      },
      { onConflict: 'report_id,user_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('反饋儲存失敗:', error)
    return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 500 })
  }

  // v5.3.2：< 3 星 → Telegram 告警
  if (rating < 3) {
    try {
      const { notifyLowRating } = await import('@/lib/ai/observability/telegram')
      await notifyLowRating(report_id, rating, suggestion || undefined)
    } catch (e) {
      console.warn('低評分告警發送失敗:', e)
    }
  }

  return NextResponse.json({ success: true, feedback: data })
}

// GET — 取得自己對某份報告的反饋
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const reportId = req.nextUrl.searchParams.get('report_id')
  if (!reportId) {
    return NextResponse.json({ error: '缺少 report_id' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('report_feedback')
    .select('*')
    .eq('report_id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ feedback: data })
}
