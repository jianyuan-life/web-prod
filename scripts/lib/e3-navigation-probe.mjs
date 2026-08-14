const PROBE_SCHEMA = 'e3-navigation-probe/v2'
const DEFAULT_TIMEOUT_MS = 2_000
const ACTIONABILITY_TIMEOUT_MS = 5_000
const ROUTE_PATTERN = '**/*'
const CONTROLLER = Symbol('e3-navigation-controller')
const PROTECTED_PATH_PATTERN = /(?:^|\/)(?:checkout|account)(?:\/|$)/iu
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const EXTERNAL_HANDLER_PROTOCOLS = new Set(['mailto:', 'tel:'])
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const MAX_PATH_DECODE_PASSES = 16

let observerSequence = 0

function decodePathnameForPolicy(pathname) {
  let decoded = pathname || '/'
  for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) return { pathname: decoded || '/', valid: true }
      decoded = next
    } catch {
      return { pathname: '/[invalid-path-encoding]', valid: false }
    }
  }
  return { pathname: '/[excessive-path-encoding]', valid: false }
}

function parseHttpDestination(value) {
  const parsed = new URL(value)
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError('E3 navigation destination 必須是 HTTP(S)')
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('E3 navigation destination 不可包含 userinfo')
  }
  const decodedPath = decodePathnameForPolicy(parsed.pathname)
  return { parsed, decodedPath }
}

export function normalizeE3NavigationDestination(value) {
  const { parsed, decodedPath } = parseHttpDestination(value)
  return {
    origin: parsed.origin,
    pathname: decodedPath.pathname,
    url: `${parsed.origin}${decodedPath.pathname}`,
    queryKeys: [...new Set(parsed.searchParams.keys())].sort(),
  }
}

function normalizedOrigins(values) {
  return new Set(values.map((value) => parseHttpDestination(value).parsed.origin))
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function classifyE3NavigationRequest({
  url,
  method = 'GET',
  allowedOrigins = [],
  armed = true,
  topNavigation = false,
}) {
  const { parsed, decodedPath } = parseHttpDestination(url)
  const destination = normalizeE3NavigationDestination(url)
  const normalizedMethod = String(method).toUpperCase()
  const allowed = normalizedOrigins(allowedOrigins)
  let reason = ''
  if (armed && !decodedPath.valid) reason = 'invalid-path-encoding'
  else if (armed && !allowed.has(parsed.origin)) reason = 'external-origin'
  else if (armed && PROTECTED_PATH_PATTERN.test(decodedPath.pathname)) reason = 'protected-path'
  else if (armed && !SAFE_METHODS.has(normalizedMethod)) reason = 'non-get'
  else if (armed && topNavigation) reason = 'top-navigation'
  return {
    blocked: reason !== '',
    reason,
    method: normalizedMethod,
    destination,
  }
}

export class E3NavigationProbeError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'E3NavigationProbeError'
    this.code = code
    this.details = details
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function createActivityBuffer() {
  let version = 0
  const waiters = new Set()
  return {
    get version() { return version },
    emit() {
      version += 1
      for (const resolve of waiters) resolve(true)
      waiters.clear()
    },
    waitForChange(sinceVersion, timeoutMs) {
      if (version !== sinceVersion) return Promise.resolve(true)
      return new Promise((resolve) => {
        let timer
        const finish = (changed) => {
          if (timer) clearTimeout(timer)
          waiters.delete(finish)
          resolve(changed)
        }
        waiters.add(finish)
        timer = setTimeout(() => finish(false), Math.max(0, timeoutMs))
      })
    },
    dispose() {
      for (const resolve of waiters) resolve(false)
      waiters.clear()
    },
  }
}

function isTopNavigationRequest(request) {
  if (!request.isNavigationRequest()) return false
  try {
    return request.frame().parentFrame() === null
  } catch {
    return false
  }
}

function internalComparableUrl(value) {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    parsed.hash = ''
    return parsed.href
  } catch {
    return ''
  }
}

function safeRequestRecord(request, reason, forceTopNavigation = false) {
  return {
    destination: normalizeE3NavigationDestination(request.url()),
    method: request.method().toUpperCase(),
    resourceType: request.resourceType(),
    topNavigation: forceTopNavigation || isTopNavigationRequest(request),
    reason,
  }
}

