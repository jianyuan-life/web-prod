import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

// 只顯示真實數據，不加虛假基數
const BASE_COUNT = 0

function getServiceSupabase() {
  return createServiceClient()
}

// v5.4.7 P3 強化:支援 type=paid 只回付費報告數(free tools 頁 social proof 用)
// 預設 type=all 維持原 LiveCounter 行為(首頁用)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const statType = url.searchParams.get('type') || 'all'  // 'all' | 'paid' | 'free'

  try {
    const supabase = getServiceSupabase()

    if (statType === 'paid') {
      // v5.10.283 soft delete filter:public LiveCounter 不應算軟刪報告
      const { count, error } = await supabase
        .from('paid_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .is('deleted_at', null)
      if (error) return NextResponse.json({ count: BASE_COUNT, type: statType })
      return NextResponse.json({ count: (count ?? 0) + BASE_COUNT, type: statType })
    }

    if (statType === 'free') {
      const { count, error } = await supabase
        .from('user_analytics')
        .select('*', { count: 'exact', head: true })
      if (error) return NextResponse.json({ count: BASE_COUNT, type: statType })
      return NextResponse.json({ count: (count ?? 0) + BASE_COUNT, type: statType })
    }

    // 預設 'all':免費 + 付費合計(原 LiveCounter 用)
    const { count: freeCount, error: freeErr } = await supabase
      .from('user_analytics')
      .select('*', { count: 'exact', head: true })

    // v5.10.283 soft delete filter:public LiveCounter 不應算軟刪報告
    const { count: paidCount, error: paidErr } = await supabase
      .from('paid_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .is('deleted_at', null)

    if (freeErr && paidErr) {
      return NextResponse.json({ count: BASE_COUNT, type: 'all' })
    }

    const total = (freeCount ?? 0) + (paidCount ?? 0) + BASE_COUNT
    return NextResponse.json({ count: total, type: 'all' })
  } catch {
    return NextResponse.json({ count: BASE_COUNT, type: statType })
  }
}
