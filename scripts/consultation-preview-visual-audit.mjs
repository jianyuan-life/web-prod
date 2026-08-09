/**
 * C / G15 public-preview UI acceptance harness, using only Node.js and Chrome CDP.
 *
 * Usage:
 *   node scripts/consultation-preview-visual-audit.mjs <preview-origin> <output-dir>
 *   node scripts/consultation-preview-visual-audit.mjs --plan
 *
 * The audited routes are intentionally fixed to public, tokenless surfaces:
 *   /, /pricing, /life-blueprint, /family-blueprint
 *
 * The standard matrix covers 5 CSS viewports x 2 themes x 2 motion modes.
 * A separate 400% reflow matrix uses a 320 CSS-pixel layout viewport at DPR 4,
 * which represents a 1280 physical-pixel viewport viewed at 400%. This is a
 * reflow test, not pinch zoom: pageScaleFactor remains 1.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const PUBLIC_ROUTES = ['/', '/pricing', '/life-blueprint', '/family-blueprint']
const THEMES = ['light', 'dark']
const MOTION_PREFERENCES = ['no-preference', 'reduce']
const STANDARD_VIEWPORTS = [
  { name: 'phone-compact', width: 320, height: 800 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
]
const ZOOM_400_VIEWPORT = {
  name: 'zoom-400',
  width: 320,
  height: 225,
  deviceScaleFactor: 4,
  referencePhysicalWidth: 1280,
  referencePhysicalHeight: 900,
}
const TELEMETRY_BLOCKLIST = [
  '*/api/report-view*',
  '*/api/error-report*',
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
]
const VERCEL_PREVIEW_TOOLBAR_URL = 'https://vercel.live/_next-live/feedback/feedback.js'

const cliArgs = process.argv.slice(2)
const planOnly = cliArgs.includes('--plan')
const contractSelfTest = cliArgs.includes('--contract-self-test')
const identityOnly = cliArgs.includes('--identity-only')
const showHelp = cliArgs.includes('--help') || cliArgs.includes('-h')

function parseCliArguments(args) {
  const positional = []
  const options = {}
  const valueOptions = new Set(['--expected-git-sha', '--expected-deployment-id'])
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (valueOptions.has(argument)) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
      options[argument.slice(2)] = value
      index += 1
    } else if (!argument.startsWith('--')) {
      positional.push(argument)
    }
  }
  return { positional, options }
}

const parsedCli = parseCliArguments(cliArgs)
const positionalArgs = parsedCli.positional
const expectedGitSha = parsedCli.options['expected-git-sha'] || null
const expectedDeploymentId = parsedCli.options['expected-deployment-id'] || null

if (showHelp) {
  console.log('Usage: node scripts/consultation-preview-visual-audit.mjs <immutable-preview-origin> <output-dir> --expected-git-sha <40-hex> --expected-deployment-id <dpl_...>')
  console.log('       node scripts/consultation-preview-visual-audit.mjs --plan')
  console.log('       add --identity-only to verify deployment binding without opening Chrome')
  process.exit(0)
}

function validateExpectedDeploymentIdentity(gitSha, deploymentId) {
  if (!/^[0-9a-f]{40}$/i.test(gitSha || '')) throw new Error('--expected-git-sha must be a full 40-character Git SHA.')
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId || '')) throw new Error('--expected-deployment-id must be a Vercel deployment ID beginning with dpl_.')
}

function normalizePublicOrigin(value) {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Preview origin must use http or https.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Preview origin must not contain credentials, query parameters, or fragments.')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('Preview origin must not contain a route; the audit uses a fixed public-route allowlist.')
  }
  return parsed.origin
}

function assertImmutableVercelOrigin(origin, inspected) {
  const requested = new URL(origin)
  const inspectedUrl = normalizePublicOrigin(inspected?.url || '')
  if (requested.protocol !== 'https:' || !requested.hostname.endsWith('.vercel.app')) {
    throw new Error('Release evidence requires an immutable HTTPS vercel.app deployment URL.')
  }
  if (requested.origin !== inspectedUrl) {
    throw new Error('The requested origin is an alias or differs from Vercel\'s immutable deployment URL.')
  }
}

