import { createHash } from 'node:crypto'

export function syntheticSecret(label, prefixParts = []) {
  if (!label || !Array.isArray(prefixParts)) throw new TypeError('synthetic fixture label/prefix 無效')
  const digest = createHash('sha256')
    .update(['jianyuan', 'e3', 'production-csp-smoke', String(label)].join(':'))
    .digest('hex')
  return `${prefixParts.join('')}${digest}`
}

function normalizeViolation(violation) {
  return {
    blockedURI: String(violation?.blockedURI || ''),
    disposition: String(violation?.disposition || ''),
    effectiveDirective: String(violation?.effectiveDirective || ''),
    originalPolicy: String(violation?.originalPolicy || ''),
    statusCode: Number.isFinite(Number(violation?.statusCode)) ? Number(violation.statusCode) : 0,
  }
}

export function partitionCspViolations(violations = []) {
  const reportOnly = []
  const enforced = []
  const unknown = []

  for (const item of violations) {
    const violation = normalizeViolation(item)
    if (violation.disposition === 'report') reportOnly.push(violation)
    else if (violation.disposition === 'enforce') enforced.push(violation)
    else unknown.push(violation)
  }

  const runtimeFailures = [...enforced, ...unknown]
  return {
    reportOnly,
    enforced,
    unknown,
    strictReadinessHold: reportOnly,
    runtimeFailures,
    fatal: runtimeFailures,
  }
}

function getHeader(headers, name) {
  if (headers && typeof headers.get === 'function') return String(headers.get(name) || '')
  if (!headers || typeof headers !== 'object') return ''
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry ? String(entry[1] || '') : ''
}

function describePolicy(value) {
  return {
    present: value.length > 0,
    value,
    sha256: value ? createHash('sha256').update(value, 'utf8').digest('hex') : null,
  }
}

export function inspectProductionCspHeaders(headers) {
  const enforced = describePolicy(getHeader(headers, 'content-security-policy'))
  const reportOnly = describePolicy(getHeader(headers, 'content-security-policy-report-only'))
  const errors = []
  if (!enforced.present) errors.push('enforced_csp_missing')
  return {
    ok: errors.length === 0,
    errors,
    enforced,
    reportOnly,
  }
}

export function isFatalRuntimeConsoleError(message) {
  const value = String(message || '')
  if (/hydration|uncaught|typeerror|referenceerror/i.test(value)) return true
  return (
    /failed to find a valid digest[^\n]*integrity/i.test(value) ||
    /subresource integrity[^\n]*(?:mismatch|invalid|fail|blocked)/i.test(value) ||
    /integrity (?:attribute|metadata|digest)[^\n]*(?:mismatch|invalid|fail|blocked)/i.test(value)
  )
}

export function isSameOriginHttpError(responseUrl, status, baseUrl) {
  if (Number(status) < 400) return false
  try {
    return new URL(String(responseUrl)).origin === new URL(String(baseUrl)).origin
  } catch {
    return false
  }
}

function isDocumentedNextPrefetchAbort(item, baseUrl) {
  if (String(item?.method || '').toUpperCase() !== 'GET') return false
  if (String(item?.errorText || '') !== 'net::ERR_ABORTED') return false
  if (String(item?.resourceType || '') !== 'fetch') return false

  let url
  try {
    url = new URL(String(item?.url || ''))
  } catch {
    return false
  }
  if (url.origin !== new URL(baseUrl).origin || !url.searchParams.has('_rsc')) return false

  const headers = item?.headers && typeof item.headers === 'object' ? item.headers : {}
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]))
  return normalized['next-router-prefetch'] === '1' || /prefetch/i.test(normalized.purpose || normalized['sec-purpose'] || '')
}

export function partitionFirstPartyRequestFailures(failures = [], baseUrl, fixtureHits = []) {
  const benignPrefetchAborts = []
  const benignFixtureAborts = []
  const fatal = []
  const fixtureKeys = new Set(fixtureHits.map((item) => `${String(item?.method || '').toUpperCase()} ${String(item?.url || '')}`))
  for (const item of failures) {
    const normalized = {
      method: String(item?.method || ''),
      url: String(item?.url || ''),
      errorText: String(item?.errorText || ''),
      resourceType: String(item?.resourceType || ''),
      headers: item?.headers && typeof item.headers === 'object' ? item.headers : {},
    }
    if (isDocumentedNextPrefetchAbort(normalized, baseUrl)) benignPrefetchAborts.push(normalized)
    else if (
      normalized.errorText === 'net::ERR_ABORTED' &&
      fixtureKeys.has(`${normalized.method.toUpperCase()} ${normalized.url}`)
    ) benignFixtureAborts.push(normalized)
    else fatal.push(normalized)
  }
  return { benignPrefetchAborts, benignFixtureAborts, fatal }
}
