import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  isPrivateConsultationUrl,
  redactConsultationReferences,
  redactConsultationUrl,
} from '../lib/security/private-route-redaction.ts'
import { buildClientErrorTelemetry } from '../lib/security/client-error-telemetry.ts'
import { sanitizeAuditEvent } from '../lib/security/audit-event.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('private consultation bearer tokens are redacted from relative and absolute telemetry URLs', () => {
  assert.equal(redactConsultationUrl('/consultation/secret-token-123'), '/consultation/[private]')
  assert.equal(
    redactConsultationUrl('https://jianyuan.life/consultation/secret-token-123?utm=x#chapter'),
    'https://jianyuan.life/consultation/[private]',
  )
  assert.equal(isPrivateConsultationUrl('/consultation/secret-token-123'), true)
})

test('legacy E3 and all non-consultation routes remain byte-for-byte unchanged', () => {
  for (const value of [
    '/report/e3-token?chapter=timings',
    'https://jianyuan.life/report/e3-token#timings',
    '/pricing?plan=E3',
  ]) {
    assert.equal(redactConsultationUrl(value), value)
    assert.equal(isPrivateConsultationUrl(value), false)
  }
})

test('embedded private links are removed from every executable error telemetry sink payload', () => {
  const token = 'secret-token-123'
  const absolute = `https://jianyuan.life/consultation/${token}?chapter=family`
  const encoded = encodeURIComponent(`/consultation/${token}?chapter=family`)
  const telemetry = buildClientErrorTelemetry({
    digest: `digest ${absolute}`,
    message: `Failed while opening ${absolute}`,
    stack: `at render (${absolute}:1:1) encoded=${encoded}`,
    url: absolute,
    ua: `test-agent ${absolute}`,
  })
  const serialized = JSON.stringify(telemetry)

  assert.doesNotMatch(serialized, new RegExp(token, 'u'))
  assert.match(serialized, /\[private\]/u)
  assert.equal(redactConsultationReferences(`/report/e3-token ${absolute}`).startsWith('/report/e3-token '), true)
  assert.equal(telemetry.audit.pathname, telemetry.sentry.extra.url)
  assert.equal(telemetry.audit.details.stack, telemetry.sentry.extra.stack)
})

test('central audit sink redacts private references recursively before console or Sentry', () => {
  const token = 'private-rate-limit-token'
  const path = `/consultation/${token}`
  const event = sanitizeAuditEvent({
    type: 'rate-limit-exceeded',
    ts: '2026-08-08T00:00:00.000Z',
    pathname: path,
    reason: `shared ${path}`,
    severity: 'error',
    details: { nested: [`absolute https://jianyuan.life${path}?x=1`] },
  })
  const serialized = JSON.stringify(event)

  assert.doesNotMatch(serialized, new RegExp(token, 'u'))
  assert.match(serialized, /\[private\]/u)
})

test('encoded, escaped, HTML-encoded, and deeply nested private references fail closed', () => {
  const accessParts = ['AbCdEf0123456789', '_-xYz987654']
  const token = accessParts.join('')
  const path = `/consultation/${token}`
  const variants = [
    encodeURIComponent(encodeURIComponent(path)),
    `/consultation%2F${token}`,
    `\\/consultation\\/${token}`,
    `&#x2F;consultation&#47;${token}`,
  ]
  for (const variant of variants) {
    assert.doesNotMatch(redactConsultationReferences(variant), new RegExp(token, 'u'))
  }

  const deep = { level1: { level2: { level3: { level4: { level5: { secret: path } } } } } }
  const sanitized = JSON.stringify(sanitizeAuditEvent({
    type: 'client-error',
    ts: '2026-08-08T00:00:00.000Z',
    details: deep,
  }))
  assert.doesNotMatch(sanitized, new RegExp(token, 'u'))
  assert.match(sanitized, /\[private\]/u)
})

test('speculation and SPA history navigation are disabled only for private consultation routes', () => {
  const layout = read('app/layout.tsx')
  assert.equal((layout.match(/href_matches: '\/consultation\/\*'/gu) || []).length, 2)

  const dashboard = read('app/dashboard/page.tsx')
  assert.match(
    dashboard,
    /isConsultationPlan\(r\.plan_code\) \? \(\s*<a\s+href=\{buildReportRoute\(r\.plan_code, r\.access_token\)\}/u,
  )
})

test('every first-party and Vercel telemetry surface applies the shared private-route policy', () => {
  for (const path of [
    'components/Tracker.tsx',
    'components/PrivacySafeVercelTelemetry.tsx',
    'lib/monitoring/web-vitals.ts',
    'lib/security/client-audit.ts',
    'lib/security/client-error-telemetry.ts',
    'app/error.tsx',
    'app/api/track/route.ts',
    'app/api/web-vitals/route.ts',
  ]) {
    assert.match(read(path), /private-route-redaction/u, `${path} must share the redaction policy`)
  }


  const errorRoute = read('app/api/error-report/route.ts')
  const postBoundary = errorRoute.slice(errorRoute.indexOf('const telemetry ='))
  assert.match(errorRoute, /buildClientErrorTelemetry/u)
  assert.doesNotMatch(postBoundary, /payload\.(?:url|message|stack|digest|ua)/u)

  const layout = read('app/layout.tsx')
  assert.match(layout, /PrivacySafeVercelTelemetry/u)
  assert.match(layout, /isPrivateConsultationPath/u)
  assert.doesNotMatch(layout, /<Analytics\s*\/>/u)
  assert.doesNotMatch(layout, /<SpeedInsights\s*\/>/u)
})
