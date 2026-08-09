#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer as createNetServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectProductionCspHeaders,
  partitionCspViolations,
  partitionFirstPartyRequestFailures,
} from './lib/e3-production-csp-core.mjs'
import { createE3FixtureServer } from './lib/e3-fixture-server.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const fixturePath = join(projectRoot, '__tests__', 'fixtures', 'e3-freeze', 'runtime-fixtures.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
const USER_AGENT = 'Jianyuan-E3-Production-CSP-Smoke/1.0'

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

async function loadChromium() {
  try {
    return (await import('playwright')).chromium
  } catch {
    for (const root of ['D:/npm-global/node_modules/', '/usr/lib/node_modules/']) {
      try {
        return createRequire(new URL(`file:///${root.replace(/\\/g, '/')}`))('playwright').chromium
      } catch {}
    }
  }
  throw new Error('找不到 Playwright；production CSP smoke 不可降級')
}

async function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('無法取得本機 port'))
        return
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port))
    })
  })
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`next start 提前結束，exit=${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status < 500) return response
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  throw new Error(`等待 next start 超時：${lastError}`)
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ])
  if (child.exitCode == null) child.kill('SIGKILL')
}

async function buildProductionBundle(nextCli, environment) {
  const buildLogs = []
  const child = spawn(process.execPath, [nextCli, 'build'], {
    cwd: projectRoot,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      buildLogs.push(String(chunk))
      if (buildLogs.length > 160) buildLogs.shift()
    })
  }
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', (code) => resolveExit(code))
  })
  if (exitCode !== 0) {
    const tail = buildLogs.join('').split(/\r?\n/).filter(Boolean).slice(-35).join('\n')
    throw new Error(`production smoke build 失敗，exit=${exitCode}\n${tail}`)
  }
}

async function poll(label, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate().catch(() => false)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`${label} 在 ${timeoutMs}ms 內未就緒`)
}

async function prepareContext(context) {
  const fixtureHits = []
  await context.addInitScript(({ session }) => {
    window.__e3CspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__e3CspViolations.push({
        blockedURI: event.blockedURI,
        disposition: event.disposition,
        directive: event.effectiveDirective,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        statusCode: event.statusCode,
      })
    })
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      localStorage.setItem('sb-jianyuan-auth', JSON.stringify({ ...session, user: session.user }))
      localStorage.setItem('jianyuan_email', session.user.email)
      localStorage.setItem('currency', 'USD')
      localStorage.setItem('jy_cookie_consent_v1', JSON.stringify({
        necessary: true,
        analytics: false,
        marketing: false,
        decided_at: '2026-08-01T00:00:00.000Z',
      }))
    }
  }, { session: { ...fixture.auth.session, user: fixture.auth.user } })

  const empty204 = (route) => {
    const request = route.request()
    fixtureHits.push({ method: request.method(), url: request.url() })
    return route.fulfill({ status: 204, body: '' })
  }
  for (const pattern of [
    '**/api/report-view**',
    '**/api/web-vitals**',
    '**/api/ab-events**',
    '**/api/funnel-track**',
    '**/_vercel/insights/**',
    '**/_vercel/speed-insights/**',
    '**/api/error-report**',
    '**/api/track**',
    '**/api/track/funnel**',
    '**/api/csp-report**',
  ]) await context.route(pattern, empty204)

  await context.route('**/api/promotions/active**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ promotion: null }),
  }))
  await context.route('**/api/referral/my-code**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'E3FREEZE', totalReferrals: 0, isActive: true }),
  }))

  await context.route('**/auth/v1/user', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.auth.user),
  }))
  await context.route('**/auth/v1/token**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...fixture.auth.session, user: fixture.auth.user }),
  }))
  await context.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/paid_reports')) {
      const wantsObject = String(route.request().headers().accept || '').includes('application/vnd.pgrst.object+json')
      const validToken = url.searchParams.get('access_token') === `eq.${fixture.report.access_token}`
      return route.fulfill({
        status: validToken ? 200 : (wantsObject ? 406 : 200),
        contentType: 'application/json',
        body: JSON.stringify(validToken ? (wantsObject ? fixture.report : [fixture.report]) : (wantsObject ? { code: 'PGRST116' } : [])),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await context.route('**/api/feedback?report_id=*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ feedback: null }),
  }))
  await context.route('**/api/family-members**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ members: [] }),
  }))
  await context.route('**/api/points/balance**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ balance: 0 }),
  }))
  await context.route('**/api/reports?email=*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reports: [fixture.report] }),
  }))
  await context.route('**/api/reports?session_id=e3-freeze-*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reports: [fixture.dashboard.completed] }),
  }))
  return fixtureHits
}

async function assertHydrated(page) {
  const menuButton = page.locator('button[aria-controls="mobile-menu"]').first()
  await poll('Navbar hydration sentinel', async () => await menuButton.count() === 1)
  await menuButton.evaluate((element) => element.click())
  await poll('Navbar open handler', async () => await menuButton.getAttribute('aria-expanded') === 'true')
  await menuButton.evaluate((element) => element.click())
  await poll('Navbar close handler', async () => await menuButton.getAttribute('aria-expanded') === 'false')
}

async function exerciseSurface(page, surface, baseUrl) {
  const routes = {
    home: '/',
    pricing: '/pricing',
    checkout: '/checkout?plan=E3',
    dashboard: '/dashboard?session_id=e3-freeze-completed',
    report: `/report/${fixture.report.access_token}`,
  }
  await page.goto(`${baseUrl}${routes[surface]}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  if (surface !== 'report') await assertHydrated(page)

  if (surface === 'home') {
    await poll('首頁 E3 卡', async () => await page.locator('article').filter({ hasText: '月度精選' }).first().isVisible())
  } else if (surface === 'pricing') {
    const cta = page.locator('#plan-e3').getByRole('button', { name: '開始月度密集補運', exact: true })
    await poll('定價頁 E3 CTA', async () => await cta.isVisible())
    await cta.click()
    const dialog = page.locator('[role="dialog"][aria-modal="true"]')
    await poll('E3 購買須知', async () => await dialog.isVisible())
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await poll('E3 購買須知關閉', async () => !await dialog.isVisible().catch(() => false))
  } else if (surface === 'checkout') {
    await poll('E3 checkout', async () => await page.locator('.checkout-main').isVisible())
  } else if (surface === 'dashboard') {
    await poll('E3 dashboard', async () => await page.locator('.dashboard-report').isVisible())
  } else if (surface === 'report') {
    await poll('E3 報告吉時區', async () => await page.locator('#pdf-or-calendar').isVisible())
    const calendarLinks = page.getByRole('link', { name: '加入 Google 行事曆', exact: true })
    await poll('E3 八個行事曆連結', async () => await calendarLinks.count() === 8)
    await poll('E3 報告 hydration', async () => await page.getByRole('heading', { name: '您的反饋對我們很重要', exact: true }).isVisible())
  }
}

