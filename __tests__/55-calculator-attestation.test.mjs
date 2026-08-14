import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CalculatorAttestationError,
  createCalculatorRequestAuthenticationHeaders,
  createCalculatorAttestationNonce,
  verifyCalculatorResponseAttestation,
} from '../lib/consultation/calculator-attestation.ts'

const secret = 'test-only-attestation-key-material-32-bytes-minimum'
const nonce = 'abcdefghijklmnopqrstuv'
const requestBody = '{"name":"synthetic","year":1990}'
const responseBody = '{"systems_count":15,"client_data":{"name":"synthetic"},"analyses":[]}'
const headers = {
  'X-Jianyuan-Attestation-Algorithm': 'HMAC-SHA256',
  'X-Jianyuan-Attestation-Issued-At': '1786200000',
  'X-Jianyuan-Attestation-Key-Id': 'primary',
  'X-Jianyuan-Attestation-Method': 'POST',
  'X-Jianyuan-Attestation-Nonce': nonce,
  'X-Jianyuan-Attestation-Path': '/api/calculate',
  'X-Jianyuan-Attestation-Release-Id': 'git:calculator-release',
  'X-Jianyuan-Attestation-Request-SHA256': '3d9bc4badea6e65fb1981245f42b6f3578ac89123d87d47a4b06c1298c968a69',
  'X-Jianyuan-Attestation-Response-SHA256': '96edc595a38effba28ba4d9a825e84d152edbfb2bc9ff2f714df92dd7d4e6bf4',
  'X-Jianyuan-Attestation-Signature': '90227f8b8b5b95d55ee1967f8562bb9460f88e64c84f21a47fdd96fe03384063',
  'X-Jianyuan-Attestation-Status': '200',
  'X-Jianyuan-Attestation-Version': 'jianyuan.fly.response.v1',
  'X-Jianyuan-Calculator-Code-SHA256': 'a'.repeat(64),
}

function verify(overrides = {}) {
  return verifyCalculatorResponseAttestation({
    responseBody,
    responseHeaders: headers,
    responseStatusCode: 200,
    requestBody,
    method: 'POST',
    path: '/api/calculate',
    expectedNonce: nonce,
    secret,
    expectedReleaseId: 'git:calculator-release',
    expectedCalculatorCodeSha256: 'a'.repeat(64),
    expectedKeyId: 'primary',
    nowSeconds: 1786200010,
    ...overrides,
  })
}

test('TypeScript 驗章端接受 Python 產生的 exact-byte 跨語言 fixture', () => {
  const result = verify()
  assert.equal(result.response.systems_count, 15)
  assert.equal(result.receipt.releaseId, 'git:calculator-release')
  assert.equal(result.receipt.requestHash, `sha256:${headers['X-Jianyuan-Attestation-Request-SHA256']}`)
  assert.equal(result.receipt.responseHash, `sha256:${headers['X-Jianyuan-Attestation-Response-SHA256']}`)
})

test('response/request/status/nonce/release/code/key 任一漂移都 fail closed', () => {
  const cases = [
    { responseBody: `${responseBody} ` },
    { requestBody: `${requestBody} ` },
    { responseStatusCode: 503 },
    { expectedNonce: 'zzzzzzzzzzzzzzzzzzzzzz' },
    { expectedReleaseId: 'git:other-release' },
    { expectedCalculatorCodeSha256: 'b'.repeat(64) },
    { expectedKeyId: 'rotated' },
  ]
  for (const candidate of cases) {
    assert.throws(() => verify(candidate), CalculatorAttestationError)
  }
})

test('缺 header、簽章竄改、過期或未來回應都不可 JSON.parse 後採用', () => {
  const missing = { ...headers }
  delete missing['X-Jianyuan-Attestation-Signature']
  const tampered = { ...headers, 'X-Jianyuan-Attestation-Signature': '0'.repeat(64) }
  assert.throws(() => verify({ responseHeaders: missing }), CalculatorAttestationError)
  assert.throws(() => verify({ responseHeaders: tampered }), CalculatorAttestationError)
  assert.throws(() => verify({ nowSeconds: 1786201000 }), CalculatorAttestationError)
  assert.throws(() => verify({ nowSeconds: 1786199900 }), CalculatorAttestationError)
})

test('每次 request 都產生至少 128-bit 的 base64url nonce', () => {
  const values = Array.from({ length: 32 }, () => createCalculatorAttestationNonce())
  assert.equal(new Set(values).size, values.length)
  assert.ok(values.every((value) => /^[A-Za-z0-9_-]{22,128}$/u.test(value)))
})

test('strict request HMAC binds exact body, nonce, route and timestamp', () => {
  const auth = createCalculatorRequestAuthenticationHeaders({
    requestBody,
    method: 'POST',
    path: '/api/consultation/v1/calculate',
    nonce,
    secret,
    keyId: 'primary',
    issuedAt: 1786200000,
  })
  assert.deepEqual(auth, {
    'X-Jianyuan-Request-Version': 'jianyuan.fly.request.v1',
    'X-Jianyuan-Request-Key-Id': 'primary',
    'X-Jianyuan-Request-Issued-At': '1786200000',
    'X-Jianyuan-Request-Signature': '69ecd4c54954846aa17371857cc4f3d9d4c777a37863817e621052c22d9f522a',
  })
  assert.notEqual(
    auth['X-Jianyuan-Request-Signature'],
    createCalculatorRequestAuthenticationHeaders({
      requestBody: `${requestBody} `,
      method: 'POST',
      path: '/api/consultation/v1/calculate',
      nonce,
      secret,
      keyId: 'primary',
      issuedAt: 1786200000,
    })['X-Jianyuan-Request-Signature'],
  )
})
