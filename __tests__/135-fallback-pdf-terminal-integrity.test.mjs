import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const REPORT_ID = '81818181-8181-4181-8181-818181818181'
const ACCESS_TOKEN = 'synthetic-access-token'
const PDF_BYTES = Buffer.from('%PDF-1.7\nsynthetic fallback PDF')

const state = {
  report: null,
  terminalBeforeCompletion: false,
  pdfResponse: null,
  uploads: [],
  removals: [],
  emails: [],
  updates: [],
  completionReceiptMode: 'normal',
}
globalThis.__fallbackPdfIntegrityState = state

function seed(overrides = {}) {
  state.report = {
    id: REPORT_ID,
    retry_count: 0,
    status: 'pending',
    deleted_at: null,
    birth_data: {
      name: '測試客戶',
      year: 1990,
      month: 1,
      day: 2,
      hour: 3,
      minute: 0,
      gender: 'F',
      locale: 'zh-TW',
    },
    plan_code: 'D',
    access_token: ACCESS_TOKEN,
    customer_email: 'customer@example.invalid',
    pdf_url: null,
    ...overrides,
  }
  state.terminalBeforeCompletion = false
  state.pdfResponse = Response.json({ pdf_base64: PDF_BYTES.toString('base64') })
  state.uploads.length = 0
  state.removals.length = 0
  state.emails.length = 0
  state.updates.length = 0
  state.completionReceiptMode = 'normal'
}

class PaidReportsQuery {
  constructor() {
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.selected = null
  }

  select(columns) {
    this.selected = columns
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  eq(column, value) {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ kind: 'in', column, values })
    return this
  }

  is(column, value) {
    this.filters.push({ kind: 'is', column, value })
    return this
  }

  matches(row) {
    return this.filters.every((filter) => {
      if (filter.kind === 'eq') return row?.[filter.column] === filter.value
      if (filter.kind === 'in') return filter.values.includes(row?.[filter.column])
      return row?.[filter.column] === filter.value
    })
  }

  async single() {
    return this.matches(state.report)
      ? { data: { ...state.report }, error: null }
      : { data: null, error: { message: 'not found' } }
  }

  execute() {
    if (this.operation !== 'update') {
      return { data: this.matches(state.report) ? [{ ...state.report }] : [], error: null }
    }

    if (this.payload?.status === 'completed' && state.terminalBeforeCompletion) {
      state.report.status = 'refunded'
      state.report.deleted_at = '2026-08-14T00:00:00.000Z'
    }

    state.updates.push({ payload: { ...this.payload }, filters: structuredClone(this.filters) })
    if (!this.matches(state.report)) return { data: [], error: null }
    Object.assign(state.report, this.payload)
    if (this.payload?.status === 'completed' && this.selected) {
      if (state.completionReceiptMode === 'null') return { data: null, error: null }
      if (state.completionReceiptMode === 'multiple') {
        return { data: [{ id: state.report.id }, { id: 'unexpected-row' }], error: null }
      }
    }
    const data = this.selected ? [{ id: state.report.id }] : null
    return { data, error: null }
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
  }
}

globalThis.__fallbackPdfIntegritySupabase = {
  from(table) {
    assert.equal(table, 'paid_reports')
    return new PaidReportsQuery()
  },
  storage: {
    from(bucket) {
      return {
        async upload(storagePath, bytes, options) {
          state.uploads.push({ bucket, storagePath, bytes: Buffer.from(bytes), options })
          return { data: { path: storagePath }, error: null }
        },
        async remove(paths) {
          state.removals.push({ bucket, paths })
          return { data: paths, error: null }
        },
        getPublicUrl(storagePath) {
          return { data: { publicUrl: `https://storage.example.invalid/${bucket}/${storagePath}` } }
        },
      }
    },
  },
}

