import { suite, test, assert, assertEqual, assertIncludes, done } from './harness.mjs'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

let freeze
let loadError
try {
  freeze = await import('../scripts/lib/e3-freeze-core.mjs')
} catch (error) {
  loadError = error
}

suite('E3 月度精選零變更契約')

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function testPng({ fill = 128, pixel = null, extraChunks = [] } = {}) {
  const width = 32
  const height = 32
  const scanlines = Buffer.alloc(height * ((width * 3) + 1))
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * ((width * 3) + 1)
    scanlines[rowOffset] = 0
    for (let x = 0; x < width; x += 1) {
      const target = rowOffset + 1 + (x * 3)
      for (let channel = 0; channel < 3; channel += 1) {
        scanlines[target + channel] = pixel ? pixel(x, y, channel, fill) : fill
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    ...extraChunks,
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function oversizedInflatedPng() {
  const width = 32
  const height = 32
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.alloc(64 * 1024))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function snapshotForPng(png, fields = {}) {
  const screenshotSha256 = createHash('sha256').update(png).digest('hex')
  return {
    schema: 'e3-surface/v3',
    ...fields,
    screenshotSha256,
    screenshotStability: { mode: 'fixed', cycleSha256: [screenshotSha256] },
    screenshotPerceptual: freeze.createE3PerceptualFingerprintFromPng(png),
  }
}

test('freeze core 可載入', () => {
  assert(freeze, `缺少 E3 freeze core: ${loadError?.message || 'unknown error'}`)
})

test('完全相同 snapshot 應通過', () => {
  const png = testPng()
  const snapshot = snapshotForPng(png, {
    surface: 'pricing-card',
    viewport: '390x844',
    text: '月度精選',
    dom: '<section id="plan-e3"><a href="/checkout?plan=E3">選擇月度精選</a></section>',
    aria: [{ role: 'link', name: '選擇月度精選' }],
    criticalStyles: { color: 'rgb(244, 239, 230)', display: 'block' },
    payloadSha256: 'payload123',
  })
  const result = freeze.compareE3Snapshots(snapshot, structuredClone(snapshot), {
    baselineScreenshotBuffer: png,
    candidateScreenshotBuffer: png,
  })
  assertEqual(result.ok, true)
  assertEqual(result.differences.length, 0)

  const wrongBytes = testPng({ fill: 12 })
  assertEqual(
    freeze.compareE3Snapshots(snapshot, structuredClone(snapshot), {
      baselineScreenshotBuffer: png,
      candidateScreenshotBuffer: wrongBytes,
    }).ok,
    false,
    'metadata 完全相同也必須先驗實際 PNG buffer binding',
  )
})

test('任何 E3 可見或行為差異都必須 HOLD', () => {
  const baselinePng = testPng({ fill: 100 })
  const candidatePng = testPng({ fill: 101 })
  const baseline = snapshotForPng(baselinePng, {
    surface: 'checkout',
    viewport: '1440x900',
    text: '月度精選',
    dom: '<form><button>確認</button></form>',
    aria: [{ role: 'button', name: '確認' }],
    criticalStyles: { color: 'rgb(1, 2, 3)' },
    payloadSha256: 'payload-before',
  })
  const candidate = {
    ...snapshotForPng(candidatePng, baseline),
    text: '每月精選',
    aria: [{ role: 'button', name: '立即確認' }],
    criticalStyles: { color: 'rgb(3, 2, 1)' },
    payloadSha256: 'payload-after',
  }
  const result = freeze.compareE3Snapshots(baseline, candidate, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: candidatePng,
  })
  assertEqual(result.ok, false)
  for (const expected of ['text', 'aria', 'criticalStyles', 'screenshotSha256', 'payloadSha256']) {
    assertIncludes(result.differences.map((item) => item.field), expected)
  }
})

test('固定畫面的次像素字緣差異可由感知指紋排除，但肉眼級差異仍 HOLD', () => {
  const baselinePng = testPng({ fill: 128 })
  const subpixelPng = testPng({
    fill: 128,
    pixel: (x, y, channel, fill) => (
      channel === 0 && ((x === 2 && y === 2) || (x === 17 && y === 11) || (x === 28 && y === 25))
        ? fill + 1
        : fill
    ),
  })
  const visiblePng = testPng({
    fill: 128,
    pixel: (x, y, _channel, fill) => (x < 4 && y < 4 ? fill + 40 : fill),
  })
  const baseline = snapshotForPng(baselinePng, {
    text: '月度精選',
    dom: '<article><h3>月度精選</h3></article>',
    aria: [{ role: 'heading', name: '月度精選' }],
    criticalStyles: [{ color: 'rgb(1, 2, 3)' }],
    renderTreeSha256: '1'.repeat(64),
  })
  const subpixelNoise = snapshotForPng(subpixelPng, baseline)
  const visibleChange = snapshotForPng(visiblePng, baseline)

  const tolerated = freeze.compareE3Snapshots(baseline, subpixelNoise, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: subpixelPng,
  })
  assertEqual(tolerated.ok, true)
  assert(tolerated.visualComparison.normalizedRmse > 0)
  assert(tolerated.visualComparison.normalizedRmse <= freeze.E3_PERCEPTUAL_RMSE_THRESHOLD)
  const releaseDifferences = freeze.finalizeE3ReleaseDifferences([], [{
    id: 'subpixel-diagnostic',
    visualComparison: tolerated.visualComparison,
  }])
  assertEqual(releaseDifferences.length, 1)
  assertEqual(releaseDifferences[0].id, 'pixel-bytes-not-identical')

  const blocked = freeze.compareE3Snapshots(baseline, visibleChange, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: visiblePng,
  })
  assertEqual(blocked.ok, false)
  assert(blocked.visualComparison.highDeltaPixelCount > freeze.E3_PERCEPTUAL_HIGH_DELTA_PIXEL_LIMIT)
})

