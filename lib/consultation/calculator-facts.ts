import type { FactLedger, SourceManifestEntry } from './report-contract'
import { sha256 } from './generation-plan.ts'
import {
  hashCalculatorRequest,
  type CalculatorRequestPayload,
} from './calculator-request.ts'
import {
  CALCULATOR_ATTESTATION_VERSION,
  type VerifiedCalculatorResponse,
} from './calculator-attestation.ts'

export const CALCULATOR_RESPONSE_CONTRACT_VERSION = 'fly-calculator-response/v1'

export const EXPECTED_CALCULATOR_SYSTEMS = [
  '八字四柱',
  '紫微斗數',
  '西洋占星',
  '吠陀占星',
  '生肖運勢',
  '數字能量學',
  '姓名學',
  '古典占星',
  '易經',
  '風水',
  '人類圖',
  '奇門遁甲',
  '塔羅牌',
  '生物節律',
  '九星氣學',
] as const

export const CALCULATOR_SYSTEM_EVIDENCE_CLASS: Record<
  (typeof EXPECTED_CALCULATOR_SYSTEMS)[number],
  'traditional_interpretation' | 'reflection_only' | 'held'
> = {
  '八字四柱': 'traditional_interpretation',
  '紫微斗數': 'traditional_interpretation',
  '西洋占星': 'traditional_interpretation',
  '吠陀占星': 'traditional_interpretation',
  '生肖運勢': 'traditional_interpretation',
  '數字能量學': 'traditional_interpretation',
  '姓名學': 'traditional_interpretation',
  '古典占星': 'traditional_interpretation',
  '易經': 'traditional_interpretation',
  '風水': 'traditional_interpretation',
  '人類圖': 'reflection_only',
  '奇門遁甲': 'traditional_interpretation',
  '塔羅牌': 'reflection_only',
  '生物節律': 'reflection_only',
  // The Fly payload is substantive, but the current calculator is explicitly
  // v0.1 and is not yet validated against a complete Sonoda authority corpus.
  // Keep it in the completeness ledger while excluding it from customer claims.
  '九星氣學': 'held',
}

export const BIRTH_TIME_DEPENDENT_SYSTEMS = new Set<string>([
  '八字四柱',
  '紫微斗數',
  '西洋占星',
  '吠陀占星',
  '生肖運勢',
  '古典占星',
  '易經',
  '風水',
  '人類圖',
  '奇門遁甲',
  '生物節律',
  '九星氣學',
])

export const CALCULATOR_SYSTEM_MARKERS: Record<
  (typeof EXPECTED_CALCULATOR_SYSTEMS)[number],
  readonly string[]
> = {
  '八字四柱': ['八字', '四柱', '日主', '天干', '地支'],
  '紫微斗數': ['紫微', '命宮', '主星', '十二宮', '四化'],
  '西洋占星': ['西洋', '太陽', '月亮', '上升', '星座', '行星'],
  '吠陀占星': ['吠陀', '拉格納', '月宿', '納克', '宮主', '達莎', 'Dasha', 'Nakshatra'],
  '生肖運勢': ['生肖', '太歲', '流年', '本命年'],
  '數字能量學': ['生命靈數', '數字', '主命數', '靈魂數', '生日數'],
  '姓名學': ['姓名', '天格', '人格', '地格', '外格', '總格', '三才', '筆畫'],
  '古典占星': ['古典', '七政', '四餘', '太乙', '行星', '星曜'],
  '易經': ['易經', '本卦', '變卦', '卦象', '爻', '世爻', '應爻'],
  '風水': ['風水', '方位', '宅', '飛星', '八宅', '五黃'],
  '人類圖': ['人類圖', '類型', '策略', '內在權威', '中心', '閘門', '輪迴交叉'],
  '奇門遁甲': ['奇門', '值符', '值使', '八門', '九星', '八神', '宮位', '局'],
  '塔羅牌': ['塔羅', '牌', '正位', '逆位', '阿爾克那'],
  '生物節律': ['生物節律', '身體', '情緒', '智力', '週期', '臨界'],
  '九星氣學': ['九星', '本命星', '月命星', '傾斜', '氣學'],
}

