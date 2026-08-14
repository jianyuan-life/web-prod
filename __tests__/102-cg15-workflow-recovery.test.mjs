import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const webhookState = {
  event: null,
  existingReport: null,
  report: null,
  updates: [],
  throwOnUpdatePayloadKey: null,
  checkoutPointsStatus: 'already',
  rpcCalls: [],
  draftError: null,
  insertCount: 0,
  g15Selection: null,
  g15Receipts: [],
}
globalThis.__cg15WebhookState = webhookState

class WebhookQuery {
  constructor(table) {
    this.table = table
    this.operation = 'select'
    this.payload = null
    this.filters = []
  }

  select() { return this }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this }
  update(payload) { this.operation = 'update'; this.payload = payload; return this }
  eq(column, value) { this.filters.push({ kind: 'eq', column, value }); return this }
  in(column, values) { this.filters.push({ kind: 'in', column, values }); return this }
  gt() { return this }
  gte() { return this }

  execute() {
    if (this.table === 'checkout_drafts' && this.operation === 'select') {
      return { data: null, error: webhookState.draftError }
    }
    if (this.table === 'paid_reports' && this.operation === 'select') {
      const duplicateLookup = this.filters.some(({ column }) => column === 'stripe_session_id')
      return { data: duplicateLookup ? webhookState.existingReport : webhookState.report, error: null, count: 0 }
    }
    if (this.table === 'g15_consent_selections' && this.operation === 'select') {
      return { data: webhookState.g15Selection, error: null }
    }
    if (this.table === 'g15_consent_receipts' && this.operation === 'select') {
      return { data: webhookState.g15Receipts, error: null }
    }
    if (this.table === 'paid_reports' && this.operation === 'insert') {
      webhookState.insertCount += 1
      webhookState.report = {
        id: 'report-new-cg15',
        access_token: 'access-token',
        ...this.payload,
      }
      return { data: { id: webhookState.report.id, access_token: webhookState.report.access_token }, error: null }
    }
    if (this.table === 'paid_reports' && this.operation === 'update') {
      if (
        webhookState.throwOnUpdatePayloadKey
        && Object.hasOwn(this.payload ?? {}, webhookState.throwOnUpdatePayloadKey)
      ) {
        throw new Error('synthetic paid_reports update failure')
      }
      webhookState.updates.push(this.payload)
      if (webhookState.report) Object.assign(webhookState.report, this.payload)
      return { data: webhookState.report, error: null }
    }
    return { data: null, error: null, count: 0 }
  }

  async single() { return this.execute() }
  async maybeSingle() { return this.execute() }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject) }
}

const webhookSupabase = {
  from(table) { return new WebhookQuery(table) },
  async rpc(name, args) {
    webhookState.rpcCalls.push({ name, args })
    if (name === 'consume_g15_consent_for_order') {
      const selection = webhookState.g15Selection
      return {
        data: {
          outcome: 'already_consumed',
          selection_id: selection.id,
          selected_report_ids: selection.selected_report_ids,
          selected_report_ids_hash: selection.selected_report_ids_hash,
          policy_version: selection.policy_version,
          purpose: selection.purpose,
          sharing_scope: selection.sharing_scope,
          selection_expires_at: selection.expires_at,
          accepted_at_by_report: completeG15RecoveryBirthData.consent_authority.accepted_at_by_report,
          subject_user_ids_by_report: completeG15RecoveryBirthData.consent_authority.subject_user_ids_by_report,
          consumed_at: selection.consumed_at,
          stripe_session_id: args.p_stripe_session_id,
          report_id: selection.consumed_report_id,
        },
        error: null,
      }
    }
    return { data: [{ status: webhookState.checkoutPointsStatus, balance_after: 40 }], error: null }
  },
}
globalThis.__cg15WebhookSupabase = webhookSupabase

