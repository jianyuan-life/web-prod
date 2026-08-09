import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { suite, test, assert, assertEqual, done } from './harness.mjs'
import {
  inspectProductionCspHeaders,
  isFatalRuntimeConsoleError,
  isSameOriginHttpError,
  partitionCspViolations,
  partitionFirstPartyRequestFailures,
  syntheticSecret,
} from '../scripts/lib/e3-production-csp-core.mjs'

suite('E3 production CSP smoke 契約')
const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const script = readFileSync(new URL('../scripts/e3-production-csp-smoke.mjs', import.meta.url), 'utf8')
const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
const gitAttributes = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8')
const fetchPreload = readFileSync(new URL('../scripts/lib/e3-production-fetch-preload.cjs', import.meta.url), 'utf8')

test('production smoke 不得繞過 CSP', () => {
  assert(!script.includes('bypassCSP'), 'production CSP smoke 不得設定 bypassCSP')
  assert(script.includes('securitypolicyviolation'), '必須直接收集 CSP violation')
  assert(script.includes('event.disposition'), '必須保存 report/enforce disposition')
  assert(script.includes('event.originalPolicy'), '必須保存觸發事件的原始 policy')
  assert(script.includes("nextCli, 'start'"), '必須測 next start，不得以 next dev 代替')
  assert(script.includes("nextCli, 'build'"), 'production smoke 必須以同一合成環境重建，不能沿用錯誤 build-time public env')
  assert(script.includes('smokeEnvironment'), 'build 與 start 必須共用同一合成環境')
})

test('Report-Only 只留證據，enforce 與未知 disposition 一律 fail closed', () => {
  const partitioned = partitionCspViolations([
    { disposition: 'report', blockedURI: 'inline', effectiveDirective: 'script-src-elem' },
    { disposition: 'enforce', blockedURI: 'https://evil.invalid/x.js', effectiveDirective: 'script-src-elem' },
    { disposition: 'future-value', blockedURI: 'https://unknown.invalid/y.js', effectiveDirective: 'script-src-elem' },
    { blockedURI: 'https://missing.invalid/z.js', effectiveDirective: 'script-src-elem' },
  ])

  assertEqual(partitioned.reportOnly.length, 1)
  assertEqual(partitioned.enforced.length, 1)
  assertEqual(partitioned.unknown.length, 2)
  assertEqual(partitioned.strictReadinessHold.length, 1)
  assertEqual(partitioned.runtimeFailures.length, 3)
  assertEqual(partitioned.fatal.length, 3)
})

test('正式 CSP 標頭必存在並以 SHA-256 綁定，Report-Only 不可冒充 enforced', () => {
  const inspected = inspectProductionCspHeaders({
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
    'content-security-policy-report-only': "default-src 'self'; script-src 'self' 'strict-dynamic'",
  })
  assert(inspected.ok)
  assertEqual(inspected.enforced.present, true)
  assertEqual(inspected.reportOnly.present, true)
  assert(/^[0-9a-f]{64}$/.test(inspected.enforced.sha256))
  assert(/^[0-9a-f]{64}$/.test(inspected.reportOnly.sha256))
  assert(inspected.enforced.value.includes("'unsafe-inline'"))
  assert(inspected.reportOnly.value.includes("'strict-dynamic'"))

  const missing = inspectProductionCspHeaders({
    'content-security-policy-report-only': "default-src 'self'",
  })
  assertEqual(missing.ok, false)
  assert(missing.errors.includes('enforced_csp_missing'))
})

test('只有帶 Next prefetch 證據的同源 RSC ERR_ABORTED 可列診斷，其餘網路錯誤仍阻擋', () => {
  const baseUrl = 'http://127.0.0.1:3000'
  const partitioned = partitionFirstPartyRequestFailures([
    {
      method: 'GET',
      url: `${baseUrl}/auth/login?_rsc=abc`,
      errorText: 'net::ERR_ABORTED',
      resourceType: 'fetch',
      headers: { 'next-router-prefetch': '1' },
    },
    {
      method: 'POST',
      url: `${baseUrl}/api/track/funnel`,
      errorText: 'net::ERR_ABORTED',
      resourceType: 'fetch',
      headers: {},
    },
    {
      method: 'GET',
      url: `${baseUrl}/api/data?_rsc=abc`,
      errorText: 'net::ERR_ABORTED',
      resourceType: 'fetch',
      headers: {},
    },
    {
      method: 'GET',
      url: `${baseUrl}/_next/static/chunk.js`,
      errorText: 'net::ERR_FAILED',
      resourceType: 'script',
      headers: {},
    },
  ], baseUrl, [{ method: 'POST', url: `${baseUrl}/api/track/funnel` }])
  assertEqual(partitioned.benignPrefetchAborts.length, 1)
  assertEqual(partitioned.benignFixtureAborts.length, 1)
  assertEqual(partitioned.fatal.length, 2)
})

test('SRI digest mismatch 是 runtime fatal，單純提及 integrity 不可誤殺', () => {
  assert(isFatalRuntimeConsoleError("Failed to find a valid digest in the 'integrity' attribute for resource"))
  assert(isFatalRuntimeConsoleError('Subresource Integrity check failed: digest mismatch; resource has been blocked'))
  assertEqual(isFatalRuntimeConsoleError('Subresource integrity check succeeded'), false)
})