function assertPageOwnership(context, page) {
  if (!context || typeof context.route !== 'function' || typeof context.unroute !== 'function') {
    throw new TypeError('E3 navigation guard 需要既有 Playwright BrowserContext')
  }
  if (!page || typeof page.context !== 'function' || page.context() !== context) {
    throw new TypeError('E3 navigation guard 的 page 必須屬於指定 context')
  }
}

function assertSafeSource(page, allowedOrigins) {
  const rawSource = page.url()
  let parsed
  try {
    parsed = parseHttpDestination(rawSource).parsed
  } catch {
    throw new E3NavigationProbeError(
      'E3_NAVIGATION_SOURCE_NOT_ALLOWED',
      'E3 navigation observer 僅接受 loopback 或明確 allowlist 的 HTTP(S) source',
    )
  }
  if (!isLoopbackHostname(parsed.hostname) && !allowedOrigins.has(parsed.origin)) {
    throw new E3NavigationProbeError(
      'E3_NAVIGATION_SOURCE_NOT_ALLOWED',
      'E3 navigation observer 的 source 不在 allowlist',
      { source: normalizeE3NavigationDestination(rawSource) },
    )
  }
  return parsed
}

function requestPage(request) {
  try {
    return request.frame().page()
  } catch {
    return null
  }
}

export async function armE3NavigationGuard({
  context,
  page,
  allowedOrigins = [],
}) {
  assertPageOwnership(context, page)
  const allowed = normalizedOrigins(allowedOrigins)
  const source = assertSafeSource(page, allowed)
  allowed.add(source.origin)

  const ownedPages = new Set([page])
  let active = null
  let disposed = false

  const onPage = (openedPage) => {
    ownedPages.add(openedPage)
    openedPage.once('close', () => ownedPages.delete(openedPage))
    if (active) {
      active.popupPages.add(openedPage)
      active.activity.emit()
    }
  }

  const routeHandler = async (route) => {
    const current = active
    if (!current) {
      await route.fallback()
      return
    }

    const request = route.request()
    const topNavigation = isTopNavigationRequest(request)
    const pageForRequest = requestPage(request)
    const requestComparable = internalComparableUrl(request.url())
    const seededPopupRequest = Boolean(
      current.popupSeed
      && request.isNavigationRequest()
      && requestComparable
      && requestComparable === current.popupSeed,
    )
    if (!ownedPages.has(pageForRequest) && !seededPopupRequest) {
      await route.fallback()
      return
    }
    if (seededPopupRequest && pageForRequest) ownedPages.add(pageForRequest)

    let classification
    try {
      classification = classifyE3NavigationRequest({
        url: request.url(),
        method: request.method(),
        allowedOrigins: [...allowed],
        armed: true,
        topNavigation: topNavigation || seededPopupRequest,
      })
    } catch {
      current.intercepted.push({
        destination: null,
        method: request.method().toUpperCase(),
        resourceType: request.resourceType(),
        topNavigation: topNavigation || seededPopupRequest,
        reason: 'invalid-destination',
      })
      await route.abort('blockedbyclient')
      current.activity.emit()
      return
    }

    if (!classification.blocked) {
      await route.fallback()
      return
    }
    current.intercepted.push(
      safeRequestRecord(request, classification.reason, seededPopupRequest),
    )
    await route.abort('blockedbyclient')
    current.activity.emit()
  }

  context.on('page', onPage)
  try {
    await context.route(ROUTE_PATTERN, routeHandler)
  } catch (error) {
    context.off('page', onPage)
    throw error
  }

  const controller = {
    [CONTROLLER]: true,
    context,
    page,
    allowedOrigins: allowed,
    get disposed() { return disposed },
    begin(intent) {
      if (disposed) throw new E3NavigationProbeError('E3_NAVIGATION_GUARD_DISPOSED', 'guard 已解除')
      if (active) throw new E3NavigationProbeError('E3_NAVIGATION_GUARD_ALREADY_ACTIVE', 'guard 已在觀測另一個 click')
      const popupSeed = intent.target === '_blank' ? internalComparableUrl(intent.rawHref) : ''
      active = {
        intercepted: [],
        popupPages: new Set(),
        popupSeed,
        activity: createActivityBuffer(),
      }
      return active
    },
    end(record) {
      if (active === record) active = null
      record.activity.dispose()
    },
    async dispose() {
      if (disposed) return
      active = null
      disposed = true
      context.off('page', onPage)
      await context.unroute(ROUTE_PATTERN, routeHandler)
    },
  }
  return controller
}