const modules = new Map([
  ['next/server', `
    export class NextRequest {}
    export class NextResponse {
      static json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status || 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
  `],
  ['stripe', `
    export default class Stripe {
      constructor() {
        this.webhooks = { constructEvent: () => globalThis.__cg15WebhookState.event }
        this.paymentIntents = { retrieve: async () => ({ latest_charge: null }) }
      }
    }
  `],
  ['@/lib/supabase', `
    export function createServiceClient() { return globalThis.__cg15WebhookSupabase }
  `],
  ['@/lib/resend-helper', `
    export async function sendEmailWithRetry() { return { success: true, attempts: 1 } }
  `],
  ['@/lib/unsubscribe', `export function getUnsubscribeHtml() { return '' }`],
  ['@/lib/accounting', `export async function recordRevenue() {}`],
  ['@/lib/funnel-tracker', `export async function trackFunnelServer() {}`],
  ['@/lib/ai/observability/telegram', `
    export async function notifyStripeFailed() {}
    export async function notify() {}
  `],
  ['@/lib/ai/observability/sentry-prod', `
    export async function captureMessage() {}
    export async function captureException() {}
  `],
  ['@/lib/plan-names', `
    export const PLAN_NAMES = { C: '人生藍圖', G15: '家族藍圖', E3: '月度精選' }
  `],
  ['@/lib/checkout/g15-independent-consent', `
    export const G15_CONSENT_SELECTION_COLUMNS = 'selection-columns'
    export const G15_CONSENT_RECEIPT_COLUMNS = 'receipt-columns'
    export const G15_INDEPENDENT_CONSENT_POLICY_VERSION = 'g15-family-member-consent/v4.0.0'
    export const G15_CONSENT_PURPOSE = 'prepare_and_generate_g15_family_blueprint'
    export const G15_CONSENT_SHARING_SCOPE = 'purchaser_and_selected_adult_members_summary_only'
    export function hashG15ConsentReportIds() { return 'sha256:${'8'.repeat(64)}' }
    export function validateG15PersistedConsentAuthority(input) {
      return { ok: true, authority: input.authority }
    }
    export function validateG15IndependentConsent(input) {
      const acceptedAtByReport = Object.fromEntries(input.receipts.map((receipt) => [receipt.subject_report_id, receipt.accepted_at]))
      return { ok: true, authority: {
        selectionId: input.selection.id,
        policyVersion: input.selection.policy_version,
        purpose: input.selection.purpose,
        sharingScope: input.selection.sharing_scope,
        expiresAt: input.selection.expires_at,
        acceptedAtByReport,
      } }
    }
  `],
  ['@/lib/checkout/g15-context', `
    export function validateG15ConsultationContext() { return { ok: true, context: {} } }
  `],
  ['@/lib/checkout/g15-consent-order.server', `
    export async function verifyG15ConsumedOrderBinding() { return true }
  `],
  ['@/lib/security/operational-telemetry', `
    export function escapeHtmlText(value) { return String(value ?? '') }
    export function operationalErrorClass() { return 'synthetic-error' }
    export function operationalFailureCode(value) {
      const stage = String(value ?? '').split(':', 1)[0]
      return stage.endsWith('_FAILED') ? stage : 'synthetic-error'
    }
    export function operationalFingerprint(value) {
      return String(value ?? '').slice(0, 16).padEnd(16, '0')
    }
    export function sanitizeEmailSubject(value) { return String(value ?? '').replace(/[\\r\\n]+/gu, ' ') }
  `],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = modules.get(specifier)
    if (source) return { url: dataModule(source), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { POST: stripeWebhookPost } = await import('../app/api/webhook/stripe/route.ts')

modules.set('workflow/api', `
  export async function start() { return { runId: 'synthetic-run' } }
`)
modules.set('@/workflows/generate-report', `
  export async function generateReportWorkflow() {}
`)
const { POST: workflowTriggerPost } = await import('../app/api/workflows/generate-report/route.ts')

const completeCRecoveryBirthData = {
  consultation_release_contract: { schema: 'consultation-report/v1', plan_code: 'C' },
  name: 'Test User',
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  gender: 'F',
  time_unknown: false,
  time_mode: 'exact',
  calendar_type: 'solar',
  timezone: 'Asia/Hong_Kong',
  timezone_offset: 8,
  latitude: 22.3193,
  longitude: 114.1694,
  birth_country: 'HK',
  birth_city: 'Hong Kong',
  marital_status: 'single',
  bazi_school: 'china_mainland',
  ayanamsa_type: 'lahiri',
  as_of: '2026-08-14',
  target_year: 2026,
}

const completeG15RecoveryBirthData = {
  consultation_release_contract: { schema: 'consultation-report/v1', plan_code: 'G15' },
  plan_type: 'family_reports',
  report_ids: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
  member_names: ['Member A', 'Member B'],
  stated_relationships: ['Family members share one household'],
  consultation_goals: ['Improve communication within the family'],
  consent_selection_id: '44444444-4444-4444-8444-444444444444',
  consent_authority: {
    selection_id: '44444444-4444-4444-8444-444444444444',
    policy_version: 'g15-family-member-consent/v4.0.0',
    purpose: 'prepare_and_generate_g15_family_blueprint',
    sharing_scope: 'purchaser_and_selected_adult_members_summary_only',
    expires_at: '2099-08-20T00:00:00.000Z',
    accepted_at_by_report: {
      '22222222-2222-4222-8222-222222222222': '2026-08-14T00:00:00.000Z',
      '33333333-3333-4333-8333-333333333333': '2026-08-14T00:00:00.000Z',
    },
    subject_user_ids_by_report: {
      '22222222-2222-4222-8222-222222222222': '55555555-5555-4555-8555-555555555555',
      '33333333-3333-4333-8333-333333333333': '66666666-6666-4666-8666-666666666666',
    },
  },
  as_of: '2026-08-14',
  target_year: 2026,
}

function seedWebhook({
  planCode = 'C',
  existingReport = null,
  pointsUsed = 0,
  pointsUserId = '',
  draftId = '',
} = {}) {
  globalThis.__cg15WebhookSupabase = webhookSupabase
  webhookState.event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_recovery',
        metadata: {
          plan_code: planCode,
          birth_data: JSON.stringify(
            planCode === 'C'
              ? completeCRecoveryBirthData
              : planCode === 'G15'
                ? completeG15RecoveryBirthData
                : { name: 'Test User', year: 1990, month: 1, day: 1, hour: 12 },
          ),
          points_used: String(pointsUsed),
          points_user_id: pointsUserId,
          login_user_id: '11111111-1111-4111-8111-111111111111',
          ...(draftId ? { draft_id: draftId } : {}),
        },
        amount_total: 8900,
        amount_subtotal: 8900,
        currency: 'usd',
        payment_status: 'paid',
        customer_email: 'test@example.invalid',
        customer_details: null,
        payment_intent: null,
      },
    },
  }
  const normalizedExistingReport = existingReport && planCode === 'G15'
    ? { ...existingReport, id: '77777777-7777-4777-8777-777777777777' }
    : existingReport
  webhookState.existingReport = normalizedExistingReport
    ? {
        birth_data: planCode === 'G15' ? completeG15RecoveryBirthData : completeCRecoveryBirthData,
        ...normalizedExistingReport,
      }
    : null
  webhookState.report = webhookState.existingReport ? { ...webhookState.existingReport } : null
  webhookState.updates.length = 0
  webhookState.throwOnUpdatePayloadKey = null
  webhookState.checkoutPointsStatus = 'already'
  webhookState.rpcCalls.length = 0
  webhookState.draftError = null
  webhookState.insertCount = 0
  webhookState.g15Selection = planCode === 'G15' ? {
    id: completeG15RecoveryBirthData.consent_selection_id,
    purchaser_user_id: '11111111-1111-4111-8111-111111111111',
    selected_report_ids: completeG15RecoveryBirthData.report_ids,
    selected_report_ids_hash: `sha256:${'8'.repeat(64)}`,
    policy_version: completeG15RecoveryBirthData.consent_authority.policy_version,
    purpose: completeG15RecoveryBirthData.consent_authority.purpose,
    sharing_scope: completeG15RecoveryBirthData.consent_authority.sharing_scope,
    expires_at: completeG15RecoveryBirthData.consent_authority.expires_at,
    superseded_at: null,
    consumed_at: '2026-08-14T00:01:00.000Z',
    consumed_stripe_session_id: 'cs_test_recovery',
    consumed_report_id: webhookState.existingReport?.id ?? null,
  } : null
  webhookState.g15Receipts = planCode === 'G15'
    ? completeG15RecoveryBirthData.report_ids.map((reportId, index) => ({
        selection_id: completeG15RecoveryBirthData.consent_selection_id,
        subject_report_id: reportId,
        subject_user_id: index === 0
          ? '55555555-5555-4555-8555-555555555555'
          : '66666666-6666-4666-8666-666666666666',
        subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
        status: 'accepted',
        accepted_at: completeG15RecoveryBirthData.consent_authority.accepted_at_by_report[reportId],
        revoked_at: null,
        expires_at: completeG15RecoveryBirthData.consent_authority.expires_at,
        accept_token_hash: null,
        revoke_token_hash: `sha256:${String(index + 3).repeat(64)}`,
      }))
    : []
}

