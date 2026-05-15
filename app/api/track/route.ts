import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

// 延遲初始化：避免建置時 env var 不存在報錯，且使用 service role key 確保 RLS 不阻擋寫入
function getSupabase() {
  return createServiceClient()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { session_id, page_path, event_type = 'pageview', referrer, duration_seconds, metadata } = body

    // 從 request headers 取得 IP 和 user agent
    // Cloudflare 代理時，真實 IP 在 CF-Connecting-IP
    const ip = req.headers.get('cf-connecting-ip') ||
               req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || ''

    // 簡單判斷設備類型
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent)
    const isTablet = /iPad|Tablet/i.test(userAgent)
    const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

    // 地理資訊：Cloudflare 的 CF-IPCountry 最準確（基於真實訪客 IP）
    // 若沒有 Cloudflare 代理才 fallback 到 Vercel 的 geo headers
    const country = req.headers.get('cf-ipcountry') ||
                    req.headers.get('x-vercel-ip-country') || ''
    const city = req.headers.get('x-vercel-ip-city') || ''

    await getSupabase().from('visitor_events').insert({
      session_id,
      ip_address: ip,
      country,
      city: decodeURIComponent(city),
      page_path,
      event_type,
      referrer,
      user_agent: userAgent.slice(0, 500),
      device_type: deviceType,
      duration_seconds,
      metadata,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