function inspectDeployment(origin) {
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : 'vercel'
  const vercelArgs = (args) => process.platform === 'win32' ? ['/d', '/s', '/c', 'vercel', ...args] : args
  const inspected = spawnSync(executable, vercelArgs(['inspect', origin, '--format=json']), {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (inspected.error || inspected.status !== 0) {
    throw new Error(`Vercel inspection failed (${inspected.status ?? 'spawn-error'}).`)
  }
  let metadata
  try {
    metadata = JSON.parse(inspected.stdout)
  } catch {
    throw new Error('Vercel inspection did not return valid JSON.')
  }
  const identity = {
    observedAt: new Date().toISOString(),
    deploymentId: metadata.id || null,
    url: metadata.url ? normalizePublicOrigin(metadata.url.startsWith('http') ? metadata.url : `https://${metadata.url}`) : null,
    gitSha: metadata.meta?.githubCommitSha || metadata.meta?.gitCommitSha || null,
    readyState: metadata.readyState || metadata.state || null,
  }
  assertImmutableVercelOrigin(origin, identity)
  if (identity.deploymentId !== expectedDeploymentId) throw new Error('Inspected deployment ID does not match --expected-deployment-id.')
  if (!identity.gitSha) {
    const listed = spawnSync(executable, vercelArgs(['list', '--status', 'READY', '-m', `githubCommitSha=${expectedGitSha}`, '--format=json', '--yes']), {
      encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    })
    if (listed.error || listed.status !== 0) throw new Error(`Vercel Git metadata lookup failed (${listed.status ?? 'spawn-error'}).`)
    let listing
    try {
      listing = JSON.parse(listed.stdout)
    } catch {
      throw new Error('Vercel Git metadata lookup did not return valid JSON.')
    }
    const matching = (listing.deployments || []).find((deployment) => {
      const listedUrl = deployment.url ? normalizePublicOrigin(deployment.url.startsWith('http') ? deployment.url : `https://${deployment.url}`) : null
      return listedUrl === identity.url && deployment.meta?.githubCommitSha === expectedGitSha
    })
    identity.gitSha = matching?.meta?.githubCommitSha || null
  }
  if (identity.gitSha !== expectedGitSha) throw new Error('Inspected deployment is not bound to --expected-git-sha.')
  if (identity.readyState !== 'READY') throw new Error(`Deployment is not READY (actual: ${identity.readyState || 'missing'}).`)
  return identity
}

function routeSlug(route) {
  if (route === '/') return 'home'
  return route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
}

function buildCases(origin) {
  const standardCases = PUBLIC_ROUTES.flatMap((route) => STANDARD_VIEWPORTS.flatMap((viewport) => (
    THEMES.flatMap((theme) => MOTION_PREFERENCES.map((motion) => ({
      kind: 'standard',
      route,
      url: new URL(route, origin).toString(),
      theme,
      motion,
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      referencePhysicalWidth: viewport.width,
      referencePhysicalHeight: viewport.height,
      name: `${routeSlug(route)}--${viewport.name}--${theme}--${motion}`,
    })))
  )))
  const zoomCases = PUBLIC_ROUTES.flatMap((route) => THEMES.flatMap((theme) => (
    MOTION_PREFERENCES.map((motion) => ({
      kind: 'zoom-400',
      route,
      url: new URL(route, origin).toString(),
      theme,
      motion,
      ...ZOOM_400_VIEWPORT,
      name: `${routeSlug(route)}--zoom-400--${theme}--${motion}`,
    }))
  )))
  return [...standardCases, ...zoomCases]
}

function runContractSelfTest() {
  const base = {
    documentResponse: { status: 200 },
    route: '/',
    theme: 'light',
    motion: 'no-preference',
    kind: 'standard',
    requestedViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    screenshotEvidence: { pixelWidth: 390, pixelHeight: 844 },
    page: {
      finalPathname: '/',
      declaredTheme: 'light',
      themeBehavior: { storedTheme: 'light', resolvedTheme: 'light', prefersDark: false, domForced: false },
      viewport: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 1 },
      layout: { horizontalOverflow: false },
      landmarks: { visibleMainCount: 1, visibleH1Count: 1 },
      images: { broken: [], missingAlt: [] },
      controls: { touchTargetFailures: [], unlabeledControls: [], namelessInteractive: [] },
      duplicateIds: [],
      motion: {
        reducedMotionMediaMatches: false,
        cssViolations: [], activeAnimations: [], playingAutoplayVideos: [],
        rootScrollBehavior: 'auto', bodyScrollBehavior: 'auto',
      },
      visualIntegrity: { contrastViolations: [], clippedText: [], harmfulOverlaps: [] },
    },
    focus: {
      completeUniqueCycle: true,
      expectedFocusableCount: 2,
      auditedUniqueFocusStops: 2,
      missingExpectedPaths: [], unexpectedPaths: [], duplicateBeforeCycle: false,
      missingFocusVisible: [], missingVisibleIndicator: [], unchangedFocusIndicator: [],
      firstFocusScreenshotEvidence: { pixelWidth: 390, pixelHeight: 844 },
    },
    diagnostics: [],
  }
  const cases = [
    ['clean', {}, []],
    ['loading-failed', { diagnostics: [{ method: 'Network.loadingFailed', blockedReason: null }] }, ['runtime-or-resource-errors']],
    ['console-error', { diagnostics: [{ method: 'Runtime.consoleAPICalled', type: 'error' }] }, ['runtime-or-resource-errors']],
    ['focus-cycle', { focus: { ...base.focus, completeUniqueCycle: false } }, ['focus-cycle-incomplete']],
    ['focus-style', { focus: { ...base.focus, unchangedFocusIndicator: [{ path: '#a' }] } }, ['focus-indicator-unchanged']],
    ['contrast', { page: { ...base.page, visualIntegrity: { ...base.page.visualIntegrity, contrastViolations: [{ ratio: 2 }] } } }, ['text-contrast']],
    ['clipping', { page: { ...base.page, visualIntegrity: { ...base.page.visualIntegrity, clippedText: [{ path: '#x' }] } } }, ['text-clipping']],
    ['overlap', { page: { ...base.page, visualIntegrity: { ...base.page.visualIntegrity, harmfulOverlaps: [{ a: '#x', b: '#y' }] } } }, ['harmful-overlap']],
    ['dimensions', { screenshotEvidence: { pixelWidth: 389, pixelHeight: 844 } }, ['screenshot-pixel-dimensions']],
    ['theme-forced', { page: { ...base.page, themeBehavior: { storedTheme: 'light', resolvedTheme: 'light', domForced: true } } }, ['theme-dom-forced']],
    ['viewport-mobile-rounding', {
      requestedViewport: { width: 320, height: 800, deviceScaleFactor: 1 },
      screenshotEvidence: { pixelWidth: 320, pixelHeight: 800 },
      page: { ...base.page, viewport: { innerWidth: 321, innerHeight: 803, devicePixelRatio: 1 } },
      focus: { ...base.focus, firstFocusScreenshotEvidence: { pixelWidth: 320, pixelHeight: 800 } },
    }, []],
    ['viewport-real-drift', {
      requestedViewport: { width: 320, height: 800, deviceScaleFactor: 1 },
      screenshotEvidence: { pixelWidth: 320, pixelHeight: 800 },
      page: { ...base.page, viewport: { innerWidth: 325, innerHeight: 805, devicePixelRatio: 1 } },
      focus: { ...base.focus, firstFocusScreenshotEvidence: { pixelWidth: 320, pixelHeight: 800 } },
    }, ['viewport-dpr-invariant']],
    ['canceled-prefetch', {
      diagnostics: [{ method: 'Network.loadingFailed', resourceType: 'Fetch', canceled: true, blockedReason: null }],
    }, []],
    ['canceled-script', {
      diagnostics: [{ method: 'Network.loadingFailed', resourceType: 'Script', canceled: true, blockedReason: null }],
    }, ['runtime-or-resource-errors']],
    ['fetch-response-error', {
      diagnostics: [{ method: 'Network.responseReceived', resourceType: 'Fetch', status: 500 }],
    }, ['runtime-or-resource-errors']],
    ['vercel-preview-toolbar', {
      diagnostics: [
        {
          method: 'Network.loadingFailed', resourceType: 'Script', url: VERCEL_PREVIEW_TOOLBAR_URL,
          blockedReason: 'csp', canceled: false,
        },
        { method: 'Log.entryAdded', source: 'security', previewToolbarCsp: true },
      ],
    }, []],
    ['vercel-toolbar-non-csp', {
      diagnostics: [{
        method: 'Network.loadingFailed', resourceType: 'Script', url: VERCEL_PREVIEW_TOOLBAR_URL,
        blockedReason: 'mixed-content', canceled: false,
      }],
    }, ['runtime-or-resource-errors']],
    ['other-csp-script', {
      diagnostics: [{
        method: 'Network.loadingFailed', resourceType: 'Script', url: 'https://example.invalid/product.js',
        blockedReason: 'csp', canceled: false,
      }],
    }, ['runtime-or-resource-errors']],
    ['other-security-log', {
      diagnostics: [{ method: 'Log.entryAdded', source: 'security', previewToolbarCsp: false }],
    }, ['runtime-or-resource-errors']],
  ]
  const outcomes = cases.map(([name, overrides, expectedCodes]) => {
    const result = { ...base, ...overrides }
    const actualCodes = getHardFailures(result).map((failure) => failure.code)
    return { name, expectedCodes, actualCodes, pass: expectedCodes.every((code) => actualCodes.includes(code)) && (expectedCodes.length > 0 || actualCodes.length === 0) }
  })
  const identityOutcomes = []
  try {
    validateExpectedDeploymentIdentity('a'.repeat(40), 'dpl_Abc123')
    assertImmutableVercelOrigin('https://web-abc-owner.vercel.app', { url: 'https://web-abc-owner.vercel.app' })
    identityOutcomes.push({ name: 'immutable-exact-origin', pass: true })
  } catch (error) {
    identityOutcomes.push({ name: 'immutable-exact-origin', pass: false, error: sanitizeDiagnosticText(error.message) })
  }
  try {
    assertImmutableVercelOrigin('https://branch-alias.vercel.app', { url: 'https://web-abc-owner.vercel.app' })
    identityOutcomes.push({ name: 'mutable-alias-rejected', pass: false })
  } catch {
    identityOutcomes.push({ name: 'mutable-alias-rejected', pass: true })
  }
  return {
    schema: 'jianyuan-consultation-preview-visual-audit-contract-self-test/v1',
    outcomes,
    identityOutcomes,
    pass: outcomes.every((outcome) => outcome.pass) && identityOutcomes.every((outcome) => outcome.pass),
  }
}

if (contractSelfTest) {
  const receipt = runContractSelfTest()
  console.log(JSON.stringify(receipt, null, 2))
  process.exit(receipt.pass ? 0 : 1)
}

const baseOrigin = normalizePublicOrigin(positionalArgs[0] || 'http://127.0.0.1:3010')
const auditCases = buildCases(baseOrigin)

if (planOnly) {
  console.log(JSON.stringify({
    schema: 'jianyuan-consultation-preview-visual-audit-plan/v1',
    baseOrigin,
    publicRoutes: PUBLIC_ROUTES,
    standardViewports: STANDARD_VIEWPORTS,
    themes: THEMES,
    motionPreferences: MOTION_PREFERENCES,
    standardCaseCount: auditCases.filter((entry) => entry.kind === 'standard').length,
    zoom400CaseCount: auditCases.filter((entry) => entry.kind === 'zoom-400').length,
    totalCaseCount: auditCases.length,
    zoom400Method: {
      protocol: 'Chrome DevTools Protocol',
      command: 'Emulation.setDeviceMetricsOverride',
      cssLayoutViewportWidth: 320,
      deviceScaleFactor: 4,
      referencePhysicalViewportWidth: 1280,
      pageScaleFactor: 1,
      interpretation: '1280 physical pixels / 400% = 320 CSS pixels; reflow, not pinch zoom',
    },
  }, null, 2))
  process.exit(0)
}

if (positionalArgs.length !== 2) throw new Error('Preview origin and a new output directory are required.')
validateExpectedDeploymentIdentity(expectedGitSha, expectedDeploymentId)
const deploymentAtStart = inspectDeployment(baseOrigin)
if (identityOnly) {
  console.log(JSON.stringify({ schema: 'jianyuan-consultation-preview-deployment-binding/v1', verdict: 'PASS', expected: { gitSha: expectedGitSha, deploymentId: expectedDeploymentId }, observed: deploymentAtStart }, null, 2))
  process.exit(0)
}

const defaultRunId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = resolve(positionalArgs[1] || join(tmpdir(), 'jianyuan-consultation-preview-audit', defaultRunId))
if (existsSync(outputDir) && readdirSync(outputDir).length > 0) {
  throw new Error('The output directory is not empty. Use a new directory so stale evidence cannot be mistaken for this run.')
}
const screenshotDir = join(outputDir, 'screenshots')
const caseDir = join(outputDir, 'cases')
mkdirSync(screenshotDir, { recursive: true })
mkdirSync(caseDir, { recursive: true })

const settleMs = Math.max(0, Number(process.env.AUDIT_SETTLE_MS || 500))
const commandTimeoutMs = Math.max(5_000, Number(process.env.AUDIT_COMMAND_TIMEOUT_MS || 30_000))
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate))
if (!chromePath) throw new Error('Chrome or Edge was not found. Set CHROME_PATH to an approved local browser binary.')

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
const hashText = (value) => createHash('sha256').update(String(value)).digest('hex')
const hashBuffer = (value) => createHash('sha256').update(value).digest('hex')