function webhookRequest() {
  return {
    headers: new Headers({ 'stripe-signature': 'synthetic-signature' }),
    text: async () => '{}',
  }
}

test('workflow trigger endpoint rejects whitespace-only CRON_SECRET as unconfigured', async () => {
  process.env.CRON_SECRET = '   '
  const response = await workflowTriggerPost({
    headers: new Headers({ 'x-internal-secret': '   ' }),
    json: async () => ({ reportId: 'report-whitespace-secret' }),
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'CRON_SECRET not configured' })
})

test('C/G15 pending or failed duplicates re-trigger the durable workflow instead of returning inert receipts', async (t) => {
  for (const scenario of [
    { planCode: 'C', status: 'pending' },
    { planCode: 'G15', status: 'failed' },
  ]) {
    await t.test(`${scenario.planCode} ${scenario.status}`, async () => {
      seedWebhook({
        planCode: scenario.planCode,
        existingReport: { id: `report-existing-${scenario.planCode}`, status: scenario.status },
      })
      process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
      process.env.CRON_SECRET = 'cron-secret'
      process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

      const calls = []
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response('{}', { status: 202 })
      }
      try {
        const response = await stripeWebhookPost(webhookRequest())
        const body = await response.json()

        assert.equal(response.status, 200)
        assert.equal(body.duplicate, true)
        assert.equal(body.recovered, true)
        assert.equal(calls.length, 1)
        assert.equal(calls[0].url, 'https://site.example.invalid/api/workflows/generate-report')
        assert.equal(calls[0].init.headers['x-internal-secret'], 'cron-secret')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  }
})

test('C retry with unverified checkout points is quarantined and never starts generation', async () => {
  seedWebhook({
    planCode: 'C',
    existingReport: { id: 'report-points-unverified', status: 'pending' },
    pointsUsed: 10,
    pointsUserId: '11111111-1111-4111-8111-111111111111',
  })
  webhookState.checkoutPointsStatus = 'insufficient'
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('unverified checkout points must stop before workflow fetch')
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: true, duplicate: true, manual_review: true })
    assert.equal(webhookState.rpcCalls.length, 1)
    assert.equal(webhookState.rpcCalls[0].name, 'deduct_checkout_points_once')
    assert.equal(webhookState.report.status, 'needs_human_review')
    assert.equal(
      webhookState.report.error_message,
      'Checkout points verification requires manual review',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('new C draft read failure returns retryable 500 before points, insert, or workflow', async () => {
  seedWebhook({
    planCode: 'C',
    draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    pointsUsed: 10,
    pointsUserId: '11111111-1111-4111-8111-111111111111',
  })
  webhookState.draftError = { code: 'synthetic_read_failure' }
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('draft read failure must stop before workflow fetch')
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: 'Structured checkout data unavailable; Stripe retry required',
    })
    assert.equal(webhookState.rpcCalls.length, 0)
    assert.equal(webhookState.insertCount, 0)
    assert.equal(webhookState.report, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('existing C retry without persisted birth_data is held for manual review', async () => {
  seedWebhook({
    planCode: 'C',
    existingReport: {
      id: 'report-missing-recovery-data',
      status: 'failed',
      birth_data: null,
    },
  })
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('missing persisted birth_data must not start generation')
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: true, duplicate: true, manual_review: true })
    assert.equal(webhookState.rpcCalls.length, 0)
    assert.equal(webhookState.report.status, 'needs_human_review')
    assert.equal(
      webhookState.report.error_message,
      'Structured checkout data unavailable; Stripe retry required',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('C/G15 recoverable duplicates return retryable 500 with a fixed non-PII error when durable start fails', async (t) => {
  for (const scenario of [
    { planCode: 'C', status: 'pending' },
    { planCode: 'G15', status: 'failed' },
  ]) {
    await t.test(`${scenario.planCode} ${scenario.status}`, async () => {
      seedWebhook({
        planCode: scenario.planCode,
        existingReport: { id: `report-existing-${scenario.planCode}`, status: scenario.status },
      })
      process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
      process.env.CRON_SECRET = 'cron-secret'
      process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

      const calls = []
      let clearCount = 0
      const originalFetch = globalThis.fetch
      const originalClearTimeout = globalThis.clearTimeout
      globalThis.fetch = async (url) => {
        calls.push(String(url))
        return new Response('unavailable', { status: 503 })
      }
      globalThis.clearTimeout = (timer) => {
        clearCount += 1
        return originalClearTimeout(timer)
      }
      try {
        const response = await stripeWebhookPost(webhookRequest())
        const body = await response.json()

        assert.equal(response.status, 500)
        assert.deepEqual(body, {
          error: 'Durable workflow trigger unavailable; Stripe retry required',
        })
        assert.deepEqual(calls, ['https://site.example.invalid/api/workflows/generate-report'])
        assert.equal(clearCount, 1)
        assert.equal(
          webhookState.updates.at(-1)?.error_message,
          'Durable workflow trigger unavailable; Stripe retry required',
        )
      } finally {
        globalThis.fetch = originalFetch
        globalThis.clearTimeout = originalClearTimeout
      }
    })
  }
})

test('first C purchase never falls back to the unsupported legacy generator when durable start fails', async () => {
  seedWebhook({ planCode: 'C' })
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return calls.length === 1
      ? new Response('durable unavailable', { status: 503 })
      : new Response('{}', { status: 202 })
  }
  try {
    const response = await stripeWebhookPost(webhookRequest())
    const body = await response.json()

    assert.equal(response.status, 500)
    assert.deepEqual(body, {
      error: 'Durable workflow trigger unavailable; Stripe retry required',
    })
    assert.deepEqual(calls, ['https://site.example.invalid/api/workflows/generate-report'])
    assert.equal(
      webhookState.updates.at(-1)?.error_message,
      'Durable workflow trigger unavailable; Stripe retry required',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('first C purchase returns retryable 500 when a required pre-trigger database write throws', async () => {
  seedWebhook({ planCode: 'C' })
  webhookState.throwOnUpdatePayloadKey = 'birth_data'
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('failed pre-trigger write must stop before workflow fetch')
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: 'Structured report trigger failed; Stripe retry required',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('C/G15 terminal duplicates remain duplicate receipts and never restart generation', async (t) => {
  for (const status of ['completed', 'generating', 'needs_human_review', 'refunded']) {
    await t.test(status, async () => {
      seedWebhook({
        planCode: 'G15',
        existingReport: { id: `report-terminal-${status}`, status },
      })
      process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
      process.env.CRON_SECRET = 'cron-secret'

      const originalFetch = globalThis.fetch
      globalThis.fetch = async () => {
        assert.fail(`terminal duplicate ${status} must not call fetch`)
      }
      try {
        const response = await stripeWebhookPost(webhookRequest())
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { received: true, duplicate: true })
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  }
})

test('C durable trigger timeout is cleared in finally and returns retryable 500', async () => {
  seedWebhook({ existingReport: { id: 'report-timeout-c', status: 'pending' } })
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

  let clearCount = 0
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  globalThis.setTimeout = (callback, delay) => {
    assert.equal(delay, 5000)
    callback()
    return 12345
  }
  globalThis.clearTimeout = (timer) => {
    assert.equal(timer, 12345)
    clearCount += 1
  }
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.signal.aborted, true)
    throw new DOMException('synthetic timeout', 'AbortError')
  }
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 500)
    assert.equal(clearCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('blank CRON_SECRET fails C recovery closed without sending an unauthenticated request', async () => {
  seedWebhook({ existingReport: { id: 'report-blank-secret', status: 'pending' } })
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = '   '

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('blank CRON_SECRET must stop before fetch')
  try {
    const response = await stripeWebhookPost(webhookRequest())
    assert.equal(response.status, 500)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('E3 keeps its legacy duplicate and durable-to-fallback behavior byte-for-byte at the observable boundary', async (t) => {
  process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'

  await t.test('pending duplicate stays an inert duplicate receipt', async () => {
    seedWebhook({
      planCode: 'E3',
      existingReport: { id: 'report-existing-e3', status: 'pending' },
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => assert.fail('legacy E3 duplicate must not trigger fetch')
    try {
      const response = await stripeWebhookPost(webhookRequest())
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { received: true, duplicate: true })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await t.test('first purchase still uses the legacy fallback after durable start failure', async () => {
    seedWebhook({ planCode: 'E3' })
    const calls = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return calls.length === 1
        ? new Response('durable unavailable', { status: 503 })
        : new Response('{}', { status: 202 })
    }
    try {
      const response = await stripeWebhookPost(webhookRequest())
      assert.equal(response.status, 200)
      assert.deepEqual(calls, [
        'https://site.example.invalid/api/workflows/generate-report',
        'https://site.example.invalid/api/generate-report',
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

function registerInertImports(filePath) {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const pending = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
    if (!statement.moduleSpecifier) continue
    const specifier = statement.moduleSpecifier.text
    if (modules.has(specifier)) continue
    if (!pending.has(specifier)) pending.set(specifier, { defaultExport: false, names: new Set() })
    const entry = pending.get(specifier)
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : null
    if (clause?.name) entry.defaultExport = true
    const namedBindings = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings
      : null
    if (namedBindings) {
      for (const element of namedBindings.elements) {
        const name = element.propertyName?.text ?? element.name.text
        entry.names.add(name)
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const name = element.propertyName?.text ?? element.name.text
        entry.names.add(name)
      }
    }
  }
  for (const [specifier, entry] of pending) {
    const declarations = ['function inert() {}']
    if (entry.defaultExport) declarations.push('export default inert')
    for (const name of entry.names) declarations.push(`export const ${name} = inert`)
    modules.set(specifier, declarations.join('\n'))
  }
}

modules.set('workflow', `
  export class FatalError extends Error {}
  export class RetryableError extends Error {}
  export function getWritable() {
    return {
      getWriter() { return { write: async () => {}, releaseLock() {} } },
      close: async () => {},
    }
  }
`)
modules.set('@/lib/plan-names', `
  export const PLAN_NAMES = {}
  export const ALL_PLAN_CODES = []
  export function isChumenjiPlan() { return false }
`)
modules.set('@/lib/unsubscribe', `
  export function getUnsubscribeHtml() { return '' }
  export function getUnsubscribeUrl() { return 'https://local.invalid/unsubscribe' }
`)
modules.set('@/lib/ai/observability/telegram', `
  export async function notifyStripeFailed() {}
  export async function notify() {}
  export async function notifyEmailFailed() {}
  export async function notifyNeedsHumanReview() {}
`)
modules.set('@/prompts/c_plan_v6', `
  export const V6_BODY_TERM_BLACKLIST = []
`)

const stepsPath = path.join(root, 'workflows', 'generate-report', 'steps.ts')
registerInertImports(stepsPath)

const loadState = {
  row: null,
  selectError: null,
  updateError: null,
  updateAttempts: 0,
  beforeCompletionCas: null,
  completionReceiptMode: 'normal',
  removals: [],
}

class WorkflowLoadQuery {
  constructor() {
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.returning = false
    this.head = false
  }

  select(_columns = '*', options = {}) {
    this.head = options.head === true
    if (this.operation === 'update') this.returning = true
    return this
  }
  update(payload) { this.operation = 'update'; this.payload = payload; return this }
  eq(column, value) { this.filters.push((row) => row?.[column] === value); return this }
  in(column, values) { this.filters.push((row) => values.includes(row?.[column])); return this }
  is(column, value) { this.filters.push((row) => row?.[column] === value); return this }
  gt() { return this }

  matches(row) { return Boolean(row) && this.filters.every((filter) => filter(row)) }

  execute() {
    if (this.operation === 'select') {
      if (loadState.selectError) return { data: null, error: loadState.selectError, count: null }
      if (this.head) return { data: null, error: null, count: 0 }
      return {
        data: this.matches(loadState.row) ? { ...loadState.row } : null,
        error: null,
        count: null,
      }
    }

    loadState.updateAttempts += 1
    if (loadState.updateError) return { data: null, error: loadState.updateError }
    if (this.payload?.status === 'completed' && loadState.beforeCompletionCas) {
      const beforeCompletionCas = loadState.beforeCompletionCas
      loadState.beforeCompletionCas = null
      beforeCompletionCas(loadState.row)
    }
    if (!this.matches(loadState.row)) return { data: this.returning ? [] : null, error: null }
    Object.assign(loadState.row, this.payload)
    if (this.payload?.status === 'completed' && this.returning) {
      if (loadState.completionReceiptMode === 'null') return { data: null, error: null }
      if (loadState.completionReceiptMode === 'multiple') {
        return { data: [{ id: loadState.row.id }, { id: 'unexpected-row' }], error: null }
      }
    }
    return { data: this.returning ? [{ id: loadState.row.id }] : null, error: null }
  }

  async single() { return this.execute() }
  async maybeSingle() { return this.execute() }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject) }
}

const workflowLoadSupabase = {
  from(table) {
    assert.equal(table, 'paid_reports')
    return new WorkflowLoadQuery()
  },
  storage: {
    from(bucket) {
      return {
        async remove(paths) {
          loadState.removals.push({ bucket, paths })
          return { data: paths, error: null }
        },
      }
    },
  },
}

const {
  loadReportRecord,
  isReportWorkflowSkipResult,
  saveReportToSupabase,
} = await import('../workflows/generate-report/steps.ts')

function seedWorkflowLoad(overrides = {}) {
  globalThis.__cg15WebhookSupabase = workflowLoadSupabase
  loadState.row = {
    id: 'report-cas-race',
    status: 'pending',
    retry_count: 0,
    deleted_at: null,
    birth_data: { name: 'Test User', year: 1990, month: 1, day: 1, hour: 12 },
    plan_code: 'C',
    access_token: 'access-token',
    customer_email: 'test@example.invalid',
    user_id: null,
    created_at: '2026-08-13T00:00:00.000Z',
    ...overrides,
  }
  loadState.selectError = null
  loadState.updateError = null
  loadState.updateAttempts = 0
  loadState.beforeCompletionCas = null
  loadState.completionReceiptMode = 'normal'
  loadState.removals.length = 0
}

test('completion CAS re-reads a needs_human_review race and never overwrites the terminal status', async () => {
  seedWorkflowLoad({ status: 'generating' })
  loadState.beforeCompletionCas = (row) => {
    row.status = 'needs_human_review'
  }

  const result = await saveReportToSupabase(
    'report-cas-race',
    'late worker content',
    'synthetic-model',
    [],
    null,
  )

  assert.deepEqual(result, {
    outcome: 'terminal_blocked',
    actualStatus: 'needs_human_review',
  })
  assert.equal(loadState.row.status, 'needs_human_review')
  assert.equal(loadState.row.report_result, undefined)
})

test('completion CAS never revives failed and distinguishes the winner from a completed loser', async (t) => {
  await t.test('failed remains terminal', async () => {
    seedWorkflowLoad({ status: 'failed' })
    const result = await saveReportToSupabase(
      'report-cas-race',
      'late worker content',
      'synthetic-model',
      [],
      null,
    )
    assert.deepEqual(result, {
      outcome: 'terminal_blocked',
      actualStatus: 'failed',
    })
    assert.equal(loadState.row.status, 'failed')
    assert.equal(loadState.row.report_result, undefined)
  })

  await t.test('generating worker wins exactly once', async () => {
    seedWorkflowLoad({ status: 'generating' })
    const result = await saveReportToSupabase(
      'report-cas-race',
      'winning worker content',
      'synthetic-model',
      [],
      null,
    )
    assert.deepEqual(result, { outcome: 'completed_by_this_worker' })
    assert.equal(loadState.row.status, 'completed')
  })

  await t.test('already completed is an explicit loser', async () => {
    seedWorkflowLoad({ status: 'completed' })
    const result = await saveReportToSupabase(
      'report-cas-race',
      'late worker content',
      'synthetic-model',
      [],
      null,
    )
    assert.deepEqual(result, { outcome: 'lost_to_completed' })
  })
})

test('an unknown completion receipt retains its immutable PDF and retry recognizes the committed pointer', async () => {
  seedWorkflowLoad({ status: 'generating', pdf_url: null })
  const ownedPdf = {
    reference: 'private-reports/report-cas-race/generations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
    bucket: 'private-reports',
    path: 'report-cas-race/generations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
    generationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }
  loadState.completionReceiptMode = 'null'

  await assert.rejects(
    saveReportToSupabase(
      'report-cas-race',
      'committed content with a lost response',
      'synthetic-model',
      [],
      ownedPdf,
    ),
    /完成狀態收據無效/u,
  )
  assert.equal(loadState.row.status, 'completed')
  assert.equal(loadState.row.pdf_url, ownedPdf.reference)
  assert.deepEqual(loadState.removals, [])

  loadState.completionReceiptMode = 'normal'
  const retry = await saveReportToSupabase(
    'report-cas-race',
    'committed content with a lost response',
    'synthetic-model',
    [],
    ownedPdf,
  )
  assert.deepEqual(retry, { outcome: 'completed_by_this_worker' })
  assert.deepEqual(loadState.removals, [])
})

test('two concurrent workflow loads have one CAS winner and one explicitly benign loser', async () => {
  seedWorkflowLoad()
  const results = await Promise.all([
    loadReportRecord('report-cas-race'),
    loadReportRecord('report-cas-race'),
  ])

  const winners = results.filter((result) => !isReportWorkflowSkipResult(result))
  const losers = results.filter((result) => isReportWorkflowSkipResult(result))
  assert.equal(winners.length, 1)
  assert.equal(losers.length, 1)
  assert.equal(loadState.row.status, 'generating')
  assert.deepEqual(losers[0], { skipped: true, reason: 'cas_lost' })
  assert.equal(isReportWorkflowSkipResult(structuredClone(losers[0])), true)
})

test('real report load, database, and birthData failures are never classified as benign skips', async (t) => {
  await t.test('missing birthData', async () => {
    seedWorkflowLoad({ birth_data: null })
    await assert.rejects(
      loadReportRecord('report-cas-race'),
      (error) => isReportWorkflowSkipResult(error) === false,
    )
  })

  await t.test('database select failure', async () => {
    seedWorkflowLoad()
    loadState.selectError = { message: 'database unavailable' }
    await assert.rejects(
      loadReportRecord('report-cas-race'),
      (error) => isReportWorkflowSkipResult(error) === false,
    )
  })

  await t.test('database CAS failure', async () => {
    seedWorkflowLoad()
    loadState.updateError = { message: 'write unavailable' }
    await assert.rejects(
      loadReportRecord('report-cas-race'),
      (error) => isReportWorkflowSkipResult(error) === false,
    )
  })
})

const workflowIndexState = {
  loadResult: null,
  loadError: null,
  events: [],
  useConsultationV1: false,
  generationKilled: false,
  saveOutcome: { outcome: 'completed_by_this_worker' },
  pdfResult: 'private-reports/synthetic/report.pdf',
}
globalThis.__cg15WorkflowIndexState = workflowIndexState

modules.set('./steps', `
  const state = globalThis.__cg15WorkflowIndexState
  export async function loadReportRecord() {
    if (state.loadError) throw state.loadError
    return state.loadResult
  }
  export async function markReportFailed(...args) { state.events.push({ kind: 'mark-failed', args }) }
  export async function closeProgressStream() { state.events.push({ kind: 'close' }) }
  export function setCurrentReportId(reportId) { state.events.push({ kind: 'set-report', reportId }) }
  export async function callPythonCalculate() { state.events.push({ kind: 'calculator' }); return { analyses: [] } }
  export async function callPythonCalculateAttested() {
    state.events.push({ kind: 'calculator-attested' })
    return { response: { analyses: [] } }
  }
  export async function callChumenjiTop() {}
  export async function aiGenerateCall1() {}
  export async function aiGenerateCall2() {}
  export async function aiGenerateCall3() {}
  export async function aiGenerateGeneric() {}
  export async function loadFamilyReportsByIds() {
    return [
      { name: 'Synthetic One', birthData: { name: 'Synthetic One' } },
      { name: 'Synthetic Two', birthData: { name: 'Synthetic Two' } },
    ]
  }
  export async function aiGenerateG15() { state.events.push({ kind: 'ai-g15' }) }
  export async function aiGenerateR() {}
  export function cleanFinalReport() {}
  export function validateReportAgainstData() {}
  export async function qualityGate() {}
  export async function aiReviewReport() {}
  export async function contentModerationStep() { return { blocked: false, reason: '' } }
  export async function generatePDF() {
    state.events.push({ kind: 'pdf' })
    return state.pdfResult
  }
  export async function saveReportToSupabase() {
    state.events.push({ kind: 'save' })
    return state.saveOutcome
  }
  export async function aiExtractNarrative() {}
  export async function sendReportEmail() { state.events.push({ kind: 'email' }) }
  export async function markReportNeedsHumanReview(...args) {
    state.events.push({ kind: 'mark-human-review', args })
  }
  export function buildAppendix() {}
  export const PLAN_SYSTEM_PROMPT = {}
`)
modules.set('./extract-full-charts', `export function extractFullCharts() {}`)
modules.set('./consultation-v1', `
  export async function buildStructuredCReport() {
    return {
      moderationText: 'safe',
      plainText: 'late worker content',
      aiModel: 'synthetic-model',
      analysesSummary: [],
      fullCharts: {},
      report: { schemaVersion: 'consultation-report/v1' },
    }
  }
  export async function buildStructuredG15Report() {
    return {
      moderationText: 'safe',
      plainText: 'structured family content',
      aiModel: 'synthetic-model',
      analysesSummary: [],
      report: { schemaVersion: 'consultation-report/v1' },
    }
  }
  export function buildConsultationCalculatorBirthData(value) { return value }
`)
modules.set('@/lib/consultation/runtime-config', `
  export function hasConsultationOrderReleaseContract(planCode, birthData) {
    const contract = birthData?.consultation_release_contract
    return contract?.schema === 'consultation-report/v1' && contract?.plan_code === planCode
  }
  export function isConsultationGenerationKillSwitchEnabled() {
    return globalThis.__cg15WorkflowIndexState.generationKilled
  }
  export function readConsultationRuntimeReceipts() { return {} }
`)
modules.set('@/lib/consultation/legacy-calculator-safety', `
  export function assertNoLegacyCalculatorFailureMarkers() {}
  export function consultationCalculatorEvidenceForGeneration(value) { return value }
  export function assertCompleteConsultationCalculatorResult() {}
`)
modules.set('@/lib/consultation/client-question', `
  export function buildUntrustedClientQuestionBlock() { return '' }
  export function normalizeConsultationClientQuestion() { return '' }
`)

const indexPath = path.join(root, 'workflows', 'generate-report', 'index.ts')
registerInertImports(indexPath)
const { generateReportWorkflow } = await import('../workflows/generate-report/index.ts')

test('workflow CAS loser exits as benign skipped without markReportFailed or customer notification', async () => {
  workflowIndexState.loadError = null
  workflowIndexState.loadResult = { skipped: true, reason: 'cas_lost' }
  workflowIndexState.events.length = 0

  const result = await generateReportWorkflow('report-cas-loser')

  assert.deepEqual(result, {
    success: true,
    skipped: true,
    reason: 'already_claimed',
  })
  assert.equal(workflowIndexState.events.some(({ kind }) => kind === 'mark-failed'), false)
  assert.equal(workflowIndexState.events.some(({ kind }) => kind === 'close'), true)
})

test('real workflow load errors still mark the report failed', async () => {
  workflowIndexState.loadResult = null
  workflowIndexState.loadError = new Error('synthetic database load failure')
  workflowIndexState.events.length = 0

  const result = await generateReportWorkflow('report-real-load-error')

  assert.equal(result.success, false)
  assert.equal(result.error, '載入記錄失敗')
  const failures = workflowIndexState.events.filter(({ kind }) => kind === 'mark-failed')
  assert.equal(failures.length, 1)
  assert.equal(failures[0].args[1], 'LOAD_REPORT_RECORD_FAILED:synthetic-error')
})

test('C/G15 without a persisted checkout release contract stops before generation side effects', async (t) => {
  for (const planCode of ['C', 'G15']) {
    await t.test(planCode, async () => {
      const trustedBirthData = planCode === 'G15'
        ? completeG15RecoveryBirthData
        : completeCRecoveryBirthData
      const { consultation_release_contract: _discarded, ...unboundBirthData } = trustedBirthData
      workflowIndexState.loadError = null
      workflowIndexState.loadResult = {
        birthData: unboundBirthData,
        planCode,
        accessToken: 'access-token',
        customerEmail: 'test@example.invalid',
        userId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-08-14T00:00:00.000Z',
      }
      workflowIndexState.generationKilled = false
      workflowIndexState.events.length = 0

      const result = await generateReportWorkflow(`report-release-off-${planCode}`)

      assert.deepEqual(result, {
        success: false,
        error: 'CONSULTATION_ORDER_RELEASE_CONTRACT_MISSING',
      })
      const kinds = workflowIndexState.events.map(({ kind }) => kind)
      assert.equal(kinds.includes('mark-human-review'), true)
      assert.equal(kinds.includes('close'), true)
      assert.equal(kinds.includes('calculator'), false)
      assert.equal(kinds.includes('calculator-attested'), false)
      assert.equal(kinds.includes('ai-g15'), false)
      assert.equal(kinds.includes('save'), false)
      assert.equal(kinds.includes('email'), false)
    })
  }
})

test('an explicit generation kill switch holds even a paid contract-bound order', async () => {
  workflowIndexState.loadError = null
  workflowIndexState.loadResult = {
    birthData: completeCRecoveryBirthData,
    planCode: 'C',
    accessToken: 'access-token',
    customerEmail: 'test@example.invalid',
    userId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-08-14T00:00:00.000Z',
  }
  workflowIndexState.generationKilled = true
  workflowIndexState.events.length = 0

  const result = await generateReportWorkflow('report-kill-switch-C')

  assert.deepEqual(result, {
    success: false,
    error: 'CONSULTATION_GENERATION_KILL_SWITCH',
  })
  const kinds = workflowIndexState.events.map(({ kind }) => kind)
  assert.equal(kinds.includes('mark-human-review'), true)
  assert.equal(kinds.includes('calculator-attested'), false)
  assert.equal(kinds.includes('save'), false)
  assert.equal(kinds.includes('email'), false)
  workflowIndexState.generationKilled = false
})

test('C/G15 structured PDF failure marks failed before save or email', async (t) => {
  for (const planCode of ['C', 'G15']) {
    await t.test(planCode, async () => {
      workflowIndexState.loadError = null
      workflowIndexState.loadResult = {
        birthData: planCode === 'G15' ? completeG15RecoveryBirthData : completeCRecoveryBirthData,
        planCode,
        accessToken: 'access-token',
        customerEmail: 'test@example.invalid',
        userId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-08-14T00:00:00.000Z',
      }
      workflowIndexState.useConsultationV1 = true
      workflowIndexState.pdfResult = null
      workflowIndexState.saveOutcome = { outcome: 'completed_by_this_worker' }
      workflowIndexState.events.length = 0

      const result = await generateReportWorkflow(`report-pdf-failure-${planCode}`)

      assert.deepEqual(result, {
        success: false,
        error: `${planCode} PDF 生成失敗`,
      })
      const kinds = workflowIndexState.events.map(({ kind }) => kind)
      assert.equal(kinds.includes('pdf'), true)
      assert.equal(kinds.includes('mark-failed'), true)
      assert.equal(kinds.includes('close'), true)
      assert.equal(kinds.includes('save'), false)
      assert.equal(kinds.includes('email'), false)
    })
  }
})

test('C/G15 structured valid PDF reference still saves before email', async (t) => {
  for (const planCode of ['C', 'G15']) {
    await t.test(planCode, async () => {
      workflowIndexState.loadError = null
      workflowIndexState.loadResult = {
        birthData: planCode === 'G15' ? completeG15RecoveryBirthData : completeCRecoveryBirthData,
        planCode,
        accessToken: 'access-token',
        customerEmail: 'test@example.invalid',
        userId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-08-14T00:00:00.000Z',
      }
      workflowIndexState.useConsultationV1 = true
      workflowIndexState.pdfResult = `private-reports/report-valid-${planCode}/report.pdf`
      workflowIndexState.saveOutcome = { outcome: 'completed_by_this_worker' }
      workflowIndexState.events.length = 0

      const result = await generateReportWorkflow(`report-pdf-valid-${planCode}`)

      assert.equal(result.success, true)
      const kinds = workflowIndexState.events.map(({ kind }) => kind)
      assert.ok(kinds.indexOf('pdf') < kinds.indexOf('save'))
      assert.ok(kinds.indexOf('save') < kinds.indexOf('email'))
      assert.equal(kinds.includes('mark-failed'), false)
    })
  }
})

test('C structured worker that loses completion CAS exits as already completed and never emails its own content', async () => {
  workflowIndexState.loadError = null
  workflowIndexState.loadResult = {
    birthData: completeCRecoveryBirthData,
    planCode: 'C',
    accessToken: 'access-token',
    customerEmail: 'test@example.invalid',
    userId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-08-14T00:00:00.000Z',
  }
  workflowIndexState.useConsultationV1 = true
  workflowIndexState.pdfResult = 'private-reports/synthetic/report.pdf'
  workflowIndexState.saveOutcome = { outcome: 'lost_to_completed' }
  workflowIndexState.events.length = 0

  const result = await generateReportWorkflow('report-completion-loser-C')

  assert.deepEqual(result, {
    success: true,
    skipped: true,
    reason: 'completed_by_other_worker',
  })
  const kinds = workflowIndexState.events.map(({ kind }) => kind)
  assert.equal(kinds.includes('save'), true)
  assert.equal(kinds.includes('email'), false)
  assert.equal(kinds.includes('close'), true)
})

test('C structured worker blocked by a terminal completion status stops and never emails', async () => {
  workflowIndexState.loadError = null
  workflowIndexState.loadResult = {
    birthData: completeCRecoveryBirthData,
    planCode: 'C',
    accessToken: 'access-token',
    customerEmail: 'test@example.invalid',
    userId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-08-14T00:00:00.000Z',
  }
  workflowIndexState.useConsultationV1 = true
  workflowIndexState.pdfResult = 'private-reports/synthetic/report.pdf'
  workflowIndexState.saveOutcome = {
    outcome: 'terminal_blocked',
    actualStatus: 'needs_human_review',
  }
  workflowIndexState.events.length = 0

  const result = await generateReportWorkflow('report-completion-blocked-C')

  assert.deepEqual(result, {
    success: false,
    error: 'REPORT_TERMINAL_STATE_BLOCKED',
  })
  const kinds = workflowIndexState.events.map(({ kind }) => kind)
  assert.equal(kinds.includes('save'), true)
  assert.equal(kinds.includes('email'), false)
  assert.equal(kinds.includes('close'), true)
})

test('every workflow save callsite checks completion ownership before continuing', () => {
  const workflowSource = readFileSync(indexPath, 'utf8')
  const saveCalls = workflowSource.match(/const saveOutcome = await saveReportToSupabase\(/gu) ?? []
  const ownershipChecks = workflowSource.match(
    /const completionStop = await stopAfterNonOwnedCompletion\(saveOutcome\)/gu,
  ) ?? []
  const uncheckedCalls = workflowSource.match(/(?<!const saveOutcome = )await saveReportToSupabase\(/gu) ?? []

  assert.equal(saveCalls.length, 5)
  assert.equal(ownershipChecks.length, saveCalls.length)
  assert.equal(uncheckedCalls.length, 0)
})
