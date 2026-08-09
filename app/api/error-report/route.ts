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
import { buildClientErrorTelemetry } from '@/lib/security/client-error-telemetry'

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

    // Public input boundary:all downstream sinks consume the same sanitized
    // object so an old client bundle or direct POST cannot leak report tokens.
    const telemetry = buildClientErrorTelemetry(payload)
    logAuditEvent(
      makeAuditEvent('client-error', {
        ip,
        pathname: telemetry.audit.pathname,
        userAgent: telemetry.audit.userAgent,
        reason: 'client-error-boundary',
        severity: 'warn',
        details: telemetry.audit.details,
      }),
    )

    // Sentry 直送(若 DSN 設了)
    try {
      await captureException(
        new Error(telemetry.sentry.errorMessage),
        {
          tags: telemetry.sentry.tags,
          extra: telemetry.sentry.extra,
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