function readPngDimensions(buffer) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Chrome returned an invalid PNG screenshot.')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value))
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

function sanitizeDiagnosticText(value) {
  const text = String(value || '')
  return {
    sha256: hashText(text),
    length: text.length,
  }
}

async function fetchJson(url, attempts = 80) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch (error) {
      lastError = error
    }
    await wait(100)
  }
  throw lastError || new Error(`Could not connect to ${safeUrl(url)}.`)
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let nextId = 1
  const pending = new Map()
  const eventWaiters = new Map()
  const documentResponses = []
  const requestUrls = new Map()
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
      clearTimeout(waiter.timer)
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`))
      else waiter.resolve(message.result)
      return
    }

    if (message.method === 'Network.requestWillBeSent') {
      requestUrls.set(message.params.requestId, safeUrl(message.params.request?.url))
    } else if (message.method === 'Network.responseReceived' && message.params.type === 'Document') {
      documentResponses.push({
        loaderId: message.params.loaderId,
        status: message.params.response?.status,
        url: safeUrl(message.params.response?.url),
        mimeType: message.params.response?.mimeType,
      })
    } else if (message.method === 'Network.loadingFailed') {
      diagnostics.push({
        method: message.method,
        requestId: message.params.requestId,
        resourceType: message.params.type,
        url: requestUrls.get(message.params.requestId) || null,
        blockedReason: message.params.blockedReason || null,
        canceled: Boolean(message.params.canceled),
        error: sanitizeDiagnosticText(message.params.errorText),
      })
    } else if (message.method === 'Network.responseReceived' && message.params.response?.status >= 400) {
      diagnostics.push({
        method: message.method,
        resourceType: message.params.type,
        status: message.params.response.status,
        url: safeUrl(message.params.response.url),
      })
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails || {}
      diagnostics.push({
        method: message.method,
        className: details.exception?.className || details.exception?.subtype || null,
        url: safeUrl(details.url || details.stackTrace?.callFrames?.[0]?.url || ''),
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        description: sanitizeDiagnosticText(details.exception?.description || details.text),
      })
    } else if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      const logText = String(message.params.entry.text || '')
      diagnostics.push({
        method: message.method,
        level: message.params.entry.level,
        source: message.params.entry.source,
        url: safeUrl(message.params.entry.url || ''),
        previewToolbarCsp: message.params.entry.source === 'security' && logText.includes(VERCEL_PREVIEW_TOOLBAR_URL),
        text: sanitizeDiagnosticText(logText),
      })
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      diagnostics.push({
        method: message.method,
        type: message.params.type,
        argumentCount: message.params.args?.length || 0,
        stackUrls: (message.params.stackTrace?.callFrames || []).slice(0, 4).map((frame) => safeUrl(frame.url)),
      })
    }

    const waiters = eventWaiters.get(message.method)
    if (!waiters?.length) return
    const waiter = waiters.shift()
    clearTimeout(waiter.timer)
    waiter.resolve(message.params)
  })

  const rejectPending = (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    pending.clear()
  }
  socket.addEventListener('close', () => rejectPending(new Error('Chrome DevTools connection closed.')))
  socket.addEventListener('error', () => rejectPending(new Error('Chrome DevTools connection failed.')))

  async function send(method, params = {}, timeoutMs = commandTimeoutMs) {
    await opened
    const id = nextId++
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectSend(new Error(`${method} timed out after ${timeoutMs}ms.`))
      }, timeoutMs)
      timer.unref()
      pending.set(id, { resolve: resolveSend, reject: rejectSend, method, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  function once(method, timeoutMs = commandTimeoutMs) {
    return new Promise((resolveEvent, rejectEvent) => {
      const waiters = eventWaiters.get(method) || []
      const entry = {
        resolve: resolveEvent,
        reject: rejectEvent,
        timer: setTimeout(() => {
          const active = eventWaiters.get(method) || []
          const index = active.indexOf(entry)
          if (index >= 0) active.splice(index, 1)
          rejectEvent(new Error(`Waiting for ${method} timed out after ${timeoutMs}ms.`))
        }, timeoutMs),
      }
      entry.timer.unref()
      waiters.push(entry)
      eventWaiters.set(method, waiters)
    })
  }

  return {
    send,
    once,
    documentResponses,
    diagnostics,
    close: () => socket.close(),
  }
}

async function evaluate(cdp, expression, label, options = {}) {
  let lastError
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: Boolean(options.awaitPromise),
      })
      if (result.exceptionDetails) throw new Error(`${label} threw in the page context.`)
      return result.result?.value
    } catch (error) {
      lastError = error
      if (!/navigated|execution context|context with specified id|target closed/i.test(String(error?.message))) throw error
      await wait(100)
    }
  }
  throw new Error(`${label} remained unstable after navigation: ${lastError?.message || lastError}`)
}

async function waitForStableDocument(cdp, expectedPathname) {
  let stableUrl = ''
  let stablePolls = 0
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const snapshot = await evaluate(cdp, `({
        state: document.readyState,
        hasBody: Boolean(document.body),
        href: location.href,
        pathname: location.pathname
      })`, 'document readiness')
      if ((snapshot.state === 'interactive' || snapshot.state === 'complete') && snapshot.hasBody) {
        stablePolls = snapshot.href === stableUrl ? stablePolls + 1 : 1
        stableUrl = snapshot.href
        if (stablePolls >= 3) return snapshot
      } else {
        stablePolls = 0
      }
    } catch {
      stablePolls = 0
    }
    await wait(100)
  }
  throw new Error(`The public route ${expectedPathname} did not reach a stable interactive document within 30 seconds.`)
}

async function loadLazyAssets(cdp, settleReveals = false) {
  const dwellMs = settleReveals ? 180 : 24
  const finalSettleMs = settleReveals ? 420 : 48
  await evaluate(cdp, `(async () => {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const maximum = Math.max(0, scrollingElement.scrollHeight - innerHeight);
    const step = Math.max(160, Math.floor(innerHeight * 0.8));
    for (let y = 0; y <= maximum; y += step) {
      scrollTo({ top: y, left: 0, behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, ${dwellMs})));
    }
    scrollTo({ top: maximum, left: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, ${finalSettleMs})));
    await Promise.race([
      Promise.all([...document.images].map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, ${finalSettleMs})));
  })()`, 'lazy asset walk', { awaitPromise: true })
}

async function capturePublicPageEvidence(cdp, auditCase, outputDirectory) {
  const canonical = auditCase.kind === 'standard'
    && auditCase.width === 1440
    && auditCase.theme === 'light'
    && auditCase.motion === 'no-preference'
  if (!canonical) return { required: false, fullPage: null, tiles: [] }
  const metrics = await cdp.send('Page.getLayoutMetrics')
  const content = metrics.cssContentSize || metrics.contentSize
  const fullPath = join(outputDirectory, `${auditCase.name}--full-page.png`)
  const fullCapture = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(content.width), height: Math.ceil(content.height), scale: 1 },
  })
  const fullBuffer = Buffer.from(fullCapture.data, 'base64')
  const fullDimensions = readPngDimensions(fullBuffer)
  writeFileSync(fullPath, fullBuffer)
  const tileRects = await evaluate(cdp, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= 80 && rect.height >= 40 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const candidates = [...document.querySelectorAll('[data-visual-audit-tile],main>section,main>article')].filter(visible);
    const selected = candidates.length ? candidates : [...document.querySelectorAll('main section,main article')].filter(visible);
    return selected.slice(0, 12).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const x = Math.max(0, rect.left + scrollX);
      const y = Math.max(0, rect.top + scrollY);
      const root = document.scrollingElement || document.documentElement;
      return { index, x, y, width: Math.min(rect.width, root.scrollWidth - x), height: Math.min(rect.height, root.scrollHeight - y) };
    }).filter((rect) => rect.width >= 80 && rect.height >= 40);
  })()`, 'public page tile discovery')
  const tiles = []
  for (const rect of tileRects) {
    const tilePath = join(outputDirectory, `${auditCase.name}--tile-${String(rect.index + 1).padStart(2, '0')}.png`)
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: Math.ceil(rect.width), height: Math.ceil(rect.height), scale: 1 },
    })
    const buffer = Buffer.from(capture.data, 'base64')
    const dimensions = readPngDimensions(buffer)
    writeFileSync(tilePath, buffer)
    tiles.push({ file: basename(tilePath), sha256: hashBuffer(buffer), pixelWidth: dimensions.width, pixelHeight: dimensions.height, cssRect: rect })
  }
  return {
    required: true,
    fullPage: { file: basename(fullPath), sha256: hashBuffer(fullBuffer), pixelWidth: fullDimensions.width, pixelHeight: fullDimensions.height, cssWidth: content.width, cssHeight: content.height },
    tiles,
  }
}

