import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decodeCanonicalPdfBase64,
  readBoundedPdfResponse,
} from '../lib/report/pdf-bytes.ts'

test('valid base64 that does not contain PDF bytes is rejected', () => {
  const malicious = Buffer.from('not a PDF payload').toString('base64')
  assert.throws(
    () => decodeCanonicalPdfBase64(malicious),
    /invalid PDF bytes/u,
  )
})

test('only canonical RFC 4648 base64 is accepted', () => {
  const canonical = Buffer.from('%PDF-1.7\ncanonical fixture').toString('base64')
  const canonicalWithSymbols = Buffer.concat([
    Buffer.from('%PDF-', 'ascii'),
    Buffer.from([0xfb, 0xff, 0xff]),
  ]).toString('base64')
  const nonCanonical = [
    ` ${canonical}`,
    `${canonical}\n`,
    canonical.replace(/=+$/u, ''),
    `${canonical}=`,
    canonicalWithSymbols.replace(/\+/gu, '-').replace(/\//gu, '_'),
  ]
  for (const candidate of nonCanonical) {
    if (candidate === canonical) continue
    assert.throws(
      () => decodeCanonicalPdfBase64(candidate),
      /invalid PDF bytes/u,
      candidate,
    )
  }
})

test('PDF bytes outside the existing 8-byte to 5 MiB download contract are rejected', () => {
  const tooSmall = Buffer.from('%PDF-').toString('base64')
  const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1)
  tooLarge.write('%PDF-', 0, 'ascii')

  for (const candidate of [tooSmall, tooLarge.toString('base64')]) {
    assert.throws(
      () => decodeCanonicalPdfBase64(candidate),
      /invalid PDF bytes/u,
    )
  }
})

test('a canonical PDF within the byte contract is returned unchanged', () => {
  const expected = Buffer.from('%PDF-1.7\nvalid producer fixture')
  const actual = decodeCanonicalPdfBase64(expected.toString('base64'))
  assert.deepEqual(actual, expected)
})

test('a stalled response body is cancelled at the bounded reader deadline', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({
    pull() { return new Promise(() => {}) },
    cancel() { cancelled = true },
  }), { headers: { 'content-type': 'application/json' } })

  await assert.rejects(
    readBoundedPdfResponse(response, { timeoutMs: 10 }),
    /invalid PDF bytes/u,
  )
  assert.equal(cancelled, true)
})

test('the exact minimum and maximum byte boundaries remain accepted', () => {
  const minimum = Buffer.from('%PDF-123', 'ascii')
  const maximum = Buffer.alloc(5 * 1024 * 1024)
  maximum.write('%PDF-', 0, 'ascii')

  for (const expected of [minimum, maximum]) {
    assert.deepEqual(
      decodeCanonicalPdfBase64(expected.toString('base64')),
      expected,
    )
  }
})

test('the workflow producer validates calculator bytes before storage upload', () => {
  const source = readFileSync(
    new URL('../workflows/generate-report/steps.ts', import.meta.url),
    'utf8',
  )
  const validatorCall = source.indexOf('readBoundedPdfResponse(pdfRes)')
  const uploadCall = source.indexOf('.upload(storagePath, pdfBytes', validatorCall)
  assert.ok(validatorCall > 0, 'workflow PDF producer must use the canonical validator')
  assert.ok(uploadCall > validatorCall, 'workflow PDF validation must precede upload')
  assert.doesNotMatch(source, /pdfRes\.json\(\)|Buffer\.from\(pdfData\.pdf_base64,\s*['"]base64['"]\)/u)
})

test('the private download consumer uses the same PDF byte validator', () => {
  const source = readFileSync(
    new URL('../lib/report/private-pdf.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /assertValidPdfBytes\(bytes\)/u)
  assert.match(source, /MAX_REPORT_PDF_BYTES/u)
  assert.doesNotMatch(source, /MAX_PRIVATE_REPORT_PDF_BYTES\s*=\s*5\s*\*/u)
})