test('感知容差不得掩蓋語意差異、週期畫面或無效指紋', () => {
  const baselinePng = testPng({ fill: 64 })
  const candidatePng = testPng({
    fill: 64,
    pixel: (x, y, channel, fill) => (x === 8 && y === 8 && channel === 0 ? fill + 1 : fill),
  })
  const baseline = snapshotForPng(baselinePng, { text: '月度精選' })
  const candidate = snapshotForPng(candidatePng, baseline)
  const compare = (nextCandidate) => freeze.compareE3Snapshots(baseline, nextCandidate, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: candidatePng,
  })

  const semanticChange = structuredClone(candidate)
  semanticChange.text = '每月精選'
  assertEqual(compare(semanticChange).ok, false)

  const periodic = structuredClone(candidate)
  periodic.screenshotStability = {
    mode: 'periodic-2',
    cycleSha256: [candidate.screenshotSha256, '6'.repeat(64)],
  }
  assertEqual(compare(periodic).ok, false)

  const periodicWithExactBaselinePhase = structuredClone(candidate)
  periodicWithExactBaselinePhase.screenshotStability = {
    mode: 'periodic-2',
    cycleSha256: [candidate.screenshotSha256, baseline.screenshotSha256],
  }
  assertEqual(
    compare(periodicWithExactBaselinePhase).ok,
    false,
    '固定基準不得放行任何 periodic-2 候選',
  )

  const missing = structuredClone(candidate)
  delete missing.screenshotPerceptual
  assertEqual(compare(missing).ok, false)

  const malformed = structuredClone(candidate)
  malformed.screenshotPerceptual.dataBase64 = 'not-base64'
  assertEqual(compare(malformed).ok, false)

  const invalidHash = structuredClone(candidate)
  invalidHash.screenshotSha256 = null
  invalidHash.screenshotStability = { mode: 'fixed', cycleSha256: [] }
  assertEqual(compare(invalidHash).ok, false)

  const forged = structuredClone(candidate)
  forged.screenshotPerceptual.dataBase64 = baseline.screenshotPerceptual.dataBase64
  assertEqual(compare(forged).ok, false)
  assertEqual(freeze.validateE3PerceptualFingerprint(forged.screenshotPerceptual, candidatePng).ok, false)

  const globalTintPng = testPng({ fill: 69 })
  const globalTint = snapshotForPng(globalTintPng, baseline)
  const globalTintResult = freeze.compareE3Snapshots(baseline, globalTint, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: globalTintPng,
  })
  assertEqual(globalTintResult.ok, false)
  assert(globalTintResult.visualComparison.maxNormalizedMeanShift > freeze.E3_PERCEPTUAL_MEAN_SHIFT_THRESHOLD)

  const thresholdCliffPng = testPng({
    fill: 64,
    pixel: (x, y, _channel, fill) => (x < 5 && y < 5 ? fill + 19 : fill),
  })
  const thresholdCliff = snapshotForPng(thresholdCliffPng, baseline)
  const thresholdCliffResult = freeze.compareE3Snapshots(baseline, thresholdCliff, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: thresholdCliffPng,
  })
  assertEqual(thresholdCliffResult.ok, false)
  assert(
    thresholdCliffResult.visualComparison.largestMidDeltaMinimumDimension
      > freeze.E3_PERCEPTUAL_MID_COMPONENT_MIN_DIMENSION_LIMIT,
  )

  const longThinLinePng = testPng({
    fill: 128,
    pixel: (x, y, channel, fill) => (y === 15 ? fill + 19 : fill),
  })
  const longThinLine = snapshotForPng(longThinLinePng, { text: 'same semantic content' })
  const longThinLineResult = freeze.compareE3Snapshots(baseline, longThinLine, {
    baselineScreenshotBuffer: baselinePng,
    candidateScreenshotBuffer: longThinLinePng,
  })
  assertEqual(longThinLineResult.ok, false, '全寬細線不應被 box-average 容差吞掉')
  assert(
    longThinLineResult.visualComparison.largestMidDeltaMaximumDimension
      > freeze.E3_PERCEPTUAL_MID_COMPONENT_LONG_DIMENSION_LIMIT,
  )

  const transparentColorKey = Buffer.alloc(6)
  transparentColorKey.writeUInt16BE(64, 0)
  transparentColorKey.writeUInt16BE(64, 2)
  transparentColorKey.writeUInt16BE(64, 4)
  const transparentPng = testPng({
    fill: 64,
    extraChunks: [pngChunk('tRNS', transparentColorKey)],
  })
  let transparencyRejected = false
  try {
    freeze.createE3PerceptualFingerprintFromPng(transparentPng)
  } catch {
    transparencyRejected = true
  }
  assertEqual(transparencyRejected, true, '未支援的 tRNS 色彩語意必須 fail closed')

  let oversizedInflateRejected = false
  try {
    freeze.createE3PerceptualFingerprintFromPng(oversizedInflatedPng())
  } catch {
    oversizedInflateRejected = true
  }
  assertEqual(oversizedInflateRejected, true, 'PNG inflate 超過 IHDR 預期長度必須 fail closed')

  const oversizedPngInput = Buffer.alloc((32 * 1024 * 1024) + 1)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedPngInput)
  let oversizedInputRejected = false
  try {
    freeze.createE3PerceptualFingerprintFromPng(oversizedPngInput)
  } catch {
    oversizedInputRejected = true
  }
  assertEqual(oversizedInputRejected, true, 'PNG compressed input 必須在解析/CRC 前有固定上限')
})

test('正規化只移除明確列入的 volatile 欄位', () => {
  const normalized = freeze.normalizeE3Snapshot({
    capturedAt: '2026-08-08T00:00:00Z',
    runId: 'random-run-id',
    text: '月度精選 2026 年 8 月',
    payloadSha256: 'stable-payload',
    telemetryRequests: [{ body: { capturedAt: 'business-time', runId: 'business-run' } }],
  })
  assertEqual('capturedAt' in normalized, false)
  assertEqual('runId' in normalized, false)
  assertEqual(normalized.text, '月度精選 2026 年 8 月')
  assertEqual(normalized.payloadSha256, 'stable-payload')
  assertEqual(normalized.telemetryRequests[0].body.capturedAt, 'business-time')
  assertEqual(normalized.telemetryRequests[0].body.runId, 'business-run')
})

test('首頁 E3 scope 必須鎖定月度精選方案卡本身', () => {
  const homeCases = freeze.getE3SurfaceCases().filter((item) => item.state === 'home-card')
  assert(homeCases.length > 0)
  assert(homeCases.every((item) => (
    item.selector === 'article.jy-card:has(h3:text-is("月度精選"))'
  )))
})

