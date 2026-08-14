// v5.10.325 (P0 #1 監控對齊)
// 接收 client-side Web Vital metric、寫進 Vercel logs
// 後續可接 Supabase analytics table 做歷史趨勢

import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'
import { canonicalizeTelemetryPath } from '@/lib/security/private-route-redaction'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const limit = new Map<string, { count: number; resetTime: number }>()
const PER_MIN = 60 // 一個 user 一次 page load 最多 ~6 個 vital、60/min 含 10 個 page 已充裕
const MAX_BODY = 4096

type VitalName = 'LCP' | 'INP' | 'FCP' | 'CLS' | 'TTFB' | 'FID'
type VitalRating = 'good' | 'needs-improvement' | 'poor'

interface ParsedVital {
  name: VitalName
  value: number
  rating: VitalRating
  page: string
}

const VITAL_NAMES = new Set<VitalName>(['LCP', 'INP', 'FCP', 'CLS', 'TTFB', 'FID'])
const VITAL_RATINGS = new Set<VitalRating>(['good', 'needs-improvement', 'poor'])
const VITAL_KEYS = new Set([
  'id',
  'name',
  'value',
  'rating',
  'delta',
  'navigationType',
  'page',
  'ts',
])

function parseVitalPayload(value: unknown): ParsedVital | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (Object.keys(payload).some((key) => !VITAL_KEYS.has(key))) return null
  if (typeof payload.name !== 'string' || !VITAL_NAMES.has(payload.name as VitalName)) return null
  if (typeof payload.rating !== 'string' || !VITAL_RATINGS.has(payload.rating as VitalRating)) return null
  if (
    typeof payload.value !== 'number'
    || !Number.isFinite(payload.value)
    || payload.value < 0
    || payload.value > 600_000
  ) {
    return null
  }
  const page = canonicalizeTelemetryPath(payload.page)
  if (!page) return null
  return {
    name: payload.name as VitalName,
    value: payload.value,
    rating: payload.rating as VitalRating,
    page,
  }
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
    const contentLength = request.headers.get('content-length')
    if (contentLength !== null) {
      if (!/^\d+$/u.test(contentLength)) {
        return new NextResponse(null, { status: 400 })
      }
      if (Number(contentLength) > MAX_BODY) {
        return new NextResponse(null, { status: 413 })
      }
    }

    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > MAX_BODY) {
      return new NextResponse(null, { status: 413 })
    }

    let rawPayload: unknown
    try {
      rawPayload = JSON.parse(body)
    } catch {
      return new NextResponse(null, { status: 400 })
    }

    const payload = parseVitalPayload(rawPayload)
    if (!payload) return new NextResponse(null, { status: 204 })

    // 寫進 Vercel logs(後續可接 Supabase / Datadog)
    console.info('[WEB-VITAL]', JSON.stringify({
      ts: new Date().toISOString(),
      name: payload.name,
      value: payload.value,
      rating: payload.rating,
      page: payload.page,
    }))

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
