import { NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '@/lib/auth-helper'
import { G15_CONSENT_IDENTITY_LIMITATION } from '@/lib/checkout/g15-consent-invitations'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentToken,
} from '@/lib/checkout/g15-independent-consent'
import { createServiceClient } from '@/lib/supabase'

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store, private')
  return NextResponse.json(body, { ...init, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const STRIPE_SESSION_PATTERN = /^cs_(test|live)_[A-Za-z0-9_]{10,220}$/u

function hasConsentContract(row: Record<string, unknown>) {
  return row.policy_version === G15_INDEPENDENT_CONSENT_POLICY_VERSION
    && row.purpose === G15_CONSENT_PURPOSE
    && row.sharing_scope === G15_CONSENT_SHARING_SCOPE
    && ['pending', 'accepted', 'revoked', 'expired'].includes(String(row.receipt_status))
}

function publicConsentState(row: Record<string, unknown>) {
  return {
    status: row.receipt_status,
    outcome: row.outcome,
    expiresAt: row.expires_at,
    policyVersion: row.policy_version,
    purpose: row.purpose,
    sharingScope: row.sharing_scope,
    consumedAt: row.consumed_at || null,
    identityLimitation: G15_CONSENT_IDENTITY_LIMITATION,
  }
}

async function readStripeSession(stripeKey: string, stripeSessionId: string) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stripeSessionId)}`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${stripeKey}` },
      cache: 'no-store',
    },
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isRecord(body) || body.id !== stripeSessionId) return null
  return body
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth.userId) {
    return noStoreJson(
      { error: '請先登入與該份人生藍圖綁定的帳號' },
      { status: 401 },
    )
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return noStoreJson({ error: '同意操作格式不正確' }, { status: 400 })
  }
  if (
    !isRecord(body)
    || !['inspect', 'accept', 'revoke'].includes(String(body.action))
    || typeof body.token !== 'string'
  ) {
    return noStoreJson({ error: '同意操作格式不正確' }, { status: 400 })
  }

  let tokenHash: `sha256:${string}`
  try {
    tokenHash = hashG15ConsentToken(body.token)
  } catch {
    return noStoreJson({ error: '此同意連結無效、已使用或已過期' }, { status: 404 })
  }

  const service = createServiceClient()
  const isRevoke = body.action === 'revoke'
  const { data, error } = await service.rpc(
    isRevoke ? 'prepare_g15_consent_revocation' : 'transition_g15_consent',
    isRevoke
      ? { p_token_hash: tokenHash, p_subject_user_id: auth.userId }
      : { p_action: body.action, p_token_hash: tokenHash, p_subject_user_id: auth.userId },
  )
  const row = Array.isArray(data) ? data[0] : data
  if (error || !isRecord(row)) {
    const notFound = isRecord(error) && error.code === 'P0002'
    return noStoreJson(
      { error: notFound ? '此同意連結無效、已使用或已過期' : '同意服務暫時無法使用，請稍後再試' },
      { status: notFound ? 404 : 503 },
    )
  }
  if (!hasConsentContract(row)) {
    return noStoreJson({ error: '同意紀錄契約不一致，已停止操作' }, { status: 503 })
  }

  if (!isRevoke) return noStoreJson(publicConsentState(row))

  if (row.outcome === 'consumed') {
    return noStoreJson(
      {
        ...publicConsentState(row),
        status: 'accepted',
        error: '付款已完成或正在處理，無法再阻止這筆訂單生成',
      },
      { status: 409 },
    )
  }
  if (row.outcome === 'revoked' && row.receipt_status === 'revoked') {
    return noStoreJson(publicConsentState(row))
  }
  if (row.outcome === 'expired' && row.receipt_status === 'expired') {
    return noStoreJson(publicConsentState(row))
  }
  if (row.outcome !== 'provider_expire_required' || row.receipt_status !== 'accepted') {
    return noStoreJson({ error: '撤回狀態無法安全確認，已保留原同意狀態' }, { status: 503 })
  }

  const reservationId = typeof row.checkout_reservation_id === 'string'
    ? row.checkout_reservation_id.toLowerCase()
    : ''
  const stripeSessionId = typeof row.checkout_stripe_session_id === 'string'
    ? row.checkout_stripe_session_id
    : ''
  const stripeKey = process.env.STRIPE_SECRET_KEY || ''
  if (!UUID_PATTERN.test(reservationId) || !STRIPE_SESSION_PATTERN.test(stripeSessionId) || !stripeKey) {
    return noStoreJson({ error: '付款頁狀態無法安全確認，尚未撤回同意' }, { status: 503 })
  }

  let stripeSession: Record<string, unknown> | null
  try {
    stripeSession = await readStripeSession(stripeKey, stripeSessionId)
    if (!stripeSession) {
      return noStoreJson({ error: '付款頁狀態無法安全確認，尚未撤回同意' }, { status: 503 })
    }
    if (stripeSession.status === 'complete') {
      return noStoreJson(
        {
          ...publicConsentState(row),
          status: 'accepted',
          outcome: 'provider_payment_started',
          error: '付款已完成或正在處理，無法再阻止這筆訂單生成',
        },
        { status: 409 },
      )
    }
    if (stripeSession.status === 'open') {
      if (stripeSession.payment_status !== 'unpaid') {
        return noStoreJson(
          { ...publicConsentState(row), status: 'accepted', error: '付款狀態尚未明確，尚未撤回同意' },
          { status: 409 },
        )
      }
      const expireResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stripeSessionId)}/expire`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Idempotency-Key': `jianyuan-g15-revoke-${reservationId}`,
          },
        },
      )
      const expiredBody: unknown = await expireResponse.json().catch(() => null)
      if (
        expireResponse.ok
        && isRecord(expiredBody)
        && expiredBody.id === stripeSessionId
        && expiredBody.status === 'expired'
      ) {
        stripeSession = expiredBody
      } else {
        // A concurrent retry may have expired it between GET and POST.
        stripeSession = await readStripeSession(stripeKey, stripeSessionId)
      }
    }
  } catch {
    return noStoreJson({ error: '付款頁狀態無法安全確認，尚未撤回同意' }, { status: 503 })
  }

  if (!stripeSession || stripeSession.status !== 'expired') {
    return noStoreJson(
      { ...publicConsentState(row), status: 'accepted', error: '付款頁仍可能完成付款，尚未撤回同意' },
      { status: 409 },
    )
  }

  const { data: finalizedData, error: finalizedError } = await service.rpc(
    'finalize_g15_consent_revocation',
    {
      p_token_hash: tokenHash,
      p_subject_user_id: auth.userId,
      p_reservation_id: reservationId,
      p_stripe_session_id: stripeSessionId,
    },
  )
  const finalized = Array.isArray(finalizedData) ? finalizedData[0] : finalizedData
  if (finalizedError || !isRecord(finalized) || !hasConsentContract(finalized)) {
    return noStoreJson({ error: '付款頁已停止，但撤回紀錄尚待確認；請稍後重試' }, { status: 503 })
  }
  if (finalized.outcome === 'consumed') {
    return noStoreJson(
      { ...publicConsentState(finalized), status: 'accepted', error: '付款已完成或正在處理，無法撤回這筆訂單' },
      { status: 409 },
    )
  }
  if (finalized.outcome !== 'revoked' || finalized.receipt_status !== 'revoked') {
    return noStoreJson({ error: '撤回結果無法安全確認，未顯示為已撤回' }, { status: 503 })
  }
  return noStoreJson(publicConsentState(finalized))
}
