import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const state = {
  updates: [],
}
globalThis.__cronRetryState = state

class Query {
  constructor() {
    this.operation = 'select'
    this.selection = ''
    this.filters = []
  }

  select(value) { this.selection = value; return this }
  update(value) { this.operation = 'update'; this.payload = value; return this }
  eq(column, value) { this.filters.push({ column, value }); return this }
  in(column, value) { this.filters.push({ column, value }); return this }
  lt() { return this }
  is(column, value) { this.filters.push({ column, value }); return this }
  order() { return this }
  limit() { return this }

  execute() {
    if (this.operation === 'update') {
      state.updates.push(this.payload)
      return { data: [{ id: 'report-retry-1' }], error: null }
    }
    if (this.selection.includes('retry_count')) {
      return {
        data: [{
          id: 'report-retry-1',
          retry_count: 0,
          status: 'pending',
          created_at: '2026-08-13T00:00:00.000Z',
          generation_progress: {},
        }],
        error: null,
      }
    }
    return { data: [], error: null }
  }

  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject) }
}

globalThis.__cronRetrySupabase = {
  from() { return new Query() },
}

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
    export function after() {}
  `],
  ['@/lib/cron-auth', `export function checkCronAuth() { return null }`],
  ['@/lib/supabase', `
    export function createServiceClient() { return globalThis.__cronRetrySupabase }
  `],
  ['@/lib/report/apology-email', `export async function sendApologyIfFinalFailure() {}`],
  ['@/lib/report/completion-fallback-email', `export async function sendCompletionEmailIfMissing() {}`],
  ['@/lib/ai/observability/sentry-prod', `
    export async function captureMessage() {}
    export async function captureException() {}
  `],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = modules.get(specifier)
    if (source) return { url: dataModule(source), shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { GET } = await import('../app/api/cron/retry-pending/route.ts')

test('retry cron does not count an HTTP 503 workflow response as a successful retry', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'
  process.env.CRON_SECRET = 'cron-secret'
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('unavailable', { status: 503 })
  try {
    const response = await GET({ headers: new Headers() })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.retriedCount, 0)
    assert.equal(body.totalPending, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