async function readIntent(target) {
  return target.evaluate((element) => {
    const anchor = element instanceof HTMLAnchorElement ? element : element.closest('a')
    const rawHref = anchor?.href || ''
    let protocol = ''
    try { protocol = rawHref ? new URL(rawHref, window.location.href).protocol : '' } catch {}
    return {
      tag: element.tagName.toLowerCase(),
      rawHref,
      protocol,
      target: (anchor?.getAttribute('target') || '').toLowerCase(),
      rel: anchor?.getAttribute('rel') || '',
      download: anchor?.hasAttribute('download') || false,
    }
  })
}

async function prepareTrustedPointerClick(target) {
  const disabled = await target.isDisabled().catch(() => false)
  if (disabled) return { disabled: true }

  await target.click({ trial: true, timeout: ACTIONABILITY_TIMEOUT_MS })
  return { disabled: false }
}

function safeIntent(intent) {
  let destination = null
  if (intent.rawHref && ['http:', 'https:'].includes(intent.protocol)) {
    destination = normalizeE3NavigationDestination(intent.rawHref)
  }
  return {
    tag: intent.tag,
    destination,
    protocol: destination ? destination.origin.startsWith('https:') ? 'https:' : 'http:' : intent.protocol,
    target: intent.target,
    rel: intent.rel,
    download: intent.download,
  }
}

async function installSideEffectBlocker(target, mode) {
  if (!mode) return null
  observerSequence += 1
  const key = `__e3NavigationBlocker${observerSequence}`
  await target.evaluate((element, { key: blockerKey }) => {
    const handler = (event) => {
      if (!event.composedPath().includes(element)) return
      globalThis[blockerKey].triggered = true
      event.preventDefault()
    }
    globalThis[blockerKey] = {
      triggered: false,
      cleanup: () => {
        document.removeEventListener('click', handler, false)
        delete globalThis[blockerKey]
      },
    }
    document.addEventListener('click', handler, false)
  }, { key })
  return {
    async cleanup() {
      return target.evaluate((element, blockerKey) => {
        void element
        const state = globalThis[blockerKey]
        const triggered = Boolean(state?.triggered)
        state?.cleanup?.()
        return triggered
      }, key).catch(() => false)
    },
  }
}

async function installHistoryObserver(page) {
  observerSequence += 1
  const key = `__e3HistoryObserver${observerSequence}`
  await page.evaluate((observerKey) => {
    const events = []
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    const pushState = function (...args) {
      const result = Reflect.apply(originalPushState, this, args)
      events.push({ type: 'pushState', url: location.href })
      return result
    }
    const replaceState = function (...args) {
      const result = Reflect.apply(originalReplaceState, this, args)
      events.push({ type: 'replaceState', url: location.href })
      return result
    }
    const onPopState = () => events.push({ type: 'popstate', url: location.href })
    const onHashChange = () => events.push({ type: 'hashchange', url: location.href })
    history.pushState = pushState
    history.replaceState = replaceState
    addEventListener('popstate', onPopState)
    addEventListener('hashchange', onHashChange)
    globalThis[observerKey] = {
      events,
      cleanup: () => {
        if (history.pushState === pushState) history.pushState = originalPushState
        if (history.replaceState === replaceState) history.replaceState = originalReplaceState
        removeEventListener('popstate', onPopState)
        removeEventListener('hashchange', onHashChange)
        delete globalThis[observerKey]
      },
    }
  }, key)
  return {
    async read() {
      const raw = await page.evaluate((observerKey) => globalThis[observerKey]?.events || [], key).catch(() => [])
      return raw.map((event) => ({
        type: event.type,
        destination: normalizeE3NavigationDestination(event.url),
      }))
    },
    async cleanup() {
      await page.evaluate((observerKey) => globalThis[observerKey]?.cleanup?.(), key).catch(() => {})
    },
  }
}

