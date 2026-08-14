import { hmacSha256HexSync } from '../consultation/sha256.ts'

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/gu
const KNOWN_ERROR_CLASSES = new Set([
  'AbortError',
  'AggregateError',
  'APIError',
  'AuthError',
  'DatabaseError',
  'DOMException',
  'Error',
  'EvalError',
  'ExternalError',
  'FetchError',
  'NetworkError',
  'RangeError',
  'ReferenceError',
  'StripeError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'URIError',
  'UnknownError',
  'ValidationError',
])

const OPERATIONAL_FAILURE_CODES = new Set([
  'AI_GENERATION_FAILED',
  'CALCULATOR_FAILED',
  'C_STRUCTURED_GENERATION_FAILED',
  'G15_GENERATION_FAILED',
  'LOAD_REPORT_RECORD_FAILED',
  'PDF_GENERATION_FAILED',
  'REPORT_PERSISTENCE_FAILED',
  'R_GENERATION_FAILED',
])

type TelemetryEnvironment = Record<string, string | undefined>

export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

export function sanitizeEmailSubject(value: unknown): string {
  return String(value ?? '')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180)
}

export function operationalFingerprint(
  value: unknown,
  environment: TelemetryEnvironment = process.env,
): string {
  const secret = environment.TELEMETRY_FINGERPRINT_SECRET ?? ''
  if (new TextEncoder().encode(secret).length < 32) return 'unavailable'
  const configuredKeyId = environment.TELEMETRY_FINGERPRINT_KEY_ID?.trim() ?? ''
  const keyId = /^[A-Za-z0-9_-]{1,16}$/u.test(configuredKeyId) ? configuredKeyId : 'v1'
  const digest = hmacSha256HexSync(secret, String(value ?? '')).slice(0, 32)
  return `${keyId}:${digest}`
}

export function operationalErrorClass(value: unknown): string {
  if (value instanceof Error) {
    return KNOWN_ERROR_CLASSES.has(value.name) ? value.name : 'ExternalError'
  }
  if (typeof value === 'string' && KNOWN_ERROR_CLASSES.has(value)) return value
  return typeof value === 'object' && value !== null ? 'ExternalError' : 'UnknownError'
}

/**
 * Preserve only an approved operational stage code. Callers may append a
 * diagnostic class after a colon, but that detail is deliberately discarded
 * before the value reaches persistence or an observability sink.
 */
export function operationalFailureCode(value: unknown): string {
  if (typeof value === 'string') {
    const separator = value.indexOf(':')
    const candidate = separator === -1 ? value : value.slice(0, separator)
    if (OPERATIONAL_FAILURE_CODES.has(candidate)) return candidate
  }
  return operationalErrorClass(value)
}

export function operationalLabel(value: unknown, allowedValues: ReadonlySet<string>): string {
  const normalized = String(value ?? '')
  return allowedValues.has(normalized)
    ? normalized
    : `fingerprint:${operationalFingerprint(normalized)}`
}
