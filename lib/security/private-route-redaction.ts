const PRIVATE_CONSULTATION_PATH = '/consultation/[private]'

function pathnameOf(value: string): string {
  try {
    return new URL(value, 'https://private-route.invalid').pathname
  } catch {
    return value.split(/[?#]/u, 1)[0] || ''
  }
}

export function isPrivateConsultationUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const pathname = pathnameOf(value)
  return pathname === '/consultation' || pathname.startsWith('/consultation/')
}

/**
 * Prevent a C/G15 bearer token from entering analytics, logs, referrers, or
 * error telemetry. Non-consultation URLs (including every legacy E3 route)
 * are returned byte-for-byte unchanged.
 */
export function redactConsultationUrl(value: string): string {
  if (!isPrivateConsultationUrl(value)) return value

  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(value)) {
    try {
      return `${new URL(value).origin}${PRIVATE_CONSULTATION_PATH}`
    } catch {
      return PRIVATE_CONSULTATION_PATH
    }
  }

  return PRIVATE_CONSULTATION_PATH
}

const ABSOLUTE_CONSULTATION_REFERENCE =
  /https?:\/\/[^\s"'<>]+\/consultation\/[^\s"'<>]+/giu
const RELATIVE_CONSULTATION_REFERENCE =
  /\/consultation\/[^\s"'<>]+/giu
const ENCODED_CONSULTATION_REFERENCE =
  /(?:https?%3a%2f%2f[^\s"'<>]+)?%2fconsultation%2f[a-z\d._~-]+(?:%3f[^\s"'<>]*)?/giu
const PRIVATE_REFERENCE_DETECTOR = /\/consultation\/[^\s"'<>]+/iu

function canonicalizePrivateReferenceCandidate(value: string): string {
  let canonical = value
  for (let round = 0; round < 3; round += 1) {
    let next = canonical
      .replace(/\\\//gu, '/')
      .replace(/&#(?:x0*2f|0*47);/giu, '/')
    try {
      next = decodeURIComponent(next)
    } catch {
      // Keep the slash/entity normalization even when unrelated percent text
      // is malformed. The original is returned unless a private path appears.
    }
    if (next === canonical) break
    canonical = next
  }
  return canonical
}

function redactCanonicalConsultationReferences(value: string): string {
  return value
    .replace(ABSOLUTE_CONSULTATION_REFERENCE, (match) => redactConsultationUrl(match))
    .replace(RELATIVE_CONSULTATION_REFERENCE, PRIVATE_CONSULTATION_PATH)
    .replace(ENCODED_CONSULTATION_REFERENCE, encodeURIComponent(PRIVATE_CONSULTATION_PATH))
}

/**
 * Scrub private report links when they are embedded inside an error message,
 * stack trace, or arbitrary telemetry string rather than supplied as a URL.
 */
export function redactConsultationReferences(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return value

  const direct = redactCanonicalConsultationReferences(value)
  if (direct !== value) return direct

  const canonical = canonicalizePrivateReferenceCandidate(value)
  if (canonical === value || !PRIVATE_REFERENCE_DETECTOR.test(canonical)) return value
  return redactCanonicalConsultationReferences(canonical)
}
