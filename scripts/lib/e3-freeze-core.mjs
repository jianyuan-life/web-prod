import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { inflateSync } from 'node:zlib'

const WEB_VITALS_VOLATILE_FIELDS = new Set(['id', 'value', 'delta', 'rating'])
const NON_E3_VENDOR_LOADER_ENDPOINTS = new Set([
  '/_vercel/insights/script.js',
  '/_vercel/speed-insights/script.js',
])
const NON_E3_EXPERIMENT_KEYS = new Set(['hero_cta_20260417'])

const E3_PROTECTED_SURFACE_MANIFEST = Object.freeze([
  { path: 'package.json', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'production runtime 與依賴契約' },
  { path: 'package-lock.json', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'production dependency lockfile' },
  { path: 'components/checkout/ThemePicker.tsx', scope: 'e3-semantic', surfaces: ['checkout'], reason: 'E3 主題排序與選擇語意' },
  { path: 'components/checkout/TimeBlockPicker.tsx', scope: 'e3-semantic', surfaces: ['checkout'], reason: 'E3 可出行時段互動' },
  { path: 'components/checkout/ConfirmationModal.tsx', scope: 'e3-semantic', surfaces: ['checkout'], reason: 'E3 送出前確認內容與付款行為' },
  { path: 'components/checkout/types.ts', scope: 'e3-semantic', surfaces: ['checkout'], reason: 'E3 checkout 資料契約' },
  { path: 'app/page.tsx', scope: 'shared', surfaces: ['home'], reason: '首頁 E3 方案入口' },
  { path: 'app/pricing/page.tsx', scope: 'shared', surfaces: ['pricing'], reason: '定價頁 E3 方案卡' },
  { path: 'components/PricingCards.tsx', scope: 'shared', surfaces: ['home', 'pricing'], reason: '首頁與定價頁共用方案卡' },
  { path: 'components/PricingButton.tsx', scope: 'shared', surfaces: ['home', 'pricing'], reason: 'E3 購買入口共用按鈕' },
  { path: 'app/dashboard/page.tsx', scope: 'shared', surfaces: ['dashboard'], reason: 'E3 訂單狀態與報告入口' },
  { path: 'app/dashboard/dashboard-presentation.css', scope: 'shared', surfaces: ['dashboard'], reason: 'E3 dashboard 呈現樣式' },
  { path: 'app/report/[token]/page.tsx', scope: 'shared', surfaces: ['report'], reason: 'E3 報告閱讀與吉時卡' },
  { path: 'app/presentation.css', scope: 'shared', surfaces: ['report'], reason: 'E3 報告呈現樣式' },
  { path: 'app/checkout/page.tsx', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 路由與互動編排' },
  { path: 'app/checkout/checkout-presentation.css', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 呈現樣式' },
  { path: 'app/api/checkout/route.ts', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 伺服器端方案與 payload 驗證' },
  { path: 'hooks/useCheckoutForm.ts', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 共用狀態與 payload' },
  { path: 'components/checkout/SinglePersonForm.tsx', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 共用表單提交與驗證語意' },
  { path: 'components/checkout/BirthDataFields.tsx', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 共用出生資料欄位與城市選擇' },
  { path: 'components/checkout/BirthTimeField.tsx', scope: 'shared', surfaces: ['checkout'], reason: 'E3 checkout 共用出生時間精度選擇' },
  { path: 'components/checkout/CheckoutHeader.tsx', scope: 'e3-semantic', surfaces: ['checkout'], reason: 'E3 checkout 標題、步驟與方案摘要' },
  { path: 'components/PurchaseNoticeModal.tsx', scope: 'e3-semantic', surfaces: ['pricing'], reason: 'E3 定價頁購買須知與確認互動' },
  { path: 'components/CalendarInviteButton.tsx', scope: 'e3-semantic', surfaces: ['report'], reason: 'E3 吉時行事曆匯出互動' },
  { path: 'lib/calendar-invite.ts', scope: 'e3-semantic', surfaces: ['report'], reason: 'E3 行事曆資料與下載格式' },
  { path: 'lib/checkout/prepare-checkout-birth-data.ts', scope: 'shared', surfaces: ['checkout'], reason: 'C/G15 新 helper 必須維持 E3 原 birthData bypass', baseOptional: true },
  { path: 'lib/checkout/server-checkout-contract.ts', scope: 'shared', surfaces: ['checkout'], reason: '共用 Stripe 與免費訂單分支必須維持 E3 原付款參數', baseOptional: true },
  { path: 'components/PriceTag.tsx', scope: 'shared', surfaces: ['home', 'pricing'], reason: 'E3 價格幣別與 hydration 呈現' },
  { path: 'components/ReportFeedback.tsx', scope: 'shared', surfaces: ['report'], reason: 'E3 報告完成後的非同步回饋表面' },
  { path: 'app/layout.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '全站殼層與共用 UI' },
  { path: 'components/RouteChrome.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '候選 route boundary 必須維持 E3 公開殼層', baseOptional: true },
  { path: 'public/scripts/devtools-warning.js', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '全站殼層載入的既有 SRI 腳本；其基線錯誤也必須逐案一致' },
  { path: 'components/Tracker.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 頁面瀏覽事件與停留時間 client 行為' },
  { path: 'components/ReferralCard.tsx', scope: 'shared', surfaces: ['dashboard'], reason: 'E3 儀表板推薦碼與積分的非同步內容' },
  { path: 'components/FunnelPageHit.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 funnel page-view client 行為' },
  { path: 'app/report/[token]/ReportTracker.tsx', scope: 'shared', surfaces: ['report'], reason: 'E3 報告 funnel completed event' },
  { path: 'components/WebVitalsReporter.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 共用 Web Vitals client 入口' },
  { path: 'components/PrivacySafeVercelTelemetry.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '候選新增的 client-only telemetry 路由閘門', baseOptional: true },
  { path: 'lib/api.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'Tracker 共用第一方 POST transport' },
  { path: 'lib/security/client-audit.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 client telemetry 失敗處理' },
  { path: 'lib/security/private-route-redaction.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '候選 private route redaction 必須保持 E3 legacy route bytes', baseOptional: true },
  { path: 'lib/security/client-error-telemetry.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '候選 client error sanitization boundary', baseOptional: true },
  { path: 'lib/monitoring/web-vitals.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 Web Vitals payload 與傳送條件' },
  { path: 'lib/funnel-tracker.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 funnel event payload 與 transport' },
  { path: 'app/api/track/route.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 第一方 pageview/duration telemetry endpoint' },
  { path: 'app/api/track/funnel/route.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 funnel telemetry endpoint' },
  { path: 'app/api/error-report/route.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 client failure telemetry endpoint' },
  { path: 'app/api/web-vitals/route.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 Web Vitals endpoint' },
  { path: 'app/api/referral/my-code/route.ts', scope: 'shared', surfaces: ['dashboard'], reason: 'E3 儀表板推薦碼資料來源' },
  { path: 'components/Navbar.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard'], reason: '共用導覽與方案入口' },
  { path: 'components/CookieConsent.tsx', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard'], reason: '共用 consent overlay 可能遮擋 E3 操作' },
  { path: 'middleware.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 路由與存取控制' },
  { path: 'next.config.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '全站 production CSP、headers 與 Next runtime 行為；差異須經瀏覽器 parity 與獨立 CSP smoke' },
  { path: '.gitattributes', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '部署時靜態資產換行 bytes 與 SRI 一致性', baseOptional: true },
  { path: 'app/globals.css', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: '全站 token、排版、動畫與可及性' },
  { path: 'app/api/generate-report/route.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 fallback 報告生成入口' },
  { path: 'lib/consultation/calculator-request.ts', scope: 'shared', surfaces: ['report'], reason: '共用 Fly payload serializer 必須維持 E3 legacy bytes', baseOptional: true },
  { path: 'lib/consultation/routes.ts', scope: 'shared', surfaces: ['dashboard', 'report'], reason: 'C/G15 私密路由 helper 必須維持 E3 legacy report URL', baseOptional: true },
  { path: 'lib/consultation/runtime-config.ts', scope: 'shared', surfaces: ['report'], reason: '結構化報告旗標不得把 E3 導入 C/G15 consultation path', baseOptional: true },
  { path: 'lib/consultation/fallback-policy.ts', scope: 'shared', surfaces: ['report'], reason: 'C/G15 workflow-only 政策不得改變 E3 fallback path', baseOptional: true },
  { path: 'lib/report/completion-fallback-email.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 補寄完成信必須保留 legacy report URL' },
  { path: 'app/api/cron/followup-email/route.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 跟進信必須保留 legacy report URL' },
  { path: 'app/api/cron/feedback-reminder/route.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 反饋信必須保留 legacy report URL' },
  { path: 'workflows/generate-report/index.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 workflow 生成入口與分支路由' },
  { path: 'workflows/generate-report/steps.ts', scope: 'shared', surfaces: ['report'], reason: 'E3 workflow 排盤、生成與交付步驟' },
  { path: 'workflows/generate-report/plan-prompts.ts', scope: 'e3-semantic', surfaces: ['report'], reason: 'E3 報告 prompt 與生成規則' },
  { path: 'lib/plan-names.ts', scope: 'shared', surfaces: ['home', 'pricing', 'checkout', 'dashboard', 'report'], reason: 'E3 方案名稱、價格與可見性 SSOT' },
])

const REQUIRED_E3_PROTECTED_PATHS = Object.freeze(
  E3_PROTECTED_SURFACE_MANIFEST.map((item) => item.path),
)

const E3_SHARED_COVERAGE_OVERRIDES = Object.freeze({
  'package.json': ['dependency-contract', 'csp-smoke'],
  'package-lock.json': ['dependency-contract', 'csp-smoke'],
  'app/api/checkout/route.ts': ['checkout-contract'],
  'hooks/useCheckoutForm.ts': ['checkout-contract'],
  'components/checkout/SinglePersonForm.tsx': ['checkout-contract'],
  'components/checkout/BirthDataFields.tsx': ['checkout-contract'],
  'components/checkout/BirthTimeField.tsx': ['checkout-contract'],
  'lib/checkout/prepare-checkout-birth-data.ts': ['checkout-contract'],
  'lib/checkout/server-checkout-contract.ts': ['checkout-contract'],
  'app/api/generate-report/route.ts': ['generation-golden'],
  'workflows/generate-report/index.ts': ['generation-golden'],
  'workflows/generate-report/steps.ts': ['generation-golden'],
  'lib/consultation/calculator-request.ts': ['generation-golden'],
  'lib/report/completion-fallback-email.ts': ['email-route-contract'],
  'app/api/cron/followup-email/route.ts': ['email-route-contract'],
  'app/api/cron/feedback-reminder/route.ts': ['email-route-contract'],
  'lib/consultation/routes.ts': ['email-route-contract', 'route-contract'],
  'lib/consultation/runtime-config.ts': ['route-contract'],
  'lib/consultation/fallback-policy.ts': ['generation-golden', 'route-contract'],
  'components/RouteChrome.tsx': ['route-chrome-contract'],
  'app/layout.tsx': ['route-chrome-contract', 'csp-smoke'],
  'middleware.ts': ['route-contract', 'csp-smoke'],
  'next.config.ts': ['csp-smoke'],
  '.gitattributes': ['csp-smoke'],
  'lib/plan-names.ts': ['checkout-contract', 'generation-golden'],
  'components/Tracker.tsx': ['telemetry-contract'],
  'components/FunnelPageHit.tsx': ['telemetry-contract'],
  'app/report/[token]/ReportTracker.tsx': ['telemetry-contract'],
  'components/WebVitalsReporter.tsx': ['telemetry-contract'],
  'components/PrivacySafeVercelTelemetry.tsx': ['telemetry-contract'],
  'lib/api.ts': ['telemetry-contract'],
  'lib/security/client-audit.ts': ['telemetry-contract'],
  'lib/security/private-route-redaction.ts': ['telemetry-contract', 'route-contract'],
  'lib/security/client-error-telemetry.ts': ['telemetry-contract'],
  'lib/monitoring/web-vitals.ts': ['telemetry-contract'],
  'lib/funnel-tracker.ts': ['telemetry-contract'],
  'app/api/track/route.ts': ['telemetry-contract'],
  'app/api/track/funnel/route.ts': ['telemetry-contract'],
  'app/api/error-report/route.ts': ['telemetry-contract'],
  'app/api/web-vitals/route.ts': ['telemetry-contract'],
})

function coverageGatesForManifestItem(item) {
  if (item.scope === 'e3-semantic') return ['exact-source']
  return [...new Set([
    'ui-static-parity',
    'ui-behavior-parity',
    ...(E3_SHARED_COVERAGE_OVERRIDES[item.path] || []),
  ])].sort()
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40,64}$/
const DEVTOOLS_WARNING_SRI_ERROR_PATTERN = /^Failed to find a valid digest in the 'integrity' attribute for resource '([^']+)' with computed SHA-384 integrity '([^']+)'\. The resource has been blocked\.$/
const E3_PERCEPTUAL_FINGERPRINT_SCHEMA = 'e3-perceptual-rgb/v2'
const E3_PERCEPTUAL_FINGERPRINT_WIDTH = 32
const E3_PERCEPTUAL_FINGERPRINT_HEIGHT = 32
// Calibrated with PNG-bound box averages from separate clean production builds:
// identical semantic surfaces observed <= 0.00895, while the adversarial
// full-frame +5 tint and 4x4 +40 patch both exceed 0.019. Independent mean-shift
// and connected-area guards below prevent global and localized false passes.
export const E3_PERCEPTUAL_RMSE_THRESHOLD = 0.012
export const E3_PERCEPTUAL_MEAN_SHIFT_THRESHOLD = 0.003
export const E3_PERCEPTUAL_MID_DELTA = 5
export const E3_PERCEPTUAL_MID_COMPONENT_MIN_DIMENSION_LIMIT = 2
export const E3_PERCEPTUAL_MID_COMPONENT_LONG_DIMENSION_LIMIT = 12
export const E3_PERCEPTUAL_HIGH_DELTA = 12
export const E3_PERCEPTUAL_HIGH_DELTA_PIXEL_LIMIT = 4
export const E3_PERCEPTUAL_HIGH_DELTA_COMPONENT_LIMIT = 3
const E3_PNG_MAX_WIDTH = 8_192
const E3_PNG_MAX_HEIGHT = 16_384
const E3_PNG_MAX_PIXELS = 16_000_000
const E3_PNG_MAX_BYTES = 32 * 1024 * 1024
const E3_PNG_MAX_COMPRESSED_BYTES = 24 * 1024 * 1024
const E3_PNG_MAX_CHUNKS = 1_024

const E3_VIEWPORTS = Object.freeze([
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
])

const E3_SURFACE_STATES = Object.freeze([
  { surface: 'home', state: 'home-card', path: '/', selector: 'article.jy-card:has(h3:text-is("月度精選"))' },
  { surface: 'pricing', state: 'pricing-card', path: '/pricing', selector: '#plan-e3' },
  { surface: 'checkout', state: 'checkout-initial', path: '/checkout?plan=E3', selector: '.checkout-main' },
  { surface: 'checkout', state: 'checkout-selected', path: '/checkout?plan=E3', selector: '.checkout-main' },
  { surface: 'checkout', state: 'checkout-confirmation', path: '/checkout?plan=E3', selector: '[role="dialog"][aria-modal="true"]' },
  { surface: 'dashboard', state: 'dashboard-pending', path: '/dashboard?session_id=e3-freeze-pending', selector: '.dashboard-report' },
  { surface: 'dashboard', state: 'dashboard-completed', path: '/dashboard?session_id=e3-freeze-completed', selector: '.dashboard-report' },
  { surface: 'dashboard', state: 'dashboard-failed', path: '/dashboard?session_id=e3-freeze-failed', selector: '.dashboard-report' },
  { surface: 'report', state: 'report-shell', path: '/report/e3Freeze_20260809_SyntheticToken_A1b2C3', selector: '[data-report-shell]' },
  { surface: 'report', state: 'report-timings', path: '/report/e3Freeze_20260809_SyntheticToken_A1b2C3#pdf-or-calendar', selector: '#pdf-or-calendar' },
])

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeValue(child)]),
    )
  }

  return value
}

function normalizeE3TelemetryRequests(requests, state) {
  const semanticRequests = []
  const webVitalsRequests = []

  const filteredRequests = requests
    .filter((request) => {
      const isVendorLoader = request?.method === 'GET'
        && NON_E3_VENDOR_LOADER_ENDPOINTS.has(request?.endpoint)
      const isKnownHomepageExperiment = request?.method === 'POST'
        && request?.endpoint === '/api/ab-events'
        && state === 'home-card'
        && NON_E3_EXPERIMENT_KEYS.has(request?.body?.experimentKey)
      return !isVendorLoader && !isKnownHomepageExperiment
    })
  for (const request of filteredRequests) {
    const normalized = normalizeValue(request)
    const isWebVitals = normalized?.endpoint === '/api/web-vitals'
      && normalized?.method === 'POST'
      && normalized.body
      && typeof normalized.body === 'object'
      && !Array.isArray(normalized.body)
    if (!isWebVitals) {
      semanticRequests.push(normalized)
      continue
    }

    normalized.body = Object.fromEntries(
      Object.entries(normalized.body)
        .filter(([key]) => !WEB_VITALS_VOLATILE_FIELDS.has(key)),
    )
    webVitalsRequests.push(normalizeValue(normalized))
  }

  // Browser timing observers may deliver FCP/LCP/FID in a different order.
  // Keep business/funnel requests in exact arrival order, but canonicalize only
  // the derived Web Vitals subset so timing noise cannot mask or invent E3 flow changes.
  webVitalsRequests.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  return [...semanticRequests, ...webVitalsRequests]
}

export function normalizeE3Snapshot(snapshot) {
  const snapshotClone = structuredClone(snapshot)
  // Only runner metadata is volatile. Business payloads may legitimately use
  // the same field names and must remain byte-significant.
  if (snapshotClone && typeof snapshotClone === 'object' && !Array.isArray(snapshotClone)) {
    delete snapshotClone.capturedAt
    delete snapshotClone.runId
  }
  const normalized = normalizeValue(snapshotClone)
  if (Array.isArray(normalized?.telemetryRequests)) {
    normalized.telemetryRequests = normalizeE3TelemetryRequests(
      normalized.telemetryRequests,
      normalized.state,
    )
  }
  return normalized
}

export function classifyE3ConsoleErrors(messages, {
  origin,
  devtoolsWarningSha384,
} = {}) {
  const known = []
  const fatal = []
  let expectedResource = null

  try {
    expectedResource = new URL('/scripts/devtools-warning.js', origin).href
  } catch {}

  for (const rawMessage of Array.isArray(messages) ? messages : []) {
    const message = String(rawMessage)
    const match = DEVTOOLS_WARNING_SRI_ERROR_PATTERN.exec(message)
    if (
      match
      && expectedResource
      && match[1] === expectedResource
      && typeof devtoolsWarningSha384 === 'string'
      && match[2] === devtoolsWarningSha384
    ) {
      known.push({
        code: 'baseline.devtools_warning_sri_mismatch',
        resource: '/scripts/devtools-warning.js',
        computedSha384: match[2],
      })
      continue
    }
    fatal.push(message)
  }

  return { known, fatal }
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  if (aboveDistance <= upperLeftDistance) return above
  return upperLeft
}

function pngCrc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function decodePngRgb(pngBuffer) {
  const buffer = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer || [])
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < signature.length || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('invalid-png-signature')
  }
  if (buffer.length > E3_PNG_MAX_BYTES) throw new Error('png-input-too-large')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = -1
  let compression = -1
  let filterMethod = -1
  let interlace = -1
  const idatChunks = []
  let sawEnd = false
  let sawHeader = false
  let sawImageData = false
  let chunkCount = 0
  let compressedBytes = 0
  while (offset + 12 <= buffer.length) {
    chunkCount += 1
    if (chunkCount > E3_PNG_MAX_CHUNKS) throw new Error('png-chunk-count-limit')
    const length = buffer.readUInt32BE(offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (chunkEnd > buffer.length) throw new Error('invalid-png-chunk-length')
    const type = buffer.toString('ascii', typeStart, dataStart)
    const data = buffer.subarray(dataStart, dataEnd)
    const storedCrc = buffer.readUInt32BE(dataEnd)
    const computedCrc = pngCrc32(buffer.subarray(typeStart, dataEnd))
    if (storedCrc !== computedCrc) throw new Error('invalid-png-crc')
    if (!['IHDR', 'IDAT', 'IEND'].includes(type)) throw new Error(`unsupported-png-chunk:${type}`)
    if (type === 'IHDR') {
      if (offset !== 8 || sawHeader || length !== 13 || width !== 0 || height !== 0) {
        throw new Error('invalid-png-ihdr')
      }
      sawHeader = true
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      compression = data[10]
      filterMethod = data[11]
      interlace = data[12]
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd) throw new Error('invalid-png-idat-order')
      sawImageData = true
      compressedBytes += data.length
      if (compressedBytes > E3_PNG_MAX_COMPRESSED_BYTES) {
        throw new Error('png-compressed-input-too-large')
      }
      idatChunks.push(data)
    } else if (type === 'IEND') {
      if (!sawHeader || !sawImageData || sawEnd || length !== 0) throw new Error('invalid-png-iend')
      sawEnd = true
      offset = chunkEnd
      if (offset !== buffer.length) throw new Error('invalid-png-trailing-bytes')
      break
    }
    offset = chunkEnd
  }

  if (
    !sawEnd
    || !sawHeader
    || !sawImageData
    || width < 1
    || height < 1
    || width > E3_PNG_MAX_WIDTH
    || height > E3_PNG_MAX_HEIGHT
    || width * height > E3_PNG_MAX_PIXELS
    || bitDepth !== 8
    || ![2, 6].includes(colorType)
    || compression !== 0
    || filterMethod !== 0
    || interlace !== 0
    || idatChunks.length === 0
  ) throw new Error('unsupported-png-contract')

  const bytesPerPixel = colorType === 6 ? 4 : 3
  const rowBytes = width * bytesPerPixel
  const expectedInflatedLength = height * (rowBytes + 1)
  const inflated = inflateSync(Buffer.concat(idatChunks), {
    maxOutputLength: expectedInflatedLength,
  })
  if (inflated.length !== expectedInflatedLength) throw new Error('invalid-png-inflated-length')
  const reconstructed = Buffer.alloc(height * rowBytes)
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    if (filter < 0 || filter > 4) throw new Error('unsupported-png-filter')
    const rowOffset = y * rowBytes
    const previousRowOffset = rowOffset - rowBytes
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = inflated[sourceOffset]
      sourceOffset += 1
      const left = x >= bytesPerPixel ? reconstructed[rowOffset + x - bytesPerPixel] : 0
      const above = y > 0 ? reconstructed[previousRowOffset + x] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? reconstructed[previousRowOffset + x - bytesPerPixel]
        : 0
      let predictor = 0
      if (filter === 1) predictor = left
      if (filter === 2) predictor = above
      if (filter === 3) predictor = Math.floor((left + above) / 2)
      if (filter === 4) predictor = paethPredictor(left, above, upperLeft)
      reconstructed[rowOffset + x] = (encoded + predictor) & 0xff
    }
  }

  const rgb = Buffer.alloc(width * height * 3)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * bytesPerPixel
    const target = pixel * 3
    if (colorType === 2 || reconstructed[source + 3] === 255) {
      rgb[target] = reconstructed[source]
      rgb[target + 1] = reconstructed[source + 1]
      rgb[target + 2] = reconstructed[source + 2]
      continue
    }
    const alpha = reconstructed[source + 3]
    for (let channel = 0; channel < 3; channel += 1) {
      rgb[target + channel] = Math.round(
        ((reconstructed[source + channel] * alpha) + (127 * (255 - alpha))) / 255,
      )
    }
  }
  return { width, height, rgb }
}

export function createE3PerceptualFingerprintFromPng(pngBuffer) {
  const source = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer || [])
  const decoded = decodePngRgb(source)
  const cellCount = E3_PERCEPTUAL_FINGERPRINT_WIDTH * E3_PERCEPTUAL_FINGERPRINT_HEIGHT
  const sums = new Float64Array(cellCount * 3)
  const counts = new Uint32Array(cellCount)
  for (let y = 0; y < decoded.height; y += 1) {
    const targetY = Math.min(
      E3_PERCEPTUAL_FINGERPRINT_HEIGHT - 1,
      Math.floor((y * E3_PERCEPTUAL_FINGERPRINT_HEIGHT) / decoded.height),
    )
    for (let x = 0; x < decoded.width; x += 1) {
      const targetX = Math.min(
        E3_PERCEPTUAL_FINGERPRINT_WIDTH - 1,
        Math.floor((x * E3_PERCEPTUAL_FINGERPRINT_WIDTH) / decoded.width),
      )
      const cell = (targetY * E3_PERCEPTUAL_FINGERPRINT_WIDTH) + targetX
      const sourceOffset = ((y * decoded.width) + x) * 3
      const targetOffset = cell * 3
      sums[targetOffset] += decoded.rgb[sourceOffset]
      sums[targetOffset + 1] += decoded.rgb[sourceOffset + 1]
      sums[targetOffset + 2] += decoded.rgb[sourceOffset + 2]
      counts[cell] += 1
    }
  }

  const bytes = Buffer.alloc(cellCount * 3)
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (counts[cell] === 0) throw new Error('empty-perceptual-cell')
    for (let channel = 0; channel < 3; channel += 1) {
      bytes[(cell * 3) + channel] = Math.round(sums[(cell * 3) + channel] / counts[cell])
    }
  }
  return {
    schema: E3_PERCEPTUAL_FINGERPRINT_SCHEMA,
    algorithm: 'png-box-average-srgb/v1',
    width: E3_PERCEPTUAL_FINGERPRINT_WIDTH,
    height: E3_PERCEPTUAL_FINGERPRINT_HEIGHT,
    sourcePngSha256: createHash('sha256').update(source).digest('hex'),
    dataBase64: bytes.toString('base64'),
  }
}

function decodeE3PerceptualFingerprint(fingerprint) {
  if (
    !fingerprint
    || typeof fingerprint !== 'object'
    || Array.isArray(fingerprint)
    || fingerprint.schema !== E3_PERCEPTUAL_FINGERPRINT_SCHEMA
    || fingerprint.algorithm !== 'png-box-average-srgb/v1'
    || fingerprint.width !== E3_PERCEPTUAL_FINGERPRINT_WIDTH
    || fingerprint.height !== E3_PERCEPTUAL_FINGERPRINT_HEIGHT
    || !SHA256_PATTERN.test(fingerprint.sourcePngSha256 || '')
    || typeof fingerprint.dataBase64 !== 'string'
    || fingerprint.dataBase64.length === 0
    || fingerprint.dataBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(fingerprint.dataBase64)
  ) return null

  const bytes = Buffer.from(fingerprint.dataBase64, 'base64')
  const expectedBytes = E3_PERCEPTUAL_FINGERPRINT_WIDTH
    * E3_PERCEPTUAL_FINGERPRINT_HEIGHT
    * 3
  if (
    bytes.length !== expectedBytes
    || bytes.toString('base64') !== fingerprint.dataBase64
  ) return null
  return bytes
}

export function validateE3PerceptualFingerprint(fingerprint, pngBuffer = null) {
  const bytes = decodeE3PerceptualFingerprint(fingerprint)
  if (!bytes) return { ok: false, reason: 'invalid-fingerprint' }
  if (pngBuffer == null) return { ok: true, reason: 'metadata-only' }
  try {
    const expected = createE3PerceptualFingerprintFromPng(pngBuffer)
    return {
      ok: isDeepStrictEqual(fingerprint, expected),
      reason: isDeepStrictEqual(fingerprint, expected) ? 'png-bound' : 'png-binding-mismatch',
    }
  } catch {
    return { ok: false, reason: 'invalid-source-png' }
  }
}

function analyzeConnectedDeltaComponents(deltaPixels) {
  const seen = new Set()
  let largest = 0
  let largestMinimumDimension = 0
  let largestMaximumDimension = 0
  for (let start = 0; start < deltaPixels.length; start += 1) {
    if (!deltaPixels[start] || seen.has(start)) continue
    const queue = [start]
    seen.add(start)
    let size = 0
    let minimumX = E3_PERCEPTUAL_FINGERPRINT_WIDTH
    let maximumX = 0
    let minimumY = E3_PERCEPTUAL_FINGERPRINT_HEIGHT
    let maximumY = 0
    while (queue.length > 0) {
      const current = queue.pop()
      size += 1
      const x = current % E3_PERCEPTUAL_FINGERPRINT_WIDTH
      const y = Math.floor(current / E3_PERCEPTUAL_FINGERPRINT_WIDTH)
      minimumX = Math.min(minimumX, x)
      maximumX = Math.max(maximumX, x)
      minimumY = Math.min(minimumY, y)
      maximumY = Math.max(maximumY, y)
      const neighbours = []
      if (x > 0) neighbours.push(current - 1)
      if (x + 1 < E3_PERCEPTUAL_FINGERPRINT_WIDTH) neighbours.push(current + 1)
      if (y > 0) neighbours.push(current - E3_PERCEPTUAL_FINGERPRINT_WIDTH)
      if (y + 1 < E3_PERCEPTUAL_FINGERPRINT_HEIGHT) neighbours.push(current + E3_PERCEPTUAL_FINGERPRINT_WIDTH)
      for (const neighbour of neighbours) {
        if (deltaPixels[neighbour] && !seen.has(neighbour)) {
          seen.add(neighbour)
          queue.push(neighbour)
        }
      }
    }
    largest = Math.max(largest, size)
    largestMinimumDimension = Math.max(
      largestMinimumDimension,
      Math.min((maximumX - minimumX) + 1, (maximumY - minimumY) + 1),
    )
    largestMaximumDimension = Math.max(
      largestMaximumDimension,
      Math.max((maximumX - minimumX) + 1, (maximumY - minimumY) + 1),
    )
  }
  return { largest, largestMinimumDimension, largestMaximumDimension }
}

export function compareE3PerceptualFingerprints(baseline, candidate) {
  const baselineBytes = decodeE3PerceptualFingerprint(baseline)
  const candidateBytes = decodeE3PerceptualFingerprint(candidate)
  if (!baselineBytes || !candidateBytes) {
    return {
      ok: false,
      normalizedRmse: null,
      threshold: E3_PERCEPTUAL_RMSE_THRESHOLD,
      reason: 'invalid-fingerprint',
    }
  }

  let squaredError = 0
  let absoluteError = 0
  const channelSignedError = [0, 0, 0]
  const highDeltaPixels = new Array(
    E3_PERCEPTUAL_FINGERPRINT_WIDTH * E3_PERCEPTUAL_FINGERPRINT_HEIGHT,
  ).fill(false)
  const midDeltaPixels = new Array(
    E3_PERCEPTUAL_FINGERPRINT_WIDTH * E3_PERCEPTUAL_FINGERPRINT_HEIGHT,
  ).fill(false)
  for (let index = 0; index < baselineBytes.length; index += 1) {
    const delta = baselineBytes[index] - candidateBytes[index]
    squaredError += delta * delta
    absoluteError += Math.abs(delta)
    channelSignedError[index % 3] += delta
    if (Math.abs(delta) >= E3_PERCEPTUAL_HIGH_DELTA) {
      highDeltaPixels[Math.floor(index / 3)] = true
    }
    if (Math.abs(delta) >= E3_PERCEPTUAL_MID_DELTA) {
      midDeltaPixels[Math.floor(index / 3)] = true
    }
  }
  const normalizedRmse = Math.sqrt(squaredError / baselineBytes.length) / 255
  const normalizedMae = (absoluteError / baselineBytes.length) / 255
  const pixels = E3_PERCEPTUAL_FINGERPRINT_WIDTH * E3_PERCEPTUAL_FINGERPRINT_HEIGHT
  const normalizedMeanShiftByChannel = channelSignedError.map((value) => Math.abs(value / pixels) / 255)
  const maxNormalizedMeanShift = Math.max(...normalizedMeanShiftByChannel)
  const highDeltaPixelCount = highDeltaPixels.filter(Boolean).length
  const highDeltaComponents = analyzeConnectedDeltaComponents(highDeltaPixels)
  const midDeltaComponents = analyzeConnectedDeltaComponents(midDeltaPixels)
  const largestHighDeltaComponent = highDeltaComponents.largest
  const largestMidDeltaMinimumDimension = midDeltaComponents.largestMinimumDimension
  const largestMidDeltaMaximumDimension = midDeltaComponents.largestMaximumDimension
  const ok = normalizedRmse <= E3_PERCEPTUAL_RMSE_THRESHOLD
    && maxNormalizedMeanShift <= E3_PERCEPTUAL_MEAN_SHIFT_THRESHOLD
    && highDeltaPixelCount <= E3_PERCEPTUAL_HIGH_DELTA_PIXEL_LIMIT
    && largestHighDeltaComponent <= E3_PERCEPTUAL_HIGH_DELTA_COMPONENT_LIMIT
    && largestMidDeltaMinimumDimension <= E3_PERCEPTUAL_MID_COMPONENT_MIN_DIMENSION_LIMIT
    && largestMidDeltaMaximumDimension <= E3_PERCEPTUAL_MID_COMPONENT_LONG_DIMENSION_LIMIT
  return {
    ok,
    normalizedRmse,
    normalizedMae,
    normalizedMeanShiftByChannel,
    maxNormalizedMeanShift,
    highDeltaPixelCount,
    largestHighDeltaComponent,
    largestMidDeltaMinimumDimension,
    largestMidDeltaMaximumDimension,
    threshold: E3_PERCEPTUAL_RMSE_THRESHOLD,
    meanShiftThreshold: E3_PERCEPTUAL_MEAN_SHIFT_THRESHOLD,
    highDeltaPixelLimit: E3_PERCEPTUAL_HIGH_DELTA_PIXEL_LIMIT,
    highDeltaComponentLimit: E3_PERCEPTUAL_HIGH_DELTA_COMPONENT_LIMIT,
    midDeltaMinimumDimensionLimit: E3_PERCEPTUAL_MID_COMPONENT_MIN_DIMENSION_LIMIT,
    midDeltaMaximumDimensionLimit: E3_PERCEPTUAL_MID_COMPONENT_LONG_DIMENSION_LIMIT,
    reason: ok
      ? 'within-threshold'
      : 'visible-difference',
  }
}

function validateE3SnapshotVisualMetadata(snapshot) {
  const errors = []
  if (!SHA256_PATTERN.test(snapshot?.screenshotSha256 || '')) errors.push('screenshot.hash_invalid')
  const fingerprint = validateE3PerceptualFingerprint(snapshot?.screenshotPerceptual)
  if (!fingerprint.ok) errors.push('screenshot.fingerprint_invalid')
  if (snapshot?.screenshotPerceptual?.sourcePngSha256 !== snapshot?.screenshotSha256) {
    errors.push('screenshot.fingerprint_source_mismatch')
  }
  if (
    snapshot?.screenshotStability?.mode !== 'fixed'
    || !isDeepStrictEqual(snapshot?.screenshotStability?.cycleSha256, [snapshot?.screenshotSha256])
  ) errors.push('screenshot.not_fixed')
  return { ok: errors.length === 0, errors }
}

export function compareE3Snapshots(baseline, candidate, {
  baselineScreenshotBuffer = null,
  candidateScreenshotBuffer = null,
} = {}) {
  const normalizedBaseline = normalizeE3Snapshot(baseline)
  const normalizedCandidate = normalizeE3Snapshot(candidate)
  const fields = [...new Set([
    ...Object.keys(normalizedBaseline),
    ...Object.keys(normalizedCandidate),
  ])].sort()

  const differences = fields
    .filter((field) => !isDeepStrictEqual(normalizedBaseline[field], normalizedCandidate[field]))
    .map((field) => ({
      field,
      baseline: normalizedBaseline[field],
      candidate: normalizedCandidate[field],
    }))

  const hasVisualMetadata = [normalizedBaseline, normalizedCandidate].some((snapshot) => (
    'screenshotSha256' in snapshot
    || 'screenshotStability' in snapshot
    || 'screenshotPerceptual' in snapshot
  ))
  const baselineMetadata = hasVisualMetadata
    ? validateE3SnapshotVisualMetadata(normalizedBaseline)
    : { ok: true, errors: [] }
  const candidateMetadata = hasVisualMetadata
    ? validateE3SnapshotVisualMetadata(normalizedCandidate)
    : { ok: true, errors: [] }
  const baselineBinding = !hasVisualMetadata
    ? { ok: true, reason: 'not-applicable' }
    : baselineScreenshotBuffer == null
      ? { ok: false, reason: 'missing-baseline-png' }
      : validateE3PerceptualFingerprint(normalizedBaseline.screenshotPerceptual, baselineScreenshotBuffer)
  const candidateBinding = !hasVisualMetadata
    ? { ok: true, reason: 'not-applicable' }
    : candidateScreenshotBuffer == null
      ? { ok: false, reason: 'missing-candidate-png' }
      : validateE3PerceptualFingerprint(normalizedCandidate.screenshotPerceptual, candidateScreenshotBuffer)
  if (!baselineMetadata.ok || !candidateMetadata.ok) {
    differences.push({
      field: 'screenshotMetadata',
      baseline: baselineMetadata.errors,
      candidate: candidateMetadata.errors,
    })
  }
  if (!baselineBinding.ok || !candidateBinding.ok) {
    differences.push({
      field: 'screenshotBinding',
      baseline: baselineBinding.reason,
      candidate: candidateBinding.reason,
    })
  }
  if (
    differences.length === 0
    && baselineMetadata.ok
    && candidateMetadata.ok
    && baselineBinding.ok
    && candidateBinding.ok
  ) {
    return {
      ok: true,
      differences: [],
      visualComparison: {
        mode: 'exact',
        normalizedRmse: 0,
        threshold: E3_PERCEPTUAL_RMSE_THRESHOLD,
      },
    }
  }

  const visualFields = new Set([
    'screenshotSha256',
    'screenshotStability',
    'screenshotPerceptual',
  ])
  const nonVisualDifferences = differences.filter(({ field }) => !visualFields.has(field))
  const hashesDiffer = normalizedBaseline.screenshotSha256 !== normalizedCandidate.screenshotSha256
  const fixedPaints = normalizedBaseline.screenshotStability?.mode === 'fixed'
    && normalizedCandidate.screenshotStability?.mode === 'fixed'
  const visualComparison = compareE3PerceptualFingerprints(
    normalizedBaseline.screenshotPerceptual,
    normalizedCandidate.screenshotPerceptual,
  )

  if (
    nonVisualDifferences.length === 0
    && hashesDiffer
    && baselineMetadata.ok
    && candidateMetadata.ok
    && fixedPaints
    && baselineBinding.ok
    && candidateBinding.ok
    && visualComparison.ok
  ) {
    return {
      ok: true,
      differences: [],
      visualComparison: {
        ...visualComparison,
        mode: 'perceptual',
      },
    }
  }

  return {
    ok: false,
    differences,
    visualComparison: {
      ...visualComparison,
      mode: 'blocked',
      hashesDiffer,
      fixedPaints,
      baselineMetadataErrors: baselineMetadata.errors,
      candidateMetadataErrors: candidateMetadata.errors,
      baselineBinding: baselineBinding.reason,
      candidateBinding: candidateBinding.reason,
      nonVisualDifferenceFields: nonVisualDifferences.map(({ field }) => field),
    },
  }
}

export function finalizeE3ReleaseDifferences(differences, toleratedVisualDifferences) {
  const result = Array.isArray(differences) ? differences.map((item) => ({ ...item })) : []
  const diagnosticOnly = Array.isArray(toleratedVisualDifferences) ? toleratedVisualDifferences : []
  if (diagnosticOnly.length > 0) {
    result.push({
      id: 'pixel-bytes-not-identical',
      fields: diagnosticOnly.map((item) => item?.id || 'unknown'),
      reason: 'E3 release requires exact PNG bytes; perceptual comparison is diagnostic only',
    })
  }
  return result
}

export function getE3ProtectedFiles() {
  return REQUIRED_E3_PROTECTED_PATHS.slice()
}

export function getE3ProtectedSurfaceManifest() {
  return E3_PROTECTED_SURFACE_MANIFEST.map((item) => ({
    ...item,
    surfaces: [...item.surfaces],
    coverage: coverageGatesForManifestItem(item),
  }))
}

export function classifyE3ProtectedSourceDifferences(
  baselineHashes,
  candidateHashes,
  manifest = getE3ProtectedSurfaceManifest(),
) {
  const manifestByPath = new Map(
    manifest.map((item) => [item.path, item]),
  )
  const paths = [...new Set([
    ...Object.keys(baselineHashes || {}),
    ...Object.keys(candidateHashes || {}),
  ])].sort()
  const differences = paths
    .filter((path) => !isDeepStrictEqual(
      baselineHashes?.[path],
      candidateHashes?.[path],
    ))
    .map((path) => ({
      path,
      scope: manifestByPath.get(path)?.scope || 'unknown',
      coverage: manifestByPath.get(path)?.coverage || [],
    }))

  return {
    all: differences,
    blocking: differences.filter((item) => item.scope !== 'shared'),
    shared: differences.filter((item) => item.scope === 'shared'),
  }
}

export function validateE3ProtectedSurfaceManifest(manifest) {
  const errors = []
  const items = Array.isArray(manifest) ? manifest : []
  const paths = items.map((item) => item?.path).filter(Boolean)
  const missing = REQUIRED_E3_PROTECTED_PATHS.filter((path) => !paths.includes(path))
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index)
  if (!Array.isArray(manifest)) errors.push('manifest.not_array')
  if (missing.length > 0) errors.push('manifest.required_surface_missing')
  if (duplicates.length > 0) errors.push('manifest.duplicate_path')
  for (const item of items) {
    if (!item || typeof item.path !== 'string' || !item.path.trim()) errors.push('manifest.path_missing')
    if (!['e3-semantic', 'shared'].includes(item?.scope)) errors.push(`manifest.scope_invalid:${item?.path || 'unknown'}`)
    if (!Array.isArray(item?.surfaces) || item.surfaces.length === 0) errors.push(`manifest.surfaces_missing:${item?.path || 'unknown'}`)
    if (typeof item?.reason !== 'string' || !item.reason.trim()) errors.push(`manifest.reason_missing:${item?.path || 'unknown'}`)
    if (!Array.isArray(item?.coverage) || item.coverage.length === 0) errors.push(`manifest.coverage_missing:${item?.path || 'unknown'}`)
    if (item?.scope === 'shared' && !item.coverage?.includes('ui-static-parity')) errors.push(`manifest.shared_static_coverage_missing:${item?.path || 'unknown'}`)
    if (item?.scope === 'shared' && !item.coverage?.includes('ui-behavior-parity')) errors.push(`manifest.shared_behavior_coverage_missing:${item?.path || 'unknown'}`)
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    missing,
    duplicates: [...new Set(duplicates)],
  }
}

