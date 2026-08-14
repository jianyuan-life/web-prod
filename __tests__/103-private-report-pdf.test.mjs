import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createPrivateReportPdfResponse,
  resolveStoredReportPdfLocation,
} from '../lib/report/private-pdf.ts'
import { getReportPdfStorageTarget } from '../lib/report/pdf-storage.ts'

const REPORT_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_REPORT_ID = '123e4567-e89b-42d3-a456-426614174001'
const ACCESS_TOKEN = '6d9123c8-9f7a-4c11-a841-20a54dfe91bc'
const SUPABASE_URL = 'https://jvmnntavizbjsgofnusy.supabase.co'
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\nprivate fixture')

function reportRow(overrides = {}) {
  return {
    id: REPORT_ID,
    user_id: 'owner-user-id',
    customer_email: 'owner@example.test',
    access_token: ACCESS_TOKEN,
    pdf_url: `${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}/report.pdf`,
    status: 'completed',
    plan_code: 'C',
    client_name: '測試客戶',
    deleted_at: null,
    ...overrides,
  }
}

function pdfBlob(bytes = PDF_BYTES, type = 'application/pdf') {
  return new Blob([bytes], { type })
}

function request(body, headers = {}) {
  return new Request('https://jianyuan.life/api/reports/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function dependencies(overrides = {}) {
  return {
    supabaseUrl: SUPABASE_URL,
    findByAccessToken: async () => ({ data: reportRow(), error: null }),
    findById: async () => ({ data: reportRow(), error: null }),
    authenticate: async () => ({
      userId: 'owner-user-id',
      email: 'owner@example.test',
      source: 'admin-verified',
    }),
    info: async (bucket, path) => ({
      data: {
        bucketId: bucket,
        name: path,
        size: PDF_BYTES.byteLength,
        contentType: 'application/pdf',
      },
      error: null,
    }),
    download: async () => ({ data: pdfBlob(), error: null }),
    ...overrides,
  }
}

test('historic public URLs and canonical markers resolve only to the row-bound object', () => {
  const cases = [
    [`${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}/report.pdf`, 'reports'],
    [`${SUPABASE_URL}/storage/v1/object/sign/reports/${REPORT_ID}/report.pdf?token=historic`, 'reports'],
    [`reports/${REPORT_ID}/report.pdf`, 'reports'],
    [`${REPORT_ID}/report.pdf`, 'reports'],
    [`private-reports/${REPORT_ID}/report.pdf`, 'private-reports'],
  ]
  for (const [value, bucket] of cases) {
    assert.deepEqual(resolveStoredReportPdfLocation(REPORT_ID, value, SUPABASE_URL), {
      bucket,
      path: `${REPORT_ID}/report.pdf`,
    })
  }

  for (const value of [
    `${SUPABASE_URL}/storage/v1/object/public/reports/${OTHER_REPORT_ID}/report.pdf`,
    `${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}/other.pdf`,
    `https://attacker.invalid/storage/v1/object/public/reports/${REPORT_ID}/report.pdf`,
    `${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}%2freport.pdf`,
    `${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}/report.pdf#fragment`,
    `reports/../${REPORT_ID}/report.pdf`,
    'javascript:alert(1)',
  ]) {
    assert.equal(resolveStoredReportPdfLocation(REPORT_ID, value, SUPABASE_URL), null, value)
  }
})

test('only C/G15 target private-reports; E3 and every other plan keep the reports contract', () => {
  for (const planCode of ['C', 'G15', ' c ', 'g15']) {
    assert.deepEqual(getReportPdfStorageTarget(planCode, REPORT_ID), {
      bucket: 'private-reports',
      path: `${REPORT_ID}/report.pdf`,
      privateReference: `private-reports/${REPORT_ID}/report.pdf`,
    })
  }
  for (const planCode of ['A', 'G3', 'M', 'Y', 'D', 'R', 'E1', 'E2', 'E3', 'E4']) {
    assert.deepEqual(getReportPdfStorageTarget(planCode, REPORT_ID), {
      bucket: 'reports',
      path: `${REPORT_ID}/report.pdf`,
      privateReference: null,
    })
  }
  assert.throws(
    () => getReportPdfStorageTarget('FUTURE_PLAN', REPORT_ID),
    /unknown report PDF plan/u,
  )
  for (const unsafeId of ['../report', `${REPORT_ID}/other`, 'not-a-uuid']) {
    assert.throws(
      () => getReportPdfStorageTarget('C', unsafeId),
      /invalid report PDF id/u,
    )
  }
})

test('access-token holder receives a private streamed PDF without a redirect or token-bearing URL', async () => {
  const seen = { token: '', path: '' }
  const response = await createPrivateReportPdfResponse(
    request({ access_token: ACCESS_TOKEN }),
    dependencies({
      findByAccessToken: async (token) => {
        seen.token = token
        return { data: reportRow(), error: null }
      },
      download: async (bucket, path) => {
        assert.equal(bucket, 'reports')
        seen.path = path
        return { data: pdfBlob(), error: null }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(seen.token, ACCESS_TOKEN)
  assert.equal(seen.path, `${REPORT_ID}/report.pdf`)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.match(response.headers.get('content-disposition') || '', /attachment/iu)
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/iu)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('location'), null)
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('ascii'), '%PDF-')
  const headers = [...response.headers.entries()].map(([key, value]) => `${key}:${value}`).join('\n')
  assert.equal(headers.includes(ACCESS_TOKEN), false)
  assert.equal(headers.includes('supabase.co'), false)
})

test('verified owner may select by report id; email fallback applies only to legacy rows without user_id', async () => {
  const owner = await createPrivateReportPdfResponse(
    request({ report_id: REPORT_ID }),
    dependencies(),
  )
  assert.equal(owner.status, 200)

  const legacy = await createPrivateReportPdfResponse(
    request({ report_id: REPORT_ID }),
    dependencies({
      findById: async () => ({ data: reportRow({ user_id: null }), error: null }),
      authenticate: async () => ({
        userId: 'new-user-id',
        email: 'OWNER@example.test',
        source: 'admin-verified',
      }),
    }),
  )
  assert.equal(legacy.status, 200)

  const mismatchedBoundOwner = await createPrivateReportPdfResponse(
    request({ report_id: REPORT_ID }),
    dependencies({
      authenticate: async () => ({
        userId: 'attacker-user-id',
        email: 'owner@example.test',
        source: 'admin-verified',
      }),
    }),
  )
  assert.equal(mismatchedBoundOwner.status, 404)
})

test('selector confusion, arbitrary paths, unavailable rows, and invalid auth fail closed before download', async () => {
  const candidates = [
    {},
    { access_token: ACCESS_TOKEN, report_id: REPORT_ID },
    { access_token: ACCESS_TOKEN, path: `${REPORT_ID}/report.pdf` },
    { report_id: '../report.pdf' },
    { pdf_url: `${SUPABASE_URL}/storage/v1/object/public/reports/${REPORT_ID}/report.pdf` },
  ]
  for (const body of candidates) {
    let downloads = 0
    const response = await createPrivateReportPdfResponse(request(body), dependencies({
      download: async () => {
        downloads += 1
        return { data: pdfBlob(), error: null }
      },
    }))
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.equal(downloads, 0)
  }

  for (const overrides of [
    { findByAccessToken: async () => ({ data: null, error: null }) },
    { findByAccessToken: async () => ({ data: reportRow({ status: 'generating' }), error: null }) },
    { findByAccessToken: async () => ({ data: reportRow({ plan_code: 'E3' }), error: null }) },
    { findByAccessToken: async () => ({ data: reportRow({ deleted_at: '2026-08-13T00:00:00Z' }), error: null }) },
    { findByAccessToken: async () => ({ data: reportRow({ access_token: 'different-token-value-123456789' }), error: null }) },
    { findByAccessToken: async () => ({ data: reportRow({ pdf_url: `${OTHER_REPORT_ID}/report.pdf` }), error: null }) },
    { authenticate: async () => ({ userId: null, email: null, source: 'no-token' }) },
  ]) {
    let downloads = 0
    const body = Object.hasOwn(overrides, 'authenticate')
      ? { report_id: REPORT_ID }
      : { access_token: ACCESS_TOKEN }
    const response = await createPrivateReportPdfResponse(request(body), dependencies({
      ...overrides,
      download: async () => {
        downloads += 1
        return { data: pdfBlob(), error: null }
      },
    }))
    assert.equal(response.status, 404)
    assert.equal(downloads, 0)
    assert.equal((await response.text()).includes(ACCESS_TOKEN), false)
  }
})

test('orphan, oversized, mislabeled, or non-PDF storage objects never reach the client', async () => {
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1)
  oversized.set(new TextEncoder().encode('%PDF-'))
  const cases = [
    { data: null, error: { message: 'Object not found' } },
    { data: pdfBlob(oversized), error: null },
    { data: pdfBlob(PDF_BYTES, 'application/octet-stream'), error: null },
    { data: pdfBlob(new TextEncoder().encode('not a PDF')), error: null },
  ]
  for (const result of cases) {
    const response = await createPrivateReportPdfResponse(
      request({ access_token: ACCESS_TOKEN }),
      dependencies({ download: async () => result }),
    )
    assert.notEqual(response.status, 200)
    assert.match(response.headers.get('cache-control') || '', /no-store/iu)
    const body = await response.text()
    assert.equal(body.includes('Object not found'), false)
    assert.equal(body.includes(ACCESS_TOKEN), false)
  }
})

test('storage metadata rejects oversized or mislabeled legacy objects before download allocates the Blob', async () => {
  const metadataCases = [
    { bucketId: 'reports', name: `${REPORT_ID}/report.pdf`, size: 5 * 1024 * 1024 + 1, contentType: 'application/pdf' },
    { bucketId: 'reports', name: `${REPORT_ID}/report.pdf`, size: PDF_BYTES.byteLength, contentType: 'application/octet-stream' },
    { bucketId: 'private-reports', name: `${REPORT_ID}/report.pdf`, size: PDF_BYTES.byteLength, contentType: 'application/pdf' },
    { bucketId: 'reports', name: `${REPORT_ID}/report.pdf`, contentType: 'application/pdf' },
  ]

  for (const metadata of metadataCases) {
    let downloads = 0
    const response = await createPrivateReportPdfResponse(
      request({ access_token: ACCESS_TOKEN }),
      dependencies({
        info: async () => ({ data: metadata, error: null }),
        download: async () => {
          downloads += 1
          return { data: pdfBlob(), error: null }
        },
      }),
    )
    assert.equal(response.status, 409)
    assert.equal(downloads, 0)
  }
})

test('storage metadata size must match the downloaded object bytes', async () => {
  const differentPdf = new TextEncoder().encode('%PDF-1.7\ndifferent object bytes')
  const response = await createPrivateReportPdfResponse(
    request({ access_token: ACCESS_TOKEN }),
    dependencies({
      info: async (bucket, path) => ({
        data: {
          bucketId: bucket,
          name: path,
          size: PDF_BYTES.byteLength,
          contentType: 'application/pdf',
        },
        error: null,
      }),
      download: async () => ({ data: pdfBlob(differentPdf), error: null }),
    }),
  )

  assert.equal(response.status, 409)
  assert.match(response.headers.get('cache-control') || '', /no-store/iu)
})

test('C/G15 runtime consumers use the private proxy while frozen shared generators retain their contract', () => {
  const route = readFileSync(new URL('../app/api/reports/pdf/route.ts', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../components/PrivatePdfDownloadButton.tsx', import.meta.url), 'utf8')
  const clientRequest = readFileSync(new URL('../lib/report/private-pdf-client.ts', import.meta.url), 'utf8')
  const reportPage = readFileSync(new URL('../app/report/[token]/page.tsx', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../workflows/generate-report/steps.ts', import.meta.url), 'utf8')
  const fallback = readFileSync(new URL('../app/api/generate-report/route.ts', import.meta.url), 'utf8')
  const generatePdf = readFileSync(new URL('../app/api/reports/generate-pdf/route.ts', import.meta.url), 'utf8')

  assert.match(route, /createPrivateReportPdfResponse/iu)
  assert.match(client, /requestPrivateReportPdf/u)
  assert.match(clientRequest, /method:\s*['"]POST['"]/u)
  assert.match(clientRequest, /\/api\/reports\/generate-pdf/u)
  assert.match(clientRequest, /\/api\/reports\/pdf/u)
  assert.doesNotMatch(client, /access_token[^\n]{0,120}(?:href|location)/iu)
  assert.match(reportPage, /isConsultationPlan\(report\.plan_code\)[\s\S]{0,250}PrivatePdfDownloadButton/u)
  assert.match(dashboard, /isConsultationPlan\(r\.plan_code\)[\s\S]{0,300}PrivatePdfDownloadButton/u)
  for (const source of [workflow, fallback, generatePdf]) {
    assert.match(source, /getGeneratedReportPdfStorageTarget\(/u)
    assert.match(source, /storageTarget\.privateReference/u)
    assert.match(source, /upsert:\s*false/u)
  }
  assert.match(generatePdf, /report\.plan_code\s*===\s*'C'\s*\|\|\s*report\.plan_code\s*===\s*'G15'[\s\S]{0,180}pdf_available/u)
})

test('E3 remains on the calendar-only branch and never invokes the private PDF client', () => {
  const reportPage = readFileSync(new URL('../app/report/[token]/page.tsx', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.match(reportPage, /!isChumenji/u)
  assert.match(dashboard, /CHUMENJI_CODES\.has\(report\.plan_code\)/u)
  assert.doesNotMatch(reportPage, /plan_code\s*===\s*['"]E3['"][\s\S]{0,300}PrivatePdfDownloadButton/u)
})
