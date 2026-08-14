import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import test, { after, before } from 'node:test'

import {
  armE3NavigationGuard,
  classifyE3NavigationRequest,
  normalizeE3NavigationDestination,
  observeE3NavigationOutcome,
} from '../scripts/lib/e3-navigation-probe.mjs'

let browser
let fixtureServer
let fixtureOrigin
let canaryServer
let canaryOrigin
let canaryRequests = 0
let destinationRequests = 0
let protectedRequests = 0
let writeRequests = 0
let downloadRequests = 0
let fixtureRouteHits = 0
let nonOwnedRouteHits = 0

function loadChromium() {
  for (const moduleRoot of [
    new URL('../node_modules/__e3-navigation-probe__.cjs', import.meta.url),
    new URL('file:///D:/npm-global/node_modules/__e3-navigation-probe__.cjs'),
  ]) {
    try {
      return createRequire(moduleRoot)('playwright').chromium
    } catch {}
  }
  throw new Error('找不到 Playwright；E3 navigation probe 測試不可降級')
}

function resolveBrowserExecutable() {
  const executable = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => candidate && existsSync(candidate))
  if (!executable) throw new Error('找不到 Chrome/Edge；E3 navigation probe 測試不可降級')
  return executable
}

function fixtureHtml(body) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>E3 fixture</title></head><body><main>${body}</main></body></html>`
}

function routePath(requestUrl) {
  return new URL(requestUrl, 'http://fixture.invalid').pathname
}

before(async () => {
  canaryServer = createServer((request, response) => {
    canaryRequests += 1
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(fixtureHtml(`<h1>canary ${request.url}</h1>`))
  })
  await new Promise((resolve, reject) => {
    canaryServer.once('error', reject)
    canaryServer.listen(0, '127.0.0.1', resolve)
  })
  const canaryAddress = canaryServer.address()
  if (!canaryAddress || typeof canaryAddress === 'string') throw new Error('無法取得 canary port')
  canaryOrigin = `http://127.0.0.1:${canaryAddress.port}`

  fixtureServer = createServer((request, response) => {
    const pathname = routePath(request.url || '/')
    if (request.method === 'POST') {
      writeRequests += 1
      response.statusCode = 204
      response.end()
      return
    }
    if (pathname === '/drop') {
      request.socket.destroy()
      return
    }
    if (pathname === '/destination' || pathname === '/after-guard') destinationRequests += 1
    if (pathname === '/checkout/start' || pathname === '/checkout/popup') protectedRequests += 1
    if (pathname === '/download.bin') downloadRequests += 1

    response.setHeader('content-type', 'text/html; charset=utf-8')
    const deeplyEncodedCheckout = `%${'25'.repeat(17)}63heckout/start`
    const fixtures = {
      '/safe-top': '<a id="target" href="/destination?token=top-secret">安全站內導覽</a>',
      '/popup-safe': '<a id="target" href="/destination" target="_blank" rel="noopener">安全新分頁</a>',
      '/popup-uppercase': '<a id="target" href="/destination" target="_BLANK" rel="noopener">大小寫新分頁</a>',
      '/popup-protected': '<a id="target" href="/%63heckout/popup?token=popup-secret" target="_blank" rel="noopener">受保護新分頁</a>',
      '/popup-external': `<a id="target" href="${canaryOrigin}/pay?email=jamie%40example.com" target="_blank" rel="noopener">外部新分頁</a>`,
      '/protected-encoded': '<a id="target" href="/%2563heckout/start?email=jamie%40example.com&token=secret-token">編碼結帳</a>',
      '/protected-overencoded': `<a id="target" href="/${deeplyEncodedCheckout}?token=secret-token">過度編碼結帳</a>`,
      '/post': '<button id="target" onclick="fetch(\'/api/write\', { method: \'POST\', body: \'secret-body\' }).catch(() => {})">送出</button>',
      '/external': `<a id="target" href="${canaryOrigin}/pay?token=external-secret">外部導覽</a>`,
      '/window-open-external': `<button id="target" onclick="window.open('${canaryOrigin}/pay?token=window-open-secret')">程式開窗</button>`,
      '/javascript': '<a id="target" href="javascript:fetch(\'/api/write\',{method:\'POST\'})">危險協定</a>',
      '/mailto': '<a id="target" href="mailto:private@example.com?subject=secret" onclick="history.pushState({}, \'\', \'/mailto-handler-effect\')">寄信</a>',
      '/tel': '<a id="target" href="tel:+85291234567">打電話</a>',
      '/download': '<a id="target" href="/download.bin?token=download-secret" download="private.bin">下載</a>',
      '/history': '<a id="target" href="/next?token=history-secret" onclick="event.preventDefault(); history.pushState({}, \'\', this.href)">SPA</a>',
      '/hash': '<a id="target" href="#private-fragment">Hash</a><section id="private-fragment">內容</section>',
      '/inert': '<a id="target" href="/never" onclick="event.preventDefault()">無效導覽</a>',
      '/fixture-fallback': '<button id="target" onclick="fetch(\'/fixture-data?token=fixture-secret\').catch(() => {})">讀 fixture</button>',
      '/failed-load': '<button id="target" onclick="fetch(\'/drop\').catch(() => {})">失敗讀取</button>',
      '/document-navigation': '<button id="target" onclick="location.href=\'about:blank\'">空白文件</button>',
      '/timeout': '<button id="target" disabled>不可點</button>',
      '/after-dispose': '<a id="target" href="/after-guard">解除後導覽</a>',
    }
    response.end(fixtureHtml(fixtures[pathname] || '<h1>目的頁</h1>'))
  })
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject)
    fixtureServer.listen(0, '127.0.0.1', resolve)
  })
  const fixtureAddress = fixtureServer.address()
  if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('無法取得 fixture port')
  fixtureOrigin = `http://127.0.0.1:${fixtureAddress.port}`

  browser = await loadChromium().launch({
    headless: true,
    executablePath: resolveBrowserExecutable(),
  })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => fixtureServer?.close(resolve))
  await new Promise((resolve) => canaryServer?.close(resolve))
})

