// v5.10.325 (P0 #1 監控對齊)
// 接收 client-side Web Vital metric、寫進 Vercel logs
// 後續可接 Supabase analytics table 做歷史趨勢

import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const limit = new Map<string, { count: number; resetTime: number }>()
const PER_MIN = 60 // 一個 user 一次 page load 最多 ~6 個 vital、60/min 含 10 個 page 已充裕
const MAX_BODY = 4096

interface VitalPayload {
  id?: unknown
  name?: unknown
  value?: unknown
  rating?: unknown
  delta?: unknown
  navigationType?: unknown
  page?: unknown
  ts?: unknown
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()

  // Rate limit
  const entry = limit.get(ip)
  if (entry && now < entry.resetTime) {
    if (entry.count >= PER_MIN) {
      return new NextResponse(null, { status: 204 }) // 靜默丟
    }
    entry.count++
  } else {
    limit.set(ip, { count: 1, resetTime: now + 60_000 })
  }

  try {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BODY) {
      return new NextResponse(null, { status: 413 })
    }

    const body = await request.text()
    if (body.length > MAX_BODY) {
      return new NextResponse(null, { status: 413 })
    }

    let payload: VitalPayload
    try {
      payload = JSON.parse(body)
    } catch {
      return new NextResponse(null, { status: 400 })
    }

    // Schema 驗證(寬鬆、有問題就丟)
    const allowed = ['LCP', 'INP', 'FCP', 'CLS', 'TTFB', 'FID']
    if (!allowed.includes(String(payload.name))) {
      return new NextResponse(null, { status: 204 })
    }
    const value = Number(payload.value)
    if (!Number.isFinite(value)) {
      return new NextResponse(null, { status: 204 })
    }

    // 寫進 Vercel logs(後續可接 Supabase / Datadog)
    console.info('[WEB-VITAL]', JSON.stringify({
      ts: new Date().toISOString(),
      ip: ip.slice(0, 16), // 截短匿名化
      name: String(payload.name),
      value,
      rating: String(payload.rating || 'unknown'),
      page: String(payload.page || '/'),
    }))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return new NextResponse(null, { status: 204 })
  }
}