export const ANNUAL_SENSITIVE_SYSTEMS = new Set<string>([
  '古典占星',
  '塔羅牌',
  '奇門遁甲',
  '數字能量學',
  '生肖運勢',
  '風水',
  '九星氣學',
])

export type CalculatorAnalysis = {
  system?: unknown
  detail?: unknown
  score?: unknown
  sub_summary?: unknown
  error?: unknown
  success?: unknown
  [key: string]: unknown
}

export type CalculatorResponse = {
  systems_count?: unknown
  client_data?: unknown
  analyses?: unknown
}

export type CalculatorFactsEnvelope = {
  personId: string
  asOfDate: string
  targetYear: number
  calculatorBundleVersion: string
  requestPayload: CalculatorRequestPayload
  requestHash: string
  responseAttestation: VerifiedCalculatorResponse<Record<string, unknown>>['receipt']
  response: CalculatorResponse
}

export type CalculatorFactsIssue = {
  code: string
  path: string
  message: string
}

export class CalculatorFactsError extends Error {
  readonly issues: CalculatorFactsIssue[]

  constructor(issues: CalculatorFactsIssue[]) {
    super(`Calculator facts rejected with ${issues.length} issue(s)`)
    this.name = 'CalculatorFactsError'
    this.issues = issues
  }
}

