import { createHash } from 'node:crypto'

import {
  verifyCalculatorResponseAttestation,
  type VerifiedCalculatorResponse,
} from './calculator-attestation.ts'
import { normalizeCalculatorFacts } from './calculator-facts.ts'
import {
  buildCalculatorRequestPayload,
  CONSULTATION_CALCULATE_PATH,
  hashCalculatorRequest,
  serializeCalculatorRequest,
  type CalculatorRequestPayload,
} from './calculator-request.ts'
import { createSignedCalculatorPost } from './calculator-request-auth.server.ts'
import { readConsultationRuntimeReceipts } from './runtime-config.ts'

type RuntimeEnvironment = Record<string, string | undefined>

export type ConsultationCalculatorReadinessReceipt = {
  statusCode: 200
  receipt: VerifiedCalculatorResponse<Record<string, unknown>>['receipt']
}

type ReadinessOptions = {
  environment?: RuntimeEnvironment
  fetchImpl?: typeof fetch
  timeoutMs?: number
  nowSeconds?: number
  cacheTtlMs?: number
  cacheNowMs?: number
}

const SYNTHETIC_AS_OF = '2026-08-09'
const SYNTHETIC_TARGET_YEAR = 2026
const DEFAULT_SUCCESS_CACHE_TTL_MS = 60_000
const successCache = new Map<string, {
  expiresAtMs: number
  value: ConsultationCalculatorReadinessReceipt
}>()
const readinessInFlight = new Map<string, Promise<ConsultationCalculatorReadinessReceipt>>()

function syntheticCalculatorPayload(): CalculatorRequestPayload {
  const payload = buildCalculatorRequestPayload({
    name: '虛構案例甲',
    year: 1990,
    month: 6,
    day: 15,
    hour: 10,
    minute: 30,
    gender: 'M',
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_city: 'Taipei',
    birth_country: 'TW',
    calendar_type: 'solar',
    lunar_leap: false,
    time_unknown: false,
    time_mode: 'exact',
    as_of: SYNTHETIC_AS_OF,
    target_year: SYNTHETIC_TARGET_YEAR,
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
    fold: 0,
  }, { consultationMode: true })
  // createSignedCalculatorPost serializes once with JSON.stringify. Rebuild
  // from the canonical serialization so its exact bytes and requestHash are
  // the same identity later checked by normalizeCalculatorFacts.
  return JSON.parse(serializeCalculatorRequest(payload)) as CalculatorRequestPayload
}

/**
 * Prove that the strict C/G15 producer is reachable and signs the exact bytes
 * the checkout server receives. The fixed payload is synthetic and contains
 * no customer data. A signed 200 must still pass the same normalized-input,
 * 15-slot ledger, coverage and per-slot provenance contract used by a paid
 * report; merely reaching validation (422) is not evidence that charts work.
 */
export async function assertConsultationCalculatorReady(
  options: ReadinessOptions = {},
): Promise<ConsultationCalculatorReadinessReceipt> {
  const environment = options.environment ?? process.env
  // Runtime receipts are checked before making a network request. A checkout
  // may not use an unreviewed renderer or an unpinned calculator identity.
  const receipts = readConsultationRuntimeReceipts(environment)
  const secret = environment.CALCULATOR_ATTESTATION_SECRET ?? ''
  const baseUrl = (environment.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev')
    .replace(/\/+$/u, '')
  const cacheTtlMs = Math.max(0, Math.min(
    options.cacheTtlMs ?? (options.fetchImpl ? 0 : DEFAULT_SUCCESS_CACHE_TTL_MS),
    DEFAULT_SUCCESS_CACHE_TTL_MS,
  ))
  const cacheNowMs = options.cacheNowMs ?? Date.now()
  const cacheKey = createHash('sha256').update(JSON.stringify({
    baseUrl,
    releaseId: receipts.calculatorBundleVersion,
    calculatorCodeSha256: receipts.calculatorCodeSha256,
    keyId: receipts.calculatorAttestationKeyId,
    secretSha256: createHash('sha256').update(secret).digest('hex'),
  })).digest('hex')

  if (cacheTtlMs > 0) {
    const cached = successCache.get(cacheKey)
    if (cached && cached.expiresAtMs > cacheNowMs) return cached.value
    if (cached) successCache.delete(cacheKey)
  }

  const activeProbe = readinessInFlight.get(cacheKey)
  if (activeProbe) return activeProbe

  const probe = (async (): Promise<ConsultationCalculatorReadinessReceipt> => {
    const payload = syntheticCalculatorPayload()
    const signedRequest = createSignedCalculatorPost({
      path: CONSULTATION_CALCULATE_PATH,
      payload,
      environment,
      issuedAt: options.nowSeconds,
    })
    const controller = new AbortController()
    const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 8_000, 8_000))
    let timeout: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error('consultation_calculator_readiness_timeout'))
      }, timeoutMs)
    })

    let result: { response: Response; responseBody: Uint8Array }
    try {
      const request = (async () => {
        const fetched = await (options.fetchImpl ?? fetch)(`${baseUrl}${CONSULTATION_CALCULATE_PATH}`, {
          method: 'POST',
          headers: signedRequest.headers,
          body: signedRequest.body,
          signal: controller.signal,
        })
        const body = new Uint8Array(await fetched.arrayBuffer())
        return { response: fetched, responseBody: body }
      })()
      result = await Promise.race([
        request,
        timeoutPromise,
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
    const { response, responseBody } = result

    const verified = verifyCalculatorResponseAttestation<Record<string, unknown>>({
      responseBody,
      responseHeaders: response.headers,
      responseStatusCode: response.status,
      requestBody: signedRequest.body,
      method: 'POST',
      path: CONSULTATION_CALCULATE_PATH,
      expectedNonce: signedRequest.nonce,
      secret,
      expectedReleaseId: receipts.calculatorBundleVersion,
      expectedCalculatorCodeSha256: receipts.calculatorCodeSha256,
      expectedKeyId: receipts.calculatorAttestationKeyId,
      nowSeconds: options.nowSeconds,
    })
    if (response.status !== 200) {
      throw new Error('consultation_calculator_readiness_unexpected_response')
    }
    normalizeCalculatorFacts({
      personId: 'person:calculator-readiness-synthetic',
      asOfDate: SYNTHETIC_AS_OF,
      targetYear: SYNTHETIC_TARGET_YEAR,
      calculatorBundleVersion: receipts.calculatorBundleVersion,
      requestPayload: payload,
      requestHash: hashCalculatorRequest(payload),
      responseAttestation: verified.receipt,
      response: verified.response,
    })
    return {
      statusCode: 200,
      receipt: verified.receipt,
    }
  })()

  readinessInFlight.set(cacheKey, probe)
  try {
    const value = await probe
    if (cacheTtlMs > 0) {
      successCache.set(cacheKey, { expiresAtMs: cacheNowMs + cacheTtlMs, value })
    }
    return value
  } finally {
    if (readinessInFlight.get(cacheKey) === probe) readinessInFlight.delete(cacheKey)
  }
}
