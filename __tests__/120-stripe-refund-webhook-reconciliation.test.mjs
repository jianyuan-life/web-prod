import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const virtualModules = new Map([
  ['stripe', dataModule(`
    export default class Stripe {
      constructor() {
        const state = globalThis.__refundWebhookState
        this.webhooks = { constructEvent() { return state.event } }
        this.charges = {
          async retrieve(chargeId) {
            state.stripeCalls.push({ name: 'charges.retrieve', chargeId })
            if (state.chargeError) throw state.chargeError
            return state.canonicalCharge
          },
        }
        this.refunds = {
          async retrieve(refundId) {
            state.stripeCalls.push({ name: 'refunds.retrieve', refundId })
            if (state.refundError) throw state.refundError
            if (state.canonicalRefund) return state.canonicalRefund
            const eventObject = state.event?.data?.object || {}
            const charge = typeof eventObject.charge === 'string'
              ? eventObject.charge
              : eventObject.charge?.id
            const paymentIntent = typeof state.canonicalCharge?.payment_intent === 'string'
              ? state.canonicalCharge.payment_intent
              : state.canonicalCharge?.payment_intent?.id
            return {
              id: refundId,
              charge,
              payment_intent: paymentIntent,
              amount: Number.isSafeInteger(eventObject.amount) && eventObject.amount > 0
                ? eventObject.amount
                : 1,
              reason: eventObject.reason || null,
              status: 'succeeded',
              metadata: eventObject.metadata || {},
            }
          },
        }
        this.checkout = {
          sessions: {
            async list(input) {
              state.stripeCalls.push({ name: 'checkout.sessions.list', input })
              if (state.sessionError) throw state.sessionError
              return { data: state.sessions }
            },
          },
        }
      }
    }
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() {
      return {
        async rpc(name, input) {
          const state = globalThis.__refundWebhookState
          state.rpcCalls.push({ name, input })
          if (state.rpcHandler) return state.rpcHandler(name, input)
          return state.rpcResult
        },
      }
    }
  `)],
  ['@/lib/resend-helper', dataModule('export async function sendEmailWithRetry(){return {success:true}}')],
  ['@/lib/unsubscribe', dataModule('export function getUnsubscribeHtml(){return ""}')],
  ['@/lib/accounting', dataModule('export async function recordRevenue(){}')],
  ['@/lib/funnel-tracker', dataModule('export async function trackFunnelServer(){}')],
  ['@/lib/ai/observability/telegram', dataModule(`
    export async function notifyStripeFailed(){return true}
    export async function notify(...args){globalThis.__refundWebhookState.notifications.push(args);return true}
  `)],
  ['@/lib/plan-names', dataModule('export const PLAN_NAMES = {}')],
  ['@/lib/checkout/g15-independent-consent', dataModule(`
    export const G15_CONSENT_PURPOSE = 'synthetic-purpose'
    export const G15_CONSENT_SHARING_SCOPE = 'synthetic-scope'
    export const G15_INDEPENDENT_CONSENT_POLICY_VERSION = 'synthetic-policy'
    export function hashG15ConsentReportIds(){return 'synthetic-hash'}
    export function validateG15PersistedConsentAuthority(){return {ok:false}}
  `)],
  ['@/lib/checkout/g15-consent-order.server', dataModule(`
    export async function verifyG15ConsumedOrderBinding(){return {ok:false}}
  `)],
  ['@/lib/checkout/g15-context', dataModule('export function validateG15ConsultationContext(){return {ok:true}}')],
  ['@/lib/security/operational-telemetry', dataModule(`
    export function escapeHtmlText(value){return String(value)}
    export function operationalErrorClass(){return 'ExternalError'}
    export function operationalFingerprint(){return 'fp:synthetic'}
    export function sanitizeEmailSubject(value){return String(value)}
  `)],
])

