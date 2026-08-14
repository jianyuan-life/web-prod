import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendEmailWithRetry } from '@/lib/resend-helper'  // T12b v5.10.370(retry + dead-letter)
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { recordRevenue } from '@/lib/accounting'
import { trackFunnelServer } from '@/lib/funnel-tracker'
import { notifyStripeFailed } from '@/lib/ai/observability/telegram'
import { PLAN_NAMES } from '@/lib/plan-names'
import { validateG15ConsultationContext } from '@/lib/checkout/g15-context'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
  validateG15PersistedConsentAuthority,
} from '@/lib/checkout/g15-independent-consent'
import { verifyG15ConsumedOrderBinding } from '@/lib/checkout/g15-consent-order.server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)
import {
  escapeHtmlText,
  operationalErrorClass,
  operationalFingerprint,
  sanitizeEmailSubject,
} from '@/lib/security/operational-telemetry'

function getStripe() {
  // @ts-expect-error - Stripe SDK version mismatch
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' })
}

function getSupabase() {
  return createServiceClient()
}

const C_G15_WORKFLOW_TRIGGER_ERROR = 'Durable workflow trigger unavailable; Stripe retry required'
const C_G15_WORKFLOW_EXCEPTION_ERROR = 'Structured report trigger failed; Stripe retry required'
const C_G15_CHECKOUT_DATA_ERROR = 'Structured checkout data unavailable; Stripe retry required'
const C_G15_MANUAL_REVIEW_ERROR = 'Checkout points verification requires manual review'
const PAID_CHECKOUT_REQUEST_KEY_RE = /^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const CHECKOUT_DRAFT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const STRIPE_CHECKOUT_SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9_]{10,220}$/u

function isStructuredConsultationPlan(planCode: string): boolean {
  return planCode === 'C' || planCode === 'G15'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasStructuredRecoveryBirthData(planCode: string, value: unknown): boolean {
  if (!isRecord(value)) return false

  const asOf = typeof value.as_of === 'string' ? value.as_of : ''
  const targetYear = Number(value.target_year)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asOf) || !Number.isInteger(targetYear)) return false
  if (Number(asOf.slice(0, 4)) !== targetYear) return false

  if (planCode === 'C') {
    const year = Number(value.year)
    const month = Number(value.month)
    const day = Number(value.day)
    const hour = Number(value.hour)
    const minute = Number(value.minute)
    const timeUnknown = value.time_unknown === true
    const timeMode = value.time_mode
    return (
      typeof value.name === 'string'
      && value.name.trim().length > 0
      && Number.isInteger(year) && year >= 1900 && year <= 2200
      && Number.isInteger(month) && month >= 1 && month <= 12
      && Number.isInteger(day) && day >= 1 && day <= 31
      && Number.isInteger(hour) && hour >= 0 && hour <= 23
      && Number.isInteger(minute) && minute >= 0 && minute <= 59
      && typeof value.gender === 'string'
      && value.gender.trim().length > 0
      && typeof value.time_unknown === 'boolean'
      && (timeMode === 'unknown' || timeMode === 'shichen' || timeMode === 'exact')
      && timeUnknown === (timeMode === 'unknown')
      && (value.calendar_type === 'solar' || value.calendar_type === 'lunar')
      && typeof value.timezone === 'string'
      && value.timezone.trim().length > 0
      && Number.isFinite(Number(value.timezone_offset))
      && Number.isFinite(Number(value.latitude))
      && Number.isFinite(Number(value.longitude))
      && typeof value.birth_country === 'string'
      && value.birth_country.trim().length > 0
      && typeof value.birth_city === 'string'
      && value.birth_city.trim().length > 0
      && typeof value.marital_status === 'string'
      && value.marital_status.trim().length > 0
      && typeof value.bazi_school === 'string'
      && value.bazi_school.trim().length > 0
      && typeof value.ayanamsa_type === 'string'
      && value.ayanamsa_type.trim().length > 0
    )
  }

  if (planCode === 'G15') {
    const reportIds = Array.isArray(value.report_ids) ? value.report_ids : []
    const memberNames = Array.isArray(value.member_names) ? value.member_names : []
    const selectionId = typeof value.consent_selection_id === 'string'
      ? value.consent_selection_id.trim().toLowerCase()
      : ''
    const persistedConsent = validateG15PersistedConsentAuthority({
      authority: value.consent_authority,
      selectionId,
      reportIds: reportIds.filter((id): id is string => typeof id === 'string'),
    })
    const contextValidation = validateG15ConsultationContext(value)
    return (
      value.plan_type === 'family_reports'
      && reportIds.length >= 2
      && reportIds.every((id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id))
      && memberNames.length === reportIds.length
      && memberNames.every((name) => typeof name === 'string' && name.trim().length > 0)
      && Array.isArray(value.stated_relationships)
      && value.stated_relationships.length > 0
      && value.stated_relationships.every((entry) => typeof entry === 'string' && entry.trim().length >= 8)
      && Array.isArray(value.consultation_goals)
      && value.consultation_goals.length > 0
      && value.consultation_goals.every((entry) => typeof entry === 'string' && entry.trim().length >= 8)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(selectionId)
      && persistedConsent.ok
      && contextValidation.ok
    )
  }

  return false
}

