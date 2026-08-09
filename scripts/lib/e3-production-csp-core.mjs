import { createHash } from 'node:crypto'

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

  return {
    reportOnly,
    enforced,
    unknown,
    fatal: [...enforced, ...unknown],
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
