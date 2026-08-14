import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  CALCULATOR_SYSTEM_EVIDENCE_CLASS,
  CALCULATOR_SYSTEM_MARKERS,
  EXPECTED_CALCULATOR_SYSTEMS,
  normalizeCalculatorFacts,
} from '../lib/consultation/calculator-facts.ts'
import {
  buildCalculatorRequestPayload,
  hashCalculatorRequest,
} from '../lib/consultation/calculator-request.ts'

const RUNTIME_BUNDLE = [
  'calculator-bundle/v2|app=fortune-reports-api',
  `digest=sha256:${'b'.repeat(64)}`,
  `git=${'c'.repeat(40)}`,
  `manifest=sha256:${'d'.repeat(64)}`,
].join('|')

function substantiveAnalysis(system, index) {
  return {
    system,
    status: 'success',
    detail: [
      `${CALCULATOR_SYSTEM_MARKERS[system].flatMap((term) => [`${term}來源`, `${term}盤面`, `${term}位置`, `${term}界線`, `${term}變化`]).join('、')}。`,
      `${system} 合成結果 ${index}；這是只用於契約測試的實質排盤內容，包含盤面位置、計算步驟、固定年度、已知限制與可重新核對的欄位。`,
      '盤面依序保留天干地支、宮位星曜、五行強弱、生剋制化、年月日時、方向節奏、關係資源、壓力反應、學習工作、決策界線與行動觀察。',
      '每個欄位均可回到同一出生輸入與目標年份重播，差異處需列明適用條件、失效情境、資料缺口、校準方法及後續核對日期。',
      '本段不作保證、診斷或角色推定，只示範具備多種可區分資訊的版本化測試資料。',
      '核對時依序比較原始輸入、轉換規則、中間盤面、最終摘要、支持線索、反面訊號與年度邊界；任一環節不一致就停止引用。',
    ].join(''),
    good_points: [`可核對線索 ${index}`],
    improvements: [`後續核對方向 ${index}`],
    sub_summary: `${system} 合成摘要`,
    score: 60 + index,
  }
}