async function observeFixture(pathname, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(`${fixtureOrigin}${pathname}`, { waitUntil: 'domcontentloaded' })
  if (options.beforeGuard) await options.beforeGuard({ context, page })
  const guard = await armE3NavigationGuard({
    context,
    page,
    allowedOrigins: options.allowedOrigins || [fixtureOrigin],
  })
  try {
    return await observeE3NavigationOutcome({
      page,
      guard,
      selector: '#target',
      timeoutMs: options.timeoutMs || 250,
    })
  } finally {
    await guard.dispose()
    await context.close()
  }
}

test('URL receipt 僅保留 origin/path/query keys，排除 query values 與 fragment', () => {
  const receipt = normalizeE3NavigationDestination(
    'http://127.0.0.1:3010/%63heckout/start?token=secret-token&email=jamie%40example.com#private-fragment',
  )
  assert.deepEqual(receipt, {
    origin: 'http://127.0.0.1:3010',
    pathname: '/checkout/start',
    url: 'http://127.0.0.1:3010/checkout/start',
    queryKeys: ['email', 'token'],
  })
  const serialized = JSON.stringify(receipt)
  for (const secret of ['secret-token', 'jamie@example.com', 'private-fragment']) {
    assert.equal(serialized.includes(secret), false)
  }
})

test('request classifier fail closed：double-encoded protected path、POST、external、top navigation', () => {
  const allowedOrigins = ['http://127.0.0.1:3010']
  for (const [input, reason] of [
    [{ url: 'http://127.0.0.1:3010/%2563heckout/start' }, 'protected-path'],
    [{ url: 'http://127.0.0.1:3010/api/write', method: 'POST' }, 'non-get'],
    [{ url: 'https://outside.example.invalid/pay' }, 'external-origin'],
    [{ url: 'http://127.0.0.1:3010/pricing', topNavigation: true }, 'top-navigation'],
  ]) {
    const result = classifyE3NavigationRequest({ ...input, allowedOrigins })
    assert.equal(result.blocked, true)
    assert.equal(result.reason, reason)
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(classifyE3NavigationRequest({
      url: 'http://127.0.0.1:3010/api/read',
      method,
      allowedOrigins,
    }).blocked, false)
  }

  const overencoded = `%${'25'.repeat(17)}63heckout/start`
  const excessive = classifyE3NavigationRequest({
    url: `http://127.0.0.1:3010/${overencoded}`,
    allowedOrigins,
  })
  assert.equal(excessive.blocked, true)
  assert.equal(excessive.reason, 'invalid-path-encoding')
  assert.equal(excessive.destination.pathname, '/[excessive-path-encoding]')
})