function resolveLocalModule(fullPath) {
  for (const candidate of [`${fullPath}.ts`, `${fullPath}.tsx`, `${fullPath}.mjs`, path.join(fullPath, 'index.ts')]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier.startsWith('@/')) {
      const localUrl = resolveLocalModule(path.join(root, specifier.slice(2)))
      if (localUrl) return { url: localUrl, shortCircuit: true }
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !context.parentURL.startsWith('data:')) {
      const fullPath = fileURLToPath(new URL(specifier, context.parentURL))
      if (!path.extname(fullPath)) {
        const localUrl = resolveLocalModule(fullPath)
        if (localUrl) return { url: localUrl, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-webhook-secret'
process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'

const { POST } = await import(pathToFileURL(path.join(root, 'app/api/webhook/stripe/route.ts')).href)

function makeState(overrides = {}) {
  return {
    event: {
      id: 'evt_charge_refunded_1',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', payment_intent: 'pi_stale', amount_refunded: 200 } },
    },
    canonicalCharge: { id: 'ch_1', payment_intent: 'pi_canonical', amount_refunded: 600 },
    canonicalRefund: null,
    sessions: [{ id: 'cs_1' }],
    chargeError: null,
    refundError: null,
    sessionError: null,
    rpcResult: { data: [{ outcome: 'applied', refunded_amount_cents: 600, is_full_refund: false, points_clawed_back: 0 }], error: null },
    rpcHandler: null,
    stripeCalls: [],
    rpcCalls: [],
    notifications: [],
    ...overrides,
  }
}

async function dispatch(state) {
  globalThis.__refundWebhookState = state
  const request = new Request('https://jianyuan.life/api/webhook/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'synthetic-signature' },
    body: '{}',
  })
  return POST(request)
}

test('charge.refunded resolves the canonical charge and never records its charge id as a refund id', async () => {
  const state = makeState()
  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(state.stripeCalls, [
    { name: 'charges.retrieve', chargeId: 'ch_1' },
    { name: 'checkout.sessions.list', input: { payment_intent: 'pi_canonical', limit: 1 } },
  ])
  assert.deepEqual(state.rpcCalls, [{
    name: 'reconcile_stripe_refund_event',
    input: {
      p_event_id: 'evt_charge_refunded_1',
      p_event_type: 'charge.refunded',
      p_stripe_session_id: 'cs_1',
      p_charge_id: 'ch_1',
      p_payment_intent_id: 'pi_canonical',
      p_refund_id: null,
      p_refunded_amount_cents: 600,
      p_reason: 'charge.refunded',
    },
  }])
})

test('refund.created records the actual refund id and canonical cumulative amount, not the single refund amount', async () => {
  const state = makeState({
    event: {
      id: 'evt_refund_created_1',
      type: 'refund.created',
      data: {
        object: {
          id: 're_2',
          charge: { id: 'ch_2' },
          payment_intent: 'pi_untrusted',
          amount: 250,
          reason: 'requested_by_customer',
        },
      },
    },
    canonicalCharge: { id: 'ch_2', payment_intent: { id: 'pi_2' }, amount_refunded: 950 },
    sessions: [{ id: 'cs_2' }],
    rpcResult: { data: [{ outcome: 'applied', refunded_amount_cents: 950, is_full_refund: false, points_clawed_back: 0 }], error: null },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(state.stripeCalls, [
    { name: 'refunds.retrieve', refundId: 're_2' },
    { name: 'charges.retrieve', chargeId: 'ch_2' },
    { name: 'checkout.sessions.list', input: { payment_intent: 'pi_2', limit: 1 } },
  ])
  assert.deepEqual(state.rpcCalls[0], {
    name: 'reconcile_stripe_refund_event',
    input: {
      p_event_id: 'evt_refund_created_1',
      p_event_type: 'refund.created',
      p_stripe_session_id: 'cs_2',
      p_charge_id: 'ch_2',
      p_payment_intent_id: 'pi_2',
      p_refund_id: 're_2',
      p_refunded_amount_cents: 950,
      p_reason: 'requested_by_customer',
    },
  })
})

test('pending refund is fresh-checked and acknowledged without booking accounting or clawing points', async () => {
  const state = makeState({
    event: {
      id: 'evt_refund_pending_1',
      type: 'refund.created',
      data: { object: { id: 're_pending_1', charge: 'ch_untrusted', status: 'succeeded' } },
    },
    canonicalRefund: {
      id: 're_pending_1',
      charge: 'ch_1',
      payment_intent: 'pi_canonical',
      amount: 600,
      status: 'pending',
      metadata: {},
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(state.stripeCalls, [{ name: 'refunds.retrieve', refundId: 're_pending_1' }])
  assert.equal(state.rpcCalls.length, 0)
  assert.deepEqual(await response.json(), {
    received: true,
    refund_outcome: 'provider_pending',
  })
})

test('refund.failed retrieves fresh Refund and Charge identities before atomically reversing to current Charge truth', async () => {
  const state = makeState({
    event: {
      id: 'evt_refund_failed_1',
      type: 'refund.failed',
      data: {
        object: {
          id: 're_failed_1',
          charge: 'ch_untrusted',
          status: 'succeeded',
          metadata: { jianyuan_refund_request_id: 'untrusted' },
        },
      },
    },
    canonicalRefund: {
      id: 're_failed_1',
      charge: { id: 'ch_1' },
      payment_intent: 'pi_canonical',
      amount: 1000,
      status: 'failed',
      failure_reason: 'declined',
      metadata: {
        jianyuan_refund_request_id: 'refund-request-1',
        jianyuan_refund_payload_sha256: 'a'.repeat(64),
      },
    },
    canonicalCharge: {
      id: 'ch_1',
      payment_intent: { id: 'pi_canonical' },
      amount_refunded: 0,
    },
    rpcResult: {
      data: [{
        outcome: 'reversed',
        refunded_amount_cents: 0,
        is_full_refund: false,
        points_restored: 10,
        intent_state: 'provider_failed',
      }],
      error: null,
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(state.stripeCalls, [
    { name: 'refunds.retrieve', refundId: 're_failed_1' },
    { name: 'charges.retrieve', chargeId: 'ch_1' },
    { name: 'checkout.sessions.list', input: { payment_intent: 'pi_canonical', limit: 1 } },
  ])
  assert.deepEqual(state.rpcCalls, [{
    name: 'reverse_stripe_refund_event',
    input: {
      p_event_id: 'evt_refund_failed_1',
      p_event_type: 'refund.failed',
      p_stripe_session_id: 'cs_1',
      p_charge_id: 'ch_1',
      p_payment_intent_id: 'pi_canonical',
      p_refund_id: 're_failed_1',
      p_refund_status: 'failed',
      p_refund_amount_cents: 1000,
      p_refunded_amount_cents: 0,
      p_failure_reason: 'declined',
      p_admin_request_id: 'refund-request-1',
      p_admin_payload_sha256: 'a'.repeat(64),
    },
  }])
  assert.deepEqual(await response.json(), {
    received: true,
    refund_outcome: 'reversed',
    is_full_refund: false,
    points_restored: 10,
    intent_state: 'provider_failed',
  })
})

test('refund.updated with a canceled fresh Refund reaches the same reversal authority', async () => {
  const state = makeState({
    event: {
      id: 'evt_refund_canceled_1',
      type: 'refund.updated',
      data: { object: { id: 're_canceled_1', status: 'canceled' } },
    },
    canonicalRefund: {
      id: 're_canceled_1',
      charge: 'ch_1',
      payment_intent: 'pi_canonical',
      amount: 750,
      status: 'canceled',
      failure_reason: 'merchant_request',
      metadata: {},
    },
    canonicalCharge: { id: 'ch_1', payment_intent: 'pi_canonical', amount_refunded: 250 },
    rpcResult: {
      data: [{
        outcome: 'reversed',
        refunded_amount_cents: 250,
        is_full_refund: false,
        points_restored: 10,
        intent_state: null,
      }],
      error: null,
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.equal(state.rpcCalls[0]?.name, 'reverse_stripe_refund_event')
  assert.equal(state.rpcCalls[0]?.input.p_refund_status, 'canceled')
  assert.equal(state.rpcCalls[0]?.input.p_refunded_amount_cents, 250)
  assert.equal((await response.json()).intent_state, null)
})

test('refund reconciliation migration owns duplicate, out-of-order, and report update semantics in one transaction', () => {
  const migrationPath = path.join(
    root,
    'supabase/migrations/20260813050600_reconcile_stripe_refund_events.sql',
  )
  assert.equal(existsSync(migrationPath), true, 'versioned refund reconciliation migration must exist')
  const sql = readFileSync(migrationPath, 'utf8')

  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.stripe_refund_event_ledger/u)
  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.stripe_refund_accounting_state/u)
  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.referral_refund_point_ledger/u)
  assert.match(sql, /event_id text PRIMARY KEY/u)
  assert.match(sql, /CREATE (?:OR REPLACE )?FUNCTION public\.reconcile_stripe_refund_event/u)
  assert.match(sql, /SECURITY DEFINER/u)
  assert.match(sql, /SET search_path = pg_catalog/u)
  assert.doesNotMatch(sql, /SET search_path = pg_catalog, public/u)
  assert.match(sql, /ON CONFLICT \(event_id\) DO NOTHING/u)
  assert.match(sql, /FROM public\.paid_reports[\s\S]+FOR UPDATE/u)
  assert.match(sql, /v_existing_refunded_cents >= p_refunded_amount_cents/u)
  assert.match(sql, /refunded_amount_usd = p_refunded_amount_cents::numeric \/ 100/u)
  assert.match(sql, /UPDATE public\.revenue_log/u)
  assert.match(sql, /INSERT INTO public\.expense_log/u)
  assert.match(sql, /UPDATE public\.user_points/u)
  assert.match(sql, /INSERT INTO public\.point_transactions/u)
  assert.match(sql, /UPDATE public\.referrals/u)
  assert.match(sql, /GET DIAGNOSTICS v_updated_rows = ROW_COUNT/u)
  assert.match(sql, /IF v_updated_rows <> 1/u)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_stripe_refund_event/u)
  assert.doesNotMatch(sql, /client_name|birth_data|customer_note/iu)
})

test('refund migration exposes an append-only terminal reversal ledger and exact-truth RPC', () => {
  const sql = readFileSync(
    path.join(root, 'supabase/migrations/20260813050600_reconcile_stripe_refund_events.sql'),
    'utf8',
  )

  assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?public\.stripe_refund_reversal_ledger/u)
  assert.match(sql, /event_id text PRIMARY KEY/u)
  assert.match(sql, /CHECK \(refund_status IN \('failed', 'canceled'\)\)/u)
  assert.match(sql, /CREATE (?:OR REPLACE )?FUNCTION public\.reverse_stripe_refund_event/u)
  assert.match(sql, /ON CONFLICT \(event_id\) DO NOTHING/u)
  assert.match(sql, /UPDATE public\.paid_reports[\s\S]+refunded_amount_usd = p_refunded_amount_cents::numeric \/ 100/u)
  assert.match(sql, /UPDATE public\.revenue_log[\s\S]+refunded_amount_usd = p_refunded_amount_cents::numeric \/ 100/u)
  assert.match(sql, /UPDATE public\.expense_log[\s\S]+amount_usd = p_refunded_amount_cents::numeric \/ 100/u)
  assert.match(sql, /refund_clawback_reversal/u)
  assert.match(sql, /provider_failed/u)
  assert.match(sql, /provider_canceled/u)
})

test('zero cumulative amount is not acknowledged as a processed refund', async () => {
  const state = makeState({
    canonicalCharge: { id: 'ch_1', payment_intent: 'pi_canonical', amount_refunded: 0 },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 500)
  assert.equal(state.rpcCalls.length, 0)
})

test('multiple partial, out-of-order, and duplicate deliveries preserve the highest cumulative refund', async () => {
  const durable = { refundedCents: 0, events: new Set() }
  const state = makeState({
    rpcHandler(_name, input) {
      if (durable.events.has(input.p_event_id)) {
        return { data: [{ outcome: 'already', refunded_amount_cents: durable.refundedCents, is_full_refund: false, points_clawed_back: 0 }], error: null }
      }
      durable.events.add(input.p_event_id)
      if (durable.refundedCents >= input.p_refunded_amount_cents) {
        return { data: [{ outcome: 'stale', refunded_amount_cents: durable.refundedCents, is_full_refund: false, points_clawed_back: 0 }], error: null }
      }
      durable.refundedCents = input.p_refunded_amount_cents
      return { data: [{ outcome: 'applied', refunded_amount_cents: durable.refundedCents, is_full_refund: false, points_clawed_back: 0 }], error: null }
    },
  })

  const deliveries = [
    { eventId: 'evt_partial_1', refundId: 're_partial_1', cumulative: 250, expected: 'applied' },
    { eventId: 'evt_partial_2', refundId: 're_partial_2', cumulative: 600, expected: 'applied' },
    { eventId: 'evt_out_of_order', refundId: 're_partial_1', cumulative: 600, expected: 'stale' },
    { eventId: 'evt_partial_2', refundId: 're_partial_2', cumulative: 600, expected: 'already' },
  ]

  for (const delivery of deliveries) {
    state.event = {
      id: delivery.eventId,
      type: 'refund.updated',
      data: { object: { id: delivery.refundId, charge: 'ch_1', amount: 1 } },
    }
    state.canonicalCharge = {
      id: 'ch_1',
      payment_intent: 'pi_canonical',
      amount_refunded: delivery.cumulative,
    }
    const response = await dispatch(state)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).refund_outcome, delivery.expected)
  }

  assert.equal(durable.refundedCents, 600)
  assert.deepEqual(
    state.rpcCalls.map((call) => ({
      eventId: call.input.p_event_id,
      refundId: call.input.p_refund_id,
      cumulative: call.input.p_refunded_amount_cents,
    })),
    deliveries.map((delivery) => ({
      eventId: delivery.eventId,
      refundId: delivery.refundId,
      cumulative: delivery.cumulative,
    })),
  )
})

test('an older event redelivered after a later refund accepts its stored result without reapplying', async () => {
  const state = makeState({
    event: {
      id: 'evt_partial_1',
      type: 'refund.created',
      data: { object: { id: 're_partial_1', charge: 'ch_1', reason: 'requested_by_customer' } },
    },
    canonicalCharge: { id: 'ch_1', payment_intent: 'pi_canonical', amount_refunded: 1000 },
    rpcResult: {
      data: [{ outcome: 'already', refunded_amount_cents: 250, is_full_refund: false, points_clawed_back: 0 }],
      error: null,
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    refund_outcome: 'already',
    is_full_refund: false,
    points_clawed_back: 0,
  })
})

test('external full refund acknowledges one atomic reconciliation result including referral clawback', async () => {
  const state = makeState({
    canonicalCharge: { id: 'ch_1', payment_intent: 'pi_canonical', amount_refunded: 1000 },
    rpcResult: {
      data: [{ outcome: 'applied', refunded_amount_cents: 1000, is_full_refund: true, points_clawed_back: 10 }],
      error: null,
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.equal(state.rpcCalls.length, 1)
  assert.deepEqual(await response.json(), {
    received: true,
    refund_outcome: 'applied',
    is_full_refund: true,
    points_clawed_back: 10,
  })
})

test('partial refund fails closed if the database claims referral points were clawed back', async () => {
  const state = makeState({
    rpcResult: {
      data: [{ outcome: 'applied', refunded_amount_cents: 600, is_full_refund: false, points_clawed_back: 10 }],
      error: null,
    },
  })

  const response = await dispatch(state)

  assert.equal(response.status, 500)
  assert.equal(state.rpcCalls.length, 1)
})

test('Stripe and database failures remain retryable and do not echo provider errors or customer data', async (t) => {
  const privateMarker = 'stripe_private_marker_customer@example.test'
  const cases = [
    {
      name: 'charge retrieval failure',
      overrides: { chargeError: new Error(privateMarker) },
    },
    {
      name: 'canonical charge id mismatch',
      overrides: { canonicalCharge: { id: 'ch_wrong', payment_intent: 'pi_canonical', amount_refunded: 600 } },
    },
    {
      name: 'canonical payment intent missing',
      overrides: { canonicalCharge: { id: 'ch_1', payment_intent: null, amount_refunded: 600 } },
    },
    {
      name: 'checkout-session Stripe lookup failure',
      overrides: { sessionError: new Error(privateMarker) },
    },
    {
      name: 'checkout session absent',
      overrides: { sessions: [] },
    },
    {
      name: 'Supabase report lookup failure surfaced by RPC',
      overrides: { rpcResult: { data: null, error: { message: privateMarker, code: 'P0001' } } },
    },
    {
      name: 'Supabase report update failure surfaced by RPC',
      overrides: { rpcResult: { data: null, error: { message: privateMarker, code: 'P0001' } } },
    },
    {
      name: 'Supabase event-ledger failure surfaced by RPC',
      overrides: { rpcResult: { data: null, error: { message: privateMarker, code: '23505' } } },
    },
    {
      name: 'unknown RPC outcome',
      overrides: { rpcResult: { data: [{ outcome: 'unknown' }], error: null } },
    },
  ]

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const state = makeState(scenario.overrides)
      const captured = []
      const originalConsoleError = console.error
      console.error = (...args) => captured.push(args)
      let response
      try {
        response = await dispatch(state)
      } finally {
        console.error = originalConsoleError
      }

      assert.equal(response.status, 500)
      const responseText = await response.text()
      const observables = JSON.stringify({ responseText, captured, notifications: state.notifications })
      assert.doesNotMatch(observables, /stripe_private_marker|customer@example|private_customer/iu)
      assert.equal(state.notifications.length, 0)
    })
  }
})

test('missing event/refund identity fails before lookup while a missing event charge is replaced only by fresh Refund truth', async () => {
  for (const { event, expectedStripeCalls } of [
    {
      event: { id: '', type: 'charge.refunded', data: { object: { id: 'ch_1' } } },
      expectedStripeCalls: [],
    },
    {
      event: { id: 'evt_missing_charge', type: 'refund.created', data: { object: { id: 're_1', charge: null } } },
      expectedStripeCalls: [{ name: 'refunds.retrieve', refundId: 're_1' }],
    },
    {
      event: { id: 'evt_missing_refund', type: 'refund.updated', data: { object: { charge: 'ch_1' } } },
      expectedStripeCalls: [],
    },
  ]) {
    const state = makeState({ event })
    const response = await dispatch(state)
    assert.equal(response.status, 500)
    assert.deepEqual(state.stripeCalls, expectedStripeCalls)
    assert.equal(state.rpcCalls.length, 0)
  }
})
