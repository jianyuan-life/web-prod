import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CONSULTATION_SESSION_TTL_SECONDS,
  consultationSessionCookieName,
  createConsultationSessionHandle,
  openConsultationSession,
  sealConsultationSession,
} from '../lib/consultation/session.ts'
import {
  createConsultationSessionResponse,
  createLegacyConsultationPdfRedirect,
} from '../lib/consultation/session-response.ts'
import { exchangeConsultationFragment } from '../lib/consultation/access-client.ts'
import { loadConsultationReportFromSession } from '../lib/consultation/session-loader.ts'
import { createConsultationPdfResponseFromSession } from '../lib/consultation/session-pdf-response.ts'

const HEX_FIXTURE = '0123456789abcdef'
const ALTERNATE_HEX_FIXTURE = 'fedcba9876543210'
const ACCESS_PARTS_A = ['Z2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9u']
const ACCESS_PARTS_B = ['Q2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9z']
const SECRET = HEX_FIXTURE.repeat(2)
const ALTERNATE_SECRET = ALTERNATE_HEX_FIXTURE.repeat(2)
const TOKEN = ACCESS_PARTS_A.join('')
const TOKEN_B = ACCESS_PARTS_B.join('')
const SESSION_A = 'AbCdEfGhIjKlMnOpQrStUv'
const SESSION_B = 'VwXyZ0123456789_AbCdEf'
const NOW_MS = Date.UTC(2026, 7, 9, 12, 0, 0)

test('a valid bearer token round-trips through an authenticated cookie without appearing in plaintext', async () => {
  const sealed = await sealConsultationSession(TOKEN, SESSION_A, {
    secret: SECRET,
    nowMs: NOW_MS,
    randomBytes: () => Uint8Array.from({ length: 12 }, (_, index) => index + 1),
  })

  assert.equal(consultationSessionCookieName(SESSION_A), `__Host-jy_consultation_${SESSION_A}`)
  assert.equal(sealed.includes(TOKEN), false)
  const opened = await openConsultationSession(sealed, SESSION_A, {
    secret: SECRET,
    nowMs: NOW_MS + 1_000,
  })
  assert.deepEqual(opened, {
    ok: true,
    token: TOKEN,
    expiresAt: Math.floor(NOW_MS / 1_000) + CONSULTATION_SESSION_TTL_SECONDS,
  })
})

test('the same-origin session endpoint validates the report before issuing an HttpOnly cookie', async () => {
  let loadedToken = ''
  const request = new Request('https://jianyuan.life/api/consultation/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://jianyuan.life',
    },
    body: JSON.stringify({ token: TOKEN }),
  })
  const response = await createConsultationSessionResponse(request, {
    load: async (token) => {
      loadedToken = token
      return {
        ok: true,
        mode: 'legacy_full_text',
        plan: 'C',
        content: 'private report',
        fullCharts: null,
        narrativeSummary: null,
        provenance: { source: 'paid_reports', contentField: 'report_result.ai_content' },
        asOf: { status: 'unknown', value: null },
      }
    },
    createHandle: () => SESSION_A,
    seal: async (_token, handle) => {
      assert.equal(handle, SESSION_A)
      return 'v1.authenticated-ciphertext'
    },
  })

  assert.equal(response.status, 200)
  assert.equal(loadedToken, TOKEN)
  assert.deepEqual(await response.json(), {
    next: `/consultation/view?session=${SESSION_A}`,
    session: SESSION_A,
  })
  const setCookie = response.headers.get('set-cookie') || ''
  assert.match(
    setCookie,
    new RegExp(`^__Host-jy_consultation_${SESSION_A}=v1\\.authenticated-ciphertext;`, 'u'),
  )
  assert.match(setCookie, /HttpOnly/iu)
  assert.match(setCookie, /Secure/iu)
  assert.match(setCookie, /SameSite=Strict/iu)
  assert.equal(setCookie.includes(TOKEN), false)
  assert.match(response.headers.get('cache-control') || '', /no-store/iu)
})

