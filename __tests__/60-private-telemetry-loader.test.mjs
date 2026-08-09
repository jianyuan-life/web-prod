import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const layout = read('app/layout.tsx')
const telemetry = read('components/PrivacySafeVercelTelemetry.tsx')
const cookie = read('components/CookieConsent.tsx')

test('server layout emits no unconditional Google or Meta request surface when JavaScript is disabled', () => {
  assert.doesNotMatch(layout, /<noscript>[\s\S]*?facebook\.com\/tr/iu)
  assert.doesNotMatch(layout, /<script[^>]+src=\{?`?https:\/\/www\.googletagmanager\.com/iu)
  assert.doesNotMatch(layout, /connect\.facebook\.net\/en_US\/fbevents\.js/iu)
  assert.match(layout, /<PrivacySafeVercelTelemetry[\s\S]*?gaMeasurementId=/u)
  assert.match(layout, /metaPixelId=/u)
})

test('client loader fails closed on private paths and waits for explicit consent', () => {
  assert.match(telemetry, /usePathname/u)
  assert.match(telemetry, /isPrivateConsultationUrl/u)
  assert.match(telemetry, /if \(!pathname \|\| isPrivateConsultationUrl\(pathname\)\) return null/u)
  assert.match(telemetry, /jy_cookie_consent_v1/u)
  assert.match(telemetry, /jy:consent-updated/u)
  assert.match(telemetry, /consent\.analytics[\s\S]*?<Analytics/u)
  assert.match(telemetry, /consent\.analytics[\s\S]*?<SpeedInsights/u)
  assert.match(telemetry, /consent\.analytics[\s\S]*?googletagmanager\.com/u)
  assert.match(telemetry, /consent\.marketing[\s\S]*?fbevents\.js/u)
})

test('saving consent notifies the client loader without a reload', () => {
  assert.match(cookie, /window\.dispatchEvent\([\s\S]*?jy:consent-updated/u)
})
