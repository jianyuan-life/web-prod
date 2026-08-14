import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const state = {
  resendCalls: [],
  emailLogs: [],
  claim: null,
  finalizeMode: 'normal',
  report: {
    id: '71717171-7171-4171-8171-717171717171',
    status: 'completed',
    customer_email: 'customer@example.invalid',
    email_sent_at: null,
    plan_code: 'C',
    access_token: 'synthetic-access-token',
    birth_data: { locale: 'zh-TW' },
    created_at: '2026-08-12T00:00:00.000Z',
    generation_progress: { progress_updated_at: '2026-08-12T00:01:00.000Z' },
  },
}
globalThis.__completionEmailIdempotencyState = state

class QueryDouble {
  constructor(table) {
    this.table = table
    this.operation = 'select'
    this.payload = null
  }

  select() { return this }
  eq() { return this }
  is() { return this }
  in() { return this }
  limit() { return this }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  async single() {
    assert.equal(this.table, 'paid_reports')
    return { data: { ...state.report }, error: null }
  }

  then(resolve, reject) {
    let result
    if (this.table === 'email_send_log') {
      result = { data: [], error: null }
    } else if (this.table === 'paid_reports' && this.operation === 'update') {
      Object.assign(state.report, this.payload)
      result = { data: null, error: null }
    } else {
      result = { data: [{ ...state.report }], error: null }
    }
    return Promise.resolve(result).then(resolve, reject)
  }
}

globalThis.__completionEmailIdempotencySupabase = {
  from(table) { return new QueryDouble(table) },
  async rpc(name, params) {
    if (name === 'claim_report_completion_email') {
      if (state.report.status !== 'completed' || state.report.deleted_at || state.report.email_sent_at) {
        return { data: [{ outcome: 'terminal_state', claim_status: state.claim?.status ?? null }], error: null }
      }
      if (state.claim) {
        const samePayload = state.claim.payloadSha256 === params.p_payload_sha256
          && state.claim.providerKey === params.p_provider_idempotency_key
        return {
          data: [{
            outcome: samePayload ? `already_${state.claim.status}` : 'payload_conflict',
            claim_status: state.claim.status,
          }],
          error: null,
        }
      }
      state.claim = {
        status: 'claimed',
        payloadSha256: params.p_payload_sha256,
        providerKey: params.p_provider_idempotency_key,
      }
      return { data: [{ outcome: 'claimed', claim_status: 'claimed' }], error: null }
    }

    if (name === 'finalize_report_completion_email') {
      if (state.finalizeMode === 'transport-error') {
        return { data: null, error: { message: 'synthetic response loss' } }
      }
      if (!state.claim || state.claim.status !== 'claimed') {
        return { data: [{ outcome: state.claim?.status ?? 'missing_claim', claim_status: state.claim?.status ?? null }], error: null }
      }
      state.claim.status = 'sent'
      state.report.email_sent_at = '2026-08-14T00:00:00.000Z'
      return { data: [{ outcome: 'sent', claim_status: 'sent' }], error: null }
    }

    if (name === 'mark_report_completion_email_needs_manual') {
      if (state.claim?.status === 'claimed') state.claim.status = 'needs_manual'
      return { data: [{ outcome: state.claim?.status ?? 'missing_claim', claim_status: state.claim?.status ?? null }], error: null }
    }

    throw new Error(`unexpected rpc: ${name}`)
  },
}

const virtualModules = new Map([
  ['resend', dataModule(`
    export class Resend {
      constructor() {
        this.emails = {
          async send(payload, options) {
            const calls = globalThis.__completionEmailIdempotencyState.resendCalls
            calls.push({ payload, options })
            return { data: { id: 'synthetic-resend-' + calls.length }, error: null }
          },
        }
      }
    }
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() {
      return globalThis.__completionEmailIdempotencySupabase
    }
  `)],
  ['@/lib/unsubscribe', dataModule(`
    export function getUnsubscribeHtml() { return '' }
  `)],
  ['@/lib/plan-names', dataModule(`
    export const PLAN_NAMES = { C: '人生藍圖' }
  `)],
  ['@/lib/consultation/routes', dataModule(`
    export function buildAbsoluteReportUrl(siteUrl, _planCode, token) {
      return siteUrl.replace(/\\/+$/u, '') + '/report/' + token
    }
  `)],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }

    if (specifier === './email-send-log' && context.parentURL?.endsWith('/lib/resend-helper.ts')) {
      return {
        url: dataModule(`
          export async function recordEmailSend(input) {
            globalThis.__completionEmailIdempotencyState.emailLogs.push(input)
          }
        `),
        shortCircuit: true,
      }
    }

    if (specifier.startsWith('@/')) {
      const fullPath = path.join(root, specifier.slice(2))
      for (const candidate of [`${fullPath}.ts`, `${fullPath}.tsx`, path.join(fullPath, 'index.ts')]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { sendEmailWithRetry } = await import('../lib/resend-helper.ts')
const { sendCompletionEmailIfMissing } = await import('../lib/report/completion-fallback-email.ts')

test('sendEmailWithRetry forwards the caller idempotency key to the Resend SDK request options', async () => {
  state.resendCalls.length = 0
  const idempotencyKey = 'report-completed/71717171-7171-4171-8171-717171717171'

  const outcome = await sendEmailWithRetry({
    from: '鑒源命理 <reports@jianyuan.life>',
    to: 'customer@example.invalid',
    subject: 'synthetic subject',
    html: '<p>synthetic body</p>',
    emailType: 'report_ready',
    reportId: state.report.id,
    idempotencyKey,
  })

  assert.equal(outcome.success, true)
  assert.equal(state.resendCalls.length, 1)
  assert.deepEqual(state.resendCalls[0].options, { idempotencyKey })
})

test('two concurrent fallback workers share one durable DB claim and only the winner sends', async () => {
  state.resendCalls.length = 0
  state.emailLogs.length = 0
  state.claim = null
  state.finalizeMode = 'normal'
  state.report.email_sent_at = null
  state.report.deleted_at = null
  process.env.NEXT_PUBLIC_SITE_URL = 'https://jianyuan.life'

  const results = await Promise.all([
    sendCompletionEmailIfMissing(state.report.id, 'worker-a'),
    sendCompletionEmailIfMissing(state.report.id, 'worker-b'),
  ])

  assert.equal(results.filter((result) => result.sent).length, 1)
  assert.equal(state.resendCalls.length, 1)
  assert.equal(state.claim.status, 'sent')
  const keys = state.resendCalls.map((call) => call.options?.idempotencyKey)
  assert.deepEqual(keys, [`report-completed/${state.report.id}`])
})

test('a lost finalize response fences the claim for manual reconciliation and never auto-resends', async () => {
  state.resendCalls.length = 0
  state.emailLogs.length = 0
  state.claim = null
  state.finalizeMode = 'transport-error'
  state.report.status = 'completed'
  state.report.deleted_at = null
  state.report.email_sent_at = null

  const first = await sendCompletionEmailIfMissing(state.report.id, 'worker-finalize-loss')
  assert.equal(first.sent, false)
  assert.equal(first.reason, 'provider-sent-finalize-needs-manual')
  assert.equal(state.resendCalls.length, 1)
  assert.equal(state.claim.status, 'needs_manual')

  state.finalizeMode = 'normal'
  const replay = await sendCompletionEmailIfMissing(state.report.id, 'worker-replay')
  assert.equal(replay.sent, false)
  assert.equal(replay.reason, 'claim-already_needs_manual')
  assert.equal(state.resendCalls.length, 1)
})
