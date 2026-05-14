// v5.10.325 (P0 #4 CSP 強化第二步)
// 接收瀏覽器 CSP violation 報告 — 用於監測「哪些 inline script / 第三方 domain 被擋」
// 配合 next.config.ts 的 CSP report-uri / report-to
//
// CSP 違反時瀏覽器自動 POST JSON 來這個 endpoint、不需任何認證
// 為了避免被惡意大量灌、加 in-memory rate limit + max body size

import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// 每 IP 每分鐘最多 30 次 CSP report(高於這個 = 被攻擊或瀏覽器 bug、靜默丟棄)
const cspReportLimit = new Map<string, { count: number; resetTime: number }>()
const CSP_LIMIT_PER_MIN = 30
const MAX_BODY_BYTES = 10 * 1024 // 10 KB

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()

  // Rate limit
  const entry = cspReportLimit.get(ip)
  if (entry && now < entry.resetTime) {
    if (entry.count >= CSP_LIMIT_PER_MIN) {
      return new NextResponse(null, { status: 204 }) // 靜默丟、不洩漏資訊給攻擊者
    }
    entry.count++
  } else {
    cspReportLimit.set(ip, { count: 1, resetTime: now + 60_000 })
  }

  try {
    // Content-Type 檢查(防止任意 POST body 灌)
    const contentType = request.headers.get('content-type') || ''
    if (
      !contentType.includes('application/csp-report') &&
      !contentType.includes('application/json') &&
      !contentType.includes('application/reports+json')
    ) {
      return new NextResponse(null, { status: 415 })
    }

    // Body 大小限制
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }

    const body = await request.text()
    if (body.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }

    let report: unknown
    try {
      report = JSON.parse(body)
    } catch {
      return new NextResponse(null, { status: 400 })
    }

    // 記錄到 Vercel logs(透過 console.warn、production 自動進 log drain)
    // 之後可以接 Sentry / Datadog / 客製 Supabase table
    const ua = request.headers.get('user-agent')?.slice(0, 200) || 'unknown'
    console.warn('[CSP-VIOLATION]', JSON.stringify({
      ts: new Date().toISOString(),
      ip,
      ua,
      report,
    }))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // 不洩漏錯誤細節給瀏覽器
    return new NextResponse(null, { status: 204 })
  }
}

// CSP report-to 用 OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://jianyuan.life',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