export type NormalizedCalculatorFacts = {
  contractVersion: typeof CALCULATOR_RESPONSE_CONTRACT_VERSION
  personId: string
  asOfDate: string
  targetYear: number
  requestIdentity: {
    displayName: string
    birthDate: string
    gender: 'male' | 'female' | 'other'
    timeUnknown: boolean
    hour: number | null
    minute: number | null
  }
  sourceManifest: SourceManifestEntry[]
  factLedger: FactLedger
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const CALCULATOR_FAILURE_TEXT_PREFIX = /^(?:計算異常|計算失敗|calculator\s+error)(?:$|[\s:'"（(\[])/iu

function hasFailureValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return Boolean(value)
}

function hasCalculatorFailureText(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return CALCULATOR_FAILURE_TEXT_PREFIX.test(value.normalize('NFKC').trim())
}

// The warnings array carries a different wording from the summary fields:
// report_generator.py writes `此系統計算時發生錯誤：{e}` there while the detail
// gets `計算異常：{e}`. Anchored at the start, like the other matcher, so that
// prose mentioning an error in passing — 「本次排盤未見計算異常」 — is not
// mistaken for one.
const CALCULATOR_FAILURE_WARNING_PREFIX = /^(?:此系統計算時發生錯誤|系統計算失敗)(?:$|[\s:'"（(\[：])/iu

function hasCalculatorFailureWarning(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const text = value.normalize('NFKC').trim()
  return CALCULATOR_FAILURE_WARNING_PREFIX.test(text) || CALCULATOR_FAILURE_TEXT_PREFIX.test(text)
}

export function isCalculatorAnalysisFailure(value: unknown): boolean {
  if (!isRecord(value)) return false
  // `warnings` is checked because the producer writes the failure there too:
  // report_generator.py builds both `detail: f'計算異常：{e}'` and
  // `warnings: [f'此系統計算時發生錯誤：{e}']`. Reading only the summary fields
  // meant a placeholder whose detail happened to be neutral would sail through
  // the D／R／legacy G15 gate — and the gate's own fixture was passing on
  // `detail` alone, so nothing would have noticed.
  const warnings = Array.isArray(value.warnings) ? value.warnings : []
  return value.success === false ||
    hasFailureValue(value.error) ||
    hasCalculatorFailureText(value.sub_summary) ||
    hasCalculatorFailureText(value.summary) ||
    hasCalculatorFailureText(value.detail) ||
    warnings.some((entry) => hasCalculatorFailureWarning(entry))
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

function safeSystemId(system: string): string {
  return system.replace(/[\s/:]+/gu, '-')
}

function safePersonId(personId: string): string {
  return personId.replace(/^person:/u, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
}

function substantiveWeight(value: unknown, depth = 0): number {
  if (depth > 8 || value === null || value === undefined) return 0
  if (typeof value === 'string') return value.trim().length
  if (typeof value === 'number' && Number.isFinite(value)) return 1
  if (typeof value === 'boolean') return 1
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + substantiveWeight(item, depth + 1), 0)
  }
  if (!isRecord(value)) return 0
  return Object.entries(value).reduce((total, [key, item]) => {
    if (['system', 'score', 'success', 'error', 'status'].includes(key)) return total
    return total + substantiveWeight(item, depth + 1)
  }, 0)
}

function normalizedInformationText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\p{P}\p{S}\s]+/gu, '')
    : ''
}

function hasTextDiversity(
  value: unknown,
  minimumLength: number,
  minimumUniqueCharacters: number,
  minimumUniqueBigrams: number,
): boolean {
  const text = normalizedInformationText(value)
  if (text.length < minimumLength) return false
  const characters = Array.from(text)
  if (new Set(characters).size < minimumUniqueCharacters) return false
  let longestRun = 1
  let currentRun = 1
  const bigrams = new Set<string>()
  for (let index = 1; index < characters.length; index += 1) {
    if (characters[index] === characters[index - 1]) {
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
    } else currentRun = 1
    bigrams.add(`${characters[index - 1]}${characters[index]}`)
  }
  return longestRun <= 12 &&
    bigrams.size >= minimumUniqueBigrams &&
    bigrams.size / Math.max(1, characters.length - 1) >= 0.08
}

// A slot the calculator deliberately did not compute, because the input cannot
// support it. Today the only reason is an unknown birth time. It carries no
// analysis text and no score precisely so that it can never be mistaken for a
// reading — which also means every validator that looks for substance has to
// recognise it rather than call it an empty shell.
export function isHeldCalculatorSlot(value: unknown): boolean {
  return isRecord(value) &&
    value.status === 'held' &&
    typeof value.reason === 'string' &&
    value.reason.length > 0 &&
    value.detail === null &&
    value.score === null
}

function hasCalculatorClientContract(value: unknown): boolean {
  if (!isRecord(value)) return false
  const requiredText = ['name', 'birth_date', 'gender', 'bazi', 'yongshen']
  if (requiredText.some((key) => typeof value[key] !== 'string' || !String(value[key]).trim())) return false
  if (typeof value.dayun !== 'string') return false
  const elementValues = (key: 'five_elements' | 'five_elements_simple'): number[] | null => {
    const elementMap = value[key]
    if (!isRecord(elementMap) || Object.keys(elementMap).length !== 5) return null
    const aliases = [['木', 'wood'], ['火', 'fire'], ['土', 'earth'], ['金', 'metal'], ['水', 'water']]
    const values = aliases.map(([zh, en]) => elementMap[zh] ?? elementMap[en])
    if (values.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 12)) return null
    return values as number[]
  }
  const weighted = elementValues('five_elements')
  const simple = elementValues('five_elements_simple')
  if (!weighted || !simple) return false
  // 四柱 = 8 個字（4 天干 + 4 地支）。時辰未提供時計算器只算三柱，總和是 6，
  // 因為它拒絕用佔位中午生出第四柱——那正是我們要的行為。硬性要求 8 會把
  // 每一份未知時辰的報告擋掉。
  const baziTextForPillars = normalizedIdentityText(value.bazi)
  const declaredUnknownHour = baziTextForPillars.includes('未知')
  const expectedSimpleTotal = declaredUnknownHour ? 6 : 8
  if (simple.some((entry) => !Number.isInteger(entry)) ||
      simple.reduce((sum, entry) => sum + entry, 0) !== expectedSimpleTotal) return false
  const weightedTotal = weighted.reduce((sum, entry) => sum + entry, 0)
  const weightedFloor = declaredUnknownHour ? 4 : 6
  if (weightedTotal < weightedFloor || weightedTotal > 12) return false
  const baziText = baziTextForPillars
  const baziPairs = baziText.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/gu) ?? []
  // Three pillars plus an explicit 未知 hour is the correct shape when the
  // customer did not give a birth time — the calculator masks the hour pillar
  // rather than inventing one from a placeholder noon. Demanding four pairs
  // unconditionally rejected every unknown-birth-time report.
  // 「未知」must be present: three pairs and nothing else would mean the hour
  // pillar simply went missing, which is a different and unexplained failure.
  const hourPillarDeclaredUnknown = baziPairs.length === 3 && baziText.includes('未知')
  const pillarsOk = baziPairs.length === 4 || hourPillarDeclaredUnknown
  return pillarsOk && /[木火土金水]/u.test(String(value.yongshen))
}

