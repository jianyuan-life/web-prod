import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { isConsultationReaderPath } from '../lib/consultation/routes.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('consultation reader path classifier is narrow and does not capture legacy E3 reports', () => {
  assert.equal(isConsultationReaderPath('/consultation/token-123'), true)
  assert.equal(isConsultationReaderPath('/consultation/'), true)
  assert.equal(isConsultationReaderPath('/report/e3-token'), false)
  assert.equal(isConsultationReaderPath('/checkout?plan=E3'), false)
  assert.equal(isConsultationReaderPath(null), false)
})

test('private reader removes public chrome without hiding consent', () => {
  for (const path of [
    'components/Navbar.tsx',
    'components/CookieConsent.tsx',
    'components/FirstVisitWarmBanner.tsx',
    'components/GlobalBackToTop.tsx',
  ]) {
    assert.match(read(path), /isConsultationReaderPath/u, `${path} must use the shared route classifier`)
  }

  const cookie = read('components/CookieConsent.tsx')
  assert.match(cookie, /jy-cookie--consultation/u)
  assert.doesNotMatch(cookie, /isConsultationReport[^\n]+return null/u)

  const css = read('app/presentation.css')
  assert.match(css, /\.jy-cookie\.jy-cookie--consultation/u)
  assert.match(css, /body:has\(\[data-consultation-report\]\) \.jy-footer/u)
  assert.match(css, /body:has\(\[data-consultation-report\]\) #main-content/u)
})

test('consultation tokens receive the same private-edge protections as legacy reports', () => {
  const middleware = read('middleware.ts')
  const routeMentions = middleware.match(/pathname\.startsWith\('\/consultation\/'\)/gu) ?? []
  assert.ok(routeMentions.length >= 2, 'middleware must validate consultation tokens and mark the route private')
  assert.match(middleware, /\^\\\/consultation\\\/\(\[\^\\\/\]\+\)/u)

  const robots = read('app/robots.ts')
  assert.match(robots, /'\/consultation\/'/u)
})

test('consultation PDF endpoint has a dedicated bounded download rate', () => {
  const middleware = read('middleware.ts')
  assert.match(
    middleware,
    /path\.startsWith\('\/api\/consultation\/'\)[\s\S]{0,320}maxPerMinute\s*=\s*4/u,
  )
})
