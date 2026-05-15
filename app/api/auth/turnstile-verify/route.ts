// Phase 5 老闆按鈕 #5 wire — Turnstile token verify endpoint
//
// 客戶端註冊 / 結帳前 call 此 endpoint 驗 Turnstile token、過了才進 supabase.auth.signUp
// 對應 lib/security/turnstile.ts verifyTurnstileToken()
//
// Request: POST { token: string }
// Response: 200 { success: true } 或 403 { success: false, errorCodes: [...] }

import { NextRequest, NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { logAuditEvent, makeAuditEvent } from '@/lib/security/audit-event'

export const runtime = 'edge'

interface VerifyRequest {
  token?: string
}

export async function POST(req: NextRequest) {
  let body: VerifyRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, errorCodes: ['invalid-json'] }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  const result = await verifyTurnstileToken(body.token, ip)

  if (result.success) {
    // stub mode(dev / 沒設 secret) → return success but flag stub
    return NextResponse.json({
      success: true,
      stub: result.stub ?? false,
    })
  }

  // 驗證失敗 → 上報 audit + 拒絕
  try {
    logAuditEvent(makeAuditEvent('turnstile-failed', {
      ip,
      reason: 'turnstile-verify-rejected',
      severity: 'warn',
      details: {
        errorCodes: result.errorCodes,
        userAgent: req.headers.get('user-agent') || 'unknown',
      },
    }))
  } catch {
    /* audit 失敗不阻塞 */
  }

  return NextResponse.json(
    {
      success: false,
      errorCodes: result.errorCodes ?? ['unknown-error'],
    },
    { status: 403 },
  )
}
