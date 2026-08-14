import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stepsPath = path.join(root, 'workflows', 'generate-report', 'steps.ts')
const stepsSource = readFileSync(stepsPath, 'utf8')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const terminalState = {
  row: null,
  events: [],
  rejectQaSnapshot: false,
  nextUpdateError: null,
  updateAttempts: 0,
}
globalThis.__reportTerminalState = terminalState

function recordEvent(kind, payload) {
  terminalState.events.push({ kind, payload })
}

class PaidReportsQuery {
  constructor() {
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.returning = false
    this.columns = '*'
  }

  select(columns = '*') {
    this.columns = columns
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

  matches(row) {
    return Boolean(row) && this.filters.every((filter) => filter(row))
  }

  selectedRow(row) {
    if (!row) return null
    if (this.columns === '*') return { ...row }
    return Object.fromEntries(
      this.columns.split(',').map((column) => column.trim()).filter(Boolean)
        .map((column) => [column, row[column]]),
    )
  }

  execute() {
    const row = terminalState.row
    if (this.operation === 'update') {
      terminalState.updateAttempts += 1
      if (terminalState.nextUpdateError) {
        const error = terminalState.nextUpdateError
        terminalState.nextUpdateError = null
        return { data: null, error }
      }
      if (terminalState.rejectQaSnapshot && this.payload?.qa_snapshot) {
        return {
          data: null,
          error: {
            code: '42703',
            message: 'column paid_reports.qa_snapshot does not exist',
          },
        }
      }
      if (!this.matches(row)) return { data: this.returning ? [] : null, error: null }
      Object.assign(row, this.payload)
      return { data: this.returning ? [this.selectedRow(row)] : null, error: null }
    }
    return { data: this.matches(row) ? [this.selectedRow(row)] : [], error: null }
  }

  async maybeSingle() {
    const result = this.execute()
    return { data: result.data?.[0] ?? null, error: result.error }
  }

  async single() {
    return this.maybeSingle()
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
  }
}

const supabase = {
  from(table) {
    assert.equal(table, 'paid_reports', `unexpected table: ${table}`)
    return new PaidReportsQuery()
  },
}

const explicitModules = new Map([
  ['workflow', `
    export class FatalError extends Error {}
    export class RetryableError extends Error {}
    export function getWritable() { return { close: async () => {} } }
  `],
  ['@/lib/supabase', `
    export function createServiceClient() { return globalThis.__reportTerminalSupabase }
  `],
  ['@/lib/resend-helper', `
    export async function sendEmailWithRetry(input) {
      globalThis.__reportTerminalRecord('email', input.emailType)
      return { success: true, attempts: 1, resendId: 'synthetic-resend-id' }
    }
  `],
  ['@/lib/unsubscribe', `
    export function getUnsubscribeHtml() { return '' }
    export function getUnsubscribeUrl() { return 'https://local.invalid/unsubscribe' }
  `],
  ['@/lib/ai/observability/telegram', `
    const emit = (name, args) => globalThis.__reportTerminalRecord('telegram', { name, args })
    export async function notifyEmailFailed(...args) { emit('notifyEmailFailed', args) }
    export async function notifyNeedsHumanReview(...args) { emit('notifyNeedsHumanReview', args) }
    export async function notifyFailed(...args) { emit('notifyFailed', args) }
    export async function notifyWorkflowFailed(...args) { emit('notifyWorkflowFailed', args) }
  `],
  ['@/lib/ai/observability/sentry-prod', `
    export async function captureMessage(...args) {
      globalThis.__reportTerminalRecord('sentry', args)
    }
  `],
  ['@/lib/report/apology-email', `
    export function buildApologyEmail() {
      return { subject: 'synthetic apology', from: 'test@example.invalid', html: '<p>test</p>' }
    }
    export async function hasApologyBeenSent(reportId) {
      globalThis.__reportTerminalRecord('apology-check', reportId)
      return false
    }
  `],
  ['@/lib/plan-names', `
    export const PLAN_NAMES = {}
    export const ALL_PLAN_CODES = []
    export function isChumenjiPlan() { return false }
  `],
])

function collectModuleExports() {
  const sourceFile = ts.createSourceFile(stepsPath, stepsSource, ts.ScriptTarget.Latest, true)
  const exportsByModule = new Map()
  const add = (specifier, name) => {
    if (!exportsByModule.has(specifier)) exportsByModule.set(specifier, new Set())
    exportsByModule.get(specifier).add(name)
  }

  for (const statement of sourceFile.statements) {
    const specifier = statement.moduleSpecifier?.text
    if (!specifier) continue
    if (!exportsByModule.has(specifier)) exportsByModule.set(specifier, new Set())
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (clause?.name) add(specifier, 'default')
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          add(specifier, element.propertyName?.text ?? element.name.text)
        }
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        add(specifier, element.propertyName?.text ?? element.name.text)
      }
    }
  }
  return exportsByModule
}

