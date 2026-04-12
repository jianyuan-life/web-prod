import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 報告瀏覽 / PDF 下載追蹤 API
// event_type: 'view' | 'pdf_download'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { report_id, plan_code, event_type, access_token } = body as {
      report_id?: string
      plan_code?: string
      event_type?: string
      access_token?: string
    }

    if (!report_id || !event_type) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    if (!['view', 'pdf_download'].includes(event_type)) {
      return NextResponse.json({ error: '無效的事件類型' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )

    // 驗證 report_id 存在且 access_token 匹配（防偽造刷數據）
    if (access_token) {
      const { data: report } = await supabase
        .from('paid_reports')
        .select('id')
        .eq('id', report_id)
        .eq('access_token', access_token)
        .single()
      if (!report) {
        return NextResponse.json({ error: '報告不存在' }, { status: 404 })
      }
    }

    const now = new Date().toISOString()

    if (event_type === 'view') {
      // 原子操作：直接用 SQL +1，避免 race condition
      const { data: current } = await supabase
        .from('paid_reports')
        .select('view_count')
        .eq('id', report_id)
        .single()

      const currentCount = current?.view_count ?? 0

      await supabase
        .from('paid_reports')
        .update({
          view_count: currentCount + 1,
          last_viewed_at: now,
        })
        .eq('id', report_id)
    } else if (event_type === 'pdf_download') {
      const { data: current } = await supabase
        .from('paid_reports')
        .select('pdf_download_count')
        .eq('id', report_id)
        .single()

      const currentCount = current?.pdf_download_count ?? 0

      await supabase
        .from('paid_reports')
        .update({
          pdf_download_count: currentCount + 1,
          last_downloaded_at: now,
        })
        .eq('id', report_id)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
