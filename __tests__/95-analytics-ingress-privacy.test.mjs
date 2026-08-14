import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() {
      return globalThis.__analyticsIngressSupabase
    }
  `)],
])

function resolveLocalModule(candidate) {
  for (const file of [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts')]) {
    if (existsSync(file)) return pathToFileURL(file).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      const local = resolveLocalModule(path.join(root, specifier.slice(2)))
      if (local) return { url: local, shortCircuit: true }
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL
      && !context.parentURL.startsWith('data:')
    ) {
      const fullPath = fileURLToPath(new URL(specifier, context.parentURL))
      if (!path.extname(fullPath)) {
        const local = resolveLocalModule(fullPath)
        if (local) return { url: local, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const inserts = []
globalThis.__analyticsIngressSupabase = {
  from(table) {
    return {
      async insert(payload) {
        inserts.push({ table, payload })
        return { error: null }
      },
    }
  },
}

const { POST: track } = await import('../app/api/track/route.ts')
const { POST: webVitals } = await import('../app/api/web-vitals/route.ts')

function jsonRequest(url, payload, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
}

function rawRequest(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

test('/api/track stores only allowlisted, minimized analytics fields', async () => {
  inserts.length = 0
  const token = 'private-consultation-token-123'
  const response = await track(jsonRequest('https://local.invalid/api/track', {
    session_id: 'session_AbCdEf0123456789',
    page_path: `https://jianyuan.life/CONSULTATION/${token}?utm=secret#chapter`,
    event_type: 'duration',
    referrer: `https://ref.example/consultation/${token}?source=secret#fragment`,
    duration_seconds: 35,
    metadata: { token, email: 'private@example.com' },
  }, {
    'cf-connecting-ip': '203.0.113.77',
    'x-forwarded-for': '198.51.100.5, 198.51.100.6',
    'user-agent': `Mozilla/5.0 (iPhone) secret=${token}`,
    'cf-ipcountry': 'hk',
    'x-vercel-ip-city': `Secret-City-${token}`,
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].table, 'visitor_events')
  assert.deepEqual(inserts[0].payload, {
    session_id: 'session_AbCdEf0123456789',
    ip_address: null,
    country: 'HK',
    page_path: '/consultation/[private]',
    event_type: 'duration',
    referrer: 'https://ref.example',
    device_type: 'mobile',
    duration_seconds: 35,
  })
  assert.doesNotMatch(JSON.stringify(inserts[0].payload), new RegExp(token, 'u'))
})

