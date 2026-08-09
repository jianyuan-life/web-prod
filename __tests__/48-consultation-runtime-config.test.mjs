import { suite, test, assert, assertEqual, done } from './harness.mjs'

let runtime
let loadError
try {
  runtime = await import('../lib/consultation/runtime-config.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 結構化生成 runtime 設定')

test('feature flag 只可能開啟 C 與 G15，E3 即使誤設也永遠保持舊流程', () => {
  assert(runtime, `runtime config 無法載入: ${loadError?.message || 'unknown error'}`)
  const env = {
    USE_CONSULTATION_REPORT_V1_C: 'true',
    USE_CONSULTATION_REPORT_V1_G15: 'true',
    USE_CONSULTATION_REPORT_V1_E3: 'true',
  }
  assertEqual(runtime.shouldUseConsultationReportV1('C', env), true)
  assertEqual(runtime.shouldUseConsultationReportV1('G15', env), true)
  assertEqual(runtime.shouldUseConsultationReportV1('E3', env), false)
  assertEqual(runtime.shouldUseConsultationReportV1('D', env), false)
  assertEqual(runtime.shouldUseConsultationReportV1('C', { USE_CONSULTATION_REPORT_V1_C: 'TRUE' }), false)
})

test('啟用前必須同時具備 calculator 版本、fresh review 與 renderer input binding 的 SHA-256 收據', () => {
  const valid = {
    CALCULATOR_BUNDLE_VERSION: `fly-release/v1|app=fortune-reports-api|release=114|digest=sha256:${'c'.repeat(64)}|git=4f83f1523f13cacb35ae18e00795fee14263d27a`,
    CALCULATOR_ATTESTATION_CODE_SHA256: 'd'.repeat(64),
    CALCULATOR_ATTESTATION_KEY_ID: 'primary',
    CALCULATOR_ATTESTATION_SECRET: 'test-only-attestation-secret-32-bytes-minimum',
    CONSULTATION_SESSION_SECRET: 'test-only-session-secret-32-bytes-minimum',
    REPORT_COOKIE_SECRET: 'test-only-report-cookie-secret-32-bytes-minimum',
    CONSULTATION_V1_FRESH_REVIEW_SHA256: `sha256:${'a'.repeat(64)}`,
    CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256: `sha256:${'b'.repeat(64)}`,
  }
  const result = runtime.readConsultationRuntimeReceipts(valid)
  assertEqual(result.calculatorBundleVersion, valid.CALCULATOR_BUNDLE_VERSION)
  assertEqual(result.freshReviewHash, valid.CONSULTATION_V1_FRESH_REVIEW_SHA256)
  assertEqual(result.rendererInputBindingHash, valid.CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256)

  for (const missing of [
    { ...valid, CALCULATOR_BUNDLE_VERSION: '' },
    { ...valid, CALCULATOR_BUNDLE_VERSION: 'git:4f83f1523f13cacb35ae18e00795fee14263d27a' },
    { ...valid, CALCULATOR_ATTESTATION_CODE_SHA256: 'pending' },
    { ...valid, CALCULATOR_ATTESTATION_KEY_ID: '' },
    { ...valid, CALCULATOR_ATTESTATION_SECRET: 'short' },
    { ...valid, CONSULTATION_SESSION_SECRET: 'short' },
    { ...valid, CONSULTATION_SESSION_SECRET: 'replace-with-independent-openssl-rand-hex-32' },
    { ...valid, CONSULTATION_SESSION_SECRET: valid.CALCULATOR_ATTESTATION_SECRET },
    { ...valid, CONSULTATION_SESSION_SECRET: valid.REPORT_COOKIE_SECRET },
    { ...valid, CONSULTATION_V1_FRESH_REVIEW_SHA256: 'passed' },
    { ...valid, CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256: '' },
  ]) {
    let error
    try { runtime.readConsultationRuntimeReceipts(missing) } catch (caught) { error = caught }
    assert(error)
    assertEqual(error.name, 'ConsultationRuntimeConfigError')
  }
})

done()
