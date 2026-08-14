import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { requestPrivateReportPdf } from '../lib/report/private-pdf-client.ts'

const REPORT_ID = '123e4567-e89b-42d3-a456-426614174000'
const ACCESS_TOKEN = '6d9123c8-9f7a-4c11-a841-20a54dfe91bc'
const AUTH_TOKEN = 'synthetic-owner-session-token'
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\nprivate recovery fixture')

function pdfResponse(bytes = PDF_BYTES, contentType = 'application/pdf') {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

test('missing structured PDF is generated once before the private download', async () => {
  const calls = []
  const blob = await requestPrivateReportPdf({
    reportId: REPORT_ID,
    accessToken: ACCESS_TOKEN,
    authToken: AUTH_TOKEN,
    pdfAvailable: false,
  }, async (url, init) => {
    calls.push({ url, init, body: JSON.parse(String(init?.body || '{}')) })
    if (url === '/api/reports/generate-pdf') {
      return Response.json({ pdf_available: true })
    }
    return pdfResponse()
  })

  assert.equal(blob.type, 'application/pdf')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, '/api/reports/generate-pdf')
  assert.deepEqual(calls[0].body, {
    report_id: REPORT_ID,
    access_token: ACCESS_TOKEN,
  })
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${AUTH_TOKEN}`)
  assert.equal(calls[1].url, '/api/reports/pdf')
  assert.deepEqual(calls[1].body, { report_id: REPORT_ID })
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${AUTH_TOKEN}`)
})

test('an existing PDF skips generation and access-token download remains supported', async () => {
  const calls = []
  await requestPrivateReportPdf({
    accessToken: ACCESS_TOKEN,
    pdfAvailable: true,
  }, async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body || '{}')) })
    return pdfResponse()
  })

  assert.deepEqual(calls, [{
    url: '/api/reports/pdf',
    body: { access_token: ACCESS_TOKEN },
  }])
})

test('a 404 or 409 private download performs exactly one server repair and one retry', async () => {
  for (const initialStatus of [404, 409]) {
    const calls = []
    let downloadAttempts = 0
    const blob = await requestPrivateReportPdf({
      reportId: REPORT_ID,
      accessToken: ACCESS_TOKEN,
      authToken: AUTH_TOKEN,
      pdfAvailable: true,
    }, async (url, init) => {
      const body = JSON.parse(String(init?.body || '{}'))
      calls.push({ url, body })
      if (url === '/api/reports/pdf') {
        downloadAttempts += 1
        return downloadAttempts === 1
          ? Response.json({ error: 'pdf_unavailable' }, { status: initialStatus })
          : pdfResponse()
      }
      if (url === '/api/reports/generate-pdf') {
        return Response.json({ pdf_available: true, cached: false })
      }
      return assert.fail(`unexpected private PDF endpoint: ${url}`)
    })

    assert.equal(blob.type, 'application/pdf')
    assert.deepEqual(calls.map((call) => call.url), [
      '/api/reports/pdf',
      '/api/reports/generate-pdf',
      '/api/reports/pdf',
    ])
    assert.deepEqual(calls[1].body, {
      report_id: REPORT_ID,
      access_token: ACCESS_TOKEN,
    })
    assert.equal(JSON.stringify(calls).includes('supabase.co/storage'), false)
  }
})

test('generation failure is fail closed and never attempts a private download', async () => {
  const calls = []
  await assert.rejects(
    requestPrivateReportPdf({
      reportId: REPORT_ID,
      accessToken: ACCESS_TOKEN,
      pdfAvailable: false,
    }, async (url) => {
      calls.push(url)
      return Response.json({ error: 'synthetic upstream detail must stay unused' }, { status: 503 })
    }),
    /pdf_unavailable/u,
  )
  assert.deepEqual(calls, ['/api/reports/generate-pdf'])
})

test('generation success requires an explicit availability receipt', async () => {
  let calls = 0
  await assert.rejects(
    requestPrivateReportPdf({
      reportId: REPORT_ID,
      accessToken: ACCESS_TOKEN,
      pdfAvailable: false,
    }, async () => {
      calls += 1
      return Response.json({ pdf_available: false })
    }),
    /pdf_unavailable/u,
  )
  assert.equal(calls, 1)
})

