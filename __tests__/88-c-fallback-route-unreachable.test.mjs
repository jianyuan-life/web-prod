import assert from 'node:assert/strict'
import test from 'node:test'

import { importE3FallbackRouteWithBoundaries } from './support/e3-generation-module-hooks.mjs'

const ENV_KEYS = [
  'CRON_SECRET',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLAUDE_API_KEY',
  'DEEPSEEK_API_KEY',
  'USE_CONSULTATION_REPORT_V1_C',
]

const SYNTHETIC_BIRTH_DATA = Object.freeze({
  name: 'Synthetic C fallback invariant',
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  time_unknown: true,
  time_mode: 'unknown',
  gender: 'M',
  marital_status: 'single',
})

function restoreEnvironment(snapshot) {
  for (const key of ENV_KEYS) {
    const value = snapshot.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function setConsultationFlag(value) {
  if (value === undefined) delete process.env.USE_CONSULTATION_REPORT_V1_C
  else process.env.USE_CONSULTATION_REPORT_V1_C = value
}

function makeState(label) {
  return {
    calls: [],
    existingReport: {
      retry_count: 0,
      status: 'pending',
      birth_data: { ...SYNTHETIC_BIRTH_DATA },
      plan_code: 'C',
      access_token: `diagnostic-${label}`,
      customer_email: `${label}@example.invalid`,
    },
  }
}

function makeRequest(reportId, dryRun = false) {
  return {
    headers: new Headers({ 'x-internal-secret': 'c-fallback-invariant-secret' }),
    async json() {
      return { reportId, ...(dryRun ? { dryRun: true } : {}) }
    },
  }
}

test('C fallback route remains unreachable before calculator or AI for every consultation flag state', async (t) => {
  const environmentSnapshot = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error
  const originalConsoleInfo = console.info

  Object.assign(process.env, {
    CRON_SECRET: 'c-fallback-invariant-secret',
    NEXT_PUBLIC_API_URL: 'https://calculator.invalid',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'diagnostic-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'diagnostic-service',
    CLAUDE_API_KEY: 'diagnostic-anthropic-key',
    DEEPSEEK_API_KEY: 'diagnostic-deepseek-key',
  })

  try {
    for (const variant of [
      { label: 'flag-true', value: 'true' },
      { label: 'flag-false', value: 'false' },
      { label: 'flag-unset', value: undefined },
    ]) {
      await t.test(variant.label, async () => {
        setConsultationFlag(variant.value)
        const state = makeState(variant.label)
        const outbound = []
        const route = await importE3FallbackRouteWithBoundaries(state)

        globalThis.fetch = async (url, init = {}) => {
          outbound.push({
            url: String(url),
            body: init.body === undefined ? null : String(init.body),
          })
          throw new Error(`C fallback invariant observed forbidden outbound request: ${String(url)}`)
        }

        // The boundary harness deliberately rejects database writes. The route catches
        // that diagnostic failure before returning its workflow-only response.
        console.error = () => {}
        console.info = () => {}

        const normalResponse = await route.POST(makeRequest(`c-normal-${variant.label}`))
        assert.equal(normalResponse.status, 409)
        assert.deepEqual(await normalResponse.json(), {
          error: 'C 需透過 Workflow 生成',
        })

        const dryRunResponse = await route.POST(makeRequest(`c-dry-${variant.label}`, true))
        assert.equal(dryRunResponse.status, 200)
        const dryRunBody = await dryRunResponse.json()
        assert.equal(dryRunBody.ok, false)
        assert.equal(dryRunBody.dryRun, true)
        assert.equal(dryRunBody.skipped, 'C-workflow-only')
        assert.equal(dryRunBody.plan_code, 'C')

        assert.deepEqual(
          outbound,
          [],
          'C must not call calculator, Anthropic, DeepSeek, or any other network boundary',
        )
      })
    }
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalConsoleError
    console.info = originalConsoleInfo
    restoreEnvironment(environmentSnapshot)
  }
})