async function installWindowOpenObserver(page) {
  observerSequence += 1
  const key = `__e3WindowOpenObserver${observerSequence}`
  await page.evaluate((observerKey) => {
    const calls = []
    const originalOpen = window.open
    const guardedOpen = function (url = '', target = '', features = '') {
      let absoluteUrl = ''
      try { absoluteUrl = new URL(String(url), location.href).href } catch {}
      calls.push({
        url: absoluteUrl,
        target: String(target || '').toLowerCase(),
        features: String(features || ''),
      })
      return null
    }
    window.open = guardedOpen
    globalThis[observerKey] = {
      calls,
      cleanup: () => {
        if (window.open === guardedOpen) window.open = originalOpen
        delete globalThis[observerKey]
      },
    }
  }, key)
  return {
    async read() {
      return page.evaluate((observerKey) => globalThis[observerKey]?.calls || [], key).catch(() => [])
    },
    async cleanup() {
      await page.evaluate((observerKey) => globalThis[observerKey]?.cleanup?.(), key).catch(() => {})
    },
  }
}

function safeWindowOpenRecord(call, allowedOrigins) {
  if (!call?.url) {
    return {
      destination: null,
      method: 'GET',
      resourceType: 'document',
      topNavigation: true,
      reason: 'invalid-destination',
      trigger: 'window.open',
    }
  }
  try {
    const classification = classifyE3NavigationRequest({
      url: call.url,
      method: 'GET',
      allowedOrigins,
      armed: true,
      topNavigation: true,
    })
    return {
      destination: classification.destination,
      method: 'GET',
      resourceType: 'document',
      topNavigation: true,
      reason: classification.reason || 'top-navigation',
      trigger: 'window.open',
    }
  } catch {
    return {
      destination: null,
      method: 'GET',
      resourceType: 'document',
      topNavigation: true,
      reason: 'invalid-destination',
      trigger: 'window.open',
    }
  }
}

function safePageDestination(page) {
  try {
    return normalizeE3NavigationDestination(page.url())
  } catch {
    return null
  }
}

function sameDocumentExceptHash(beforeUrl, afterUrl) {
  try {
    const before = new URL(beforeUrl)
    const after = new URL(afterUrl)
    return before.origin === after.origin
      && before.pathname === after.pathname
      && before.search === after.search
      && before.hash !== after.hash
  } catch {
    return false
  }
}

