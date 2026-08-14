import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getGeneratedReportPdfStorageTarget,
  getReportPdfStorageTarget,
} from '../lib/report/pdf-storage.ts'
import { resolveStoredReportPdfLocation } from '../lib/report/private-pdf.ts'

const REPORT_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_REPORT_ID = '123e4567-e89b-42d3-a456-426614174001'
const GENERATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GENERATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUPABASE_URL = 'https://jvmnntavizbjsgofnusy.supabase.co'

test('each PDF producer gets an immutable generation-owned object path', () => {
  const first = getGeneratedReportPdfStorageTarget('C', REPORT_ID, GENERATION_A)
  const second = getGeneratedReportPdfStorageTarget('C', REPORT_ID, GENERATION_B)

  assert.deepEqual(first, {
    bucket: 'private-reports',
    path: `${REPORT_ID}/generations/${GENERATION_A}.pdf`,
    privateReference: `private-reports/${REPORT_ID}/generations/${GENERATION_A}.pdf`,
  })
  assert.deepEqual(second, {
    bucket: 'private-reports',
    path: `${REPORT_ID}/generations/${GENERATION_B}.pdf`,
    privateReference: `private-reports/${REPORT_ID}/generations/${GENERATION_B}.pdf`,
  })
  assert.notEqual(first.path, second.path)
  assert.equal(getReportPdfStorageTarget('C', REPORT_ID).path, `${REPORT_ID}/report.pdf`)
})

test('generation paths require canonical RFC 4122 UUIDs and remain report-bound', () => {
  for (const generationId of [
    '../report',
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa',
    `${GENERATION_A}/report`,
  ]) {
    assert.throws(
      () => getGeneratedReportPdfStorageTarget('C', REPORT_ID, generationId),
      /invalid report PDF generation id/u,
      generationId,
    )
  }

  const marker = `private-reports/${REPORT_ID}/generations/${GENERATION_A}.pdf`
  assert.deepEqual(resolveStoredReportPdfLocation(REPORT_ID, marker, SUPABASE_URL), {
    bucket: 'private-reports',
    path: `${REPORT_ID}/generations/${GENERATION_A}.pdf`,
  })
  assert.equal(resolveStoredReportPdfLocation(OTHER_REPORT_ID, marker, SUPABASE_URL), null)
  assert.equal(
    resolveStoredReportPdfLocation(
      REPORT_ID,
      `private-reports/${REPORT_ID}/generations/${GENERATION_A}.pdf/other`,
      SUPABASE_URL,
    ),
    null,
  )
})

test('historical canonical report.pdf pointers stay readable but are never generation-owned', () => {
  assert.deepEqual(
    resolveStoredReportPdfLocation(
      REPORT_ID,
      `private-reports/${REPORT_ID}/report.pdf`,
      SUPABASE_URL,
    ),
    { bucket: 'private-reports', path: `${REPORT_ID}/report.pdf` },
  )
})
