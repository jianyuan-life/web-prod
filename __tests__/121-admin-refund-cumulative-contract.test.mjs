import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const refundUiSource = readFileSync(path.join(root, 'app/jamie/refunds/page.tsx'), 'utf8')
const refundListSource = readFileSync(path.join(root, 'app/api/admin/refunds/route.ts'), 'utf8')

const virtualModules = new Map([
  ['stripe', dataModule(`
    export default class Stripe {
      constructor() {
        const state = globalThis.__adminRefundState
        this.checkout = { sessions: {
          async retrieve(sessionId) {
            state.stripeCalls.push({ name: 'checkout.sessions.retrieve', sessionId })
            if (state.sessionError) throw state.sessionError
            return state.session
          },
        } }
        this.refunds = {
          async create(params, options) {
            state.stripeCalls.push({ name: 'refunds.create', params, options })
            if (state.refundError) throw state.refundError
            state.refund.metadata = params.metadata || {}
            return state.refund
          },
          async retrieve(refundId) {
            state.stripeCalls.push({ name: 'refunds.retrieve', refundId })
            if (state.refundRetrieveError) throw state.refundRetrieveError
            return state.refund
          },
          async list(params) {
            state.stripeCalls.push({ name: 'refunds.list', params })
            if (state.refundListError) throw state.refundListError
            const pageIndex = state.refundListPageIndex || 0
            const page = state.refundListPages?.[pageIndex]
            if (page) {
              state.refundListPageIndex = pageIndex + 1
              return page
            }
            return { data: state.refundList, has_more: false }
          },
        }
        this.charges = {
          async retrieve(chargeId) {
            state.stripeCalls.push({ name: 'charges.retrieve', chargeId })
            if (state.chargeError) throw state.chargeError
            return state.charge
          },
        }
      }
    }
  `)],
  ['@/lib/admin-auth', dataModule('export function checkAdminAuth(){return null}')],
  ['@/lib/admin-rate-limit', dataModule('export function checkAdminRateLimit(){return null}')],
  ['@/lib/admin-audit-log', dataModule(`
    export async function writeAuditLog(...args) {
      globalThis.__adminRefundState.auditCalls.push(args)
    }
  `)],
  ['@/lib/accounting', dataModule(`
    export async function recordExpense(input) {
      globalThis.__adminRefundState.expenseCalls.push(input)
    }
  `)],
  ['@/lib/security/operational-telemetry', dataModule(`
    export function operationalErrorClass(){return 'ExternalError'}
    export function operationalFingerprint(){
      return globalThis.__adminRefundState?.fingerprintUnavailable ? 'unavailable' : 'fp:synthetic'
    }
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient(){
      const state = globalThis.__adminRefundState
      if (state.supabaseInitError) throw state.supabaseInitError
      return state.supabase
    }
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
    return nextResolve(specifier, context)
  },
})

process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'

const { POST } = await import(pathToFileURL(path.join(root, 'app/api/admin/refund/route.ts')).href)

class Query {
  constructor(state, table) {
    this.state = state
    this.table = table
    this.action = 'select'
    this.payload = null
  }
  select() { return this }
  eq() { return this }
  is() { return this }
  contains() { return this }
  update(payload) { this.action = 'update'; this.payload = payload; return this }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this }
  async single() { return this.execute('single') }
  async maybeSingle() { return this.execute('maybeSingle') }
  then(resolve, reject) { return this.execute('many').then(resolve, reject) }
  async execute() {
    if (this.state.dbFailureTable === this.table) {
      return { data: null, error: { code: 'P0001', message: this.state.privateMarker } }
    }
    if (this.table === 'paid_reports') {
      if (this.action === 'update') {
        this.state.directPaidReportUpdates.push(this.payload)
        Object.assign(this.state.report, this.payload)
        return { data: this.state.report, error: null }
      }
      return { data: this.state.report, error: null }
    }
    if (this.table === 'revenue_log') {
      if (this.action === 'update') {
        this.state.revenueUpdates.push(this.payload)
        Object.assign(this.state.revenueRow, this.payload)
        return { data: this.state.revenueRow, error: null }
      }
      return { data: this.state.revenueRow, error: null }
    }
    if (this.table === 'expense_log') {
      if (this.action === 'insert') {
        this.state.dbWrites.push({ table: this.table, payload: this.payload })
        this.state.expenseRow = { id: 'expense-1', amount_usd: this.payload.amount_usd }
        return { data: this.state.expenseRow, error: null }
      }
      return { data: this.state.expenseRow, error: null }
    }
    if (this.table === 'admin_audit_log') {
      if (this.action === 'insert') {
        this.state.dbWrites.push({ table: this.table, payload: this.payload })
        this.state.auditRow = { id: 'audit-1' }
        return { data: this.state.auditRow, error: null }
      }
      return { data: this.state.auditRow, error: null }
    }
    if (this.action === 'insert' || this.action === 'update') {
      this.state.dbWrites.push({ table: this.table, payload: this.payload })
    }
    return { data: null, error: null }
  }
}

function makeState(overrides = {}) {
  const state = {
    privateMarker: 'private-provider-customer@example.test',
    report: {
      id: '11111111-1111-4111-8111-111111111111',
      stripe_session_id: 'cs_admin_1',
      amount_usd: 10,
      status: 'completed',
      customer_email: null,
      refunded_at: null,
      refunded_amount_usd: 0,
    },
    session: { id: 'cs_admin_1', payment_intent: 'pi_admin_1' },
    refund: {
      id: 're_partial_1',
      amount: 250,
      charge: 'ch_admin_1',
      payment_intent: 'pi_admin_1',
      reason: 'requested_by_customer',
      status: 'succeeded',
    },
    charge: { id: 'ch_admin_1', payment_intent: 'pi_admin_1', amount_refunded: 250 },
    sessionError: null,
    refundError: null,
    chargeError: null,
    dbFailureTable: null,
    supabaseInitError: null,
    stripeCalls: [],
    rpcCalls: [],
    reconciliationResult: null,
    refundIntent: null,
    refundIntents: new Map(),
    refundList: [],
    refundListPages: null,
    refundListPageIndex: 0,
    refundListError: null,
    bindIntentErrorOnce: false,
    reserveIntentResponseLossOnce: false,
    authListCalls: 0,
    directPaidReportUpdates: [],
    revenueUpdates: [],
    revenueRow: { id: 'revenue-1', refunded_amount_usd: 0 },
    expenseRow: null,
    auditRow: null,
    dbWrites: [],
    expenseCalls: [],
    auditCalls: [],
    requestId: 'refund-request-1',
    fingerprintUnavailable: false,
    ...overrides,
  }
  state.supabase = {
    from(table) { return new Query(state, table) },
    auth: { admin: { async listUsers() {
      state.authListCalls += 1
      if (state.authListError) {
        return { data: null, error: { code: 'provider_error', message: state.privateMarker } }
      }
      return { data: { users: [] }, error: null }
    } } },
    async rpc(name, input) {
      state.rpcCalls.push({ name, input })
      if (name === 'reserve_admin_refund_intent') {
        const existing = state.refundIntents.get(input.p_request_id)
        if (existing) {
          state.refundIntent = existing
          if (
            existing.payload_sha256 !== input.p_payload_sha256
            || existing.requested_amount_cents !== input.p_requested_amount_cents
            || existing.reason !== input.p_reason
          ) {
            return { data: null, error: { code: 'P0001', message: 'synthetic intent conflict' } }
          }
          return { data: [{ outcome: 'existing', ...existing }], error: null }
        }
        const remainingCents = Math.round(
          (state.report.amount_usd - Number(state.report.refunded_amount_usd || 0)) * 100,
        )
        const active = [...state.refundIntents.values()]
          .find(intent => ['reserved', 'provider_pending', 'provider_applied'].includes(intent.state))
        if (active || input.p_requested_amount_cents > remainingCents) {
          return { data: null, error: { code: 'P0001', message: 'synthetic intent preflight hold' } }
        }
        state.refundIntent = {
          request_id: input.p_request_id,
          payload_sha256: input.p_payload_sha256,
          requested_amount_cents: input.p_requested_amount_cents,
          reason: input.p_reason,
          state: 'reserved',
          stripe_refund_id: null,
          stripe_charge_id: null,
        }
        state.refundIntents.set(input.p_request_id, state.refundIntent)
        if (state.reserveIntentResponseLossOnce) {
          state.reserveIntentResponseLossOnce = false
          return { data: null, error: { code: 'NETWORK', message: state.privateMarker } }
        }
        return { data: [{ outcome: 'created', ...state.refundIntent }], error: null }
      }
      if (name === 'start_admin_refund_provider_attempt') {
        state.refundIntent = state.refundIntents.get(input.p_request_id)
        if (!state.refundIntent || state.refundIntent.payload_sha256 !== input.p_payload_sha256) {
          return { data: null, error: { code: 'P0001', message: 'synthetic start conflict' } }
        }
        let outcome = 'existing'
        if (state.refundIntent.state === 'reserved') {
          state.refundIntent.state = 'provider_pending'
          state.refundIntent.provider_attempted_at = new Date().toISOString()
          outcome = 'started'
        }
        return { data: [{ outcome, ...state.refundIntent }], error: null }
      }
      if (name === 'bind_admin_refund_intent_provider_result') {
        if (state.bindIntentErrorOnce) {
          state.bindIntentErrorOnce = false
          return { data: null, error: { code: 'P0001', message: state.privateMarker } }
        }
        state.refundIntent = state.refundIntents.get(input.p_request_id)
        if (state.refundIntent.state === 'provider_pending') {
          Object.assign(state.refundIntent, {
            state: 'provider_applied',
            stripe_refund_id: input.p_refund_id,
            stripe_charge_id: input.p_charge_id,
          })
        }
        return { data: [{ ...state.refundIntent }], error: null }
      }
      if (name === 'complete_admin_refund_intent') {
        state.refundIntent = state.refundIntents.get(input.p_request_id)
        Object.assign(state.refundIntent, { state: 'reconciled' })
        return { data: [{ ...state.refundIntent }], error: null }
      }
      if (name === 'reverse_stripe_refund_event') {
        state.refundIntent = state.refundIntents.get(input.p_admin_request_id)
        const terminalState = input.p_refund_status === 'failed'
          ? 'provider_failed'
          : 'provider_canceled'
        Object.assign(state.refundIntent, { state: terminalState })
        state.report.refunded_amount_usd = input.p_refunded_amount_cents / 100
        return {
          data: [{
            outcome: 'reversed',
            refunded_amount_cents: input.p_refunded_amount_cents,
            is_full_refund: false,
            points_restored: 0,
            intent_state: terminalState,
          }],
          error: null,
        }
      }
      if (state.rpcError) return { data: null, error: { code: 'P0001', message: state.privateMarker } }
      state.report.refunded_amount_usd = input.p_refunded_amount_cents / 100
      state.report.refunded_at = '2026-08-14T00:00:00.000Z'
      if (input.p_refunded_amount_cents >= Math.round(state.report.amount_usd * 100)) {
        state.report.status = 'refunded'
      }
      state.report.stripe_refund_id = input.p_refund_id
      return {
        data: [state.reconciliationResult || {
          outcome: 'applied',
          refunded_amount_cents: input.p_refunded_amount_cents,
          is_full_refund: state.report.status === 'refunded',
          points_clawed_back: state.report.status === 'refunded' ? 10 : 0,
        }],
        error: null,
      }
    },
  }
  return state
}

async function dispatch(state, body = {}) {
  globalThis.__adminRefundState = state
  return POST(new Request('https://jianyuan.life/api/admin/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': 'synthetic-admin-key' },
    body: JSON.stringify({
      reportId: state.report.id,
      amount: 2.5,
      reason: 'requested_by_customer',
      request_id: state.requestId,
      ...body,
    }),
  }))
}

function rpcCall(state, name) {
  return state.rpcCalls.find(call => call.name === name)
}

test('partial admin refund uses Charge.amount_refunded cumulative truth and preserves completed status', async () => {
  const state = makeState()
  const response = await dispatch(state)

  assert.equal(response.status, 200)
  assert.deepEqual(state.stripeCalls.map(call => call.name), [
    'checkout.sessions.retrieve',
    'refunds.create',
    'charges.retrieve',
  ])
  const createCall = state.stripeCalls[1]
  assert.equal(createCall.params.payment_intent, 'pi_admin_1')
  assert.equal(createCall.params.amount, 250)
  assert.equal(createCall.params.reason, 'requested_by_customer')
  assert.equal(createCall.params.metadata.jianyuan_refund_request_id, 'refund-request-1')
  assert.match(createCall.params.metadata.jianyuan_refund_payload_sha256, /^[0-9a-f]{64}$/u)
  assert.equal(createCall.options.idempotencyKey,
    'admin-refund:11111111-1111-4111-8111-111111111111:refund-request-1')
  assert.equal(state.directPaidReportUpdates.length, 0)
  assert.deepEqual(state.rpcCalls.map(call => call.name), [
    'reserve_admin_refund_intent',
    'start_admin_refund_provider_attempt',
    'bind_admin_refund_intent_provider_result',
    'reconcile_stripe_refund_event',
    'complete_admin_refund_intent',
  ])
  assert.deepEqual(rpcCall(state, 'reconcile_stripe_refund_event').input, {
    p_event_id: 'admin_refund:11111111-1111-4111-8111-111111111111:refund-request-1',
    p_event_type: 'refund.created',
    p_stripe_session_id: 'cs_admin_1',
    p_charge_id: 'ch_admin_1',
    p_payment_intent_id: 'pi_admin_1',
    p_refund_id: 're_partial_1',
    p_refunded_amount_cents: 250,
    p_reason: 'requested_by_customer',
  })
  assert.equal(state.report.status, 'completed')
  assert.equal(state.report.refunded_amount_usd, 2.5)
  const responseBody = await response.json()
  assert.equal(responseBody.refunded_amount_usd, 2.5)
  assert.equal(responseBody.cumulative_refunded_amount_usd, 2.5)
  assert.equal(responseBody.is_full_refund, false)
})

test('a second partial refund remains allowed and stores the new Stripe cumulative amount', async () => {
  const state = makeState()
  Object.assign(state.report, {
    refunded_at: '2026-08-13T00:00:00.000Z',
    refunded_amount_usd: 2.5,
    stripe_refund_id: 're_partial_1',
  })
  state.refund = { ...state.refund, id: 're_partial_2' }
  state.charge = { ...state.charge, amount_refunded: 500 }

  const response = await dispatch(state, { request_id: 'partial-refund-2' })

  assert.equal(response.status, 200)
  assert.equal(state.stripeCalls[1].options.idempotencyKey,
    'admin-refund:11111111-1111-4111-8111-111111111111:partial-refund-2')
  assert.equal(rpcCall(state, 'reconcile_stripe_refund_event').input.p_refunded_amount_cents, 500)
  assert.equal(rpcCall(state, 'reconcile_stripe_refund_event').input.p_refund_id, 're_partial_2')
  assert.equal(state.report.refunded_amount_usd, 5)
  assert.equal(state.report.status, 'completed')
  assert.equal((await response.json()).cumulative_refunded_amount_usd, 5)
})

test('two intentional same-amount partial refunds use distinct caller request identities', async () => {
  const state = makeState()

  const first = await dispatch(state, { request_id: 'same-amount-request-1' })
  assert.equal(first.status, 200)

  state.refund = { ...state.refund, id: 're_partial_2' }
  state.charge = { ...state.charge, amount_refunded: 500 }
  state.auditRow = null
  const second = await dispatch(state, { request_id: 'same-amount-request-2' })

  assert.equal(second.status, 200)
  assert.deepEqual(
    state.stripeCalls
      .filter((call) => call.name === 'refunds.create')
      .map((call) => call.options.idempotencyKey),
    [
      'admin-refund:11111111-1111-4111-8111-111111111111:same-amount-request-1',
      'admin-refund:11111111-1111-4111-8111-111111111111:same-amount-request-2',
    ],
  )
  assert.equal(state.report.refunded_amount_usd, 5)
})

test('admin UI keeps one request identity for ambiguous retries and permits later partial refunds', () => {
  assert.match(refundUiSource, /request_id:\s*refundRequestId/u)
  assert.match(refundUiSource, /crypto\.randomUUID\(\)/u)
  assert.match(refundUiSource, /sessionStorage\.setItem\(REFUND_INTENT_STORAGE_KEY/iu)
  assert.match(refundUiSource, /pending\?\.requestId\s*\|\|\s*crypto\.randomUUID\(\)/u)
  assert.match(refundUiSource, /setRefundAmount\(pending\?\.amount\s*\|\|\s*String\(remainingAmount\)\)/u)
  assert.match(refundUiSource, /amount:\s*Number\(refundAmount\)/u)
  assert.match(refundUiSource, /clearPendingRefundIntent\(refundTarget\.id\)[\s\S]{0,300}?if\s*\(res\.ok\)|if\s*\(res\.ok\)[\s\S]{0,300}?clearPendingRefundIntent\(refundTarget\.id\)/u)
  assert.match(refundUiSource, /disabled=\{refundAttempted\}/u)
  const persistIndex = refundUiSource.indexOf('const persisted = writePendingRefundIntent')
  const requestIndex = refundUiSource.indexOf("adminFetch('/api/admin/refund'", persistIndex)
  assert.ok(persistIndex >= 0 && requestIndex > persistIndex)
  assert.match(refundUiSource.slice(persistIndex, requestIndex), /if\s*\(!persisted\)[\s\S]*?return/u)
  assert.match(refundUiSource, /if\s*\(res\.status\s*<\s*500\)[\s\S]{0,300}?setRefundAttempted\(false\)/u)
  assert.match(refundUiSource, /setRefundError\(data\.error\s*\|\|\s*data\.detail\s*\|\|\s*'退款失敗'\)/u)
  assert.match(refundUiSource, /已使用的推薦積分[\s\S]{0,80}?人工清算[\s\S]{0,80}?未回收點數/u)
  assert.match(refundUiSource, /isFullyRefunded[\s\S]{0,1200}?openRefund\(r\)/u)
  assert.match(refundUiSource, /!isFullyRefunded\s*\|\|\s*hasPendingRetry[\s\S]{0,300}?重試對帳/u)
  assert.match(refundListSource, /Math\.round\(Number\(row\.refunded_amount_usd\s*\|\|\s*0\)\s*\*\s*100\)[\s\S]{0,80}?>=\s*Math\.round\(Number\(row\.amount_usd\s*\|\|\s*0\)\s*\*\s*100\)/u)
  assert.match(refundListSource, /status\s*===\s*'candidate'[\s\S]{0,240}?!isFullyRefunded\(row\)/u)
  assert.doesNotMatch(refundListSource, /query\s*=\s*query\.is\('refunded_at',\s*null\)/u)
})

test('a response-loss retry reuses the same Stripe refund instead of creating another partial refund', async () => {
  const state = makeState()
  state.charge = { ...state.charge, amount_refunded: 250 }
  state.dbFailureTable = 'admin_audit_log'

  const first = await dispatch(state)
  assert.equal(first.status, 500)
  assert.equal(state.report.refunded_amount_usd, 2.5)
  assert.equal(state.report.stripe_refund_id, 're_partial_1')

  state.dbFailureTable = null
  state.reconciliationResult = {
    outcome: 'already',
    refunded_amount_cents: 250,
    is_full_refund: false,
    points_clawed_back: 0,
  }
  const second = await dispatch(state)

  assert.equal(second.status, 200)
  const createCalls = state.stripeCalls.filter((call) => call.name === 'refunds.create')
  assert.equal(createCalls.length, 1)
  assert.equal(state.stripeCalls.filter((call) => call.name === 'refunds.retrieve').length, 1)
  const reconciliationCalls = state.rpcCalls.filter(call => call.name === 'reconcile_stripe_refund_event')
  assert.equal(reconciliationCalls.length, 2)
  assert.equal(reconciliationCalls[1].input.p_event_id,
    'admin_refund:11111111-1111-4111-8111-111111111111:refund-request-1')
  assert.equal(state.report.refunded_amount_usd, 2.5)
  assert.equal(state.report.status, 'completed')
})

test('a durable pending intent inside 24 hours recovers by the same idempotent create without list scanning', async () => {
  const state = makeState({ bindIntentErrorOnce: true })
  state.refundList = [state.refund]

  const first = await dispatch(state)
  assert.equal(first.status, 500)
  assert.equal(state.refundIntent?.state, 'provider_pending')

  // Stripe retains v1 idempotency keys for at least 24 hours, so a network-loss
  // retry repeats the exact POST and key instead of guessing from one list page.
  const second = await dispatch(state)
  assert.equal(second.status, 200)
  assert.equal(state.refundIntent?.state, 'reconciled')
  assert.equal(state.stripeCalls.filter((call) => call.name === 'refunds.create').length, 2)
  assert.equal(state.stripeCalls.filter((call) => call.name === 'refunds.list').length, 0)
  assert.deepEqual(
    state.rpcCalls.map((call) => call.name),
    [
      'reserve_admin_refund_intent',
      'start_admin_refund_provider_attempt',
      'bind_admin_refund_intent_provider_result',
      'reserve_admin_refund_intent',
      'start_admin_refund_provider_attempt',
      'bind_admin_refund_intent_provider_result',
      'reconcile_stripe_refund_event',
      'complete_admin_refund_intent',
    ],
  )
})

test('a pending durable intent inside 24 hours safely repeats the identical Stripe create key', async () => {
  const state = makeState({ bindIntentErrorOnce: true })

  const first = await dispatch(state)
  assert.equal(first.status, 500)
  assert.equal(state.refundIntent?.state, 'provider_pending')

  const retry = await dispatch(state)
  assert.equal(retry.status, 200)
  const createCalls = state.stripeCalls.filter(call => call.name === 'refunds.create')
  assert.equal(createCalls.length, 2)
  assert.deepEqual(createCalls[1], createCalls[0])
  assert.equal(state.stripeCalls.filter(call => call.name === 'refunds.list').length, 0)
})

test('a pending intent after 24 hours exhausts every Stripe page and HOLDs on zero matches without create', async () => {
  const state = makeState({ bindIntentErrorOnce: true })
  const first = await dispatch(state)
  assert.equal(first.status, 500)
  state.refundIntent.provider_attempted_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  state.refundListPages = [
    { data: Array.from({ length: 100 }, (_, index) => ({ id: `re_other_${index}`, metadata: {} })), has_more: true },
    { data: [{ id: 're_other_final', metadata: {} }], has_more: false },
  ]

  const retry = await dispatch(state)

  assert.equal(retry.status, 503)
  const body = await retry.json()
  assert.equal(body.reconciliation_pending, true)
  assert.equal(body.manual_hold, true)
  assert.equal(state.stripeCalls.filter(call => call.name === 'refunds.create').length, 1)
  const listCalls = state.stripeCalls.filter(call => call.name === 'refunds.list')
  assert.equal(listCalls.length, 2)
  assert.equal(listCalls[0].params.starting_after, undefined)
  assert.equal(listCalls[1].params.starting_after, 're_other_99')
})

test('a reserve-RPC response loss preserves the request identity and creates at most once on retry', async () => {
  const state = makeState({ reserveIntentResponseLossOnce: true })

  const first = await dispatch(state)
  assert.equal(first.status, 503)
  assert.equal((await first.json()).reconciliation_pending, true)
  assert.equal(state.stripeCalls.filter(call => call.name === 'refunds.create').length, 0)

  const retry = await dispatch(state)
  assert.equal(retry.status, 200)
  // The database still held the intent in `reserved`, proving Stripe was never
  // attempted. One CAS may therefore start exactly one provider operation.
  assert.equal(state.stripeCalls.filter(call => call.name === 'refunds.create').length, 1)
})

test('a provider-pending Stripe refund is bound for recovery but not booked as completed', async () => {
  const state = makeState()
  state.refund.status = 'pending'

  const response = await dispatch(state)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).reconciliation_pending, true)
  assert.equal(state.refundIntent?.state, 'provider_applied')
  assert.equal(state.stripeCalls.filter(call => call.name === 'charges.retrieve').length, 0)
  assert.equal(state.rpcCalls.filter(call => call.name === 'reconcile_stripe_refund_event').length, 0)
})

for (const terminalStatus of ['failed', 'canceled']) {
  test(`a provider-${terminalStatus} Stripe refund is terminalized from fresh Charge truth`, async () => {
    const state = makeState()
    state.refund.status = terminalStatus
    state.refund.failure_reason = terminalStatus === 'failed' ? 'declined' : undefined
    state.charge.amount_refunded = 0

    const response = await dispatch(state)
    assert.equal(response.status, 409)
    const body = await response.json()
    assert.equal(body.refund_terminal, true)
    assert.equal(body.terminal_state, `provider_${terminalStatus}`)
    assert.equal(state.refundIntent?.state, `provider_${terminalStatus}`)
    assert.equal(state.stripeCalls.filter(call => call.name === 'charges.retrieve').length, 1)
    assert.equal(state.rpcCalls.filter(call => call.name === 'reconcile_stripe_refund_event').length, 0)
    const reversal = rpcCall(state, 'reverse_stripe_refund_event')
    assert.deepEqual({ ...reversal.input, p_admin_payload_sha256: '<hash>' }, {
      p_event_id: `admin_refund_terminal:11111111-1111-4111-8111-111111111111:refund-request-1:re_partial_1:${terminalStatus}`,
      p_event_type: terminalStatus === 'failed' ? 'refund.failed' : 'refund.updated',
      p_stripe_session_id: 'cs_admin_1',
      p_charge_id: 'ch_admin_1',
      p_payment_intent_id: 'pi_admin_1',
      p_refund_id: 're_partial_1',
      p_refund_status: terminalStatus,
      p_refund_amount_cents: 250,
      p_refunded_amount_cents: 0,
      p_failure_reason: terminalStatus === 'failed' ? 'declined' : 'canceled',
      p_admin_request_id: 'refund-request-1',
      p_admin_payload_sha256: '<hash>',
    })
    assert.match(reversal.input.p_admin_payload_sha256, /^[0-9a-f]{64}$/u)
  })
}

test('the same durable request identity rejects changed amount or reason without Stripe mutation', async () => {
  const state = makeState()
  const first = await dispatch(state)
  assert.equal(first.status, 200)

  const changed = await dispatch(state, { amount: 3 })
  assert.equal(changed.status, 409)
  assert.equal(state.stripeCalls.filter(call => call.name === 'refunds.create').length, 1)
})

test('only a canonical full cumulative refund moves the report to refunded', async () => {
  const state = makeState()
  Object.assign(state.report, {
    refunded_at: '2026-08-13T00:00:00.000Z',
    refunded_amount_usd: 5,
    stripe_refund_id: 're_partial_2',
  })
  state.refund = { ...state.refund, id: 're_full', amount: 500 }
  state.charge = { ...state.charge, amount_refunded: 1000 }

  const response = await dispatch(state, { amount: 5 })

  assert.equal(response.status, 200)
  assert.equal(rpcCall(state, 'reconcile_stripe_refund_event').input.p_refunded_amount_cents, 1000)
  assert.equal(state.report.refunded_amount_usd, 10)
  assert.equal(state.report.status, 'refunded')
  assert.equal(state.rpcCalls.length, 5)
  const responseBody = await response.json()
  assert.equal(responseBody.refunded_amount_usd, 5)
  assert.equal(responseBody.cumulative_refunded_amount_usd, 10)
  assert.equal(responseBody.is_full_refund, true)
  assert.equal(responseBody.points_clawed_back, 10)
})

test('Stripe, core database, and canonical-state failures return retryable generic errors', async (t) => {
  const scenarios = [
    { name: 'database client initialization', mutate: (state) => { state.supabaseInitError = new Error(state.privateMarker) } },
    { name: 'audit fingerprint readiness', mutate: (state) => { state.fingerprintUnavailable = true } },
    { name: 'report lookup', mutate: (state) => { state.dbFailureTable = 'paid_reports' } },
    { name: 'checkout session provider', mutate: (state) => { state.sessionError = new Error(state.privateMarker) } },
    { name: 'refund provider', mutate: (state) => { state.refundError = new Error(state.privateMarker) } },
    { name: 'charge provider', mutate: (state) => { state.chargeError = new Error(state.privateMarker) } },
    { name: 'audit ledger database', mutate: (state) => { state.dbFailureTable = 'admin_audit_log' } },
    { name: 'atomic refund accounting RPC', mutate: (state) => { state.rpcError = true } },
    { name: 'charge identity mismatch', mutate: (state) => { state.charge = { ...state.charge, id: 'ch_wrong' } } },
    { name: 'charge payment intent mismatch', mutate: (state) => { state.charge = { ...state.charge, payment_intent: 'pi_wrong' } } },
    { name: 'non-increasing cumulative amount', mutate: (state) => {
      state.report.refunded_amount_usd = 2.5
      state.charge = { ...state.charge, amount_refunded: 250 }
    } },
  ]

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const state = makeState()
      scenario.mutate(state)
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
      const observables = JSON.stringify({ body: await response.text(), captured })
      assert.doesNotMatch(observables, /private-provider|customer@example|privateMarker/iu)
    })
  }
})

test('full-refund referral identity is resolved inside the atomic RPC without auth directory scans', async () => {
  const state = makeState({
    dbFailureTable: 'auth_users_view',
    authListError: true,
  })
  state.report.customer_email = 'private-customer@example.test'
  state.refund = { ...state.refund, id: 're_full', amount: 1000 }
  state.charge = { ...state.charge, amount_refunded: 1000 }

  const captured = []
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  console.error = (...args) => captured.push(args)
  console.warn = (...args) => captured.push(args)
  let response
  try {
    response = await dispatch(state, { amount: 10 })
  } finally {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  }

  assert.equal(response.status, 200)
  assert.equal(state.authListCalls, 0)
  assert.equal(state.rpcCalls.length, 5)
  const observables = JSON.stringify({ body: await response.text(), captured })
  assert.doesNotMatch(observables, /private-customer|customer@example|private-provider/iu)
})

test('unified refund RPC failure blocks success and remains retryable', async () => {
  const state = makeState({ rpcError: true })
  state.refund = { ...state.refund, id: 're_full', amount: 1000 }
  state.charge = { ...state.charge, amount_refunded: 1000 }

  const captured = []
  const originalConsoleError = console.error
  console.error = (...args) => captured.push(args)
  let response
  try {
    response = await dispatch(state, { amount: 10 })
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(response.status, 500)
  assert.equal(state.rpcCalls.length, 4)
  const observables = JSON.stringify({ body: await response.text(), captured })
  assert.doesNotMatch(observables, /private-provider|customer@example/iu)
})

test('an idempotent full-refund point replay reports zero newly clawed points', async () => {
  const state = makeState({
    reconciliationResult: {
      outcome: 'already',
      refunded_amount_cents: 1000,
      is_full_refund: true,
      points_clawed_back: 0,
    },
  })
  state.refund = { ...state.refund, id: 're_full', amount: 1000 }
  state.charge = { ...state.charge, amount_refunded: 1000 }

  const response = await dispatch(state, { amount: 10 })

  assert.equal(response.status, 200)
  assert.equal(state.rpcCalls.length, 5)
  assert.equal((await response.json()).points_clawed_back, 0)
})

test('a full-refund audit response loss retries by retrieving the existing refund, not creating another', async () => {
  const state = makeState()
  state.refund = { ...state.refund, id: 're_full', amount: 1000 }
  state.charge = { ...state.charge, amount_refunded: 1000 }
  state.dbFailureTable = 'admin_audit_log'

  const first = await dispatch(state, { amount: 10 })
  assert.equal(first.status, 500)
  assert.equal(state.report.status, 'refunded')
  assert.equal(state.report.stripe_refund_id, 're_full')

  state.dbFailureTable = null
  state.auditRow = null
  state.reconciliationResult = {
    outcome: 'already',
    refunded_amount_cents: 1000,
    is_full_refund: true,
    points_clawed_back: 10,
  }
  const second = await dispatch(state, { amount: 10 })

  assert.equal(second.status, 200)
  assert.equal(state.stripeCalls.filter((call) => call.name === 'refunds.create').length, 1)
  assert.equal(state.stripeCalls.filter((call) => call.name === 'refunds.retrieve').length, 1)
  assert.equal(state.rpcCalls.length, 10)
  assert.equal((await second.json()).points_clawed_back, 10)
})

test('invalid or fully exhausted refund requests stop before Stripe mutation', async () => {
  const cases = [
    { amount: 0 },
    { amount: -1 },
    { amount: 11 },
    { amount: 1.001 },
    { request_id: 'bad' },
    { request_id: undefined },
    { reason: 'private-customer@example.test' },
  ]
  for (const body of cases) {
    const state = makeState()
    const response = await dispatch(state, body)
    assert.equal(response.status, 400)
    assert.equal(state.stripeCalls.length, 0)
  }

  const fullyRefunded = makeState()
  fullyRefunded.report.refunded_amount_usd = 10
  fullyRefunded.report.refunded_at = '2026-08-14T00:00:00.000Z'
  const exhaustedResponse = await dispatch(fullyRefunded)
  assert.equal(exhaustedResponse.status, 409)
  assert.equal(fullyRefunded.stripeCalls.filter(call => call.name === 'refunds.create').length, 0)
})

test('report session authority cannot be bypassed by a caller-supplied payment intent', async () => {
  const mismatch = makeState()
  const mismatchResponse = await dispatch(mismatch, { payment_intent_id: 'pi_attacker' })
  assert.equal(mismatchResponse.status, 409)
  assert.deepEqual(mismatch.stripeCalls, [
    { name: 'checkout.sessions.retrieve', sessionId: 'cs_admin_1' },
  ])

  const missingSession = makeState()
  missingSession.report.stripe_session_id = null
  const missingResponse = await dispatch(missingSession, { payment_intent_id: 'pi_admin_1' })
  assert.equal(missingResponse.status, 500)
  assert.equal(missingSession.stripeCalls.length, 0)
})

test('customer identity is absent from refund accounting, audit, response, and logs', async () => {
  const state = makeState()
  state.report.customer_email = 'private-customer@example.test'
  const captured = []
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  console.error = (...args) => captured.push(args)
  console.warn = (...args) => captured.push(args)
  let response
  try {
    response = await dispatch(state)
  } finally {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  }

  assert.equal(response.status, 200)
  const observables = JSON.stringify({
    response: await response.json(),
    expenseCalls: state.expenseCalls,
    auditCalls: state.auditCalls,
    dbWrites: state.dbWrites,
    captured,
  })
  assert.doesNotMatch(observables, /private-customer|customer@example|pi_admin_1/iu)
})
