import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CHUMENJI_TOP_PATH,
  GENERATE_PDF_PATH,
  LEGACY_CALCULATE_PATH,
} from '../lib/consultation/calculator-request.ts'
import { createSignedCalculatorPost } from '../lib/consultation/calculator-request-auth.server.ts'

const environment = {
  CALCULATOR_ATTESTATION_SECRET: 'test-only-attestation-key-material-32-bytes-minimum',
  CALCULATOR_ATTESTATION_KEY_ID: 'primary',
}

test('all legacy paid Fly paths sign and send the same exact JSON bytes', () => {
  for (const path of [LEGACY_CALCULATE_PATH, GENERATE_PDF_PATH, CHUMENJI_TOP_PATH]) {
    const signed = createSignedCalculatorPost({
      path,
      payload: { synthetic: true, nested: { value: 7 } },
      environment,
      nonce: 'abcdefghijklmnopqrstuv',
      issuedAt: 1786200000,
    })
    assert.equal(signed.body, '{"synthetic":true,"nested":{"value":7}}')
    assert.equal(signed.headers['X-Jianyuan-Attestation-Nonce'], signed.nonce)
    assert.equal(signed.headers['X-Jianyuan-Request-Version'], 'jianyuan.fly.request.v1')
    assert.equal(signed.headers['X-Jianyuan-Request-Key-Id'], 'primary')
    assert.match(signed.headers['X-Jianyuan-Request-Signature'], /^[0-9a-f]{64}$/u)
  }
})

test('signature is bound to route and body', () => {
  const common = {
    environment,
    nonce: 'abcdefghijklmnopqrstuv',
    issuedAt: 1786200000,
  }
  const calculate = createSignedCalculatorPost({
    ...common, path: LEGACY_CALCULATE_PATH, payload: { value: 1 },
  })
  const pdf = createSignedCalculatorPost({
    ...common, path: GENERATE_PDF_PATH, payload: { value: 1 },
  })
  const changed = createSignedCalculatorPost({
    ...common, path: LEGACY_CALCULATE_PATH, payload: { value: 2 },
  })
  assert.notEqual(
    calculate.headers['X-Jianyuan-Request-Signature'],
    pdf.headers['X-Jianyuan-Request-Signature'],
  )
  assert.notEqual(
    calculate.headers['X-Jianyuan-Request-Signature'],
    changed.headers['X-Jianyuan-Request-Signature'],
  )
})

test('missing secret or key id fails before fetch', () => {
  assert.throws(() => createSignedCalculatorPost({
    path: LEGACY_CALCULATE_PATH,
    payload: {},
    environment: {},
  }))
})

test('every paid Web-to-Fly legacy call site uses the signed exact-body helper', () => {
  const callSites = [
    ['workflows/generate-report/steps.ts', [
      'LEGACY_CALCULATE_PATH', 'CHUMENJI_TOP_PATH', 'GENERATE_PDF_PATH',
    ]],
    ['app/api/generate-report/route.ts', [
      'LEGACY_CALCULATE_PATH', 'GENERATE_PDF_PATH',
    ]],
    ['app/api/reports/generate-pdf/route.ts', ['GENERATE_PDF_PATH']],
  ]

  for (const [relativePath, paths] of callSites) {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
    assert.match(source, /createSignedCalculatorPost\s*\(/u, `${relativePath} 必須簽章`)
    for (const pathName of paths) {
      assert.match(
        source,
        new RegExp(`createSignedCalculatorPost\\s*\\(\\s*\\{[\\s\\S]*?path:\\s*${pathName}`, 'u'),
        `${relativePath} 的 ${pathName} 必須由 signed helper 建立 exact body`,
      )
      assert.doesNotMatch(
        source,
        new RegExp(`fetch\\s*\\(\\s*[\\x60'\"]\\$?\\{?PYTHON_API\\}?/api/${pathName === 'LEGACY_CALCULATE_PATH' ? 'calculate' : pathName === 'GENERATE_PDF_PATH' ? 'generate-pdf' : 'chumenji-top'}`, 'u'),
        `${relativePath} 不得繞過 helper 寫回 raw path`,
      )
    }
  }
})
