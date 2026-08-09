import { suite, test, assert, assertEqual, done } from './harness.mjs'

let normalizer
let requestContract
let loadError
try {
  normalizer = await import('../lib/consultation/calculator-facts.ts')
  requestContract = await import('../lib/consultation/calculator-request.ts')
} catch (error) {
  loadError = error
}

suite('Fly 排盤回應 facts 正規化')

function makeEnvelope() {
  const requestPayload = requestContract.buildCalculatorRequestPayload({
    name: '合成測試者',
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0,
    gender: 'female',
    target_year: 2026,
    as_of: '2026-08-09',
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
  })
  const requestHash = requestContract.hashCalculatorRequest(requestPayload)
  return {
    personId: 'person:synthetic',
    asOfDate: '2026-08-09',
    targetYear: 2026,
    calculatorBundleVersion: 'git:4f83f1523f13cacb35ae18e00795fee14263d27a',
    responseAttestation: {
      version: 'jianyuan.fly.response.v1',
      releaseId: 'git:4f83f1523f13cacb35ae18e00795fee14263d27a',
      calculatorCodeSha256: 'd'.repeat(64),
      keyId: 'test',
      issuedAt: 1786200000,
      requestHash,
      responseHash: `sha256:${'b'.repeat(64)}`,
      signatureHash: `sha256:${'c'.repeat(64)}`,
    },
    requestPayload,
    requestHash,
    response: {
      systems_count: normalizer.EXPECTED_CALCULATOR_SYSTEMS.length,
      client_data: {
        name: '合成測試者',
        birth_date: '1990-01-01 12:00',
        gender: '女',
        bazi: '甲子乙丑丙寅丁卯，這是只供契約測試的完整合成四柱資料。',
        yongshen: '合成喜用木火線索',
        dayun: '合成大運資料包含起運歲數、十年區間與固定基準年，並可供測試重新核對。',
        five_elements: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
        five_elements_simple: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
      },
      analyses: normalizer.EXPECTED_CALCULATOR_SYSTEMS.map((system, index) => ({
        system,
        detail: [
          `${normalizer.CALCULATOR_SYSTEM_MARKERS[system].flatMap((marker) => [`${marker}來源`, `${marker}盤面`, `${marker}位置`, `${marker}界線`, `${marker}變化`]).join('、')}。`,
          `合成 ${system} 結果 ${index}；這是一段只用於契約測試的實質排盤內容，包含盤面位置、計算步驟、固定年度、已知限制與可重新核對的欄位。`,
          '盤面依序保留天干地支、宮位星曜、五行強弱、生剋制化、年月日時、方向節奏、關係資源、壓力反應、學習工作、決策界線與行動觀察。',
          '每個欄位均可回到同一出生輸入與目標年份重播，差異處需列明適用條件、失效情境、資料缺口、校準方法及後續核對日期。',
          '本段不作保證、診斷或角色推定，只示範具備多種可區分資訊的版本化測試資料。',
          '核對時依序比較原始輸入、轉換規則、中間盤面、最終摘要、支持線索、反面訊號與年度邊界；任一環節不一致就停止引用，保留差異而不自行補造答案。',
        ].join(''),
        good_points: [`可核對線索 ${index}：合成盤面與輸入資料的映射已保留。`],
        bad_points: [],
        warnings: [],
        improvements: [`合成改善方向 ${index}：在固定基準日後以同一輸入重播核對。`],
        score: 60 + index,
        tables: [],
        info_boxes: [],
        sub_summary: `${system} 合成摘要`,
      })),
    },
  }
}

test('15 套系統名與年度敏感集合是版本化單一來源', () => {
  assert(normalizer, `facts 模組無法載入: ${loadError?.message || 'unknown error'}`)
  assertEqual(normalizer.EXPECTED_CALCULATOR_SYSTEMS.length, 15)
  assertEqual(new Set(normalizer.EXPECTED_CALCULATOR_SYSTEMS).size, 15)
  assertEqual(
    [...normalizer.ANNUAL_SENSITIVE_SYSTEMS].sort().join(','),
    ['九星氣學', '古典占星', '塔羅牌', '奇門遁甲', '數字能量學', '生肖運勢', '風水'].sort().join(','),
  )
})

