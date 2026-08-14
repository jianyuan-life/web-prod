const PRIVATE_CONSULTATION_PATH = '/consultation/[private]'

function canonicalizePrivateReferenceCandidate(value: string): string {
  let canonical = value
  for (let round = 0; round < 3; round += 1) {
    let next = canonical
      .replace(/\\\//gu, '/')
      .replace(/&#(?:x0*2f|0*47);/giu, '/')
    try {
      next = decodeURIComponent(next)
    } catch {
      // Decode only the separators needed to expose a hidden route when an
      // unrelated malformed percent sequence makes decodeURIComponent fail.
      next = next
        .replace(/%25/giu, '%')
        .replace(/%2f/giu, '/')
        .replace(/%3a/giu, ':')
        .replace(/%3f/giu, '?')
        .replace(/%23/giu, '#')
    }
    if (next === canonical) break
    canonical = next
  }
  return canonical
}

function pathnameOfCanonical(value: string): string {
  const canonical = canonicalizePrivateReferenceCandidate(value)
  try {
    return new URL(canonical, 'https://private-route.invalid').pathname
  } catch {
    return canonical.split(/[?#]/u, 1)[0] || ''
  }
}

export function isPrivateConsultationUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const pathname = pathnameOfCanonical(value)
  return /^\/+consultation(?:\/+|$)/iu.test(pathname)
}

/**
 * Prevent a C/G15 bearer token from entering analytics, logs, referrers, or
 * error telemetry. Non-consultation URLs (including every legacy E3 route)
 * are returned byte-for-byte unchanged.
 */
export function redactConsultationUrl(value: string): string {
  if (!isPrivateConsultationUrl(value)) return value

  const canonical = canonicalizePrivateReferenceCandidate(value)
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(canonical)) {
    try {
      return `${new URL(canonical).origin}${PRIVATE_CONSULTATION_PATH}`
    } catch {
      return PRIVATE_CONSULTATION_PATH
    }
  }

  return PRIVATE_CONSULTATION_PATH
}

/**
 * Reduce an analytics page value to one canonical pathname. Private bearer
 * routes are replaced before URL parsing; query strings and fragments never
 * cross the server ingress boundary.
 */
export function canonicalizeTelemetryPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  if (isPrivateConsultationUrl(value)) return PRIVATE_CONSULTATION_PATH
  if (/%(?![\da-f]{2})/iu.test(value)) return null
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/iu.test(value)
    if (!isAbsolute && (!value.startsWith('/') || value.startsWith('//'))) return null
    const url = new URL(value, 'https://analytics.invalid')
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.pathname.length <= 1024 ? url.pathname : null
  } catch {
    return null
  }
}

const ABSOLUTE_CONSULTATION_REFERENCE =
  /https?:\/\/[^\s"'<>]+\/consultation\/[^\s"'<>]+/giu
const RELATIVE_CONSULTATION_REFERENCE =
  /\/consultation\/[^\s"'<>]+/giu
const ENCODED_CONSULTATION_REFERENCE =
  /(?:https?%3a%2f%2f[^\s"'<>]+)?%2fconsultation%2f[a-z\d._~-]+(?:%3f[^\s"'<>]*)?/giu
const PRIVATE_REFERENCE_DETECTOR = /\/consultation\/[^\s"'<>]+/iu

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