function normalizedDetailForSimilarity(value: unknown): string {
  return normalizedInformationText(value)
    .replace(new RegExp(EXPECTED_CALCULATOR_SYSTEMS.join('|'), 'gu'), '')
    .replace(/[0-9０-９一二三四五六七八九十百千]+/gu, '')
    .slice(0, 260)
}

function detailShingles(value: string, width = 4): Set<string> {
  const result = new Set<string>()
  for (let index = 0; index <= value.length - width; index += 1) result.add(value.slice(index, index + width))
  return result
}

function detailSimilarity(left: string, right: string): number {
  const a = detailShingles(left)
  const b = detailShingles(right)
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function normalizedIdentityText(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : ''
}

function normalizedGender(value: unknown): 'male' | 'female' | 'other' | '' {
  const text = normalizedIdentityText(value).toLocaleLowerCase('zh-TW')
  if (['male', 'm', '男', '男性'].includes(text)) return 'male'
  if (['female', 'f', '女', '女性'].includes(text)) return 'female'
  if (['other', 'x', '其他', '不指定'].includes(text)) return 'other'
  return ''
}

function requestResponseBindingIssues(envelope: CalculatorFactsEnvelope): CalculatorFactsIssue[] {
  const issues: CalculatorFactsIssue[] = []
  if (!isRecord(envelope.requestPayload)) {
    return [{ code: 'request_payload.invalid', path: 'requestPayload', message: '缺少實際送往 Fly 的版本化 request payload' }]
  }
  if (hashCalculatorRequest(envelope.requestPayload) !== envelope.requestHash) {
    issues.push({ code: 'request_hash.mismatch', path: 'requestHash', message: 'requestHash 與本次 request payload 不一致' })
  }
  if (envelope.requestPayload.as_of !== envelope.asOfDate) {
    issues.push({ code: 'request_response.as_of_mismatch', path: 'requestPayload.as_of', message: 'request 的基準日與 facts envelope 不一致' })
  }
  if (envelope.requestPayload.target_year !== envelope.targetYear) {
    issues.push({ code: 'request_response.target_year_mismatch', path: 'requestPayload.target_year', message: 'request 的目標年與 facts envelope 不一致' })
  }
  const clientData = envelope.response?.client_data
  if (!isRecord(clientData)) return issues
  if (normalizedIdentityText(clientData.name) !== normalizedIdentityText(envelope.requestPayload.name)) {
    issues.push({ code: 'request_response.name_mismatch', path: 'response.client_data.name', message: 'Fly 回應姓名與本次 request 不一致' })
  }
  if (normalizedGender(clientData.gender) !== normalizedGender(envelope.requestPayload.gender) || !normalizedGender(clientData.gender)) {
    issues.push({ code: 'request_response.gender_mismatch', path: 'response.client_data.gender', message: 'Fly 回應性別與本次 request 不一致' })
  }
  const birthNumbers = normalizedIdentityText(clientData.birth_date).match(/\d+/gu)?.map(Number) ?? []
  const expectedBirth = [
    Number(envelope.requestPayload.year),
    Number(envelope.requestPayload.month),
    Number(envelope.requestPayload.day),
  ]
  if (envelope.requestPayload.time_unknown !== true) {
    expectedBirth.push(Number(envelope.requestPayload.hour), Number(envelope.requestPayload.minute ?? 0))
  }
  if (expectedBirth.some((value, index) => !Number.isInteger(value) || birthNumbers[index] !== value)) {
    issues.push({ code: 'request_response.birth_mismatch', path: 'response.client_data.birth_date', message: 'Fly 回應出生年月日時與本次 request 不一致' })
  }
  if (typeof clientData.dayun === 'string' && clientData.dayun.trim().length === 0) {
    const birthDate = new Date(Date.UTC(
      Number(envelope.requestPayload.year),
      Number(envelope.requestPayload.month) - 1,
      Number(envelope.requestPayload.day),
    ))
    const asOf = new Date(`${envelope.asOfDate}T00:00:00Z`)
    const approximateAge = asOf.getUTCFullYear() - birthDate.getUTCFullYear() - (
      asOf.getUTCMonth() < birthDate.getUTCMonth() ||
      (asOf.getUTCMonth() === birthDate.getUTCMonth() && asOf.getUTCDate() < birthDate.getUTCDate())
        ? 1
        : 0
    )
    if (approximateAge > 10 || (clientData.dayun_status !== undefined && clientData.dayun_status !== 'not_started')) {
      issues.push({ code: 'request_response.dayun_missing', path: 'response.client_data.dayun', message: '空白大運只接受尚未起運的兒童狀態' })
    }
  }
  return issues
}

function hasSubstantiveAnalysis(entry: Record<string, unknown>): boolean {
  const detail = typeof entry.detail === 'string' ? entry.detail.trim() : ''
  const summary = typeof entry.sub_summary === 'string' ? entry.sub_summary.trim() : ''
  const supportingFields = ['good_points', 'bad_points', 'warnings', 'improvements', 'tables', 'info_boxes']
    .filter((key) => substantiveWeight(entry[key]) > 0)

  return hasTextDiversity(detail, 200, 40, 60) &&
    normalizedInformationText(summary).length >= 4 &&
    supportingFields.length >= 2 && substantiveWeight(entry) >= 250
}

function validateEnvelope(envelope: CalculatorFactsEnvelope): CalculatorFactsIssue[] {
  const issues: CalculatorFactsIssue[] = []
  if (typeof envelope?.personId !== 'string' || !/^person:[^:]+/u.test(envelope.personId)) {
    issues.push({ code: 'person.invalid', path: 'personId', message: 'personId 格式不正確' })
  }
  if (!isIsoDate(envelope?.asOfDate)) {
    issues.push({ code: 'as_of.invalid', path: 'asOfDate', message: 'asOfDate 必須是有效 ISO 日期' })
  }
  if (!Number.isInteger(envelope?.targetYear) || envelope.targetYear < 1900 || envelope.targetYear > 2200) {
    issues.push({ code: 'target_year.invalid', path: 'targetYear', message: 'targetYear 必須明確且在支援範圍內' })
  }
  if (typeof envelope?.calculatorBundleVersion !== 'string' || !envelope.calculatorBundleVersion.trim()) {
    issues.push({ code: 'bundle_version.missing', path: 'calculatorBundleVersion', message: 'calculator bundle 版本不可為空' })
  }
  if (!isHash(envelope?.requestHash)) {
    issues.push({ code: 'request_hash.invalid', path: 'requestHash', message: '排盤 request 必須有 SHA-256' })
  }
  const attestation = envelope?.responseAttestation
  if (
    !attestation ||
    attestation.version !== CALCULATOR_ATTESTATION_VERSION ||
    attestation.releaseId !== envelope.calculatorBundleVersion ||
    !/^[0-9a-f]{64}$/u.test(attestation.calculatorCodeSha256) ||
    !isHash(attestation.requestHash) ||
    !isHash(attestation.responseHash) ||
    !isHash(attestation.signatureHash) ||
    !Number.isInteger(attestation.issuedAt) ||
    typeof attestation.keyId !== 'string' ||
    !attestation.keyId
  ) {
    issues.push({ code: 'response_attestation.invalid', path: 'responseAttestation', message: 'Fly 回應缺少已核對的版本、請求、回應與簽章證據' })
  } else if (attestation.requestHash !== envelope.requestHash) {
    issues.push({
      code: 'response_attestation.request_hash_mismatch',
      path: 'responseAttestation.requestHash',
      message: 'Fly 驗章的 request 與 facts envelope 記錄的 request 不同',
    })
  }
  if (!isRecord(envelope?.response)) {
    return [...issues, { code: 'response.invalid', path: 'response', message: 'Fly 回應不是物件' }]
  }
  issues.push(...requestResponseBindingIssues(envelope))
  if (envelope.response.systems_count !== EXPECTED_CALCULATOR_SYSTEMS.length) {
    issues.push({ code: 'systems_count.mismatch', path: 'response.systems_count', message: 'systems_count 與版本化契約不一致' })
  }
  if (!isRecord(envelope.response.client_data) || Object.keys(envelope.response.client_data).length === 0) {
    issues.push({ code: 'client_data.missing', path: 'response.client_data', message: 'client_data 缺失或空白' })
  } else if (substantiveWeight(envelope.response.client_data) < 40) {
    issues.push({ code: 'client_data.empty_shell', path: 'response.client_data', message: 'client_data 沒有足夠的可驗算內容' })
  }
  if (isRecord(envelope.response.client_data) && !hasCalculatorClientContract(envelope.response.client_data)) {
    issues.push({ code: 'client_data.contract_mismatch', path: 'response.client_data', message: 'client_data 缺少版本化排盤核心欄位或欄位型別不符' })
  }
  if (!Array.isArray(envelope.response.analyses)) {
    return [...issues, { code: 'analyses.invalid', path: 'response.analyses', message: 'analyses 必須是陣列' }]
  }
  if (envelope.response.analyses.length !== EXPECTED_CALCULATOR_SYSTEMS.length) {
    issues.push({ code: 'analyses.count_mismatch', path: 'response.analyses', message: 'analysis 數量不完整' })
  }

  const names = envelope.response.analyses.map((entry) =>
    isRecord(entry) && typeof entry.system === 'string' ? entry.system.trim() : '',
  )
  if (new Set(names).size !== names.length) {
    issues.push({ code: 'analyses.duplicate_system', path: 'response.analyses', message: 'analysis 系統名稱重複' })
  }
  const expected = new Set<string>(EXPECTED_CALCULATOR_SYSTEMS)
  const missing = EXPECTED_CALCULATOR_SYSTEMS.filter((system) => !names.includes(system))
  const unknown = names.filter((system) => !expected.has(system))
  if (missing.length > 0 || unknown.length > 0) {
    issues.push({ code: 'analyses.system_set_mismatch', path: 'response.analyses', message: 'analysis 系統集合與版本化契約不一致' })
  }
  // Held slots are meant to look alike: each one is
  // {status:'held', reason:'birth_time_unknown', detail:null, score:null}.
  // Fingerprinting them next to real readings makes six identical shells
  // collide into duplicate_payload, which would reject every unknown-birth-time
  // report. Only substantive readings are compared with each other.
  const payloadFingerprints = envelope.response.analyses.map((entry) => {
    if (!isRecord(entry)) return ''
    if (isHeldCalculatorSlot(entry)) return ''
    const { system: _system, ...payload } = entry
    return sha256(payload)
  })
  if (payloadFingerprints.filter(Boolean).length > 1 && new Set(payloadFingerprints.filter(Boolean)).size !== payloadFingerprints.filter(Boolean).length) {
    issues.push({ code: 'analyses.duplicate_payload', path: 'response.analyses', message: '不同系統回傳了實質相同的排盤 payload' })
  }
  const detailEntries = envelope.response.analyses.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.detail !== 'string') return []
    return [{ index, text: normalizedDetailForSimilarity(entry.detail) }]
  })
  let nearDuplicateFound = false
  for (let left = 0; left < detailEntries.length && !nearDuplicateFound; left += 1) {
    for (let right = left + 1; right < detailEntries.length; right += 1) {
      if (detailSimilarity(detailEntries[left].text, detailEntries[right].text) >= 0.92) {
        issues.push({
          code: 'analyses.near_duplicate_payload',
          path: `response.analyses.${detailEntries[left].index},response.analyses.${detailEntries[right].index}`,
          message: '不同系統回傳近乎相同的文字模板，不能視為獨立排盤',
        })
        nearDuplicateFound = true
        break
      }
    }
  }

  envelope.response.analyses.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push({ code: 'analysis.invalid', path: `response.analyses.${index}`, message: 'analysis 不是物件' })
      return
    }
    const summary = typeof entry.sub_summary === 'string' ? entry.sub_summary : ''
    const detail = typeof entry.detail === 'string' ? entry.detail : ''
    const system = names[index] as (typeof EXPECTED_CALCULATOR_SYSTEMS)[number]
    const markerCount = (CALCULATOR_SYSTEM_MARKERS[system] ?? [])
      .filter((marker) => detail.toLocaleLowerCase('zh-TW').includes(marker.toLocaleLowerCase('zh-TW')))
      .length
    // A held slot is a declared absence, not a thin reading. Substance checks
    // do not apply to it; what applies is that its shape is exactly the held
    // schema, which isHeldCalculatorSlot already established.
    if (isHeldCalculatorSlot(entry)) return
    const hasError = isCalculatorAnalysisFailure(entry)
    if (hasError) {
      issues.push({ code: 'analysis.partial_failure', path: `response.analyses.${index}`, message: `系統 ${names[index] || index} 回傳失敗 placeholder` })
    } else if (!hasSubstantiveAnalysis(entry)) {
      issues.push({ code: 'analysis.empty_shell', path: `response.analyses.${index}`, message: `系統 ${names[index] || index} 缺少可驗算的實質排盤內容` })
    } else if (markerCount < 2) {
      issues.push({ code: 'analysis.system_invariants_missing', path: `response.analyses.${index}.detail`, message: `系統 ${names[index] || index} 缺少該排盤的必要結構標記` })
    }
  })
  return issues
}