async function main() {
  const buildIdPath = join(projectRoot, '.next', 'BUILD_ID')
  if (!existsSync(buildIdPath)) throw new Error('缺少 production build；請先執行 npm run build')
  const nextCli = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const logs = []
  const fixtureServer = await createE3FixtureServer({ fixture, port: 0 })
  const smokeEnvironment = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SITE_URL: baseUrl,
    NEXT_PUBLIC_API_URL: 'https://fortune-reports-api.fly.dev',
    E3_CSP_SMOKE_FIXTURE_ORIGIN: fixtureServer.origin,
    E3_CSP_SMOKE_PUBLIC_SUPABASE_ORIGIN: 'https://e3-freeze.supabase.co',
    NEXT_PUBLIC_SUPABASE_URL: 'https://e3-freeze.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e3-freeze-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'e3-freeze-service-key',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_e3_freeze_only',
    STRIPE_SECRET_KEY: 'sk_test_e3_freeze_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_e3_freeze_only',
    CLAUDE_API_KEY: 'sk-ant-e3-freeze-only',
    REPORT_COOKIE_SECRET: 'report-cookie-e3-freeze-1111111111111111111111111111111111111111',
    CALCULATOR_ATTESTATION_SECRET: 'calculator-attestation-e3-freeze-22222222222222222222222222222222',
    CONSULTATION_SESSION_SECRET: 'consultation-session-e3-freeze-3333333333333333333333333333333333',
    NODE_OPTIONS: `--require=${join(scriptDir, 'lib', 'e3-production-fetch-preload.cjs')}`,
  }
  try {
    await buildProductionBundle(nextCli, smokeEnvironment)
  } catch (error) {
    await fixtureServer.close()
    throw error
  }
  const child = spawn(process.execPath, [nextCli, 'start', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: projectRoot,
    env: smokeEnvironment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      logs.push(String(chunk))
      if (logs.length > 80) logs.shift()
    })
  }

  let browser
  try {
    const readinessResponse = await waitForServer(baseUrl, child)
    const cspHeaders = inspectProductionCspHeaders(readinessResponse.headers)
    if (!cspHeaders.ok) {
      throw new Error(`production CSP headers 無效：${cspHeaders.errors.join(', ')}`)
    }
    const chromium = await loadChromium()
    const executablePath = [
      process.env.CHROME_PATH,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find((path) => path && existsSync(path))
    browser = await chromium.launch({ headless: true, executablePath })
    const cases = []
    for (const viewport of [
      { name: 'mobile-dark', width: 390, height: 844, colorScheme: 'dark' },
      { name: 'desktop-light', width: 1440, height: 900, colorScheme: 'light' },
    ]) {
      for (const surface of ['home', 'pricing', 'checkout', 'dashboard', 'report']) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: viewport.colorScheme,
          locale: 'zh-TW',
          timezoneId: 'Asia/Hong_Kong',
          userAgent: USER_AGENT,
        })
        const fixtureHits = await prepareContext(context)
        const page = await context.newPage()
        const pageErrors = []
        const cspConsoleMessages = []
        const runtimeConsoleErrors = []
        const requestFailures = []
        const firstPartyHttpErrors = []
        page.on('pageerror', (error) => pageErrors.push(error instanceof Error ? error.message : String(error)))
        page.on('console', (message) => {
          if (message.type() !== 'error') return
          const value = message.text()
          // CSP console wording differs by Chromium version and does not expose
          // report-only versus enforced reliably. The standards-defined
          // SecurityPolicyViolationEvent.disposition below is authoritative.
          if (/content security policy|refused to/i.test(value)) cspConsoleMessages.push(value)
          else if (/hydration|uncaught|typeerror|referenceerror|valid digest|integrity|has been blocked/i.test(value)) runtimeConsoleErrors.push(value)
        })
        page.on('requestfailed', (request) => {
          if (!request.url().startsWith(baseUrl)) return
          requestFailures.push({
            method: request.method(),
            url: request.url(),
            errorText: request.failure()?.errorText || 'failed',
            resourceType: request.resourceType(),
            headers: request.headers(),
          })
        })
        page.on('response', (response) => {
          if (response.url().startsWith(baseUrl) && response.status() >= 400) {
            firstPartyHttpErrors.push(`${response.status()} ${response.url()}`)
          }
        })

        try {
          await exerciseSurface(page, surface, baseUrl)
          // Allow consent-safe telemetry and CSP reports triggered by the final
          // interaction to reach their deterministic local fixtures before the
          // fail-closed network snapshot is evaluated.
          await page.waitForTimeout(350)
          const cspViolations = await page.evaluate(() => window.__e3CspViolations || [])
          const partitionedCsp = partitionCspViolations(cspViolations)
          const reportOnlyCspViolations = partitionedCsp.reportOnly
          const enforcedCspViolations = partitionedCsp.enforced
          const unknownCspViolations = partitionedCsp.unknown
          const partitionedRequests = partitionFirstPartyRequestFailures(requestFailures, baseUrl, fixtureHits)
          const benignPrefetchAborts = partitionedRequests.benignPrefetchAborts
          const benignFixtureAborts = partitionedRequests.benignFixtureAborts
          const failures = {
            pageErrors,
            runtimeConsoleErrors,
            enforcedCspViolations,
            unknownCspViolations,
            requestFailures: partitionedRequests.fatal,
            firstPartyHttpErrors,
          }
          if (Object.values(failures).some((items) => items.length > 0)) {
            throw new Error(`production CSP/runtime failure：${viewport.name}/${surface}；${JSON.stringify({
              failures,
              diagnostics: { reportOnlyCspViolations, cspConsoleMessages, benignPrefetchAborts, benignFixtureAborts },
            })}`)
          }
          cases.push({
            id: `${surface}--${viewport.name}`,
            ok: true,
            reportOnlyCspViolationCount: reportOnlyCspViolations.length,
            cspConsoleMessageCount: cspConsoleMessages.length,
            benignPrefetchAbortCount: benignPrefetchAborts.length,
            benignFixtureAbortCount: benignFixtureAborts.length,
          })
          console.log(`[${cases.length}/10] PASS ${surface}--${viewport.name}`)
        } finally {
          await context.close()
        }
      }
    }
    const totalReportOnlyCspViolations = cases.reduce(
      (total, item) => total + item.reportOnlyCspViolationCount,
      0,
    )
    console.log(JSON.stringify({
      ok: true,
      mode: 'production-next-start-no-csp-bypass',
      strictPolicyPromotionReady: totalReportOnlyCspViolations === 0,
      totalReportOnlyCspViolations,
      cases,
      cspHeaders,
      fixtureServerRequests: fixtureServer.requests,
      buildId: readFileSync(buildIdPath, 'utf8').trim(),
      fixtureSha256: sha256File(fixturePath),
      browserVersion: await browser.version(),
    }))
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    console.error(`Fixture request tail:\n${JSON.stringify(fixtureServer.requests.slice(-30))}`)
    const tail = logs.join('').split(/\r?\n/).filter(Boolean).slice(-25)
    if (tail.length > 0) console.error(`Next log tail:\n${tail.join('\n')}`)
    process.exitCode = 1
  } finally {
    await browser?.close()
    await stopChild(child)
    await fixtureServer.close()
  }
}

await main()
