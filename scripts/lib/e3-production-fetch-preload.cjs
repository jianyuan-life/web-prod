'use strict'

const cspPublicOrigin = process.env.E3_CSP_SMOKE_PUBLIC_SUPABASE_ORIGIN || ''
const cspFixtureOrigin = process.env.E3_CSP_SMOKE_FIXTURE_ORIGIN || ''
const parityPublicOrigin = process.env.E3_FREEZE_PUBLIC_SUPABASE_ORIGIN || ''
const parityFixtureOrigin = process.env.E3_FREEZE_FIXTURE_ORIGIN || ''
const cspPairConfigured = Boolean(cspPublicOrigin || cspFixtureOrigin)
const parityPairConfigured = Boolean(parityPublicOrigin || parityFixtureOrigin)

if (cspPairConfigured && parityPairConfigured) {
  throw new Error('E3 production fixture preload 不允許同時設定 CSP 與 parity contract')
}

const publicOrigin = cspPairConfigured ? cspPublicOrigin : parityPublicOrigin
const fixtureOrigin = cspPairConfigured ? cspFixtureOrigin : parityFixtureOrigin

if (publicOrigin || fixtureOrigin) {
  if (!publicOrigin || !fixtureOrigin) {
    throw new Error('E3 production Supabase preload 需要成對 origin')
  }

  const publicUrl = new URL(publicOrigin)
  const fixtureUrl = new URL(fixtureOrigin)
  if (
    publicUrl.protocol !== 'https:' ||
    publicUrl.hostname !== 'e3-freeze.supabase.co' ||
    publicUrl.pathname !== '/' ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password
  ) {
    throw new Error('E3 production public Supabase origin 不合法')
  }
  if (
    fixtureUrl.protocol !== 'http:' ||
    fixtureUrl.hostname !== '127.0.0.1' ||
    !/^\d+$/.test(fixtureUrl.port) ||
    fixtureUrl.pathname !== '/' ||
    fixtureUrl.search ||
    fixtureUrl.hash ||
    fixtureUrl.username ||
    fixtureUrl.password
  ) {
    throw new Error('E3 production fixture origin 不合法')
  }

  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') {
    throw new Error('E3 production preload 找不到 Node fetch')
  }

  globalThis.fetch = function e3ProductionFixtureFetch(input, init) {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl)
    const isSupabaseFixtureRequest =
      url.origin === publicUrl.origin &&
      (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/'))

    if (!isSupabaseFixtureRequest) return originalFetch(input, init)

    const rewrittenUrl = `${fixtureUrl.origin}${url.pathname}${url.search}`
    if (input instanceof Request) {
      return originalFetch(new Request(rewrittenUrl, input), init)
    }
    return originalFetch(rewrittenUrl, init)
  }
}