export function normalizeCalculatorFacts(
  envelope: CalculatorFactsEnvelope,
): NormalizedCalculatorFacts {
  const issues = validateEnvelope(envelope)
  if (issues.length > 0) throw new CalculatorFactsError(issues)

  const response = envelope.response as {
    systems_count: number
    client_data: Record<string, unknown>
    analyses: CalculatorAnalysis[]
  }
  const analysesBySystem = new Map(
    response.analyses.map((analysis) => [String(analysis.system), analysis]),
  )
  const personNamespace = safePersonId(envelope.personId)
  const timeUnknown = envelope.requestPayload.time_unknown === true
  const clientSourceId = timeUnknown
    ? `source:client-profile:${personNamespace}:birth-data` as const
    : `source:calculator:${personNamespace}:client-data` as const
  const clientFactId = timeUnknown
    ? `fact:client-profile:${personNamespace}:birth-data` as const
    : `fact:calculator:${personNamespace}:client-data` as const
  const confidenceSourceId = `source:client-profile:${personNamespace}:birth-time` as const
  const confidenceFactId = `fact:client-profile:${personNamespace}:birth-time` as const
  const affectedSystems = timeUnknown ? [...BIRTH_TIME_DEPENDENT_SYSTEMS] : []
  const safeClientValue = timeUnknown ? {
    name: normalizedIdentityText(envelope.requestPayload.name),
    birthDate: [
      Number(envelope.requestPayload.year),
      String(Number(envelope.requestPayload.month)).padStart(2, '0'),
      String(Number(envelope.requestPayload.day)).padStart(2, '0'),
    ].join('-'),
    gender: normalizedGender(envelope.requestPayload.gender),
    calendarType: envelope.requestPayload.calendar_type,
    timeStatus: 'unknown',
  } : response.client_data
  const clientOutputHash = sha256({
    contractVersion: CALCULATOR_RESPONSE_CONTRACT_VERSION,
    calculatorBundleVersion: envelope.calculatorBundleVersion,
    clientData: safeClientValue,
  })
  const sourceManifest: SourceManifestEntry[] = [{
    sourceId: clientSourceId,
    kind: timeUnknown ? 'client_profile' : 'calculator',
    title: timeUnknown ? '客戶提供的出生日期與未知時辰聲明' : '排盤共用出生資料與本命基底',
    version: envelope.calculatorBundleVersion,
    inputHash: envelope.requestHash,
    outputHash: clientOutputHash,
  }]
  const entries: FactLedger['entries'] = [{
    factId: clientFactId,
    personIds: [envelope.personId as `person:${string}`],
    kind: timeUnknown ? 'client_profile' : 'calculator_direct',
    sourceId: clientSourceId,
    sourcePath: timeUnknown ? 'request.client_profile' : 'client_data',
    value: safeClientValue,
    asOfDate: envelope.asOfDate,
    evidenceClass: timeUnknown ? 'client_supplied' : 'calculation',
    limitations: timeUnknown
      ? ['出生時間未知；Fly 回傳的 placeholder-hour client_data 已整包排除，不可進入生成 prompt']
      : ['含時序資料時，必須與報告基準日一起解讀'],
  }, {
    factId: confidenceFactId,
    personIds: [envelope.personId as `person:${string}`],
    kind: 'client_profile',
    sourceId: confidenceSourceId,
    sourcePath: 'request.time_confidence',
    value: {
      status: timeUnknown ? 'unknown' : 'exact',
      confidence: timeUnknown ? 'reduced' : 'standard',
      affectedSystems,
    },
    asOfDate: envelope.asOfDate,
    evidenceClass: 'client_supplied',
    limitations: timeUnknown
      ? ['未提供出生時間；依賴時辰或宮位的系統已停止用來支撐客戶結論']
      : ['出生時間來自本次客戶輸入，平台未另行核驗原始證明'],
  }]
  sourceManifest.push({
    sourceId: confidenceSourceId,
    kind: 'client_profile',
    title: '出生時間完整度',
    version: 'birth-time-confidence/v1',
    inputHash: envelope.requestHash,
    outputHash: sha256({ timeUnknown, affectedSystems }),
  })

  for (const system of EXPECTED_CALCULATOR_SYSTEMS) {
    const analysis = analysesBySystem.get(system)!
    const annualSensitive = ANNUAL_SENSITIVE_SYSTEMS.has(system)
    const sourceId = `source:calculator:${personNamespace}:${safeSystemId(system)}` as const
    const factId = `fact:calculator:${personNamespace}:${safeSystemId(system)}` as const
    const outputHash = sha256({
      contractVersion: CALCULATOR_RESPONSE_CONTRACT_VERSION,
      calculatorBundleVersion: envelope.calculatorBundleVersion,
      analysis,
      ...(annualSensitive ? { targetYear: envelope.targetYear, asOfDate: envelope.asOfDate } : {}),
    })
    sourceManifest.push({
      sourceId,
      kind: 'calculator',
      title: `${system} 排盤輸出`,
      version: envelope.calculatorBundleVersion,
      inputHash: envelope.requestHash,
      outputHash,
    })
    const configuredEvidenceClass = CALCULATOR_SYSTEM_EVIDENCE_CLASS[system]
    const evidenceClass = timeUnknown && BIRTH_TIME_DEPENDENT_SYSTEMS.has(system)
      ? 'held'
      : configuredEvidenceClass
    entries.push({
      factId,
      personIds: [envelope.personId as `person:${string}`],
      kind: 'calculator_direct',
      sourceId,
      sourcePath: `analyses[system=${system}]`,
      value: analysis,
      asOfDate: envelope.asOfDate,
      evidenceClass,
      limitations: [
        ...(annualSensitive
          ? [`此系統輸出對 target_year=${envelope.targetYear} 敏感，不可當成跨年度不變事實`]
          : []),
        ...(timeUnknown && BIRTH_TIME_DEPENDENT_SYSTEMS.has(system)
          ? ['出生時間未知，此系統已降為 held，不得支撐客戶結論']
          : []),
        evidenceClass === 'reflection_only'
          ? '只可作為自我反思材料，不可單獨支撐人格、健康、關係或人生決策結論'
          : evidenceClass === 'held'
            ? '來源譜系與算法尚待獨立驗證，本版不得用來支撐客戶結論'
            : '屬於該傳統系統的詮釋層，不可冒充可科學驗證的客觀事實或其他系統的推導依據',
      ],
    })
  }

  return {
    contractVersion: CALCULATOR_RESPONSE_CONTRACT_VERSION,
    personId: envelope.personId,
    asOfDate: envelope.asOfDate,
    targetYear: envelope.targetYear,
    requestIdentity: {
      displayName: normalizedIdentityText(envelope.requestPayload.name),
      birthDate: [
        Number(envelope.requestPayload.year),
        String(Number(envelope.requestPayload.month)).padStart(2, '0'),
        String(Number(envelope.requestPayload.day)).padStart(2, '0'),
      ].join('-'),
      gender: normalizedGender(envelope.requestPayload.gender) as 'male' | 'female' | 'other',
      timeUnknown: envelope.requestPayload.time_unknown === true,
      hour: envelope.requestPayload.time_unknown === true ? null : Number(envelope.requestPayload.hour),
      minute: envelope.requestPayload.time_unknown === true ? null : Number(envelope.requestPayload.minute ?? 0),
    },
    sourceManifest,
    factLedger: {
      status: 'complete',
      partialFailures: [],
      entries,
    },
  }
}