test('invalid or oversized PDF bytes are rejected before browser download', async () => {
  for (const response of [
    pdfResponse(new TextEncoder().encode('not a PDF')),
    pdfResponse(PDF_BYTES, 'application/octet-stream'),
    pdfResponse(new Uint8Array(5 * 1024 * 1024 + 1)),
  ]) {
    await assert.rejects(
      requestPrivateReportPdf({ accessToken: ACCESS_TOKEN, pdfAvailable: true }, async () => response),
      /pdf_unavailable/u,
    )
  }
})

test('a missing report id cannot start recovery and performs no network request', async () => {
  let calls = 0
  await assert.rejects(
    requestPrivateReportPdf({ accessToken: ACCESS_TOKEN, pdfAvailable: false }, async () => {
      calls += 1
      return pdfResponse()
    }),
    /pdf_unavailable/u,
  )
  assert.equal(calls, 0)
})

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const generateRouteModules = new Map([
  ['next/server', dataModule(`
    export class NextRequest extends Request {}
    export class NextResponse extends Response {
      static json(body, init = {}) {
        const headers = new Headers(init.headers)
        headers.set('content-type', 'application/json')
        return new NextResponse(JSON.stringify(body), { ...init, headers })
      }
    }
  `)],
  ['@/lib/plan-names', dataModule(`export const PLAN_NAMES = { C: 'Life', G15: 'Family' }`)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() { return globalThis.__privatePdfGenerateSupabase }
  `)],
  ['@/lib/consultation/calculator-request', dataModule(`export const GENERATE_PDF_PATH = '/api/generate-pdf'`)],
  ['@/lib/consultation/calculator-request-auth.server', dataModule(`
    export function createSignedCalculatorPost({ payload }) {
      return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
    }
  `)],
])
const pdfStorageUrl = new URL('../lib/report/pdf-storage.ts', import.meta.url).href
const pdfBytesUrl = new URL('../lib/report/pdf-bytes.ts', import.meta.url).href
const privatePdfUrl = new URL('../lib/report/private-pdf.ts', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/report/pdf-storage') {
      return { url: pdfStorageUrl, shortCircuit: true }
    }
    if (specifier === '@/lib/report/pdf-bytes') {
      return { url: pdfBytesUrl, shortCircuit: true }
    }
    if (specifier === '@/lib/report/private-pdf') {
      return { url: privatePdfUrl, shortCircuit: true }
    }
    const replacement = generateRouteModules.get(specifier)
    if (replacement) return { url: replacement, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

function privateGenerateReport(overrides = {}) {
  return {
    id: REPORT_ID,
    plan_code: 'C',
    status: 'completed',
    client_name: 'Synthetic',
    pdf_url: `private-reports/${REPORT_ID}/report.pdf`,
    report_result: { ai_content: 'Synthetic report' },
    birth_data: { locale: 'zh-TW' },
    customer_email: 'owner@example.invalid',
    user_id: 'owner-user-id',
    stripe_session_id: 'cs_synthetic',
    access_token: ACCESS_TOKEN,
    ...overrides,
  }
}

function privateGenerateSupabase(state) {
  return {
    from(table) {
      assert.equal(table, 'paid_reports')
      let operation = 'select'
      let updatePayload = null
      const query = {
        select() { return query },
        update(payload) { operation = 'update'; updatePayload = payload; return query },
        eq() { return query },
        is() { return query },
        async maybeSingle() { return { data: state.report, error: state.selectError ?? null } },
        then(resolve, reject) {
          if (operation === 'update') {
            state.updatePayloads.push(updatePayload)
            const updateData = Object.hasOwn(state, 'updateData')
              ? state.updateData
              : [{ id: REPORT_ID }]
            return Promise.resolve({ data: updateData, error: state.updateError ?? null }).then(resolve, reject)
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        },
      }
      return query
    },
    storage: {
      from(bucket) {
        return {
          async info(path) {
            state.infoCalls.push({ bucket, path })
            return state.infoResult
          },
          async download(path) {
            state.downloadCalls.push({ bucket, path })
            return state.downloadResult
          },
          async upload(path, bytes, options) {
            state.uploadCalls.push({ bucket, path, bytes: Buffer.from(bytes), options })
            return { data: null, error: state.uploadError ?? null }
          },
          async remove(paths) {
            state.removeCalls ??= []
            state.removeCalls.push({ bucket, paths })
            return { data: paths, error: state.removeError ?? null }
          },
          getPublicUrl() {
            state.publicUrlCalls += 1
            return { data: { publicUrl: 'https://public-storage.invalid/forbidden.pdf' } }
          },
        }
      },
    },
  }
}

process.env.NEXT_PUBLIC_API_URL = 'https://calculator.example.invalid'
const { POST: generatePrivatePdf } = await import('../app/api/reports/generate-pdf/route.ts')

test('a cached C pointer with no canonical object is regenerated into private storage before availability is returned', async () => {
  const state = {
    report: privateGenerateReport(),
    selectError: null,
    infoResult: { data: null, error: { message: 'synthetic missing object' } },
    downloadResult: { data: null, error: { message: 'must not download missing object' } },
    updateError: null,
    uploadError: null,
    infoCalls: [],
    downloadCalls: [],
    uploadCalls: [],
    removeCalls: [],
    updatePayloads: [],
    publicUrlCalls: 0,
  }
  globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
  const originalFetch = globalThis.fetch
  let pythonCalls = 0
  globalThis.fetch = async () => {
    pythonCalls += 1
    return Response.json({ pdf_base64: Buffer.from(PDF_BYTES).toString('base64') })
  }
  try {
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { pdf_available: true, cached: false })
    assert.equal(pythonCalls, 1)
    assert.deepEqual(state.infoCalls, [{ bucket: 'private-reports', path: `${REPORT_ID}/report.pdf` }])
    assert.equal(state.uploadCalls.length, 1)
    assert.equal(state.updatePayloads.length, 1)
    assert.match(
      state.updatePayloads[0].pdf_url,
      new RegExp(`^private-reports/${REPORT_ID}/generations/[0-9a-f-]{36}\\.pdf$`, 'u'),
    )
    assert.equal(state.uploadCalls[0].options.upsert, false)
    assert.match(
      state.uploadCalls[0].path,
      new RegExp(`^${REPORT_ID}/generations/[0-9a-f-]{36}\\.pdf$`, 'u'),
    )
    assert.deepEqual(state.removeCalls, [])
    assert.equal(state.publicUrlCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid or oversized calculator PDF bytes fail before storage upload and pointer update', async () => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1)
  oversized.write('%PDF-', 0, 'ascii')
  const responses = [
    Buffer.from('not a PDF payload').toString('base64'),
    oversized.toString('base64'),
  ]

  for (const pdfBase64 of responses) {
    const state = {
      report: privateGenerateReport({ pdf_url: null }),
      selectError: null,
      infoResult: { data: null, error: null },
      downloadResult: { data: null, error: null },
      updateError: null,
      uploadError: null,
      infoCalls: [],
      downloadCalls: [],
      uploadCalls: [],
      updatePayloads: [],
      publicUrlCalls: 0,
    }
    globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => Response.json({ pdf_base64: pdfBase64 })
    try {
      const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
      }))
      assert.equal(response.status, 500)
      assert.equal(state.uploadCalls.length, 0)
      assert.equal(state.updatePayloads.length, 0)
      assert.equal(state.publicUrlCalls, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  }
})

test('private PDF upload never returns available when persisting its canonical pointer fails', async () => {
  const state = {
    report: privateGenerateReport({ pdf_url: null }),
    selectError: null,
    infoResult: { data: null, error: null },
    downloadResult: { data: null, error: null },
    updateError: { message: 'synthetic database write failure' },
    uploadError: null,
    infoCalls: [],
    downloadCalls: [],
    uploadCalls: [],
    updatePayloads: [],
    publicUrlCalls: 0,
  }
  globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    pdf_base64: Buffer.from(PDF_BYTES).toString('base64'),
  })
  try {
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 500)
    const body = await response.json()
    assert.notEqual(body.pdf_available, true)
    assert.equal(state.uploadCalls.length, 1)
    assert.equal(state.updatePayloads.length, 1)
    assert.equal(state.publicUrlCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a zero-row PDF pointer CAS never returns availability', async () => {
  const state = {
    report: privateGenerateReport({ pdf_url: null }),
    selectError: null,
    infoResult: { data: null, error: null },
    downloadResult: { data: null, error: null },
    updateError: null,
    updateData: [],
    uploadError: null,
    infoCalls: [],
    downloadCalls: [],
    uploadCalls: [],
    updatePayloads: [],
    publicUrlCalls: 0,
  }
  globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    pdf_base64: Buffer.from(PDF_BYTES).toString('base64'),
  })
  try {
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 500)
    assert.notEqual((await response.json()).pdf_available, true)
    assert.equal(state.uploadCalls.length, 1)
    assert.equal(state.updatePayloads.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('terminal reports never expose a stale cached PDF object', async () => {
  for (const status of ['failed', 'refunded', 'needs_human_review']) {
    const state = {
      report: privateGenerateReport({ status }),
      selectError: null,
      infoResult: {
        data: {
          bucketId: 'private-reports',
          name: `${REPORT_ID}/report.pdf`,
          contentType: 'application/pdf',
          size: PDF_BYTES.byteLength,
        },
        error: null,
      },
      downloadResult: { data: new Blob([PDF_BYTES], { type: 'application/pdf' }), error: null },
      updateError: null,
      uploadError: null,
      infoCalls: [],
      downloadCalls: [],
      uploadCalls: [],
      updatePayloads: [],
      publicUrlCalls: 0,
    }
    globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 409, status)
    assert.equal(state.infoCalls.length, 0, status)
    assert.equal(state.downloadCalls.length, 0, status)
  }
})

test('declared oversized calculator responses fail before their body is read', async () => {
  const state = {
    report: privateGenerateReport({ pdf_url: null }),
    selectError: null,
    infoResult: { data: null, error: null },
    downloadResult: { data: null, error: null },
    updateError: null,
    uploadError: null,
    infoCalls: [],
    downloadCalls: [],
    uploadCalls: [],
    updatePayloads: [],
    publicUrlCalls: 0,
  }
  globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
  const originalFetch = globalThis.fetch
  let bodyPulls = 0
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      bodyPulls += 1
      controller.enqueue(new TextEncoder().encode(JSON.stringify({
        pdf_base64: Buffer.from(PDF_BYTES).toString('base64'),
      })))
      controller.close()
    },
  }), {
    headers: {
      'content-type': 'application/json',
      'content-length': '999999999',
    },
  })
  try {
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 500)
    // The Fetch implementation may pull one queued chunk while constructing
    // the Response. The gate must still reject from headers without draining
    // or materializing the declared oversized payload.
    assert.ok(bodyPulls <= 1)
    assert.equal(state.uploadCalls.length, 0)
    assert.equal(state.updatePayloads.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('only a byte-verified canonical private object may use the cached availability response', async () => {
  const state = {
    report: privateGenerateReport(),
    selectError: null,
    infoResult: {
      data: {
        bucketId: 'private-reports',
        name: `${REPORT_ID}/report.pdf`,
        contentType: 'application/pdf',
        size: PDF_BYTES.byteLength,
      },
      error: null,
    },
    downloadResult: { data: new Blob([PDF_BYTES], { type: 'application/pdf' }), error: null },
    updateError: null,
    uploadError: null,
    infoCalls: [],
    downloadCalls: [],
    uploadCalls: [],
    updatePayloads: [],
    publicUrlCalls: 0,
  }
  globalThis.__privatePdfGenerateSupabase = privateGenerateSupabase(state)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('verified cached private object must not regenerate')
  try {
    const response = await generatePrivatePdf(new Request('https://jianyuan.life/api/reports/generate-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_id: REPORT_ID, access_token: ACCESS_TOKEN }),
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { pdf_available: true, cached: true })
    assert.deepEqual(state.downloadCalls, [{ bucket: 'private-reports', path: `${REPORT_ID}/report.pdf` }])
    assert.equal(state.uploadCalls.length, 0)
    assert.equal(state.updatePayloads.length, 0)
    assert.equal(state.publicUrlCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
