// Python producer → Node verifier, over bytes the real Fly app actually emitted.
//
// Test 55 pins a hand-written header set: it proves the verifier is internally
// consistent, not that the two languages agree.  The fixture loaded here comes
// out of `api_server/tests/generate_attestation_fixture.py`, which runs the
// actual FastAPI app through TestClient and records the exact request bytes,
// response bytes and emitted headers.  If either side changes its framing, its
// field order, or its byte-length accounting, this test goes red.
//
// The secret in the fixture is a fixed test string, not production material.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  CalculatorAttestationError,
  CALCULATOR_ATTESTATION_HEADERS,
  verifyCalculatorResponseAttestation,
} from '../lib/consultation/calculator-attestation.ts'
import { CONSULTATION_CALCULATE_PATH } from '../lib/consultation/calculator-request.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  readFileSync(join(here, 'fixtures', 'consultation-v1-attestation.json'), 'utf8'),
)

const requestBody = Buffer.from(fixture.requestBodyBase64, 'base64')
const responseBody = Buffer.from(fixture.responseBodyBase64, 'base64')
const issuedAt = Number(fixture.headers['X-Jianyuan-Attestation-Issued-At'])

function verify(overrides = {}) {
  return verifyCalculatorResponseAttestation({
    responseBody,
    responseHeaders: fixture.headers,
    responseStatusCode: fixture.statusCode,
    requestBody,
    method: 'POST',
    path: CONSULTATION_CALCULATE_PATH,
    expectedNonce: fixture.nonce,
    secret: fixture.secret,
    expectedReleaseId: fixture.releaseId,
    expectedCalculatorCodeSha256: fixture.calculatorCodeSha256,
    expectedKeyId: fixture.keyId,
    nowSeconds: issuedAt + 5,
    ...overrides,
  })
}

test('Node verifier 接受 Python producer 實際送出的 bytes', () => {
  const result = verify()
  assert.equal(result.receipt.requestHash, `sha256:${fixture.requestSha256}`)
  assert.equal(result.receipt.responseHash, `sha256:${fixture.responseSha256}`)
  assert.equal(result.receipt.releaseId, fixture.releaseId)
  assert.equal(result.receipt.keyId, fixture.keyId)
})

test('fixture 是嚴格端點的回應,不是 legacy /api/calculate', () => {
  assert.equal(fixture.path, CONSULTATION_CALCULATE_PATH)
  assert.equal(fixture.headers['X-Jianyuan-Attestation-Path'], CONSULTATION_CALCULATE_PATH)
  assert.notEqual(fixture.path, '/api/calculate')
})

test('回應本身帶三態台帳與 analysis_context', () => {
  const body = JSON.parse(responseBody.toString('utf8'))
  assert.equal(body.analysis_context.mode, 'consultation_v1')
  assert.equal(body.analysis_context.as_of, '2026-08-09')
  assert.equal(body.analysis_context.target_year, 2026)
  assert.equal(body.analysis_context.birth_timezone, 'Asia/Taipei')
  assert.equal(body.analysis_context.reference_timezone, 'Asia/Hong_Kong')
  assert.equal(body.successful_systems.length, 15)
  assert.deepEqual(body.held_systems, [])
  assert.deepEqual(body.failed_systems, [])
  for (const analysis of body.analyses) {
    assert.notEqual(analysis.sub_summary, '計算異常')
  }
})

test('release identity 是 calculator-bundle/v2,不是會自我參照的 fly-release/v1', () => {
  assert.match(
    fixture.headers['X-Jianyuan-Attestation-Release-Id'],
    /^calculator-bundle\/v2\|app=[^|]+\|digest=sha256:[0-9a-f]{64}\|git=[0-9a-f]{40}\|manifest=sha256:[0-9a-f]{64}$/u,
  )
  assert.doesNotMatch(fixture.headers['X-Jianyuan-Attestation-Release-Id'], /^fly-release\/v1\|/u)
})

test('13 個 header 全數由 Python 端產出,沒有缺漏', () => {
  const missing = Object.values(CALCULATOR_ATTESTATION_HEADERS)
    .filter((name) => !(name in fixture.headers))
  assert.deepEqual(missing, [])
})

test('任何一 byte 的竄改都 fail closed', () => {
  const cases = [
    ['response body', { responseBody: Buffer.concat([responseBody, Buffer.from(' ')]) }],
    ['request body', { requestBody: Buffer.concat([requestBody, Buffer.from(' ')]) }],
    ['status code', { responseStatusCode: 503 }],
    ['nonce', { expectedNonce: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' }],
    ['release id', { expectedReleaseId: `${fixture.releaseId}x` }],
    ['code hash', { expectedCalculatorCodeSha256: 'b'.repeat(64) }],
    ['key id', { expectedKeyId: 'other' }],
    ['secret', { secret: 'another-test-key-material-32-bytes-minimum-x' }],
    ['signed path', { path: '/api/calculate' }],
  ]
  for (const [label, override] of cases) {
    assert.throws(
      () => verify(override),
      CalculatorAttestationError,
      `${label} 被竄改後仍然通過驗章`,
    )
  }
})

test('簽章過期與未來時間都拒絕', () => {
  assert.throws(() => verify({ nowSeconds: issuedAt + 3600 }), CalculatorAttestationError)
  assert.throws(() => verify({ nowSeconds: issuedAt - 3600 }), CalculatorAttestationError)
})

test('每個 header 逐一缺席都要報出正確的欄位名', () => {
  for (const [field, name] of Object.entries(CALCULATOR_ATTESTATION_HEADERS)) {
    const withoutOne = { ...fixture.headers }
    delete withoutOne[name]
    assert.throws(
      () => verify({ responseHeaders: withoutOne }),
      (error) => error instanceof CalculatorAttestationError
        && error.code === `header.missing:${field}`,
      `缺少 ${name} 時沒有回報 header.missing:${field}`,
    )
  }
})