function sameStringMap(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

async function consumeG15CheckoutReservationForStripeOrder(input: {
  supabase: ReturnType<typeof getSupabase>
  birthData: unknown
  purchaserUserId: unknown
  stripeSessionId: string
  reservationId: unknown
  checkoutDraftId: unknown
  expectedReportId: unknown
}): Promise<{ ok: true; reportId: string; birthData: Record<string, unknown> } | { ok: false }> {
  if (!isRecord(input.birthData)) return { ok: false }
  const purchaserUserId = typeof input.purchaserUserId === 'string'
    ? input.purchaserUserId.trim().toLowerCase()
    : ''
  const selectionId = typeof input.birthData.consent_selection_id === 'string'
    ? input.birthData.consent_selection_id.trim().toLowerCase()
    : ''
  const reservationId = typeof input.reservationId === 'string'
    ? input.reservationId.trim().toLowerCase()
    : ''
  const checkoutDraftId = typeof input.checkoutDraftId === 'string'
    ? input.checkoutDraftId.trim().toLowerCase()
    : ''
  const expectedReportId = typeof input.expectedReportId === 'string'
    ? input.expectedReportId.trim().toLowerCase()
    : ''
  const requestedReportIds = Array.isArray(input.birthData.report_ids)
    ? input.birthData.report_ids.filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase())
    : []
  const persisted = validateG15PersistedConsentAuthority({
    authority: input.birthData.consent_authority,
    selectionId,
    reportIds: requestedReportIds,
  })
  if (
    !persisted.ok
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(purchaserUserId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(reservationId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(checkoutDraftId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(expectedReportId)
  ) return { ok: false }

  const { data, error } = await input.supabase.rpc('consume_g15_checkout_consent_for_order', {
    p_reservation_id: reservationId,
    p_purchaser_user_id: purchaserUserId,
    p_stripe_session_id: input.stripeSessionId,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !isRecord(row)) return { ok: false }
  const selectedReportIds = Array.isArray(row.selected_report_ids)
    ? row.selected_report_ids.filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase())
    : []
  const acceptedAtByReport = isRecord(row.accepted_at_by_report)
    ? Object.fromEntries(Object.entries(row.accepted_at_by_report).map(([key, value]) => [key.toLowerCase(), String(value)]))
    : {}
  const subjectUserIdsByReport = isRecord(row.subject_user_ids_by_report)
    ? Object.fromEntries(Object.entries(row.subject_user_ids_by_report).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]))
    : {}
  const reportId = typeof row.report_id === 'string' ? row.report_id.toLowerCase() : ''
  if (
    !['consumed', 'already_consumed'].includes(String(row.outcome))
    || row.reservation_id !== reservationId
    || row.selection_id !== selectionId
    || row.checkout_draft_id !== checkoutDraftId
    || row.stripe_session_id !== input.stripeSessionId
    || typeof row.consumed_at !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(reportId)
    || reportId !== expectedReportId
    || JSON.stringify([...selectedReportIds].sort()) !== JSON.stringify([...requestedReportIds].sort())
    || row.selected_report_ids_hash !== hashG15ConsentReportIds(selectedReportIds)
    || row.policy_version !== G15_INDEPENDENT_CONSENT_POLICY_VERSION
    || row.purpose !== G15_CONSENT_PURPOSE
    || row.sharing_scope !== G15_CONSENT_SHARING_SCOPE
    || !Number.isFinite(Date.parse(String(row.selection_expires_at)))
    || Date.parse(String(row.selection_expires_at)) !== Date.parse(persisted.authority.expires_at)
    || !sameStringMap(acceptedAtByReport, persisted.authority.accepted_at_by_report)
    || !sameStringMap(subjectUserIdsByReport, persisted.authority.subject_user_ids_by_report)
  ) return { ok: false }

  return {
    ok: true,
    reportId,
    birthData: {
      ...input.birthData,
      report_ids: selectedReportIds,
      consent_selection_id: selectionId,
      consent_authority: {
        selection_id: selectionId,
        policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
        purpose: G15_CONSENT_PURPOSE,
        sharing_scope: G15_CONSENT_SHARING_SCOPE,
        expires_at: String(row.selection_expires_at),
        accepted_at_by_report: acceptedAtByReport,
        subject_user_ids_by_report: subjectUserIdsByReport,
      },
    },
  }
}

async function triggerStructuredConsultationWorkflow(
  siteUrl: string,
  reportId: string,
): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (typeof cronSecret !== 'string' || cronSecret.trim().length === 0) {
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${siteUrl}/api/workflows/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': cronSecret },
      body: JSON.stringify({ reportId }),
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  // 安全防護：如果 webhook secret 未設定或為空字串，直接拒絕請求
  // 避免用空字串做簽名驗證，防止偽造 webhook 事件
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET 未設定，拒絕處理 webhook')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const stripe = getStripe()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig || '', webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature failed', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(err instanceof Error ? `${err.name}:${err.message}` : typeof err),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (
    event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session

    // Stripe can emit checkout.session.completed while a delayed payment is
    // still unpaid.  Fulfilment, points and report generation must wait for a
    // a paid session (or the later async success event).  This application
    // never sends zero-value orders to Stripe, so no_payment_required is not a
    // fulfilment state here.
    // Keep this guard before even constructing the Supabase client so an
    // unpaid event has no database, points, email or workflow side effect.
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true, awaiting_payment: true })
    }
    let planCode = session.metadata?.plan_code || 'C'
    let draftId = session.metadata?.draft_id
    const birthDataStr = session.metadata?.birth_data // 向後兼容舊格式
    const sessionLocale = session.metadata?.locale || 'zh-TW'
    const amount = (session.amount_total || 0) / 100
    // v5.3.22 P0 隱私修復：優先用 metadata.login_email（checkout API 寫入的登入用戶 email）
    //   session.customer_email 也可用（checkout API 也設了，雙保險）
    //   customer_details.email 只做最後 fallback（訪客沒登入且沒輸入 email 的邊角案例）
    // 情境：老公刷卡幫老婆買 → 老婆登入 email 優先 → 報告記到老婆
    const loginEmailFromMetadata = (session.metadata?.login_email || '').toLowerCase()
    const customerEmail = (
      loginEmailFromMetadata ||
      session.customer_email ||
      session.customer_details?.email ||
      ''
    ).toLowerCase()
    let loginUserId = session.metadata?.login_user_id || null
    const g15ReservationId = session.metadata?.g15_consent_reservation_id || ''
    const g15ExpectedReportId = session.metadata?.g15_report_id || ''
    const paidCheckoutContractVersion = session.metadata?.paid_checkout_contract || ''
    const paidCheckoutRequestKey = session.metadata?.paid_checkout_request_key || ''
    const hasPaidCheckoutContractMetadata = Boolean(
      paidCheckoutContractVersion || paidCheckoutRequestKey,
    )
    const hasPaidCheckoutContract = (
      paidCheckoutContractVersion === 'v1'
      && PAID_CHECKOUT_REQUEST_KEY_RE.test(paidCheckoutRequestKey)
    )
    if (
      hasPaidCheckoutContractMetadata
      && (
        !hasPaidCheckoutContract
        || !draftId
        || !CHECKOUT_DRAFT_ID_RE.test(draftId)
        || !STRIPE_CHECKOUT_SESSION_ID_RE.test(session.id)
      )
    ) {
      return NextResponse.json({ error: 'Paid checkout identity unavailable' }, { status: 500 })
    }
    const checkoutPointsAmount = parseInt(session.metadata?.points_used || '0')
    const checkoutPointsUserId = session.metadata?.points_user_id || ''

    console.info(`✅ 付款成功！方案${planCode}, $${amount}`)

    const supabase = getSupabase()

    // The ledger is addressed by the Stripe Session id itself, so stripped or
    // replaced Stripe metadata cannot detach a reservation-era paid session
    // from its frozen money-equivalent authority.
    let paidOrderRequestKey = hasPaidCheckoutContract ? paidCheckoutRequestKey : ''
    let paidLedgerAmountCents: number | null = null
    let paidLedgerCurrency = ''
    let hasPaidCheckoutOrder = hasPaidCheckoutContract
    if (!hasPaidCheckoutContractMetadata && STRIPE_CHECKOUT_SESSION_ID_RE.test(session.id)) {
      let authorityData: unknown = null
      let authorityError: unknown = null
      try {
        const authorityResponse = await supabase.rpc('get_paid_checkout_order_authority', {
          p_stripe_session_id: session.id,
        })
        authorityData = authorityResponse.data
        authorityError = authorityResponse.error
      } catch {
        return NextResponse.json({ error: 'Paid checkout authority unavailable' }, { status: 500 })
      }
      const authorityRows = (Array.isArray(authorityData)
        ? authorityData
        : authorityData ? [authorityData] : []) as Array<Record<string, unknown>>
      if (authorityError || authorityRows.length > 1) {
        return NextResponse.json({ error: 'Paid checkout authority unavailable' }, { status: 500 })
      }
      const authorityRow = authorityRows[0]
      if (authorityRow) {
        const ledgerRequestKey = typeof authorityRow.request_key === 'string' ? authorityRow.request_key : ''
        const ledgerPlanCode = typeof authorityRow.plan_code === 'string' ? authorityRow.plan_code : ''
        const ledgerDraftId = typeof authorityRow.checkout_draft_id === 'string' ? authorityRow.checkout_draft_id : ''
        const ledgerStatus = typeof authorityRow.status === 'string' ? authorityRow.status : ''
        const ledgerAmountCents = Number(authorityRow.final_amount_cents)
        const ledgerCurrency = typeof authorityRow.currency === 'string' ? authorityRow.currency.toLowerCase() : ''
        if (
          !PAID_CHECKOUT_REQUEST_KEY_RE.test(ledgerRequestKey)
          || !Object.prototype.hasOwnProperty.call(PLAN_NAMES, ledgerPlanCode)
          || !CHECKOUT_DRAFT_ID_RE.test(ledgerDraftId)
          || !['bound', 'consumed'].includes(ledgerStatus)
          || !Number.isSafeInteger(ledgerAmountCents)
          || ledgerAmountCents <= 0
          || ledgerCurrency.length === 0
        ) {
          return NextResponse.json({ error: 'Paid checkout authority unavailable' }, { status: 500 })
        }
        hasPaidCheckoutOrder = true
        paidOrderRequestKey = ledgerRequestKey
        paidLedgerAmountCents = ledgerAmountCents
        paidLedgerCurrency = ledgerCurrency
        planCode = ledgerPlanCode
        draftId = ledgerDraftId
      }
    }
    const usesCheckoutPointsOnce = (
      !hasPaidCheckoutOrder
      &&
      (planCode === 'C' || planCode === 'G15')
      && checkoutPointsAmount > 0
    )

    // The protected database ledger, not mutable Stripe metadata, owns coupon,
    // points, user and draft identity. The RPC consumes a matching reservation
    // and its money-equivalent mutation in one transaction; webhook replay is
    // an explicit already_consumed outcome with the same frozen authority.
    let paidCouponCode: string | null = null
    let paidPointsAmount = 0
    if (hasPaidCheckoutOrder) {
      // The event's own money fields must equal the frozen reservation before
      // any money-equivalent authority is consumed; the consume RPC re-checks
      // the same equality inside its transaction.
      if (
        paidLedgerAmountCents !== null
        && (
          session.amount_total !== paidLedgerAmountCents
          || String(session.currency ?? '').toLowerCase() !== paidLedgerCurrency
        )
      ) {
        return NextResponse.json({ error: 'Paid checkout transaction failed' }, { status: 500 })
      }
      let paidConsumptionData: unknown = null
      let paidConsumptionError: unknown = null
      try {
        const response = await supabase.rpc('consume_paid_checkout_for_order', {
          p_request_key: paidOrderRequestKey,
          p_stripe_session_id: session.id,
          p_plan_code: planCode,
          p_checkout_draft_id: draftId,
          p_amount_total: session.amount_total ?? null,
          p_currency: session.currency ?? null,
        })
        paidConsumptionData = response.data
        paidConsumptionError = response.error
      } catch {
        return NextResponse.json({ error: 'Paid checkout transaction failed' }, { status: 500 })
      }

      const paidConsumption = (Array.isArray(paidConsumptionData)
        ? paidConsumptionData[0]
        : paidConsumptionData) as Record<string, unknown> | null
      const resourceKind = paidConsumption?.resource_kind
      const consumedCheckoutUserId = paidConsumption?.checkout_user_id
      const consumedCouponCode = paidConsumption?.coupon_code
      const consumedPointsUserId = paidConsumption?.points_user_id
      const consumedPointsAmount = paidConsumption?.points_amount
      const consumedDraftId = paidConsumption?.checkout_draft_id
      const validNullableUserId = consumedCheckoutUserId === null
        || (typeof consumedCheckoutUserId === 'string' && CHECKOUT_DRAFT_ID_RE.test(consumedCheckoutUserId))
      const resourceShapeValid = (
        resourceKind === 'none'
        && consumedCouponCode === null
        && consumedPointsUserId === null
        && consumedPointsAmount === null
      ) || (
        resourceKind === 'coupon'
        && typeof consumedCouponCode === 'string'
        && consumedCouponCode.trim().length > 0
        && consumedPointsUserId === null
        && consumedPointsAmount === null
      ) || (
        resourceKind === 'points'
        && typeof consumedPointsUserId === 'string'
        && CHECKOUT_DRAFT_ID_RE.test(consumedPointsUserId)
        && consumedPointsUserId === consumedCheckoutUserId
        && Number.isSafeInteger(consumedPointsAmount)
        && Number(consumedPointsAmount) > 0
      )
      if (
        paidConsumptionError
        || !paidConsumption
        || !['consumed', 'already_consumed'].includes(String(paidConsumption.outcome))
        || paidConsumption.request_key !== paidOrderRequestKey
        || !validNullableUserId
        || consumedDraftId !== draftId
        || !resourceShapeValid
      ) {
        return NextResponse.json({ error: 'Paid checkout transaction failed' }, { status: 500 })
      }

      paidCouponCode = resourceKind === 'coupon' ? String(consumedCouponCode) : null
      paidPointsAmount = resourceKind === 'points' ? Number(consumedPointsAmount) : 0
      loginUserId = consumedCheckoutUserId as string | null
      draftId = String(consumedDraftId)
    }

    // 冪等性檢查：防止同一個 Stripe session 被處理兩次
    const { data: existingReport, error: existingReportError } = await supabase
      .from('paid_reports')
      .select('id, status, birth_data')
      .eq('stripe_session_id', session.id)
      .maybeSingle()

    if (existingReportError) {
      return NextResponse.json({ error: 'Report recovery state unavailable' }, { status: 500 })
    }

    const recoverableStructuredReport = (
      existingReport
      && isStructuredConsultationPlan(planCode)
      && (existingReport.status === 'pending' || existingReport.status === 'failed')
    ) ? existingReport : null

    if (existingReport && !recoverableStructuredReport) {
      if (planCode === 'G15') {
        const bindingVerified = await verifyG15ConsumedOrderBinding({
          supabase,
          reportId: existingReport.id,
          stripeSessionId: session.id,
          purchaserUserId: loginUserId,
          birthData: existingReport.birth_data,
        })
        if (!bindingVerified) {
          console.error('[stripe-webhook][g15-consent] duplicate order binding unavailable')
          return NextResponse.json({ received: true, duplicate: true, manual_review: true })
        }
      }
      console.info('[stripe-webhook] duplicate session skipped', {
        sessionFingerprint: operationalFingerprint(session.id),
        reportFingerprint: operationalFingerprint(existingReport.id),
        status: existingReport.status,
      })
      return NextResponse.json({ received: true, duplicate: true })
    }

    let birthData = recoverableStructuredReport?.birth_data ?? null
    let checkoutDraftNeedsUsedAt = false
    if (!recoverableStructuredReport && draftId) {
      // 從 Supabase checkout_drafts 取回完整 birthData（無 500 字元限制）
      const { data: draft, error: draftErr } = await supabase
        .from('checkout_drafts')
        .select('birth_data, plan_code, locale')
        .eq('id', draftId)
        .single()

      if (draftErr) {
        console.error('[stripe-webhook] checkout draft read failed', {
          errorType: operationalErrorClass(draftErr),
        })
      } else if (draft) {
        birthData = draft.birth_data
        if (usesCheckoutPointsOnce || isStructuredConsultationPlan(planCode)) {
          checkoutDraftNeedsUsedAt = true
        } else {
          // 標記已使用，避免重複取用
          const { error: usedAtErr } = await supabase
            .from('checkout_drafts')
            .update({ used_at: new Date().toISOString() })
            .eq('id', draftId)
          if (usedAtErr) {
            console.error('[stripe-webhook] checkout draft update failed', {
              errorType: operationalErrorClass(usedAtErr),
            })
          }
        }
      }
    } else if (!recoverableStructuredReport && birthDataStr) {
      // 向後兼容：舊的 Stripe metadata 直接存 JSON 字串格式
      try { birthData = JSON.parse(birthDataStr) } catch { /* ignore */ }
    }

    const structuredCheckoutDataValid = !isStructuredConsultationPlan(planCode)
      || hasStructuredRecoveryBirthData(planCode, birthData)
    if (!structuredCheckoutDataValid) {
      if (recoverableStructuredReport) {
        const { data: quarantinedReport, error: quarantineError } = await supabase
          .from('paid_reports')
          .update({
            status: 'needs_human_review',
            error_message: C_G15_CHECKOUT_DATA_ERROR,
          })
          .eq('id', recoverableStructuredReport.id)
          .in('status', ['pending', 'failed'])
          .select('id')
          .maybeSingle()
        if (quarantineError || !quarantinedReport) {
          return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
        }
        return NextResponse.json({ received: true, duplicate: true, manual_review: true })
      }

      try {
        const { notify } = await import('@/lib/ai/observability/telegram')
        await notify(
          'Structured checkout data unavailable',
          `plan ${planCode} / Stripe fingerprint ${operationalFingerprint(session.id)} / draft fingerprint ${operationalFingerprint(draftId || 'missing')}`,
        )
      } catch { /* Stripe retry remains the durable recovery boundary. */ }
      return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
    }

    // A failed/pending G15 retry already has an atomically consumed consent
    // binding. Re-check that durable authority before replaying any points or
    // workflow side effect; a later revoke/tamper must quarantine the order.
    if (planCode === 'G15' && recoverableStructuredReport) {
      const bindingVerified = await verifyG15ConsumedOrderBinding({
        supabase,
        reportId: recoverableStructuredReport.id,
        stripeSessionId: session.id,
        purchaserUserId: loginUserId,
        birthData,
      })
      if (!bindingVerified) {
        const { data: quarantinedReport, error: quarantineError } = await supabase
          .from('paid_reports')
          .update({ status: 'needs_human_review', error_message: C_G15_CHECKOUT_DATA_ERROR })
          .eq('id', recoverableStructuredReport.id)
          .in('status', ['pending', 'failed'])
          .select('id')
          .maybeSingle()
        if (quarantineError || !quarantinedReport) {
          return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
        }
        return NextResponse.json({ received: true, duplicate: true, manual_review: true })
      }
    }

    let g15BoundReportId = recoverableStructuredReport?.id || ''
    if (planCode === 'G15' && !recoverableStructuredReport) {
      let consumed: Awaited<ReturnType<typeof consumeG15CheckoutReservationForStripeOrder>> = { ok: false }
      try {
        consumed = await consumeG15CheckoutReservationForStripeOrder({
          supabase,
          birthData,
          purchaserUserId: loginUserId,
          stripeSessionId: session.id,
          reservationId: g15ReservationId,
          checkoutDraftId: draftId,
          expectedReportId: g15ExpectedReportId,
        })
      } catch {
        consumed = { ok: false }
      }
      if (!consumed.ok) {
        return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
      }
      g15BoundReportId = consumed.reportId
      birthData = consumed.birthData
    }

    let checkoutPointsStatus: string | null = null
    if (usesCheckoutPointsOnce) {
      let checkoutPointsResult: unknown = null
      try {
        const checkoutPointsResponse = await supabase.rpc(
          'deduct_checkout_points_once',
          {
            p_user_id: checkoutPointsUserId || null,
            p_amount: checkoutPointsAmount,
            p_reference_id: session.id,
            p_description: `${PLAN_NAMES[planCode] || planCode} 訂單折抵`,
            p_plan_code: planCode,
          },
        )
        if (checkoutPointsResponse.error) {
          console.error('[stripe-webhook][checkout-points] atomic RPC failed')
          return NextResponse.json({ error: 'Checkout points transaction failed' }, { status: 500 })
        }
        checkoutPointsResult = checkoutPointsResponse.data
      } catch {
        console.error('[stripe-webhook][checkout-points] atomic RPC failed')
        return NextResponse.json({ error: 'Checkout points transaction failed' }, { status: 500 })
      }

      const checkoutPointsRow = Array.isArray(checkoutPointsResult)
        ? checkoutPointsResult[0]
        : checkoutPointsResult as { status?: string } | null
      checkoutPointsStatus = checkoutPointsRow?.status || null
      if (
        checkoutPointsStatus !== 'applied'
        && checkoutPointsStatus !== 'already'
        && checkoutPointsStatus !== 'missing'
        && checkoutPointsStatus !== 'insufficient'
        && checkoutPointsStatus !== 'invalid'
      ) {
        console.error('[stripe-webhook][checkout-points] unexpected RPC status')
        return NextResponse.json({ error: 'Checkout points transaction failed' }, { status: 500 })
      }
    }

    if (recoverableStructuredReport) {
      if (
        checkoutPointsStatus === 'missing'
        || checkoutPointsStatus === 'insufficient'
        || checkoutPointsStatus === 'invalid'
      ) {
        const { data: quarantinedReport, error: quarantineError } = await supabase
          .from('paid_reports')
          .update({
            status: 'needs_human_review',
            error_message: C_G15_MANUAL_REVIEW_ERROR,
          })
          .eq('id', recoverableStructuredReport.id)
          .in('status', ['pending', 'failed'])
          .select('id')
          .maybeSingle()
        if (quarantineError || !quarantinedReport) {
          return NextResponse.json({ error: 'Checkout points transaction failed' }, { status: 500 })
        }
        return NextResponse.json({ received: true, duplicate: true, manual_review: true })
      }

      if (planCode === 'G15') {
        const bindingVerified = await verifyG15ConsumedOrderBinding({
          supabase,
          reportId: recoverableStructuredReport.id,
          stripeSessionId: session.id,
          purchaserUserId: loginUserId,
          birthData,
        })
        if (!bindingVerified) {
          const { data: quarantinedReport, error: quarantineError } = await supabase
            .from('paid_reports')
            .update({ status: 'needs_human_review', error_message: C_G15_CHECKOUT_DATA_ERROR })
            .eq('id', recoverableStructuredReport.id)
            .in('status', ['pending', 'failed'])
            .select('id')
            .maybeSingle()
          if (quarantineError || !quarantinedReport) {
            return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
          }
          return NextResponse.json({ received: true, duplicate: true, manual_review: true })
        }
      }

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
      const workflowTriggered = await triggerStructuredConsultationWorkflow(
        siteUrl,
        recoverableStructuredReport.id,
      )
      if (!workflowTriggered) {
        const { error: recoveryRecordError } = await supabase
          .from('paid_reports')
          .update({ error_message: C_G15_WORKFLOW_TRIGGER_ERROR })
          .eq('id', recoverableStructuredReport.id)
          .in('status', ['pending', 'failed'])
        if (recoveryRecordError) {
          console.error('[stripe-webhook][c-g15-workflow] recovery error recording failed')
        }
        console.error('[stripe-webhook][c-g15-workflow] durable trigger failed; Stripe retry requested')
        return NextResponse.json({ error: C_G15_WORKFLOW_TRIGGER_ERROR }, { status: 500 })
      }

      console.info('[stripe-webhook][c-g15-workflow] duplicate payment recovered by durable trigger')
      return NextResponse.json({ received: true, duplicate: true, recovered: true })
    }

    if (checkoutDraftNeedsUsedAt && draftId) {
      const { error: usedAtErr } = await supabase
        .from('checkout_drafts')
        .update({ used_at: new Date().toISOString() })
        .eq('id', draftId)
      if (usedAtErr) {
        console.error('[stripe-webhook] checkout draft update failed', {
          errorType: operationalErrorClass(usedAtErr),
        })
      }
    }

    // 先存入 Supabase（狀態 pending）
    let reportId = g15BoundReportId
    let accessToken = ''
    try {
      const { data: insertData, error: insertErr } = await supabase.from('paid_reports').insert({
        ...(reportId ? { id: reportId } : {}),
        client_name: birthData?.plan_type === 'family_email' || birthData?.plan_type === 'family_reports'
          ? (birthData?.member_names?.filter(Boolean).join('、') || 'Unknown')
          : birthData?.plan === 'R'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join(' × ') || 'Unknown')
          : birthData?.plan_type === 'family'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join('、') || 'Unknown')
          : (birthData?.name || 'Unknown'),
        plan_code: planCode,
        amount_usd: amount,
        stripe_session_id: session.id,
        birth_data: birthData,
        customer_email: customerEmail,
        user_id: loginUserId, // v5.3.22：明確記錄下單用戶身份（不依賴 email）
        status: 'pending',
      }).select('id, access_token').single()

      if (insertErr) {
        const incidentFingerprint = operationalFingerprint(`${session.id}:${planCode}:insert`)
        console.error('[stripe-webhook] report insert failed', {
          errorType: operationalErrorClass(insertErr),
          incidentFingerprint,
        })
        // Phase 5 v5.10.382 — Sentry critical(老闆灌 SENTRY_DSN 後即生效)
        try {
          const { captureMessage } = await import('@/lib/ai/observability/sentry-prod')
          await captureMessage('Stripe webhook Supabase insert failed', 'fatal', {
            tags: { source: 'stripe-webhook', planCode },
            extra: { amount, incidentFingerprint, errorType: operationalErrorClass(insertErr) },
            fingerprint: ['stripe-webhook-supabase-insert-failed'],
          })
        } catch { /* noop */ }
        // insert 失敗 = 客戶付了錢但報告永遠不會生成、回傳 500 讓 Stripe 重試 webhook
        return NextResponse.json({ error: 'Supabase insert failed' }, { status: 500 })
      }
      if (reportId && insertData?.id !== reportId) {
        return NextResponse.json({ error: C_G15_CHECKOUT_DATA_ERROR }, { status: 500 })
      }
      reportId = insertData?.id || reportId
      accessToken = insertData?.access_token || ''

      if (usesCheckoutPointsOnce) {
        if (
          checkoutPointsStatus === 'missing'
          || checkoutPointsStatus === 'insufficient'
          || checkoutPointsStatus === 'invalid'
        ) {
          const { error: quarantineError } = await supabase
            .from('paid_reports')
            .update({
              status: 'needs_human_review',
              error_message: C_G15_MANUAL_REVIEW_ERROR,
            })
            .eq('id', reportId)
            .in('status', ['pending', 'generating'])
            .select('id')
            .maybeSingle()

          if (quarantineError) {
            console.error('[stripe-webhook][checkout-points] quarantine CAS failed')
            return NextResponse.json({ error: 'Checkout points transaction failed' }, { status: 500 })
          }

          console.warn(`[stripe-webhook][checkout-points] ${checkoutPointsStatus}; auto-generation skipped`)
          try {
            const { notify } = await import('@/lib/ai/observability/telegram')
            await notify(
              '結帳點數核對需人工處理',
              `報告 ${reportId} / 方案 ${planCode} / 狀態 ${checkoutPointsStatus}；已停止自動生成。`,
            )
          } catch (notifyError) {
            console.warn('[stripe-webhook][checkout-points] ops notification failed', notifyError)
          }

          return NextResponse.json({ received: true, manual_review: true })
        }
      }

      console.info('✅ 報告記錄已建立:', reportId)

      // 寫入會計系統 revenue_log（自動計算 Stripe 手續費）
      try {
        const originalAmount = (session.amount_subtotal || session.amount_total || 0) / 100
        const finalAmount = amount
        const couponDiscount = Math.max(0, originalAmount - finalAmount)
        const pointsDiscount = hasPaidCheckoutOrder
          ? paidPointsAmount
          : Number(session.metadata?.points_discount_usd || 0)
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

        // 嘗試從 Stripe API 實際取 balance_transaction 的真實手續費
        let actualStripeFee: number | undefined
        if (paymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
            type ChargeWithBal = { balance_transaction?: string | { fee?: number | null } | null }
            const charge = (pi.latest_charge || null) as ChargeWithBal | string | null
            if (charge && typeof charge === 'object' && charge.balance_transaction && typeof charge.balance_transaction === 'object') {
              const fee = charge.balance_transaction.fee
              if (typeof fee === 'number') actualStripeFee = fee / 100
            }
          } catch { /* noop */ }
        }

        await recordRevenue({
          reportId,
          planCode,
          amountUsd: finalAmount,
          stripeSessionId: session.id,
          pointsDiscountUsd: pointsDiscount,
          couponDiscountUsd: couponDiscount,
          customerEmail,
          currency: (session.currency || 'usd').toLowerCase(),
          metadata: {
            payment_intent: paymentIntentId,
            coupon_code: paidCouponCode || session.metadata?.coupon_code || null,
            locale: sessionLocale,
            actual_stripe_fee_usd: actualStripeFee ?? null,
          },
        })

        // 若有真實手續費，覆蓋估算值
        if (typeof actualStripeFee === 'number') {
          await supabase
            .from('revenue_log')
            .update({ stripe_fee_usd: Math.round(actualStripeFee * 10000) / 10000 })
            .eq('stripe_session_id', session.id)
        }
      } catch (revErr) {
        console.error('[stripe-webhook] revenue log write failed', {
          errorType: operationalErrorClass(revErr),
          reportFingerprint: operationalFingerprint(reportId),
        })
      }
    } catch (err) {
      const incidentFingerprint = operationalFingerprint(`${session.id}:${planCode}:database`)
      console.error('[stripe-webhook] database failure', {
        errorType: operationalErrorClass(err),
        incidentFingerprint,
      })
      // Phase 5 v5.10.382 — Sentry fatal(老闆灌 SENTRY_DSN 後即生效)
      try {
        const { captureException } = await import('@/lib/ai/observability/sentry-prod')
        await captureException(new Error('stripe_webhook_database_failure'), {
          tags: { source: 'stripe-webhook', critical: 'supabase-connection-failed', planCode },
          extra: { amount, incidentFingerprint, errorType: operationalErrorClass(err) },
          fingerprint: ['stripe-webhook-supabase-connection-failed'],
        })
      } catch { /* noop */ }
      return NextResponse.json({ error: 'Supabase connection error' }, { status: 500 })
    }

    // v5.10.466 D6 修(bizaudit P1):birthData 缺失原本「靜默不生成」— 客戶已付款、
    // 報告永遠不開始、無人知道(cron 只重試 pending、birth_data 缺失重試也救不了)。
    // 補 Telegram 人工介入告警(不阻塞 webhook 回 200、避免 Stripe 重送)。
    if (!birthData && reportId) {
      try {
        const { notify } = await import('@/lib/ai/observability/telegram')
        await notify(
          '🚨 Webhook 缺 birthData、報告無法生成(需人工介入)',
          `report fingerprint ${operationalFingerprint(reportId)} / plan ${planCode}\n` +
          `Stripe fingerprint ${operationalFingerprint(session.id)}\n` +
          `checkout_drafts 讀取失敗或 metadata 缺失 — 請人工補 birth_data 後重觸發`,
        )
      } catch (tgErr) {
        console.error('[stripe-webhook] missing birth data alert failed', {
          errorType: operationalErrorClass(tgErr),
        })
      }
    }

    // 呼叫 Fly.io 異步報告生成 Pipeline（無超時限制，完整排盤數據）
    if (birthData && reportId) {
      try {
        console.info('觸發 Workflow 報告生成...')
        // v5.3.34：把 JSON.parse 包 try/catch，防止爛 JSON 中斷整個 webhook
        //   additionalData 目前未使用但保留宣告（避免未來業務邏輯要讀）
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let additionalData: unknown = undefined
        if (birthData.additionalPeople) {
          try {
            additionalData = JSON.parse(birthData.additionalPeople as string)
          } catch (parseErr) {
            console.warn('⚠️ birthData.additionalPeople JSON 解析失敗，忽略:', parseErr)
          }
        }

        // 注入 locale（報告語言：zh-TW 繁體 / zh-CN 簡體）
        if (!birthData.locale) {
          birthData.locale = sessionLocale
        }
        // 確保 customer_note 傳入 birth_data
        if (session.metadata?.customer_note && !birthData.customer_note) {
          birthData.customer_note = session.metadata.customer_note
        }
        // D 方案的 topic/question
        if (session.metadata?.topic && !birthData.topic) {
          birthData.topic = session.metadata.topic
        }
        if (session.metadata?.question && !birthData.question) {
          birthData.question = session.metadata.question
        }

        // 記錄優惠碼使用
        const couponCodeUsed = session.metadata?.coupon_code
        if (!hasPaidCheckoutOrder && couponCodeUsed) {
          try {
            const { data: couponRow } = await supabase.from('coupons').select('id, used_count').eq('code', couponCodeUsed).single()
            if (couponRow) {
              await supabase.from('coupons').update({ used_count: (couponRow.used_count || 0) + 1 }).eq('id', couponRow.id)
              await supabase.from('coupon_uses').insert({
                coupon_id: couponRow.id,
                coupon_code: couponCodeUsed,
                order_id: session.id,
                customer_email: customerEmail,
                plan_code: planCode,
                original_amount: (session.amount_subtotal || session.amount_total || 0) / 100,
                discount_applied: ((session.amount_subtotal || 0) - (session.amount_total || 0)) / 100,
              })
            }
          } catch (couponErr) {
            console.error('優惠碼記錄失敗:', couponErr)
          }
        }

        // 觸發 Vercel Workflow 生成報告（持久化、自動重試、不受超時限制）
        // 更新 birth_data 到 Supabase（workflow 從 DB 讀取）
        await supabase.from('paid_reports').update({
          birth_data: birthData,
        }).eq('id', reportId)

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'

        // 付款後立即發訂單確認信（讓客戶知道我們收到了）
        // T12b v5.10.370 — sendEmailWithRetry 取代 raw new Resend + send + 手動 record
        try {
          const planName = PLAN_NAMES[planCode] || planCode
          const safePlanName = escapeHtmlText(planName)
          const dashboardUrl = `${siteUrl}/dashboard?session_id=${session.id}`

          // 組裝客戶填寫的資料確認區塊
          const clientName = String(birthData?.name || birthData?.client_name || '')
          const orderInfoRows: string[] = []
          if (clientName) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">姓名</td><td style="padding:4px 0;">${escapeHtmlText(clientName)}</td></tr>`)

          // 出生日期
          const birthDate = birthData?.birthDate || birthData?.birth_date || ''
          if (birthDate) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生日期</td><td style="padding:4px 0;">${escapeHtmlText(birthDate)}</td></tr>`)

          // 出生時辰
          const birthTime = birthData?.birthTime || birthData?.birth_time || birthData?.time || ''
          if (birthTime) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生時辰</td><td style="padding:4px 0;">${escapeHtmlText(birthTime)}</td></tr>`)

          // 出生地區
          const birthPlace = birthData?.birthCity || birthData?.birth_city || birthData?.city || birthData?.region || ''
          if (birthPlace) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生地區</td><td style="padding:4px 0;">${escapeHtmlText(birthPlace)}</td></tr>`)

          // R方案（合否？）顯示雙方姓名
          if (planCode === 'R' && birthData?.members && Array.isArray(birthData.members)) {
            const memberNames = (birthData.members as Array<{ name?: string }>).map(m => m.name).filter(Boolean).join(' × ')
            if (memberNames) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">比對對象</td><td style="padding:4px 0;">${escapeHtmlText(memberNames)}</td></tr>`)
          }

          // G15方案（家族藍圖）顯示家族成員
          if (planCode === 'G15') {
            const familyNames = birthData?.member_names
              ? (birthData.member_names as string[]).filter(Boolean).join('、')
              : birthData?.members
              ? (birthData.members as Array<{ name?: string }>).map(m => m.name).filter(Boolean).join('、')
              : ''
            if (familyNames) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">家族成員</td><td style="padding:4px 0;">${escapeHtmlText(familyNames)}</td></tr>`)
          }

          // D方案（心之所惑）顯示主題
          const topic = birthData?.topic || birthData?.analysis_topic || ''
          if (topic) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">分析主題</td><td style="padding:4px 0;">${escapeHtmlText(topic)}</td></tr>`)

          // 出門訣顯示事件(僅 E1 事件擇吉有 event_description、E2/E3/E4 不需要)
          if (planCode === 'E1' && (birthData?.event_description || birthData?.eventDescription)) {
            const eventDesc = (birthData.event_description || birthData.eventDescription || '') as string
            if (eventDesc) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">事件描述</td><td style="padding:4px 0;">${escapeHtmlText(eventDesc.slice(0, 50))}</td></tr>`)
          }

          const orderInfoHtml = orderInfoRows.length > 0
            ? `
              <div style="background: #faf8f3; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="font-size: 13px; color: #999; margin: 0 0 8px 0;">您填寫的資料確認：</p>
                <table style="font-size: 14px; color: #333; border-collapse: collapse;">${orderInfoRows.join('')}</table>
              </div>
            `
            : ''

          const confirmSubject = sanitizeEmailSubject(`${clientName || '您'}，已收到您的「${planName}」訂單`)
          const confirmSendResult = await sendEmailWithRetry({
            from: '鑒源命理 <noreply@jianyuan.life>',
            to: customerEmail,
            emailType: 'stripe_webhook',
            reportId,
            metadata: { plan: planCode, stripe_session_fingerprint: operationalFingerprint(session.id), amount },
            subject: confirmSubject,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #333;">
                <!-- 品牌頭部 -->
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 18px; font-weight: bold; color: #1a1a2e; letter-spacing: 4px;">鑒 源</span>
                  <div style="font-size: 11px; color: #999; margin-top: 4px;">JIANYUAN</div>
                </div>

                <h2 style="color: #1a1a2e; margin-bottom: 16px; font-size: 18px;">感謝您的購買</h2>
                <p>${clientName ? `${escapeHtmlText(clientName)}，您好！` : '您好！'}</p>
                <p>我們已收到您的<strong>「${safePlanName}」</strong>訂單，系統正在啟動分析。</p>

                ${orderInfoHtml}

                <p style="background: #f8f6f0; padding: 16px; border-radius: 8px; border-left: 3px solid #c9a84c;">
                  報告預計 <strong>30-60 分鐘</strong>內完成。完成後會再寄信通知您。<br/>
                  您也可以隨時到儀表板查看進度。
                </p>
                <p style="margin-top: 24px; text-align: center;">
                  <a href="${escapeHtmlText(dashboardUrl)}" style="display: inline-block; background: #c9a84c; color: #1a1a2e; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">查看報告進度</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                <p style="font-size: 11px; color: #bbb; text-align: center;">鑒源命理 jianyuan.life</p>
                ${getUnsubscribeHtml(customerEmail)}
              </div>
            `,
          })
          // T12b v5.10.370 — sendEmailWithRetry 已自動 record + dead-letter
          if (confirmSendResult.success) {
            console.info('[stripe-webhook][confirm-send] delivered', {
              reportFingerprint: operationalFingerprint(reportId),
              attempts: confirmSendResult.attempts,
            })
          } else {
            console.warn('[stripe-webhook][confirm-send] dead-letter', {
              reportFingerprint: operationalFingerprint(reportId),
              attempts: confirmSendResult.attempts,
            })
          }
        } catch (emailErr) {
          // sendEmailWithRetry 內部已 catch + dead-letter、外層只接 fatal(import 失敗等)
          console.error('[stripe-webhook][confirm-send] fatal', {
            errorType: operationalErrorClass(emailErr),
            reportFingerprint: operationalFingerprint(reportId),
          })
        }

        // 追 funnel：payment_success
        try {
          await trackFunnelServer({
            sessionId: session.id,
            step: 'payment_success',
            planCode,
            reportId,
            amountUsd: amount,
            metadata: {},
          })
        } catch { /* ignore */ }

        if (isStructuredConsultationPlan(planCode)) {
          const workflowTriggered = await triggerStructuredConsultationWorkflow(siteUrl, reportId)
          if (!workflowTriggered) {
            const { error: triggerRecordError } = await supabase
              .from('paid_reports')
              .update({ error_message: C_G15_WORKFLOW_TRIGGER_ERROR })
              .eq('id', reportId)
              .in('status', ['pending', 'failed'])
            if (triggerRecordError) {
              console.error('[stripe-webhook][c-g15-workflow] trigger error recording failed')
            }
            console.error('[stripe-webhook][c-g15-workflow] durable trigger failed; Stripe retry requested')
            return NextResponse.json({ error: C_G15_WORKFLOW_TRIGGER_ERROR }, { status: 500 })
          }
          console.info('[stripe-webhook][c-g15-workflow] durable workflow triggered')
        } else {
        // 觸發 Workflow（帶超時確認 + Fallback 機制）
        let workflowTriggered = false

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000) // 5 秒超時

          const workflowRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
            body: JSON.stringify({ reportId }),
            signal: controller.signal,
          })
          clearTimeout(timeout)

          if (workflowRes.ok) {
            workflowTriggered = true
            console.info('✅ Workflow 觸發成功')
          } else {
            console.error('❌ Workflow 觸發失敗:', await workflowRes.text())
          }
        } catch (workflowErr) {
          console.error('❌ Workflow 觸發異常:', workflowErr)
        }

        // Fallback: 直接呼叫 generate-report
        if (!workflowTriggered) {
          console.info('⚠️ Workflow 失敗，啟動 Fallback...')
          try {
            const fallbackController = new AbortController()
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000) // 8 秒超時

            const fallbackRes = await fetch(`${siteUrl}/api/generate-report`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
              body: JSON.stringify({ reportId }),
              signal: fallbackController.signal,
            })
            clearTimeout(fallbackTimeout)

            if (fallbackRes.ok) {
              console.info('✅ Fallback 觸發成功')
            } else {
              // 兩者都失敗，記錄到 Supabase
              const errText = await fallbackRes.text().catch(() => 'unknown')
              console.error('❌ Fallback 也失敗:', errText)
              await supabase.from('paid_reports').update({
                error_message: `Webhook: Workflow 和 Fallback 都失敗 (${errText})`,
              }).eq('id', reportId)
            }
          } catch (fallbackErr) {
            console.error('❌ Fallback 觸發異常:', fallbackErr)
            await supabase.from('paid_reports').update({
              error_message: `Webhook 觸發全部失敗: ${fallbackErr}`,
            }).eq('id', reportId)
          }
        }
        }
      } catch (err) {
        console.error('[stripe-webhook] report trigger failed', {
          errorType: operationalErrorClass(err),
          reportFingerprint: operationalFingerprint(reportId),
        })
        if (isStructuredConsultationPlan(planCode)) {
          return NextResponse.json({ error: C_G15_WORKFLOW_EXCEPTION_ERROR }, { status: 500 })
        }
      }
    }

    if (!usesCheckoutPointsOnce) {
    // === 點數折抵扣除（付款成功才真正扣）— 原子操作版 ===
    try {
      const pointsUsed = parseInt(session.metadata?.points_used || '0')
      const pointsUserId = session.metadata?.points_user_id || ''
      if (pointsUsed > 0 && pointsUserId) {
        // 原子操作：用 .gte('balance', pointsUsed) 確保餘額足夠才扣除，防止併發導致負數
        const { data: updated, error: deductErr } = await supabase.rpc('deduct_points', {
          p_user_id: pointsUserId,
          p_amount: pointsUsed,
        })

        // 如果 RPC 不存在，fallback 為帶條件的 update（仍比 read-then-write 安全）
        if (deductErr?.message?.includes('function') || deductErr?.code === '42883') {
          console.warn('⚠️ deduct_points RPC 不存在，使用 fallback 帶條件更新')
          const { data: pts } = await supabase
            .from('user_points')
            .select('balance, total_used')
            .eq('user_id', pointsUserId)
            .gte('balance', pointsUsed)
            .single()

          if (pts) {
            const newBalance = pts.balance - pointsUsed
            const { error: updateErr } = await supabase
              .from('user_points')
              .update({
                balance: newBalance,
                total_used: (pts.total_used || 0) + pointsUsed,
              })
              .eq('user_id', pointsUserId)
              .gte('balance', pointsUsed) // 二次確認：防止在 select 和 update 之間被其他請求修改

            if (!updateErr) {
              await supabase.from('point_transactions').insert({
                user_id: pointsUserId,
                type: 'use_checkout',
                amount: -pointsUsed,
                balance_after: newBalance,
                description: `${({ C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運' } as Record<string,string>)[planCode] || planCode} 訂單折抵`,
                reference_id: session.id,
              })
              console.info('[stripe-webhook][points] fallback applied', {
                userFingerprint: operationalFingerprint(pointsUserId),
                pointsUsed,
                balance: newBalance,
              })
            }
          }
        } else if (!deductErr && updated !== null) {
          // RPC 成功，updated 為新餘額
          const newBalance = typeof updated === 'number' ? updated : 0
          await supabase.from('point_transactions').insert({
            user_id: pointsUserId,
            type: 'use_checkout',
            amount: -pointsUsed,
            balance_after: newBalance,
            description: `${({ C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運' } as Record<string,string>)[planCode] || planCode} 訂單折抵`,
            reference_id: session.id,
          })
          console.info('[stripe-webhook][points] rpc applied', {
            userFingerprint: operationalFingerprint(pointsUserId),
            pointsUsed,
            balance: newBalance,
          })
        }
      }
    } catch (ptsErr) {
      console.error('⚠️ 點數扣除失敗（不影響報告生成）:', ptsErr)
    }
    }

    // === 推薦碼首次購買點數發放 ===
    try {
      if (customerEmail) {
        // 1. 從 referrals 表直接用 referred_email 找（最可靠，不依賴 auth view）
        let userId: string | undefined

        // 先查 referrals 表是否有此 email 的記錄（register API 已寫入）
        const { data: refByEmail } = await supabase
          .from('referrals')
          .select('referred_user_id')
          .eq('referred_email', customerEmail)
          .eq('status', 'registered')
          .maybeSingle()

        userId = refByEmail?.referred_user_id

        // 如果 referrals 沒查到（可能 email 大小寫不同），嘗試 auth view
        if (!userId) {
          const { data: authUser } = await supabase
            .from('auth_users_view')
            .select('id')
            .eq('email', customerEmail)
            .maybeSingle()
          userId = authUser?.id
        }

        if (userId) {
          // 2. 查詢 referrals 表：是否有 status='registered' 的推薦記錄
          const { data: referral } = await supabase
            .from('referrals')
            .select('id, referrer_user_id, referral_code')
            .eq('referred_user_id', userId)
            .in('status', ['registered', 'purchased'])
            .maybeSingle()

          if (referral) {
            // 防重複發放：用 stripe session_id 當 reference_id，若已存在則跳過
            const { data: existingTx } = await supabase
              .from('point_transactions')
              .select('id')
              .eq('reference_id', session.id)
              .eq('type', 'earn_referral')
              .maybeSingle()

            if (existingTx) {
              console.info('[stripe-webhook][referral] duplicate skipped', {
                sessionFingerprint: operationalFingerprint(session.id),
              })
            } else {
              // 3. 查購買次數，首購 10 點、回購 5 點
              const { count: reportCount } = await supabase
                .from('paid_reports')
                .select('id', { count: 'exact', head: true })
                .eq('customer_email', customerEmail)
                .in('status', ['completed', 'generating', 'pending'])

              const isFirstPurchase = reportCount !== null && reportCount <= 1
              const REFERRER_POINTS = isFirstPurchase ? 10 : 5
              const now = new Date().toISOString()
              const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
              const referrerId = referral.referrer_user_id

              // 首購時更新 referrals 狀態
              if (isFirstPurchase) {
                await supabase
                  .from('referrals')
                  .update({
                    status: 'purchased',
                    purchased_at: now,
                    referrer_points_awarded: REFERRER_POINTS,
                    referred_points_awarded: 0, // 被推薦人已在註冊時得到積分
                  })
                  .eq('id', referral.id)
              }

              // 原子加點 RPC（防 race condition + 冪等）
              // add_points 會原子 UPSERT user_points + INSERT point_transactions，
              // 同一 (reference_id, type) 已存在則 skipped=true 不重複加值
              const { data: addResult, error: addErr } = await supabase.rpc('add_points', {
                p_user_id: referrerId,
                p_delta: REFERRER_POINTS,
                p_reason: isFirstPurchase ? '推薦用戶首次購買獎勵' : '推薦用戶回購獎勵',
                p_reference_id: session.id,
                p_type: 'earn_referral',
                p_expires_at: expiresAt,
              })

              if (addErr) {
                console.error('⚠️ add_points RPC 失敗，退回舊 addPointsSafe 邏輯:', addErr)

                // Fallback：RPC 不存在時退回 select-then-update（有 race condition 但至少可運作）
                const { data: existing } = await supabase
                  .from('user_points')
                  .select('balance, total_earned')
                  .eq('user_id', referrerId)
                  .maybeSingle()

                let referrerFinalBalance: number
                if (existing) {
                  referrerFinalBalance = (existing.balance || 0) + REFERRER_POINTS
                  await supabase
                    .from('user_points')
                    .update({
                      balance: referrerFinalBalance,
                      total_earned: (existing.total_earned || 0) + REFERRER_POINTS,
                    })
                    .eq('user_id', referrerId)
                } else {
                  referrerFinalBalance = REFERRER_POINTS
                  await supabase.from('user_points').insert({
                    user_id: referrerId,
                    balance: REFERRER_POINTS,
                    total_earned: REFERRER_POINTS,
                    total_used: 0,
                  })
                }

                await supabase.from('point_transactions').insert({
                  user_id: referrerId,
                  type: 'earn_referral',
                  amount: REFERRER_POINTS,
                  balance_after: referrerFinalBalance,
                  description: isFirstPurchase ? '推薦用戶首次購買獎勵' : '推薦用戶回購獎勵',
                  reference_id: session.id,
                  expires_at: expiresAt,
                })
              } else {
                // RPC 成功。addResult 是 TABLE(balance_after int, skipped bool)
                const resultRow = Array.isArray(addResult) ? addResult[0] : addResult
                const finalBalance = resultRow?.balance_after ?? 0
                const wasSkipped = resultRow?.skipped ?? false

                if (wasSkipped) {
                  console.info('[stripe-webhook][referral] rpc duplicate skipped', {
                    sessionFingerprint: operationalFingerprint(session.id),
                  })
                } else {
                  console.info('[stripe-webhook][referral] points applied', {
                    referrerFingerprint: operationalFingerprint(referrerId),
                    points: REFERRER_POINTS,
                    balance: finalBalance,
                    firstPurchase: isFirstPurchase,
                  })
                }
              }

              // 首購時更新 referral_codes.total_referrals
              if (isFirstPurchase && referral.referral_code) {
                const { data: codeRow } = await supabase
                  .from('referral_codes')
                  .select('total_referrals')
                  .eq('code', referral.referral_code)
                  .single()

                if (codeRow) {
                  await supabase
                    .from('referral_codes')
                    .update({ total_referrals: (codeRow.total_referrals || 0) + 1 })
                    .eq('code', referral.referral_code)
                }
              }
            }
          }
        }
      }
    } catch (referralErr) {
      // 推薦碼邏輯失敗不影響報告生成
      console.error('⚠️ 推薦碼點數發放失敗（不影響報告生成）:', referralErr)
    }

  } else if (
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.expired' ||
    event.type === 'payment_intent.payment_failed'
  ) {
    const obj = event.data.object as { id?: string; last_payment_error?: { message?: string }; metadata?: Record<string, string>; amount_total?: number }
    const isCheckoutTerminalFailure = (
      event.type === 'checkout.session.async_payment_failed'
      || event.type === 'checkout.session.expired'
    )
    const failedPaidContractVersion = obj.metadata?.paid_checkout_contract || ''
    const failedPaidRequestKey = obj.metadata?.paid_checkout_request_key || ''
    const hasFailedPaidContractMetadata = Boolean(
      failedPaidContractVersion || failedPaidRequestKey,
    )
    if (isCheckoutTerminalFailure && hasFailedPaidContractMetadata) {
      const stripeSessionId = obj.id || ''
      if (
        failedPaidContractVersion !== 'v1'
        || !PAID_CHECKOUT_REQUEST_KEY_RE.test(failedPaidRequestKey)
        || !STRIPE_CHECKOUT_SESSION_ID_RE.test(stripeSessionId)
      ) {
        return NextResponse.json({ error: 'Paid checkout release identity unavailable' }, { status: 500 })
      }
      let releaseData: unknown = null
      let releaseError: unknown = null
      try {
        const response = await getSupabase().rpc('release_paid_checkout_reservation', {
          p_request_key: failedPaidRequestKey,
          p_stripe_session_id: stripeSessionId,
        })
        releaseData = response.data
        releaseError = response.error
      } catch {
        return NextResponse.json({ error: 'Paid checkout release failed' }, { status: 500 })
      }
      const release = (Array.isArray(releaseData) ? releaseData[0] : releaseData) as Record<string, unknown> | null
      if (
        releaseError
        || !['released', 'already_released', 'already_consumed'].includes(String(release?.outcome))
        || release?.request_key !== failedPaidRequestKey
        || release?.stripe_session_id !== stripeSessionId
      ) {
        return NextResponse.json({ error: 'Paid checkout release failed' }, { status: 500 })
      }
    }
    if (
      isCheckoutTerminalFailure
      && obj.metadata?.plan_code === 'G15'
    ) {
      const reservationId = obj.metadata.g15_consent_reservation_id || ''
      const stripeSessionId = obj.id || ''
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(reservationId)
        || !STRIPE_CHECKOUT_SESSION_ID_RE.test(stripeSessionId)
      ) {
        return NextResponse.json({ error: 'G15 checkout reservation release identity unavailable' }, { status: 500 })
      }
      let releaseData: unknown = null
      let releaseError: unknown = null
      try {
        const response = await getSupabase().rpc('release_g15_checkout_consent_reservation', {
          p_reservation_id: reservationId,
          p_stripe_session_id: stripeSessionId,
        })
        releaseData = response.data
        releaseError = response.error
      } catch {
        return NextResponse.json({ error: 'G15 checkout reservation release failed' }, { status: 500 })
      }
      const release = (Array.isArray(releaseData) ? releaseData[0] : releaseData) as Record<string, unknown> | null
      if (
        releaseError
        || !['released', 'already_released', 'already_consumed'].includes(String(release?.outcome))
        || release?.reservation_id !== reservationId
      ) {
        return NextResponse.json({ error: 'G15 checkout reservation release failed' }, { status: 500 })
      }
    }

    // Alert delivery is auxiliary; reservation release above is authoritative
    // and must never be swallowed by this best-effort notification boundary.
    try {
      const reason = obj.last_payment_error?.message
        || (event.type === 'checkout.session.expired' ? 'Checkout session expired (20 分鐘未付款)' : '付款失敗')
      await notifyStripeFailed(
        obj.id || 'unknown',
        reason,
        typeof obj.amount_total === 'number' ? obj.amount_total / 100 : undefined,
      )
    } catch (notifyErr) {
      console.error('Stripe 失敗告警發送失敗:', notifyErr)
    }
  } else if (
    event.type === 'charge.refunded'
    || event.type === 'refund.created'
    || event.type === 'refund.updated'
    || event.type === 'refund.failed'
  ) {
    try {
      const refundObject = event.data.object as {
        id?: string
        charge?: string | { id?: string } | null
        reason?: string | null
        status?: string | null
        failure_reason?: string | null
        metadata?: Record<string, string> | null
      }
      const stripe = getStripe()
      let canonicalRefund: Stripe.Refund | null = null
      if (event.type !== 'charge.refunded') {
        if (!event.id || !refundObject.id) {
          return NextResponse.json({ error: 'Refund event identity unavailable' }, { status: 500 })
        }
        canonicalRefund = await stripe.refunds.retrieve(refundObject.id)
        const canonicalRefundChargeId = typeof canonicalRefund.charge === 'string'
          ? canonicalRefund.charge
          : canonicalRefund.charge?.id
        const canonicalRefundPaymentIntentId = typeof canonicalRefund.payment_intent === 'string'
          ? canonicalRefund.payment_intent
          : canonicalRefund.payment_intent?.id
        if (
          canonicalRefund.id !== refundObject.id
          || !canonicalRefundChargeId
          || !canonicalRefundPaymentIntentId
          || !Number.isSafeInteger(canonicalRefund.amount)
          || canonicalRefund.amount <= 0
          || !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(canonicalRefund.status || '')
        ) {
          return NextResponse.json({ error: 'Canonical refund state unavailable' }, { status: 500 })
        }
        if (canonicalRefund.status === 'pending' || canonicalRefund.status === 'requires_action') {
          return NextResponse.json({
            received: true,
            refund_outcome: 'provider_pending',
          })
        }
      }

      const terminalCandidate = canonicalRefund?.status === 'failed'
        || canonicalRefund?.status === 'canceled'

      if (terminalCandidate) {
        if (!event.id || !canonicalRefund) {
          return NextResponse.json({ error: 'Refund reversal identity unavailable' }, { status: 500 })
        }

        // A signed event is only a trigger. Refund status/metadata and the
        // cumulative accounting amount both come from fresh Stripe objects.
        const canonicalChargeId = typeof canonicalRefund.charge === 'string'
          ? canonicalRefund.charge
          : canonicalRefund.charge?.id
        const canonicalRefundPaymentIntentId = typeof canonicalRefund.payment_intent === 'string'
          ? canonicalRefund.payment_intent
          : canonicalRefund.payment_intent?.id
        if (
          !canonicalChargeId
          || !canonicalRefundPaymentIntentId
          || !['failed', 'canceled'].includes(canonicalRefund.status || '')
          || !Number.isSafeInteger(canonicalRefund.amount)
          || canonicalRefund.amount <= 0
        ) {
          return NextResponse.json({ error: 'Canonical refund reversal state unavailable' }, { status: 500 })
        }

        const canonicalCharge = await stripe.charges.retrieve(canonicalChargeId)
        const paymentIntentId = typeof canonicalCharge.payment_intent === 'string'
          ? canonicalCharge.payment_intent
          : canonicalCharge.payment_intent?.id
        const refundedAmountCents = canonicalCharge.amount_refunded
        if (
          canonicalCharge.id !== canonicalChargeId
          || !paymentIntentId
          || paymentIntentId !== canonicalRefundPaymentIntentId
          || !Number.isSafeInteger(refundedAmountCents)
          || refundedAmountCents < 0
        ) {
          return NextResponse.json({ error: 'Canonical refund reversal state unavailable' }, { status: 500 })
        }

        const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
        const sessionId = sessions.data[0]?.id
        if (!sessionId) {
          return NextResponse.json({ error: 'Refund checkout session unavailable' }, { status: 500 })
        }

        const metadata = canonicalRefund.metadata || {}
        const rawAdminRequestId = metadata.jianyuan_refund_request_id
        const rawAdminPayloadSha256 = metadata.jianyuan_refund_payload_sha256
        const hasAnyAdminIdentity = Boolean(rawAdminRequestId || rawAdminPayloadSha256)
        const hasValidAdminIdentity = typeof rawAdminRequestId === 'string'
          && /^[A-Za-z0-9_-]{8,64}$/u.test(rawAdminRequestId)
          && typeof rawAdminPayloadSha256 === 'string'
          && /^[0-9a-f]{64}$/u.test(rawAdminPayloadSha256)
        if (hasAnyAdminIdentity && !hasValidAdminIdentity) {
          return NextResponse.json({ error: 'Refund reversal request identity unavailable' }, { status: 500 })
        }

        const allowedFailureReasons = new Set([
          'lost_or_stolen_card',
          'expired_or_canceled_card',
          'charge_for_pending_refund_disputed',
          'insufficient_funds',
          'declined',
          'merchant_request',
          'unknown',
        ])
        const failureReason = canonicalRefund.failure_reason
          && allowedFailureReasons.has(canonicalRefund.failure_reason)
          ? canonicalRefund.failure_reason
          : canonicalRefund.status || 'unknown'
        const { data, error } = await getSupabase().rpc('reverse_stripe_refund_event', {
          p_event_id: event.id,
          p_event_type: event.type,
          p_stripe_session_id: sessionId,
          p_charge_id: canonicalChargeId,
          p_payment_intent_id: paymentIntentId,
          p_refund_id: canonicalRefund.id,
          p_refund_status: canonicalRefund.status,
          p_refund_amount_cents: canonicalRefund.amount,
          p_refunded_amount_cents: refundedAmountCents,
          p_failure_reason: failureReason,
          p_admin_request_id: hasValidAdminIdentity ? rawAdminRequestId : null,
          p_admin_payload_sha256: hasValidAdminIdentity ? rawAdminPayloadSha256 : null,
        })
        const result = Array.isArray(data) ? data[0] : data
        const outcome = result?.outcome
        const expectedIntentState = canonicalRefund.status === 'failed'
          ? 'provider_failed'
          : 'provider_canceled'
        if (
          error
          || !result
          || !['reversed', 'stale', 'already'].includes(outcome)
          || !Number.isSafeInteger(result.refunded_amount_cents)
          || result.refunded_amount_cents < 0
          || result.refunded_amount_cents > refundedAmountCents
          || (outcome !== 'already' && result.refunded_amount_cents !== refundedAmountCents)
          || typeof result.is_full_refund !== 'boolean'
          || !Number.isSafeInteger(result.points_restored)
          || result.points_restored < 0
          || ![null, expectedIntentState].includes(result.intent_state ?? null)
        ) {
          return NextResponse.json({ error: 'Refund reversal unavailable' }, { status: 500 })
        }

        return NextResponse.json({
          received: true,
          refund_outcome: outcome,
          is_full_refund: result.is_full_refund,
          points_restored: result.points_restored,
          intent_state: result.intent_state ?? null,
        })
      }

      const chargeId = event.type === 'charge.refunded'
        ? refundObject.id
        : typeof canonicalRefund?.charge === 'string'
          ? canonicalRefund.charge
          : canonicalRefund?.charge?.id
      const refundId = event.type === 'charge.refunded' ? null : canonicalRefund?.id || null
      const allowedReasons = new Set(['duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge'])
      const reason = canonicalRefund?.reason && allowedReasons.has(canonicalRefund.reason)
        ? canonicalRefund.reason
        : event.type

      if (!event.id || !chargeId || (event.type !== 'charge.refunded' && !refundId)) {
        return NextResponse.json({ error: 'Refund event identity unavailable' }, { status: 500 })
      }

      // All supported event variants converge on a freshly retrieved Charge.
      // Refund.amount is one refund; Charge.amount_refunded is the cumulative
      // source of truth across multiple partial refunds.
      const canonicalCharge = await stripe.charges.retrieve(chargeId)
      const paymentIntentId = typeof canonicalCharge.payment_intent === 'string'
        ? canonicalCharge.payment_intent
        : canonicalCharge.payment_intent?.id
      const refundedAmountCents = canonicalCharge.amount_refunded

      if (
        canonicalCharge.id !== chargeId
        || !paymentIntentId
        || (
          canonicalRefund
          && (
            typeof canonicalRefund.payment_intent === 'string'
              ? canonicalRefund.payment_intent
              : canonicalRefund.payment_intent?.id
          ) !== paymentIntentId
        )
        || !Number.isSafeInteger(refundedAmountCents)
        || refundedAmountCents <= 0
      ) {
        return NextResponse.json({ error: 'Canonical refund state unavailable' }, { status: 500 })
      }

      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
      const sessionId = sessions.data[0]?.id
      if (!sessionId) {
        return NextResponse.json({ error: 'Refund checkout session unavailable' }, { status: 500 })
      }

      const { data, error } = await getSupabase().rpc('reconcile_stripe_refund_event', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_session_id: sessionId,
        p_charge_id: chargeId,
        p_payment_intent_id: paymentIntentId,
        p_refund_id: refundId,
        p_refunded_amount_cents: refundedAmountCents,
        p_reason: reason,
      })
      const result = Array.isArray(data) ? data[0] : data
      const outcome = result?.outcome
      if (
        error
        || !result
        || !['applied', 'stale', 'already'].includes(outcome)
        || !Number.isSafeInteger(result.refunded_amount_cents)
        || result.refunded_amount_cents <= 0
        || result.refunded_amount_cents > refundedAmountCents
        || (outcome !== 'already' && result.refunded_amount_cents !== refundedAmountCents)
        || typeof result.is_full_refund !== 'boolean'
        || !Number.isSafeInteger(result.points_clawed_back)
        || result.points_clawed_back < 0
        || (!result.is_full_refund && result.points_clawed_back !== 0)
      ) {
        return NextResponse.json({ error: 'Refund reconciliation unavailable' }, { status: 500 })
      }

      return NextResponse.json({
        received: true,
        refund_outcome: outcome,
        is_full_refund: result.is_full_refund,
        points_clawed_back: result.points_clawed_back,
      })
    } catch (refundErr) {
      console.error('[stripe-webhook] refund reconciliation failed', {
        errorType: operationalErrorClass(refundErr),
        errorFingerprint: operationalFingerprint(
          refundErr instanceof Error ? `${refundErr.name}:${refundErr.message}` : typeof refundErr,
        ),
      })
      return NextResponse.json({ error: 'Refund reconciliation failed' }, { status: 500 })
    }
  } else if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    // v5.10.271 Gemini L4 P0#1:Stripe dispute webhook → 立即 Telegram alert(chargeback 是緊急情況)
    try {
      const dispute = event.data.object as {
        id?: string
        amount?: number // cents
        reason?: string
        status?: string
        charge?: string
      }
      const amount = (dispute.amount || 0) / 100
      const { notify } = await import('@/lib/ai/observability/telegram')
      await notify(
        '🚨 Stripe Dispute(Chargeback)',
        `Dispute ID: ${dispute.id}\n` +
        `Charge: ${dispute.charge}\n` +
        `金額: $${amount}\n` +
        `原因: ${dispute.reason || '?'}\n` +
        `狀態: ${dispute.status || '?'}\n` +
        `Event: ${event.type}\n\n` +
        `立即查 Stripe Dashboard 應對(回應 evidence 期限通常 7 天、否則自動 lost)`,
      )
    } catch (e) {
      console.error('[webhook] dispute alert 失敗:', e)
    }
  }

  return NextResponse.json({ received: true })
}
