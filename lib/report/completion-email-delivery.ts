import { createHash } from 'node:crypto'
import type { SendEmailParams, SendEmailResult } from '../resend-helper'

export const COMPLETION_EMAIL_EVENT = 'report_completed' as const

type RpcResult = {
  data: unknown
  error: unknown
}

export type CompletionEmailDeliveryClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<RpcResult>
}

type DeliveryClaimResult = {
  outcome: string
  claim_status: string | null
}

export type CompletionEmailPayload = Omit<SendEmailParams, 'idempotencyKey'>

export type CompletionEmailDeliveryResult = {
  sent: boolean
  reason: string
  outcome?: SendEmailResult
}

function firstRpcResult(data: unknown): DeliveryClaimResult | null {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.outcome !== 'string') return null
  return {
    outcome: candidate.outcome,
    claim_status: typeof candidate.claim_status === 'string' ? candidate.claim_status : null,
  }
}

function deliveryIdentity(reportId: string, payload: CompletionEmailPayload) {
  const providerIdempotencyKey = `report-completed/${reportId}`
  const providerPayload = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text ?? null,
    headers: payload.headers ?? null,
  }
  const payloadSha256 = `sha256:${createHash('sha256')
    .update(JSON.stringify(providerPayload), 'utf8')
    .digest('hex')}`
  return { providerIdempotencyKey, payloadSha256 }
}

async function markNeedsManual(
  client: CompletionEmailDeliveryClient,
  reportId: string,
  payloadSha256: string,
  providerIdempotencyKey: string,
  reason: string,
  providerMessageId?: string,
): Promise<void> {
  try {
    await client.rpc('mark_report_completion_email_needs_manual', {
      p_report_id: reportId,
      p_event_type: COMPLETION_EMAIL_EVENT,
      p_payload_sha256: payloadSha256,
      p_provider_idempotency_key: providerIdempotencyKey,
      p_manual_reason: reason,
      p_provider_message_id: providerMessageId || null,
    })
  } catch {
    // The claim stays `claimed`, which is deliberately non-retryable until an
    // operator reconciles the provider outcome.
  }
}

/**
 * Deliver the one report-completed event shared by workflow, fallback API,
 * and recovery cron. All producers race on the same durable DB claim and the
 * same provider idempotency key. An uncertain result never releases a claim.
 */
export async function deliverClaimedCompletionEmail(
  client: CompletionEmailDeliveryClient,
  reportId: string,
  payload: CompletionEmailPayload,
  send: (payload: SendEmailParams) => Promise<SendEmailResult>,
): Promise<CompletionEmailDeliveryResult> {
  const { providerIdempotencyKey, payloadSha256 } = deliveryIdentity(reportId, payload)
  const { data: claimData, error: claimError } = await client.rpc(
    'claim_report_completion_email',
    {
      p_report_id: reportId,
      p_event_type: COMPLETION_EMAIL_EVENT,
      p_payload_sha256: payloadSha256,
      p_provider_idempotency_key: providerIdempotencyKey,
    },
  )
  if (claimError) return { sent: false, reason: 'claim-failed-closed' }
  const claim = firstRpcResult(claimData)
  if (!claim || claim.outcome !== 'claimed') {
    return { sent: false, reason: `claim-${claim?.outcome || 'invalid-response'}` }
  }

  let outcome: SendEmailResult
  try {
    outcome = await send({ ...payload, idempotencyKey: providerIdempotencyKey })
  } catch {
    await markNeedsManual(
      client,
      reportId,
      payloadSha256,
      providerIdempotencyKey,
      'provider-call-uncertain',
    )
    return { sent: false, reason: 'provider-call-uncertain-needs-manual' }
  }
  if (!outcome.success || !outcome.resendId) {
    await markNeedsManual(
      client,
      reportId,
      payloadSha256,
      providerIdempotencyKey,
      'provider-result-not-success',
      outcome.resendId,
    )
    return { sent: false, reason: 'send-failed-needs-manual', outcome }
  }

  const { data: finalizeData, error: finalizeError } = await client.rpc(
    'finalize_report_completion_email',
    {
      p_report_id: reportId,
      p_event_type: COMPLETION_EMAIL_EVENT,
      p_payload_sha256: payloadSha256,
      p_provider_idempotency_key: providerIdempotencyKey,
      p_provider_message_id: outcome.resendId,
    },
  )
  const finalized = firstRpcResult(finalizeData)
  if (finalizeError || !finalized || finalized.outcome !== 'sent') {
    await markNeedsManual(
      client,
      reportId,
      payloadSha256,
      providerIdempotencyKey,
      finalizeError ? 'finalize-transport-uncertain' : 'finalize-rejected',
      outcome.resendId,
    )
    return { sent: false, reason: 'provider-sent-finalize-needs-manual', outcome }
  }

  return { sent: true, reason: 'ok', outcome }
}