test('既有 context/page 由呼叫端持有；observer 不建立或關閉 context', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${fixtureOrigin}/history`)
  const contextCount = browser.contexts().length
  const guard = await armE3NavigationGuard({ context, page, allowedOrigins: [fixtureOrigin] })
  const result = await observeE3NavigationOutcome({ page, guard, selector: '#target', timeoutMs: 250 })
  assert.equal(result.schema, 'e3-navigation-probe/v2')
  assert.equal(result.outcome.kind, 'history')
  assert.equal(browser.contexts().length, contextCount)
  assert.equal(page.isClosed(), false)
  await guard.dispose()
  assert.equal(page.isClosed(), false)
  await context.close()
})

test('synchronous history is observed even when the outcome budget excludes action readiness', async () => {
  const result = await observeFixture('/history', { timeoutMs: 1 })
  assert.equal(result.outcome.kind, 'history')
  assert.equal(result.outcome.historyEvents[0].type, 'pushState')
})

test('同源 top navigation 也在 real click window 阻擋，不抵達目的 server', async () => {
  const before = destinationRequests
  const result = await observeFixture('/safe-top')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted[0].reason, 'top-navigation')
  assert.equal(result.guard.intercepted[0].topNavigation, true)
  assert.equal(destinationRequests, before)
})

test('percent-encoded checkout top navigation 在網路前阻擋，receipt 不含 PII 值', async () => {
  const before = protectedRequests
  const result = await observeFixture('/protected-encoded')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted[0].reason, 'protected-path')
  assert.equal(result.guard.intercepted[0].destination.pathname, '/checkout/start')
  assert.equal(protectedRequests, before)
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('jamie@example.com'), false)
  assert.equal(serialized.includes('secret-token'), false)
})

test('target=_blank protected race 由 intent seed 攔住初始 top request', async () => {
  const before = protectedRequests
  const result = await observeFixture('/popup-protected')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted.some((item) => item.topNavigation && item.reason === 'protected-path'), true)
  assert.equal(protectedRequests, before)
})

test('reserved target 名稱不分大小寫，_BLANK 仍由 popup seed 攔截', async () => {
  const before = destinationRequests
  const result = await observeFixture('/popup-uppercase')
  assert.equal(result.intent.target, '_blank')
  assert.equal(result.outcome.kind, 'new-window')
  assert.equal(result.guard.intercepted[0].reason, 'top-navigation')
  assert.equal(destinationRequests, before)
})

test('超過解碼上限的目的地 fail closed，且不抵達 protected server', async () => {
  const before = protectedRequests
  const result = await observeFixture('/protected-overencoded')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted[0].reason, 'invalid-path-encoding')
  assert.equal(result.guard.intercepted[0].destination.pathname, '/[excessive-path-encoding]')
  assert.equal(protectedRequests, before)
  assert.equal(JSON.stringify(result).includes('secret-token'), false)
})

test('Playwright popup race：route 早於 page event，且初始 navigation 尚無 top frame', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${fixtureOrigin}/popup-safe`)
  let popupPageEventSeen = false
  let observation = null
  context.on('page', (openedPage) => {
    if (openedPage !== page) popupPageEventSeen = true
  })
  await context.route('**/*', async (route) => {
    const request = route.request()
    let requestPageIsSource = false
    let topNavigation = false
    try {
      requestPageIsSource = request.frame().page() === page
      topNavigation = request.frame().parentFrame() === null
    } catch {}
    observation = {
      popupPageEventSeen,
      requestPageIsSource,
      topNavigation,
      navigationRequest: request.isNavigationRequest(),
    }
    await route.abort('blockedbyclient')
  })
  await page.locator('#target').click({ noWaitAfter: true })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await context.close()
  assert.deepEqual(observation, {
    popupPageEventSeen: false,
    requestPageIsSource: false,
    topNavigation: false,
    navigationRequest: true,
  })
})

