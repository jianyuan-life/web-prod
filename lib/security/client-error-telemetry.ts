import { redactConsultationReferences } from './private-route-redaction.ts'

export interface UntrustedClientErrorPayload {
  digest?: unknown
  message?: unknown
  stack?: unknown
  url?: unknown
  ua?: unknown
}

function safeString(value: unknown, maxLength: number): string {
  let normalized = ''
  if (typeof value === 'string') normalized = value
  else if (typeof value === 'number' || typeof value === 'boolean') normalized = String(value)

  return redactConsultationReferences(normalized.slice(0, maxLength))
}

/**
 * Build the complete payload for every server-side error telemetry sink.
 * Callers must not read the untrusted request payload after this boundary.
 */
export function buildClientErrorTelemetry(payload: UntrustedClientErrorPayload) {
  const digest = safeString(payload.digest, 50)
  const message = safeString(payload.message, 500)
  const stack = safeString(payload.stack, 1000)
  const url = safeString(payload.url, 200)
  const userAgent = safeString(payload.ua, 200)

  return {
    audit: {
      pathname: url,
      userAgent,
      details: { digest, message, stack },
    },
    sentry: {
      errorMessage: message || 'client-error',
      tags: {
        source: 'client-error-page',
        digest: digest || 'no-digest',
      },
      extra: { url, ua: userAgent, stack },
    },
  }
}