test('完整回應產生 client_data、time-confidence 與 15 個逐系統 facts，不跨系統揉成一句', () => {
  const result = normalizer.normalizeCalculatorFacts(makeEnvelope())

  assertEqual(result.factLedger.status, 'complete')
  assertEqual(result.requestIdentity.displayName, '合成測試者')
  assertEqual(result.requestIdentity.birthDate, '1990-01-01')
  assertEqual(result.requestIdentity.gender, 'female')
  assertEqual(result.factLedger.partialFailures.length, 0)
  assertEqual(result.factLedger.entries.length, 17)
  assertEqual(result.sourceManifest.length, 17)
  const confidence = result.factLedger.entries.find((fact) => fact.sourcePath === 'request.time_confidence')
  assert(confidence)
  assertEqual(confidence.value.status, 'exact')
  assertEqual(confidence.value.confidence, 'standard')
  assertEqual(confidence.value.affectedSystems.length, 0)
  const qimen = result.factLedger.entries.find((fact) => fact.sourcePath === 'analyses[system=奇門遁甲]')
  assert(qimen)
  assertEqual(qimen.value.system, '奇門遁甲')
  assertEqual(qimen.asOfDate, '2026-08-09')
  assert(qimen.limitations.some((item) => item.includes('target_year=2026')))
  assertEqual(
    result.factLedger.entries.find((fact) => fact.sourcePath === 'client_data').evidenceClass,
    'calculation',
  )
  assertEqual(qimen.evidenceClass, 'traditional_interpretation')
  for (const system of ['人類圖', '塔羅牌', '生物節律']) {
    const fact = result.factLedger.entries.find((entry) => entry.sourcePath === `analyses[system=${system}]`)
    assertEqual(fact.evidenceClass, 'reflection_only')
  }
})

test('出生時間未知時，placeholder-hour client_data 整包隔離且時辰系統全部 held', () => {
  const envelope = makeEnvelope()
  envelope.requestPayload.time_unknown = true
  envelope.requestHash = requestContract.hashCalculatorRequest(envelope.requestPayload)
  envelope.responseAttestation.requestHash = envelope.requestHash
  const sentinel = '時辰佔位敏感資料絕不可進入報告'
  envelope.response.client_data.bazi += sentinel
  envelope.response.client_data.yongshen += sentinel
  envelope.response.client_data.dayun += sentinel

  const result = normalizer.normalizeCalculatorFacts(envelope)
  assert(!JSON.stringify(result).includes(sentinel))
  const profile = result.factLedger.entries.find((fact) => fact.sourcePath === 'request.client_profile')
  assert(profile)
  assertEqual(profile.evidenceClass, 'client_supplied')
  assertEqual(profile.value.timeStatus, 'unknown')
  for (const system of normalizer.BIRTH_TIME_DEPENDENT_SYSTEMS) {
    const fact = result.factLedger.entries.find((entry) => entry.sourcePath === `analyses[system=${system}]`)
    assert(fact)
    assertEqual(fact.evidenceClass, 'held')
  }
})

test('每套 calculator 都必須有明確證據層級，反思工具不得偽裝成排盤事實', () => {
  assertEqual(
    Object.keys(normalizer.CALCULATOR_SYSTEM_EVIDENCE_CLASS).sort().join(','),
    [...normalizer.EXPECTED_CALCULATOR_SYSTEMS].sort().join(','),
  )
  assertEqual(normalizer.CALCULATOR_SYSTEM_EVIDENCE_CLASS['塔羅牌'], 'reflection_only')
  assertEqual(normalizer.CALCULATOR_SYSTEM_EVIDENCE_CLASS['生物節律'], 'reflection_only')
  assertEqual(normalizer.CALCULATOR_SYSTEM_EVIDENCE_CLASS['九星氣學'], 'held')
})

test('重複字元堆出的長字串與假欄位不得冒充實質排盤', () => {
  const padded = makeEnvelope()
  padded.response.client_data = { bazi: '甲'.repeat(40) }
  padded.response.analyses = normalizer.EXPECTED_CALCULATOR_SYSTEMS.map((system) => ({
    system,
    score: 0,
    detail: '甲'.repeat(120),
    sub_summary: '甲'.repeat(4),
    good_points: ['甲'.repeat(60)],
  }))

  let error
  try { normalizer.normalizeCalculatorFacts(padded) } catch (caught) { error = caught }
  assert(error, '低資訊重複填充必須 HOLD')
  assert(error.issues.some((issue) => issue.code === 'client_data.contract_mismatch'))
  assertEqual(error.issues.filter((issue) => issue.code === 'analysis.empty_shell').length, 15)
  assert(error.issues.some((issue) => issue.code === 'analyses.duplicate_payload'))
})