test('target=_blank external race 不抵達 canary origin', async () => {
  const before = canaryRequests
  const result = await observeFixture('/popup-external')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted.some((item) => item.topNavigation && item.reason === 'external-origin'), true)
  assert.equal(canaryRequests, before)
  assert.equal(JSON.stringify(result).includes('jamie@example.com'), false)
})

test('安全 target=_blank 可辨識 new-window，同時不真的載入目的頁', async () => {
  const before = destinationRequests
  const result = await observeFixture('/popup-safe')
  assert.equal(result.outcome.kind, 'new-window')
  assert.equal(result.guard.intercepted[0].reason, 'top-navigation')
  assert.equal(destinationRequests, before)
})

test('real click 觸發 POST 時 guard 攔截，server 零寫入', async () => {
  const before = writeRequests
  const result = await observeFixture('/post')
  assert.equal(result.outcome.kind, 'guarded-request')
  assert.equal(result.guard.intercepted[0].method, 'POST')
  assert.equal(result.guard.intercepted[0].reason, 'non-get')
  assert.equal(writeRequests, before)
})

test('same-page external navigation 在送出網路前攔截', async () => {
  const before = canaryRequests
  const result = await observeFixture('/external')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.guard.intercepted[0].reason, 'external-origin')
  assert.equal(canaryRequests, before)
})

test('onclick window.open 即使沒有 anchor target 也在 browser API 邊界攔截', async () => {
  const before = canaryRequests
  const result = await observeFixture('/window-open-external')
  assert.equal(result.activation, 'real-click')
  assert.equal(result.outcome.kind, 'guarded-navigation')
  assert.equal(result.outcome.windowOpenObserved, true)
  assert.equal(result.guard.intercepted[0].trigger, 'window.open')
  assert.equal(result.guard.intercepted[0].reason, 'external-origin')
  assert.equal(canaryRequests, before)
  assert.equal(JSON.stringify(result).includes('window-open-secret'), false)
})

test('javascript 等非 HTTP handler scheme 真 click 但阻止 default side effect', async () => {
  const before = writeRequests
  const result = await observeFixture('/javascript')
  assert.equal(result.activation, 'real-click')
  assert.equal(result.outcome.kind, 'unsupported-scheme')
  assert.equal(result.guard.intercepted.length, 0)
  assert.equal(writeRequests, before)
})

test('mailto/tel 皆執行真 click 但不喚起外部 handler', async () => {
  for (const path of ['/mailto', '/tel']) {
    const result = await observeFixture(path)
    assert.equal(result.activation, 'real-click')
    assert.equal(result.outcome.kind, 'external-scheme')
    assert.equal(result.guard.intercepted.length, 0)
    if (path === '/mailto') {
      assert.equal(result.outcome.historyEvents.some((event) => event.type === 'pushState'), true)
      assert.equal(result.outcome.historyEvents.at(-1).destination.pathname, '/mailto-handler-effect')
      assert.equal(result.outcome.destination.pathname, '/mailto-handler-effect')
    } else {
      assert.equal(result.outcome.destination, null)
    }
  }
})

test('download anchor 執行真 click 但不產生下載 request', async () => {
  const before = downloadRequests
  const result = await observeFixture('/download')
  assert.equal(result.outcome.kind, 'download')
  assert.equal(result.intent.download, true)
  assert.equal(downloadRequests, before)
})

