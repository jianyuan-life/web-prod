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

export function shouldUseConsultationReportV1(
  planCode: string,
  environment: RuntimeEnvironment = process.env,
): planCode is 'C' | 'G15' {
  if (planCode !== 'C' && planCode !== 'G15') return false
  return environment[`USE_CONSULTATION_REPORT_V1_${planCode}`] === 'true'
}

function isSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

function isCalculatorReleaseReceipt(value: unknown): value is string {
  return typeof value === 'string' &&
    /^fly-release\/v1\|app=[a-z0-9-]+\|release=[1-9]\d*\|digest=sha256:[0-9a-f]{64}\|git=[0-9a-f]{40}$/u.test(value)
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
  const consultationSessionSecret = environment.CONSULTATION_SESSION_SECRET ?? ''
  const reportCookieSecret = environment.REPORT_COOKIE_SECRET ?? ''
  if (!isCalculatorReleaseReceipt(calculatorBundleVersion)) missing.push('CALCULATOR_BUNDLE_VERSION')
  if (!/^[0-9a-f]{64}$/u.test(calculatorCodeSha256)) missing.push('CALCULATOR_ATTESTATION_CODE_SHA256')
  if (!isPublicIdentifier(calculatorAttestationKeyId)) missing.push('CALCULATOR_ATTESTATION_KEY_ID')
  if (new TextEncoder().encode(calculatorAttestationSecret).length < 32) missing.push('CALCULATOR_ATTESTATION_SECRET')
  if (
    !isValidConsultationSessionSecret(consultationSessionSecret) ||
    consultationSessionSecret === calculatorAttestationSecret ||
    (reportCookieSecret.length > 0 && consultationSessionSecret === reportCookieSecret)
  ) {
    missing.push('CONSULTATION_SESSION_SECRET')
  }
  if (!isSha256(freshReviewHash)) missing.push('CONSULTATION_V1_FRESH_REVIEW_SHA256')
  if (!isSha256(rendererInputBindingHash)) missing.push('CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256')
  if (missing.length > 0) throw new ConsultationRuntimeConfigError(missing)
  return {
    calculatorBundleVersion,
    calculatorCodeSha256,
    calculatorAttestationKeyId,
    freshReviewHash: freshReviewHash as `sha256:${string}`,
    rendererInputBindingHash: rendererInputBindingHash as `sha256:${string}`,
  }
}
