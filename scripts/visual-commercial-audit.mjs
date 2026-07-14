/**
 * 零額外 dependency 的 Chrome DevTools Protocol 視覺基線工具。
 *
 * 用法：
 *   node scripts/visual-commercial-audit.mjs http://127.0.0.1:3010 ./artifacts/ui
 *
 * 產物：首頁 desktop/mobile × light/dark 截圖，以及 reflow/heading/target metrics JSON。
 * 截圖使用真實 device metrics，不受 headless Chrome 最小視窗寬度影響。
 * Telemetry writes 預設攔截；私人報告預設不落 screenshot／heading text，URL token 一律遮罩。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const baseUrl = process.argv[2] || 'http://127.0.0.1:3010'
const outputDir = resolve(process.argv[3] || join(tmpdir(), 'jianyuan-commercial-audit', 'cdp'))
const requestedRoutes = (process.env.AUDIT_ROUTES || '')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean)
const clearCookieConsent = process.env.AUDIT_CLEAR_COOKIE === '1'
const seedCookieConsent = process.env.AUDIT_SEED_COOKIE === '1'
const blockTelemetryWrites = process.env.AUDIT_BLOCK_WRITES !== '0'
const capturePrivateArtifacts = process.env.AUDIT_CAPTURE_PRIVATE === '1'
const settleMs = Number(process.env.AUDIT_SETTLE_MS || 800)
const auditIpOffset = Number(process.env.AUDIT_IP_OFFSET || 0)
const isolateAuditIp = process.env.AUDIT_ISOLATE_IP !== '0'
mkdirSync(outputDir, { recursive: true })

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate))
if (!chromePath) throw new Error('找不到 Chrome/Edge；可設定 CHROME_PATH。')

const profileDir = mkdtempSync(join(tmpdir(), 'jy-cdp-'))
const port = Number(process.env.AUDIT_CDP_PORT || (9300 + Math.floor(Math.random() * 500)))
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

const wait = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

async function fetchJson(url, attempts = 60) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await globalThis.fetch(url)
      if (response.ok) return await response.json()
    } catch (error) {
      lastError = error
    }
    await wait(100)
  }
  throw lastError || new Error(`無法連線 ${url}`)
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let nextId = 1
  const pending = new Map()
  const eventWaiters = new Map()
  const diagnostics = []

  const opened = new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', rejectOpen, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`))
      else waiter.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Network.loadingFailed' || message.method === 'Log.entryAdded' || message.method === 'Runtime.consoleAPICalled') {
      diagnostics.push({ method: message.method, params: message.params })
    }
    if (message.method === 'Network.responseReceived' && message.params?.response?.status >= 400) {
      diagnostics.push({ method: message.method, params: { status: message.params.response.status, url: message.params.response.url, mimeType: message.params.response.mimeType } })
    }
    const waiters = eventWaiters.get(message.method)
    if (!waiters?.length) return
    const waiter = waiters.shift()
    waiter.resolve(message.params)
  })

  const rejectPending = (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
  socket.addEventListener('close', () => rejectPending(new Error('Chrome DevTools 連線已關閉')))
  socket.addEventListener('error', () => rejectPending(new Error('Chrome DevTools 連線錯誤')))

  async function send(method, params = {}) {
    await opened
    const id = nextId++
    return new Promise((resolveSend, rejectSend) => {
      pending.set(id, { resolve: resolveSend, reject: rejectSend, method })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  function once(method, timeoutMs = 15_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const waiters = eventWaiters.get(method) || []
      const entry = { resolve: resolveEvent, reject: rejectEvent }
      waiters.push(entry)
      eventWaiters.set(method, waiters)
      setTimeout(() => {
        const active = eventWaiters.get(method) || []
        const index = active.indexOf(entry)
        if (index >= 0) active.splice(index, 1)
        rejectEvent(new Error(`等待 ${method} 超時`))
      }, timeoutMs).unref()
    })
  }

  return { send, once, diagnostics, close: () => socket.close() }
}

async function evaluateWhenStable(cdp, params, label, attempts = 40) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await cdp.send('Runtime.evaluate', params)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (!/navigated|execution context|context with specified id|target closed/i.test(message)) throw error
      await wait(100)
    }
  }
  throw new Error(`${label} 在換頁後仍不穩定：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

const routeUrls = requestedRoutes.length > 0
  ? requestedRoutes.map((route) => new URL(route, baseUrl).toString())
  : [baseUrl]

const viewportCases = [
  { name: 'desktop-dark', width: 1440, height: 900, theme: 'dark' },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
  { name: 'desktop-light', width: 1440, height: 900, theme: 'light' },
  { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
]

function routeSlug(url) {
  const parsed = new URL(redactSensitiveText(url))
  const source = `${parsed.pathname === '/' ? '/home' : parsed.pathname}${parsed.search}`
  return source.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'
}

function isPrivateReportUrl(url) {
  try {
    return /^\/report\/[^/]+\/?$/.test(new URL(url).pathname)
  } catch {
    return false
  }
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/(\/report\/)[^/?#\s"']+/gi, '$1[redacted]')
    .replace(/(\/r\/[^/?#\s"']+\/)[^/?#\s"']+/gi, '$1[redacted]')
    .replace(/([?&](?:token|access_token|report_token|email)=)[^&#\s"']+/gi, '$1[redacted]')
}

function redactSensitiveData(value) {
  if (typeof value === 'string') return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactSensitiveData)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSensitiveData(item)]))
  }
  return value
}

const cases = routeUrls.flatMap((url) => viewportCases.map((viewport) => ({
  ...viewport,
  url,
  name: `${routeSlug(url)}-${viewport.name}`,
})))

const metrics = []

try {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
  const pageTarget = targets.find((target) => target.type === 'page')
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('找不到 Chrome page target')
  const cdp = createCdpClient(pageTarget.webSocketDebuggerUrl)

  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Network.enable'),
    cdp.send('Log.enable'),
  ])

  await cdp.send('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })

  if (blockTelemetryWrites) {
    await cdp.send('Network.setBlockedURLs', {
      urls: [
        '*/api/report-view*',
        '*/api/csp-report*',
        '*/api/web-vitals*',
        '*/api/ab-events*',
        '*/api/track*',
        '*/api/funnel-track*',
        '*/_vercel/insights/*',
        '*/_vercel/speed-insights/*',
        '*google-analytics.com/*',
        '*googletagmanager.com/*',
        '*clarity.ms/*',
      ],
    })
  }

  if (clearCookieConsent) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.removeItem('jy_cookie_consent_v1'); } catch {}`,
    })
  } else if (seedCookieConsent) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('jy_cookie_consent_v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, decided_at: '2026-01-01T00:00:00.000Z' })); } catch {}`,
    })
  }

  for (const [caseIndex, auditCase] of cases.entries()) {
    const mobile = auditCase.width <= 480
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: auditCase.width,
      height: auditCase.height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: auditCase.width,
      screenHeight: auditCase.height,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: false,
    })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
    await cdp.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'prefers-color-scheme', value: auditCase.theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    })

    // A complete local page load can request dozens of Next.js assets. Give
    // every audit case a reserved benchmark IP so the visual harness measures
    // UI rather than exhausting the in-memory global abuse limiter. Vercel
    // overwrites this trusted header in production.
    const auditIpIndex = auditIpOffset + caseIndex
    const auditIp = `198.18.${Math.floor(auditIpIndex / 250)}.${(auditIpIndex % 250) + 1}`
    await cdp.send('Network.setExtraHTTPHeaders', {
      headers: isolateAuditIp ? { 'x-vercel-forwarded-for': auditIp } : {},
    })

    const loadEvent = cdp.once('Page.loadEventFired', 30_000).catch(() => null)
    const navigation = await cdp.send('Page.navigate', { url: auditCase.url })
    if (navigation.errorText) throw new Error(`無法載入 ${auditCase.url}：${navigation.errorText}`)
    await loadEvent
    // Client-side auth redirects can occur immediately after the load event.
    // Require the URL and readyState to remain stable across three polls.
    let ready = false
    let stableUrl = ''
    let stablePolls = 0
    for (let attempt = 0; attempt < 300; attempt += 1) {
      try {
        const state = await evaluateWhenStable(cdp, {
          returnByValue: true,
          expression: `({ state: document.readyState, url: location.href, hasBody: Boolean(document.body) })`,
        }, 'readyState', 4)
        const snapshot = state.result.value
        if ((snapshot?.state === 'interactive' || snapshot?.state === 'complete') && snapshot?.hasBody) {
          stablePolls = snapshot.url === stableUrl ? stablePolls + 1 : 1
          stableUrl = snapshot.url
        } else {
          stablePolls = 0
        }
        if (stablePolls >= 3) {
          ready = true
          break
        }
      } catch {
        // Execution context is briefly unavailable while the document swaps.
      }
      await wait(100)
    }
    if (!ready) throw new Error(`頁面 30 秒內未進入 interactive：${auditCase.url}`)
    await evaluateWhenStable(cdp, {
      expression: `localStorage.setItem('theme', ${JSON.stringify(auditCase.theme)}); document.documentElement.setAttribute('data-theme', ${JSON.stringify(auditCase.theme)});`,
    }, 'theme')
    await evaluateWhenStable(cdp, {
      awaitPromise: true,
      expression: `document.fonts?.ready || Promise.resolve()`,
    }, 'fonts')
    await wait(settleMs)
    const evaluated = await evaluateWhenStable(cdp, {
      returnByValue: true,
      expression: `(() => {
        const root = document.documentElement;
        const body = document.body;
        const headings = [...document.querySelectorAll('h1,h2,h3')];
        const targets = [...document.querySelectorAll('a,button,input,select,textarea,summary,[role="button"]')];
        const visible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const tooSmall = targets.map((element) => {
          const rect = element.getBoundingClientRect();
          const parentText = element.parentElement?.textContent?.trim() || '';
          const ownText = element.textContent?.trim() || '';
          const inlineTextException = element.tagName === 'A'
            && getComputedStyle(element).display === 'inline'
            && (Boolean(element.closest('p,li')) || parentText.length > ownText.length);
          return { tag: element.tagName, text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 60), width: Math.round(rect.width), height: Math.round(rect.height), inlineTextException };
        }).filter((target) => !target.inlineTextException && target.width > 0 && target.height > 0 && (target.width < 24 || target.height < 24));
        const unlabeledControls = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
          .filter(visible)
          .filter((element) => !element.labels?.length && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby'))
          .map((element) => ({ tag: element.tagName, type: element.getAttribute('type'), name: element.getAttribute('name'), placeholder: element.getAttribute('placeholder') }));
        const emptyButtons = [...document.querySelectorAll('button,[role="button"]')]
          .filter(visible)
          .filter((element) => !element.textContent?.trim() && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby'))
          .map((element) => element.outerHTML.slice(0, 160));
        const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const brokenImages = [...document.images]
          .filter(visible)
          .filter((element) => element.complete && element.naturalWidth === 0)
          .map((element) => ({ src: element.currentSrc || element.src, alt: element.alt }));
        return {
          requestedUrl: ${JSON.stringify(auditCase.url)},
          finalUrl: location.href,
          documentTitle: document.title,
          htmlLang: root.lang,
          viewport: { width: innerWidth, height: innerHeight },
          theme: root.getAttribute('data-theme'),
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          clientWidth: root.clientWidth,
          bodyOverflowX: Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth,
          mainCount: document.querySelectorAll('main').length,
          h1Count: document.querySelectorAll('h1').length,
          headings: headings.slice(0, 24).map((heading) => ({ level: heading.tagName, text: heading.textContent.trim().slice(0, 90) })),
          visibleTargetCount: targets.filter((element) => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
          targetsBelowWcagMinimum: tooSmall,
          unlabeledControls,
          emptyButtons,
          duplicateIds,
          brokenImages,
          cookieDialog: (() => {
            const dialog = document.querySelector('[aria-labelledby="cookie-consent-title"]');
            if (!dialog) return null;
            const r = dialog.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), position: getComputedStyle(dialog).position };
          })(),
          storedCookieConsent: localStorage.getItem('jy_cookie_consent_v1'),
          reactAttached: [...document.querySelectorAll('button')].some((element) => Object.keys(element).some((key) => key.startsWith('__reactProps'))),
          scriptSourceCount: document.querySelectorAll('script[src]').length,
          activeElement: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 50) || document.activeElement?.tagName,
        };
      })()`,
    }, 'metrics')

    const privateReport = isPrivateReportUrl(auditCase.url)
    let screenshotName = null
    if (!privateReport || capturePrivateArtifacts) {
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      })
      const screenshotPath = join(outputDir, `${auditCase.name}.png`)
      writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
      screenshotName = basename(screenshotPath)
    }
    const safeEvaluation = redactSensitiveData(evaluated.result.value)
    if (privateReport && !capturePrivateArtifacts) {
      safeEvaluation.documentTitle = '[private report]'
      safeEvaluation.headings = safeEvaluation.headings.map(({ level }) => ({ level, text: '[private report heading]' }))
      safeEvaluation.activeElement = safeEvaluation.activeElement ? '[private report control]' : safeEvaluation.activeElement
    }
    metrics.push({ case: auditCase.name, screenshot: screenshotName, ...safeEvaluation })
  }

  cdp.close()
  writeFileSync(join(outputDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
  const relevantDiagnostics = redactSensitiveData(cdp.diagnostics.filter((entry) => {
    if (entry.method === 'Network.loadingFailed' && entry.params?.blockedReason === 'inspector') return false
    if (entry.method === 'Log.entryAdded') return entry.params?.entry?.level === 'error'
    if (entry.method === 'Runtime.consoleAPICalled') {
      return entry.params?.type === 'error' || entry.params?.type === 'warning'
    }
    return true
  }))
  const failures = metrics.filter((result) => (
    result.bodyOverflowX
    || result.h1Count !== 1
    || result.mainCount !== 1
    || result.targetsBelowWcagMinimum.length > 0
    || result.unlabeledControls.length > 0
    || result.emptyButtons.length > 0
    || result.duplicateIds.length > 0
    || result.brokenImages.length > 0
  ))
  writeFileSync(join(outputDir, 'diagnostics.json'), `${JSON.stringify(relevantDiagnostics, null, 2)}\n`)
  writeFileSync(join(outputDir, 'failures.json'), `${JSON.stringify(failures, null, 2)}\n`)
  console.log(JSON.stringify({ outputDir, metrics, diagnostics: relevantDiagnostics.slice(0, 30), failures }, null, 2))
  if (failures.length > 0) {
    throw new Error(`視覺稽核失敗：${failures.length}/${metrics.length} 個案例未達門檻；詳見 ${join(outputDir, 'failures.json')}`)
  }
} finally {
  chrome.kill()
  if (chrome.exitCode === null) {
    await Promise.race([
      new Promise((resolveExit) => chrome.once('exit', resolveExit)),
      wait(2_000),
    ])
  }
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (error) {
    console.warn(`暫存 Chrome profile 稍後由系統清理：${error.message}`)
  }
}
