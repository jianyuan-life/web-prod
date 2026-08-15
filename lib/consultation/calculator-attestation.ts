// v5.10.482 P0 修:本模組經 calculator-facts → steps 被拉進 Vercel Workflow 的
// orchestrator bundle;該 sandbox(vm.runInContext)沒有 require/node builtin、
// 頂層 import 'node:crypto' 會讓整條 generate-report workflow 起跑即
// ReferenceError(2026-08-15 production 實測 wrun_01M01SVM6F1RYMD4XYQJMN11RB)。
// 改為 runtime-neutral:SHA-256 用同目錄 sha256.ts 的 pure-JS 實作、
// HMAC/常數時間比對為標準構造、亂數 nonce 用 globalThis.crypto.getRandomValues
// (缺 WebCrypto 時 fail closed、絕不退化成弱亂數)。
import { sha256HexSync } from './sha256.ts'

export const CALCULATOR_ATTESTATION_VERSION = 'jianyuan.fly.response.v1'
export const CALCULATOR_ATTESTATION_ALGORITHM = 'HMAC-SHA256'
export const CALCULATOR_ATTESTATION_NONCE_HEADER = 'X-Jianyuan-Attestation-Nonce'

export const CALCULATOR_ATTESTATION_HEADERS = {
  version: 'X-Jianyuan-Attestation-Version',
  algorithm: 'X-Jianyuan-Attestation-Algorithm',
  key_id: 'X-Jianyuan-Attestation-Key-Id',
  issued_at: 'X-Jianyuan-Attestation-Issued-At',
  nonce: 'X-Jianyuan-Attestation-Nonce',
  method: 'X-Jianyuan-Attestation-Method',
  path: 'X-Jianyuan-Attestation-Path',
  release_id: 'X-Jianyuan-Attestation-Release-Id',
  calculator_code_sha256: 'X-Jianyuan-Calculator-Code-SHA256',
  request_hash: 'X-Jianyuan-Attestation-Request-SHA256',
  response_hash: 'X-Jianyuan-Attestation-Response-SHA256',
  status_code: 'X-Jianyuan-Attestation-Status',
  signature: 'X-Jianyuan-Attestation-Signature',
} as const

const SIGNING_FIELDS = [
  'version', 'algorithm', 'key_id', 'issued_at', 'nonce', 'method', 'path',
  'release_id', 'calculator_code_sha256', 'request_hash', 'response_hash',
  'status_code',
] as const
const HEX_SHA256 = /^[0-9a-f]{64}$/u
const NONCE = /^[A-Za-z0-9_-]{22,128}$/u

export type CalculatorAttestationHeaders = Record<keyof typeof CALCULATOR_ATTESTATION_HEADERS, string>

export type VerifiedCalculatorResponse<T extends object> = {
  response: T
  receipt: {
    version: typeof CALCULATOR_ATTESTATION_VERSION
    releaseId: string
    calculatorCodeSha256: string
    keyId: string
    issuedAt: number
    requestHash: `sha256:${string}`
    responseHash: `sha256:${string}`
    signatureHash: `sha256:${string}`
  }
}

export class CalculatorAttestationError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`Calculator response attestation rejected: ${code}`)
    this.name = 'CalculatorAttestationError'
    this.code = code
  }
}

function bytes(value: Uint8Array | string): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value
}

function sha256Hex(value: Uint8Array | string): string {
  return sha256HexSync(bytes(value))
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// HMAC-SHA256(RFC 2104、block size 64)、建立在 sha256.ts 的 pure-JS 核心上
function hmacSha256Hex(secret: Uint8Array | string, message: Uint8Array): string {
  let key = bytes(secret)
  if (key.length > 64) key = hexToBytes(sha256HexSync(key))
  const innerInput = new Uint8Array(64 + message.length)
  const outerInput = new Uint8Array(64 + 32)
  for (let i = 0; i < 64; i++) {
    const k = i < key.length ? key[i] : 0
    innerInput[i] = k ^ 0x36
    outerInput[i] = k ^ 0x5c
  }
  innerInput.set(message, 64)
  outerInput.set(hexToBytes(sha256HexSync(innerInput)), 64)
  return sha256HexSync(outerInput)
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false
  // 兩者皆為 64 字元小寫 hex、長度必等;逐字元 XOR 累積、無短路
  let diff = 0
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

function headerValue(headers: Headers | Record<string, string>, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name)
  const wanted = name.toLocaleLowerCase('en-US')
  const match = Object.entries(headers).find(([key]) => key.toLocaleLowerCase('en-US') === wanted)
  return match?.[1] ?? null
}

function readHeaders(headers: Headers | Record<string, string>): CalculatorAttestationHeaders {
  const result = {} as CalculatorAttestationHeaders
  for (const [field, name] of Object.entries(CALCULATOR_ATTESTATION_HEADERS) as Array<
    [keyof CalculatorAttestationHeaders, string]
  >) {
    const value = headerValue(headers, name)
    if (value === null) throw new CalculatorAttestationError(`header.missing:${field}`)
    result[field] = value
  }
  return result
}

function signingMessage(fields: CalculatorAttestationHeaders): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  for (const name of SIGNING_FIELDS) {
    const value = encoder.encode(fields[name])
    const prefix = encoder.encode(`${name}=${value.length}:`)
    const newline = encoder.encode('\n')
    chunks.push(prefix, value, newline)
    length += prefix.length + value.length + newline.length
  }
  const framed = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    framed.set(chunk, offset)
    offset += chunk.length
  }
  return framed
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function toBase64Url(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i]
    const b1 = i + 1 < data.length ? data[i + 1] : undefined
    const b2 = i + 2 < data.length ? data[i + 2] : undefined
    out += BASE64URL_ALPHABET[b0 >> 2]
    out += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 !== undefined) out += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 !== undefined) out += BASE64URL_ALPHABET[b2 & 0x3f]
  }
  return out
}

