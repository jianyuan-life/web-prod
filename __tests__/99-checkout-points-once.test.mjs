import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const virtualModules = new Map([
  ['next/server', dataModule(`
    export class NextRequest extends Request {}
    export class NextResponse extends Response {
      static json(body, init = {}) {
        const headers = new Headers(init.headers)
        if (!headers.has('content-type')) headers.set('content-type', 'application/json')
        return new NextResponse(JSON.stringify(body), { ...init, headers })
      }
    }
  `)],
  ['stripe', dataModule(`
    export default class Stripe {
      constructor() {
        this.webhooks = {
          constructEvent() {
            return globalThis.__checkoutPointsEvent
          },
        }
        this.paymentIntents = {
          async retrieve() {
            globalThis.__checkoutPointsLedger.push({ name: 'stripe.paymentIntents.retrieve' })
            return { latest_charge: null }
          },
        }
      }
    }
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() {
      return globalThis.__checkoutPointsSupabase
    }
  `)],
  ['@/lib/resend-helper', dataModule(`
    export async function sendEmailWithRetry(input) {
      globalThis.__checkoutPointsLedger.push({ name: 'sendEmailWithRetry', input })
      return { success: true, attempts: 1 }
    }
  `)],
  ['@/lib/unsubscribe', dataModule('export function getUnsubscribeHtml(){return ""}')],
  ['@/lib/accounting', dataModule(`
    export async function recordRevenue(input) {
      globalThis.__checkoutPointsLedger.push({ name: 'recordRevenue', input })
    }
  `)],
  ['@/lib/funnel-tracker', dataModule(`
    export async function trackFunnelServer(input) {
      globalThis.__checkoutPointsLedger.push({ name: 'trackFunnelServer', input })
    }
  `)],
  ['@/lib/ai/observability/telegram', dataModule(`
    export async function notifyStripeFailed(...args) {
      globalThis.__checkoutPointsLedger.push({ name: 'notifyStripeFailed', args })
      return true
    }
    export async function notify(...args) {
      globalThis.__checkoutPointsLedger.push({ name: 'notify', args })
      return true
    }
  `)],
  ['@/lib/plan-names', dataModule(`
    export const PLAN_NAMES = {
      C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？',
      E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運',
    }
  `)],
  ['@/lib/checkout/g15-independent-consent', dataModule(`
    import { createHash } from 'node:crypto'
    export const G15_CONSENT_SELECTION_COLUMNS = 'selection-columns'
    export const G15_CONSENT_RECEIPT_COLUMNS = 'receipt-columns'
    export const G15_INDEPENDENT_CONSENT_POLICY_VERSION = 'g15-family-member-consent/v3.0.0'
    export const G15_CONSENT_PURPOSE = 'prepare_and_generate_g15_family_blueprint'
    export const G15_CONSENT_SHARING_SCOPE = 'purchaser_and_selected_adult_members_summary_only'
    export function hashG15ConsentReportIds(reportIds) {
      const canonical = [...reportIds].map((value) => String(value).trim().toLowerCase()).sort()
      return 'sha256:' + createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')
    }
    export function validateG15PersistedConsentAuthority(input) { return { ok: true, authority: input.authority } }
    export function validateG15IndependentConsent(input) {
      return { ok: true, authority: {
        selectionId: input.selection.id,
        policyVersion: input.selection.policy_version,
        purpose: input.selection.purpose,
        sharingScope: input.selection.sharing_scope,
        expiresAt: input.selection.expires_at,
        acceptedAtByReport: Object.fromEntries(input.receipts.map((receipt) => [receipt.subject_report_id, receipt.accepted_at])),
      } }
    }
  `)],
  ['@/lib/checkout/g15-consent-order.server', dataModule(`
    export async function verifyG15ConsumedOrderBinding() { return true }
  `)],
  ['@/lib/checkout/g15-context', dataModule(`
    export function validateG15ConsultationContext() { return { ok: true, context: {} } }
  `)],
  ['@/lib/security/operational-telemetry', dataModule(`
    export function escapeHtmlText(value) { return String(value ?? '') }
    export function operationalErrorClass() { return 'synthetic-error' }
    export function operationalFingerprint(value) {
      return String(value ?? '').slice(0, 16).padEnd(16, '0')
    }
    export function sanitizeEmailSubject(value) { return String(value ?? '').replace(/[\\r\\n]+/gu, ' ') }
  `)],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

function createSupabaseDouble({
  checkoutRpcData,
  checkoutRpcError = null,
  checkoutRpcThrows = null,
  deductPointsData = 37,
} = {}) {
  const ledger = globalThis.__checkoutPointsLedger
  const planCode = globalThis.__checkoutPointsEvent.data.object.metadata.plan_code
  const structuredBirthData = planCode === 'G15'
    ? {
        plan_type: 'family_reports',
        report_ids: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
        member_names: ['Member A', 'Member B'],
        stated_relationships: ['Family members share one household'],
        consultation_goals: ['Improve communication within the family'],
        consent_selection_id: '44444444-4444-4444-8444-444444444444',
        consent_authority: {
          selection_id: '44444444-4444-4444-8444-444444444444',
          policy_version: 'g15-family-member-consent/v3.0.0',
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
    : {
        name: 'Synthetic Customer',
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
  const state = {
    report: null,
    draft: {
      birth_data: structuredBirthData,
      plan_code: planCode,
      locale: 'zh-TW',
    },
    g15Selection: planCode === 'G15' ? {
      id: '44444444-4444-4444-8444-444444444444',
      purchaser_user_id: '11111111-1111-4111-8111-111111111111',
      policy_version: 'g15-family-member-consent/v3.0.0',
      purpose: 'prepare_and_generate_g15_family_blueprint',
      sharing_scope: 'purchaser_and_selected_adult_members_summary_only',
      expires_at: '2099-08-20T00:00:00.000Z',
    } : null,
    g15Receipts: planCode === 'G15' ? structuredBirthData.report_ids.map((reportId, index) => ({
      selection_id: '44444444-4444-4444-8444-444444444444',
      subject_report_id: reportId,
      accepted_at: '2026-08-14T00:00:00.000Z',
      status: 'accepted',
      subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
    })) : [],
  }

  const execute = async ({ table, action, payload, filters }) => {
    if (table === 'paid_reports' && action === 'select') {
      return { data: state.report, error: null }
    }

    if (table === 'checkout_drafts' && action === 'select') {
      return { data: state.draft, error: null }
    }
    if (table === 'g15_consent_selections' && action === 'select') {
      return { data: state.g15Selection, error: null }
    }
    if (table === 'g15_consent_receipts' && action === 'select') {
      return { data: state.g15Receipts, error: null }
    }

    if (table === 'paid_reports' && action === 'insert') {
      state.report = {
        ...payload,
        id: payload.id || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        access_token: 'synthetic-access-token',
      }
      ledger.push({ name: 'paid_reports.insert', payload })
      return { data: { id: state.report.id, access_token: state.report.access_token }, error: null }
    }

    if (action === 'update') {
      ledger.push({ name: `${table}.update`, payload, filters })
      if (table === 'paid_reports' && state.report) Object.assign(state.report, payload)
      return { data: table === 'paid_reports' ? { id: state.report?.id } : null, error: null }
    }

    if (table === 'point_transactions' && action === 'insert') {
      ledger.push({ name: 'point_transactions.insert', payload })
      return { data: null, error: null }
    }

    return { data: null, error: null, count: null }
  }

  const from = (table) => {
    const query = { table, action: 'select', payload: null, filters: [] }
    const chain = {
      select() { return chain },
      insert(payload) { query.action = 'insert'; query.payload = payload; return chain },
      update(payload) { query.action = 'update'; query.payload = payload; return chain },
      eq(column, value) { query.filters.push({ op: 'eq', column, value }); return chain },
      gte(column, value) { query.filters.push({ op: 'gte', column, value }); return chain },
      lte(column, value) { query.filters.push({ op: 'lte', column, value }); return chain },
      in(column, value) { query.filters.push({ op: 'in', column, value }); return chain },
      order() { return chain },
      limit() { return chain },
      async single() { return execute(query) },
      async maybeSingle() { return execute(query) },
      then(resolve, reject) { return execute(query).then(resolve, reject) },
    }
    return chain
  }

  return {
    from,
    async rpc(name, args) {
      ledger.push({ name: `rpc:${name}`, args })
      if (name === 'consume_g15_checkout_consent_for_order') {
        const reportIds = state.draft.birth_data.report_ids
        const authority = state.draft.birth_data.consent_authority
        const selectedReportIdsHash = `sha256:${createHash('sha256')
          .update(JSON.stringify([...reportIds].sort()), 'utf8')
          .digest('hex')}`
        return {
          data: {
            outcome: 'consumed',
            reservation_id: args.p_reservation_id,
            selection_id: authority.selection_id,
            checkout_draft_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            selected_report_ids: reportIds,
            selected_report_ids_hash: selectedReportIdsHash,
            policy_version: authority.policy_version,
            purpose: authority.purpose,
            sharing_scope: authority.sharing_scope,
            selection_expires_at: authority.expires_at,
            accepted_at_by_report: authority.accepted_at_by_report,
            subject_user_ids_by_report: authority.subject_user_ids_by_report,
            consumed_at: '2026-08-14T00:01:00.000Z',
            stripe_session_id: args.p_stripe_session_id,
            report_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          },
          error: null,
        }
      }
      if (name === 'deduct_checkout_points_once') {
        if (checkoutRpcThrows) throw checkoutRpcThrows
        return { data: checkoutRpcData, error: checkoutRpcError }
      }
      if (name === 'deduct_points') return { data: deductPointsData, error: null }
      return { data: null, error: null }
    },
  }
}

function checkoutEvent(planCode, overrides = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_points_${planCode.toLowerCase()}`,
        amount_total: 7900,
        amount_subtotal: 8900,
        currency: 'usd',
        payment_status: 'paid',
        customer_email: 'checkout-owner@example.invalid',
        payment_intent: null,
        metadata: {
          plan_code: planCode,
          draft_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          locale: 'zh-TW',
          login_email: 'checkout-owner@example.invalid',
          login_user_id: '11111111-1111-4111-8111-111111111111',
          points_used: '10',
          points_user_id: '11111111-1111-4111-8111-111111111111',
          points_discount_usd: '10',
          ...(planCode === 'G15' ? {
            g15_consent_reservation_id: '77777777-7777-4777-8777-777777777777',
            g15_report_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          } : {}),
          ...overrides,
        },
      },
    },
  }
}

function webhookRequest() {
  return new Request('https://local.invalid/api/webhook/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'synthetic-signature' },
    body: '{}',
  })
}

process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-webhook-secret'
process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'
process.env.NEXT_PUBLIC_SITE_URL = 'https://jianyuan.life'
process.env.CRON_SECRET = 'synthetic-cron-secret'

globalThis.fetch = async (url) => {
  globalThis.__checkoutPointsLedger.push({ name: 'fetch', url: String(url) })
  return new Response('', { status: 200 })
}

const { POST } = await import('../app/api/webhook/stripe/route.ts')

test('C/G15 commits the idempotent checkout-points RPC before downstream external effects', async () => {
  for (const [planCode, status] of [['C', 'applied'], ['G15', 'already']]) {
    globalThis.__checkoutPointsLedger = []
    globalThis.__checkoutPointsEvent = checkoutEvent(planCode)
    globalThis.__checkoutPointsSupabase = createSupabaseDouble({
      checkoutRpcData: status === 'already'
        ? [{ status, balance_after: 37 }]
        : { status, balance_after: 37 },
    })

    const response = await POST(webhookRequest())
    assert.equal(response.status, 200, `${planCode}: ${await response.clone().text()}`)

    const names = globalThis.__checkoutPointsLedger.map((entry) => entry.name)
    const rpcIndex = names.indexOf('rpc:deduct_checkout_points_once')
    assert.notEqual(rpcIndex, -1, `${planCode} 必須呼叫新 RPC`)
    assert.equal(names.includes('rpc:deduct_points'), false, `${planCode} 不得再走舊 deduct_points`)
    assert.equal(names.includes('point_transactions.insert'), false, `${planCode} 不得在 route 分開寫流水`)

    for (const downstream of ['checkout_drafts.update', 'paid_reports.insert', 'recordRevenue', 'sendEmailWithRetry', 'trackFunnelServer', 'fetch']) {
      const downstreamIndex = names.indexOf(downstream)
      assert.notEqual(downstreamIndex, -1, `${planCode} applied 後應繼續 ${downstream}`)
      assert.ok(rpcIndex < downstreamIndex, `${planCode} 必須先 commit 點數 RPC，才可 ${downstream}`)
    }

    const rpc = globalThis.__checkoutPointsLedger[rpcIndex]
    assert.deepEqual(rpc.args, {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_amount: 10,
      p_reference_id: `cs_test_points_${planCode.toLowerCase()}`,
      p_description: `${planCode === 'C' ? '人生藍圖' : '家族藍圖'} 訂單折抵`,
      p_plan_code: planCode,
    })
  }
})

test('typed checkout-point refusals are CAS-quarantined and acknowledged without report side effects', async () => {
  for (const status of ['missing', 'insufficient', 'invalid']) {
    globalThis.__checkoutPointsLedger = []
    globalThis.__checkoutPointsEvent = checkoutEvent('C')
    globalThis.__checkoutPointsSupabase = createSupabaseDouble({
      checkoutRpcData: { status, balance_after: status === 'insufficient' ? 3 : null },
    })

    const response = await POST(webhookRequest())
    assert.equal(response.status, 200, status)
    assert.deepEqual(await response.json(), { received: true, manual_review: true })

    const ledger = globalThis.__checkoutPointsLedger
    const names = ledger.map((entry) => entry.name)
    assert.equal(names.includes('recordRevenue'), false, status)
    assert.equal(names.includes('sendEmailWithRetry'), false, status)
    assert.equal(names.includes('trackFunnelServer'), false, status)
    assert.equal(names.includes('fetch'), false, status)
    assert.equal(names.includes('rpc:deduct_points'), false, status)
    assert.equal(names.includes('point_transactions.insert'), false, status)

    const quarantine = ledger.find((entry) => (
      entry.name === 'paid_reports.update'
      && entry.payload?.status === 'needs_human_review'
    ))
    assert.ok(quarantine, `${status} 必須把報告 CAS 到 needs_human_review`)
    assert.deepEqual(quarantine.payload, {
      status: 'needs_human_review',
      error_message: 'Checkout points verification requires manual review',
    })
    assert.deepEqual(quarantine.filters, [
      { op: 'eq', column: 'id', value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { op: 'in', column: 'status', value: ['pending', 'generating'] },
    ])

    const warning = ledger.find((entry) => entry.name === 'notify')
    assert.ok(warning, `${status} 轉人工後必須告警 ops`)
    const serializedWarning = JSON.stringify(warning.args)
    assert.match(serializedWarning, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/u)
    assert.doesNotMatch(serializedWarning, /checkout-owner@example\.invalid/u)
    assert.doesNotMatch(serializedWarning, /11111111-1111-4111-8111-111111111111/u)
    assert.doesNotMatch(serializedWarning, /cs_test_points_c/u)
  }
})

test('a checkout-points database error returns 500 before report insertion or any downstream call', async () => {
  globalThis.__checkoutPointsLedger = []
  globalThis.__checkoutPointsEvent = checkoutEvent('G15')
  globalThis.__checkoutPointsSupabase = createSupabaseDouble({
    checkoutRpcData: null,
    checkoutRpcError: { code: '55P03', message: 'synthetic lock timeout' },
  })

  const response = await POST(webhookRequest())
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Checkout points transaction failed' })

  const names = globalThis.__checkoutPointsLedger.map((entry) => entry.name)
  assert.equal(names.filter((name) => name === 'rpc:deduct_checkout_points_once').length, 1)
  for (const forbidden of [
    'paid_reports.insert',
    'checkout_drafts.update',
    'recordRevenue',
    'sendEmailWithRetry',
    'trackFunnelServer',
    'fetch',
    'notify',
    'rpc:deduct_points',
    'point_transactions.insert',
  ]) {
    assert.equal(names.includes(forbidden), false, `DB error 前不得執行 ${forbidden}`)
  }
})

test('a thrown checkout-points transport error is converted to the same retryable 500 boundary', async () => {
  globalThis.__checkoutPointsLedger = []
  globalThis.__checkoutPointsEvent = checkoutEvent('C')
  globalThis.__checkoutPointsSupabase = createSupabaseDouble({
    checkoutRpcThrows: new Error('synthetic database transport failure'),
  })

  const response = await POST(webhookRequest())
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Checkout points transaction failed' })
  const names = globalThis.__checkoutPointsLedger.map((entry) => entry.name)
  assert.equal(names.filter((name) => name === 'rpc:deduct_checkout_points_once').length, 1)
  for (const forbidden of ['paid_reports.insert', 'checkout_drafts.update', 'recordRevenue', 'sendEmailWithRetry', 'fetch', 'notify']) {
    assert.equal(names.includes(forbidden), false, forbidden)
  }
})

test('E3 and every non-C/G15 plan keep the legacy deduct-then-ledger path at its existing time', async () => {
  const namesByPlan = {
    D: '心之所惑', R: '合否？', E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運',
  }

  for (const [planCode, planName] of Object.entries(namesByPlan)) {
    globalThis.__checkoutPointsLedger = []
    globalThis.__checkoutPointsEvent = checkoutEvent(planCode)
    globalThis.__checkoutPointsSupabase = createSupabaseDouble({ deductPointsData: 37 })

    const response = await POST(webhookRequest())
    assert.equal(response.status, 200, planCode)

    const ledger = globalThis.__checkoutPointsLedger
    const names = ledger.map((entry) => entry.name)
    assert.equal(names.includes('rpc:deduct_checkout_points_once'), false, planCode)
    assert.equal(names.filter((name) => name === 'rpc:deduct_points').length, 1, planCode)
    assert.equal(names.filter((name) => name === 'point_transactions.insert').length, 1, planCode)
    assert.ok(names.indexOf('fetch') < names.indexOf('rpc:deduct_points'), `${planCode} 舊扣點時序必須仍在 workflow 之後`)
    assert.ok(names.indexOf('rpc:deduct_points') < names.indexOf('point_transactions.insert'), planCode)

    const legacyRpc = ledger.find((entry) => entry.name === 'rpc:deduct_points')
    assert.deepEqual(legacyRpc.args, {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_amount: 10,
    })

    const legacyLedger = ledger.find((entry) => entry.name === 'point_transactions.insert')
    assert.deepEqual(legacyLedger.payload, {
      user_id: '11111111-1111-4111-8111-111111111111',
      type: 'use_checkout',
      amount: -10,
      balance_after: 37,
      description: `${planName} 訂單折抵`,
      reference_id: `cs_test_points_${planCode.toLowerCase()}`,
    })
  }
})

test('the legacy points block remains byte-equivalent to the pre-change production block', () => {
  const route = readFileSync(new URL('../app/api/webhook/stripe/route.ts', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n')
  const marker = '    // === 點數折抵扣除（付款成功才真正扣）— 原子操作版 ==='
  const start = route.indexOf(marker)
  assert.notEqual(start, -1)

  const legacyBlock = route.slice(start, start + 2742)
  assert.equal(
    createHash('sha256').update(legacyBlock, 'utf8').digest('hex'),
    'b054a2397b3fb91ffa2471813df68acd5719276de372c21b09ff196df2faa2bc',
  )
})

test('the migration isolates C/G15 idempotency without changing the shared point_transactions schema', () => {
  const migrationUrl = new URL('../supabase/migrations/20260813050200_deduct_checkout_points_once.sql', import.meta.url)
  assert.equal(existsSync(migrationUrl), true, 'migration 必須存在')
  const sql = readFileSync(migrationUrl, 'utf8')

  assert.match(sql, /^\s*BEGIN\s*;/iu, 'migration 必須由顯式 transaction 包住，postcondition 失敗時不可部分落地')
  assert.match(sql, /COMMIT\s*;\s*$/iu)
  assert.doesNotMatch(sql, /WITH\s+current_schema\s+AS/iu, 'current_schema 是 PostgreSQL 特殊語法，不可作未引用 CTE 名稱')
  assert.match(sql, /DO\s+\$checkout_points_owner_preflight\$/iu)
  assert.match(sql, /to_regclass\s*\(\s*'public\.user_points'\s*\)/iu)
  assert.match(sql, /to_regclass\s*\(\s*'public\.point_transactions'\s*\)/iu)
  assert.match(sql, /relowner\s*=\s*v_expected_owner_oid/iu)

  const snapshotIndex = sql.search(/CREATE\s+TEMP(?:ORARY)?\s+TABLE\s+[^\s]+point_transactions[^\s]*_before/iu)
  const dedicatedTableIndex = sql.search(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.cg15_checkout_point_dedupe/iu)
  const postconditionIndex = sql.search(/DO\s+\$point_transactions_schema_unchanged\$/iu)
  assert.ok(snapshotIndex >= 0 && snapshotIndex < dedicatedTableIndex, '共用 ledger schema 必須先做 migration 前快照')
  assert.ok(postconditionIndex > dedicatedTableIndex, 'migration 後必須逐項比對共用 ledger schema 快照')

  assert.match(
    sql,
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.cg15_checkout_point_dedupe[\s\S]*?amount\s+integer\s+NOT\s+NULL[\s\S]*?PRIMARY\s+KEY\s*\(\s*reference_id\s*\)/iu,
  )
  assert.doesNotMatch(sql, /CREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]*?ON\s+public\.point_transactions\b/iu)
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+public\.point_transactions\b/iu)
  assert.doesNotMatch(sql, /CREATE\s+(?:CONSTRAINT|TRIGGER|POLICY)[\s\S]*?ON\s+public\.point_transactions\b/iu)
  assert.match(sql, /pg_get_indexdef/iu)
  assert.match(sql, /pg_get_constraintdef/iu)
  assert.match(sql, /pg_get_triggerdef/iu)
  assert.match(sql, /FROM\s+pg_catalog\.pg_policy/iu)
  assert.match(sql, /EXCEPT/iu)
  assert.match(sql, /RAISE\s+EXCEPTION[\s\S]*?point_transactions[\s\S]*?schema/iu)
})

test('an existing dedicated table is accepted only after an exact replay preflight', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260813050200_deduct_checkout_points_once.sql', import.meta.url),
    'utf8',
  )

  const preflightStart = sql.search(/DO\s+\$cg15_dedupe_replay_preflight\$/iu)
  const createStart = sql.search(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.cg15_checkout_point_dedupe/iu)
  assert.ok(preflightStart >= 0 && preflightStart < createStart, '既有表 drift 檢查必須早於 IF NOT EXISTS')
  const preflight = sql.slice(preflightStart, createStart)
  assert.match(preflight, /v_table_oid\s+oid\s*:=\s*to_regclass\s*\(\s*'public\.cg15_checkout_point_dedupe'\s*\)[\s\S]*?IF\s+v_table_oid\s+IS\s+NULL/iu)
  assert.match(preflight, /information_schema\.columns/iu)
  assert.match(preflight, /pg_catalog\.pg_constraint/iu)
  assert.match(preflight, /pg_catalog\.pg_index/iu)
  assert.match(preflight, /pg_catalog\.pg_policy/iu)
  assert.match(preflight, /pg_catalog\.pg_trigger/iu)
  assert.match(preflight, /relrowsecurity/iu)
  assert.match(preflight, /relforcerowsecurity/iu)
  assert.match(preflight, /rolname\s*=\s*current_user/iu)
  assert.match(preflight, /rolsuper[\s\S]*?rolbypassrls|rolbypassrls[\s\S]*?rolsuper/iu)
  assert.match(preflight, /v_owner_oid\s*<>\s*v_expected_owner_oid/iu)
  assert.match(preflight, /collation_name\s+IS\s+NULL/iu)
  assert.ok((preflight.match(/is_identity\s*=\s*'NO'/giu) || []).length >= 6)
  assert.ok((preflight.match(/is_generated\s*=\s*'NEVER'/giu) || []).length >= 6)
  assert.match(preflight, /pg_catalog\.pg_depend/iu)
  assert.match(preflight, /relkind\s*=\s*'S'/iu)
  assert.match(preflight, /relpersistence\s*=\s*'p'/iu)
  assert.match(preflight, /reloptions\s+IS\s+NULL/iu)
  assert.match(preflight, /convalidated/iu)
  assert.match(preflight, /pg_get_indexdef[\s\S]*?cg15_checkout_point_dedupe_pkey/iu)
  assert.match(preflight, /polpermissive/iu)
  assert.match(preflight, /aclexplode/iu)
  assert.match(preflight, /RAISE\s+EXCEPTION[\s\S]*?dedupe[\s\S]*?drift/iu)
})

test('the dedicated C/G15 dedupe table and RPC are service-role only', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260813050200_deduct_checkout_points_once.sql', import.meta.url),
    'utf8',
  )

  const legacyDrop = sql.search(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.deduct_checkout_points_once\(uuid,\s*integer,\s*text,\s*text\)/iu)
  const exactDrop = sql.search(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.deduct_checkout_points_once\(uuid,\s*integer,\s*text,\s*text,\s*text\)/iu)
  const functionCreate = sql.search(/CREATE\s+FUNCTION\s+public\.deduct_checkout_points_once/iu)
  assert.ok(legacyDrop >= 0 && legacyDrop < exactDrop && exactDrop < functionCreate, '所有舊 overload/ACL 必須在 CREATE 前移除')
  assert.match(sql, /RETURNS\s+TABLE\s*\(\s*status\s+text\s*,\s*balance_after\s+integer\s*\)/iu)
  assert.match(sql, /SECURITY\s+DEFINER/iu)
  assert.match(sql, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public/iu)
  assert.match(sql, /SET\s+lock_timeout\s*=\s*'5s'/iu)
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    assert.match(
      sql,
      new RegExp(`REVOKE\\s+ALL[\\s\\S]*?deduct_checkout_points_once\\(uuid,\\s*integer,\\s*text,\\s*text,\\s*text\\)[\\s\\S]*?FROM\\s+${role}`, 'iu'),
    )
    assert.match(sql, new RegExp(`REVOKE\\s+ALL[\\s\\S]*?cg15_checkout_point_dedupe[\\s\\S]*?FROM\\s+${role}`, 'iu'))
  }
  assert.match(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deduct_checkout_points_once\(uuid,\s*integer,\s*text,\s*text,\s*text\)\s+TO\s+service_role/iu,
  )
  assert.match(sql, /ALTER\s+TABLE\s+public\.cg15_checkout_point_dedupe\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu)
  assert.match(sql, /ALTER\s+TABLE\s+public\.cg15_checkout_point_dedupe\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/iu)
  assert.match(sql, /CREATE\s+POLICY[\s\S]*?ON\s+public\.cg15_checkout_point_dedupe[\s\S]*?TO\s+service_role/iu)
  assert.match(sql, /aclexplode\s*\(/iu)
  assert.match(sql, /unexpected[\s\S]*?function[\s\S]*?privilege|function[\s\S]*?privilege[\s\S]*?unexpected/iu)
  assert.match(sql, /v_function_owner_oid\s*<>\s*v_expected_owner_oid/iu)
  assert.match(sql, /v_table_owner_oid\s*<>\s*v_expected_owner_oid/iu)
})

test('the RPC accepts only C/G15 and rolls balance, ledger, and dedicated dedupe back together on 23505', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260813050200_deduct_checkout_points_once.sql', import.meta.url),
    'utf8',
  )
  const functionStart = sql.indexOf('CREATE FUNCTION public.deduct_checkout_points_once')
  const functionEnd = sql.indexOf('REVOKE ALL ON FUNCTION', functionStart)
  const fn = sql.slice(functionStart, functionEnd)

  assert.match(fn, /p_amount\s+IS\s+NULL[\s\S]*?p_amount\s*<=\s*0/iu)
  assert.match(fn, /p_reference_id\s+IS\s+NULL[\s\S]*?btrim\(p_reference_id\)\s*=\s*''/iu)
  assert.match(fn, /p_plan_code\s+IS\s+NULL[\s\S]*?p_plan_code\s+NOT\s+IN\s*\(\s*'C'\s*,\s*'G15'\s*\)/iu)
  assert.match(fn, /RETURN\s+QUERY\s+SELECT\s+'invalid'::text/iu)

  const lockIndex = fn.search(/FROM\s+public\.user_points\s+AS\s+up[\s\S]*?FOR\s+UPDATE\s+OF\s+up/iu)
  const exactRecheckIndex = fn.search(/FROM\s+public\.cg15_checkout_point_dedupe\s+AS\s+dedupe[\s\S]*?dedupe\.reference_id\s*=\s*v_reference_id/iu)
  assert.ok(lockIndex >= 0 && lockIndex < exactRecheckIndex, '必須先鎖 user_points，再覆查 C/G15 專用 key')
  assert.doesNotMatch(fn, /SELECT[\s\S]{0,240}?FROM\s+public\.point_transactions\s+AS/iu)

  const missingIndex = fn.indexOf("RETURN QUERY SELECT 'missing'::text")
  const insufficientIndex = fn.indexOf("RETURN QUERY SELECT 'insufficient'::text")
  const updateIndex = fn.indexOf('UPDATE public.user_points AS up')
  const ledgerInsertIndex = fn.indexOf('INSERT INTO public.point_transactions')
  const dedupeInsertIndex = fn.indexOf('INSERT INTO public.cg15_checkout_point_dedupe')
  assert.ok(missingIndex >= 0 && missingIndex < updateIndex)
  assert.ok(insufficientIndex >= 0 && insufficientIndex < updateIndex)
  assert.ok(updateIndex < ledgerInsertIndex)
  assert.ok(ledgerInsertIndex < dedupeInsertIndex)

  const preexistingKeyCheck = fn.slice(exactRecheckIndex, updateIndex)
  assert.match(preexistingKeyCheck, /v_existing_user_id\s*<>\s*p_user_id/iu)
  assert.match(preexistingKeyCheck, /v_existing_plan_code\s*<>\s*p_plan_code/iu)
  assert.match(preexistingKeyCheck, /v_existing_amount\s*<>\s*p_amount/iu)
  assert.match(preexistingKeyCheck, /RETURN\s+QUERY\s+SELECT\s+'invalid'::text/iu)

  const subtransaction = fn.slice(fn.lastIndexOf('  BEGIN', updateIndex), fn.indexOf('\n  END;', dedupeInsertIndex) + 7)
  assert.match(subtransaction, /UPDATE\s+public\.user_points/iu)
  assert.match(subtransaction, /INSERT\s+INTO\s+public\.point_transactions/iu)
  assert.match(subtransaction, /INSERT\s+INTO\s+public\.cg15_checkout_point_dedupe/iu)
  assert.match(subtransaction, /VALUES\s*\(\s*v_reference_id\s*,\s*p_user_id\s*,\s*p_plan_code\s*,\s*p_amount\s*,\s*v_new_balance\s*\)/iu)
  assert.match(subtransaction, /GET\s+DIAGNOSTICS\s+v_row_count\s*=\s*ROW_COUNT/iu)
  assert.match(subtransaction, /IF\s+v_row_count\s*<>\s*1/iu)
  assert.match(subtransaction, /EXCEPTION\s+WHEN\s+SQLSTATE\s+'23505'/iu)

  const handler = subtransaction.slice(subtransaction.search(/WHEN\s+SQLSTATE\s+'23505'/iu))
  assert.match(handler, /FROM\s+public\.cg15_checkout_point_dedupe\s+AS\s+dedupe/iu)
  assert.match(handler, /dedupe\.reference_id\s*=\s*v_reference_id/iu)
  assert.match(handler, /v_existing_user_id\s*=\s*p_user_id/iu)
  assert.match(handler, /v_existing_plan_code\s*=\s*p_plan_code/iu)
  assert.match(handler, /v_existing_amount\s*=\s*p_amount/iu)
  assert.match(handler, /RETURN\s+QUERY\s+SELECT\s+'already'::text/iu)
  assert.match(fn, /RETURN\s+QUERY\s+SELECT\s+'applied'::text/iu)
})