test('history、hash、inert 都是可比較 outcome，inert 不丟例外', async () => {
  const historyResult = await observeFixture('/history')
  assert.equal(historyResult.outcome.kind, 'history')
  assert.equal(historyResult.outcome.historyEvents[0].type, 'pushState')
  assert.equal(JSON.stringify(historyResult).includes('history-secret'), false)

  const hashResult = await observeFixture('/hash')
  assert.equal(hashResult.outcome.kind, 'hash')
  assert.equal(JSON.stringify(hashResult).includes('private-fragment'), false)

  const inertResult = await observeFixture('/inert', { timeoutMs: 120 })
  assert.equal(inertResult.outcome.kind, 'inert')
})

test('允許的 GET resource 以 route.fallback 委派既有 fixture route', async () => {
  const before = fixtureRouteHits
  const result = await observeFixture('/fixture-fallback', {
    timeoutMs: 120,
    beforeGuard: async ({ context }) => {
      await context.route(`${fixtureOrigin}/fixture-data*`, async (route) => {
        fixtureRouteHits += 1
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      })
    },
  })
  assert.equal(result.outcome.kind, 'inert')
  assert.equal(fixtureRouteHits, before + 1)
  assert.equal(result.guard.intercepted.length, 0)
})

test('同一 context 的既有非 owned page 不受 armed guard 影響', async () => {
  const context = await browser.newContext()
  const auditPage = await context.newPage()
  await auditPage.setContent('<main>既有 audit page</main>')
  const probePage = await context.newPage()
  await probePage.goto(`${fixtureOrigin}/inert`)
  await context.route(`${fixtureOrigin}/non-owned-fixture*`, async (route) => {
    nonOwnedRouteHits += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"owned":false}' })
  })
  const guard = await armE3NavigationGuard({
    context,
    page: probePage,
    allowedOrigins: [fixtureOrigin],
  })
  const before = nonOwnedRouteHits
  const observation = observeE3NavigationOutcome({
    page: probePage,
    guard,
    selector: '#target',
    timeoutMs: 180,
  })
  await new Promise((resolve) => setTimeout(resolve, 40))
  const responseStatus = await auditPage.evaluate(async (url) => (await fetch(url)).status, `${fixtureOrigin}/non-owned-fixture`)
  const result = await observation
  assert.equal(responseStatus, 200)
  assert.equal(nonOwnedRouteHits, before + 1)
  assert.equal(result.outcome.kind, 'inert')
  await guard.dispose()
  await context.close()
})

test('observer 能辨識 document-navigation、failed-load 與 click timeout', async () => {
  const documentResult = await observeFixture('/document-navigation')
  assert.equal(documentResult.outcome.kind, 'document-navigation')

  const failedResult = await observeFixture('/failed-load')
  assert.equal(failedResult.outcome.kind, 'failed-load')
  assert.equal(failedResult.outcome.failedLoads.length > 0, true)

  const timeoutResult = await observeFixture('/timeout', { timeoutMs: 120 })
  assert.equal(timeoutResult.outcome.kind, 'timeout')
})

test('source 非 loopback 且未在 allowlist 時 fail closed', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.setContent('<button id="target">test</button>')
  await assert.rejects(
    armE3NavigationGuard({ context, page, allowedOrigins: [] }),
    (error) => error?.code === 'E3_NAVIGATION_SOURCE_NOT_ALLOWED',
  )
  await context.close()
})

test('dispose 以 exact handler unroute；解除後同一 page 可正常導覽且無殘留', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${fixtureOrigin}/after-dispose`)
  const guard = await armE3NavigationGuard({ context, page, allowedOrigins: [fixtureOrigin] })
  await guard.dispose()
  await guard.dispose()

  const before = destinationRequests
  await Promise.all([
    page.waitForURL(`${fixtureOrigin}/after-guard`),
    page.locator('#target').click(),
  ])
  assert.equal(destinationRequests, before + 1)
  assert.equal(page.url(), `${fixtureOrigin}/after-guard`)
  await context.close()
})

test('navigation target discovery 包含 scope root 本身是 anchor 的案例', () => {
  const auditSource = readFileSync(
    new URL('../scripts/e3-freeze-audit.mjs', import.meta.url),
    'utf8',
  )
  assert.match(auditSource, /root\.matches\?\.\('a\[href\]'\)\s*\?\s*\[root\]/u)
})