test('只有真正同源的 4xx/5xx response 是第一方 runtime failure', () => {
  const baseUrl = 'http://127.0.0.1:3000'
  assert(isSameOriginHttpError(`${baseUrl}/api/reports`, 400, baseUrl))
  assert(isSameOriginHttpError(`${baseUrl}/_next/chunk.js`, 503, baseUrl))
  assertEqual(isSameOriginHttpError(`${baseUrl}/api/reports`, 399, baseUrl), false)
  assertEqual(isSameOriginHttpError('http://127.0.0.1:3000.evil.invalid/x', 500, baseUrl), false)
  assertEqual(isSameOriginHttpError('not a url', 500, baseUrl), false)
})

test('合成憑證只在執行期生成，保留 SDK 前綴且不同用途不共用值', () => {
  const prefix = ['s', 'k', '_', 't', 'e', 's', 't', '_']
  const first = syntheticSecret('stripe-secret', prefix)
  const second = syntheticSecret('stripe-webhook', prefix)
  assert(first.startsWith(prefix.join('')))
  assert(first.length >= prefix.length + 64)
  assertEqual(first, syntheticSecret('stripe-secret', prefix))
  assert(first !== second)

  for (const name of [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CLAUDE_API_KEY',
    'REPORT_COOKIE_SECRET',
    'CALCULATOR_ATTESTATION_SECRET',
    'CONSULTATION_SESSION_SECRET',
  ]) {
    const assignment = script.match(new RegExp(`${name}:\\s*([^,\\n]+)`))
    assert(assignment, `缺少 ${name} 合成環境值`)
    assert(assignment[1].includes('syntheticSecret('), `${name} 不得寫死類憑證字串`)
  }
})

test('production smoke 覆蓋 E3 五個客戶表面與雙尺寸', () => {
  for (const surface of ['home', 'pricing', 'checkout', 'dashboard', 'report']) {
    assert(script.includes(`'${surface}'`), `缺少 ${surface} surface`)
  }
  assert(script.includes("name: 'mobile-dark'"))
  assert(script.includes("name: 'desktop-light'"))
  assert(script.includes("name: '開始月度密集補運'"))
  assert(script.includes("name: '加入 Google 行事曆'"))
})

test('production smoke 必須 fail closed 收集 runtime 與第一方網路錯誤', () => {
  for (const signal of ['pageErrors', 'cspConsoleMessages', 'enforcedCspViolations', 'unknownCspViolations', 'reportOnlyCspViolations', 'requestFailures', 'benignPrefetchAborts', 'benignFixtureAborts', 'firstPartyHttpErrors']) {
    assert(script.includes(signal), `缺少 ${signal}`)
  }
  assert(script.includes('isSameOriginHttpError'), '第一方 4xx/5xx 必須以精確 origin 比對後阻擋')
  assert(script.includes('isFatalRuntimeConsoleError'), 'SRI mismatch 必須經可測試的 runtime classifier 阻擋')
  assert(script.includes('cspHeaders'), '收據必須綁定正式 CSP response headers')
  assert(script.includes('strictReadinessHold'), 'Report-Only 違規必須明列為 strict CSP 升級阻擋')
  assert(script.includes('strictPolicyPromotionReady'), 'Report-Only 尚有違規時不得宣稱 strict CSP 已可升 enforced')
  assert(script.includes("mode: 'production-next-start-no-csp-bypass'"))
})

test('SRI 保護腳本跨 Windows checkout 必須固定 LF，避免本機假 mismatch', () => {
  assert(gitAttributes.includes('public/scripts/devtools-warning.js text eol=lf'))
})

test('CSP 回報與已知遙測必須由本機 fixture 接住，不能把自造 429 當產品失敗', () => {
  for (const endpoint of [
    '**/api/csp-report**',
    '**/api/track/funnel**',
    '**/api/track**',
    '**/api/error-report**',
    '**/api/referral/my-code**',
  ]) {
    assert(script.includes(endpoint), `缺少 ${endpoint} fixture route`)
  }
})

test('本機 Supabase 只在 Node preload 轉送；瀏覽器仍使用 CSP 已允許的專用 supabase.co host', () => {
  assert(script.includes('E3_CSP_SMOKE_FIXTURE_ORIGIN: fixtureServer.origin'))
  assert(script.includes("E3_CSP_SMOKE_PUBLIC_SUPABASE_ORIGIN: 'https://e3-freeze.supabase.co'"))
  assert(script.includes('NODE_OPTIONS'))
  assert(fetchPreload.includes("publicUrl.hostname !== 'e3-freeze.supabase.co'"))
  assert(fetchPreload.includes("fixtureUrl.hostname !== '127.0.0.1'"))
  assert(fetchPreload.includes("url.pathname.startsWith('/rest/v1/')"))
  assert(!nextConfig.includes('E3_CSP_SMOKE_FIXTURE_ORIGIN'), 'test fixture 不得改 E3 production CSP source')
  assert(!nextConfig.includes("connect-src *"), '不得以通配 connect-src 讓 smoke 假綠')
})

test('合成 fixture 不得把真實客戶資料帶進 production smoke', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/e3-freeze/runtime-fixtures.json', import.meta.url), 'utf8'))
  const serialized = JSON.stringify(fixture)
  assertEqual(fixture.report.plan_code, 'E3')
  assert(fixture.auth.user.email.endsWith('.invalid'))
  assert(!/(何宣逸|何紀萳|何宥諄|@gmail\.|@jianyuan\.life)/.test(serialized))
  assert(script.includes('createE3FixtureServer'), 'SSR 必須連本機合成 Supabase fixture')
  assert(script.includes("NEXT_PUBLIC_SUPABASE_URL: 'https://e3-freeze.supabase.co'"))
  assert(script.includes('fixtureServerRequests'), '收據必須保留 SSR fixture request 路徑')
})

done()