export async function observeE3NavigationOutcome({
  page,
  guard,
  locator,
  selector,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!guard?.[CONTROLLER] || guard.disposed) {
    throw new E3NavigationProbeError('E3_NAVIGATION_GUARD_REQUIRED', '必須提供仍有效的 E3 navigation guard')
  }
  if (page !== guard.page || page.context() !== guard.context) {
    throw new TypeError('observer page 必須與 guard page 相同')
  }
  const target = locator || (typeof selector === 'string' && selector.trim() ? page.locator(selector).first() : null)
  if (!target) throw new TypeError('observer 需要 locator 或非空 selector')
  if (await target.count() !== 1) {
    throw new E3NavigationProbeError('E3_NAVIGATION_TARGET_NOT_FOUND', '找不到唯一 navigation target')
  }

  await target.waitFor({ state: 'visible', timeout: ACTIONABILITY_TIMEOUT_MS })
  const intent = await readIntent(target)
  const preparedClick = await prepareTrustedPointerClick(target)
  const safeIntentRecord = safeIntent(intent)
  const sourceUrl = page.url()
  const source = normalizeE3NavigationDestination(sourceUrl)
  const externalHandler = EXTERNAL_HANDLER_PROTOCOLS.has(intent.protocol)
  const unsupportedScheme = Boolean(
    intent.rawHref
    && intent.protocol
    && !HTTP_PROTOCOLS.has(intent.protocol)
    && !externalHandler,
  )
  const blocker = await installSideEffectBlocker(
    target,
    externalHandler
      ? 'external-scheme'
      : unsupportedScheme
        ? 'unsupported-scheme'
      : intent.download
        ? 'download'
        : '',
  )
  const historyObserver = await installHistoryObserver(page)
  const windowOpenObserver = await installWindowOpenObserver(page)
  const active = guard.begin(intent)
  const failedLoads = []
  const observedPopups = new Set()
  let clickTimedOut = false

  const onPopup = (popup) => {
    observedPopups.add(popup)
    active.activity.emit()
  }
  const onRequestFailed = (request) => {
    if (!request.isNavigationRequest()) {
      failedLoads.push(safeRequestRecord(request, 'failed-load'))
      active.activity.emit()
      return
    }
    if (isTopNavigationRequest(request)) {
      failedLoads.push(safeRequestRecord(request, 'failed-load'))
      active.activity.emit()
    }
  }
  page.on('popup', onPopup)
  page.on('requestfailed', onRequestFailed)

  let historyEvents = []
  let windowOpenCalls = []
  try {
    try {
      await target.click({
        noWaitAfter: true,
        timeout: preparedClick.disabled ? timeoutMs : ACTIONABILITY_TIMEOUT_MS,
      })
    } catch (error) {
      clickTimedOut = error?.name === 'TimeoutError' || /timeout/iu.test(String(error?.message || ''))
      if (!clickTimedOut) {
        throw new E3NavigationProbeError(
          'E3_NAVIGATION_ACTIVATION_FAILED',
          'navigation target could not be activated by a trusted pointer click',
        )
      }
    }

    const deadline = Date.now() + timeoutMs
    let activityVersion = active.activity.version
    while (!clickTimedOut && Date.now() < deadline) {
      historyEvents = await historyObserver.read()
      windowOpenCalls = await windowOpenObserver.read()
      if (
        active.intercepted.length > 0
        || active.popupPages.size > 0
        || observedPopups.size > 0
        || failedLoads.length > 0
        || page.url() !== sourceUrl
        || historyEvents.length > 0
        || windowOpenCalls.length > 0
        || externalHandler
        || unsupportedScheme
        || intent.download
      ) break
      const remainingMs = Math.max(0, deadline - Date.now())
      await active.activity.waitForChange(activityVersion, Math.min(20, remainingMs))
      activityVersion = active.activity.version
    }
    await wait(20)
    historyEvents = await historyObserver.read()
    windowOpenCalls = await windowOpenObserver.read()
    active.intercepted.push(...windowOpenCalls.map((call) => (
      safeWindowOpenRecord(call, [...guard.allowedOrigins])
    )))

    const guardedTop = active.intercepted.find((record) => record.topNavigation)
    const guardedRequest = active.intercepted.find((record) => !record.topNavigation)
    const protectedOrExternalTop = guardedTop
      && ['protected-path', 'external-origin', 'invalid-path-encoding'].includes(guardedTop.reason)
    const afterUrl = page.url()
    let kind = 'inert'
    if (clickTimedOut) kind = 'timeout'
    else if (externalHandler) kind = 'external-scheme'
    else if (unsupportedScheme) kind = 'unsupported-scheme'
    else if (intent.download) kind = 'download'
    else if (
      guardedTop
      && (intent.target === '_blank' || guardedTop.trigger === 'window.open')
      && !protectedOrExternalTop
    ) kind = 'new-window'
    else if (guardedTop) kind = 'guarded-navigation'
    else if (guardedRequest) kind = 'guarded-request'
    else if (sameDocumentExceptHash(sourceUrl, afterUrl)) kind = 'hash'
    else if (historyEvents.some((event) => ['pushState', 'replaceState', 'popstate'].includes(event.type))) kind = 'history'
    else if (failedLoads.length > 0) kind = 'failed-load'
    else if (afterUrl !== sourceUrl) kind = 'document-navigation'
    else if (intent.target === '_blank' && (active.popupPages.size > 0 || observedPopups.size > 0)) kind = 'new-window'

    const primaryDestination = guardedTop?.destination
      || guardedRequest?.destination
      || historyEvents.at(-1)?.destination
      || (afterUrl !== sourceUrl ? safePageDestination(page) : safeIntentRecord.destination)

    return {
      schema: PROBE_SCHEMA,
      activation: 'real-click',
      source,
      intent: safeIntentRecord,
      outcome: {
        kind,
        destination: primaryDestination,
        historyEvents,
        popupObserved: active.popupPages.size > 0 || observedPopups.size > 0,
        windowOpenObserved: windowOpenCalls.length > 0,
        failedLoads,
      },
      guard: {
        intercepted: [...active.intercepted],
      },
    }
  } finally {
    guard.end(active)
    page.off('popup', onPopup)
    page.off('requestfailed', onRequestFailed)
    await blocker?.cleanup()
    await historyObserver.cleanup()
    await windowOpenObserver.cleanup()
    const popupPages = new Set([...active.popupPages, ...observedPopups])
    await Promise.all([...popupPages].map((popup) => popup.close().catch(() => {})))
  }
}
