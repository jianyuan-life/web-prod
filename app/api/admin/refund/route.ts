// Stripe Refund API（L7 P0 修復 2026-04-17）
// POST /api/admin/refund
// Headers: x-admin-key
// Body: { reportId: string, amount?: number (USD, 可選=全額退), reason?: string }
//
// 執行：
// 1. 查 paid_reports 取 stripe_session_id
// 2. 從 Stripe session 取 payment_intent
// 3. 呼叫 stripe.refunds.create（金額 cents）
// 4. 以 Charge.amount_refunded 累計值原子更新 paid_reports，只有全退才置 refunded
// 5. 全額退款才扣回已發放的推薦積分
// 6. 對帳 revenue/expense 並寫入去識別稽核記錄

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)
import {
  operationalErrorClass,
  operationalFingerprint,
} from '@/lib/security/operational-telemetry'

function getSupabase() {
  return createServiceClient()
}

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('STRIPE_SECRET_KEY 未設定')
  return new Stripe(secret)
}

type RefundIntentRow = {
  outcome: 'created' | 'started' | 'existing'
  state:
    | 'reserved'
    | 'provider_pending'
    | 'provider_applied'
    | 'reconciled'
    | 'provider_failed'
    | 'provider_canceled'
  request_id: string
  payload_sha256: string
  requested_amount_cents: number
  reason: string
  stripe_refund_id: string | null
  stripe_charge_id: string | null
  provider_attempted_at?: string | null
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] || null) : data
}

function refundPayloadSha256(input: {
  reportId: string
  requestId: string
  amountCents: number
  reason: string
  stripeSessionId: string
  paymentIntentId: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify([
      'jianyuan-admin-refund-v1',
      input.reportId,
      input.requestId,
      input.amountCents,
      input.reason,
      input.stripeSessionId,
      input.paymentIntentId,
    ]), 'utf8')
    .digest('hex')
}

const STRIPE_IDEMPOTENCY_SAFE_RETRY_MS = 24 * 60 * 60 * 1000

function withinStripeIdempotencyRetryWindow(value: string | null | undefined): boolean {
  if (!value) return false
  const attemptedAt = Date.parse(value)
  return Number.isFinite(attemptedAt)
    && attemptedAt <= Date.now()
    && Date.now() - attemptedAt < STRIPE_IDEMPOTENCY_SAFE_RETRY_MS
}