const virtualModules = new Map([
  ['next/server', dataModule(`
    export class NextRequest extends Request {}
    export class NextResponse extends Response {
      static json(value, init = {}) {
        return new Response(JSON.stringify(value), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init.headers || {}) },
        })
      }
    }
  `)],
  ['@/lib/resend-helper', dataModule(`
    export async function sendEmailWithRetry(payload) {
      globalThis.__fallbackPdfIntegrityState.emails.push(payload)
      return { success: true, resendId: 'synthetic-email', attempts: 1 }
    }
  `)],
  ['@/lib/report/completion-email-delivery', dataModule(`
    export async function deliverClaimedCompletionEmail(_client, _reportId, payload, send) {
      const outcome = await send({ ...payload, idempotencyKey: 'synthetic-idempotency-key' })
      return { sent: outcome.success, reason: outcome.success ? 'ok' : 'failed', outcome }
    }
  `)],
  ['@/lib/unsubscribe', dataModule(`export function getUnsubscribeHtml() { return '' }`)],
  ['@/prompts/c_plan_v2', dataModule(`
    export const SYSTEM_GROUPS = []
    export const getAgeGroup = () => 'adult'
    export const buildCall1Prompt = () => ''
    export const buildCall2Prompt = () => ''
    export const buildCall3Prompt = () => ''
    export const buildUserPrompt = () => ''
    export const buildAppendix = () => ''
    export const extractCall1Summary = () => ''
    export const extractCall1And2Summary = () => ''
  `)],
  ['@/workflows/generate-report/steps', dataModule(`export const validateReportAgainstData = (content) => content`)],
  ['@/workflows/generate-report/v6-gate', dataModule(`export const v6CMachineWarnings = () => []`)],
  ['@/workflows/generate-report/extract-full-charts', dataModule(`export const extractFullCharts = () => ({})`)],
  ['@/lib/report/extract-narrative', dataModule(`export async function extractNarrativeFromContent() { return null }`)],
  ['@/lib/consultation/routes', dataModule(`export const buildAbsoluteReportUrl = (_site, _plan, token) => 'https://jianyuan.life/report/' + token`)],
  ['@/lib/ai-cost-tracker', dataModule(`export async function recordAIUsage() {}`)],
  ['@/lib/plan-names', dataModule(`
    export const PLAN_NAMES = { D: '心之所惑' }
    export const isChumenjiPlan = () => false
  `)],
  ['@/workflows/generate-report/plan-prompts', dataModule(`export const PLAN_SYSTEM_PROMPT = { C: 'system', D: 'system' }`)],
  ['@/prompts/c_plan_v4', dataModule(`export const buildSingleCallV4C = () => 'system'`)],
  ['@/prompts/g15_plan_v4', dataModule(`export const buildSingleCallV4G15 = () => 'system'`)],
  ['@/prompts/c_plan_v6', dataModule(`export const buildSingleCallV6C = () => 'system'`)],
  ['@/lib/plan-flags', dataModule(`export const isV4 = () => false; export const isV6 = () => false`)],
  ['@/lib/ai/observability/telegram', dataModule(`export async function notifyModelDowngrade() {}; export async function notify() {}`)],
  ['@/lib/supabase', dataModule(`export const createServiceClient = () => globalThis.__fallbackPdfIntegritySupabase`)],
  ['@/lib/consultation/fallback-policy', dataModule(`export const consultationFallbackDecision = (plan) => ({ mode: 'fallback_allowed', plan })`)],
  ['@/lib/consultation/relationship-context', dataModule(`export const buildConsultationRelationshipPrompt = () => ''`)],
  ['@/lib/consultation/legacy-calculator-safety', dataModule(`export function assertNoLegacyCalculatorFailureMarkers() {}`)],
  ['@/lib/consultation/calculator-request', dataModule(`
    export const GENERATE_PDF_PATH = '/api/generate-pdf'
    export const LEGACY_CALCULATE_PATH = '/api/calculate'
  `)],
  ['@/lib/consultation/calculator-request-auth.server', dataModule(`
    export function createSignedCalculatorPost({ payload }) {
      return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
    }
  `)],
  ['@/lib/security/operational-telemetry', dataModule(`
    export const operationalErrorClass = () => 'SyntheticError'
    export const operationalFailureCode = () => 'SYNTHETIC_FAILURE'
    export const operationalFingerprint = () => 'synthetic-fingerprint'
  `)],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      const fullPath = path.join(root, specifier.slice(2))
      for (const candidate of [`${fullPath}.ts`, `${fullPath}.tsx`, path.join(fullPath, 'index.ts')]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

process.env.CRON_SECRET = 'synthetic-cron-secret'
process.env.CLAUDE_API_KEY = 'synthetic-claude-key'
process.env.NEXT_PUBLIC_API_URL = 'https://calculator.example.invalid'

const { POST } = await import('../app/api/generate-report/route.ts')

function request() {
  return new Request('https://jianyuan.life/api/generate-report', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': process.env.CRON_SECRET,
    },
    body: JSON.stringify({ reportId: REPORT_ID }),
  })
}

function claudeResponse() {
  const event = JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: '這是一份完整而且只使用合成資料的測試報告。' },
  })
  return new Response(`data: ${event}\n\ndata: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

function installFetch() {
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.endsWith('/api/calculate')) {
      return Response.json({ client_data: {}, analyses: [] })
    }
    if (target === 'https://api.anthropic.com/v1/messages') return claudeResponse()
    if (target.endsWith('/api/generate-pdf')) return state.pdfResponse
    throw new Error(`unexpected fetch ${target}`)
  }
}

test('a terminal transition that wins completion CAS is never revived and never emailed', async () => {
  seed()
  state.terminalBeforeCompletion = true
  installFetch()

  const response = await POST(request())

  assert.equal(response.status, 409)
  assert.equal(state.report.status, 'refunded')
  assert.equal(state.report.deleted_at, '2026-08-14T00:00:00.000Z')
  assert.equal(state.emails.length, 0)
  assert.equal(state.uploads.length, 1)
  assert.match(
    state.uploads[0].storagePath,
    new RegExp(`^${REPORT_ID}/generations/[0-9a-f-]{36}\\.pdf$`, 'u'),
  )
  assert.deepEqual(state.removals, [{
    bucket: 'reports',
    paths: [state.uploads[0].storagePath],
  }])
})

test('an invalid completion receipt never deletes a PDF that may already be committed', async () => {
  seed()
  state.completionReceiptMode = 'null'
  installFetch()

  const response = await POST(request())

  assert.equal(response.status, 503)
  assert.equal(state.report.status, 'completed')
  assert.equal(state.uploads.length, 1)
  assert.equal(
    state.report.pdf_url,
    `https://storage.example.invalid/reports/${state.uploads[0].storagePath}`,
  )
  assert.deepEqual(state.removals, [])
  assert.equal(state.emails.length, 0)
})

test('invalid, oversized, and non-canonical fallback PDF responses never reach storage', async (t) => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1)
  oversized.write('%PDF-', 0, 'ascii')
  const validPdfBase64 = PDF_BYTES.toString('base64')
  const cases = [
    {
      name: 'canonical base64 containing non-PDF bytes',
      pdfBase64: Buffer.from('not a PDF payload').toString('base64'),
    },
    {
      name: 'PDF bytes larger than 5 MiB',
      pdfBase64: oversized.toString('base64'),
    },
    {
      name: 'base64 with trailing whitespace',
      pdfBase64: `${validPdfBase64}\n`,
    },
  ]

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      seed()
      state.pdfResponse = Response.json({ pdf_base64: candidate.pdfBase64 })
      installFetch()

      const response = await POST(request())

      assert.equal(response.status, 200)
      assert.equal(state.report.status, 'completed')
      assert.equal(state.report.pdf_url, null)
      assert.equal(state.uploads.length, 0)
    })
  }
})