test('the browser erases the fragment before exchanging it and navigates only to a selector-bound reader path', async () => {
  const events = []
  const result = await exchangeConsultationFragment({
    location: {
      hash: `#token=${encodeURIComponent(TOKEN)}`,
      pathname: '/consultation/access',
      search: '',
      replace: (value) => events.push(['navigate', value]),
    },
    history: {
      replaceState: (_state, _title, value) => events.push(['history', value]),
    },
    fetch: async (input, init) => {
      events.push(['fetch', input, JSON.parse(init.body)])
      return new Response(JSON.stringify({
        next: `/consultation/view?session=${SESSION_A}`,
        session: SESSION_A,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(events, [
    ['history', '/consultation/access'],
    ['fetch', '/api/consultation/session', { token: TOKEN }],
    ['navigate', `/consultation/view?session=${SESSION_A}`],
  ])
})

test('the pre-hydration handoff erases history early without losing the fragment exchange', async () => {
  const earlyLayout = readFileSync(new URL('../app/consultation/access/layout.tsx', import.meta.url), 'utf8')
  assert.match(earlyLayout, /__JY_CONSULTATION_FRAGMENT__/u)
  assert.match(earlyLayout, /history\.replaceState/u)

  const events = []
  const result = await exchangeConsultationFragment({
    fragment: `token=${TOKEN}`,
    location: {
      hash: '',
      pathname: '/consultation/access',
      search: '',
      replace: (value) => events.push(['navigate', value]),
    },
    history: {
      replaceState: (_state, _title, value) => events.push(['history', value]),
    },
    fetch: async () => new Response(JSON.stringify({
      next: `/consultation/view?session=${SESSION_A}`,
      session: SESSION_A,
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(events, [
    ['history', '/consultation/access'],
    ['navigate', `/consultation/view?session=${SESSION_A}`],
  ])
})

test('an invalid session is rejected before the private report database is queried', async () => {
  let queryCount = 0
  const result = await loadConsultationReportFromSession('invalid-cookie', SESSION_A, {
    open: async (_sealed, expectedHandle) => {
      assert.equal(expectedHandle, SESSION_A)
      return { ok: false, code: 'invalid_session' }
    },
    load: async () => {
      queryCount += 1
      throw new Error('must not query')
    },
  })

  assert.deepEqual(result, { ok: false, code: 'invalid_session' })
  assert.equal(queryCount, 0)
})

test('the tokenless PDF endpoint opens the cookie before calling the existing private renderer response', async () => {
  let renderedToken = ''
  const response = await createConsultationPdfResponseFromSession('sealed-cookie', SESSION_A, {
    open: async (_sealed, expectedHandle) => {
      assert.equal(expectedHandle, SESSION_A)
      return { ok: true, token: TOKEN, expiresAt: Math.floor(NOW_MS / 1_000) + 1_800 }
    },
    create: async (token) => {
      renderedToken = token
      return new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(renderedToken, TOKEN)
  assert.equal(await response.text(), '%PDF-1.7')
})

test('a legacy PDF bearer URL is exchanged server-side and redirects to the tokenless endpoint', async () => {
  const response = await createLegacyConsultationPdfRedirect(
    new Request(`https://jianyuan.life/api/consultation/${TOKEN}/pdf`),
    TOKEN,
    {
      load: async () => ({
        ok: true,
        mode: 'structured',
        plan: 'G15',
        report: {},
        pdfUrl: null,
      }),
      createHandle: () => SESSION_A,
      seal: async () => 'v1.authenticated-ciphertext',
    },
  )

  assert.equal(response.status, 307)
  assert.equal(
    response.headers.get('location'),
    `https://jianyuan.life/api/consultation/pdf?session=${SESSION_A}`,
  )
  assert.equal((response.headers.get('set-cookie') || '').includes(TOKEN), false)
})

test('tampered, wrong-key, expired, and unconfigured sessions all fail closed', async () => {
  const sealed = await sealConsultationSession(TOKEN, SESSION_A, {
    secret: SECRET,
    nowMs: NOW_MS,
    randomBytes: () => Uint8Array.from({ length: 12 }, (_, index) => index + 9),
  })
  const tamperIndex = 12
  const replacement = sealed[tamperIndex] === 'A' ? 'B' : 'A'
  const tampered = `${sealed.slice(0, tamperIndex)}${replacement}${sealed.slice(tamperIndex + 1)}`
  assert.deepEqual(
    await openConsultationSession(tampered, SESSION_A, { secret: SECRET, nowMs: NOW_MS }),
    { ok: false, code: 'invalid_session' },
  )
  assert.deepEqual(
    await openConsultationSession(sealed, SESSION_A, {
      secret: ALTERNATE_SECRET,
      nowMs: NOW_MS,
    }),
    { ok: false, code: 'invalid_session' },
  )
  assert.deepEqual(
    await openConsultationSession(sealed, SESSION_A, {
      secret: SECRET,
      nowMs: NOW_MS + CONSULTATION_SESSION_TTL_SECONDS * 1_000,
    }),
    { ok: false, code: 'expired_session' },
  )
  assert.deepEqual(
    await openConsultationSession(sealed, SESSION_A, { secret: '', nowMs: NOW_MS }),
    { ok: false, code: 'configuration_error' },
  )
  await assert.rejects(
    sealConsultationSession(TOKEN, SESSION_A, { secret: '', nowMs: NOW_MS }),
    /not configured/iu,
  )
  await assert.rejects(
    sealConsultationSession(` ${TOKEN} `, SESSION_A, { secret: SECRET, nowMs: NOW_MS }),
    /invalid consultation access token/iu,
  )
  assert.deepEqual(
    await openConsultationSession(sealed, SESSION_A, {
      secret: 'replace-with-independent-openssl-rand-hex-32',
      nowMs: NOW_MS,
    }),
    { ok: false, code: 'configuration_error' },
  )
})

test('cross-origin session exchange is rejected without validating or storing the bearer token', async () => {
  let loadCount = 0
  const response = await createConsultationSessionResponse(new Request(
    'https://jianyuan.life/api/consultation/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
      body: JSON.stringify({ token: TOKEN }),
    },
  ), {
    load: async () => {
      loadCount += 1
      throw new Error('must not load')
    },
  })

  assert.equal(response.status, 403)
  assert.equal(loadCount, 0)
  assert.equal(response.headers.has('set-cookie'), false)
  assert.equal((await response.text()).includes(TOKEN), false)
})

test('an invalid fragment is erased without making a request or retaining its contents', async () => {
  const events = []
  const result = await exchangeConsultationFragment({
    location: {
      hash: '#token=short-secret',
      pathname: '/consultation/access',
      search: '?utm_source=email',
      replace: (value) => events.push(['navigate', value]),
    },
    history: {
      replaceState: (_state, _title, value) => events.push(['history', value]),
    },
    fetch: async () => {
      events.push(['fetch'])
      throw new Error('must not fetch')
    },
  })

  assert.deepEqual(result, { ok: false, code: 'invalid_link' })
  assert.deepEqual(events, [['history', '/consultation/access?utm_source=email']])
})

test('a PDF fragment establishes the same session and then navigates to a selector-bound PDF path', async () => {
  const events = []
  const result = await exchangeConsultationFragment({
    location: {
      hash: `#token=${encodeURIComponent(TOKEN)}&intent=pdf`,
      pathname: '/consultation/access',
      search: '',
      replace: (value) => events.push(['navigate', value]),
    },
    history: {
      replaceState: (_state, _title, value) => events.push(['history', value]),
    },
    fetch: async (input, init) => {
      events.push(['fetch', input, JSON.parse(init.body)])
      return new Response(JSON.stringify({
        next: `/api/consultation/pdf?session=${SESSION_A}`,
        session: SESSION_A,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(events, [
    ['history', '/consultation/access'],
    ['fetch', '/api/consultation/session', { token: TOKEN, intent: 'pdf' }],
    ['navigate', `/api/consultation/pdf?session=${SESSION_A}`],
  ])
})

test('the session endpoint accepts only the fixed PDF intent and returns the tokenless PDF route', async () => {
  const response = await createConsultationSessionResponse(new Request(
    'https://jianyuan.life/api/consultation/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://jianyuan.life' },
      body: JSON.stringify({ token: TOKEN, intent: 'pdf' }),
    },
  ), {
    load: async () => ({
      ok: true,
      mode: 'structured',
      plan: 'C',
      report: {},
      pdfUrl: null,
    }),
    createHandle: () => SESSION_A,
    seal: async () => 'v1.authenticated-ciphertext',
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    next: `/api/consultation/pdf?session=${SESSION_A}`,
    session: SESSION_A,
  })
})

test('a legacy text report cannot mint a session for the structured tokenless PDF renderer', async () => {
  let sealCount = 0
  const response = await createConsultationSessionResponse(new Request(
    'https://jianyuan.life/api/consultation/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://jianyuan.life' },
      body: JSON.stringify({ token: TOKEN, intent: 'pdf' }),
    },
  ), {
    load: async () => ({
      ok: true,
      mode: 'legacy_full_text',
      plan: 'C',
      content: 'private report',
      fullCharts: null,
      narrativeSummary: null,
      pdfUrl: null,
      provenance: { source: 'paid_reports', contentField: 'report_result.ai_content' },
      asOf: { status: 'unknown', value: null },
    }),
    seal: async () => {
      sealCount += 1
      return 'v1.must-not-be-created'
    },
  })

  assert.equal(response.status, 409)
  assert.equal(sealCount, 0)
  assert.equal(response.headers.has('set-cookie'), false)
})

test('two report sessions stay bound to distinct selectors and cannot cross-load across tabs', async () => {
  const sealedA = await sealConsultationSession(TOKEN, SESSION_A, {
    secret: SECRET,
    nowMs: NOW_MS,
    randomBytes: () => Uint8Array.from({ length: 12 }, (_, index) => index + 1),
  })
  const sealedB = await sealConsultationSession(TOKEN_B, SESSION_B, {
    secret: SECRET,
    nowMs: NOW_MS,
    randomBytes: () => Uint8Array.from({ length: 12 }, (_, index) => index + 21),
  })

  assert.notEqual(consultationSessionCookieName(SESSION_A), consultationSessionCookieName(SESSION_B))
  assert.deepEqual(
    await openConsultationSession(sealedA, SESSION_A, { secret: SECRET, nowMs: NOW_MS }),
    {
      ok: true,
      token: TOKEN,
      expiresAt: Math.floor(NOW_MS / 1_000) + CONSULTATION_SESSION_TTL_SECONDS,
    },
  )
  assert.deepEqual(
    await openConsultationSession(sealedB, SESSION_B, { secret: SECRET, nowMs: NOW_MS }),
    {
      ok: true,
      token: TOKEN_B,
      expiresAt: Math.floor(NOW_MS / 1_000) + CONSULTATION_SESSION_TTL_SECONDS,
    },
  )
  assert.deepEqual(
    await openConsultationSession(sealedA, SESSION_B, { secret: SECRET, nowMs: NOW_MS }),
    { ok: false, code: 'invalid_session' },
  )
  assert.deepEqual(
    await openConsultationSession(sealedB, SESSION_A, { secret: SECRET, nowMs: NOW_MS }),
    { ok: false, code: 'invalid_session' },
  )

  const makeExchange = (token, handle) => createConsultationSessionResponse(new Request(
    'https://jianyuan.life/api/consultation/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://jianyuan.life' },
      body: JSON.stringify({ token }),
    },
  ), {
    load: async () => ({
      ok: true,
      mode: 'structured',
      plan: 'C',
      report: {},
      pdfUrl: null,
    }),
    createHandle: () => handle,
    seal: async (_token, expectedHandle) => expectedHandle === SESSION_A ? sealedA : sealedB,
  })
  const [responseA, responseB] = await Promise.all([
    makeExchange(TOKEN, SESSION_A),
    makeExchange(TOKEN_B, SESSION_B),
  ])
  assert.match(responseA.headers.get('set-cookie') || '', new RegExp(`^${consultationSessionCookieName(SESSION_A)}=`, 'u'))
  assert.match(responseB.headers.get('set-cookie') || '', new RegExp(`^${consultationSessionCookieName(SESSION_B)}=`, 'u'))
  assert.notEqual(responseA.headers.get('set-cookie'), responseB.headers.get('set-cookie'))
})

test('the keyed selector is stable per report so reopening cannot accumulate unbounded cookies', async () => {
  const firstA = await createConsultationSessionHandle(TOKEN, { secret: SECRET })
  const secondA = await createConsultationSessionHandle(TOKEN, { secret: SECRET })
  const firstB = await createConsultationSessionHandle(TOKEN_B, { secret: SECRET })

  assert.match(firstA, /^[A-Za-z0-9_-]{22}$/u)
  assert.equal(firstA, secondA)
  assert.notEqual(firstA, firstB)
  assert.equal(consultationSessionCookieName(firstA), consultationSessionCookieName(secondA))
  assert.notEqual(consultationSessionCookieName(firstA), consultationSessionCookieName(firstB))
})

test('legacy bearer middleware never mints a cookie before the Node report lookup', () => {
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8')
  const branchStart = middleware.indexOf("if (pathname.startsWith('/consultation/'))")
  const branchEnd = middleware.indexOf('// STAGE 3:', branchStart)
  const consultationBranch = middleware.slice(branchStart, branchEnd)

  assert.match(consultationBranch, /buildConsultationAccessRoute\(token\)/u)
  assert.doesNotMatch(consultationBranch, /sealConsultationSession|response\.cookies\.set/u)

  const responseHelper = readFileSync(new URL('../lib/consultation/session-response.ts', import.meta.url), 'utf8')
  assert.ok(
    responseHelper.indexOf('(dependencies.load ?? loadConsultationReport)(token)') <
      responseHelper.indexOf('(dependencies.seal ?? sealConsultationSession)(token, handle)'),
    'the Node exchange must validate the report before sealing a cookie',
  )
})

test('arbitrary navigation intents are rejected before report lookup, preventing open redirects', async () => {
  let loadCount = 0
  const response = await createConsultationSessionResponse(new Request(
    'https://jianyuan.life/api/consultation/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://jianyuan.life' },
      body: JSON.stringify({ token: TOKEN, intent: 'https://attacker.invalid' }),
    },
  ), {
    load: async () => {
      loadCount += 1
      throw new Error('must not load')
    },
  })

  assert.equal(response.status, 400)
  assert.equal(loadCount, 0)
  assert.equal(response.headers.has('location'), false)
  assert.equal(response.headers.has('set-cookie'), false)
})
