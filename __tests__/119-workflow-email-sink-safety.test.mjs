import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stepsPath = path.join(root, 'workflows', 'generate-report', 'steps.ts')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const state = {
  emails: [],
  unsubscribeUrl: 'https://attacker.invalid/unsubscribe?email=private@example.invalid',
  row: null,
}
globalThis.__workflowEmailSinkState = state

class EmailSinkQuery {
  constructor() {
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.returning = false
  }

  select() {
    if (this.operation === 'update') this.returning = true
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  eq(column, value) {
    this.filters.push((row) => row?.[column] === value)
    return this
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row?.[column]))
    return this
  }

  execute() {
    if (this.operation === 'update') {
      if (state.row && this.filters.every((filter) => filter(state.row))) {
        Object.assign(state.row, this.payload)
        return { data: this.returning ? [{ ...state.row }] : null, error: null }
      }
      return { data: this.returning ? [] : null, error: null }
    }
    return { data: state.row ? [{ ...state.row }] : [], error: null }
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
  }
}

globalThis.__workflowEmailSinkSupabase = {
  from(table) {
    assert.equal(table, 'paid_reports')
    return new EmailSinkQuery()
  },
}

const modules = new Map([
  ['workflow', `
    export class FatalError extends Error {}
    export class RetryableError extends Error {}
    export function getWritable() {
      return {
        getWriter() { return { write: async () => {}, releaseLock() {} } },
        close: async () => {},
      }
    }
  `],
  ['@/lib/supabase', `
    export function createServiceClient() { return globalThis.__workflowEmailSinkSupabase }
  `],
  ['@/lib/resend-helper', `
    export async function sendEmailWithRetry(input) {
      globalThis.__workflowEmailSinkState.emails.push(input)
      return { success: true, attempts: 1, resendId: 'synthetic-resend-id' }
    }
  `],
  ['@/lib/report/completion-email-delivery', `
    export async function deliverClaimedCompletionEmail(_client, _reportId, payload, send) {
      const outcome = await send({ ...payload, idempotencyKey: 'synthetic-completion-email-key' })
      return { sent: outcome.success === true, reason: outcome.success ? 'ok' : 'send-failed', outcome }
    }
  `],
  ['@/lib/unsubscribe', `
    export function getUnsubscribeUrl() {
      return globalThis.__workflowEmailSinkState.unsubscribeUrl
    }
    export function getUnsubscribeHtml() {
      return '<a href="javascript:alert(1)">unsafe unsubscribe</a>'
    }
  `],
  ['@/lib/plan-names', `
    export const PLAN_NAMES = { C: '人生藍圖', G15: '家族藍圖' }
    export const ALL_PLAN_CODES = ['C', 'G15']
    export function isChumenjiPlan() { return false }
  `],
  ['@/lib/consultation/routes', `
    export function buildAbsoluteReportUrl(siteUrl, _planCode, token) {
      return siteUrl.replace(/\\/+$/u, '') + '/report/' + token
    }
  `],
  ['@/lib/ai/observability/telegram', `
    export async function notifyEmailFailed() {}
    export async function notifyNeedsHumanReview() {}
    export async function notifyFailed() {}
    export async function notifyWorkflowFailed() {}
  `],
  ['@/lib/ai/observability/sentry-prod', `
    export async function captureMessage() {}
  `],
  ['@/lib/report/apology-email', `
    export async function hasApologyBeenSent() { return false }
    export function buildApologyEmail() {
      return {
        from: '鑒源命理 <reports@jianyuan.life>',
        subject: '致歉通知\\r\\nBcc: attacker@example.invalid',
        html: '<p>安全的致歉內容</p>',
      }
    }
  `],
  ['@/prompts/c_plan_v6', `export const V6_BODY_TERM_BLACKLIST = []`],
  ['@/lib/security/operational-telemetry', `
    export {
      escapeHtmlText,
      operationalErrorClass,
      operationalFailureCode,
      operationalFingerprint,
      sanitizeEmailSubject
    } from ${JSON.stringify(pathToFileURL(path.join(root, 'lib', 'security', 'operational-telemetry.ts')).href)}
  `],
])

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

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = modules.get(specifier)
    if (source) return { url: dataModule(source), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { markReportFailed, sendReportEmail } = await import('../workflows/generate-report/steps.ts')

test('report-ready email encodes customer names and AI highlights, strips subject controls, and rejects untrusted URL origins', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://attacker.invalid/\"><img src=x onerror=alert(1)>'
  process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'email-test'
  state.emails.length = 0
  state.unsubscribeUrl = 'https://attacker.invalid/unsubscribe?email=private@example.invalid'
  state.row = { id: 'report-ready-one' }

  await sendReportEmail(
    'report-ready-one',
    'customer@example.invalid',
    '\"><svg onload=alert(2)>',
    {
      name: 'Jamie</h1><img src=x onerror=alert(3)>\r\nBcc: private@example.invalid',
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      gender: 'F',
      locale: 'zh-TW',
    },
    'C',
    '命格角色：</div><img src=x onerror=alert(4)>',
    15,
  )

  assert.equal(state.emails.length, 1)
  const first = state.emails[0]
  assert.doesNotMatch(first.subject, /[\r\n]/u)
  assert.doesNotMatch(first.html, /<img\b|<svg\b|javascript:|attacker\.invalid/iu)
  assert.match(first.html, /Jamie&lt;\/h1&gt;&lt;img/iu)
  assert.match(first.html, /&lt;\/div&gt;&lt;img/iu)
  assert.match(first.html, /href="https:\/\/jianyuan\.life\//u)
  assert.equal(first.headers, undefined)

  state.unsubscribeUrl = 'https://jianyuan.life/api/unsubscribe?token=synthetic-safe-token'
  state.row = { id: 'report-ready-family' }
  await sendReportEmail(
    'report-ready-family',
    'family@example.invalid',
    'family-access-token',
    {
      name: '',
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      gender: 'F',
      locale: 'zh-TW',
      plan_type: 'family_email',
      member_names: ['One</h1><img src=x>', 'Two\r\nCc: private@example.invalid'],
    },
    'G15',
    'safe report content',
    15,
  )

  const second = state.emails[1]
  assert.doesNotMatch(second.subject, /[\r\n]/u)
  assert.doesNotMatch(second.html, /<img\b/iu)
  assert.match(second.html, /One&lt;\/h1&gt;&lt;img/iu)
  assert.match(second.headers['List-Unsubscribe'], /^<https:\/\/jianyuan\.life\//u)
})

test('admin failure email contains only an error class and an optional HMAC report fingerprint', async () => {
  const rawReportId = 'private-report-id-12345678'
  const rawError = 'sk_live_private_error for customer@example.invalid\r\nBcc: attacker@example.invalid'
  const rawCustomerEmail = 'customer-private@example.invalid'
  const rawPlan = 'C-private-plan-metadata'
  process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'email-test'
  state.emails.length = 0
  state.row = {
    id: rawReportId,
    status: 'generating',
    customer_email: rawCustomerEmail,
    plan_code: rawPlan,
    retry_count: 1,
    birth_data: { locale: 'zh-TW' },
  }

  await markReportFailed(rawReportId, rawError)

  const adminEmail = state.emails.find((email) => email.emailType === 'admin_alert')
  assert.ok(adminEmail)
  const serialized = JSON.stringify(adminEmail)
  for (const privateValue of [rawReportId, rawError, rawCustomerEmail, rawPlan, 'sk_live_private_error']) {
    assert.equal(serialized.includes(privateValue), false, `admin payload leaked ${privateValue}`)
  }
  assert.match(serialized, /UnknownError/u)
  assert.match(serialized, /email-test:[0-9a-f]{32}/u)
  assert.doesNotMatch(adminEmail.subject, /[\r\n]/u)

  process.env.TELEMETRY_FINGERPRINT_SECRET = ''
  state.emails.length = 0
  state.row = {
    id: 'second-private-report-id',
    status: 'generating',
    customer_email: 'second-private@example.invalid',
    plan_code: 'G15-private-plan',
    retry_count: 1,
    birth_data: { locale: 'zh-TW' },
  }

  await markReportFailed(state.row.id, 'second private error')

  const keylessAdminEmail = state.emails.find((email) => email.emailType === 'admin_alert')
  assert.ok(keylessAdminEmail)
  const keylessSerialized = JSON.stringify(keylessAdminEmail)
  assert.doesNotMatch(keylessSerialized, /second-private|unavailable|reportFingerprint/iu)
  assert.match(keylessSerialized, /UnknownError/u)
})

test('failure apology also sanitizes its subject and omits an untrusted unsubscribe URL', async () => {
  process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'email-test'
  state.unsubscribeUrl = 'https://attacker.invalid/unsubscribe?private=1'
  state.emails.length = 0
  state.row = {
    id: 'final-failure-report',
    status: 'generating',
    customer_email: 'apology-customer@example.invalid',
    plan_code: 'C',
    retry_count: 3,
    birth_data: { locale: 'zh-TW' },
  }

  await markReportFailed(state.row.id, 'final private error')

  const apologyEmail = state.emails.find((email) => email.emailType === 'report_failed_apology')
  assert.ok(apologyEmail)
  assert.doesNotMatch(apologyEmail.subject, /[\r\n]/u)
  assert.equal(apologyEmail.headers, undefined)
  assert.doesNotMatch(JSON.stringify(apologyEmail), /attacker\.invalid/u)
})