export function createCalculatorAttestationNonce(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    // fail closed:沒有密碼學亂數來源就拒絕、不退化
    throw new CalculatorAttestationError('nonce.entropy_unavailable')
  }
  const raw = new Uint8Array(24)
  webCrypto.getRandomValues(raw)
  return toBase64Url(raw)
}

export function verifyCalculatorResponseAttestation<T extends object>(input: {
  responseBody: Uint8Array | string
  responseHeaders: Headers | Record<string, string>
  responseStatusCode: number
  requestBody: Uint8Array | string
  method: 'POST'
  path: '/api/calculate'
  expectedNonce: string
  secret: string
  expectedReleaseId: string
  expectedCalculatorCodeSha256: string
  expectedKeyId: string
  nowSeconds?: number
  maxAgeSeconds?: number
  futureSkewSeconds?: number
}): VerifiedCalculatorResponse<T> {
  if (!NONCE.test(input.expectedNonce)) throw new CalculatorAttestationError('nonce.invalid')
  if (bytes(input.secret).length < 32) throw new CalculatorAttestationError('secret.invalid')
  if (!HEX_SHA256.test(input.expectedCalculatorCodeSha256)) throw new CalculatorAttestationError('code_hash.invalid')
  if (!input.expectedReleaseId || !input.expectedKeyId) throw new CalculatorAttestationError('identity.invalid')

  const fields = readHeaders(input.responseHeaders)
  if (!HEX_SHA256.test(fields.signature)) throw new CalculatorAttestationError('signature.format')
  const expectedSignature = hmacSha256Hex(input.secret, signingMessage(fields))
  if (!constantTimeHexEqual(fields.signature, expectedSignature)) throw new CalculatorAttestationError('signature.mismatch')
  if (fields.version !== CALCULATOR_ATTESTATION_VERSION) throw new CalculatorAttestationError('version.mismatch')
  if (fields.algorithm !== CALCULATOR_ATTESTATION_ALGORITHM) throw new CalculatorAttestationError('algorithm.mismatch')
  if (fields.method !== input.method || fields.path !== input.path) throw new CalculatorAttestationError('route.mismatch')
  if (fields.nonce !== input.expectedNonce) throw new CalculatorAttestationError('nonce.mismatch')
  if (fields.release_id !== input.expectedReleaseId) throw new CalculatorAttestationError('release.mismatch')
  if (fields.calculator_code_sha256 !== input.expectedCalculatorCodeSha256) throw new CalculatorAttestationError('code_hash.mismatch')
  if (fields.key_id !== input.expectedKeyId) throw new CalculatorAttestationError('key_id.mismatch')
  if (!Number.isInteger(input.responseStatusCode) || fields.status_code !== String(input.responseStatusCode)) {
    throw new CalculatorAttestationError('status_code.mismatch')
  }

  const issuedAt = Number(fields.issued_at)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!Number.isInteger(issuedAt)) throw new CalculatorAttestationError('issued_at.invalid')
  if (issuedAt > now + (input.futureSkewSeconds ?? 30)) throw new CalculatorAttestationError('issued_at.future')
  if (now - issuedAt > (input.maxAgeSeconds ?? 300)) throw new CalculatorAttestationError('issued_at.expired')

  const requestHash = sha256Hex(input.requestBody)
  const responseHash = sha256Hex(input.responseBody)
  if (fields.request_hash !== requestHash) throw new CalculatorAttestationError('request_hash.mismatch')
  if (fields.response_hash !== responseHash) throw new CalculatorAttestationError('response_hash.mismatch')

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(input.responseBody)))
  } catch {
    throw new CalculatorAttestationError('response_json.invalid')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CalculatorAttestationError('response_json.not_object')
  }
  return {
    response: parsed as T,
    receipt: {
      version: CALCULATOR_ATTESTATION_VERSION,
      releaseId: fields.release_id,
      calculatorCodeSha256: fields.calculator_code_sha256,
      keyId: fields.key_id,
      issuedAt,
      requestHash: `sha256:${requestHash}`,
      responseHash: `sha256:${responseHash}`,
      signatureHash: `sha256:${sha256Hex(fields.signature)}`,
    },
  }
}