async function listAllMatchingRefunds(input: {
  paymentIntentId: string
  requestId: string
  payloadSha256: string
}): Promise<Stripe.Refund[]> {
  const matches: Stripe.Refund[] = []
  let startingAfter: string | undefined

  for (;;) {
    const page = await getStripe().refunds.list({
      payment_intent: input.paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const candidate of page.data) {
      if (
        candidate.metadata?.jianyuan_refund_request_id === input.requestId
        && candidate.metadata?.jianyuan_refund_payload_sha256 === input.payloadSha256
      ) {
        matches.push(candidate)
      }
    }
    if (!page.has_more) return matches
    const cursor = page.data.at(-1)?.id
    if (!cursor || cursor === startingAfter) {
      throw new Error('Stripe refund pagination cursor unavailable')
    }
    startingAfter = cursor
  }
}

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: {
    reportId?: string
    payment_intent_id?: string
    amount?: number
    reason?: string
    request_id?: string
    key?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const { reportId, payment_intent_id: providedPI, amount, reason, request_id: requestId } = body
  if (!reportId) {
    return NextResponse.json({ error: '退款必須提供 reportId' }, { status: 400 })
  }
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/u.test(requestId)) {
    return NextResponse.json({ error: '退款必須提供有效的 request_id' }, { status: 400 })
  }
  if (
    reason !== undefined
    && (typeof reason !== 'string' || !['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason))
  ) {
    return NextResponse.json({ error: '退款理由格式錯誤' }, { status: 400 })
  }
  try {
  const supabase = getSupabase()

  // 1. 查詢報告資料
  type ReportRow = {
    id: string
    stripe_session_id: string | null
    amount_usd: number | null
    status: string | null
    customer_email: string | null
    refunded_at: string | null
    refunded_amount_usd: number | null
    stripe_refund_id: string | null
  }
  let report: ReportRow | null = null

  if (reportId) {
    // v5.10.289:soft delete filter — 軟刪報告不允許 admin 觸發退款(若需退款應先 restore)
    const { data, error: fetchErr } = await supabase
      .from('paid_reports')
      .select('id, stripe_session_id, amount_usd, status, customer_email, refunded_at, refunded_amount_usd, stripe_refund_id')
      .eq('id', reportId)
      .is('deleted_at', null)
      .single()
    if (fetchErr) {
      return NextResponse.json({ error: '退款資料查詢失敗' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: '找不到報告(或已軟刪、需先 restore 才能退款)' }, { status: 404 })
    }
    report = data as unknown as ReportRow
  }

  if (!report) {
    return NextResponse.json({ error: '退款報告狀態無法驗證' }, { status: 500 })
  }
  const requestFingerprint = operationalFingerprint(requestId)
  const reportFingerprint = operationalFingerprint(report.id)
  const customerFingerprint = report.customer_email
    ? operationalFingerprint(report.customer_email.toLowerCase())
    : null
  if (
    requestFingerprint === 'unavailable'
    || reportFingerprint === 'unavailable'
    || customerFingerprint === 'unavailable'
  ) {
    return NextResponse.json({ error: '退款稽核環境尚未就緒' }, { status: 500 })
  }
  const reportAmountCents = Math.round(Number(report.amount_usd) * 100)
  const previousRefundedCents = Math.round(Number(report.refunded_amount_usd || 0) * 100)
  if (!Number.isSafeInteger(reportAmountCents) || reportAmountCents <= 0) {
    return NextResponse.json({ error: '訂單金額無法驗證' }, { status: 500 })
  }
  if (
    !Number.isSafeInteger(previousRefundedCents)
    || previousRefundedCents < 0
    || previousRefundedCents > reportAmountCents
  ) {
    return NextResponse.json({ error: '退款累計狀態無法驗證' }, { status: 500 })
  }
  const requestedRefundScaled = Number(amount) * 100
  const requestedRefundCents = Math.round(requestedRefundScaled)
  if (
    amount === undefined
    || !Number.isFinite(amount)
    || Math.abs(requestedRefundScaled - requestedRefundCents) > 1e-7
    || !Number.isSafeInteger(requestedRefundCents)
    || requestedRefundCents <= 0
    || requestedRefundCents > reportAmountCents
  ) {
    return NextResponse.json({ error: '退款金額無效；必須明確提供 USD 金額' }, { status: 400 })
  }

  // 2. 取得 payment_intent_id
  if (!report.stripe_session_id) {
    return NextResponse.json({ error: '報告缺少 Stripe Session 綁定' }, { status: 500 })
  }
  let paymentIntentId = ''
  try {
    const session = await getStripe().checkout.sessions.retrieve(report.stripe_session_id)
    const sessionPaymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id || '')
    if (providedPI && providedPI !== sessionPaymentIntentId) {
      return NextResponse.json({ error: 'payment_intent_id 與報告不一致' }, { status: 409 })
    }
    paymentIntentId = sessionPaymentIntentId
  } catch (err) {
    console.error('[admin-refund] checkout session lookup failed', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? `${err.name}:${err.message}` : typeof err),
    })
    return NextResponse.json({ error: '無法取得 Stripe Session' }, { status: 500 })
  }
  if (!paymentIntentId) {
    return NextResponse.json({ error: '找不到 payment_intent_id' }, { status: 400 })
  }

  const requestedReason = reason || 'requested_by_customer'
  const payloadSha256 = refundPayloadSha256({
    reportId: report.id,
    requestId,
    amountCents: requestedRefundCents,
    reason: requestedReason,
    stripeSessionId: report.stripe_session_id,
    paymentIntentId,
  })
  const { data: intentData, error: intentError } = await supabase.rpc(
    'reserve_admin_refund_intent',
    {
      p_report_id: report.id,
      p_request_id: requestId,
      p_payload_sha256: payloadSha256,
      p_requested_amount_cents: requestedRefundCents,
      p_reason: requestedReason,
      p_stripe_session_id: report.stripe_session_id,
      p_payment_intent_id: paymentIntentId,
    },
  )
  const intent = firstRpcRow(intentData) as RefundIntentRow | null
  if (intentError) {
    const isDefinitePreflightRejection = ['22023', 'P0001'].includes(intentError.code || '')
    return NextResponse.json({
      error: isDefinitePreflightRejection
        ? '退款尚未送出：退款前置檢查未通過，請核對可退餘額、既有待處理退款與推薦積分後再試。'
        : '退款請求已保存或仍在確認中；請沿用同一請求編號重試，勿建立新請求。',
      ...(!isDefinitePreflightRejection ? { reconciliation_pending: true } : {}),
    }, { status: isDefinitePreflightRejection ? 409 : 503 })
  }
  if (
    !intent
    || !['created', 'existing'].includes(intent.outcome)
    || ![
      'reserved',
      'provider_pending',
      'provider_applied',
      'reconciled',
      'provider_failed',
      'provider_canceled',
    ].includes(intent.state)
    || intent.request_id !== requestId
    || intent.payload_sha256 !== payloadSha256
    || intent.requested_amount_cents !== requestedRefundCents
    || intent.reason !== requestedReason
  ) {
    return NextResponse.json({
      error: '退款請求狀態無法確認；請沿用同一請求編號重試，勿建立新請求。',
      reconciliation_pending: true,
    }, { status: 503 })
  }
  if (intent.state === 'provider_failed' || intent.state === 'provider_canceled') {
    return NextResponse.json({
      error: '先前退款請求已由 Stripe 終止；如仍需退款，請人工核對後使用新的 request_id 明確建立新請求。',
      refund_terminal: true,
      terminal_state: intent.state,
    }, { status: 409 })
  }

  const { data: providerAttemptData, error: providerAttemptError } = await supabase.rpc(
    'start_admin_refund_provider_attempt',
    {
      p_report_id: report.id,
      p_request_id: requestId,
      p_payload_sha256: payloadSha256,
    },
  )
  const providerAttempt = firstRpcRow(providerAttemptData) as RefundIntentRow | null
  if (
    providerAttemptError
    || !providerAttempt
    || !['started', 'existing'].includes(providerAttempt.outcome)
    || ![
      'provider_pending',
      'provider_applied',
      'reconciled',
      'provider_failed',
      'provider_canceled',
    ].includes(providerAttempt.state)
    || providerAttempt.request_id !== requestId
    || providerAttempt.payload_sha256 !== payloadSha256
    || providerAttempt.requested_amount_cents !== requestedRefundCents
    || providerAttempt.reason !== requestedReason
  ) {
    return NextResponse.json({
      error: '退款是否已送交 Stripe 尚無法確認；請沿用同一請求編號重試，勿建立新請求。',
      reconciliation_pending: true,
    }, { status: 503 })
  }
  if (providerAttempt.state === 'provider_failed' || providerAttempt.state === 'provider_canceled') {
    return NextResponse.json({
      error: '先前退款請求已由 Stripe 終止；如仍需退款，請人工核對後使用新的 request_id 明確建立新請求。',
      refund_terminal: true,
      terminal_state: providerAttempt.state,
    }, { status: 409 })
  }

  // The durable intent is committed before Stripe mutation. A response-loss
  // retry inside Stripe's documented 24-hour idempotency window repeats the
  // exact POST and key. Outside that window, it only performs full pagination;
  // no second create is automatic once Stripe may have pruned the key.
  let refundResult: Stripe.Refund
  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      amount: requestedRefundCents,
      reason: requestedReason as Stripe.RefundCreateParams.Reason,
      metadata: {
        jianyuan_refund_request_id: requestId,
        jianyuan_refund_payload_sha256: payloadSha256,
      },
    }
    const idempotencyKey = [
      'admin-refund',
      report.id,
      requestId,
    ].join(':')
    if (
      providerAttempt.outcome === 'started'
      || (
        providerAttempt.state === 'provider_pending'
        && !providerAttempt.stripe_refund_id
        && withinStripeIdempotencyRetryWindow(providerAttempt.provider_attempted_at)
      )
    ) {
      refundResult = await getStripe().refunds.create(refundParams, {
        idempotencyKey,
      })
    } else if (providerAttempt.stripe_refund_id) {
      refundResult = await getStripe().refunds.retrieve(providerAttempt.stripe_refund_id)
    } else {
      const matches = await listAllMatchingRefunds({
        paymentIntentId,
        requestId,
        payloadSha256,
      })
      if (matches.length === 0) {
        return NextResponse.json({
          error: 'Stripe 的 24 小時冪等安全重試期已過，且完整分頁未找到退款；已停止自動建立，請人工核對。',
          reconciliation_pending: true,
          manual_hold: true,
        }, { status: 503 })
      }
      if (matches.length !== 1) {
        return NextResponse.json({
          error: 'Stripe 退款對帳出現多筆相同請求，已停止自動處理，請人工核對。',
          reconciliation_pending: true,
        }, { status: 500 })
      }
      refundResult = matches[0]
    }
  } catch (err) {
    console.error('[admin-refund] refund provider operation failed', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? `${err.name}:${err.message}` : typeof err),
    })
    return NextResponse.json({
      error: 'Stripe 退款結果不明；請沿用同一請求編號重試，勿建立新請求。',
      reconciliation_pending: true,
    }, { status: 500 })
  }

  const chargeId = typeof refundResult.charge === 'string'
    ? refundResult.charge
    : refundResult.charge?.id
  if (!refundResult.id || !chargeId || !Number.isSafeInteger(refundResult.amount) || refundResult.amount <= 0) {
    return NextResponse.json({ error: 'Stripe 退款回應無法驗證' }, { status: 500 })
  }
  if (refundResult.amount !== requestedRefundCents) {
    return NextResponse.json({ error: '退款請求與既有退款不一致' }, { status: 409 })
  }

  const { data: bindData, error: bindError } = await supabase.rpc(
    'bind_admin_refund_intent_provider_result',
    {
      p_report_id: report.id,
      p_request_id: requestId,
      p_payload_sha256: payloadSha256,
      p_refund_id: refundResult.id,
      p_charge_id: chargeId,
      p_refund_amount_cents: refundResult.amount,
    },
  )
  const boundIntent = firstRpcRow(bindData) as RefundIntentRow | null
  if (
    bindError
    || !boundIntent
    || !['provider_applied', 'reconciled'].includes(boundIntent.state)
    || boundIntent.stripe_refund_id !== refundResult.id
    || boundIntent.stripe_charge_id !== chargeId
  ) {
    return NextResponse.json({
      error: 'Stripe 可能已完成退款，但本機對帳尚未完成；請沿用同一請求編號重試，勿建立新請求。',
      reconciliation_pending: true,
    }, { status: 500 })
  }
  const terminalRefundStatus = refundResult.status === 'failed' || refundResult.status === 'canceled'
    ? refundResult.status
    : null
  if (refundResult.status !== 'succeeded' && !terminalRefundStatus) {
    return NextResponse.json({
      error: 'Stripe 已接受退款請求，但尚未確認成功；請沿用同一請求編號稍後重試，勿建立新請求。',
      reconciliation_pending: true,
    }, { status: 503 })
  }

  let charge: Stripe.Charge
  try {
    charge = await getStripe().charges.retrieve(chargeId)
  } catch (err) {
    console.error('[admin-refund] canonical charge lookup failed', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? `${err.name}:${err.message}` : typeof err),
    })
    return NextResponse.json({ error: 'Stripe 退款累計狀態無法驗證' }, { status: 500 })
  }

  const chargePaymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id
  const cumulativeRefundedCents = charge.amount_refunded
  if (
    charge.id !== chargeId
    || chargePaymentIntentId !== paymentIntentId
    || !Number.isSafeInteger(cumulativeRefundedCents)
    || cumulativeRefundedCents < 0
    || cumulativeRefundedCents > reportAmountCents
  ) {
    return NextResponse.json({ error: 'Stripe 退款累計狀態無法驗證' }, { status: 500 })
  }

  if (terminalRefundStatus) {
    // A failed/canceled refund can reduce Charge.amount_refunded. The database
    // reversal routine owns report, accounting, point restoration, intent
    // terminalization, and append-only event idempotency in one transaction.
    // If unrelated successful refunds make Stripe newer than our DB, wait for
    // their webhook rather than inventing an identity for that forward change.
    if (cumulativeRefundedCents > previousRefundedCents) {
      return NextResponse.json({
        error: 'Stripe 尚有其他退款交易待完成本機對帳；已停止自動終態處理，請沿用同一請求編號稍後重試。',
        reconciliation_pending: true,
        manual_hold: true,
      }, { status: 503 })
    }

    const failureReason = refundResult.failure_reason?.trim() || terminalRefundStatus
    const terminalIntentState = terminalRefundStatus === 'failed'
      ? 'provider_failed'
      : 'provider_canceled'
    const { data: reversalData, error: reversalError } = await supabase.rpc(
      'reverse_stripe_refund_event',
      {
        p_event_id: `admin_refund_terminal:${report.id}:${requestId}:${refundResult.id}:${terminalRefundStatus}`,
        p_event_type: terminalRefundStatus === 'failed' ? 'refund.failed' : 'refund.updated',
        p_stripe_session_id: report.stripe_session_id,
        p_charge_id: chargeId,
        p_payment_intent_id: paymentIntentId,
        p_refund_id: refundResult.id,
        p_refund_status: terminalRefundStatus,
        p_refund_amount_cents: refundResult.amount,
        p_refunded_amount_cents: cumulativeRefundedCents,
        p_failure_reason: failureReason,
        p_admin_request_id: requestId,
        p_admin_payload_sha256: payloadSha256,
      },
    )
    const reversal = firstRpcRow(reversalData) as {
      outcome?: string
      refunded_amount_cents?: number
      is_full_refund?: boolean
      points_restored?: number
      intent_state?: string | null
    } | null
    if (
      reversalError
      || !reversal
      || !['reversed', 'stale', 'already'].includes(reversal.outcome || '')
      || reversal.refunded_amount_cents !== cumulativeRefundedCents
      || reversal.is_full_refund !== (cumulativeRefundedCents >= reportAmountCents)
      || !Number.isSafeInteger(reversal.points_restored)
      || (reversal.points_restored || 0) < 0
      || reversal.intent_state !== terminalIntentState
    ) {
      return NextResponse.json({
        error: 'Stripe 已終止退款，但本機終態對帳尚未完成；請沿用同一請求編號重試，勿建立新請求。',
        reconciliation_pending: true,
      }, { status: 503 })
    }

    return NextResponse.json({
      error: 'Stripe 已終止這筆退款；如仍需退款，請人工核對後使用新的 request_id 建立新請求。',
      refund_terminal: true,
      terminal_state: terminalIntentState,
      cumulative_refunded_amount_usd: cumulativeRefundedCents / 100,
      points_restored: reversal.points_restored,
    }, { status: 409 })
  }

  const isIdempotentReplay = cumulativeRefundedCents === previousRefundedCents
    && providerAttempt.outcome === 'existing'
  if (
    cumulativeRefundedCents < previousRefundedCents
    || (cumulativeRefundedCents === previousRefundedCents && !isIdempotentReplay)
  ) {
    return NextResponse.json({ error: 'Stripe 退款累計狀態無法驗證' }, { status: 500 })
  }

  const refundedAmountUsd = refundResult.amount / 100
  const cumulativeRefundedUsd = cumulativeRefundedCents / 100
  const isFullRefund = cumulativeRefundedCents >= reportAmountCents
  const canonicalReason = refundResult.reason
    && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(refundResult.reason)
    ? refundResult.reason
    : reason && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)
      ? reason
      : 'refund.created'

  // 5. 報告、revenue、expense、referral points 與 event ledger 只能經由
  // 同一個 PostgreSQL transaction 對帳。部分退款不回收推薦積分；
  // 只有 Charge.amount_refunded 已達訂單總額時，RPC 才做 exactly-once 回收。
  const { data: reconciliationData, error: reconciliationError } = await supabase.rpc(
    'reconcile_stripe_refund_event',
    {
      p_event_id: `admin_refund:${report.id}:${requestId}`,
      p_event_type: 'refund.created',
      p_stripe_session_id: report.stripe_session_id,
      p_charge_id: chargeId,
      p_payment_intent_id: paymentIntentId,
      p_refund_id: refundResult.id,
      p_refunded_amount_cents: cumulativeRefundedCents,
      p_reason: canonicalReason,
    },
  )
  const reconciliation = Array.isArray(reconciliationData)
    ? reconciliationData[0]
    : reconciliationData
  if (
    reconciliationError
    || !reconciliation
    || !['applied', 'stale', 'already'].includes(reconciliation.outcome)
    || !Number.isSafeInteger(reconciliation.refunded_amount_cents)
    || reconciliation.refunded_amount_cents <= 0
    || reconciliation.refunded_amount_cents > cumulativeRefundedCents
    || (
      reconciliation.outcome !== 'already'
      && (
        reconciliation.refunded_amount_cents !== cumulativeRefundedCents
        || reconciliation.is_full_refund !== isFullRefund
      )
    )
    || (reconciliation.is_full_refund && !isFullRefund)
    || !Number.isSafeInteger(reconciliation.points_clawed_back)
    || reconciliation.points_clawed_back < 0
  ) {
    return NextResponse.json({ error: '退款對帳寫入失敗' }, { status: 500 })
  }
  const pointsClawedBack = reconciliation.points_clawed_back

  const { data: completedIntentData, error: completedIntentError } = await supabase.rpc(
    'complete_admin_refund_intent',
    {
      p_report_id: report.id,
      p_request_id: requestId,
      p_payload_sha256: payloadSha256,
      p_refund_id: refundResult.id,
      p_cumulative_refunded_cents: reconciliation.refunded_amount_cents,
    },
  )
  const completedIntent = firstRpcRow(completedIntentData) as RefundIntentRow | null
  if (
    completedIntentError
    || !completedIntent
    || completedIntent.state !== 'reconciled'
    || completedIntent.stripe_refund_id !== refundResult.id
  ) {
    return NextResponse.json({
      error: '退款已完成核心對帳，但請求狀態尚未收斂；請沿用同一請求編號重試。',
      reconciliation_pending: true,
    }, { status: 500 })
  }

  const refundFingerprint = operationalFingerprint(refundResult.id)
  const paymentIntentFingerprint = operationalFingerprint(paymentIntentId)
  if (refundFingerprint === 'unavailable' || paymentIntentFingerprint === 'unavailable') {
    return NextResponse.json({ error: '退款稽核環境尚未就緒' }, { status: 500 })
  }

  // 7. 稽核紀錄也以 fingerprint 去重，IP/UA 只保留不可逆指紋。
  const { data: existingAudit, error: auditLookupError } = await supabase
    .from('admin_audit_log')
    .select('id')
    .eq('action', 'refund')
    .eq('target_type', 'refund')
    .eq('target_id', refundFingerprint)
    .maybeSingle()
  if (auditLookupError) {
    return NextResponse.json({ error: '退款稽核記錄失敗' }, { status: 500 })
  }
  if (!existingAudit) {
    const sourceIp = req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown'
    const { data: auditInsert, error: auditInsertError } = await supabase
      .from('admin_audit_log')
      .insert({
        action: 'refund',
        target_type: 'refund',
        target_id: refundFingerprint,
        metadata: {
          report_fingerprint: reportFingerprint,
          request_fingerprint: requestFingerprint,
          stripe_payment_intent_fingerprint: paymentIntentFingerprint,
          refunded_amount_usd: refundedAmountUsd,
          cumulative_refunded_amount_usd: cumulativeRefundedUsd,
          reason: canonicalReason,
          points_clawed_back: pointsClawedBack,
          customer_fingerprint: customerFingerprint,
        },
        ip: operationalFingerprint(sourceIp),
        user_agent: operationalFingerprint(req.headers.get('user-agent') || 'unknown'),
      })
      .select('id')
      .single()
    if (auditInsertError || !auditInsert) {
      return NextResponse.json({ error: '退款稽核記錄失敗' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    refund_id: refundResult.id,
    refunded_amount_usd: refundedAmountUsd,
    cumulative_refunded_amount_usd: cumulativeRefundedUsd,
    is_full_refund: isFullRefund,
    points_clawed_back: pointsClawedBack,
    status: refundResult.status,
  })
  } catch (err) {
    console.error('[admin-refund] fail-closed operation error', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? `${err.name}:${err.message}` : typeof err),
    })
    return NextResponse.json({ error: '退款處理暫時無法完成' }, { status: 500 })
  }
}
