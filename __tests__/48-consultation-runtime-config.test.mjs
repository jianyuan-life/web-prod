import { suite, test, assert, assertEqual, done } from './harness.mjs'

let runtime
let loadError
try {
  runtime = await import('../lib/consultation/runtime-config.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 結構化生成 runtime 設定')

test('C 與 G15 只能在明確啟用時走結構化流程，E3 永遠保持舊流程', () => {
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
  assertEqual(runtime.shouldUseConsultationReportV1('C', {}), false)
  assertEqual(runtime.shouldUseConsultationReportV1('G15', {}), false)
  assertEqual(runtime.shouldUseConsultationReportV1('C', { USE_CONSULTATION_REPORT_V1_C: 'false' }), false)
  assertEqual(runtime.shouldUseConsultationReportV1('G15', { USE_CONSULTATION_REPORT_V1_G15: 'false' }), false)
  assertEqual(runtime.shouldUseConsultationReportV1('C', { USE_CONSULTATION_REPORT_V1_C: 'TRUE' }), false)
})

test('checkout release contract is plan-bound and fulfillment uses a distinct emergency kill switch', () => {
  const original = { name: 'Synthetic', consultation_release_contract: 'untrusted-client-value' }
  const bound = runtime.bindConsultationOrderReleaseContract('C', original)
  assertEqual(original.consultation_release_contract, 'untrusted-client-value')
  assertEqual(runtime.hasConsultationOrderReleaseContract('C', bound), true)
  assertEqual(runtime.hasConsultationOrderReleaseContract('G15', bound), false)
  assertEqual(runtime.hasConsultationOrderReleaseContract('C', original), false)
  assertEqual(runtime.hasConsultationOrderReleaseContract('C', {
    ...bound,
    consultation_release_contract: { schema: 'consultation-report/v2', plan_code: 'C' },
  }), false)
  assertEqual(runtime.isConsultationGenerationKillSwitchEnabled('C', {}), false)
  assertEqual(runtime.isConsultationGenerationKillSwitchEnabled('C', {
    CONSULTATION_REPORT_V1_KILL_SWITCH_C: 'true',
  }), true)
  assertEqual(runtime.isConsultationGenerationKillSwitchEnabled('G15', {
    CONSULTATION_REPORT_V1_KILL_SWITCH_C: 'true',
  }), false)
})

test('啟用前必須同時具備 calculator 版本、fresh review 與 renderer input binding 的 SHA-256 收據', () => {
  const valid = {
    // calculator-bundle/v2: git SHA and calculator manifest hash are baked in at
    // build time; the image digest comes from the deploy receipt after push.
    // v1 asked the runtime to self-report a Fly release number and its own
    // digest, which it cannot do — see runtime-config.ts.
    CALCULATOR_BUNDLE_VERSION: `calculator-bundle/v2|app=fortune-reports-api|digest=sha256:${'c'.repeat(64)}|git=4f83f1523f13cacb35ae18e00795fee14263d27a|manifest=sha256:${'e'.repeat(64)}`,
    CALCULATOR_ATTESTATION_CODE_SHA256: 'd'.repeat(64),
    CALCULATOR_ATTESTATION_KEY_ID: 'primary',
    CALCULATOR_ATTESTATION_SECRET: 'test-only-attestation-secret-32-bytes-minimum',
    TELEMETRY_FINGERPRINT_SECRET: 'test-only-telemetry-secret-32-bytes-minimum',
    TELEMETRY_FINGERPRINT_KEY_ID: 'telemetry-v1',
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
    // 舊 v1 收據必須被拒絕,否則自我參照的 release identity 會被悄悄放回來
    { ...valid, CALCULATOR_BUNDLE_VERSION: `fly-release/v1|app=fortune-reports-api|release=114|digest=sha256:${'c'.repeat(64)}|git=4f83f1523f13cacb35ae18e00795fee14263d27a` },
    // v2 缺 manifest 段 = 沒有可重現的依賴指紋,不算完整身分
    { ...valid, CALCULATOR_BUNDLE_VERSION: `calculator-bundle/v2|app=fortune-reports-api|digest=sha256:${'c'.repeat(64)}|git=4f83f1523f13cacb35ae18e00795fee14263d27a` },
    { ...valid, CALCULATOR_ATTESTATION_CODE_SHA256: 'pending' },
    { ...valid, CALCULATOR_ATTESTATION_KEY_ID: '' },
    { ...valid, CALCULATOR_ATTESTATION_SECRET: 'short' },
    { ...valid, TELEMETRY_FINGERPRINT_SECRET: 'short' },
    { ...valid, TELEMETRY_FINGERPRINT_KEY_ID: '' },
    { ...valid, TELEMETRY_FINGERPRINT_SECRET: valid.CALCULATOR_ATTESTATION_SECRET },
    { ...valid, TELEMETRY_FINGERPRINT_SECRET: valid.CONSULTATION_SESSION_SECRET },
    { ...valid, TELEMETRY_FINGERPRINT_SECRET: valid.REPORT_COOKIE_SECRET },
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