export function validateE3RecordGitContext(context) {
  const errors = []
  if (!context || typeof context !== 'object') return { ok: false, errors: ['git.context_missing'] }
  if (context.baseRef !== 'origin/main') errors.push('git.base_ref_untrusted')
  if (!GIT_COMMIT_PATTERN.test(context.baseCommit || '')) errors.push('git.base_commit_invalid')
  if (!GIT_COMMIT_PATTERN.test(context.head || '')) errors.push('git.head_invalid')
  if (context.baseCommit !== context.head) errors.push('git.head_base_mismatch')
  if (context.clean !== true) errors.push('git.worktree_not_clean')
  return { ok: errors.length === 0, errors }
}

export function validateE3VerifyRoots(sourceRoot, runtimeRoot) {
  const normalizeRoot = (value) => String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase()
  const source = normalizeRoot(sourceRoot)
  const runtime = normalizeRoot(runtimeRoot)
  const errors = []
  if (!source || !runtime) errors.push('verify.root_missing')
  if (source !== runtime) errors.push('verify.runtime_source_mismatch')
  return { ok: errors.length === 0, errors }
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateE3BaselineProvenance(provenance) {
  const errors = []
  if (!provenance || typeof provenance !== 'object') return { ok: false, errors: ['provenance.missing'] }
  if (provenance.schema !== 'e3-freeze-provenance/v2') errors.push('provenance.schema_invalid')
  const gitResult = validateE3RecordGitContext(provenance.git)
  errors.push(...gitResult.errors)
  const runtimeGitResult = validateE3RecordGitContext(provenance.runtimeGit)
  errors.push(...runtimeGitResult.errors.map((error) => `runtime.${error}`))
  if (provenance.runtimeGit?.baseCommit !== provenance.git?.baseCommit) errors.push('runtime.git.base_commit_mismatch')
  if (
    !hasNonEmptyString(provenance.tool?.name)
    || !hasNonEmptyString(provenance.tool?.version)
    || !SHA256_PATTERN.test(provenance.tool?.scriptSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.releaseRunnerSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.coreSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.fixtureServerSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.cspCoreSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.fixtureSha256 || '')
    || !SHA256_PATTERN.test(provenance.tool?.preloadSha256 || '')
  ) errors.push('provenance.tool_incomplete')
  if (!hasNonEmptyString(provenance.node?.version)) errors.push('provenance.node_incomplete')
  if (
    provenance.browser?.engine !== 'chromium'
    || !hasNonEmptyString(provenance.browser?.version)
    || !hasNonEmptyString(provenance.browser?.userAgent)
    || provenance.browser?.cspMode !== 'bypassed-production-parity'
    || !hasNonEmptyString(provenance.browser?.toolchain?.playwrightVersion)
    || !SHA256_PATTERN.test(provenance.browser?.toolchain?.playwright?.sha256 || '')
    || !SHA256_PATTERN.test(provenance.browser?.toolchain?.playwrightCore?.sha256 || '')
    || !SHA256_PATTERN.test(provenance.browser?.toolchain?.browserExecutable?.sha256 || '')
    || !Number.isSafeInteger(provenance.browser?.toolchain?.browserExecutable?.size)
  ) errors.push('provenance.browser_incomplete')
  if (
    provenance.runtime?.mode !== 'production-next-build-start'
    || provenance.runtime?.bundler !== 'webpack'
    || !hasNonEmptyString(provenance.runtime?.nextVersion)
    || !hasNonEmptyString(provenance.runtime?.buildId)
    || !SHA256_PATTERN.test(provenance.runtime?.environmentContractSha256 || '')
    || typeof provenance.runtime?.sourceSeparated !== 'boolean'
  ) errors.push('provenance.runtime_incomplete')
  const expectedFontCaseIds = getE3SurfaceCases().map((item) => item.id)
  const fontRecords = Array.isArray(provenance.fonts?.records) ? provenance.fonts.records : []
  const fontCaseIds = fontRecords.map((record) => record?.caseId)
  const uniqueFontCaseIds = new Set(fontCaseIds)
  if (
    !SHA256_PATTERN.test(provenance.fonts?.fingerprintSha256 || '')
    || !Array.isArray(provenance.fonts?.families)
    || provenance.fonts.families.length === 0
    || fontRecords.length !== expectedFontCaseIds.length
    || uniqueFontCaseIds.size !== expectedFontCaseIds.length
    || expectedFontCaseIds.some((caseId) => !uniqueFontCaseIds.has(caseId))
    || fontRecords.some((record) => (
      !hasNonEmptyString(record?.caseId)
      || !Array.isArray(record?.computedFamilies)
      || !Array.isArray(record?.families)
      || !Array.isArray(record?.availability)
    ))
  ) errors.push('provenance.fonts_incomplete')
  if (
    !hasNonEmptyString(provenance.os?.platform)
    || !hasNonEmptyString(provenance.os?.release)
    || !hasNonEmptyString(provenance.os?.arch)
  ) errors.push('provenance.os_incomplete')
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function hashCanonicalSourceContent(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  const canonical = buffer.toString('utf8').replace(/\r\n?/g, '\n')
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function hashCanonicalSourceFile(path) {
  return hashCanonicalSourceContent(readFileSync(path))
}

export function validateE3BaselineCaseCoverage(snapshotIds, publicOnly) {
  const ids = Array.isArray(snapshotIds) ? snapshotIds : []
  const expectedIds = getE3SurfaceCases()
    .map((item) => item.id)
  const expected = new Set(expectedIds)
  const actual = new Set(ids)
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  const missing = expectedIds.filter((id) => !actual.has(id))
  const unexpected = ids.filter((id) => typeof id !== 'string' || !expected.has(id))
  const errors = []
  if (publicOnly === true) errors.push('baseline.public_only_not_canonical')
  if (!Array.isArray(snapshotIds)) errors.push('baseline.case_ids_not_array')
  if (duplicates.length > 0) errors.push('baseline.case_ids_duplicate')
  if (missing.length > 0) errors.push('baseline.case_ids_missing')
  if (unexpected.length > 0) errors.push('baseline.case_ids_unexpected')
  if (ids.length !== expectedIds.length) errors.push('baseline.case_count_invalid')
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    missing,
    unexpected: [...new Set(unexpected)],
    duplicates: [...new Set(duplicates)],
  }
}

export function validateE3BaselineTrust(document, trustContext) {
  const errors = []
  if (
    !trustContext
    || !GIT_COMMIT_PATTERN.test(trustContext.baseCommit || '')
    || !trustContext.protectedSourceSha256
    || typeof trustContext.protectedSourceSha256 !== 'object'
    || Array.isArray(trustContext.protectedSourceSha256)
  ) return { ok: false, errors: ['baseline.trust_context_missing'] }
  if (
    document?.provenance?.git?.baseCommit !== trustContext.baseCommit
    || document?.provenance?.runtimeGit?.baseCommit !== trustContext.baseCommit
  ) errors.push('baseline.trusted_commit_mismatch')
  if (!isDeepStrictEqual(document?.protectedSourceSha256, trustContext.protectedSourceSha256)) {
    errors.push('baseline.trusted_source_hashes_mismatch')
  }
  return { ok: errors.length === 0, errors }
}

function canonicalCorpusValue(value) {
  if (Array.isArray(value)) return value.map(canonicalCorpusValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalCorpusValue(child)]),
    )
  }
  return value
}