test('telemetry parity 只忽略 Vercel loader 與 Web Vitals 非決定量測值', () => {
  const funnelEvent = {
    endpoint: '/api/track/funnel',
    method: 'POST',
    query: {},
    body: { event: 'checkout_view', plan: 'E3' },
  }
  const baseline = {
    telemetryRequests: [
      {
        endpoint: '/_vercel/insights/script.js',
        method: 'GET',
        query: {},
        body: null,
      },
      {
        endpoint: '/_vercel/speed-insights/script.js',
        method: 'GET',
        query: {},
        body: null,
      },
      {
        endpoint: '/api/web-vitals',
        method: 'POST',
        query: {},
        body: {
          id: 'v4-random-before',
          value: 912,
          delta: 912,
          name: 'LCP',
          navigationType: 'navigate',
          page: '/checkout?plan=E3',
          rating: 'good',
          ts: 1786248000000,
        },
      },
      funnelEvent,
    ],
  }
  const candidate = {
    telemetryRequests: [
      {
        endpoint: '/api/web-vitals',
        method: 'POST',
        query: {},
        body: {
          id: 'v4-random-after',
          value: 1088,
          delta: 176,
          name: 'LCP',
          navigationType: 'navigate',
          page: '/checkout?plan=E3',
          rating: 'good',
          ts: 1786248000000,
        },
      },
      structuredClone(funnelEvent),
    ],
  }

  assertEqual(freeze.compareE3Snapshots(baseline, candidate).ok, true)

  const changedMetric = structuredClone(candidate)
  changedMetric.telemetryRequests[0].body.name = 'CLS'
  assertEqual(freeze.compareE3Snapshots(baseline, changedMetric).ok, false)

  const changedDerivedRating = structuredClone(candidate)
  changedDerivedRating.telemetryRequests[0].body.rating = 'needs-improvement'
  assertEqual(freeze.compareE3Snapshots(baseline, changedDerivedRating).ok, true)

  const changedE3Event = structuredClone(candidate)
  changedE3Event.telemetryRequests[1].body.plan = 'C'
  assertEqual(freeze.compareE3Snapshots(baseline, changedE3Event).ok, false)

  const orderedEvents = {
    state: 'checkout-confirmation',
    telemetryRequests: [
      { endpoint: '/api/track/funnel', method: 'POST', query: {}, body: { event: 'checkout_view', plan: 'E3' } },
      { endpoint: '/api/track/funnel', method: 'POST', query: {}, body: { event: 'checkout_submit', plan: 'E3' } },
    ],
  }
  const reversedEvents = {
    ...orderedEvents,
    telemetryRequests: [...orderedEvents.telemetryRequests].reverse(),
  }
  assertEqual(freeze.compareE3Snapshots(orderedEvents, reversedEvents).ok, false)

  const webVitalsReordered = {
    state: 'checkout-confirmation',
    telemetryRequests: [
      { endpoint: '/api/web-vitals', method: 'POST', query: {}, body: { id: 'b', name: 'LCP', page: '/checkout', rating: 'poor', value: 9000, delta: 9000 } },
      { endpoint: '/api/web-vitals', method: 'POST', query: {}, body: { id: 'a', name: 'FCP', page: '/checkout', rating: 'good', value: 700, delta: 700 } },
      orderedEvents.telemetryRequests[0],
    ],
  }
  const webVitalsOtherOrder = {
    ...webVitalsReordered,
    telemetryRequests: [
      orderedEvents.telemetryRequests[0],
      { endpoint: '/api/web-vitals', method: 'POST', query: {}, body: { id: 'c', name: 'FCP', page: '/checkout', rating: 'needs-improvement', value: 2400, delta: 2400 } },
      { endpoint: '/api/web-vitals', method: 'POST', query: {}, body: { id: 'd', name: 'LCP', page: '/checkout', rating: 'good', value: 1800, delta: 1800 } },
    ],
  }
  assertEqual(freeze.compareE3Snapshots(webVitalsReordered, webVitalsOtherOrder).ok, true)
})

test('首頁 hero A/B impression 不得污染 E3 telemetry parity', () => {
  const knownHomepageExperiment = {
    endpoint: '/api/ab-events',
    method: 'POST',
    query: {},
    body: {
      eventType: 'impression',
      experimentKey: 'hero_cta_20260417',
      variant: 'B',
      visitorId: 'synthetic-random-visitor',
    },
  }
  const e3Event = {
    endpoint: '/api/track/funnel',
    method: 'POST',
    query: {},
    body: { event: 'checkout_view', plan: 'E3' },
  }
  const baseline = { state: 'home-card', telemetryRequests: [knownHomepageExperiment, e3Event] }
  const candidate = { state: 'home-card', telemetryRequests: [structuredClone(e3Event)] }

  assertEqual(freeze.compareE3Snapshots(baseline, candidate).ok, true)

  const unknownExperiment = structuredClone(knownHomepageExperiment)
  unknownExperiment.body.experimentKey = 'e3_card_experiment'
  assertEqual(
    freeze.compareE3Snapshots({ state: 'home-card', telemetryRequests: [unknownExperiment, e3Event] }, candidate).ok,
    false,
  )

  const checkoutBaseline = {
    state: 'checkout-confirmation',
    telemetryRequests: [knownHomepageExperiment, e3Event],
  }
  const checkoutCandidate = {
    state: 'checkout-confirmation',
    telemetryRequests: [structuredClone(e3Event)],
  }
  assertEqual(freeze.compareE3Snapshots(checkoutBaseline, checkoutCandidate).ok, false)
})

test('protected files 覆蓋 E3 專屬 checkout、正式報告與方案 SSOT', () => {
  const files = freeze.getE3ProtectedFiles()
  for (const path of [
    'components/checkout/ThemePicker.tsx',
    'components/checkout/TimeBlockPicker.tsx',
    'hooks/useCheckoutForm.ts',
    'app/report/[token]/page.tsx',
    'lib/plan-names.ts',
  ]) {
    assertIncludes(files, path)
  }
})

test('protected manifest 完整覆蓋 E3 專屬語意與所有共享表面依賴', () => {
  const manifest = freeze.getE3ProtectedSurfaceManifest()
  const paths = manifest.map((item) => item.path)
  for (const path of [
    'app/page.tsx',
    'app/pricing/page.tsx',
    'app/dashboard/page.tsx',
    'app/layout.tsx',
    'components/RouteChrome.tsx',
    'public/scripts/devtools-warning.js',
    'components/Tracker.tsx',
    'app/api/track/route.ts',
    'app/api/track/funnel/route.ts',
    'app/api/error-report/route.ts',
    'app/api/web-vitals/route.ts',
    'components/ReferralCard.tsx',
    'app/api/referral/my-code/route.ts',
    'components/Navbar.tsx',
    'middleware.ts',
    'components/CookieConsent.tsx',
    'app/globals.css',
    'app/presentation.css',
    'app/dashboard/dashboard-presentation.css',
    'app/checkout/checkout-presentation.css',
    'app/checkout/page.tsx',
    'app/api/checkout/route.ts',
    'hooks/useCheckoutForm.ts',
    'components/checkout/SinglePersonForm.tsx',
    'components/checkout/BirthDataFields.tsx',
    'components/checkout/BirthTimeField.tsx',
    'components/PriceTag.tsx',
    'components/ReportFeedback.tsx',
    'components/checkout/CheckoutHeader.tsx',
    'components/PurchaseNoticeModal.tsx',
    'components/CalendarInviteButton.tsx',
    'lib/calendar-invite.ts',
    'lib/checkout/prepare-checkout-birth-data.ts',
    'lib/checkout/server-checkout-contract.ts',
    'lib/consultation/calculator-request.ts',
    'lib/consultation/routes.ts',
    'lib/consultation/runtime-config.ts',
    'lib/consultation/fallback-policy.ts',
    'lib/report/completion-fallback-email.ts',
    'app/api/cron/followup-email/route.ts',
    'app/api/cron/feedback-reminder/route.ts',
    'app/api/generate-report/route.ts',
    'workflows/generate-report/index.ts',
    'workflows/generate-report/steps.ts',
    'workflows/generate-report/plan-prompts.ts',
    'lib/plan-names.ts',
    '.gitattributes',
  ]) {
    assertIncludes(paths, path)
  }
  assert(manifest.some((item) => item.scope === 'e3-semantic'))
  assert(manifest.some((item) => item.scope === 'shared'))
  assertEqual(manifest.find((item) => item.path === 'next.config.ts')?.scope, 'shared')
  assert(manifest.every((item) => Array.isArray(item.coverage) && item.coverage.length > 0))
  assertIncludes(manifest.find((item) => item.path === 'app/api/generate-report/route.ts')?.coverage, 'generation-golden')
  assertIncludes(manifest.find((item) => item.path === 'components/RouteChrome.tsx')?.coverage, 'route-chrome-contract')
  assertEqual(manifest.find((item) => item.path === '.gitattributes')?.baseOptional, true)
  assertEqual(freeze.validateE3ProtectedSurfaceManifest(manifest).ok, true)
})

