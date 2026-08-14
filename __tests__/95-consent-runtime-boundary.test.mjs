import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CONSENT_UPDATED_EVENT,
  DENIED_CONSENT,
  applyStoredConsentToVendors,
  hasAnalyticsConsent,
  hasMarketingConsent,
  isTelemetryEligiblePath,
  parseStoredConsent,
  readStoredConsent,
  saveStoredConsent,
  subscribeToConsent,
} from '../lib/privacy/consent.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('missing, malformed, and incomplete stored decisions fail closed', () => {
  for (const value of [
    null,
    '',
    '{',
    '{}',
    JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    JSON.stringify({
      necessary: true,
      analytics: 'true',
      marketing: true,
      decided_at: '2026-08-13T00:00:00.000Z',
    }),
    JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: true,
      decided_at: '0',
    }),
  ]) {
    assert.deepEqual(parseStoredConsent(value), DENIED_CONSENT)
  }
})

test('loaded Google and Meta vendors receive the effective stored decision, including private-route denial', () => {
  const originalWindow = globalThis.window
  let stored = JSON.stringify({
    necessary: true,
    analytics: true,
    marketing: true,
    decided_at: '2026-08-13T00:00:00.000Z',
  })
  const google = []
  const meta = []
  globalThis.window = {
    location: { pathname: '/tools/bazi' },
    localStorage: { getItem: () => stored },
    gtag: (...args) => google.push(args),
    fbq: (...args) => meta.push(args),
  }

  try {
    applyStoredConsentToVendors()
    assert.equal(google.at(-1)[2].analytics_storage, 'granted')
    assert.deepEqual(meta.at(-1), ['consent', 'grant'])

    applyStoredConsentToVendors('/CONSULTATION/private-token')
    assert.equal(google.at(-1)[2].analytics_storage, 'denied')
    assert.deepEqual(meta.at(-1), ['consent', 'revoke'])

    stored = null
    applyStoredConsentToVendors('/tools/bazi')
    assert.equal(google.at(-1)[2].analytics_storage, 'denied')
    assert.deepEqual(meta.at(-1), ['consent', 'revoke'])
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('private consultation variants fail closed while public and E3 paths stay eligible', () => {
  for (const path of [
    '/consultation/private-token',
    '/CONSULTATION/private-token',
    '/consultation%2Fprivate-token',
    '/%63onsultation/private-token',
    '/%2563onsultation%252Fprivate-token',
  ]) {
    assert.equal(isTelemetryEligiblePath(path), false, path)
  }
  for (const path of ['/report/e3-token', '/pricing?plan=E3', '/tools/bazi']) {
    assert.equal(isTelemetryEligiblePath(path), true, path)
  }
})

test('analytics and marketing checks re-read storage at the call boundary', () => {
  const originalWindow = globalThis.window
  let stored = JSON.stringify({
    necessary: true,
    analytics: true,
    marketing: true,
    decided_at: '2026-08-13T00:00:00.000Z',
  })
  globalThis.window = {
    location: { pathname: '/tools/bazi' },
    localStorage: { getItem: () => stored },
  }
  try {
    assert.equal(hasAnalyticsConsent(), true)
    assert.equal(hasMarketingConsent(), true)

    stored = JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
      decided_at: '2026-08-13T00:01:00.000Z',
    })
    assert.equal(hasAnalyticsConsent(), false)
    assert.equal(hasMarketingConsent(), false)
    assert.equal(hasAnalyticsConsent('/CONSULTATION/private-token'), false)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('saving consent grants only after a successful storage round-trip', () => {
  const originalWindow = globalThis.window
  const browser = new EventTarget()
  let stored = null
  let eventDetail = Symbol('not-dispatched')
  browser.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value },
  }
  browser.addEventListener(CONSENT_UPDATED_EVENT, (event) => {
    eventDetail = event.detail
  })
  globalThis.window = browser

  try {
    const saved = saveStoredConsent({ analytics: true, marketing: false })
    assert.equal(saved.decided, true)
    assert.equal(saved.analytics, true)
    assert.equal(readStoredConsent().analytics, true)
    assert.equal(eventDetail, undefined, 'notification detail must not become a second authority')

    browser.localStorage.setItem = () => { throw new Error('blocked') }
    stored = null
    const rejected = saveStoredConsent({ analytics: true, marketing: true })
    assert.deepEqual(rejected, DENIED_CONSENT)
    assert.deepEqual(readStoredConsent(), DENIED_CONSENT)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('same-tab and cross-tab notifications always re-read storage and ignore event detail', () => {
  const originalWindow = globalThis.window
  let stored = JSON.stringify({
    necessary: true,
    analytics: false,
    marketing: false,
    decided_at: '2026-08-13T00:00:00.000Z',
  })
  const browser = new EventTarget()
  browser.localStorage = { getItem: () => stored }
  globalThis.window = browser

  const seen = []
  try {
    const unsubscribe = subscribeToConsent((snapshot) => seen.push(snapshot))

    browser.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, {
      detail: { analytics: true, marketing: true },
    }))
    assert.equal(seen.at(-1).analytics, false, 'forged event detail must not grant consent')

    stored = JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: false,
      decided_at: '2026-08-13T00:01:00.000Z',
    })
    browser.dispatchEvent(new Event('storage'))
    assert.equal(seen.at(-1).analytics, true)

    const count = seen.length
    unsubscribe()
    browser.dispatchEvent(new Event(CONSENT_UPDATED_EVENT))
    assert.equal(seen.length, count)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('the runtime reader uses storage as the only consent authority and SSR denies', () => {
  const originalWindow = globalThis.window
  const stored = JSON.stringify({
    necessary: true,
    analytics: true,
    marketing: false,
    decided_at: '2026-08-13T00:00:00.000Z',
  })

  try {
    delete globalThis.window
    assert.deepEqual(readStoredConsent(), DENIED_CONSENT)

    globalThis.window = {
      localStorage: { getItem: () => stored },
    }
    assert.deepEqual(readStoredConsent(), {
      necessary: true,
      analytics: true,
      marketing: false,
      decided_at: '2026-08-13T00:00:00.000Z',
      decided: true,
    })

    globalThis.window.localStorage.getItem = () => {
      throw new Error('blocked')
    }
    assert.deepEqual(readStoredConsent(), DENIED_CONSENT)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('every client telemetry surface delegates to the shared storage-backed boundary', () => {
  const expectedImports = [
    'components/Tracker.tsx',
    'components/WebVitalsReporter.tsx',
    'lib/monitoring/web-vitals.ts',
    'components/PrivacySafeVercelTelemetry.tsx',
    'components/CookieConsent.tsx',
    'app/tools/bazi/page.tsx',
  ]
  for (const path of expectedImports) {
    assert.match(read(path), /@\/lib\/privacy\/consent/u, path)
  }

  const tracker = read('components/Tracker.tsx')
  assert.match(tracker, /hasAnalyticsConsent/u)
  assert.match(tracker, /sessionStorage\.removeItem\(['"]jy_session['"]\)/u)
  assert.match(tracker, /XMLHttpRequest/u)
  assert.match(tracker, /request\.abort\(\)/u)
  assert.match(tracker, /navigator\.sendBeacon[\s\S]*?hasAnalyticsConsent|hasAnalyticsConsent[\s\S]*?navigator\.sendBeacon/u)

  const reporter = read('components/WebVitalsReporter.tsx')
  assert.match(reporter, /hasAnalyticsConsent\(\)[\s\S]*?reportWebVital/u)
  const transport = read('lib/monitoring/web-vitals.ts')
  assert.ok((transport.match(/hasAnalyticsConsent/gu) || []).length >= 2)

  const loader = read('components/PrivacySafeVercelTelemetry.tsx')
  assert.match(loader, /useStoredConsent/u)
  assert.match(loader, /hasAnalyticsConsent\(\)/u)

  const cookie = read('components/CookieConsent.tsx')
  assert.match(cookie, /CONSENT_SETTINGS_EVENT/u)
  assert.match(cookie, /saveStoredConsent/u)
  assert.doesNotMatch(cookie, /const STORAGE_KEY/u)

  const privacy = read('app/privacy/page.tsx')
  assert.match(privacy, /ConsentSettingsButton/u)

  const bazi = read('app/tools/bazi/page.tsx')
  assert.match(bazi, /hasAnalyticsConsent\(\)[\s\S]*?gtag\.event/u)
  assert.match(bazi, /hasMarketingConsent\(\)[\s\S]*?fbpixel\.trackEvent/u)
})
