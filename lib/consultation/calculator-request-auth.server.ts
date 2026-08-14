import type { CalculatorEndpointPath } from './calculator-request.ts'
import {
  CALCULATOR_ATTESTATION_NONCE_HEADER,
  createCalculatorAttestationNonce,
  createCalculatorRequestAuthenticationHeaders,
} from './calculator-attestation.ts'

type RuntimeEnvironment = Record<string, string | undefined>

export type SignedCalculatorPost = {
  body: string
  headers: Record<string, string>
  nonce: string
}

/**
 * Sign the exact JSON bytes sent to a paid/internal Fly endpoint.
 *
 * The payload is serialized once.  Callers must use both the returned `body`
 * and `headers`; re-running JSON.stringify after signing invalidates the hash.
 * Missing production credentials fail closed instead of silently making an
 * unsigned request.
 */
export function createSignedCalculatorPost(input: {
  path: CalculatorEndpointPath
  payload: unknown
  environment?: RuntimeEnvironment
  nonce?: string
  issuedAt?: number
}): SignedCalculatorPost {
  const environment = input.environment ?? process.env
  const secret = environment.CALCULATOR_ATTESTATION_SECRET ?? ''
  const keyId = environment.CALCULATOR_ATTESTATION_KEY_ID?.trim() ?? ''
  const body = JSON.stringify(input.payload)
  const nonce = input.nonce ?? createCalculatorAttestationNonce()
  const authHeaders = createCalculatorRequestAuthenticationHeaders({
    requestBody: body,
    method: 'POST',
    path: input.path,
    nonce,
    secret,
    keyId,
    issuedAt: input.issuedAt,
  })
  return {
    body,
    nonce,
    headers: {
      'Content-Type': 'application/json',
      [CALCULATOR_ATTESTATION_NONCE_HEADER]: nonce,
      ...authHeaders,
    },
  }
}
