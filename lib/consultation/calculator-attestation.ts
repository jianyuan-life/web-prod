import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import type { CalculatorEndpointPath } from './calculator-request.ts'

export const CALCULATOR_ATTESTATION_VERSION = 'jianyuan.fly.response.v1'
export const CALCULATOR_ATTESTATION_ALGORITHM = 'HMAC-SHA256'
export const CALCULATOR_ATTESTATION_NONCE_HEADER = 'X-Jianyuan-Attestation-Nonce'
export const CALCULATOR_REQUEST_AUTH_VERSION = 'jianyuan.fly.request.v1'
export const CALCULATOR_REQUEST_AUTH_HEADERS = {
  version: 'X-Jianyuan-Request-Version',
  keyId: 'X-Jianyuan-Request-Key-Id',
  issuedAt: 'X-Jianyuan-Request-Issued-At',
  signature: 'X-Jianyuan-Request-Signature',
} as const

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
const REQUEST_SIGNING_FIELDS = [
  'version', 'key_id', 'issued_at', 'nonce', 'method', 'path', 'request_hash',
] as const
const REQUEST_KEY_DERIVATION_CONTEXT = 'jianyuan.fly.request.v1'

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
  return createHash('sha256').update(bytes(value)).digest('hex')
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
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

function framedMessage(
  names: readonly string[],
  fields: Record<string, string>,
): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  for (const name of names) {
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

export function createCalculatorAttestationNonce(): string {
  return randomBytes(24).toString('base64url')
}

export function createCalculatorRequestAuthenticationHeaders(input: {
  requestBody: Uint8Array | string
  method: 'POST'
  path: CalculatorEndpointPath
  nonce: string
  secret: string
  keyId: string
  issuedAt?: number
}): Record<string, string> {
  if (!NONCE.test(input.nonce)) throw new CalculatorAttestationError('request.nonce.invalid')
  if (bytes(input.secret).length < 32) throw new CalculatorAttestationError('request.secret.invalid')
  if (!input.keyId || !/^[!-~]{1,240}$/u.test(input.keyId)) {
    throw new CalculatorAttestationError('request.key_id.invalid')
  }
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000)
  if (!Number.isInteger(issuedAt) || issuedAt < 0) {
    throw new CalculatorAttestationError('request.issued_at.invalid')
  }
  const fields: Record<string, string> = {
    version: CALCULATOR_REQUEST_AUTH_VERSION,
    key_id: input.keyId,
    issued_at: String(issuedAt),
    nonce: input.nonce,
    method: input.method,
    path: input.path,
    request_hash: sha256Hex(input.requestBody),
  }
  const requestKey = createHmac('sha256', input.secret)
    .update(REQUEST_KEY_DERIVATION_CONTEXT)
    .digest()
  const signature = createHmac('sha256', requestKey)
    .update(framedMessage(REQUEST_SIGNING_FIELDS, fields))
    .digest('hex')
  return {
    [CALCULATOR_REQUEST_AUTH_HEADERS.version]: fields.version,
    [CALCULATOR_REQUEST_AUTH_HEADERS.keyId]: fields.key_id,
    [CALCULATOR_REQUEST_AUTH_HEADERS.issuedAt]: fields.issued_at,
    [CALCULATOR_REQUEST_AUTH_HEADERS.signature]: signature,
  }
}

export function verifyCalculatorResponseAttestation<T extends object>(input: {
  responseBody: Uint8Array | string
  responseHeaders: Headers | Record<string, string>
  responseStatusCode: number
  requestBody: Uint8Array | string
  method: 'POST'
  // Both endpoints are accepted so the frozen v1 fixture keeps regressing while
  // the live caller moves to the strict path.  The value is signed, so passing
  // the wrong one for a given response is a route.mismatch, not a silent pass.
  path: CalculatorEndpointPath
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
  const expectedSignature = createHmac('sha256', input.secret).update(signingMessage(fields)).digest('hex')
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
