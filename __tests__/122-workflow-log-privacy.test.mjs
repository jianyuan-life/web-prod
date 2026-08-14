import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stepsPath = path.join(root, 'workflows', 'generate-report', 'steps.ts')

const routeState = {
  statusResult: { data: { status: 'pending' }, error: null },
  startCalls: [],
  startError: null,
}
globalThis.__workflowPrivacyRouteState = routeState
globalThis.__workflowPrivacyUseStepsSupabase = false
process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)

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
  ['workflow/api', `
    export async function start(_workflow, args) {
      globalThis.__workflowPrivacyRouteState.startCalls.push(args)
      if (globalThis.__workflowPrivacyRouteState.startError) {
        throw globalThis.__workflowPrivacyRouteState.startError
      }
      return { runId: 'synthetic-run-id' }
    }
  `],
  ['@/workflows/generate-report', `export async function generateReportWorkflow() {}`],
  ['@/lib/checkout/g15-consent-order.server', `
    export async function verifyG15ConsumedOrderBinding() { return true }
  `],
  ['@/lib/supabase', `
    export function createServiceClient() {
      if (globalThis.__workflowPrivacyUseStepsSupabase) {
        return globalThis.__workflowPrivacyStepsSupabase
      }
      return {
        from() {
          return {
            select() { return this },
            eq() { return this },
            async single() { return globalThis.__workflowPrivacyRouteState.statusResult },
          }
        },
      }
    }
  `],
  ['@/lib/security/operational-telemetry', `
    export function escapeHtmlText(value) { return String(value ?? '') }
    export function operationalErrorClass(value) {
      return value instanceof Error ? value.name : 'UnknownError'
    }
    export function operationalFailureCode(value) {
      const stage = String(value ?? '').split(':', 1)[0]
      return new Set([
        'LOAD_REPORT_RECORD_FAILED',
        'PDF_GENERATION_FAILED',
      ]).has(stage) ? stage : operationalErrorClass(value)
    }
    export function operationalFingerprint() {
      return process.env.TELEMETRY_FINGERPRINT_SECRET
        ? 'test:0123456789abcdef0123456789abcdef'
        : 'unavailable'
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

const { POST } = await import('../app/api/workflows/generate-report/route.ts')

function authorizedRequest(reportId = 'private-report-id') {
  return {
    headers: new Headers({ 'x-internal-secret': 'cron-secret' }),
    json: async () => ({ reportId }),
  }
}

test('workflow trigger fails closed when the status lookup errors or the report is missing', async (t) => {
  process.env.CRON_SECRET = 'cron-secret'

  await t.test('database error', async () => {
    routeState.startCalls.length = 0
    routeState.statusResult = {
      data: null,
      error: new Error('private database detail customer@example.invalid'),
    }
    const response = await POST(authorizedRequest())
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'WORKFLOW_STATUS_UNAVAILABLE' })
    assert.equal(routeState.startCalls.length, 0)
  })

  await t.test('missing report', async () => {
    routeState.startCalls.length = 0
    routeState.statusResult = { data: null, error: null }
    const response = await POST(authorizedRequest())
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'REPORT_NOT_FOUND' })
    assert.equal(routeState.startCalls.length, 0)
  })
})

test('workflow trigger success returns only the public run contract and never echoes reportId', async () => {
  process.env.CRON_SECRET = 'cron-secret'
  routeState.startCalls.length = 0
  routeState.startError = null
  routeState.statusResult = { data: { status: 'pending' }, error: null }

  const response = await POST(authorizedRequest('private-report-id-success'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, runId: 'synthetic-run-id' })
  assert.deepEqual(routeState.startCalls, [['private-report-id-success']])
})

test('workflow trigger returns a fixed start failure without echoing provider details', async () => {
  process.env.CRON_SECRET = 'cron-secret'
  routeState.statusResult = { data: { status: 'failed' }, error: null }
  routeState.startError = new Error('private workflow provider detail customer@example.invalid')
  try {
    const { value: response, entries } = await captureConsole(() => POST(authorizedRequest('private-start-report-id')))
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'WORKFLOW_START_FAILED' })
    const output = serializedRuntimeOutput(entries)
    assert.doesNotMatch(output, /private workflow provider detail|customer@example\.invalid|private-start-report-id/u)
  } finally {
    routeState.startError = null
  }
})

test('workflow trigger omits unavailable fingerprints when the HMAC secret is missing', async () => {
  const previousSecret = process.env.TELEMETRY_FINGERPRINT_SECRET
  delete process.env.TELEMETRY_FINGERPRINT_SECRET
  process.env.CRON_SECRET = 'cron-secret'
  routeState.statusResult = { data: { status: 'pending' }, error: null }
  try {
    const { entries } = await captureConsole(() => POST(authorizedRequest('keyless-private-report-id')))
    const output = serializedRuntimeOutput(entries)
    assert.doesNotMatch(output, /keyless-private-report-id|unavailable|reportFingerprint/u)
  } finally {
    process.env.TELEMETRY_FINGERPRINT_SECRET = previousSecret
  }
})

const stepState = {
  row: null,
  emailCalls: [],
  aiUsageCalls: [],
  telegramCalls: [],
}

class StepQuery {
  constructor() {
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.returning = false
  }

  select() { if (this.operation === 'update') this.returning = true; return this }
  update(payload) { this.operation = 'update'; this.payload = payload; return this }
  eq(column, value) { this.filters.push((row) => row?.[column] === value); return this }
  in(column, values) { this.filters.push((row) => values.includes(row?.[column])); return this }
  gt() { return this }
  execute() {
    if (this.operation === 'update') {
      if (stepState.row && this.filters.every((filter) => filter(stepState.row))) {
        Object.assign(stepState.row, this.payload)
        return { data: this.returning ? [{ ...stepState.row }] : null, error: null }
      }
      return { data: this.returning ? [] : null, error: null }
    }
    return { data: stepState.row, error: null, count: 0 }
  }
  async single() { return this.execute() }
  async maybeSingle() { return this.execute() }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject) }
}

globalThis.__workflowPrivacyStepsSupabase = {
  from() { return new StepQuery() },
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
modules.set('@/lib/consultation/calculator-request', `
  export const CHUMENJI_TOP_PATH = '/api/chumenji-top'
  export const GENERATE_PDF_PATH = '/api/generate-pdf'
  export const LEGACY_CALCULATE_PATH = '/api/calculate'
  export const CONSULTATION_CALCULATE_PATH = '/api/v1/consultation/calculate'
  export function buildCalculatorRequestPayload(value) { return value }
  export function serializeCalculatorRequest(value) { return JSON.stringify(value) }
`)
modules.set('@/lib/consultation/calculator-request-auth.server', `
  export function createSignedCalculatorPost({ payload }) {
    return { headers: {}, body: JSON.stringify(payload) }
  }
`)
modules.set('@/lib/resend-helper', `
  export async function sendEmailWithRetry(input) {
    globalThis.__workflowPrivacyStepState.emailCalls.push(input)
    return { success: true, attempts: 1, resendId: 'synthetic' }
  }
`)
modules.set('@/lib/ai-cost-tracker', `
  export function estimateCostUsd() { return 0 }
  export async function recordAIUsage(input) {
    globalThis.__workflowPrivacyStepState.aiUsageCalls.push(input)
  }
`)
globalThis.__workflowPrivacyStepState = stepState
modules.set('@/lib/ai/observability/telegram', `
  export async function notifyEmailFailed() {}
  export async function notifyNeedsHumanReview() {}
  export async function notifyFailed(...args) {
    globalThis.__workflowPrivacyStepState.telegramCalls.push({ kind: 'failed', args })
  }
  export async function notifyWorkflowFailed(...args) {
    globalThis.__workflowPrivacyStepState.telegramCalls.push({ kind: 'workflow-failed', args })
  }
`)
modules.set('@/lib/ai/observability/sentry-prod', `export async function captureMessage() {}`)
modules.set('@/lib/report/apology-email', `
  export async function hasApologyBeenSent() { return false }
  export function buildApologyEmail() { return { from: '', subject: '', html: '' } }
`)
modules.set('@/lib/plan-names', `
  export const PLAN_NAMES = { C: '人生藍圖', G15: '家族藍圖', E3: '月度精選' }
  export const ALL_PLAN_CODES = ['C', 'G15', 'E3']
  export function isChumenjiPlan(value) { return String(value).startsWith('E') }
`)
modules.set('@/prompts/c_plan_v6', `export const V6_BODY_TERM_BLACKLIST = []`)

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
    const bindings = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings
      : null
    if (bindings) {
      for (const element of bindings.elements) {
        entry.names.add(element.propertyName?.text ?? element.name.text)
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        entry.names.add(element.propertyName?.text ?? element.name.text)
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

registerInertImports(stepsPath)
delete process.env.DEEPSEEK_API_KEY
const {
  callChumenjiTop,
  callPythonCalculate,
  cleanFinalReport,
  aiGenerateConsultationChapter,
  markReportFailed,
  validateReportAgainstData,
} = await import('../workflows/generate-report/steps.ts')

async function captureConsole(action) {
  const methods = ['log', 'info', 'warn', 'error']
  const originals = Object.fromEntries(methods.map((name) => [name, console[name]]))
  const entries = []
  for (const name of methods) {
    console[name] = (...args) => entries.push({ name, args })
  }
  try {
    return { value: await action(), entries }
  } finally {
    for (const name of methods) console[name] = originals[name]
  }
}

function serializedRuntimeOutput(entries, thrown = []) {
  return JSON.stringify({ entries, thrown }, (_key, value) => {
    if (value instanceof Error) return { name: value.name, message: value.message }
    return value
  })
}

test('workflow runtime logs and propagated provider failures contain no report, customer or provider-response data', async () => {
  globalThis.__workflowPrivacyUseStepsSupabase = true
  const privateReportId = 'private-report-id-runtime'
  const privateError = 'LOAD_REPORT_RECORD_FAILED:private-error customer@example.invalid sk_live_private'
  const privateExpected = '甲子'
  const privateFound = '乙丑'
  const privateTitle = 'private-title-customer@example.invalid'
  const providerBody = 'provider-private-body customer@example.invalid'
  const networkMessage = 'network-private-message customer@example.invalid'
  const thrown = []
  stepState.row = {
    id: privateReportId,
    status: 'generating',
    customer_email: 'customer@example.invalid',
    plan_code: 'C',
    retry_count: 1,
    birth_data: { locale: 'zh-TW' },
  }
  stepState.telegramCalls.length = 0

  const originalFetch = globalThis.fetch
  let fetchMode = 'provider-error'
  globalThis.fetch = async () => {
    if (fetchMode === 'network-error') throw new Error(networkMessage)
    return new Response(providerBody, { status: 502 })
  }

  try {
    const { entries } = await captureConsole(async () => {
      const corrected = validateReportAgainstData(
        `年柱：${privateFound}`,
        { client_data: { bazi: `${privateExpected} 丙寅 丁卯 戊辰` }, analyses: [] },
        { name: 'customer@example.invalid', year: 1990, month: 1, day: 1, hour: 12, gender: 'F' },
      )
      assert.match(corrected, new RegExp(privateExpected, 'u'))

      cleanFinalReport(`## ${privateTitle}\n內容\n## ${privateTitle}\n其他內容`)

      try {
        await callPythonCalculate({ name: 'customer@example.invalid', year: 1990, month: 1, day: 1, hour: 12, gender: 'F' })
      } catch (error) {
        thrown.push(error)
      }

      await callChumenjiTop('E3', {
        name: 'customer@example.invalid',
        year: 1990,
        month: 1,
        day: 1,
        hour: 12,
        gender: 'F',
        customer_note: 'private customer fact customer@example.invalid',
      })

      fetchMode = 'network-error'
      try {
        await callPythonCalculate({ name: 'customer@example.invalid', year: 1990, month: 1, day: 1, hour: 12, gender: 'F' })
      } catch (error) {
        thrown.push(error)
      }

      await markReportFailed(privateReportId, privateError)
    })

    const output = serializedRuntimeOutput(entries, thrown)
    for (const privateValue of [
      privateReportId,
      privateError,
      privateExpected,
      privateFound,
      privateTitle,
      providerBody,
      networkMessage,
      'customer@example.invalid',
      'sk_live_private',
    ]) {
      assert.equal(output.includes(privateValue), false, `runtime output leaked ${privateValue}`)
    }
    assert.match(output, /test:0123456789abcdef0123456789abcdef/u)
    assert.match(output, /LOAD_REPORT_RECORD_FAILED/u)
    assert.equal(stepState.row.error_message, 'LOAD_REPORT_RECORD_FAILED')
    assert.deepEqual(stepState.telegramCalls, [{
      kind: 'failed',
      args: [privateReportId, 'LOAD_REPORT_RECORD_FAILED'],
    }])
    assert.equal(JSON.stringify(stepState.telegramCalls).includes('private-error'), false)
    assert.equal(thrown.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.__workflowPrivacyUseStepsSupabase = false
  }
})