test('只允許精確且可重現的既有 devtools SRI 錯誤，其他 console error 一律阻擋', () => {
  const origin = 'http://127.0.0.1:59829'
  const computedSri = 'CgQEhTASt9ryyMtW4dSkaAX59L9z1Xs0yGXcjKeLE47VPcsu+fpI3RYtwb05er4j'
  const knownMessage = `Failed to find a valid digest in the 'integrity' attribute for resource '${origin}/scripts/devtools-warning.js' with computed SHA-384 integrity '${computedSri}'. The resource has been blocked.`
  const classified = freeze.classifyE3ConsoleErrors([knownMessage], {
    origin,
    devtoolsWarningSha384: computedSri,
  })

  assertEqual(classified.fatal.length, 0)
  assertEqual(classified.known.length, 1)
  assertEqual(classified.known[0].code, 'baseline.devtools_warning_sri_mismatch')
  assertEqual(classified.known[0].resource, '/scripts/devtools-warning.js')
  assertEqual(classified.known[0].computedSha384, computedSri)

  for (const message of [
    knownMessage.replace('/scripts/devtools-warning.js', '/scripts/other.js'),
    knownMessage.replace(computedSri, 'unexpected-digest'),
    'Uncaught TypeError: synthetic runtime failure',
  ]) {
    const rejected = freeze.classifyE3ConsoleErrors([message], {
      origin,
      devtoolsWarningSha384: computedSri,
    })
    assertEqual(rejected.known.length, 0)
    assertEqual(rejected.fatal.length, 1)
  }
})

test('共享 surface 漏列必須 fail closed', () => {
  const incomplete = freeze.getE3ProtectedSurfaceManifest()
    .filter((item) => item.path !== 'components/CookieConsent.tsx')
  const result = freeze.validateE3ProtectedSurfaceManifest(incomplete)
  assertEqual(result.ok, false)
  assertIncludes(result.missing, 'components/CookieConsent.tsx')
})

test('E3 專屬 source 差異立即阻擋；共享 source 差異必進瀏覽器 parity', () => {
  const manifest = freeze.getE3ProtectedSurfaceManifest()
  const baseline = Object.fromEntries(manifest.map((item) => [
    item.path,
    { algorithm: 'sha256-lf/v1', digest: 'a'.repeat(64), scope: item.scope },
  ]))
  const candidate = structuredClone(baseline)
  candidate['components/checkout/ThemePicker.tsx'].digest = 'b'.repeat(64)
  candidate['app/layout.tsx'].digest = 'c'.repeat(64)

  const result = freeze.classifyE3ProtectedSourceDifferences(
    baseline,
    candidate,
    manifest,
  )

  assertIncludes(result.blocking.map((item) => item.path), 'components/checkout/ThemePicker.tsx')
  assertIncludes(result.shared.map((item) => item.path), 'app/layout.tsx')
  assertIncludes(result.shared.find((item) => item.path === 'app/layout.tsx')?.coverage, 'route-chrome-contract')
  assertEqual(result.blocking.some((item) => item.path === 'app/layout.tsx'), false)
  assertEqual(result.shared.some((item) => item.path === 'components/checkout/ThemePicker.tsx'), false)
})

test('manifest 未知的 source 差異不得被共享白名單吞掉', () => {
  const result = freeze.classifyE3ProtectedSourceDifferences(
    { 'unexpected.ts': { digest: 'a' } },
    { 'unexpected.ts': { digest: 'b' } },
    freeze.getE3ProtectedSurfaceManifest(),
  )

  assertEqual(result.blocking.length, 1)
  assertEqual(result.blocking[0].scope, 'unknown')
})

test('record 只接受乾淨 origin/main 且 HEAD 必須等於解析後 base commit', () => {
  const valid = {
    baseRef: 'origin/main',
    baseCommit: 'a'.repeat(40),
    head: 'a'.repeat(40),
    clean: true,
  }
  assertEqual(freeze.validateE3RecordGitContext(valid).ok, true)
  assertEqual(freeze.validateE3RecordGitContext({ ...valid, clean: false }).ok, false)
  assertEqual(freeze.validateE3RecordGitContext({ ...valid, head: 'b'.repeat(40) }).ok, false)
  assertEqual(freeze.validateE3RecordGitContext({ ...valid, baseRef: 'HEAD' }).ok, false)
})

