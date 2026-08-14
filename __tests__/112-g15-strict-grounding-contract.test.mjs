import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { attachSyntheticConsultationProvenance } from './fixtures/synthetic-consultation-provenance.mjs'

import {
  CALCULATOR_CUSTOMER_FACING_SYSTEM_COUNT,
  CALCULATOR_SYSTEM_EVIDENCE_CLASS,
  CALCULATOR_TECHNICAL_SLOT_COUNT,
  CALCULATOR_SYSTEM_MARKERS,
  EXPECTED_CALCULATOR_SYSTEMS,
  normalizeCalculatorFacts,
} from '../lib/consultation/calculator-facts.ts'
import {
  buildCalculatorRequestPayload,
  hashCalculatorRequest,
} from '../lib/consultation/calculator-request.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function strictEnvelope() {
  const requestPayload = buildCalculatorRequestPayload({
    name: '虛構家庭成員甲',
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
      : ({
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
      }))
  const envelope = {
    personId: 'person:member-a',
    asOfDate: '2026-08-09',
    targetYear: 2026,
    calculatorBundleVersion: 'git:strict-synthetic',
    requestPayload,
    requestHash,
    responseAttestation: {
      version: 'jianyuan.fly.response.v1',
      releaseId: 'git:strict-synthetic',
      calculatorCodeSha256: 'd'.repeat(64),
      keyId: 'test',
      issuedAt: 1786200000,
      requestHash,
      responseHash: `sha256:${'b'.repeat(64)}`,
      signatureHash: `sha256:${'c'.repeat(64)}`,
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
        name: '虛構家庭成員甲',
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
      systems_count: EXPECTED_CALCULATOR_SYSTEMS.length,
      expected_systems_count: EXPECTED_CALCULATOR_SYSTEMS.length,
    },
  }
  return attachSyntheticConsultationProvenance(envelope)
}

function issueCodes(envelope) {
  try {
    normalizeCalculatorFacts(envelope)
    return []
  } catch (error) {
    return Array.isArray(error?.issues) ? error.issues.map((issue) => issue.code) : [String(error)]
  }
}

test('strict consumer binds normalized input, immutable context and three-state ledger', () => {
  assert.equal(normalizeCalculatorFacts(strictEnvelope()).factLedger.status, 'complete')

  const missingEcho = strictEnvelope()
  delete missingEcho.response.normalized_input
  assert.ok(issueCodes(missingEcho).includes('response.normalized_input_missing'))

  const wrongIdentity = strictEnvelope()
  wrongIdentity.response.normalized_input.name = '另一位成員'
  assert.ok(issueCodes(wrongIdentity).includes('request_response.normalized_input_mismatch'))

  const wrongPeriod = strictEnvelope()
  wrongPeriod.response.analysis_context.target_year = 2027
  assert.ok(issueCodes(wrongPeriod).includes('request_response.analysis_context_mismatch'))

  const missingContext = strictEnvelope()
  delete missingContext.response.analysis_context
  assert.ok(issueCodes(missingContext).includes('response.analysis_context_missing'))

  const wrongLedger = strictEnvelope()
  wrongLedger.response.successful_systems.pop()
  assert.ok(issueCodes(wrongLedger).includes('response.system_ledger_mismatch'))

  const missingLedger = strictEnvelope()
  delete missingLedger.response.held_systems
  assert.ok(issueCodes(missingLedger).includes('response.system_ledger_mismatch'))
})

test('15 is a technical slot count, while customer-facing count is 14 and Nine Star stays held', () => {
  assert.equal(CALCULATOR_TECHNICAL_SLOT_COUNT, 15)
  assert.equal(CALCULATOR_CUSTOMER_FACING_SYSTEM_COUNT, 14)
  assert.equal(EXPECTED_CALCULATOR_SYSTEMS.length, CALCULATOR_TECHNICAL_SLOT_COUNT)
  assert.equal(CALCULATOR_SYSTEM_EVIDENCE_CLASS['九星氣學'], 'held')
})

test('G15 calls the attested strict calculator once per selected member and never parses prior AI prose', () => {
  const source = read('workflows/generate-report/consultation-v1.ts')
  const g15 = source.slice(source.indexOf('export async function buildStructuredG15Report'))
  assert.match(g15, /for \(const \[index, member\] of input\.familyReports\.entries\(\)\)[\s\S]*?normalizeOne\([\s\S]*?member\.birthData/u)
  assert.match(source, /existingVerified \?\? await callPythonCalculateAttested\(calculatorBirthData\)/u)
  assert.doesNotMatch(g15, /member\.(?:content|report|analysis)|match\(|exec\(|JSON\.parse\(member/u)
})

test('generation input excludes held and reflection-only facts, and family structure cannot cover a member by itself', () => {
  const source = read('lib/consultation/pipeline.ts')
  assert.match(source, /claimable[\s\S]{0,180}evidenceClass !== 'held'[\s\S]{0,180}evidenceClass !== 'reflection_only'/u)
  assert.match(source, /fact\.kind === 'family_structure'\s*\?\s*\[\]/u)
})