const PAGE_METRICS_EXPRESSION = `(() => {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const closedDetails = element.closest('details:not([open])');
    const hiddenByClosedDetails = Boolean(closedDetails
      && !closedDetails.querySelector(':scope > summary')?.contains(element));
    return rect.width > 0 && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.contentVisibility !== 'hidden'
      && !hiddenByClosedDetails
      && !element.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const roundedRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    };
  };
  const nameOf = (element) => (
    element.getAttribute('aria-label')
    || element.getAttribute('alt')
    || element.textContent
    || element.getAttribute('name')
    || element.getAttribute('placeholder')
    || ''
  ).trim().replace(/\\s+/g, ' ').slice(0, 80);
  const pathOf = (element) => {
    if (element.id) return '#' + CSS.escape(element.id);
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 6) {
      const siblings = current.parentElement ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName) : [];
      const suffix = siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : '';
      parts.unshift(current.tagName.toLowerCase() + suffix);
      current = current.parentElement;
    }
    return 'body>' + parts.join('>');
  };
  const parseColor = (value) => {
    const match = String(value).match(/rgba?\\(\\s*([\\d.]+)[, ]+([\\d.]+)[, ]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+))?\\s*\\)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])] : null;
  };
  const blend = (foreground, background) => {
    const alpha = foreground[3] + background[3] * (1 - foreground[3]);
    if (alpha <= 0) return [255, 255, 255, 1];
    return [0, 1, 2].map((index) => (foreground[index] * foreground[3] + background[index] * background[3] * (1 - foreground[3])) / alpha).concat(alpha);
  };
  const effectiveBackground = (element) => {
    let current = element;
    let result = [255, 255, 255, 1];
    const layers = [];
    let hasBackgroundImage = false;
    while (current) {
      const style = getComputedStyle(current);
      if (style.backgroundImage !== 'none') hasBackgroundImage = true;
      const color = parseColor(style.backgroundColor);
      if (color && color[3] > 0) layers.push(color);
      current = current.parentElement;
    }
    for (const layer of layers.reverse()) result = blend(layer, result);
    return { color: result, reason: null, approximateBecauseBackgroundImage: hasBackgroundImage };
  };
  const luminance = (color) => {
    const channels = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrastRatio = (first, second) => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const interactiveSelector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
  const interactive = [...document.querySelectorAll(interactiveSelector)].filter(visible);
  const interactiveRects = interactive.map((element) => ({ element, rect: element.getBoundingClientRect() }));
  const touchTargetFailures = interactiveRects.map(({ element, rect }, targetIndex) => {
    const ownText = (element.textContent || '').trim();
    const parentText = (element.parentElement?.textContent || '').trim();
    const inlineTextException = element.tagName === 'A'
      && getComputedStyle(element).display === 'inline'
      && (Boolean(element.closest('p,li')) || parentText.length > ownText.length);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const spacingException = interactiveRects.every(({ rect: otherRect }, otherIndex) => {
      if (otherIndex === targetIndex) return true;
      const otherCenterX = otherRect.left + otherRect.width / 2;
      const otherCenterY = otherRect.top + otherRect.height / 2;
      return Math.hypot(centerX - otherCenterX, centerY - otherCenterY) >= 24;
    });
    return {
      tag: element.tagName,
      name: nameOf(element),
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
      inlineTextException,
      spacingException,
    };
  }).filter((entry) => !entry.inlineTextException && !entry.spacingException && (entry.width < 24 || entry.height < 24));
  const unlabeledControls = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
    .filter(visible)
    .filter((element) => !element.labels?.length && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby'))
    .map((element) => ({ tag: element.tagName, type: element.getAttribute('type'), name: element.getAttribute('name') }));
  const namelessInteractive = interactive
    .filter((element) => !nameOf(element) && !element.getAttribute('aria-labelledby') && !element.querySelector('img[alt],svg[aria-label],title'))
    .map((element) => ({ tag: element.tagName, role: element.getAttribute('role'), rect: roundedRect(element) }));
  const root = document.documentElement;
  const body = document.body;
  const documentWidth = Math.max(root.scrollWidth, body.scrollWidth);
  const overflowOffenders = [...document.querySelectorAll('body *')]
    .filter(visible)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1)
    .slice(0, 30)
    .map(({ element, rect }) => ({
      tag: element.tagName,
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className.slice(0, 120) : null,
      rect: {
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
      },
    }));
  const brokenImages = [...document.images]
    .filter((image) => image.complete ? image.naturalWidth === 0 : true)
    .map((image) => ({ src: new URL(image.currentSrc || image.src, location.href).pathname, alt: image.alt || '' }));
  const imagesMissingAlt = [...document.images]
    .filter((image) => !image.hasAttribute('alt'))
    .map((image) => ({ src: new URL(image.currentSrc || image.src, location.href).pathname }));
  const allIds = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
  const duplicateIds = [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionPropertyPattern = /(^|,|\\s)(all|transform|translate|rotate|scale|left|right|top|bottom|width|height|margin|padding|background-position|filter|clip-path)(,|\\s|$)/;
  const parseTimes = (value) => value.split(',').map((entry) => {
    const trimmed = entry.trim();
    return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000;
  }).filter(Number.isFinite);
  const reducedMotionCssViolations = reducedMotion ? [...document.querySelectorAll('body *')]
    .filter(visible)
    .flatMap((element) => {
      const style = getComputedStyle(element);
      const animationTimes = parseTimes(style.animationDuration);
      const transitionTimes = parseTimes(style.transitionDuration);
      const animationViolation = style.animationName !== 'none' && Math.max(0, ...animationTimes) > 50;
      const transitionViolation = motionPropertyPattern.test(style.transitionProperty) && Math.max(0, ...transitionTimes) > 100;
      if (!animationViolation && !transitionViolation) return [];
      return [{
        tag: element.tagName,
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className.slice(0, 100) : null,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
      }];
    }).slice(0, 40) : [];
  const activeAnimations = reducedMotion ? document.getAnimations({ subtree: true }).flatMap((animation) => {
    const timing = animation.effect?.getComputedTiming?.() || {};
    const duration = Number(timing.activeDuration ?? timing.endTime ?? 0);
    if (!['running', 'pending'].includes(animation.playState) || !(duration > 50 || duration === Infinity)) return [];
    const target = animation.effect?.target;
    return [{
      playState: animation.playState,
      duration: Number.isFinite(duration) ? duration : 'infinite',
      target: target?.tagName || null,
      id: target?.id || null,
    }];
  }).slice(0, 30) : [];
  const textParents = [];
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = textWalker.nextNode())) {
    if (textNode.textContent.trim() && textNode.parentElement && visible(textNode.parentElement)) textParents.push(textNode.parentElement);
  }
  const textElements = [...new Set(textParents)].slice(0, 1200);
  const contrastUnverifiable = [];
  const contrastViolations = textElements.flatMap((element) => {
    const style = getComputedStyle(element);
    const foreground = parseColor(style.color);
    const background = effectiveBackground(element);
    if (!foreground || !background.color) {
      if (background.reason) contrastUnverifiable.push({ path: pathOf(element), reason: background.reason });
      return [];
    }
    const effectiveForeground = blend(foreground, background.color);
    const ratio = contrastRatio(effectiveForeground, background.color);
    const fontSize = parseFloat(style.fontSize) || 0;
    const fontWeight = parseInt(style.fontWeight, 10) || 400;
    const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const required = largeText ? 3 : 4.5;
    return ratio + 0.02 < required ? [{
      path: pathOf(element), name: nameOf(element), ratio: Math.round(ratio * 100) / 100,
      required, fontSize, fontWeight, approximateBecauseBackgroundImage: background.approximateBecauseBackgroundImage,
    }] : [];
  }).slice(0, 60);
  const clippedText = textElements.flatMap((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const clipsX = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    const clipsY = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    const intentionalEllipsis = style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap';
    const screenReaderOnly = ['absolute', 'fixed'].includes(style.position)
      && rect.width <= 2 && rect.height <= 2
      && (style.clip !== 'auto' || style.clipPath !== 'none' || ['hidden', 'clip'].includes(style.overflow));
    return (clipsX || clipsY) && !intentionalEllipsis && !screenReaderOnly ? [{
      path: pathOf(element), name: nameOf(element), clipsX, clipsY,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    }] : [];
  }).slice(0, 60);
  const overlapCandidates = [...document.querySelectorAll('h1,h2,h3,h4,p,li,a[href],button,label,input,select,textarea,[role="button"]')]
    .filter(visible).slice(0, 400);
  const harmfulOverlaps = [];
  for (let firstIndex = 0; firstIndex < overlapCandidates.length && harmfulOverlaps.length < 60; firstIndex += 1) {
    const first = overlapCandidates[firstIndex];
    const firstRect = first.getBoundingClientRect();
    for (let secondIndex = firstIndex + 1; secondIndex < overlapCandidates.length && harmfulOverlaps.length < 60; secondIndex += 1) {
      const second = overlapCandidates[secondIndex];
      if (first.contains(second) || second.contains(first)) continue;
      const secondRect = second.getBoundingClientRect();
      const width = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
      const height = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
      if (width <= 4 || height <= 4) continue;
      const intersection = width * height;
      const smaller = Math.min(firstRect.width * firstRect.height, secondRect.width * secondRect.height);
      if (!(smaller > 0) || intersection / smaller < 0.12) continue;
      harmfulOverlaps.push({
        first: { path: pathOf(first), name: nameOf(first), rect: roundedRect(first) },
        second: { path: pathOf(second), name: nameOf(second), rect: roundedRect(second) },
        overlapRatio: Math.round((intersection / smaller) * 1000) / 1000,
      });
    }
  }
  const visibleMain = [...document.querySelectorAll('main')].filter(visible);
  const visibleH1 = [...document.querySelectorAll('h1')].filter(visible);
  return {
    finalUrl: location.href,
    finalPathname: location.pathname,
    title: document.title,
    htmlLang: root.lang,
    declaredTheme: root.getAttribute('data-theme') || (root.classList.contains('dark') ? 'dark' : null),
    themeBehavior: {
      storedTheme: (() => { try { return localStorage.getItem('theme'); } catch { return null; } })(),
      resolvedTheme: root.getAttribute('data-theme') || (root.classList.contains('dark') ? 'dark' : getComputedStyle(root).colorScheme),
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      rootColorScheme: getComputedStyle(root).colorScheme,
      rootForeground: getComputedStyle(root).color,
      rootBackground: getComputedStyle(root).backgroundColor,
      domForced: Boolean(root.getAttribute('data-audit-forced-theme')),
    },
    viewport: { innerWidth, innerHeight, devicePixelRatio },
    layout: {
      documentWidth,
      clientWidth: root.clientWidth,
      horizontalOverflow: documentWidth > root.clientWidth + 1,
      overflowOffenders,
    },
    landmarks: {
      mainCount: document.querySelectorAll('main').length,
      visibleMainCount: visibleMain.length,
      h1Count: document.querySelectorAll('h1').length,
      visibleH1Count: visibleH1.length,
      visibleH1: visibleH1.map((heading) => nameOf(heading)),
    },
    images: { broken: brokenImages, missingAlt: imagesMissingAlt },
    controls: {
      visibleInteractiveCount: interactive.length,
      keyboardFocusableCount: interactive.filter((element) => !element.disabled && element.tabIndex >= 0).length,
      touchTargetFailures,
      unlabeledControls,
      namelessInteractive,
    },
    duplicateIds,
    visualIntegrity: { contrastViolations, contrastUnverifiable: contrastUnverifiable.slice(0, 60), clippedText, harmfulOverlaps },
    motion: {
      reducedMotionMediaMatches: reducedMotion,
      rootScrollBehavior: getComputedStyle(root).scrollBehavior,
      bodyScrollBehavior: getComputedStyle(body).scrollBehavior,
      cssViolations: reducedMotionCssViolations,
      activeAnimations,
      playingAutoplayVideos: [...document.querySelectorAll('video[autoplay]')]
        .filter((video) => !video.paused)
        .map((video) => ({ muted: video.muted, loop: video.loop })),
    },
  };
})()`