for (const [specifier, names] of collectModuleExports()) {
  if (explicitModules.has(specifier)) continue
  const declarations = ['function inert() {}']
  for (const name of names) {
    declarations.push(name === 'default'
      ? 'export default inert'
      : `export const ${name} = inert`)
  }
  explicitModules.set(specifier, declarations.join('\n'))
}

const virtualModules = new Map(
  [...explicitModules].map(([specifier, source]) => [specifier, dataModule(source)]),
)

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

globalThis.__reportTerminalSupabase = supabase
globalThis.__reportTerminalRecord = recordEvent

const {
  markReportFailed,
  markReportNeedsHumanReview,
} = await import('../workflows/generate-report/steps.ts')

function seedReport(status, overrides = {}) {
  terminalState.row = {
    id: 'report-terminal-fence',
    status,
    customer_email: 'customer@example.invalid',
    plan_code: 'C',
    retry_count: 3,
    birth_data: { locale: 'zh-TW' },
    report_result: { ai_content: 'already delivered' },
    ...overrides,
  }
  terminalState.events.length = 0
  terminalState.rejectQaSnapshot = false
  terminalState.nextUpdateError = null
  terminalState.updateAttempts = 0
  return terminalState.row
}

async function captureConsoleWarnings(action) {
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  try {
    await action()
  } finally {
    console.warn = originalWarn
  }
  return warnings
}

test('0-row terminal writers emit one privacy-safe structured event and no external side effects', async (t) => {
  const cases = [
    {
      name: 'markReportFailed against an existing terminal row',
      initialStatus: 'completed',
      reportId: 'report-terminal-fence',
      targetStatus: 'failed',
      invoke: (reportId) => markReportFailed(reportId, 'PRIVATE FAILURE DETAIL'),
    },
    {
      name: 'markReportFailed against a missing id',
      initialStatus: 'generating',
      reportId: 'missing-report-id',
      targetStatus: 'failed',
      invoke: (reportId) => markReportFailed(reportId, 'PRIVATE FAILURE DETAIL'),
    },
    {
      name: 'markReportNeedsHumanReview against an existing terminal row',
      initialStatus: 'completed',
      reportId: 'report-terminal-fence',
      targetStatus: 'needs_human_review',
      invoke: (reportId) => markReportNeedsHumanReview(
        reportId,
        'PRIVATE REVIEW REASON',
        undefined,
        'PRIVATE REPORT CONTENT',
        'synthetic-model',
      ),
    },
    {
      name: 'markReportNeedsHumanReview against a missing id',
      initialStatus: 'pending',
      reportId: 'missing-report-id',
      targetStatus: 'needs_human_review',
      invoke: (reportId) => markReportNeedsHumanReview(
        reportId,
        'PRIVATE REVIEW REASON',
        undefined,
        'PRIVATE REPORT CONTENT',
        'synthetic-model',
      ),
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const row = seedReport(testCase.initialStatus)
      const originalRow = structuredClone(row)

      const warnings = await captureConsoleWarnings(
        () => testCase.invoke(testCase.reportId),
      )

      assert.equal(terminalState.updateAttempts, 1)
      assert.equal(warnings.length, 1)
      assert.equal(warnings[0].length, 1)
      const event = warnings[0][0]
      assert.deepEqual(event, {
        event: 'report_terminal_transition_noop',
        reportFingerprint: undefined,
        targetStatus: testCase.targetStatus,
      })
      assert.deepEqual(Object.keys(event).sort(), ['event', 'reportFingerprint', 'targetStatus'])
      assert.doesNotMatch(JSON.stringify(event), /PRIVATE|customer@example\.invalid|report-terminal-fence|missing-report-id/)
      assert.deepEqual(row, originalRow)
      assert.deepEqual(terminalState.events, [])
    })
  }
})