export function computeE3BaselineCorpusSha256(document, screenshotDir) {
  if (!document || typeof document !== 'object' || !Array.isArray(document.snapshots)) {
    throw new Error('baseline-corpus-document-invalid')
  }
  const screenshots = document.snapshots
    .map((snapshot) => {
      if (
        snapshot?.screenshot !== `${snapshot?.id}.png`
        || !/^[a-z0-9-]+\.png$/.test(snapshot?.screenshot || '')
      ) throw new Error('baseline-corpus-screenshot-name-invalid')
      const path = `${screenshotDir}/${snapshot.screenshot}`
      if (!existsSync(path)) throw new Error('baseline-corpus-screenshot-missing')
      const bytes = readFileSync(path)
      return {
        id: snapshot.id,
        file: snapshot.screenshot,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
  const manifest = {
    schema: 'e3-baseline-corpus/v1',
    documentSha256: createHash('sha256')
      .update(JSON.stringify(canonicalCorpusValue(document)), 'utf8')
      .digest('hex'),
    screenshots,
  }
  return createHash('sha256')
    .update(JSON.stringify(canonicalCorpusValue(manifest)), 'utf8')
    .digest('hex')
}

export function validateE3BaselineBundle(document, screenshotDir, trustContext = null) {
  const errors = []
  if (!document || typeof document !== 'object') return { ok: false, errors: ['baseline.document_missing'] }
  if (document.schema !== 'e3-freeze-baseline/v5') errors.push('baseline.schema_invalid')
  if (document.mode !== 'record') errors.push('baseline.mode_invalid')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(document.releaseSessionId || '')) {
    errors.push('baseline.release_session_invalid')
  }
  if (!SHA256_PATTERN.test(document.fixtureSha256 || '')) errors.push('baseline.fixture_hash_invalid')
  if (document.fixtureSha256 !== document.provenance?.tool?.fixtureSha256) errors.push('baseline.fixture_provenance_mismatch')
  const provenance = validateE3BaselineProvenance(document.provenance)
  errors.push(...provenance.errors)
  const manifest = validateE3ProtectedSurfaceManifest(document.protectedSurfaceManifest)
  errors.push(...manifest.errors)
  const canonicalManifest = getE3ProtectedSurfaceManifest()
  if (!isDeepStrictEqual(document.protectedSurfaceManifest, canonicalManifest)) {
    errors.push('baseline.manifest_not_current_contract')
  }
  const protectedHashes = document.protectedSourceSha256
  if (!protectedHashes || typeof protectedHashes !== 'object' || Array.isArray(protectedHashes)) {
    errors.push('baseline.protected_hashes_missing')
  } else {
    const expectedPaths = canonicalManifest.map((item) => item.path).sort()
    const actualPaths = Object.keys(protectedHashes).sort()
    if (!isDeepStrictEqual(actualPaths, expectedPaths)) errors.push('baseline.protected_hash_paths_invalid')
    for (const item of canonicalManifest) {
      const record = protectedHashes[item.path]
      const absenceAllowed = item.baseOptional === true && record?.present === false && record?.digest === null
      const presentAndValid = record?.present === true && SHA256_PATTERN.test(record?.digest || '')
      if (
        !record
        || record.algorithm !== 'sha256-lf/v1'
        || (!absenceAllowed && !presentAndValid)
        || record.scope !== item.scope
        || !isDeepStrictEqual(record.surfaces, item.surfaces)
      ) errors.push(`baseline.protected_hash_invalid:${item.path}`)
    }
  }
  errors.push(...validateE3BaselineTrust(document, trustContext).errors)
  if (!SHA256_PATTERN.test(trustContext?.baselineCorpusSha256 || '')) {
    errors.push('baseline.trusted_corpus_hash_missing')
  } else {
    try {
      if (computeE3BaselineCorpusSha256(document, screenshotDir) !== trustContext.baselineCorpusSha256) {
        errors.push('baseline.trusted_corpus_hash_mismatch')
      }
    } catch {
      errors.push('baseline.trusted_corpus_hash_invalid')
    }
  }
  const protectedRuntimeHashes = document.protectedRuntimeSha256
  if (!protectedRuntimeHashes || typeof protectedRuntimeHashes !== 'object' || Array.isArray(protectedRuntimeHashes)) {
    errors.push('baseline.protected_runtime_hashes_missing')
  } else {
    const expectedPaths = canonicalManifest.map((item) => item.path).sort()
    const actualPaths = Object.keys(protectedRuntimeHashes).sort()
    if (!isDeepStrictEqual(actualPaths, expectedPaths)) errors.push('baseline.protected_runtime_hash_paths_invalid')
    for (const item of canonicalManifest) {
      const record = protectedRuntimeHashes[item.path]
      const absenceAllowed = item.baseOptional === true && record?.present === false && record?.digest === null
      const presentAndValid = record?.present === true && SHA256_PATTERN.test(record?.digest || '')
      if (
        !record
        || record.algorithm !== 'sha256-lf/v1'
        || (!absenceAllowed && !presentAndValid)
        || record.scope !== item.scope
        || !isDeepStrictEqual(record.surfaces, item.surfaces)
      ) errors.push(`baseline.protected_runtime_hash_invalid:${item.path}`)
    }
    if (!isDeepStrictEqual(protectedRuntimeHashes, protectedHashes)) {
      errors.push('baseline.protected_runtime_source_mismatch')
    }
  }
  if (typeof document.publicOnly !== 'boolean') errors.push('baseline.public_only_invalid')
  if (document.publicOnly !== false) errors.push('baseline.public_only_not_canonical')
  if (!Array.isArray(document.snapshots) || document.snapshots.length === 0) {
    errors.push('baseline.snapshots_missing')
  } else {
    const coverage = validateE3BaselineCaseCoverage(
      document.snapshots.map((snapshot) => snapshot?.id),
      document.publicOnly === true,
    )
    errors.push(...coverage.errors)
    const expectedCases = new Map(getE3SurfaceCases().map((item) => [item.id, item]))
    const aggregateFontsByCase = new Map(
      (document.provenance?.fonts?.records || []).map((record) => [record.caseId, record]),
    )
    for (const snapshot of document.snapshots) {
      const expectedCase = expectedCases.get(snapshot?.id)
      const aggregateFontRecord = aggregateFontsByCase.get(snapshot?.id)
      const { caseId: _caseId, ...fontRecordWithoutId } = aggregateFontRecord || {}
      if (
        snapshot?.schema !== 'e3-surface/v3'
        || snapshot?.fixtureSha256 !== document.fixtureSha256
        || snapshot?.browserVersion !== document.provenance?.browser?.version
        || !expectedCase
        || snapshot.surface !== expectedCase?.surface
        || snapshot.state !== expectedCase?.state
        || snapshot.path !== expectedCase?.path
        || snapshot.selector !== expectedCase?.selector
        || snapshot.theme !== expectedCase?.theme
        || !isDeepStrictEqual(snapshot.viewport, expectedCase?.viewport)
        || !snapshot?.fontRecord
        || !Array.isArray(snapshot.fontRecord?.computedFamilies)
        || !Array.isArray(snapshot.fontRecord?.families)
        || !Array.isArray(snapshot.fontRecord?.availability)
        || !isDeepStrictEqual(snapshot.fontRecord, fontRecordWithoutId)
        || !hasNonEmptyString(snapshot?.text)
        || !hasNonEmptyString(snapshot?.dom)
        || snapshot?.aria == null
        || !Array.isArray(snapshot?.criticalStyles)
        || !SHA256_PATTERN.test(snapshot?.renderTreeSha256 || '')
        || !Array.isArray(snapshot?.behavior?.modes)
        || snapshot.behavior.modes.length !== 2
        || !isDeepStrictEqual(
          snapshot.behavior.modes.map((mode) => mode?.reducedMotion).sort(),
          ['no-preference', 'reduce'],
        )
        || snapshot.behavior.modes.some((mode) => (
          !Array.isArray(mode?.motionContract)
          || !Array.isArray(mode?.interactionContract)
          || !mode?.shellContract
        ))
      ) errors.push(`baseline.snapshot_contract_invalid:${snapshot?.id || 'unknown'}`)
      if (
        snapshot?.screenshot !== `${snapshot?.id}.png`
        || !/^[a-z0-9-]+\.png$/.test(snapshot?.screenshot || '')
        || !SHA256_PATTERN.test(snapshot?.screenshotSha256 || '')
        || snapshot?.screenshotStability?.mode !== 'fixed'
        || !isDeepStrictEqual(
          snapshot?.screenshotStability?.cycleSha256,
          [snapshot?.screenshotSha256],
        )
        || !validateE3PerceptualFingerprint(snapshot?.screenshotPerceptual).ok
      ) {
        errors.push(`baseline.screenshot_metadata_invalid:${snapshot?.id || 'unknown'}`)
        continue
      }
      const path = `${screenshotDir}/${snapshot.screenshot}`
      if (!existsSync(path)) {
        errors.push(`baseline.screenshot_missing:${snapshot.id || snapshot.screenshot}`)
        continue
      }
      const screenshotBytes = readFileSync(path)
      const digest = createHash('sha256').update(screenshotBytes).digest('hex')
      if (digest !== snapshot.screenshotSha256) errors.push(`baseline.screenshot_hash_mismatch:${snapshot.id || snapshot.screenshot}`)
      if (!validateE3PerceptualFingerprint(snapshot.screenshotPerceptual, screenshotBytes).ok) {
        errors.push(`baseline.screenshot_fingerprint_mismatch:${snapshot.id || snapshot.screenshot}`)
      }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function replaceE3BaselineBundleAtomically({
  baselinePath,
  screenshotDir,
  candidateBaselinePath,
  candidateScreenshotDir,
  trustContext,
}) {
  const candidateDocument = JSON.parse(readFileSync(candidateBaselinePath, 'utf8'))
  const validation = validateE3BaselineBundle(candidateDocument, candidateScreenshotDir, trustContext)
  if (!validation.ok) throw new Error(`E3 candidate baseline 驗證失敗：${validation.errors.join(', ')}`)

  const suffix = `.backup-${process.pid}-${Date.now()}`
  const baselineBackup = `${baselinePath}${suffix}`
  const screenshotBackup = `${screenshotDir}${suffix}`
  const hadBaseline = existsSync(baselinePath)
  const hadScreenshots = existsSync(screenshotDir)
  let baselineInstalled = false
  let screenshotsInstalled = false
  try {
    if (hadBaseline) renameSync(baselinePath, baselineBackup)
    if (hadScreenshots) renameSync(screenshotDir, screenshotBackup)
    renameSync(candidateScreenshotDir, screenshotDir)
    screenshotsInstalled = true
    renameSync(candidateBaselinePath, baselinePath)
    baselineInstalled = true
  } catch (error) {
    if (baselineInstalled && existsSync(baselinePath)) renameSync(baselinePath, candidateBaselinePath)
    if (screenshotsInstalled && existsSync(screenshotDir)) renameSync(screenshotDir, candidateScreenshotDir)
    if (hadScreenshots && existsSync(screenshotBackup)) renameSync(screenshotBackup, screenshotDir)
    if (hadBaseline && existsSync(baselineBackup)) renameSync(baselineBackup, baselinePath)
    throw error
  }
  if (existsSync(baselineBackup)) rmSync(baselineBackup, { force: true })
  if (existsSync(screenshotBackup)) rmSync(screenshotBackup, { recursive: true, force: true })
}

export function getE3SurfaceCases() {
  return E3_SURFACE_STATES.flatMap((surfaceState) =>
    E3_VIEWPORTS.flatMap((viewport) =>
      ['light', 'dark'].map((theme) => ({
        ...surfaceState,
        id: `${surfaceState.state}--${viewport.name}--${theme}`,
        viewport: { ...viewport },
        theme,
        fixture: ['checkout', 'dashboard', 'report'].includes(surfaceState.surface)
          ? 'local-synthetic'
          : 'none',
      })),
    ),
  )
}