async function auditKeyboardFocus(cdp, screenshotPath) {
  const expected = await evaluate(cdp, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        && !element.disabled && !element.closest('[hidden],[inert],[aria-hidden="true"]');
    };
    const selector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
    const pathOf = (element) => {
      if (element.id) return '#' + CSS.escape(element.id);
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 6) {
        const siblings = current.parentElement ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName) : [];
        const suffix = siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : '';
        parts.unshift(current.tagName.toLowerCase() + suffix);
        current = current.parentElement;
      }
      return 'body>' + parts.join('>');
    };
    const signature = (style) => [style.outlineWidth, style.outlineStyle, style.outlineColor, style.outlineOffset, style.boxShadow, style.borderColor, style.backgroundColor].join('|');
    document.activeElement?.blur?.();
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const entries = [...document.querySelectorAll(selector)].filter(visible).filter((element) => element.tabIndex >= 0).map((element) => ({
      path: pathOf(element), baselineStyleSignature: signature(getComputedStyle(element)),
    }));
    return { paths: [...new Set(entries.map((entry) => entry.path))], entries };
  })()`, 'focusable control count')

  const records = []
  const seenPaths = new Set()
  const maximumTabs = Math.min(Math.max(expected.paths.length + 12, 3), 240)
  let firstFocusCaptured = false
  let firstFocusScreenshotEvidence = null
  let cycleReturnedToFirst = false
  let duplicateBeforeCycle = false
  for (let index = 0; index < maximumTabs; index += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await wait(15)
    const record = await evaluate(cdp, `(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const path = (() => {
        if (element.id) return '#' + CSS.escape(element.id);
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 6) {
          const siblings = current.parentElement ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName) : [];
          const suffix = siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : '';
          parts.unshift(current.tagName.toLowerCase() + suffix);
          current = current.parentElement;
        }
        return 'body>' + parts.join('>');
      })();
      const outlineWidth = parseFloat(style.outlineWidth) || 0;
      const visibleOutline = outlineWidth > 0 && style.outlineStyle !== 'none' && style.outlineColor !== 'transparent';
      const visibleShadow = style.boxShadow !== 'none' && !/^rgba?\\(0, 0, 0, 0\\)$/.test(style.boxShadow);
      return {
        path,
        tag: element.tagName,
        name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
        focusVisible: element.matches(':focus-visible'),
        hasVisibleIndicator: visibleOutline || visibleShadow,
        outline: { width: outlineWidth, style: style.outlineStyle, color: style.outlineColor, offset: style.outlineOffset },
        boxShadow: style.boxShadow.slice(0, 180),
        focusedStyleSignature: [style.outlineWidth, style.outlineStyle, style.outlineColor, style.outlineOffset, style.boxShadow, style.borderColor, style.backgroundColor].join('|'),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
    })()`, 'keyboard focus sample')
    if (!record) continue
    if (!firstFocusCaptured) {
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      })
      const buffer = Buffer.from(screenshot.data, 'base64')
      const dimensions = readPngDimensions(buffer)
      writeFileSync(screenshotPath, buffer)
      firstFocusScreenshotEvidence = {
        sha256: hashBuffer(buffer),
        pixelWidth: dimensions.width,
        pixelHeight: dimensions.height,
      }
      firstFocusCaptured = true
    }
    if (seenPaths.has(record.path)) {
      cycleReturnedToFirst = records.length > 0 && record.path === records[0].path
      duplicateBeforeCycle = !cycleReturnedToFirst
      break
    }
    seenPaths.add(record.path)
    records.push(record)
  }
  await evaluate(cdp, `document.activeElement?.blur?.(); scrollTo({ top: 0, left: 0, behavior: 'instant' }); true`, 'focus cleanup')
  const baselineByPath = new Map(expected.entries.map((entry) => [entry.path, entry.baselineStyleSignature]))
  const expectedPathSet = new Set(expected.paths)
  const missingExpectedPaths = expected.paths.filter((path) => !seenPaths.has(path))
  const unexpectedPaths = [...seenPaths].filter((path) => !expectedPathSet.has(path))
  const enrichedRecords = records.map((record) => ({
    ...record,
    baselineStyleSignature: baselineByPath.get(record.path) || null,
    indicatorChanged: baselineByPath.has(record.path)
      ? baselineByPath.get(record.path) !== record.focusedStyleSignature
      : record.focusVisible && record.hasVisibleIndicator,
  }))
  const completeUniqueCycle = cycleReturnedToFirst
    && !duplicateBeforeCycle
    && missingExpectedPaths.length === 0
    && records.length >= expected.paths.length
  return {
    expectedFocusableCount: expected.paths.length,
    auditedUniqueFocusStops: records.length,
    cycleReturnedToFirst,
    completeUniqueCycle,
    duplicateBeforeCycle,
    missingExpectedPaths,
    unexpectedPaths,
    firstFocusScreenshot: firstFocusCaptured ? basename(screenshotPath) : null,
    firstFocusScreenshotEvidence,
    missingFocusVisible: enrichedRecords.filter((record) => !record.focusVisible),
    missingVisibleIndicator: enrichedRecords.filter((record) => !record.hasVisibleIndicator),
    unchangedFocusIndicator: enrichedRecords.filter((record) => !record.indicatorChanged),
    records: enrichedRecords,
  }
}

function getHardFailures(result) {
  const failures = []
  const push = (code, evidence) => failures.push({ code, evidence })
  if (!result.documentResponse || result.documentResponse.status < 200 || result.documentResponse.status >= 400) {
    push('document-http-status', result.documentResponse || null)
  }
  if (result.page.finalPathname.replace(/\/$/, '') !== result.route.replace(/\/$/, '')) {
    push('unexpected-route-redirect', { expected: result.route, actual: result.page.finalPathname })
  }
  if (result.page.layout.horizontalOverflow) push('horizontal-overflow', result.page.layout)
  if (result.page.landmarks.visibleMainCount !== 1) push('visible-main-count', result.page.landmarks)
  if (result.page.landmarks.visibleH1Count !== 1) push('visible-h1-count', result.page.landmarks)
  if (result.page.images.broken.length > 0) push('broken-images', result.page.images.broken)
  if (result.page.images.missingAlt.length > 0) push('images-missing-alt', result.page.images.missingAlt)
  if (result.page.controls.touchTargetFailures.length > 0) push('touch-target-minimum', result.page.controls.touchTargetFailures)
  if (result.page.controls.unlabeledControls.length > 0) push('unlabeled-form-controls', result.page.controls.unlabeledControls)
  if (result.page.controls.namelessInteractive.length > 0) push('nameless-interactive-controls', result.page.controls.namelessInteractive)
  if (result.page.duplicateIds.length > 0) push('duplicate-ids', result.page.duplicateIds)
  if (!result.focus.completeUniqueCycle) push('focus-cycle-incomplete', {
    expected: result.focus.expectedFocusableCount,
    audited: result.focus.auditedUniqueFocusStops,
    cycleReturnedToFirst: result.focus.cycleReturnedToFirst,
    duplicateBeforeCycle: result.focus.duplicateBeforeCycle,
    missingExpectedPaths: result.focus.missingExpectedPaths,
    unexpectedPaths: result.focus.unexpectedPaths,
  })
  if (result.focus.missingFocusVisible.length > 0) push('focus-visible-not-triggered', result.focus.missingFocusVisible)
  if (result.focus.missingVisibleIndicator.length > 0) push('focus-indicator-missing', result.focus.missingVisibleIndicator)
  if (result.focus.unchangedFocusIndicator.length > 0) push('focus-indicator-unchanged', result.focus.unchangedFocusIndicator)
  if (result.page.visualIntegrity.contrastViolations.length > 0) push('text-contrast', result.page.visualIntegrity.contrastViolations)
  if (result.page.visualIntegrity.clippedText.length > 0) push('text-clipping', result.page.visualIntegrity.clippedText)
  if (result.page.visualIntegrity.harmfulOverlaps.length > 0) push('harmful-overlap', result.page.visualIntegrity.harmfulOverlaps)
  if (result.publicPageEvidence?.required && (!result.publicPageEvidence.fullPage || result.publicPageEvidence.tiles.length === 0)) {
    push('public-page-evidence-incomplete', result.publicPageEvidence)
  }
  if (result.motion === 'reduce') {
    if (!result.page.motion.reducedMotionMediaMatches) push('reduced-motion-media-not-active', result.page.motion)
    if (result.page.motion.cssViolations.length > 0) push('reduced-motion-css', result.page.motion.cssViolations)
    if (result.page.motion.activeAnimations.length > 0) push('reduced-motion-active-animation', result.page.motion.activeAnimations)
    if (result.page.motion.playingAutoplayVideos.length > 0) push('reduced-motion-autoplay-video', result.page.motion.playingAutoplayVideos)
    if (result.page.motion.rootScrollBehavior === 'smooth' || result.page.motion.bodyScrollBehavior === 'smooth') {
      push('reduced-motion-smooth-scroll', {
        root: result.page.motion.rootScrollBehavior,
        body: result.page.motion.bodyScrollBehavior,
      })
    }
  } else if (result.page.motion.reducedMotionMediaMatches) {
    push('no-preference-media-mismatch', result.page.motion)
  }
  const themeBehavior = result.page.themeBehavior
  if (themeBehavior.domForced) push('theme-dom-forced', themeBehavior)
  if (themeBehavior.storedTheme !== result.theme) push('theme-storage-mismatch', { expected: result.theme, actual: themeBehavior.storedTheme })
  if (themeBehavior.prefersDark !== (result.theme === 'dark')) push('theme-media-mismatch', themeBehavior)
  if (result.page.declaredTheme !== result.theme || themeBehavior.resolvedTheme !== result.theme) {
    push('theme-resolution-mismatch', { expected: result.theme, declared: result.page.declaredTheme, resolved: themeBehavior.resolvedTheme })
  }
  const expectedScreenshot = {
    width: result.requestedViewport.width * result.requestedViewport.deviceScaleFactor,
    height: result.requestedViewport.height * result.requestedViewport.deviceScaleFactor,
  }
  if (result.screenshotEvidence.pixelWidth !== expectedScreenshot.width || result.screenshotEvidence.pixelHeight !== expectedScreenshot.height) {
    push('screenshot-pixel-dimensions', { expected: expectedScreenshot, actual: result.screenshotEvidence })
  }
  if (result.focus.expectedFocusableCount > 0 && (!result.focus.firstFocusScreenshotEvidence
    || result.focus.firstFocusScreenshotEvidence.pixelWidth !== expectedScreenshot.width
    || result.focus.firstFocusScreenshotEvidence.pixelHeight !== expectedScreenshot.height)) {
    push('focus-screenshot-pixel-dimensions', { expected: expectedScreenshot, actual: result.focus.firstFocusScreenshotEvidence })
  }
  if (Math.abs(result.page.viewport.innerWidth - result.requestedViewport.width) > 3
    || Math.abs(result.page.viewport.innerHeight - result.requestedViewport.height) > 3
    || result.page.viewport.devicePixelRatio !== result.requestedViewport.deviceScaleFactor) {
    push('viewport-dpr-invariant', { expected: result.requestedViewport, actual: result.page.viewport })
  }
  if (result.kind === 'zoom-400') {
    const zoom = result.zoomEvidence
    if (zoom.cssLayoutViewportWidth !== 320 || zoom.devicePixelRatio !== 4 || zoom.pageScaleFactor !== 1) {
      push('zoom-400-cdp-invariant', zoom)
    }
    if (zoom.referencePhysicalWidth / zoom.cssLayoutViewportWidth !== 4) {
      push('zoom-400-ratio', zoom)
    }
    if (result.screenshotEvidence.pixelWidth !== zoom.referencePhysicalWidth
      || result.screenshotEvidence.pixelHeight !== zoom.referencePhysicalHeight) {
      push('zoom-400-screenshot-pixels', {
        expected: { width: zoom.referencePhysicalWidth, height: zoom.referencePhysicalHeight },
        actual: {
          width: result.screenshotEvidence.pixelWidth,
          height: result.screenshotEvidence.pixelHeight,
        },
      })
    }
  }
  if (result.publicPageEvidence?.required) {
    const full = result.publicPageEvidence.fullPage
    const expectedFull = full ? {
      width: Math.ceil(full.cssWidth * result.requestedViewport.deviceScaleFactor),
      height: Math.ceil(full.cssHeight * result.requestedViewport.deviceScaleFactor),
    } : null
    if (!full || full.pixelWidth !== expectedFull.width || full.pixelHeight !== expectedFull.height) {
      push('full-page-screenshot-pixel-dimensions', { expected: expectedFull, actual: full })
    }
    const invalidTiles = result.publicPageEvidence.tiles.filter((tile) => (
      tile.pixelWidth !== Math.ceil(tile.cssRect.width * result.requestedViewport.deviceScaleFactor)
      || tile.pixelHeight !== Math.ceil(tile.cssRect.height * result.requestedViewport.deviceScaleFactor)
    ))
    if (invalidTiles.length > 0) push('tile-screenshot-pixel-dimensions', invalidTiles)
  }
  const renderCriticalResourceTypes = new Set(['Document', 'Script', 'Stylesheet', 'Image', 'Font'])
  const responseCriticalResourceTypes = new Set([...renderCriticalResourceTypes, 'Fetch', 'XHR'])
  const severeDiagnostics = result.diagnostics.filter((entry) => {
    if (entry.method === 'Network.loadingFailed' && entry.blockedReason === 'inspector') return false
    if (
      entry.method === 'Network.loadingFailed'
      && entry.resourceType === 'Script'
      && entry.url === VERCEL_PREVIEW_TOOLBAR_URL
      && entry.blockedReason === 'csp'
    ) return false
    if (entry.method === 'Log.entryAdded' && entry.previewToolbarCsp === true) return false
    if (entry.method === 'Network.loadingFailed' && entry.canceled && !renderCriticalResourceTypes.has(entry.resourceType)) return false
    if (entry.method === 'Network.loadingFailed') return true
    if (entry.method === 'Network.responseReceived') {
      return responseCriticalResourceTypes.has(entry.resourceType)
    }
    return entry.method === 'Runtime.exceptionThrown'
      || entry.method === 'Runtime.consoleAPICalled'
      || entry.method === 'Log.entryAdded'
  })
  if (severeDiagnostics.length > 0) push('runtime-or-resource-errors', severeDiagnostics)
  return failures
}

const profileDir = mkdtempSync(join(tmpdir(), 'jy-consultation-cdp-'))
const port = Number(process.env.AUDIT_CDP_PORT || (9500 + Math.floor(Math.random() * 300)))
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

const startedAt = new Date().toISOString()
const results = []
let cdp
let chromeVersion

try {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
  const pageTarget = targets.find((target) => target.type === 'page')
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target.')
  cdp = createCdpClient(pageTarget.webSocketDebuggerUrl)
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Network.enable'),
    cdp.send('Log.enable'),
  ])
  chromeVersion = await cdp.send('Browser.getVersion')
  await cdp.send('Network.setBlockedURLs', { urls: TELEMETRY_BLOCKLIST })
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      localStorage.setItem('jy_cookie_consent_v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, decided_at: '2026-01-01T00:00:00.000Z' }));
    } catch {}`,
  })

  for (const auditCase of auditCases) {
    const diagnosticStart = cdp.diagnostics.length
    const responseStart = cdp.documentResponses.length
    const emulateMobileDevice = auditCase.kind !== 'zoom-400' && auditCase.width <= 768
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: auditCase.width,
      height: auditCase.height,
      deviceScaleFactor: auditCase.deviceScaleFactor,
      mobile: emulateMobileDevice,
      screenWidth: auditCase.width,
      screenHeight: auditCase.height,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: false,
    })
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: emulateMobileDevice,
      maxTouchPoints: emulateMobileDevice ? 5 : 1,
    })
    await cdp.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'prefers-color-scheme', value: auditCase.theme },
        { name: 'prefers-reduced-motion', value: auditCase.motion },
      ],
    })
    const themeScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('theme', ${JSON.stringify(auditCase.theme)}); } catch {}`,
    })
    const loadEvent = cdp.once('Page.loadEventFired').catch(() => null)
    const navigation = await cdp.send('Page.navigate', { url: auditCase.url })
    if (navigation.errorText) throw new Error(`Could not load public route ${auditCase.route}: ${navigation.errorText}`)
    await loadEvent
    await waitForStableDocument(cdp, auditCase.route)
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript.identifier })
    await evaluate(cdp, `(() => {
      const style = document.createElement('style');
      style.setAttribute('data-consultation-visual-audit', '');
      style.textContent = '* { caret-color: transparent !important; }';
      document.head.appendChild(style);
      return true;
    })()`, 'caret setup without forcing theme DOM state')
    await evaluate(cdp, 'document.fonts?.ready || Promise.resolve()', 'font readiness', { awaitPromise: true })
    await wait(settleMs)
    const canonicalVisualCase = auditCase.kind === 'standard'
      && auditCase.width === 1440
      && auditCase.theme === 'light'
      && auditCase.motion === 'no-preference'
    await loadLazyAssets(cdp, canonicalVisualCase)

    const page = await evaluate(cdp, PAGE_METRICS_EXPRESSION, 'page metrics')
    const layoutMetrics = await cdp.send('Page.getLayoutMetrics')
    const screenshotPath = join(screenshotDir, `${auditCase.name}.png`)
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    const screenshotBuffer = Buffer.from(screenshot.data, 'base64')
    const screenshotDimensions = readPngDimensions(screenshotBuffer)
    writeFileSync(screenshotPath, screenshotBuffer)
    const publicPageEvidence = await capturePublicPageEvidence(cdp, auditCase, screenshotDir)
    const focusScreenshotPath = join(screenshotDir, `${auditCase.name}--focus.png`)
    const focus = await auditKeyboardFocus(cdp, focusScreenshotPath)
    const recentResponses = cdp.documentResponses.slice(responseStart)
    const documentResponse = [...recentResponses].reverse().find((response) => response.url === safeUrl(page.finalUrl))
      || [...recentResponses].reverse()[0]
      || null
    const result = {
      schema: 'jianyuan-consultation-preview-visual-case/v1',
      name: auditCase.name,
      kind: auditCase.kind,
      route: auditCase.route,
      theme: auditCase.theme,
      motion: auditCase.motion,
      requestedViewport: {
        width: auditCase.width,
        height: auditCase.height,
        deviceScaleFactor: auditCase.deviceScaleFactor,
      },
      screenshot: basename(screenshotPath),
      screenshotEvidence: {
        sha256: hashBuffer(screenshotBuffer),
        pixelWidth: screenshotDimensions.width,
        pixelHeight: screenshotDimensions.height,
      },
      publicPageEvidence,
      documentResponse,
      page: { ...page, finalUrl: safeUrl(page.finalUrl) },
      focus,
      zoomEvidence: auditCase.kind === 'zoom-400' ? {
        method: 'CDP Emulation.setDeviceMetricsOverride; reflow equivalent, not pinch zoom',
        referencePhysicalWidth: auditCase.referencePhysicalWidth,
        referencePhysicalHeight: auditCase.referencePhysicalHeight,
        cssLayoutViewportWidth: Math.round(layoutMetrics.cssLayoutViewport?.clientWidth || page.viewport.innerWidth),
        cssLayoutViewportHeight: Math.round(layoutMetrics.cssLayoutViewport?.clientHeight || page.viewport.innerHeight),
        devicePixelRatio: page.viewport.devicePixelRatio,
        pageScaleFactor: 1,
        effectiveZoomPercent: 400,
      } : null,
      diagnostics: cdp.diagnostics.slice(diagnosticStart),
    }
    result.hardFailures = getHardFailures(result)
    result.verdict = result.hardFailures.length === 0 ? 'PASS' : 'HOLD'
    results.push(result)
    const serializedCaseEvidence = `${JSON.stringify(result, null, 2)}\n`
    writeFileSync(join(caseDir, `${auditCase.name}.json`), serializedCaseEvidence)
    result.caseEvidenceSha256 = hashText(serializedCaseEvidence)
    console.log(`${result.verdict} ${auditCase.name} (${results.length}/${auditCases.length})`)
  }

  const deploymentAtEnd = inspectDeployment(baseOrigin)
  if (deploymentAtEnd.deploymentId !== deploymentAtStart.deploymentId || deploymentAtEnd.gitSha !== deploymentAtStart.gitSha || deploymentAtEnd.url !== deploymentAtStart.url) {
    throw new Error('Deployment identity changed between the start and end of the audit.')
  }
  const failures = results.filter((result) => result.verdict !== 'PASS')
  const manifest = {
    schema: 'jianyuan-consultation-preview-visual-audit/v1',
    startedAt,
    completedAt: new Date().toISOString(),
    baseOrigin,
    deploymentBinding: {
      expected: { gitSha: expectedGitSha, deploymentId: expectedDeploymentId, immutableUrl: baseOrigin },
      start: deploymentAtStart,
      end: deploymentAtEnd,
      unchanged: true,
    },
    publicRoutes: PUBLIC_ROUTES,
    privateRoutesAudited: false,
    browser: {
      product: chromeVersion.product,
      protocolVersion: chromeVersion.protocolVersion,
      userAgentSha256: hashText(chromeVersion.userAgent || ''),
    },
    matrix: {
      standardViewports: STANDARD_VIEWPORTS,
      themes: THEMES,
      motionPreferences: MOTION_PREFERENCES,
      standardCases: results.filter((result) => result.kind === 'standard').length,
      zoom400Cases: results.filter((result) => result.kind === 'zoom-400').length,
      totalCases: results.length,
    },
    zoom400Method: {
      command: 'Emulation.setDeviceMetricsOverride',
      cssLayoutViewportWidth: 320,
      deviceScaleFactor: 4,
      referencePhysicalViewportWidth: 1280,
      pageScaleFactor: 1,
      interpretation: '1280 physical pixels / 400% = 320 CSS pixels; layout reflows at 320 CSS pixels',
    },
    telemetryWritesBlocked: true,
    verdict: failures.length === 0 && results.length === auditCases.length ? 'PASS' : 'HOLD',
    summary: {
      expectedCases: auditCases.length,
      completedCases: results.length,
      passedCases: results.length - failures.length,
      heldCases: failures.length,
      failureCodes: [...new Set(failures.flatMap((result) => result.hardFailures.map((failure) => failure.code)))].sort(),
    },
    results: results.map((result) => ({
      name: result.name,
      route: result.route,
      kind: result.kind,
      theme: result.theme,
      motion: result.motion,
      verdict: result.verdict,
      screenshot: `screenshots/${result.screenshot}`,
      focusScreenshot: result.focus.firstFocusScreenshot ? `screenshots/${result.focus.firstFocusScreenshot}` : null,
      requestedViewport: result.requestedViewport,
      actualViewport: result.page.viewport,
      screenshotEvidence: result.screenshotEvidence,
      focusScreenshotEvidence: result.focus.firstFocusScreenshotEvidence,
      fullPageScreenshot: result.publicPageEvidence?.fullPage ? `screenshots/${result.publicPageEvidence.fullPage.file}` : null,
      tileScreenshots: (result.publicPageEvidence?.tiles || []).map((tile) => `screenshots/${tile.file}`),
      fullPageEvidence: result.publicPageEvidence?.fullPage || null,
      tileEvidence: result.publicPageEvidence?.tiles || [],
      evidence: `cases/${result.name}.json`,
      evidenceSha256: result.caseEvidenceSha256,
      failureCodes: result.hardFailures.map((failure) => failure.code),
    })),
  }
  writeFileSync(join(outputDir, 'audit-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(outputDir, 'failures.json'), `${JSON.stringify(failures.map((result) => ({
    name: result.name,
    route: result.route,
    hardFailures: result.hardFailures,
  })), null, 2)}\n`)
  console.log(JSON.stringify({
    verdict: manifest.verdict,
    outputDir,
    manifest: join(outputDir, 'audit-manifest.json'),
    ...manifest.summary,
  }, null, 2))
  if (manifest.verdict !== 'PASS') process.exitCode = 1
} catch (error) {
  const incompleteReceipt = {
    schema: 'jianyuan-consultation-preview-visual-audit-incomplete/v1',
    startedAt,
    failedAt: new Date().toISOString(),
    baseOrigin,
    deploymentBinding: {
      expected: { gitSha: expectedGitSha, deploymentId: expectedDeploymentId, immutableUrl: baseOrigin },
      start: deploymentAtStart,
      end: null,
      unchanged: false,
    },
    expectedCases: auditCases.length,
    completedCases: results.length,
    completedCaseNames: results.map((result) => result.name),
    error: sanitizeDiagnosticText(error instanceof Error ? error.message : error),
    verdict: 'INCOMPLETE',
  }
  writeFileSync(join(outputDir, 'run-incomplete.json'), `${JSON.stringify(incompleteReceipt, null, 2)}\n`)
  console.error(JSON.stringify({
    verdict: 'INCOMPLETE',
    outputDir,
    completedCases: results.length,
    expectedCases: auditCases.length,
    error: incompleteReceipt.error,
  }, null, 2))
  process.exitCode = 1
} finally {
  cdp?.close()
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
    console.warn(`Chrome profile cleanup was deferred: ${error.message}`)
  }
}