test('markReportFailed preserves a completed report and emits no notification or email', async () => {
  const row = seedReport('completed')

  await markReportFailed(row.id, 'late worker failed after delivery')

  assert.equal(row.status, 'completed')
  assert.deepEqual(terminalState.events, [])
})

test('markReportNeedsHumanReview preserves a completed report and emits no notification', async () => {
  const row = seedReport('completed')

  await markReportNeedsHumanReview(
    row.id,
    'late quality result after delivery',
    undefined,
    'late draft must not replace delivered content',
    'synthetic-model',
  )

  assert.equal(row.status, 'completed')
  assert.deepEqual(row.report_result, { ai_content: 'already delivered' })
  assert.deepEqual(terminalState.events, [])
})

test('all known terminal states are immutable and produce no terminal-writer side effects', async () => {
  for (const status of ['completed', 'failed', 'needs_human_review', 'refunded', 'unknown_terminal']) {
    const failedRow = seedReport(status)
    await markReportFailed(failedRow.id, `late failure from ${status}`)
    assert.equal(failedRow.status, status, `markReportFailed must preserve ${status}`)
    assert.deepEqual(terminalState.events, [], `markReportFailed must not notify from ${status}`)

    const reviewRow = seedReport(status)
    await markReportNeedsHumanReview(
      reviewRow.id,
      `late review from ${status}`,
      undefined,
      'late content',
      'synthetic-model',
    )
    assert.equal(reviewRow.status, status, `markReportNeedsHumanReview must preserve ${status}`)
    assert.deepEqual(reviewRow.report_result, { ai_content: 'already delivered' })
    assert.deepEqual(terminalState.events, [], `markReportNeedsHumanReview must not notify from ${status}`)
  }
})

test('markReportFailed transitions each live source once and a repeated call is side-effect free', async () => {
  for (const status of ['pending', 'generating']) {
    const row = seedReport(status, { retry_count: 0 })

    await markReportFailed(row.id, `synthetic failure from ${status}`)

    assert.equal(row.status, 'failed')
    assert.deepEqual(
      terminalState.events.map((event) => event.kind),
      ['sentry', 'telegram', 'email'],
    )
    const firstEvents = structuredClone(terminalState.events)

    const duplicateWarnings = await captureConsoleWarnings(
      () => markReportFailed(row.id, 'duplicate failure callback'),
    )

    assert.equal(duplicateWarnings.length, 1)
    assert.deepEqual(duplicateWarnings[0][0], {
      event: 'report_terminal_transition_noop',
      reportFingerprint: undefined,
      targetStatus: 'failed',
    })
    assert.deepEqual(terminalState.events, firstEvents)
  }
})

test('markReportNeedsHumanReview transitions each live source once and a repeated call is side-effect free', async () => {
  for (const status of ['pending', 'generating']) {
    const row = seedReport(status)

    await markReportNeedsHumanReview(
      row.id,
      `synthetic review from ${status}`,
      undefined,
      'draft for human review',
      'synthetic-model',
    )

    assert.equal(row.status, 'needs_human_review')
    assert.equal(row.report_result.ai_content, 'draft for human review')
    assert.deepEqual(
      terminalState.events.map((event) => event.kind),
      ['telegram'],
    )
    const firstEvents = structuredClone(terminalState.events)

    const duplicateWarnings = await captureConsoleWarnings(
      () => markReportNeedsHumanReview(row.id, 'duplicate review callback'),
    )

    assert.equal(duplicateWarnings.length, 1)
    assert.deepEqual(duplicateWarnings[0][0], {
      event: 'report_terminal_transition_noop',
      reportFingerprint: undefined,
      targetStatus: 'needs_human_review',
    })
    assert.deepEqual(terminalState.events, firstEvents)
  }
})

test('qa_snapshot schema fallback keeps the same CAS fence and notifies only after transition', async () => {
  const row = seedReport('generating')
  terminalState.rejectQaSnapshot = true

  await markReportNeedsHumanReview(
    row.id,
    'five-model review needs human attention',
    {
      scores: { reviewer: 70 },
      avg: 70,
      min: 70,
      max: 70,
      severity: 'red',
      criticalErrors: ['synthetic finding'],
    },
    'draft retained by fallback',
    'synthetic-model',
  )

  assert.equal(row.status, 'needs_human_review')
  assert.deepEqual(row.report_result, { ai_content: 'draft retained by fallback' })
  assert.equal(terminalState.updateAttempts, 2)
  assert.deepEqual(terminalState.events.map((event) => event.kind), ['telegram'])
})

