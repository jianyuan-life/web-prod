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

function hasWildcardDefaultSource(value) {
  return String(value || '').split(',').some((policy) => policy.split(';').some((directive) => {
    const [name = '', ...sources] = directive.trim().split(/\s+/)
    return name.toLowerCase() === 'default-src' && sources.includes('*')
  }))
}

export function inspectProductionCspHeaders(headers) {
  const enforced = describePolicy(getHeader(headers, 'content-security-policy'))
  const reportOnly = describePolicy(getHeader(headers, 'content-security-policy-report-only'))
  const errors = []
  if (!enforced.present) errors.push('enforced_csp_missing')
  if (!reportOnly.present) errors.push('report_only_csp_missing')
  if (hasWildcardDefaultSource(enforced.value)) errors.push('enforced_default_src_wildcard')
  if (hasWildcardDefaultSource(reportOnly.value)) errors.push('report_only_default_src_wildcard')
  return {
    ok: errors.length === 0,
    errors,
    enforced,
    reportOnly,
  }
}

function hasActiveStrictReadinessHold(value) {
  if (Array.isArray(value)) return value.length > 0
  return value != null && value !== false
}

export function compareProductionCspReceipts(baseline, candidate) {
  const errors = []
  const indexCases = (receipt, label) => {
    const indexed = new Map()
    if (!Array.isArray(receipt?.cases)) {
      errors.push(`${label}:cases_missing`)
      return indexed
    }
    for (const item of receipt.cases) {
      const id = String(item?.id || '')
      if (!id || indexed.has(id)) {
        errors.push(`${label}:${id || 'unknown'}:case_invalid`)
        continue
      }
      indexed.set(id, item)
    }
    return indexed
  }

  const baselineCases = indexCases(baseline, 'baseline')
  const candidateCases = indexCases(candidate, 'candidate')
  if (hasActiveStrictReadinessHold(candidate?.strictReadinessHold)) {
    errors.push('candidate:strict_readiness_hold')
  }
  if (candidate?.strictPolicyPromotionReady !== true) {
    errors.push('candidate:strict_policy_promotion_not_ready')
  }

  for (const id of [...new Set([...baselineCases.keys(), ...candidateCases.keys()])].sort()) {
    const baselineCase = baselineCases.get(id)
    const candidateCase = candidateCases.get(id)
    if (!baselineCase || !candidateCase) {
      errors.push(`${id}:case_missing`)
      continue
    }
    if (hasActiveStrictReadinessHold(candidateCase.strictReadinessHold)) {
      errors.push(`${id}:strict_readiness_hold`)
    }
    for (const [key, errorName] of [['enforced', 'enforced'], ['reportOnly', 'report_only']]) {
      const baselinePolicy = baselineCase?.cspHeaders?.[key]
      const candidatePolicy = candidateCase?.cspHeaders?.[key]
      const baselineSha256 = baselinePolicy?.sha256 ?? null
      const candidateSha256 = candidatePolicy?.sha256 ?? null
      for (const [label, policy, digest] of [
        ['baseline', baselinePolicy, baselineSha256],
        ['candidate', candidatePolicy, candidateSha256],
      ]) {
        if (policy?.present !== true) {
          errors.push(`${id}:${label}_${errorName}_missing`)
          continue
        }
        const expectedDigest = createHash('sha256').update(String(policy.value || ''), 'utf8').digest('hex')
        if (!/^[a-f0-9]{64}$/.test(digest || '') || digest !== expectedDigest) {
          errors.push(`${id}:${label}_${errorName}_hash_invalid`)
        }
      }
      if (
        baselinePolicy?.present !== candidatePolicy?.present
        || baselineSha256 !== candidateSha256
      ) errors.push(`${id}:${errorName}_sha256_mismatch`)
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] }
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
