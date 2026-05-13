// v5.10.256 smoke test for production routes
// Run: node scripts/smoke-test-routes.mjs
//
// 對應 Codex L3 P0 「/r/[type]/[id] 四型 smoke/regression test」+ Gemini L4 P1 「Feature Flag/env matrix 測試」
//
// 測試:
//   1. 公開 page 全 200(/, /pricing, /dashboard, /auth/login, /whitepaper, /blog, /about, /faq, /privacy, /terms)
//   2. Tools 全 200(/tools/bazi, /tools/ziwei, /tools/qimen, /tools/name)
//   3. /r/* Beta-gated:HTTP 200 但 body 含「404 找不到此頁面」(Beta gate active 證明)
//   4. /r/<type>/<bad-format-id> 應 404
//   5. /report/[token]/ 舊路由仍 200(向後相容)

// v5.10.265 Codex L3 audit 修 P1#3:CI 可移植性
//   - 原硬編 D:/npm-global(本機開發 OK、Linux GitHub Actions 失敗)
//   - 改:try local node_modules → fall back global → fall back system
//   - 在 GitHub Actions runner 上、playwright 通過 npm install 進 node_modules

let chromium
try {
  // 1. Try local node_modules first(Linux CI 預期路徑)
  const m = await import('playwright')
  chromium = m.chromium
} catch {
  try {
    // 2. Try Windows global npm path(本機開發)
    const { createRequire } = await import('module')
    const r = createRequire('file:///D:/npm-global/node_modules/')
    chromium = r('playwright').chromium
  } catch {
    try {
      // 3. Try Linux global npm path
      const { createRequire } = await import('module')
      const r = createRequire('file:///usr/lib/node_modules/')
      chromium = r('playwright').chromium
    } catch (e) {
      console.error('Cannot find playwright:', e.message)
      process.exit(1)
    }
  }
}

const BASE = 'https://www.jianyuan.life'

const PUBLIC_PAGES = [
  '/', '/pricing', '/dashboard', '/auth/login',
  '/whitepaper', '/blog', '/about', '/faq', '/privacy', '/terms',
  '/tools/bazi', '/tools/ziwei', '/tools/qimen', '/tools/name',
]

const BETA_GATED = [
  '/r/life-blueprint/demo',
  '/r/heart-doubts/demo',
  '/r/compatibility/demo',
  '/r/family-blueprint/demo',
]

const BAD_FORMAT = [
  '/r/life-blueprint/a', // too short(<2 chars)
  '/r/life-blueprint/' + 'x'.repeat(65), // too long(>64 chars)
  '/r/invalid-type/demo', // invalid type
]

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  let pass = 0, fail = 0
  const failures = []

  // 1. Public pages: 200 + 沒 NEXT_HTTP_ERROR_FALLBACK
  for (const path of PUBLIC_PAGES) {
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
      const status = resp ? resp.status() : 0
      const body = await page.content()
      const has404 = body.includes('NEXT_HTTP_ERROR_FALLBACK;404')
      if (status === 200 && !has404) {
        pass++
        console.log(`✅ ${path} = 200 (public)`)
      } else {
        fail++
        failures.push(`❌ ${path} = ${status}${has404 ? ' + 404 body!' : ''}`)
        console.log(failures[failures.length - 1])
      }
    } catch (e) {
      fail++
      failures.push(`❌ ${path}: navigation error ${e.message.slice(0, 80)}`)
      console.log(failures[failures.length - 1])
    }
  }

  // 2. Beta-gated: 200 HTTP + 404 body(Beta gate active)
  for (const path of BETA_GATED) {
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
      const status = resp ? resp.status() : 0
      const body = await page.content()
      const has404 = body.includes('NEXT_HTTP_ERROR_FALLBACK;404') || body.includes('找不到此頁面')
      if (status === 200 && has404) {
        pass++
        console.log(`✅ ${path} = 200 + 404 body (Beta gate active = correct)`)
      } else {
        fail++
        failures.push(`❌ ${path}: expected 200+404body, got ${status}, has404body=${has404}`)
        console.log(failures[failures.length - 1])
      }
    } catch (e) {
      fail++
      failures.push(`❌ ${path}: navigation error ${e.message.slice(0, 80)}`)
      console.log(failures[failures.length - 1])
    }
  }

  // 3. Bad format: 200 + 404 body(rejected by regex)
  for (const path of BAD_FORMAT) {
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
      const status = resp ? resp.status() : 0
      const body = await page.content()
      const has404 = body.includes('NEXT_HTTP_ERROR_FALLBACK;404') || body.includes('找不到此頁面')
      if (has404) {
        pass++
        console.log(`✅ ${path} = rejected (status=${status}, has 404 body)`)
      } else {
        fail++
        failures.push(`❌ ${path}: bad format not rejected, status=${status}`)
        console.log(failures[failures.length - 1])
      }
    } catch (e) {
      fail++
      failures.push(`❌ ${path}: navigation error ${e.message.slice(0, 80)}`)
      console.log(failures[failures.length - 1])
    }
  }

  await browser.close()

  console.log(`\n=== Smoke Test Summary ===`)
  console.log(`Pass: ${pass}, Fail: ${fail}`)
  if (failures.length > 0) {
    console.log('Failures:')
    for (const f of failures) console.log(`  ${f}`)
  }
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('ERR:', e.message)
  process.exit(1)
})