test('帶 syntactically valid 驗章收據仍不得讓任意五行與跨系統雜訊冒充權威排盤', () => {
  const arbitrary = makeEnvelope()
  arbitrary.response.client_data.bazi = '甲子乙丑'
  arbitrary.response.client_data.yongshen = '任意答案'
  arbitrary.response.client_data.five_elements = { wood: 99, fire: -99, earth: 3, metal: 4, water: 1 }
  arbitrary.response.analyses = normalizer.EXPECTED_CALCULATOR_SYSTEMS.map((system, index) => ({
    system,
    detail: `${Object.values(normalizer.CALCULATOR_SYSTEM_MARKERS).flat().join('、')}。${'這是沒有系統推導關係的任意雜訊內容'.repeat(20)}${index}`,
    sub_summary: `${system} 任意摘要`,
    good_points: ['任意線索'],
    improvements: ['任意建議'],
    score: 60 + index,
  }))
  let error
  try { normalizer.normalizeCalculatorFacts(arbitrary) } catch (caught) { error = caught }
  assert(error)
  assert(error.issues.some((issue) => issue.code === 'client_data.contract_mismatch'))
  assert(error.issues.some((issue) => issue.code === 'analyses.near_duplicate_payload'))
})

test('未起運兒童可用明確空 dayun 狀態通過，成人空 dayun 必須停止', () => {
  const child = makeEnvelope()
  Object.assign(child.requestPayload, { year: 2023, month: 5, day: 8 })
  child.requestHash = requestContract.hashCalculatorRequest(child.requestPayload)
  child.responseAttestation.requestHash = child.requestHash
  child.response.client_data.birth_date = '2023-05-08 12:00'
  child.response.client_data.dayun = ''
  child.response.client_data.dayun_status = 'not_started'
  assertEqual(normalizer.normalizeCalculatorFacts(child).factLedger.status, 'complete')

  const adult = makeEnvelope()
  adult.response.client_data.dayun = ''
  let error
  try { normalizer.normalizeCalculatorFacts(adult) } catch (caught) { error = caught }
  assert(error)
  assert(error.issues.some((issue) => issue.code === 'request_response.dayun_missing'))
})

test('回應中的姓名、出生時間與性別必須逐欄綁回同一份 request', () => {
  const mismatches = []
  const wrongName = makeEnvelope(); wrongName.response.client_data.name = '另一個人'; mismatches.push(wrongName)
  const wrongBirth = makeEnvelope(); wrongBirth.response.client_data.birth_date = '1900-01-01 00:00'; mismatches.push(wrongBirth)
  const wrongGender = makeEnvelope(); wrongGender.response.client_data.gender = '男'; mismatches.push(wrongGender)
  const wrongHash = makeEnvelope(); wrongHash.requestPayload.minute = 1; mismatches.push(wrongHash)

  for (const candidate of mismatches) {
    let error
    try { normalizer.normalizeCalculatorFacts(candidate) } catch (caught) { error = caught }
    assert(error, 'request/response 不一致時必須停止')
    assert(error.issues.some((issue) => issue.code.startsWith('request_response.') || issue.code === 'request_hash.mismatch'))
  }
})

test('Fly 驗章 requestHash 必須等於 facts envelope 的 canonical requestHash', () => {
  const envelope = makeEnvelope()
  envelope.responseAttestation.requestHash = `sha256:${'f'.repeat(64)}`
  let error
  try { normalizer.normalizeCalculatorFacts(envelope) } catch (caught) { error = caught }
  assert(error, '驗章若屬於另一份 request 必須停止')
  assert(error.issues.some((issue) => issue.code === 'response_attestation.request_hash_mismatch'))
})

test('缺系統、重複、未知系統或 systems_count 漂移全部 fail closed', () => {
  const candidates = []
  const missing = makeEnvelope()
  missing.response.analyses.pop()
  candidates.push(missing)
  const duplicate = makeEnvelope()
  duplicate.response.analyses[1].system = duplicate.response.analyses[0].system
  candidates.push(duplicate)
  const unknown = makeEnvelope()
  unknown.response.analyses[0].system = '未知術數'
  candidates.push(unknown)
  const wrongCount = makeEnvelope()
  wrongCount.response.systems_count = 14
  candidates.push(wrongCount)

  for (const candidate of candidates) {
    let error
    try { normalizer.normalizeCalculatorFacts(candidate) } catch (caught) { error = caught }
    assert(error, '回應集合不完整時必須停止')
    assertEqual(error.name, 'CalculatorFactsError')
  }
})

