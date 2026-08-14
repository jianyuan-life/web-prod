import { isValidConsultationSessionSecret } from './session.ts'

export class ConsultationRuntimeConfigError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Consultation runtime receipts missing or invalid: ${missing.join(', ')}`)
    this.name = 'ConsultationRuntimeConfigError'
    this.missing = missing
  }
}

type RuntimeEnvironment = Record<string, string | undefined>

export const CONSULTATION_REPORT_V1_ORDER_CONTRACT = 'consultation-report/v1' as const

type ConsultationPlanCode = 'C' | 'G15'
type ConsultationReleaseBinding = {
  schema: typeof CONSULTATION_REPORT_V1_ORDER_CONTRACT
  plan_code: ConsultationPlanCode
}

function isConsultationPlanCode(planCode: string): planCode is ConsultationPlanCode {
  return planCode === 'C' || planCode === 'G15'
}

export function shouldUseConsultationReportV1(
  planCode: string,
  environment: RuntimeEnvironment = process.env,
): planCode is 'C' | 'G15' {
  if (planCode === 'C') return environment.USE_CONSULTATION_REPORT_V1_C === 'true'
  if (planCode === 'G15') return environment.USE_CONSULTATION_REPORT_V1_G15 === 'true'
  return false
}

/**
 * Bind the implementation contract at checkout time. The checkout route calls
 * this only after authenticating/rebuilding the customer input, then persists
 * the returned object in checkout_drafts. Client input alone is never trusted
 * as a release decision.
 */
export function bindConsultationOrderReleaseContract(
  planCode: string,
  birthData: unknown,
): Record<string, unknown> {
  if (
    !isConsultationPlanCode(planCode)
    || !birthData
    || typeof birthData !== 'object'
    || Array.isArray(birthData)
  ) {
    throw new ConsultationRuntimeConfigError(['CONSULTATION_ORDER_RELEASE_CONTRACT'])
  }
  return {
    ...(birthData as Record<string, unknown>),
    consultation_release_contract: {
      schema: CONSULTATION_REPORT_V1_ORDER_CONTRACT,
      plan_code: planCode,
    } satisfies ConsultationReleaseBinding,
  }
}

export function hasConsultationOrderReleaseContract(
  planCode: string,
  birthData: unknown,
): planCode is ConsultationPlanCode {
  if (
    !isConsultationPlanCode(planCode)
    || !birthData
    || typeof birthData !== 'object'
    || Array.isArray(birthData)
  ) return false
  const binding = (birthData as Record<string, unknown>).consultation_release_contract
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false
  const candidate = binding as Record<string, unknown>
  return candidate.schema === CONSULTATION_REPORT_V1_ORDER_CONTRACT
    && candidate.plan_code === planCode
}

/** Intake flags stop only new checkout. A separate explicit kill switch is
 * required to stop fulfillment of already-paid, contract-bound orders. */
export function isConsultationGenerationKillSwitchEnabled(
  planCode: string,
  environment: RuntimeEnvironment = process.env,
): boolean {
  if (planCode === 'C') return environment.CONSULTATION_REPORT_V1_KILL_SWITCH_C === 'true'
  if (planCode === 'G15') return environment.CONSULTATION_REPORT_V1_KILL_SWITCH_G15 === 'true'
  return false
}

function isSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

// calculator-bundle/v2 — the release identity the Fly runtime can actually
// stand behind.
//
// v1 was `fly-release/v1|app=…|release=<n>|digest=sha256:…|git=…`, which asked
// the service to self-report a Fly release number and its own image digest.
// Fly exposes neither reliably at runtime, and writing a digest back into the
// image it names is circular — so the field was destined to hold a number
// somebody made up.
//
// v2 carries only what can be baked in at build time (git SHA and a
// deterministic calculator manifest hash) plus the image digest, which the
// deploy orchestrator fills in from its external receipt after push. The Fly
// platform release number, if it is still wanted, lives in that receipt as
// metadata and never in a self-signed identity.
function isCalculatorReleaseReceipt(value: unknown): value is string {
  return typeof value === 'string' &&
    /^calculator-bundle\/v2\|app=[a-z0-9-]+\|digest=sha256:[0-9a-f]{64}\|git=[0-9a-f]{40}\|manifest=sha256:[0-9a-f]{64}$/u.test(value)
}

function isPublicIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[!-~]{1,240}$/u.test(value)
}

export function readConsultationRuntimeReceipts(
  environment: RuntimeEnvironment = process.env,
): {
  calculatorBundleVersion: string
  calculatorCodeSha256: string
  calculatorAttestationKeyId: string
  telemetryFingerprintKeyId: string
  freshReviewHash: `sha256:${string}`
  rendererInputBindingHash: `sha256:${string}`
} {
  const missing: string[] = []
  const calculatorBundleVersion = environment.CALCULATOR_BUNDLE_VERSION?.trim() ?? ''
  const freshReviewHash = environment.CONSULTATION_V1_FRESH_REVIEW_SHA256
  const rendererInputBindingHash = environment.CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256
  const calculatorCodeSha256 = environment.CALCULATOR_ATTESTATION_CODE_SHA256?.trim() ?? ''
  const calculatorAttestationKeyId = environment.CALCULATOR_ATTESTATION_KEY_ID?.trim() ?? ''
  const calculatorAttestationSecret = environment.CALCULATOR_ATTESTATION_SECRET ?? ''
  const telemetryFingerprintSecret = environment.TELEMETRY_FINGERPRINT_SECRET ?? ''
  const telemetryFingerprintKeyId = environment.TELEMETRY_FINGERPRINT_KEY_ID?.trim() ?? ''
  const consultationSessionSecret = environment.CONSULTATION_SESSION_SECRET ?? ''
  const reportCookieSecret = environment.REPORT_COOKIE_SECRET ?? ''
  if (!isCalculatorReleaseReceipt(calculatorBundleVersion)) missing.push('CALCULATOR_BUNDLE_VERSION')
  if (!/^[0-9a-f]{64}$/u.test(calculatorCodeSha256)) missing.push('CALCULATOR_ATTESTATION_CODE_SHA256')
  if (!isPublicIdentifier(calculatorAttestationKeyId)) missing.push('CALCULATOR_ATTESTATION_KEY_ID')
  if (new TextEncoder().encode(calculatorAttestationSecret).length < 32) missing.push('CALCULATOR_ATTESTATION_SECRET')
  if (new TextEncoder().encode(telemetryFingerprintSecret).length < 32) missing.push('TELEMETRY_FINGERPRINT_SECRET')
  if (!/^[A-Za-z0-9_-]{1,16}$/u.test(telemetryFingerprintKeyId)) missing.push('TELEMETRY_FINGERPRINT_KEY_ID')
  if (
    !isValidConsultationSessionSecret(consultationSessionSecret) ||
    consultationSessionSecret === calculatorAttestationSecret ||
    (reportCookieSecret.length > 0 && consultationSessionSecret === reportCookieSecret)
  ) {
    missing.push('CONSULTATION_SESSION_SECRET')
  }
  if (
    telemetryFingerprintSecret === calculatorAttestationSecret ||
    telemetryFingerprintSecret === consultationSessionSecret ||
    telemetryFingerprintSecret === reportCookieSecret
  ) {
    missing.push('TELEMETRY_FINGERPRINT_SECRET')
  }
  if (!isSha256(freshReviewHash)) missing.push('CONSULTATION_V1_FRESH_REVIEW_SHA256')
  if (!isSha256(rendererInputBindingHash)) missing.push('CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256')
  if (missing.length > 0) throw new ConsultationRuntimeConfigError(missing)
  return {
    calculatorBundleVersion,
    calculatorCodeSha256,
    calculatorAttestationKeyId,
    telemetryFingerprintKeyId,
    freshReviewHash: freshReviewHash as `sha256:${string}`,
    rendererInputBindingHash: rendererInputBindingHash as `sha256:${string}`,
  }
}
