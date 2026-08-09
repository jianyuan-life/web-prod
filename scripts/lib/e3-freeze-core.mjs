import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

const VOLATILE_FIELDS = new Set(['capturedAt', 'runId'])
const WEB_VITALS_VOLATILE_FIELDS = new Set(['id', 'value', 'delta'])
const NON_E3_VENDOR_LOADER_ENDPOINTS = new Set([
  '/_vercel/insights/script.js',
  '/_vercel/speed-insights/script.js',
])
const NON_E3_EXPERIMENT_KEYS = new Set(['hero_cta_20260417'])

const E3_PROTECTED_SURFACE_MANIFEST = Object.freeze([
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

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40,64}$/
const DEVTOOLS_WARNING_SRI_ERROR_PATTERN = /^Failed to find a valid digest in the 'integrity' attribute for resource '([^']+)' with computed SHA-384 integrity '([^']+)'\. The resource has been blocked\.$/

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
        .filter(([key]) => !VOLATILE_FIELDS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeValue(child)]),
    )
  }

  return value
}

function normalizeE3TelemetryRequests(requests, state) {
  return requests
    .filter((request) => {
      const isVendorLoader = request?.method === 'GET'
        && NON_E3_VENDOR_LOADER_ENDPOINTS.has(request?.endpoint)
      const isKnownHomepageExperiment = request?.method === 'POST'
        && request?.endpoint === '/api/ab-events'
        && state === 'home-card'
        && NON_E3_EXPERIMENT_KEYS.has(request?.body?.experimentKey)
      return !isVendorLoader && !isKnownHomepageExperiment
    })
    .map((request) => {
      const normalized = normalizeValue(request)
      if (
        normalized?.endpoint === '/api/web-vitals'
        && normalized?.method === 'POST'
        && normalized.body
        && typeof normalized.body === 'object'
        && !Array.isArray(normalized.body)
      ) {
        normalized.body = Object.fromEntries(
          Object.entries(normalized.body)
            .filter(([key]) => !WEB_VITALS_VOLATILE_FIELDS.has(key)),
        )
      }
      return normalizeValue(normalized)
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function normalizeE3Snapshot(snapshot) {
  const normalized = normalizeValue(structuredClone(snapshot))
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

export function compareE3Snapshots(baseline, candidate) {
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

  return {
    ok: differences.length === 0,
    differences,
  }
}

export function getE3ProtectedFiles() {
  return REQUIRED_E3_PROTECTED_PATHS.slice()
}

export function getE3ProtectedSurfaceManifest() {
  return E3_PROTECTED_SURFACE_MANIFEST.map((item) => ({
    ...item,
    surfaces: [...item.surfaces],
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

export function validateE3BaselineBundle(document, screenshotDir) {
  const errors = []
  if (!document || typeof document !== 'object') return { ok: false, errors: ['baseline.document_missing'] }
  if (document.schema !== 'e3-freeze-baseline/v3') errors.push('baseline.schema_invalid')
  if (document.mode !== 'record') errors.push('baseline.mode_invalid')
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
        snapshot?.schema !== 'e3-surface/v1'
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
      ) errors.push(`baseline.snapshot_contract_invalid:${snapshot?.id || 'unknown'}`)
      if (
        snapshot?.screenshot !== `${snapshot?.id}.png`
        || !/^[a-z0-9-]+\.png$/.test(snapshot?.screenshot || '')
        || !SHA256_PATTERN.test(snapshot?.screenshotSha256 || '')
      ) {
        errors.push(`baseline.screenshot_metadata_invalid:${snapshot?.id || 'unknown'}`)
        continue
      }
      const path = `${screenshotDir}/${snapshot.screenshot}`
      if (!existsSync(path)) {
        errors.push(`baseline.screenshot_missing:${snapshot.id || snapshot.screenshot}`)
        continue
      }
      const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
      if (digest !== snapshot.screenshotSha256) errors.push(`baseline.screenshot_hash_mismatch:${snapshot.id || snapshot.screenshot}`)
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function replaceE3BaselineBundleAtomically({
  baselinePath,
  screenshotDir,
  candidateBaselinePath,
  candidateScreenshotDir,
}) {
  const candidateDocument = JSON.parse(readFileSync(candidateBaselinePath, 'utf8'))
  const validation = validateE3BaselineBundle(candidateDocument, candidateScreenshotDir)
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