test('dispatcher 的 score=0 計算異常 placeholder 與任何 error 欄位都不能算成功', () => {
  const placeholder = makeEnvelope()
  placeholder.response.analyses[3].score = 0
  placeholder.response.analyses[3].sub_summary = '計算異常'
  const explicitError = makeEnvelope()
  explicitError.response.analyses[4].error = 'synthetic failure'

  for (const candidate of [placeholder, explicitError]) {
    let error
    try { normalizer.normalizeCalculatorFacts(candidate) } catch (caught) { error = caught }
    assert(error)
    assert(error.issues.some((issue) => issue.code === 'analysis.partial_failure'))
  }
})

test('15 個只有 system/score 的空殼不得冒充完整排盤', () => {
  const emptyShell = makeEnvelope()
  emptyShell.response.analyses = normalizer.EXPECTED_CALCULATOR_SYSTEMS.map((system) => ({
    system,
    score: 0,
  }))

  let error
  try { normalizer.normalizeCalculatorFacts(emptyShell) } catch (caught) { error = caught }
  assert(error, '空殼 analyses 必須 HOLD')
  assertEqual(error.name, 'CalculatorFactsError')
  assertEqual(error.issues.filter((issue) => issue.code === 'analysis.empty_shell').length, 15)
})

test('只有欄位名稱但沒有內容的 client_data 不得通過', () => {
  const emptyClient = makeEnvelope()
  emptyClient.response.client_data = { bazi: '', dayun: '' }

  let error
  try { normalizer.normalizeCalculatorFacts(emptyClient) } catch (caught) { error = caught }
  assert(error)
  assert(error.issues.some((issue) => issue.code === 'client_data.empty_shell'))
})

test('requestHash、bundle 版本、固定 targetYear 與 asOf 缺一不可', () => {
  const candidates = []
  const noHash = makeEnvelope(); noHash.requestHash = 'pending'; candidates.push(noHash)
  const noVersion = makeEnvelope(); noVersion.calculatorBundleVersion = ''; candidates.push(noVersion)
  const noYear = makeEnvelope(); noYear.targetYear = undefined; candidates.push(noYear)
  const noAsOf = makeEnvelope(); noAsOf.asOfDate = ''; candidates.push(noAsOf)

  for (const candidate of candidates) {
    let error
    try { normalizer.normalizeCalculatorFacts(candidate) } catch (caught) { error = caught }
    assert(error)
  }
})

test('同一回應改 targetYear 會改年度 facts 的來源與輸出 hash', () => {
  const first = normalizer.normalizeCalculatorFacts(makeEnvelope())
  const changedEnvelope = makeEnvelope()
  changedEnvelope.targetYear = 2040
  changedEnvelope.requestPayload.target_year = 2040
  changedEnvelope.requestHash = requestContract.hashCalculatorRequest(changedEnvelope.requestPayload)
  changedEnvelope.responseAttestation.requestHash = changedEnvelope.requestHash
  const second = normalizer.normalizeCalculatorFacts(changedEnvelope)
  const firstAnnual = first.sourceManifest.find((source) => source.sourceId.endsWith(':奇門遁甲'))
  const secondAnnual = second.sourceManifest.find((source) => source.sourceId.endsWith(':奇門遁甲'))

  assert(firstAnnual.outputHash !== secondAnnual.outputHash)
  const stable = first.sourceManifest.find((source) => source.sourceId.endsWith(':八字四柱'))
  assert(stable)
})

test('輸出順序依版本化系統清單固定，不受 API 陣列排序影響', () => {
  const first = normalizer.normalizeCalculatorFacts(makeEnvelope())
  const reversed = makeEnvelope()
  reversed.response.analyses.reverse()
  const second = normalizer.normalizeCalculatorFacts(reversed)

  assertEqual(
    first.factLedger.entries.map((fact) => fact.factId).join(','),
    second.factLedger.entries.map((fact) => fact.factId).join(','),
  )
})

test('不同家庭成員的 sourceId 與 factId 必須有命名空間，合併時不得碰撞', () => {
  const firstEnvelope = makeEnvelope()
  const secondEnvelope = makeEnvelope()
  secondEnvelope.personId = 'person:synthetic-two'
  const first = normalizer.normalizeCalculatorFacts(firstEnvelope)
  const second = normalizer.normalizeCalculatorFacts(secondEnvelope)

  assertEqual(
    new Set([...first.factLedger.entries, ...second.factLedger.entries].map((fact) => fact.factId)).size,
    first.factLedger.entries.length + second.factLedger.entries.length,
  )
  assertEqual(
    new Set([...first.sourceManifest, ...second.sourceManifest].map((source) => source.sourceId)).size,
    first.sourceManifest.length + second.sourceManifest.length,
  )
})

done()
