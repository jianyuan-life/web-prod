import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)
import { canonicalizeTelemetryPath } from '@/lib/security/private-route-redaction'

// 延遲初始化：避免建置時 env var 不存在報錯，且使用 service role key 確保 RLS 不阻擋寫入
function getSupabase() {
  return createServiceClient()
}

type TrackEventType = 'pageview' | 'duration'

interface TrackEvent {
  sessionId: string | null
  pagePath: string
  eventType: TrackEventType
  referrer: string | null
  durationSeconds?: number
}

const TRACK_KEYS = new Set([
  'session_id',
  'page_path',
  'event_type',
  'referrer',
  'duration_seconds',
  'metadata',
])
const MAX_BODY_BYTES = 4096

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function referrerOrigin(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function parseTrackEvent(value: unknown): TrackEvent | null {
  if (!isObjectRecord(value)) return null
  if (Object.keys(value).some((key) => !TRACK_KEYS.has(key))) return null

  const eventType = value.event_type === undefined ? 'pageview' : value.event_type
  if (eventType !== 'pageview' && eventType !== 'duration') return null

  const pagePath = canonicalizeTelemetryPath(value.page_path)
  if (!pagePath) return null

  let sessionId: string | null = null
  if (value.session_id !== undefined && value.session_id !== null) {
    if (typeof value.session_id !== 'string' || !/^[a-z\d_-]{8,128}$/iu.test(value.session_id)) {
      return null
    }
    sessionId = value.session_id
  }

  const referrer = referrerOrigin(value.referrer)
  if (value.referrer !== undefined && value.referrer !== null && value.referrer !== '' && !referrer) {
    return null
  }

  if (eventType === 'duration') {
    if (
      typeof value.duration_seconds !== 'number'
      || !Number.isInteger(value.duration_seconds)
      || value.duration_seconds < 1
      || value.duration_seconds > 1800
    ) {
      return null
    }
    return {
      sessionId,
      pagePath,
      eventType,
      referrer,
      durationSeconds: value.duration_seconds,
    }
  }

  if (value.duration_seconds !== undefined) return null
  return { sessionId, pagePath, eventType, referrer }
}

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      return new NextResponse(null, { status: 400 })
    }
    if (Number(contentLength) > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }
  }

  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const event = parseTrackEvent(body)
  if (!event) return new NextResponse(null, { status: 204 })

  try {
    const userAgent = req.headers.get('user-agent') || ''

    // 簡單判斷設備類型
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent)
    const isTablet = /iPad|Tablet/i.test(userAgent)
    const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

    const rawCountry = req.headers.get('cf-ipcountry') ||
                       req.headers.get('x-vercel-ip-country') || ''
    const country = /^[a-z]{2}$/iu.test(rawCountry) ? rawCountry.toUpperCase() : null

    await getSupabase().from('visitor_events').insert({
      session_id: event.sessionId,
      ip_address: null,
      country,
      page_path: event.pagePath,
      event_type: event.eventType,
      referrer: event.referrer,
      device_type: deviceType,
      ...(event.durationSeconds === undefined ? {} : { duration_seconds: event.durationSeconds }),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
