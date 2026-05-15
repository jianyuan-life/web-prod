import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

// GET — 取得當前生效的促銷活動（無需認證，前端要讀）
export async function GET() {
  try {
    const supabase = getSupabase()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('promotions')
      .select('id, name, discount_percent, end_at, applicable_plans')
      .eq('is_active', true)
      .lte('start_at', now)
      .gte('end_at', now)
      .order('discount_percent', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('查詢促銷活動失敗:', error)
      return NextResponse.json({ promotion: null })
    }

    if (!data) {
      return NextResponse.json({ promotion: null })
    }

    return NextResponse.json({
      promotion: {
        id: data.id,
        name: data.name,
        discountPercent: data.discount_percent,
        endAt: data.end_at,
        applicablePlans: data.applicable_plans,
      },
    })
  } catch (err) {
    console.error('促銷 API 錯誤:', err)
    return NextResponse.json({ promotion: null })
  }
}