test('qa_snapshot schema fallback returns normally on a fenced 0-row update without side effects', async () => {
  const row = seedReport('completed')
  terminalState.rejectQaSnapshot = true

  await assert.doesNotReject(
    markReportNeedsHumanReview(
      row.id,
      'late schema-fallback review',
      {
        scores: { reviewer: 60 },
        avg: 60,
        min: 60,
        max: 60,
        severity: 'red',
        criticalErrors: ['late synthetic finding'],
      },
      'late fallback content',
      'synthetic-model',
    ),
  )

  assert.equal(terminalState.updateAttempts, 2)
  assert.equal(row.status, 'completed')
  assert.deepEqual(row.report_result, { ai_content: 'already delivered' })
  assert.deepEqual(terminalState.events, [])
})

test('markReportNeedsHumanReview throws an unrelated database error without fallback or side effects', async () => {
  const row = seedReport('generating')
  terminalState.nextUpdateError = {
    code: '42501',
    message: 'permission denied for table paid_reports',
  }

  await assert.rejects(
    markReportNeedsHumanReview(
      row.id,
      'review transition hit an unrelated database error',
      {
        scores: { reviewer: 60 },
        avg: 60,
        min: 60,
        max: 60,
        severity: 'red',
        criticalErrors: ['synthetic finding'],
      },
      'draft must not be persisted after the error',
      'synthetic-model',
    ),
    /標記報告人工審核狀態時出錯/,
  )

  assert.equal(terminalState.updateAttempts, 1)
  assert.equal(row.status, 'generating')
  assert.deepEqual(row.report_result, { ai_content: 'already delivered' })
  assert.deepEqual(terminalState.events, [])
})

test('markReportNeedsHumanReview accepts PGRST204 only when it names qa_snapshot', async () => {
  const row = seedReport('pending')
  terminalState.nextUpdateError = {
    code: 'PGRST204',
    message: "Could not find the 'qa_snapshot' column of 'paid_reports' in the schema cache",
  }

  await markReportNeedsHumanReview(
    row.id,
    'schema cache has not observed qa_snapshot yet',
    {
      scores: { reviewer: 65 },
      avg: 65,
      min: 65,
      max: 65,
      severity: 'red',
      criticalErrors: ['synthetic finding'],
    },
    'draft retained through the schema-cache fallback',
    'synthetic-model',
  )

  assert.equal(terminalState.updateAttempts, 2)
  assert.equal(row.status, 'needs_human_review')
  assert.deepEqual(
    row.report_result,
    { ai_content: 'draft retained through the schema-cache fallback' },
  )
  assert.deepEqual(terminalState.events.map((event) => event.kind), ['telegram'])
})

test('markReportNeedsHumanReview rejects non-matching error code and message combinations', async (t) => {
  const cases = [
    {
      name: 'network error even when its message names qa_snapshot',
      error: { code: 'ECONNRESET', message: 'network request failed while updating qa_snapshot' },
    },
    {
      name: 'constraint error',
      error: { code: '23514', message: 'new row violates paid_reports status constraint' },
    },
    {
      name: '42703 for a different column',
      error: { code: '42703', message: 'column paid_reports.other_column does not exist' },
    },
    {
      name: 'PGRST204 for a different schema-cache column',
      error: {
        code: 'PGRST204',
        message: "Could not find the 'other_column' column of 'paid_reports' in the schema cache",
      },
    },
  ]

  for (const { name, error } of cases) {
    await t.test(name, async () => {
      const row = seedReport('generating')
      terminalState.nextUpdateError = error

      await assert.rejects(
        markReportNeedsHumanReview(
          row.id,
          'review transition must fail closed',
          {
            scores: { reviewer: 55 },
            avg: 55,
            min: 55,
            max: 55,
            severity: 'red',
            criticalErrors: ['synthetic finding'],
          },
          'draft must remain unpersisted',
          'synthetic-model',
        ),
        /標記報告人工審核狀態時出錯/,
      )

      assert.equal(terminalState.updateAttempts, 1)
      assert.equal(row.status, 'generating')
      assert.deepEqual(row.report_result, { ai_content: 'already delivered' })
      assert.deepEqual(terminalState.events, [])
    })
  }
})
