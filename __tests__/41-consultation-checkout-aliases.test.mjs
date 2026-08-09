import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const baseUrl = process.env.CHECKOUT_ALIAS_BASE_URL
const routes = [
  {
    plan: 'C',
    alias: '/checkout/life-blueprint',
    routeFile: join(process.cwd(), 'app', 'checkout', 'life-blueprint', 'route.ts'),
    pageFile: join(process.cwd(), 'app', 'checkout', 'life-blueprint', 'page.tsx'),
    destination: '/checkout?plan=C',
    testIp: '198.18.0.240',
  },
  {
    plan: 'G15',
    alias: '/checkout/family-blueprint',
    routeFile: join(process.cwd(), 'app', 'checkout', 'family-blueprint', 'route.ts'),
    pageFile: join(process.cwd(), 'app', 'checkout', 'family-blueprint', 'page.tsx'),
    destination: '/checkout?plan=G15',
    testIp: '198.18.0.241',
  },
]

for (const route of routes) {
  test(`${route.plan} alias is a 307 Route Handler without a conflicting page`, () => {
    assert.equal(existsSync(route.pageFile), false)
    const source = readFileSync(route.routeFile, 'utf8')
    assert.match(source, /import\s*\{\s*NextResponse\s*\}\s*from\s*['"]next\/server['"]/)
    assert.match(source, /export\s+function\s+GET\s*\(request:\s*Request\)/)
    assert.match(source, new RegExp(`new URL\\(['"]${route.destination.replace('?', '\\?')}['"], request\\.url\\)`))
    assert.match(source, /NextResponse\.redirect\([^;]+,\s*307\)/s)
    assert.equal(source.includes('E3'), false)
    assert.equal(source.includes('permanentRedirect'), false)
  })

  test(
    `${route.plan} production response is wire-level 307 with same-origin Location`,
    { skip: !baseUrl },
    async () => {
      const origin = new URL(baseUrl)
      const response = await fetch(new URL(route.alias, origin), {
        redirect: 'manual',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
          'x-vercel-forwarded-for': route.testIp,
        },
      })
      const location = response.headers.get('location')
      assert.equal(response.status, 307)
      assert.ok(location)
      const redirectUrl = new URL(location)
      assert.equal(redirectUrl.origin, origin.origin)
      assert.equal(`${redirectUrl.pathname}${redirectUrl.search}`, route.destination)
    },
  )
}