function envelopeWithoutProvenance() {
  const requestPayload = buildCalculatorRequestPayload({
    name: '虛構溯源案例',
    year: 1990,
    month: 6,
    day: 15,
    hour: 10,
    minute: 30,
    gender: 'F',
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_city: 'Taipei',
    birth_country: 'TW',
    calendar_type: 'solar',
    lunar_leap: false,
    time_unknown: false,
    time_mode: 'exact',
    as_of: '2026-08-09',
    target_year: 2026,
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
    fold: 0,
  }, { consultationMode: true })
  const requestHash = hashCalculatorRequest(requestPayload)
  const analyses = EXPECTED_CALCULATOR_SYSTEMS.map((system, index) =>
    CALCULATOR_SYSTEM_EVIDENCE_CLASS[system] === 'held'
      ? { system, status: 'held', reason: 'authority_unverified', detail: null, score: null }
      : substantiveAnalysis(system, index),
  )
  return {
    personId: 'person:provenance-case',
    asOfDate: '2026-08-09',
    targetYear: 2026,
    calculatorBundleVersion: RUNTIME_BUNDLE,
    requestPayload,
    requestHash,
    responseAttestation: {
      version: 'jianyuan.fly.response.v1',
      releaseId: RUNTIME_BUNDLE,
      calculatorCodeSha256: 'a'.repeat(64),
      keyId: 'test-key',
      issuedAt: 1786200000,
      requestHash,
      responseHash: `sha256:${'e'.repeat(64)}`,
      signatureHash: `sha256:${'f'.repeat(64)}`,
    },
    response: {
      normalized_input: structuredClone(requestPayload),
      analysis_context: {
        mode: 'consultation_v1',
        as_of: '2026-08-09',
        target_year: 2026,
        birth_timezone: 'Asia/Taipei',
        reference_timezone: 'Asia/Hong_Kong',
      },
      client_data: {
        name: '虛構溯源案例',
        birth_date: '1990-06-15 10:30',
        gender: '女',
        bazi: '庚午　壬午　辛亥　癸巳',
        yongshen: '合成喜用木火線索',
        dayun: '合成大運資料包含起運歲數、十年區間與固定基準年。',
        five_elements: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
        five_elements_simple: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
      },
      analyses,
      successful_systems: analyses.filter((analysis) => analysis.status === 'success').map((analysis) => analysis.system),
      held_systems: analyses.filter((analysis) => analysis.status === 'held').map((analysis) => analysis.system),
      failed_systems: [],
      systems_count: 15,
      expected_systems_count: 15,
      coverage: {
        expected_slots: 15,
        covered_slots: 15,
        successful_slots: 14,
        held_slots: 1,
        failed_slots: 0,
        is_complete: true,
      },
    },
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function withProvenanceContract(envelope = envelopeWithoutProvenance()) {
  const systems = EXPECTED_CALCULATOR_SYSTEMS.map((system, index) => ({
    system,
    rule_id: `JY-STRICT-SYNTHETIC-${String(index + 1).padStart(2, '0')}`,
    school: system === '八字四柱'
      ? 'china_mainland'
      : system === '吠陀占星' ? 'lahiri_only' : 'production_variant_unverified',
    source_edition: system === '九星氣學' ? null : 'synthetic-test-edition',
    source_locator: system === '九星氣學' ? null : `synthetic-test-locator-${index}`,
    source_evidence_sha256: system === '九星氣學' ? null : String(index + 1).padStart(64, '0'),
    verification_status: system === '九星氣學' ? 'UNVERIFIED' : 'VERIFIED',
    public_offer_role: system === '九星氣學'
      ? 'supplementary_not_in_public_14'
      : 'core_public_14',
    delivery_policy: system === '九星氣學'
      ? 'hold'
      : 'deliver',
    implementation_locator: `calculators/synthetic_${index}.py`,
    claim_authority_scope: system === '九星氣學'
      ? 'none_until_verified'
      : system === '古典占星' ? 'strict_classical_claims_after_exclusion' : 'system_only',
    claim_authority_excludes: system === '古典占星' ? ['九星氣學'] : [],
    calculation_commit: 'c'.repeat(40),
    runtime_bundle: envelope.calculatorBundleVersion,
  }))
  const provenanceRegistry = {
    schema_version: 'jianyuan.provenance.registry.v1',
    definition_sha256: '1'.repeat(64),
    technical_slot_count: 15,
    public_offer_system_count: 14,
    count_semantics: 'inventory_only_not_correctness_evidence',
    systems,
  }
  envelope.response.provenance_registry = provenanceRegistry
  envelope.response.provenance_registry_sha256 = createHash('sha256')
    .update(canonicalJson(provenanceRegistry), 'utf8')
    .digest('hex')
  envelope.response.analyses = envelope.response.analyses.map((analysis) => ({
    ...analysis,
    provenance: structuredClone(systems.find((entry) => entry.system === analysis.system)),
  }))
  return envelope
}

function rehashRegistry(envelope) {
  envelope.response.provenance_registry_sha256 = createHash('sha256')
    .update(canonicalJson(envelope.response.provenance_registry), 'utf8')
    .digest('hex')
  return envelope
}

function syncAnalysisProvenance(envelope, system) {
  const registryEntry = envelope.response.provenance_registry.systems
    .find((entry) => entry.system === system)
  const analysis = envelope.response.analyses.find((entry) => entry.system === system)
  analysis.provenance = structuredClone(registryEntry)
  return rehashRegistry(envelope)
}

function issueCodes(envelope) {
  try {
    normalizeCalculatorFacts(envelope)
    return []
  } catch (error) {
    return Array.isArray(error?.issues)
      ? error.issues.map((issue) => issue.code)
      : [String(error)]
  }
}

test('strict consumer rejects a response without its provenance registry', () => {
  assert.ok(
    issueCodes(envelopeWithoutProvenance()).includes('response.provenance_registry_missing'),
  )
})

test('valid producer provenance is retained with its registry identity and count semantics', () => {
  const normalized = normalizeCalculatorFacts(withProvenanceContract())
  assert.equal(normalized.provenanceRegistry.sha256.length, 64)
  assert.equal(normalized.provenanceRegistry.definitionSha256, '1'.repeat(64))
  assert.equal(normalized.provenanceRegistry.technicalSlotCount, 15)
  assert.equal(normalized.provenanceRegistry.publicOfferSystemCount, 14)
})

test('a materialized registry hash mismatch fails closed', () => {
  const badHash = withProvenanceContract()
  badHash.response.provenance_registry_sha256 = '0'.repeat(64)
  assert.ok(issueCodes(badHash).includes('response.provenance_registry_hash_mismatch'))
})

test('a malformed producer registry-definition identity fails closed', () => {
  const envelope = withProvenanceContract()
  envelope.response.provenance_registry.definition_sha256 = 'not-a-sha256'
  envelope.response.provenance_registry_sha256 = createHash('sha256')
    .update(canonicalJson(envelope.response.provenance_registry), 'utf8')
    .digest('hex')
  assert.ok(
    issueCodes(envelope).includes('response.provenance_registry_definition_invalid'),
  )
})

test('coverage must reconcile 15 technical slots to 14 public successes and one held slot', () => {
  const envelope = withProvenanceContract()
  envelope.response.coverage.successful_slots = 15
  assert.ok(issueCodes(envelope).includes('response.coverage_mismatch'))
})

test('registry count semantics distinguish 15 technical slots from the public offer of 14', () => {
  for (const mutate of [
    (registry) => { registry.technical_slot_count = 14 },
    (registry) => { registry.public_offer_system_count = 15 },
    (registry) => { registry.count_semantics = 'verified_authority_count' },
  ]) {
    const envelope = withProvenanceContract()
    mutate(envelope.response.provenance_registry)
    rehashRegistry(envelope)
    assert.ok(
      issueCodes(envelope).includes('response.provenance_registry_contract_mismatch'),
    )
  }
})

test('every analysis slot must carry the exact runtime-bound registry entry for that system', () => {
  const envelope = withProvenanceContract()
  envelope.response.analyses[0].provenance.rule_id = 'JY-TAMPERED-RULE'
  assert.ok(issueCodes(envelope).includes('analysis.provenance_mismatch'))
})

test('provenance registry must enumerate each of the 15 technical systems once in contract order', () => {
  const envelope = withProvenanceContract()
  envelope.response.provenance_registry.systems.reverse()
  rehashRegistry(envelope)
  assert.ok(
    issueCodes(envelope).includes('response.provenance_registry_system_set_mismatch'),
  )
})

test('provenance entries reject missing fields, fake source locators and runtime identity drift', () => {
  for (const mutate of [
    (entry) => { delete entry.rule_id },
    (entry) => { entry.calculation_commit = 'not-a-commit' },
    (entry) => { entry.runtime_bundle = 'calculator-bundle/v2|tampered' },
    (entry) => { entry.verification_status = 'UNVERIFIED' },
    (entry) => { entry.source_locator = 'UNVERIFIED' },
  ]) {
    const envelope = withProvenanceContract()
    mutate(envelope.response.provenance_registry.systems[0])
    rehashRegistry(envelope)
    assert.ok(
      issueCodes(envelope).includes('response.provenance_registry_entry_invalid'),
    )
  }
})

test('Nine Star is an authority-unverified held slot, never a birth-time hold or reading', () => {
  const envelope = withProvenanceContract()
  const nineStar = envelope.response.analyses.find((entry) => entry.system === '九星氣學')
  nineStar.reason = 'birth_time_unknown'
  assert.ok(issueCodes(envelope).includes('analysis.authority_hold_mismatch'))
})

test('registry cannot lend public or Classical authority to the held Nine Star slot', () => {
  for (const mutate of [
    (registry) => {
      registry.systems.find((entry) => entry.system === '九星氣學').public_offer_role = 'core_public_14'
      return '九星氣學'
    },
    (registry) => {
      registry.systems.find((entry) => entry.system === '九星氣學').claim_authority_scope = 'system_only'
      return '九星氣學'
    },
    (registry) => {
      registry.systems.find((entry) => entry.system === '古典占星').claim_authority_excludes = []
      return '古典占星'
    },
  ]) {
    const envelope = withProvenanceContract()
    const system = mutate(envelope.response.provenance_registry)
    syncAnalysisProvenance(envelope, system)
    assert.ok(
      issueCodes(envelope).includes('response.provenance_registry_entry_invalid'),
    )
  }
})

test('core public systems cannot be delivered while their authority remains UNVERIFIED', () => {
  const envelope = withProvenanceContract()
  const publicEntry = envelope.response.provenance_registry.systems[0]
  publicEntry.source_edition = null
  publicEntry.source_locator = null
  publicEntry.source_evidence_sha256 = null
  publicEntry.verification_status = 'UNVERIFIED'
  publicEntry.delivery_policy = 'hold'
  syncAnalysisProvenance(envelope, publicEntry.system)
  assert.ok(issueCodes(envelope).includes('response.provenance_registry_entry_invalid'))
})

test('request payload, envelope hash and signed-attestation request hash remain one identity', () => {
  const changedPayload = withProvenanceContract()
  changedPayload.requestPayload.minute = 31
  assert.ok(issueCodes(changedPayload).includes('request_hash.mismatch'))

  const changedAttestation = withProvenanceContract()
  changedAttestation.responseAttestation.requestHash = `sha256:${'9'.repeat(64)}`
  assert.ok(
    issueCodes(changedAttestation).includes('response_attestation.request_hash_mismatch'),
  )
})
