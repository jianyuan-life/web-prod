// T9 v5.10.352 (Master Plan Sprint 7):/api/error-report
// 接 client-side error.tsx 上報、route 進 Sentry / Vercel logs / audit-event
//
// 設計:
// - edge runtime(快、低成本)
// - rate limit 60/min/IP(防客戶 retry loop 灌爆)
// - body max 10KB(防 stack trace 過大)
// - 用 audit-event helper 統一格式

import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'
import { logAuditEvent, makeAuditEvent } from '@/lib/security/audit-event'
import { captureException } from '@/lib/ai/observability/sentry-prod'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const limit = new Map<string, { count: number; resetTime: number }>()
const PER_MIN = 60
const MAX_BODY = 10 * 1024

interface ErrorPayload {
  ts?: unknown
  digest?: unknown
  message?: unknown
  stack?: unknown
  url?: unknown
  ua?: unknown
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()

  // Rate limit
  const entry = limit.get(ip)
  if (entry && now < entry.resetTime) {
    if (entry.count >= PER_MIN) {
      return new NextResponse(null, { status: 204 })
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

    let payload: ErrorPayload
    try {
      payload = JSON.parse(body)
    } catch {
      return new NextResponse(null, { status: 400 })
    }

    // T9 v5.10.353 P1 修(L1 + L4 抓):用 'client-error' type、不再偽冒 rate-limit-exceeded
    // Type guards 防 unknown 強轉 [object Object](L4 抓 P1 #5)
    const safeStr = (v: unknown, max = 500): string => {
      if (typeof v === 'string') return v.slice(0, max)
      if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max)
      return ''
    }
    logAuditEvent(
      makeAuditEvent('client-error', {
        ip,
        pathname: safeStr(payload.url, 200),
        userAgent: safeStr(payload.ua, 200),
        reason: 'client-error-boundary',
        severity: 'warn',
        details: {
          digest: safeStr(payload.digest, 50),
          message: safeStr(payload.message, 500),
          stack: safeStr(payload.stack, 1000),
        },
      }),
    )

    // Sentry 直送(若 DSN 設了)
    try {
      await captureException(
        new Error(String(payload.message || 'client-error')),
        {
          tags: {
            source: 'client-error-page',
            digest: String(payload.digest || 'no-digest'),
          },
          extra: {
            url: String(payload.url || ''),
            ua: String(payload.ua || '').slice(0, 200),
            stack: String(payload.stack || '').slice(0, 1000),
          },
        },
      )
    } catch {
      /* Sentry 失敗不影響 client */
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