test('沒有 runner ownership 的直接 --record 必須在瀏覽器前失敗且不改舊 baseline', () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const baselinePath = join(projectRoot, '__tests__', 'fixtures', 'e3-freeze', 'baseline.json')
  const before = createHash('sha256').update(readFileSync(baselinePath)).digest('hex')
  const result = spawnSync(process.execPath, [
    join(projectRoot, 'scripts', 'e3-freeze-audit.mjs'),
    '--record',
    `--source-root=${projectRoot}`,
    `--runtime-root=${tmpdir()}`,
    `--baseline-root=${join(tmpdir(), 'e3-freeze-record-rejected')}`,
    '--release-session-id=11111111-1111-4111-8111-111111111111',
    '--base-ref=origin/main',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  const after = createHash('sha256').update(readFileSync(baselinePath)).digest('hex')
  assert(result.status !== 0, '未持有 runner ownership 竟可重錄 baseline')
  assert(/runner ownership|runner-owned/.test(`${result.stdout}\n${result.stderr}`))
  assertEqual(after, before, 'record preflight 失敗卻改動既有 baseline')
})

test('baseline provenance 缺 tool、Node、browser、font 或 OS 任一項必失敗', () => {
  const complete = {
    schema: 'e3-freeze-provenance/v2',
    git: {
      baseRef: 'origin/main',
      baseCommit: 'a'.repeat(40),
      head: 'a'.repeat(40),
      clean: true,
    },
    runtimeGit: {
      baseRef: 'origin/main',
      baseCommit: 'a'.repeat(40),
      head: 'a'.repeat(40),
      clean: true,
    },
    tool: {
      name: 'e3-freeze-audit',
      version: '5',
      scriptSha256: '1'.repeat(64),
      releaseRunnerSha256: '8'.repeat(64),
      coreSha256: '2'.repeat(64),
      fixtureServerSha256: '3'.repeat(64),
      cspCoreSha256: '7'.repeat(64),
      fixtureSha256: '4'.repeat(64),
      preloadSha256: '5'.repeat(64),
    },
    node: { version: 'v24.0.0' },
    browser: {
      engine: 'chromium',
      version: '126.0.0.0',
      userAgent: 'frozen-agent',
      cspMode: 'bypassed-production-parity',
      toolchain: {
        playwrightVersion: '1.0.0',
        playwright: { sha256: '9'.repeat(64) },
        playwrightCore: { sha256: 'a'.repeat(64) },
        browserExecutable: { sha256: 'b'.repeat(64), size: 12345 },
      },
    },
    runtime: {
      mode: 'production-next-build-start',
      bundler: 'webpack',
      nextVersion: '16.2.6',
      buildId: 'synthetic-production-build-id',
      environmentContractSha256: '6'.repeat(64),
      sourceSeparated: true,
    },
    fonts: {
      fingerprintSha256: '3'.repeat(64),
      families: ['Noto Sans TC'],
      records: freeze.getE3SurfaceCases().map((item) => ({
        caseId: item.id,
        computedFamilies: ['Noto Sans TC'],
        families: ['Noto Sans TC'],
        availability: [{ family: 'Noto Sans TC', available: true }],
      })),
    },
    os: { platform: 'win32', release: '10.0.0', arch: 'x64' },
  }
  assertEqual(freeze.validateE3BaselineProvenance(complete).ok, true)
  for (const key of ['tool', 'node', 'browser', 'runtime', 'fonts', 'os']) {
    const missing = structuredClone(complete)
    delete missing[key]
    assertEqual(freeze.validateE3BaselineProvenance(missing).ok, false, `${key} 缺失卻未 fail closed`)
  }
  const wrongCspMode = structuredClone(complete)
  wrongCspMode.browser.cspMode = 'unverified'
  assertEqual(freeze.validateE3BaselineProvenance(wrongCspMode).ok, false)
  const devMode = structuredClone(complete)
  devMode.browser.cspMode = 'bypassed-dev-parity'
  assertEqual(freeze.validateE3BaselineProvenance(devMode).ok, false)
  const missingBuildId = structuredClone(complete)
  delete missingBuildId.runtime.buildId
  assertEqual(freeze.validateE3BaselineProvenance(missingBuildId).ok, false)
  const oldSchema = structuredClone(complete)
  oldSchema.schema = 'e3-freeze-provenance/v1'
  assertEqual(freeze.validateE3BaselineProvenance(oldSchema).ok, false)
  const missingFontCase = structuredClone(complete)
  missingFontCase.fonts.records.pop()
  assertEqual(freeze.validateE3BaselineProvenance(missingFontCase).ok, false)
})

test('source hash 正規化 CRLF 與 LF，避免純換行差異誤報', () => {
  assertEqual(
    freeze.hashCanonicalSourceContent('const value = 1\r\nexport { value }\r\n'),
    freeze.hashCanonicalSourceContent('const value = 1\nexport { value }\n'),
  )
})

test('baseline trust 必須錨定本次解析的 origin/main commit 與該 commit 來源雜湊', () => {
  const protectedSourceSha256 = {
    'app/page.tsx': {
      algorithm: 'sha256-lf/v1',
      digest: '1'.repeat(64),
      present: true,
      scope: 'shared',
      surfaces: ['home'],
    },
  }
  const document = {
    provenance: {
      git: { baseCommit: 'a'.repeat(40) },
      runtimeGit: { baseCommit: 'a'.repeat(40) },
    },
    protectedSourceSha256,
  }
  const trust = { baseCommit: 'a'.repeat(40), protectedSourceSha256 }
  assertEqual(freeze.validateE3BaselineTrust(document, trust).ok, true)
  assertEqual(
    freeze.validateE3BaselineTrust(document, { ...trust, baseCommit: 'f'.repeat(40) }).ok,
    false,
  )
  assertEqual(
    freeze.validateE3BaselineTrust(document, {
      ...trust,
      protectedSourceSha256: {
        ...protectedSourceSha256,
        'app/page.tsx': { ...protectedSourceSha256['app/page.tsx'], digest: '2'.repeat(64) },
      },
    }).ok,
    false,
  )
  assertEqual(freeze.validateE3BaselineTrust(document, null).ok, false)
})

test('baseline corpus hash 必須同時綁定 JSON 語意與每一張 PNG bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'e3-corpus-hash-'))
  try {
    const screenshots = join(root, 'screenshots')
    mkdirSync(screenshots)
    const firstPng = testPng({ fill: 120 })
    const secondPng = testPng({ fill: 121 })
    writeFileSync(join(screenshots, 'home-card.png'), firstPng)
    const document = {
      schema: 'test-corpus/v1',
      snapshots: [{ id: 'home-card', screenshot: 'home-card.png', text: '原始內容' }],
    }
    const original = freeze.computeE3BaselineCorpusSha256(document, screenshots)
    const semanticMutation = freeze.computeE3BaselineCorpusSha256({
      ...document,
      snapshots: [{ ...document.snapshots[0], text: '被竄改的內容' }],
    }, screenshots)
    assert(original !== semanticMutation, 'JSON 語意被改動卻沒有改變 corpus hash')
    writeFileSync(join(screenshots, 'home-card.png'), secondPng)
    const imageMutation = freeze.computeE3BaselineCorpusSha256(document, screenshots)
    assert(original !== imageMutation, 'PNG bytes 被改動卻沒有改變 corpus hash')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('release runner 是唯一完整入口且候選未 commit 時必須 fail closed', () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const runnerPath = join(projectRoot, 'scripts', 'e3-freeze-release-audit.mjs')
  const runner = readFileSync(runnerPath, 'utf8')
  for (const required of [
    '--base-source-root',
    '--base-runtime-root',
    '--candidate-root',
    '--evidence-dir',
    '--trusted-base-commit',
    '--trusted-verifier-root',
    '--trusted-verifier-manifest',
    '--trusted-verifier-manifest-sha256',
    '--candidate-output-dir',
    '--trusted-baseline-corpus-sha256',
    'computeE3BaselineCorpusSha256',
    'comparisonReceiptSha256',
    "status', '--porcelain=v1', '--untracked-files=all",
    'assertOwnedStagingDirectory',
    'durableCandidateCorpusSha256',
    'runPinnedE3Checks',
    'runTrustedCspSmoke',
    'assertSharedCoverage',
    'assertNoReparsePoints',
    'finalization-receipt.json',
  ]) assert(runner.includes(required), `release runner 缺少信任鏈：${required}`)
  assert(!runner.includes('rmSync(verifyResult.candidateDir'), 'runner 不得刪除 child stdout 指定的路徑')
  assert(!runner.includes('env: process.env'), 'runner 不得把完整主機環境傳入 candidate audit')
  assert(runner.includes('validateTrustedVerifierBundle'), 'runner 必須由 repo 外 hash manifest 錨定完整 verifier bundle')
  assert(runner.includes('installPinnedDependencies'), 'base/candidate runtime 必須各自從 lockfile 安裝依賴')
  assert(!runner.includes("symlinkSync(dependencySource"), 'release 不得借用 candidate ignored node_modules')

  const missingArguments = spawnSync(process.execPath, [runnerPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert(missingArguments.status !== 0, 'release runner 缺參數卻錯誤放行')
  assert(/base-source-root/.test(missingArguments.stderr), 'release runner 缺參數未清楚 fail closed')
})

test('新 baseline 驗證失敗時不得破壞原 baseline 或 screenshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'e3-freeze-atomic-'))
  try {
    const baselinePath = join(root, 'baseline.json')
    const screenshotDir = join(root, 'screenshots')
    const candidateBaselinePath = join(root, 'candidate.json')
    const candidateScreenshotDir = join(root, 'candidate-screenshots')
    mkdirSync(screenshotDir)
    mkdirSync(candidateScreenshotDir)
    writeFileSync(baselinePath, 'ORIGINAL BASELINE', 'utf8')
    writeFileSync(join(screenshotDir, 'old.png'), 'ORIGINAL SCREENSHOT', 'utf8')
    writeFileSync(candidateBaselinePath, JSON.stringify({ snapshots: [{ screenshot: 'missing.png', screenshotSha256: '0'.repeat(64) }] }), 'utf8')

    let failed = false
    try {
      freeze.replaceE3BaselineBundleAtomically({
        baselinePath,
        screenshotDir,
        candidateBaselinePath,
        candidateScreenshotDir,
      })
    } catch {
      failed = true
    }
    assertEqual(failed, true)
    assertEqual(readFileSync(baselinePath, 'utf8'), 'ORIGINAL BASELINE')
    assertEqual(readFileSync(join(screenshotDir, 'old.png'), 'utf8'), 'ORIGINAL SCREENSHOT')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runtime manifest 完整覆蓋五個 E3 表面、十個狀態、四種 viewport 與雙主題', () => {
  const cases = freeze.getE3SurfaceCases()
  const expectedStates = [
    'home-card',
    'pricing-card',
    'checkout-initial',
    'checkout-selected',
    'checkout-confirmation',
    'dashboard-pending',
    'dashboard-completed',
    'dashboard-failed',
    'report-shell',
    'report-timings',
  ]

  assertEqual(cases.length, expectedStates.length * 4 * 2)
  assertEqual(new Set(cases.map((item) => item.id)).size, cases.length)
  assertEqual(
    JSON.stringify([...new Set(cases.map((item) => item.state))].sort()),
    JSON.stringify([...expectedStates].sort()),
  )
  assertEqual(
    JSON.stringify([...new Set(cases.map((item) => item.viewport.width))].sort((a, b) => a - b)),
    JSON.stringify([390, 768, 1024, 1440]),
  )
  assertEqual(
    JSON.stringify([...new Set(cases.map((item) => item.theme))].sort()),
    JSON.stringify(['dark', 'light']),
  )

  const privateCases = cases.filter((item) => item.surface === 'dashboard' || item.surface === 'report')
  assert(privateCases.length > 0)
  assert(privateCases.every((item) => item.fixture === 'local-synthetic'))
})

test('canonical baseline 必須精確覆蓋完整 80 案，public-only 永遠不得取代基準', () => {
  assert(typeof freeze.validateE3BaselineCaseCoverage === 'function', '缺少 baseline case coverage validator')
  const allIds = freeze.getE3SurfaceCases().map((item) => item.id)
  const publicIds = freeze.getE3SurfaceCases()
    .filter((item) => item.surface === 'home' || item.surface === 'pricing')
    .map((item) => item.id)

  assertEqual(freeze.validateE3BaselineCaseCoverage(allIds, false).ok, true)
  assertEqual(freeze.validateE3BaselineCaseCoverage(publicIds, true).ok, false)
  assertEqual(freeze.validateE3BaselineCaseCoverage(allIds.slice(0, 1), false).ok, false)
  assertEqual(freeze.validateE3BaselineCaseCoverage([...allIds, allIds[0]], false).ok, false)
  assertEqual(freeze.validateE3BaselineCaseCoverage(publicIds, false).ok, false)
})

test('verify runtime 必須與被雜湊的 candidate source 是同一工作樹', () => {
  assert(typeof freeze.validateE3VerifyRoots === 'function', '缺少 verify runtime/source validator')
  assertEqual(freeze.validateE3VerifyRoots('D:/candidate', 'D:/candidate').ok, true)
  assertEqual(freeze.validateE3VerifyRoots('D:/candidate', 'D:/base-runtime').ok, false)
  assertEqual(freeze.validateE3VerifyRoots('D:/Candidate', 'd:/candidate').ok, true)
})

test('瀏覽器稽核固定幣別、歷史報告與 scope 內字型，避免非 E3 非同步競態誤報', () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const script = readFileSync(join(projectRoot, 'scripts', 'e3-freeze-audit.mjs'), 'utf8')
  assert(script.includes("localStorage.setItem('currency', 'USD')"), 'E3 價格幣別必須在 hydration 前固定')
  assert(script.includes("context.route('**/api/reports?email=*'"), '歷史報告 fixture 必須由稽核器直接固定')
  assert(script.includes('name: /快速填入歷史資料/'), 'checkout 截圖前必須等歷史資料完成渲染')
  assert(script.includes('captureFontRecord(page, scope)'), '字型 provenance 只能量測 E3 scope，不得被 C/G15 頁面內容污染')
  assert(script.includes('waitForStylesheetsAndScopedFonts(page, scope)'), '截圖前必須等待樣式表與 E3 scope 實際使用的字型')
  assert(script.includes("link[rel=\"stylesheet\"]"), '不能在外部字型樣式表尚未載入時誤判 document.fonts.ready')
  assert(script.includes('document.fonts.load'), '必須主動載入 scope 各字重，避免中文字型 FOIT 造成假像素差異')
  assert(script.includes('FONT_SETTLE_TIMEOUT_MS'), '外部字型載入必須有有界 timeout，不能讓 80 案卡死')
  assert(script.includes('Promise.race'), '字型 ready 與 load 都必須由 timeout 競速收斂')
  assert(script.includes('freezeFontText'), '套用固定截圖字型後必須用 scope 的實際文字再次預熱 glyph')
  assert(script.includes('16px "Microsoft JhengHei"'), '固定中文字型預熱必須與截圖 CSS 使用同一字型')
  assert(!script.includes('window.setInterval ='), '不得在 React hydration 前改寫全域 setInterval')
  assert(script.includes("a[href=\"/dashboard\"]"), '登入就緒必須鎖定桌面 dashboard 連結，不得被隱藏的手機副本混淆')
  assert(script.includes('timeout: 90_000'), '冷啟動 hydration 必須有明確且足夠的有界等待')
  assert(script.includes('waitForVisibleFromNode'), '固定頁面時鐘後的 hydration gate 必須由 Node 端輪詢，不可依賴被凍結的 browser timer')
  assert(script.includes('page.clock.setFixedTime'), '只固定 Date、保持 browser timer 真實前進，避免凍結或快轉破壞 React/Next hydration')
  assert(!script.includes('page.clock.install'), '不得凍結 browser timers，否則較大的 client tree 可能永遠無法 hydration')
  assert(!script.includes('page.clock.runFor'), '不得在 Next Router 初始化前快轉 timers')
  assert(script.includes('assertClientHydrated'), '所有 public/checkout/dashboard viewport 都必須實際證明 React event handler 已掛載')
  assert(script.includes('toggleHydrationSentinel'), 'SSR 按鈕早於 React handler 出現時必須重試真實狀態切換，不得把單次 click 當 hydration')
  assert(script.includes('pageErrors'), '瀏覽器 runtime error 必須進 fail-closed gate')
  assert(script.includes('consoleErrors'), '瀏覽器 console error 必須進 fail-closed gate')
  assert(script.includes('requestFailures'), '第一方 request failure 必須進 fail-closed gate')
  assert(script.includes('serverErrors'), '第一方 5xx 必須進 fail-closed gate')
  assert(script.includes("context.route('**/api/track**'"), 'E3 telemetry 必須由本機 fixture 攔截，不能被開發環境 CSRF 403 污染')
  assert(script.includes("context.route('**/api/track/funnel**'"), 'E3 funnel telemetry 必須攔截含子路徑的正式 endpoint')
  assert(script.includes('telemetryRequests'), 'E3 發出的 telemetry endpoint、method 與 payload 必須進逐案快照')
  assert(script.includes('E3 telemetry 狀態在截圖期間改變'), '截圖後新增或遺失 telemetry 必須 fail closed')
  assert(script.includes('exerciseE3PricingNotice'), 'pricing 每個 viewport/theme 都必須實際開啟、同意並關閉 E3 購買須知')
  assert(script.includes('assertE3CalendarLinks'), 'E3 八個 Google Calendar 連結必須逐一驗證可用與安全屬性')
  assert(script.includes("cspMode: 'bypassed-production-parity'"), 'production parity 繞過 CSP 必須明確留在 provenance，不得冒充 CSP 驗證')
  assert(script.includes("[nextCli, 'build', '--webpack']"), 'E3 parity 必須使用官方 production webpack build，支援隔離 worktree 的依賴 junction')
  assert(script.includes("[nextCli, 'start'"), 'E3 parity 必須使用 production next start')
  assert(!script.includes("[nextCli, 'dev'"), 'E3 parity 不得再使用 next dev')
  assert(!script.includes("[nextCli, 'dev', '--webpack'"), 'E3 parity 不得依賴 dev webpack/HMR')
  assert(script.includes('cwd: runtimeRoot'), 'build 與 start 必須只在 sacrificial runtimeRoot 執行')
  assert(script.includes('clearRuntimeBuildOutput(runtimeRoot)'), 'build 前只能清除 runtimeRoot 的 .next')
  assert(script.includes("resolve(root, '.next')"), 'build output 必須由已驗證的 runtimeRoot 解析')
  assert(!script.includes("join(sourceRoot, '.next')"), 'immutable sourceRoot 不得被 build 清理或寫入')
  assert(script.includes('captureRuntimeFileState'), 'build 前必須保存 Next 可能改寫的 tracked generated files')
  assert(script.includes('restoreRuntimeFileState'), '關閉 production runtime 後必須逐 bytes 還原 generated files')
  assert(script.includes('protectedRuntimeSha256'), 'baseline 必須保存 runtime postflight protected hashes')
  assert(script.includes('preloadSha256'), 'production fixture preload 必須綁定 tool provenance')
  assert(script.includes('environmentContractSha256'), 'production runtime 環境契約必須有不可逆雜湊')
  assert(!script.includes('E3_CSP_SMOKE_FIXTURE_ORIGIN'), 'parity 不得冒用獨立 CSP smoke 的 fixture contract')
  assert(script.includes('fontRecord'), '每個 snapshot 必須綁定自己的產品 computed font record')
  assert(script.includes('startupAuditHashes'), '稽核器、core、fixture server 與 fixture 必須在啟動時綁定 bytes')
  assert(script.includes('postflightAuditHashes'), '稽核結束時必須重驗工具與 fixture bytes，封住自我修改 TOCTOU')
  assert(script.includes('postflightRuntimeHashes'), '分離的 record runtime 也必須在結束時重新雜湊')
  assert(script.includes("selectedCaseIds.size > 0 && key === 'fonts'"), '指定 case 的診斷不得拿局部字型集合和 80 案全量集合比較')
  assert(script.includes("context.route('**/auth/v1/user'"), '登入狀態必須用本機合成 Auth fixture 固定')
  assert(script.includes("context.route('**/api/feedback?report_id=*'"), '報告回饋讀取必須由本機 fixture 固定')
  assert(script.includes("context.route('**/api/referral/my-code**'"), '儀表板推薦碼必須使用合成 fixture，不得依賴真資料庫')
  assert(script.includes("name: '您的反饋對我們很重要'"), '報告截圖前必須等待回饋表單完成 hydration')
  assert(script.includes('captureSemanticSurface(scope)'), '截圖前後必須重抓同一份語意表面')
  assert(script.includes('captureBehavioralSurface(page, scope, auditCase)'), '動畫、hover、focus 與完整殼層必須在停用動畫前另做 exact parity')
  assert(script.includes("['no-preference', 'reduce']"), 'behavior parity 必須同時覆蓋一般與 reduced motion')
  assert(script.includes('resolveBrowserToolchain(runtimeRoot)'), 'Playwright 與 browser executable 必須在 candidate build 前後綁 hash')
  assert(script.includes('entry.name.toLowerCase()'), 'Windows env file 檢查必須不分大小寫')
  assert(script.includes('E3 surface 在語意快照與截圖間發生變動'), '語意與截圖不是同一狀態時必須 fail closed')
  assert(script.includes('postflightSourceHashes'), '80 案結束時必須重新雜湊來源以封住 TOCTOU')
  assert(script.includes('data-e3-freeze-screenshot-scope'), '像素比對必須使用固定本機中文字型且不可改寫語意快照')
  assert(script.includes("animations: 'disabled'"), 'Playwright 截圖必須直接停用動畫，不得只依賴 CSS 注入')
  assert(script.includes('createE3PerceptualFingerprintFromPng'), '感知指紋必須由實際 PNG bytes 的固定演算法產生')
  assert(script.includes('getProtectedCommitHashes'), 'baseline 來源雜湊必須從可信 base commit 重算')
  assert(script.includes('toleratedVisualDifferences'), '容差放行必須保留明確收據，不得偽裝成逐位元相同')
  assert(script.includes("pseudoSnapshot(element, '::before')"), '偽元素必須納入 render tree，避免視覺變更繞過語意比對')
  assert(script.includes('assertRunnerOwnedBaselineRoot'), 'baseline root 必須由 release runner 持有')
  assert(script.includes("new Set(['.env', '.env.local', '.env.production', '.env.production.local'])"), '必須拒絕 Next production 會載入的 env files')
  assert(!script.includes('...process.env,'), 'audit 不得把完整主機環境傳入候選 build/start')
  assert(script.includes("E3_FREEZE_FIXTURE_ORIGIN = 'http://127.0.0.1:{ephemeral-port}'"), 'ephemeral fixture port 必須先正規化再雜湊')
  assert(script.includes('prepareIntegerAlignedRaster'), 'E3 scope 截圖必須先對齊整數 CSS pixel')
})

test('動畫 parity 必須綁定 CSSOM keyframes 規則內容，不可只量 animation metadata', () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const script = readFileSync(join(projectRoot, 'scripts', 'e3-freeze-audit.mjs'), 'utf8')
  assert(script.includes('CSSRule.KEYFRAMES_RULE'), '必須從實際 CSSOM 讀取 @keyframes')
  assert(script.includes('keyframesSha256'), '正規化後的 keyframes rules 必須綁定 SHA-256')
  assert(script.includes('cssText.replace(/\\s+/g'), 'keyframe rule 必須用內容正規化，不能只存名稱')
  assert(script.includes('rulePath'), '同名 keyframes 的 cascade 位置必須綁定，不得只比排序後的集合')
  assert(!script.includes('rules.sort((left, right)'), '排序 keyframes 會吞掉同名規則的 cascade 順序差異')
  assert(script.includes('CSSOM keyframes 存在無法讀取的 stylesheet'), '任一 stylesheet CSSOM 不可讀時必須 fail closed')

  const png = testPng({ fill: 92 })
  const baseline = snapshotForPng(png, {
    behavior: { keyframesSha256: '1'.repeat(64), modes: [{ reducedMotion: 'no-preference' }] },
  })
  const candidate = structuredClone(baseline)
  candidate.behavior.keyframesSha256 = '2'.repeat(64)
  const result = freeze.compareE3Snapshots(baseline, candidate, {
    baselineScreenshotBuffer: png,
    candidateScreenshotBuffer: png,
  })
  assertEqual(result.ok, false)
  assert(result.differences.some((item) => item.field === 'behavior'))
})

test('snapshot 必須綁定 scope x/y、viewport/full-shell 與 Navbar/Footer/main 子互動', () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const script = readFileSync(join(projectRoot, 'scripts', 'e3-freeze-audit.mjs'), 'utf8')
  for (const required of [
    'scopeBox',
    'x: round(rect.x)',
    'y: round(rect.y)',
    'viewportContract',
    'fullShellSha256',
    "['scope', scope]",
    "['navbar', page.locator('.jy-navbar').first()]",
    "['footer', page.locator('.jy-footer').first()]",
    "['main', page.locator('main').first()]",
  ]) assert(script.includes(required), `snapshot/behavior contract 缺少 ${required}`)

  const png = testPng({ fill: 93 })
  const baseline = snapshotForPng(png, {
    scopeBox: { x: 10, y: 20, width: 300, height: 400 },
    viewportContract: { width: 390, height: 844, scrollX: 0, scrollY: 100 },
    fullShellSha256: '3'.repeat(64),
    behavior: {
      modes: [{
        reducedMotion: 'reduce',
        interactionContract: [{ region: 'navbar', present: true, controls: [{ name: '定價' }] }],
      }],
    },
  })

  for (const mutate of [
    (snapshot) => { snapshot.scopeBox.x += 1 },
    (snapshot) => { snapshot.viewportContract.height += 1 },
    (snapshot) => { snapshot.fullShellSha256 = '4'.repeat(64) },
    (snapshot) => { snapshot.behavior.modes[0].interactionContract[0].controls[0].name = '首頁' },
  ]) {
    const candidate = structuredClone(baseline)
    mutate(candidate)
    assertEqual(freeze.compareE3Snapshots(baseline, candidate, {
      baselineScreenshotBuffer: png,
      candidateScreenshotBuffer: png,
    }).ok, false)
  }
})

test('E3 runtime fixture 完全合成且鎖定八個吉時與 checkout payload', () => {
  const fixturePath = new URL('./fixtures/e3-freeze/runtime-fixtures.json', import.meta.url)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const serialized = JSON.stringify(fixture)

  assertEqual(fixture.schema, 'e3-fixtures/v1')
  assert(fixture.auth.user.email.endsWith('.invalid'))
  assertEqual(fixture.report.plan_code, 'E3')
  assertEqual(fixture.report.access_token, 'e3Freeze_20260809_SyntheticToken_A1b2C3')
  assertEqual(fixture.referral.code, 'E3FREEZE')
  assertEqual(fixture.referral.totalReferrals, 0)
  assertEqual(fixture.report.report_result.top5_timings.length, 8)
  for (const week of [1, 2, 3, 4]) {
    assertEqual(fixture.report.report_result.top5_timings.filter((item) => item.week === week).length, 2)
  }
  assertEqual(
    JSON.stringify(Object.keys(fixture.dashboard).sort()),
    JSON.stringify(['completed', 'failed', 'pending']),
  )
  assertEqual(fixture.checkout.expectedPayload.birthData.available_time_slots.length, 3)
  assertEqual(
    JSON.stringify(fixture.checkout.expectedPayload.birthData.topics),
    JSON.stringify(['career', 'wealth', 'family']),
  )
  assertEqual(
    JSON.stringify(fixture.checkout.expectedPayload.birthData.topic_rank),
    JSON.stringify({ career: 1, wealth: 2, family: 3 }),
  )
  assert(!/(何宣逸|何紀萳|何宥諄|@gmail\.|@jianyuan\.life)/.test(serialized), 'fixture 不得混入真實姓名或正式網域信箱')
})

test('release runner 必須真正執行並 hash 錨定 E3 generation、CSP 與關鍵契約', () => {
  const runner = readFileSync(new URL('../scripts/e3-freeze-release-audit.mjs', import.meta.url), 'utf8')
  for (const required of [
    '35-e3-freeze-contract.test.mjs',
    '36-e3-fixture-server.test.mjs',
    '49-calculator-request.test.mjs',
    '66-e3-production-csp-smoke-contract.test.mjs',
    '66-e3-server-checkout-contract.test.mjs',
    '67-e3-checkout-route-integration.test.mjs',
    '68-e3-generation-golden-contract.test.mjs',
  ]) {
    assert(runner.includes(required), `release runner 未要求 ${required}`)
  }
  assert(runner.includes('PINNED_E3_CHECKS'))
  assert(runner.includes('runPinnedE3Checks'))
  assert(runner.includes('runTrustedCspSmoke'))
})

done()