test('recordAIUsage receives only a categorized stage and optional HMAC report fingerprint', async () => {
  const privateReportId = 'private-ai-cost-report-id'
  const previousKeys = {}
  for (let index = 1; index <= 20; index += 1) {
    const name = index === 1 ? 'CLAUDE_API_KEY' : `CLAUDE_API_KEY_${index}`
    previousKeys[name] = process.env[name]
    delete process.env[name]
  }
  stepState.aiUsageCalls.length = 0

  try {
    await assert.rejects(
      aiGenerateConsultationChapter(
        'system',
        'user',
        'C',
        'private-topic-customer@example.invalid',
        privateReportId,
        1000,
      ),
    )
    assert.equal(stepState.aiUsageCalls.length, 1)
    const usage = stepState.aiUsageCalls[0]
    assert.equal(usage.reportId, null)
    assert.equal(usage.callStage, 'consultation_v1_chapter')
    assert.equal(usage.errorMessage, 'missing CLAUDE_API_KEY')
    assert.match(usage.metadata.reportFingerprint, /^test:[0-9a-f]{32}$/u)
    const serialized = JSON.stringify(usage)
    assert.doesNotMatch(serialized, /private-ai-cost-report-id|private-topic|customer@example\.invalid/u)

    delete process.env.TELEMETRY_FINGERPRINT_SECRET
    stepState.aiUsageCalls.length = 0
    await assert.rejects(
      aiGenerateConsultationChapter('system', 'user', 'G15', 'private-topic', privateReportId, 1000),
    )
    assert.equal(stepState.aiUsageCalls[0].reportId, null)
    assert.deepEqual(stepState.aiUsageCalls[0].metadata, {})
    assert.doesNotMatch(JSON.stringify(stepState.aiUsageCalls[0]), /unavailable|private-ai-cost-report-id/u)
  } finally {
    process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)
    for (const [name, value] of Object.entries(previousKeys)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('every workflow source path blocks raw identifiers, provider bodies and exception objects at telemetry boundaries', () => {
  const steps = readFileSync(stepsPath, 'utf8')
  const route = readFileSync(path.join(root, 'app', 'api', 'workflows', 'generate-report', 'route.ts'), 'utf8')

  for (const source of [steps, route]) {
    assert.doesNotMatch(source, /const\s+errText\b|await\s+[^\n;]*\.text\(\)/u)
    // `throw err` is allowed only for the guarded, already-sanitized
    // RetryableError/FatalError path above. Other raw catch variables must never
    // cross the workflow boundary.
    assert.doesNotMatch(source, /^\s*throw\s+(?:e|error|sendErr|tgErr|updErr)\b/gmu)
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*\$\{(?:reportId|errorMessage)\}/u)
    assert.doesNotMatch(
      source,
      /console\.(?:warn|error)\([^\n]*,\s*(?:e|err|error|tgErr|updErr|transitionError|uploadErr)\b/u,
    )
  }

  assert.doesNotMatch(route, /runId:\s*run\.runId,\s*reportId/u)
  const usageCallCount = (steps.match(/recordAIUsage\(\{/gu) || []).length
  const protectedIdentityCount = (steps.match(/\.\.\.aiUsageIdentity\(reportId\)(?!\.)/gu) || []).length
  assert.equal(usageCallCount, 6)
  assert.equal(protectedIdentityCount, usageCallCount)
  assert.doesNotMatch(steps, /callStage:\s*label\b/u)
  assert.doesNotMatch(steps, /errorMessage:\s*(?:e|err|error)\s+instanceof\s+Error/u)
})

test('paid-report orchestrators expose only classified or fingerprinted operational telemetry', () => {
  const orchestrators = [
    readFileSync(path.join(root, 'workflows', 'generate-report', 'index.ts'), 'utf8'),
    readFileSync(path.join(root, 'app', 'api', 'generate-report', 'route.ts'), 'utf8'),
  ]

  for (const source of orchestrators) {
    const sourceFile = ts.createSourceFile('orchestrator.ts', source, ts.ScriptTarget.Latest, true)
    const consoleCalls = []
    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(sourceFile) === 'console'
      ) {
        consoleCalls.push(node.getText(sourceFile))
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    assert.doesNotMatch(
      source,
      /console\.(?:log|info|warn|error)\([^\n]*(?:\$\{(?:reportId|customerEmail|errorMessage)|,\s*(?:reportId|customerEmail|birthData|errorMessage)\b|reportContent(?!\.length)|\.message|\.text\(\))/u,
    )
    assert.doesNotMatch(
      source,
      /console\.(?:warn|error)\([^\n]*,\s*(?:e|err|error|emailErr|fcErr|markErr|nErr|pdfErr|ragErr|retryErr|sonnetE|step4Err|teamErr|telErr|telegramErr|uploadErr)\b/u,
    )
    for (const call of consoleCalls) {
      assert.doesNotMatch(call, /\breportId\s*,\s*planCode\b/u)
      assert.doesNotMatch(call, /\bcustomerEmail\b|\bbirthData\b|\berrorMessage\b/u)
      assert.doesNotMatch(call, /await\s+[^;]*\.text\(\)/u)
    }
    for (const usageCall of source.matchAll(/recordAIUsage\(\{([\s\S]*?)\}\)/gu)) {
      assert.doesNotMatch(usageCall[1], /reportId:\s*(?:reportId|tracking\?\.reportId)\b/u)
    }
    assert.doesNotMatch(source, /errorMessage:\s*(?:e|err|error)\s+instanceof\s+Error/u)
    assert.doesNotMatch(source, /captureMessage\([^\n]*(?:errorMessage|reportId|customerEmail|clientName)/u)
  }
})

test('fallback report endpoint cannot call unapproved customer-data model providers', () => {
  const source = readFileSync(path.join(root, 'app', 'api', 'generate-report', 'route.ts'), 'utf8')

  assert.doesNotMatch(source, /deepseek|kimi/iu)
  assert.doesNotMatch(source, /api\.deepseek\.com|DEEPSEEK_API_KEY|deepseek-chat/iu)
})
