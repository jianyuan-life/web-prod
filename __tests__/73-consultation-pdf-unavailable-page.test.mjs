import assert from 'node:assert/strict'
import test from 'node:test'

import { createConsultationPdfUnavailablePage } from '../lib/consultation/pdf/unavailable-page.ts'

test('temporary PDF failures render a private, recoverable HTML page', async () => {
  const response = createConsultationPdfUnavailablePage({
    status: 503,
    reportHref: '/consultation/view?session=abcdefghijklmnopqrstuv',
    retryHref: '/api/consultation/pdf?session=abcdefghijklmnopqrstuv',
  })
  const body = await response.text()
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type') || '', /text\/html/u)
  assert.match(response.headers.get('cache-control') || '', /no-store/u)
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/u)
  assert.match(body, /PDF 目前無法下載/u)
  assert.match(body, /再試一次/u)
  assert.match(body, /回到線上報告/u)
  assert.doesNotMatch(body, /pdf_unavailable/u)
})

test('expired PDF sessions explain the next step and reject unsafe hrefs', async () => {
  const response = createConsultationPdfUnavailablePage({
    status: 404,
    reportHref: 'https://attacker.invalid/',
    retryHref: '//attacker.invalid/',
  })
  const body = await response.text()
  assert.match(body, /下載連結已失效/u)
  assert.match(body, /href="\/dashboard"/u)
  assert.doesNotMatch(body, /attacker\.invalid/u)
  assert.doesNotMatch(body, />再試一次</u)
})