test('/api/track canonicalizes a public pageview and permits an omitted session', async () => {
  inserts.length = 0
  const response = await track(jsonRequest('https://local.invalid/api/track', {
    page_path: 'https://jianyuan.life/pricing/../about?utm=private#founder',
    event_type: 'pageview',
    referrer: '',
    metadata: { ignored: true },
  }, {
    'user-agent': 'Mozilla/5.0 (iPad; Tablet)',
    'cf-ipcountry': 'HKG',
    'x-vercel-ip-city': '%E0%A4%A',
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(inserts[0].payload, {
    session_id: null,
    ip_address: null,
    country: null,
    page_path: '/about',
    event_type: 'pageview',
    referrer: null,
    device_type: 'tablet',
  })
})

test('/api/track silently rejects payloads outside the strict public schema', async () => {
  const valid = {
    session_id: 'session_AbCdEf0123456789',
    page_path: '/pricing?plan=C#details',
    event_type: 'pageview',
    referrer: 'https://search.example/results?q=private',
  }
  const invalidPayloads = [
    { ...valid, event_type: 'purchase' },
    { ...valid, event_type: 'duration' },
    { ...valid, event_type: 'duration', duration_seconds: 0 },
    { ...valid, event_type: 'duration', duration_seconds: 1801 },
    { ...valid, event_type: 'duration', duration_seconds: '35' },
    { ...valid, duration_seconds: 20 },
    { ...valid, session_id: 'bad id' },
    { ...valid, page_path: 'javascript:alert(1)' },
    { ...valid, page_path: '/bad%ZZpath' },
    { ...valid, referrer: '/relative/private?token=secret' },
    { ...valid, secret_field: 'must not be accepted' },
  ]

  for (const payload of invalidPayloads) {
    inserts.length = 0
    const response = await track(jsonRequest('https://local.invalid/api/track', payload))
    assert.equal(response.status, 204, JSON.stringify(payload))
    assert.equal(inserts.length, 0, JSON.stringify(payload))
  }
})

test('/api/track bounds and parses untrusted request bodies without a leaking 500', async () => {
  const cases = [
    { request: rawRequest('https://local.invalid/api/track', '{"page_path":'), status: 400 },
    { request: rawRequest('https://local.invalid/api/track', JSON.stringify('not-an-object')), status: 204 },
    { request: rawRequest('https://local.invalid/api/track', 'x'.repeat(4097)), status: 413 },
    {
      request: rawRequest('https://local.invalid/api/track', '{}', { 'content-length': '12oops' }),
      status: 400,
    },
  ]

  for (const entry of cases) {
    inserts.length = 0
    const response = await track(entry.request)
    assert.equal(response.status, entry.status)
    assert.equal(inserts.length, 0)
    assert.doesNotMatch(await response.text(), /page_path|syntax|token|stack/iu)
  }
})

test('/api/web-vitals logs an allowlisted metric without IP, query, hash, or private token', async () => {
  const token = 'web-vital-private-token-123'
  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(args)
  try {
    const response = await webVitals(jsonRequest('https://local.invalid/api/web-vitals', {
      id: 'vital-1',
      name: 'LCP',
      value: 2345.5,
      rating: 'needs-improvement',
      page: `https://jianyuan.life/%2Fconsultation%2F${token}?utm=secret#chapter`,
      delta: 20,
      navigationType: 'navigate',
      ts: Date.now(),
    }, {
      'cf-connecting-ip': '203.0.113.88',
      'x-forwarded-for': '198.51.100.20, 198.51.100.21',
    }))

    assert.equal(response.status, 204)
    assert.equal(logs.length, 1)
    assert.equal(logs[0][0], '[WEB-VITAL]')
    const event = JSON.parse(logs[0][1])
    assert.deepEqual({
      name: event.name,
      value: event.value,
      rating: event.rating,
      page: event.page,
    }, {
      name: 'LCP',
      value: 2345.5,
      rating: 'needs-improvement',
      page: '/consultation/[private]',
    })
    assert.equal(Object.hasOwn(event, 'ip'), false)
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(`${token}|203\\.0\\.113|utm|chapter`, 'u'))
  } finally {
    console.info = originalInfo
  }
})

test('/api/web-vitals silently drops metrics outside its strict allowlist', async () => {
  const valid = {
    id: 'vital-2',
    name: 'CLS',
    value: 0.12,
    rating: 'needs-improvement',
    page: '/pricing?plan=C#details',
    delta: 0.02,
    navigationType: 'navigate',
    ts: Date.now(),
  }
  const invalidPayloads = [
    { ...valid, name: 'lcp' },
    { ...valid, name: 'SECRET' },
    { ...valid, value: '0.12' },
    { ...valid, value: null },
    { ...valid, value: -1 },
    { ...valid, value: 600001 },
    { ...valid, rating: 'unknown' },
    { ...valid, page: '' },
    { ...valid, page: 'javascript:alert(1)' },
    { ...valid, page: '/bad%ZZpath' },
    { ...valid, private_token: 'must-not-be-accepted' },
  ]

  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(args)
  try {
    for (const payload of invalidPayloads) {
      logs.length = 0
      const response = await webVitals(jsonRequest('https://local.invalid/api/web-vitals', payload))
      assert.equal(response.status, 204, JSON.stringify(payload))
      assert.equal(logs.length, 0, JSON.stringify(payload))
    }
  } finally {
    console.info = originalInfo
  }
})

test('/api/web-vitals preserves bounded-ingress response semantics for malformed bodies', async () => {
  const cases = [
    { request: rawRequest('https://local.invalid/api/web-vitals', '{"name":'), status: 400 },
    { request: rawRequest('https://local.invalid/api/web-vitals', 'x'.repeat(4097)), status: 413 },
    { request: rawRequest('https://local.invalid/api/web-vitals', '漢'.repeat(1400)), status: 413 },
    {
      request: rawRequest('https://local.invalid/api/web-vitals', '{}', { 'content-length': '12oops' }),
      status: 400,
    },
  ]

  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(args)
  try {
    for (const entry of cases) {
      logs.length = 0
      const response = await webVitals(entry.request)
      assert.equal(response.status, entry.status)
      assert.equal(logs.length, 0)
      assert.doesNotMatch(await response.text(), /syntax|stack|token/iu)
    }
  } finally {
    console.info = originalInfo
  }
})
