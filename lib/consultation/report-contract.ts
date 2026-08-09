import { buildAgeContext } from './age-context.ts'
import type { AgeContext as SharedAgeContext } from './age-context'
import { runDeterministicReportAudits } from './report-audits.ts'
import { sha256HexSync } from './sha256.ts'

export type { AgeStage, ReaderMode } from './age-context'

export const READING_LAYER_ORDER = [
  'quick_30s',
  'route_3m',
  'deep_read',
  'evidence_appendix',
] as const

export type ReadingLayerId = (typeof READING_LAYER_ORDER)[number]

export const MIN_EFFECTIVE_CJK = {
  C: 50_000,
  G15: 100_000,
} as const

export const MIN_PARAGRAPHS_PER_CHAPTER = {
  C: 6,
  G15: 8,
} as const

export const MIN_PARAGRAPH_CJK = 120
export const MAX_PARAGRAPH_CJK = 1_600
export const REQUIRED_PARAGRAPH_KINDS = [
  'claim',
  'scene',
  'evidence',
  'action',
  'reflection',
] as const

export type ConsultationPlan = keyof typeof MIN_EFFECTIVE_CJK

export const REQUIRED_TOPICS = {
  C: [
    'core_pattern',
    'strengths_tradeoffs',
    'stress_response',
    'relationships_boundaries',
    'work_learning',
    'money_resources',
    'body_mind_rhythm',
    'life_timing',
    'decision_rules',
    'actions_30_90_365',
  ],
  G15: [
    'family_rhythm',
    'decision_power',
    'emotion_stress',
    'resources_care',
    'boundaries',
    'intergenerational_patterns',
    'interaction_cycles',
    'repair_scripts',
    'family_meetings',
    'actions_30_90_365',
  ],
} as const

export type ConsultationTopic<P extends ConsultationPlan = ConsultationPlan> =
  (typeof REQUIRED_TOPICS)[P][number]

export const REQUIRED_AUDITS = [
  'facts_normalization',
  'cross_chapter_consistency',
  'exact_dedup',
  'near_dedup',
  'human_language',
  'age_safety',
  'grounding',
  'renderer_input_binding',
  'fresh_context',
  'cost_budget',
] as const

export type RequiredAuditKind = (typeof REQUIRED_AUDITS)[number]
export type ReportEntityId<Prefix extends string> = `${Prefix}:${string}`
export type PersonId = ReportEntityId<'person'>
export type ChapterId = ReportEntityId<'chapter'>
export type ParagraphId = ReportEntityId<'paragraph'>
export type ClaimId = ReportEntityId<'claim'>
export type FactId = ReportEntityId<'fact'>
export type EvidenceId = ReportEntityId<'evidence'>
export type SourceId = ReportEntityId<'source'>
export type InformationKind = 'claim' | 'scene' | 'timing' | 'action' | 'evidence' | 'reflection'
export type InformationId = ReportEntityId<InformationKind>

export type ReportAgeContext = SharedAgeContext & {
  personId: PersonId
  birthDate: string
}

export type PersonContext = {
  personId: PersonId
  displayName: string
  authorization: 'granted'
  birthTime: {
    status: 'exact' | 'unknown'
    confidence: 'standard' | 'reduced'
    affectedSystems: string[]
  }
}

export type SourceManifestEntry = {
  sourceId: SourceId
  kind: 'calculator' | 'client_profile' | 'client_question' | 'family_structure' | 'reference'
  title: string
  version: string
  inputHash: string
  outputHash: string
}

export type FactLedgerEntry = {
  factId: FactId
  personIds: PersonId[]
  kind: 'calculator_direct' | 'client_profile' | 'client_question' | 'family_structure'
  sourceId: SourceId
  sourcePath: string
  value: unknown
  asOfDate: string
  evidenceClass: 'calculation' | 'client_supplied' | 'traditional_interpretation' | 'reflection_only' | 'held'
  limitations: string[]
}

export type FactLedger = {
  status: 'complete'
  partialFailures: never[]
  entries: FactLedgerEntry[]
}

export type ClaimLedgerEntry = {
  claimId: ClaimId
  chapterId: ChapterId
  canonicalParagraphId: ParagraphId
  subjectPersonIds: PersonId[]
  ageTopicByPerson: Record<PersonId, string>
  supportingFactIds: FactId[]
  opposingFactIds: FactId[]
  supportingSystemIds: string[]
  opposingSystemIds: string[]
  evidenceStatus: 'convergent' | 'mixed' | 'single_system' | 'insufficient'
  evidenceIds: EvidenceId[]
  applicability: string
  invalidation: string
  conflictsWithClaimIds: ClaimId[]
  status: 'approved'
}

export type ClaimLedger = {
  status: 'complete'
  entries: ClaimLedgerEntry[]
}

export type ReportParagraph = {
  paragraphId: ParagraphId
  chapterId: ChapterId
  kind: InformationKind
  subjectPersonIds: PersonId[]
  ageTopicsByPerson: Record<PersonId, string[]>
  text: string
  newInformationIds: InformationId[]
  claimIds: ClaimId[]
  factIds: FactId[]
  fingerprint: string
}

export type ReportChapter<P extends ConsultationPlan = ConsultationPlan> = {
  chapterId: ChapterId
  topicIds: ConsultationTopic<P>[]
  title: string
  conclusionSubtitle: string
  firstReadParagraphId: ParagraphId
  paragraphIds: ParagraphId[]
  claimIds: ClaimId[]
  status: 'complete'
}

export type QuickReadingLayer = {
  items: [
    { claimId: ClaimId; conclusion: string; selfCheck: string },
    { claimId: ClaimId; conclusion: string; selfCheck: string },
    { claimId: ClaimId; conclusion: string; selfCheck: string },
  ]
}

export type RouteReadingLayer = {
  chapters: Array<{
    chapterId: ChapterId
    conclusionSubtitle: string
    firstReadParagraphId: ParagraphId
    readingLoad: 'brief' | 'focused' | 'deep'
  }>
}

export type EvidenceAppendixEntry = {
  evidenceId: EvidenceId
  label: string
  type: 'calculator_direct' | 'traditional_interpretation' | 'action_experiment'
  factIds: FactId[]
  claimIds: ClaimId[]
  sourceIds: SourceId[]
  limitations: string[]
}

export type ReportReadingLayers = {
  quick_30s: QuickReadingLayer
  route_3m: RouteReadingLayer
  deep_read: { chapterIds: ChapterId[] }
  evidence_appendix: { entries: EvidenceAppendixEntry[] }
}

export type ChapterJobReceipt = {
  jobId: ReportEntityId<'job'>
  chapterId: ChapterId
  idempotencyKey: string
  status: 'succeeded'
  attempt: number
  promptVersionHash: string
  inputHash: string
  outputHash: string
}

export type ReportAuditReceipt = {
  kind: RequiredAuditKind
  status: 'passed'
  artifactHash: string
}

export type ReportCompleteness = {
  status: 'complete'
  requiredChapterIds: ChapterId[]
  requiredClaimIds: ClaimId[]
  requiredFactIds: FactId[]
  missingData: never[]
  partialFailures: never[]
}

export type ReportSystemCoverage = {
  availableTraditionalSystemIds: string[]
  usedSystemIds: string[]
  omittedSystems: Array<{
    systemId: string
    reason: 'insufficient_direct_relevance'
  }>
}

export const RENDERER_BINDING_VERSION = 'consultation-renderer-binding/v2.0.0' as const

export type RendererBinding = {
  version: typeof RENDERER_BINDING_VERSION
  releaseReceipt: string
  contentHash: string
  artifactHash: string
}

export type ConsultationReportContract<P extends ConsultationPlan = ConsultationPlan> = {
  schemaVersion: 'consultation-report/v1'
  reportId: ReportEntityId<'report'>
  reportVersion: number
  plan: P
  locale: 'zh-TW'
  asOfDate: string
  contextHash: string
  people: PersonContext[]
  ageContexts: ReportAgeContext[]
  sourceManifest: SourceManifestEntry[]
  factLedger: FactLedger
  claimLedger: ClaimLedger
  chapters: ReportChapter<P>[]
  paragraphs: ReportParagraph[]
  readingLayers: ReportReadingLayers
  systemCoverage: ReportSystemCoverage
  rendererBinding?: RendererBinding
  chapterJobs: ChapterJobReceipt[]
  audits: ReportAuditReceipt[]
  completeness: ReportCompleteness
}

function stableRendererValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableRendererValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableRendererValue(entry)]),
    )
  }
  return value
}

export function canonicalRendererPayload(report: ConsultationReportContract): unknown {
  return stableRendererValue({
    schemaVersion: report.schemaVersion,
    reportId: report.reportId,
    reportVersion: report.reportVersion,
    plan: report.plan,
    locale: report.locale,
    asOfDate: report.asOfDate,
    contextHash: report.contextHash,
    people: report.people,
    ageContexts: report.ageContexts,
    sourceManifest: report.sourceManifest,
    factLedger: report.factLedger,
    claimLedger: report.claimLedger,
    chapters: report.chapters,
    paragraphs: report.paragraphs,
    readingLayers: report.readingLayers,
    systemCoverage: report.systemCoverage,
    chapterJobs: report.chapterJobs,
    completeness: report.completeness,
  })
}

export function createRendererBinding(
  report: ConsultationReportContract,
  releaseReceipt: string,
): RendererBinding {
  if (!/^sha256:[0-9a-f]{64}$/u.test(releaseReceipt)) {
    throw new Error('renderer release receipt 必須是 SHA-256')
  }
  const contentHash = `sha256:${sha256HexSync(JSON.stringify(canonicalRendererPayload(report)))}`
  const artifactHash = `sha256:${sha256HexSync(JSON.stringify(stableRendererValue({
    version: RENDERER_BINDING_VERSION,
    releaseReceipt,
    contentHash,
  })))}`
  return { version: RENDERER_BINDING_VERSION, releaseReceipt, contentHash, artifactHash }
}

export type ReportContractIssue = {
  code: string
  path: string
  message: string
}

export type ReportContractValidation = {
  ok: boolean
  issues: ReportContractIssue[]
  metrics: {
    effectiveCjkCharacters: number
    chapterCount: number
    claimCount: number
    factCount: number
    paragraphCount: number
  }
}

function fnv1a32(value: string, seed: number): string {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createParagraphFingerprint(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/[*_~`]+/gu, '')
    .replace(/^\s*(?:#{1,6}|>)\s*/gmu, '')
    .replace(/\s+/gu, '')
  return `p1-${fnv1a32(normalized, 0x811c9dc5)}${fnv1a32(normalized, 0x1b873593)}`
}

export function countEffectiveCjkCharacters(paragraphs: readonly ReportParagraph[]): number {
  let count = 0
  for (const paragraph of paragraphs) {
    if (typeof paragraph?.text === 'string') {
      count += paragraph.text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu)?.length ?? 0
    }
  }
  return count
}

export type ParagraphLanguageQualityIssue = {
  code: string
  message: string
}

const NATURAL_LANGUAGE_MARKERS = [
  '的', '了', '是', '在', '與', '和', '而', '但', '如果', '因此', '可以', '需要',
  '你', '他', '她', '自己', '關係', '感受', '選擇', '生活', '家庭', '工作', '經驗',
] as const

/**
 * 阻擋「字數看似達標、實際是單字／短週期／亂碼灌水」的段內品質檢查。
 * 這不是文學評分，也不判斷命理內容是否正確；只確認文字具有最低限度的自然句構與資訊熵。
 */
export function assessParagraphLanguageQuality(text: string): ParagraphLanguageQualityIssue[] {
  if (typeof text !== 'string') return [{ code: 'paragraph.language_invalid', message: '段落不是文字' }]
  const normalized = text.normalize('NFKC')
  const cjk = Array.from(normalized).filter((character) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(character))
  if (cjk.length < 80) return [] // 字數下限由既有 reading-length gate 處理，避免重複噪音。

  const issues: ParagraphLanguageQualityIssue[] = []
  let maximumRun = 1
  let currentRun = 1
  for (let index = 1; index < cjk.length; index += 1) {
    currentRun = cjk[index] === cjk[index - 1] ? currentRun + 1 : 1
    maximumRun = Math.max(maximumRun, currentRun)
  }
  if (maximumRun > 6) {
    issues.push({ code: 'paragraph.character_run', message: `同一中文字連續出現 ${maximumRun} 次，疑似灌水` })
  }

  const uniqueCharacterRatio = new Set(cjk).size / cjk.length
  if (uniqueCharacterRatio < 0.08) {
    issues.push({ code: 'paragraph.vocabulary_too_narrow', message: '中文字彙變化過低，無法視為有意義長文' })
  }

  const trigrams: string[] = []
  for (let index = 0; index <= cjk.length - 3; index += 1) {
    trigrams.push(cjk.slice(index, index + 3).join(''))
  }
  if (trigrams.length > 0 && new Set(trigrams).size / trigrams.length < 0.32) {
    issues.push({ code: 'paragraph.ngram_repetition', message: '短語循環比例過高，疑似重複填字' })
  }

  const punctuationCount = normalized.match(/[，。！？；：、,.!?;:\n]/gu)?.length ?? 0
  const minimumPunctuation = Math.max(2, Math.floor(cjk.length / 280))
  if (punctuationCount < minimumPunctuation) {
    issues.push({ code: 'paragraph.sentence_structure_missing', message: '長段落缺少可閱讀的句子與停頓結構' })
  }

  const markerCount = NATURAL_LANGUAGE_MARKERS.filter((marker) => normalized.includes(marker)).length
  if (markerCount < 4) {
    issues.push({ code: 'paragraph.language_markers_missing', message: '段落缺少最低限度的自然語言連接與生活語彙' })
  }

  const clauses = normalized
    .split(/[。！？!?；;\n]+/u)
    .map((clause) => clause.replace(/\s+/gu, '').trim())
    .filter((clause) => clause.length >= 12)
  const seenClauses = new Set<string>()
  if (clauses.some((clause) => seenClauses.has(clause) || !seenClauses.add(clause))) {
    issues.push({ code: 'paragraph.repeated_clause', message: '同一完整句塊在段內重複出現' })
  }
  return issues
}

export function collectCustomerVisibleTextEntries(
  input: Partial<ConsultationReportContract>,
): Array<{ paragraphId: string; text: string; claimIds?: string[]; subjectPersonIds?: string[] }> {
  const entries: Array<{ paragraphId: string; text: string; claimIds?: string[]; subjectPersonIds?: string[] }> = []
  const claims = Array.isArray(input.claimLedger?.entries) ? input.claimLedger.entries : []
  const claimById = new Map<string, (typeof claims)[number]>(
    claims.map((claim) => [claim.claimId, claim]),
  )
  const bindingForClaims = (claimIds: readonly string[] = []) => ({
    claimIds: [...claimIds],
    subjectPersonIds: [...new Set(claimIds.flatMap((claimId) => claimById.get(claimId)?.subjectPersonIds ?? []))],
  })
  const add = (
    paragraphId: string,
    value: unknown,
    binding: { claimIds?: string[]; subjectPersonIds?: string[] } = {},
  ) => {
    if (typeof value === 'string') entries.push({ paragraphId, text: value, ...binding })
  }
  ;(input.people ?? []).forEach((person, index) => add(`people.${index}.displayName`, person.displayName))
  ;(input.chapters ?? []).forEach((chapter, index) => {
    const binding = bindingForClaims(Array.isArray(chapter.claimIds) ? chapter.claimIds : [])
    add(`chapters.${index}.title`, chapter.title, binding)
    add(`chapters.${index}.conclusionSubtitle`, chapter.conclusionSubtitle, binding)
  })
  ;(input.paragraphs ?? []).forEach((paragraph, index) => add(`paragraphs.${index}.text`, paragraph.text, {
    claimIds: Array.isArray(paragraph.claimIds) ? [...paragraph.claimIds] : [],
    subjectPersonIds: Array.isArray(paragraph.subjectPersonIds) ? [...paragraph.subjectPersonIds] : [],
  }))
  ;(input.readingLayers?.quick_30s?.items ?? []).forEach((item, index) => {
    const binding = bindingForClaims([item.claimId])
    add(`quick.${index}.conclusion`, item.conclusion, binding)
    add(`quick.${index}.selfCheck`, item.selfCheck, binding)
  })
  ;(input.readingLayers?.evidence_appendix?.entries ?? []).forEach((entry, index) => {
    const binding = bindingForClaims(Array.isArray(entry.claimIds) ? entry.claimIds : [])
    add(`evidence.${index}.label`, entry.label, binding)
    ;(Array.isArray(entry.limitations) ? entry.limitations : []).forEach((value, limitationIndex) => {
      add(`evidence.${index}.limitations.${limitationIndex}`, value, binding)
    })
  })
  ;(input.sourceManifest ?? []).forEach((source, index) => add(`sources.${index}.title`, source.title))
  ;(input.claimLedger?.entries ?? []).forEach((claim, index) => {
    const binding = bindingForClaims(typeof claim.claimId === 'string' ? [claim.claimId] : [])
    add(`claims.${index}.applicability`, claim.applicability, binding)
    add(`claims.${index}.invalidation`, claim.invalidation, binding)
  })
  return entries
}

export function serializeCustomerVisibleText(input: Partial<ConsultationReportContract>): string {
  return collectCustomerVisibleTextEntries(input)
    .map((entry) => `[${entry.paragraphId}]\n${entry.text}`)
    .join('\n\n')
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

export function calculatorSystemFromSourcePath(sourcePath: unknown): string | null {
  if (typeof sourcePath !== 'string') return null
  return /^analyses\[system=(.+)\]$/u.exec(sourcePath)?.[1] ?? null
}

function expectedClaimEvidenceStatus(supportingSystems: readonly string[], opposingSystems: readonly string[]): ClaimLedgerEntry['evidenceStatus'] {
  if (supportingSystems.length >= 2 && opposingSystems.length > 0) return 'mixed'
  if (supportingSystems.length >= 2) return 'convergent'
  if (supportingSystems.length === 1) return 'single_system'
  return 'insufficient'
}

function validateConsultationReportContractUnsafe(input: unknown): ReportContractValidation {
  const report = input as Partial<ConsultationReportContract>
  const issues: ReportContractIssue[] = []
  const paragraphs = Array.isArray(report?.paragraphs) ? report.paragraphs : []
  const chapters = Array.isArray(report?.chapters) ? report.chapters : []
  const claims = Array.isArray(report?.claimLedger?.entries) ? report.claimLedger.entries : []
  const facts = Array.isArray(report?.factLedger?.entries) ? report.factLedger.entries : []
  const effectiveCjkCharacters = countEffectiveCjkCharacters(paragraphs)

  const validateIds = <T>(
    entries: readonly T[],
    getId: (entry: T) => unknown,
    prefix: string,
    entity: 'chapter' | 'claim' | 'fact' | 'paragraph',
  ) => {
    const seen = new Set<string>()
    entries.forEach((entry, index) => {
      const id = getId(entry)
      if (typeof id !== 'string' || !id.startsWith(`${prefix}:`) || id.length === prefix.length + 1) {
        issues.push({
          code: `${entity}.id_invalid`,
          path: `${entity}s.${index}`,
          message: `${entity} ID 格式不正確`,
        })
        return
      }
      if (seen.has(id)) {
        issues.push({
          code: `${entity}.id_duplicate`,
          path: `${entity}s.${index}`,
          message: `${entity} ID 必須唯一`,
        })
      }
      seen.add(id)
    })
  }
  validateIds(chapters, (chapter) => chapter.chapterId, 'chapter', 'chapter')
  validateIds(claims, (claim) => claim.claimId, 'claim', 'claim')
  validateIds(facts, (fact) => fact.factId, 'fact', 'fact')
  validateIds(paragraphs, (paragraph) => paragraph.paragraphId, 'paragraph', 'paragraph')

  if (!report?.factLedger || report.factLedger.status !== 'complete') {
    issues.push({ code: 'facts.incomplete', path: 'factLedger.status', message: 'facts ledger 未完整' })
  }
  if (Array.isArray(report?.factLedger?.partialFailures) && report.factLedger.partialFailures.length > 0) {
    issues.push({
      code: 'facts.partial_failure',
      path: 'factLedger.partialFailures',
      message: '排盤或資料正規化存在 partial failure',
    })
  }
  if (!report?.claimLedger || report.claimLedger.status !== 'complete') {
    issues.push({ code: 'claims.incomplete', path: 'claimLedger.status', message: 'claim ledger 未完整' })
  }

  if (report?.schemaVersion !== 'consultation-report/v1') {
    issues.push({ code: 'schema.invalid', path: 'schemaVersion', message: '報告契約版本缺失或不支援' })
  }
  if (report?.plan !== 'C' && report?.plan !== 'G15') {
    issues.push({ code: 'plan.invalid', path: 'plan', message: '報告僅支援 C 與 G15' })
  } else if (effectiveCjkCharacters < MIN_EFFECTIVE_CJK[report.plan]) {
    issues.push({
      code: 'content.too_short',
      path: 'paragraphs',
      message: `有效 CJK 字數 ${effectiveCjkCharacters} 低於 ${MIN_EFFECTIVE_CJK[report.plan]}`,
    })
  }
  if (!isSha256Hash(report?.contextHash)) {
    issues.push({
      code: 'context.hash_invalid',
      path: 'contextHash',
      message: 'immutable context 必須有 SHA-256 綁定',
    })
  }
  if (!isIsoCalendarDate(report?.asOfDate)) {
    issues.push({ code: 'as_of.invalid', path: 'asOfDate', message: '報告基準日必須是真實的 ISO 日期' })
  }
  const ageContexts = Array.isArray(report?.ageContexts) ? report.ageContexts : []
  const ageContextByPersonId = new Map(ageContexts.map((context) => [context.personId, context]))
  ageContexts.forEach((ageContext, index) => {
    if (ageContext.asOfDate !== report.asOfDate) {
      issues.push({
        code: 'as_of.age_mismatch',
        path: `ageContexts.${index}.asOfDate`,
        message: 'AgeContext 與報告基準日不一致',
      })
    }
    let expectedAgeContext: SharedAgeContext
    try {
      expectedAgeContext = buildAgeContext({
        birthDate: ageContext.birthDate,
        asOfDate: ageContext.asOfDate,
      })
    } catch {
      issues.push({
        code: 'age.birth_date_invalid',
        path: `ageContexts.${index}.birthDate`,
        message: '出生日缺失、不可能或晚於報告基準日',
      })
      return
    }
    if (ageContext.ageYears !== expectedAgeContext.ageYears) {
      issues.push({
        code: 'age.age_years_mismatch',
        path: `ageContexts.${index}.ageYears`,
        message: '實足年齡未依完整出生日與基準日計算',
      })
    }
    if (ageContext.stage !== expectedAgeContext.stage) {
      issues.push({
        code: 'age.stage_mismatch',
        path: `ageContexts.${index}.stage`,
        message: '生命階段與實足年齡不一致',
      })
    }
    if (ageContext.readerMode !== expectedAgeContext.readerMode) {
      issues.push({
        code: 'age.reader_mode_mismatch',
        path: `ageContexts.${index}.readerMode`,
        message: '讀者模式與生命階段不一致',
      })
    }
    if (ageContext.timeHorizonEndAge !== expectedAgeContext.timeHorizonEndAge) {
      issues.push({
        code: 'age.time_horizon_mismatch',
        path: `ageContexts.${index}.timeHorizonEndAge`,
        message: '時間視野與生命階段契約不一致',
      })
    }
    if (JSON.stringify(ageContext.allowedTopics) !== JSON.stringify(expectedAgeContext.allowedTopics)) {
      issues.push({
        code: 'age.allowed_topics_mismatch',
        path: `ageContexts.${index}.allowedTopics`,
        message: '可討論主題未使用共用年齡契約',
      })
    }
    if (JSON.stringify(ageContext.prohibitedTopics) !== JSON.stringify(expectedAgeContext.prohibitedTopics)) {
      issues.push({
        code: 'age.prohibited_topics_mismatch',
        path: `ageContexts.${index}.prohibitedTopics`,
        message: '年齡安全禁區未使用共用年齡契約',
      })
    }
  })
  const people = Array.isArray(report?.people) ? report.people : []
  const ageContextCounts = new Map<string, number>()
  for (const ageContext of ageContexts) {
    ageContextCounts.set(ageContext.personId, (ageContextCounts.get(ageContext.personId) ?? 0) + 1)
  }
  const seenPersonIds = new Set<string>()
  people.forEach((person, index) => {
    if (seenPersonIds.has(person.personId)) {
      issues.push({
        code: 'person.id_duplicate',
        path: `people.${index}.personId`,
        message: '人物 ID 必須唯一',
      })
    }
    seenPersonIds.add(person.personId)
    if (person.authorization !== 'granted') {
      issues.push({
        code: 'person.authorization_missing',
        path: `people.${index}.authorization`,
        message: '人物授權未完成',
      })
    }
    if (
      !person.birthTime ||
      !['exact', 'unknown'].includes(person.birthTime.status) ||
      !['standard', 'reduced'].includes(person.birthTime.confidence) ||
      !Array.isArray(person.birthTime.affectedSystems) ||
      (person.birthTime.status === 'exact' && (
        person.birthTime.confidence !== 'standard' || person.birthTime.affectedSystems.length !== 0
      )) ||
      (person.birthTime.status === 'unknown' && (
        person.birthTime.confidence !== 'reduced' || person.birthTime.affectedSystems.length === 0
      ))
    ) {
      issues.push({
        code: 'person.birth_time_confidence_invalid',
        path: `people.${index}.birthTime`,
        message: '出生時間完整度必須明確標示，未知時辰須列出受影響系統',
      })
    }
    if (ageContextCounts.get(person.personId) !== 1) {
      issues.push({
        code: 'person.age_context_missing',
        path: `people.${index}.personId`,
        message: '每位人物必須恰有一份 AgeContext',
      })
    }
  })
  facts.forEach((fact, index) => {
    if (fact.asOfDate !== report.asOfDate) {
      issues.push({
        code: 'as_of.fact_mismatch',
        path: `factLedger.entries.${index}.asOfDate`,
        message: 'fact 與報告基準日不一致',
      })
    }
    if (!['calculation', 'client_supplied', 'traditional_interpretation', 'reflection_only', 'held'].includes(fact.evidenceClass)) {
      issues.push({
        code: 'fact.evidence_class_invalid',
        path: `factLedger.entries.${index}.evidenceClass`,
        message: 'fact 必須明確標示證據層級',
      })
    }
  })
  for (const person of people) {
    if (person?.birthTime?.status !== 'unknown') continue
    const timeConfidenceFact = facts.find((fact) =>
      fact.personIds.length === 1 &&
      fact.personIds[0] === person.personId &&
      fact.sourcePath === 'request.time_confidence' &&
      fact.evidenceClass === 'client_supplied',
    )
    if (!timeConfidenceFact) {
      issues.push({
        code: 'person.birth_time_fact_missing',
        path: `people.${people.indexOf(person)}.birthTime`,
        message: '未知時辰必須有不可變的客戶輸入 fact',
      })
    }
    for (const system of person.birthTime.affectedSystems) {
      const systemFact = facts.find((fact) =>
        fact.personIds.includes(person.personId) && fact.sourcePath === `analyses[system=${system}]`,
      )
      if (!systemFact || systemFact.evidenceClass !== 'held') {
        issues.push({
          code: 'person.birth_time_sensitive_fact_not_held',
          path: `people.${people.indexOf(person)}.birthTime.affectedSystems`,
          message: `未知時辰時，${system} 不得支撐客戶結論`,
        })
      }
    }
  }
  const seenInformationIds = new Set<string>()
  const seenFingerprints = new Set<string>()
  const informationIdPattern = /^(claim|scene|timing|action|evidence|reflection):[^:]+/u
  paragraphs.forEach((paragraph, index) => {
    if (
      !paragraph ||
      typeof paragraph.text !== 'string' ||
      !Array.isArray(paragraph.newInformationIds) ||
      !Array.isArray(paragraph.claimIds) ||
      !Array.isArray(paragraph.subjectPersonIds) ||
      !paragraph.ageTopicsByPerson || typeof paragraph.ageTopicsByPerson !== 'object' ||
      !Array.isArray(paragraph.factIds) ||
      typeof paragraph.fingerprint !== 'string'
    ) {
      issues.push({
        code: 'paragraph.shape_invalid',
        path: `paragraphs.${index}`,
        message: '段落缺少文字、新資訊、依據或指紋欄位',
      })
      return
    }
    if (!Array.isArray(paragraph.newInformationIds) || paragraph.newInformationIds.length === 0) {
      issues.push({
        code: 'paragraph.no_new_information',
        path: `paragraphs.${index}.newInformationIds`,
        message: '每段必須綁定至少一個新資訊 ID',
      })
    }
    if (paragraph.claimIds.length === 0 || paragraph.subjectPersonIds.length === 0) {
      issues.push({
        code: 'paragraph.subject_missing',
        path: `paragraphs.${index}`,
        message: '每個客戶可見段落都必須引用 claim 並明確綁定適用人物',
      })
    }
    for (const informationId of paragraph.newInformationIds ?? []) {
      if (!informationIdPattern.test(informationId)) {
        issues.push({
          code: 'information_id.invalid',
          path: `paragraphs.${index}.newInformationIds`,
          message: '新資訊 ID 必須使用受控類型前綴',
        })
      } else if (seenInformationIds.has(informationId)) {
        issues.push({
          code: 'information_id.reused',
          path: `paragraphs.${index}.newInformationIds`,
          message: '新資訊 ID 只能由一個段落首次承擔',
        })
      }
      seenInformationIds.add(informationId)
    }
    const fingerprint = createParagraphFingerprint(paragraph.text)
    if (paragraph.fingerprint !== fingerprint) {
      issues.push({
        code: 'paragraph.fingerprint_mismatch',
        path: `paragraphs.${index}.fingerprint`,
        message: '段落指紋與目前內容不一致',
      })
    }
    if (seenFingerprints.has(fingerprint)) {
      issues.push({
        code: 'paragraph.duplicate_fingerprint',
        path: `paragraphs.${index}.fingerprint`,
        message: '正規化後相同的段落只能保留一處',
      })
    }
    seenFingerprints.add(fingerprint)
    for (const qualityIssue of assessParagraphLanguageQuality(paragraph.text)) {
      issues.push({
        code: qualityIssue.code,
        path: `paragraphs.${index}.text`,
        message: qualityIssue.message,
      })
    }
  })
  if (report?.plan === 'C' || report?.plan === 'G15') {
    const paragraphByChapter = new Map<string, ReportParagraph[]>()
    for (const paragraph of paragraphs) {
      if (!paragraph || typeof paragraph.chapterId !== 'string') continue
      const group = paragraphByChapter.get(paragraph.chapterId) ?? []
      group.push(paragraph)
      paragraphByChapter.set(paragraph.chapterId, group)
      const paragraphCjk = countEffectiveCjkCharacters([paragraph])
      if (paragraphCjk < MIN_PARAGRAPH_CJK || paragraphCjk > MAX_PARAGRAPH_CJK) {
        issues.push({
          code: 'paragraph.reading_length_invalid',
          path: `paragraphs.${paragraphs.indexOf(paragraph)}.text`,
          message: `段落有效中文字數必須介於 ${MIN_PARAGRAPH_CJK} 與 ${MAX_PARAGRAPH_CJK}`,
        })
      }
    }
    for (const chapter of chapters) {
      if (!chapter || typeof chapter.chapterId !== 'string') continue
      const chapterParagraphs = paragraphByChapter.get(chapter.chapterId) ?? []
      if (chapterParagraphs.length < MIN_PARAGRAPHS_PER_CHAPTER[report.plan]) {
        issues.push({
          code: 'chapter.paragraph_count_insufficient',
          path: `chapters.${chapters.indexOf(chapter)}.paragraphIds`,
          message: `每章至少需要 ${MIN_PARAGRAPHS_PER_CHAPTER[report.plan]} 個可分段閱讀的段落`,
        })
      }
      const kinds = new Set(chapterParagraphs.map((paragraph) => paragraph.kind))
      const missingKinds = REQUIRED_PARAGRAPH_KINDS.filter((kind) => !kinds.has(kind))
      if (missingKinds.length > 0) {
        issues.push({
          code: 'chapter.reading_mix_incomplete',
          path: `chapters.${chapters.indexOf(chapter)}.paragraphIds`,
          message: `每章必須同時包含結論、情境、依據、行動與反思段落；缺少 ${missingKinds.join(',')}`,
        })
      }
    }
  }
  const factIds = new Set(facts.map((fact) => fact.factId))
  const factById = new Map(facts.map((fact) => [fact.factId, fact]))
  const paragraphById = new Map(paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph]))
  const claimById = new Map(claims.map((claim) => [claim.claimId, claim]))
  const chapterById = new Map(chapters.map((chapter) => [chapter.chapterId, chapter]))
  claims.forEach((claim, index) => {
    if (
      !claim.ageTopicByPerson ||
      typeof claim.ageTopicByPerson !== 'object' ||
      Object.keys(claim.ageTopicByPerson).sort().join('|') !== [...claim.subjectPersonIds].sort().join('|') ||
      claim.subjectPersonIds.some((personId) => {
        const topic = claim.ageTopicByPerson[personId]
        return typeof topic !== 'string' || !ageContextByPersonId.get(personId)?.allowedTopics.includes(topic)
      })
    ) {
      issues.push({
        code: 'claim.age_topic_invalid',
        path: `claimLedger.entries.${index}.ageTopicByPerson`,
        message: 'claim 的逐人年齡主題必須來自該人物 AgeContext.allowedTopics',
      })
    }
    if (!Array.isArray(claim.supportingFactIds) || claim.supportingFactIds.length === 0) {
      issues.push({
        code: 'claim.supporting_fact_missing',
        path: `claimLedger.entries.${index}.supportingFactIds`,
        message: 'claim 必須有可反查的 fact',
      })
    } else {
      for (const factId of claim.supportingFactIds) {
        if (!factIds.has(factId)) {
          issues.push({
            code: 'claim.supporting_fact_missing',
            path: `claimLedger.entries.${index}.supportingFactIds`,
            message: `claim 引用不存在的 fact ${factId}`,
          })
        }
      }
      const supportingFacts = claim.supportingFactIds
        .map((factId) => factById.get(factId))
        .filter((fact): fact is FactLedgerEntry => Boolean(fact))
      if (
        supportingFacts.length > 0 &&
        supportingFacts.every((fact) => fact.evidenceClass === 'reflection_only' || fact.evidenceClass === 'held')
      ) {
        issues.push({
          code: 'claim.reflection_only_support',
          path: `claimLedger.entries.${index}.supportingFactIds`,
          message: '僅供反思或尚待驗證的系統不能單獨支撐客戶結論',
        })
      }
    }
    const opposingFactIds = Array.isArray(claim.opposingFactIds) ? claim.opposingFactIds : []
    if (
      !Array.isArray(claim.opposingFactIds) ||
      new Set(opposingFactIds).size !== opposingFactIds.length ||
      opposingFactIds.some((factId) => !factIds.has(factId) || claim.supportingFactIds.includes(factId))
    ) {
      issues.push({
        code: 'claim.opposing_fact_invalid',
        path: `claimLedger.entries.${index}.opposingFactIds`,
        message: '分歧 fact 必須存在、唯一，且不得同時標為支持依據',
      })
    }
    const supportingSystemIds = [...new Set((claim.supportingFactIds ?? [])
      .map((factId) => {
        const fact = factById.get(factId)
        return fact?.evidenceClass === 'traditional_interpretation'
          ? calculatorSystemFromSourcePath(fact.sourcePath)
          : null
      })
      .filter((system): system is string => Boolean(system)))].sort()
    const opposingSystemIds = [...new Set(opposingFactIds
      .map((factId) => {
        const fact = factById.get(factId)
        return fact?.evidenceClass === 'traditional_interpretation'
          ? calculatorSystemFromSourcePath(fact.sourcePath)
          : null
      })
      .filter((system): system is string => Boolean(system)))].sort()
    const expectedStatus = expectedClaimEvidenceStatus(supportingSystemIds, opposingSystemIds)
    if (
      !Array.isArray(claim.supportingSystemIds) ||
      !Array.isArray(claim.opposingSystemIds) ||
      [...claim.supportingSystemIds].sort().join('|') !== supportingSystemIds.join('|') ||
      [...claim.opposingSystemIds].sort().join('|') !== opposingSystemIds.join('|') ||
      claim.evidenceStatus !== expectedStatus
    ) {
      issues.push({
        code: 'claim.system_evidence_mismatch',
        path: `claimLedger.entries.${index}`,
        message: '支持、分歧系統與證據狀態必須由 fact ledger 重算，不採信模型自填標籤',
      })
    }
    if (report?.plan === 'G15') {
      const subjectIds = [...new Set(claim.subjectPersonIds)]
      const memberCount = subjectIds.length
      const hasFamilyStructure = claim.supportingFactIds.some(
        (factId) => factById.get(factId)?.kind === 'family_structure',
      )
      const hasIndividualSupport = subjectIds.every((subjectId) =>
        claim.supportingFactIds.some((factId) => {
          const fact = factById.get(factId)
          return fact?.kind !== 'family_structure' && fact?.personIds.includes(subjectId)
        }),
      )
      if (memberCount === 1 && !hasIndividualSupport && !hasFamilyStructure) {
        issues.push({
          code: 'g15.claim_support',
          path: `claimLedger.entries.${index}`,
          message: 'G15 個人視角必須由該成員的資料或明示家庭結構支持',
        })
      }
      if (memberCount > 0 && !hasIndividualSupport) {
        issues.push({
          code: 'g15.subject_fact_coverage',
          path: `claimLedger.entries.${index}.supportingFactIds`,
          message: 'G15 主張必須對每位 subjectPersonId 各有至少一項本人 fact',
        })
      }
    }
    const canonicalParagraph = paragraphById.get(claim.canonicalParagraphId)
    if (
      !canonicalParagraph ||
      canonicalParagraph.chapterId !== claim.chapterId ||
      !canonicalParagraph.claimIds.includes(claim.claimId)
    ) {
      issues.push({
        code: 'claim.canonical_paragraph_mismatch',
        path: `claimLedger.entries.${index}.canonicalParagraphId`,
        message: 'claim 必須只在所屬章節的 canonical 段落詳述',
      })
    }
  })
  const requiredSystems = [...new Set(facts
    .filter((fact) => fact.evidenceClass === 'traditional_interpretation')
    .map((fact) => calculatorSystemFromSourcePath(fact.sourcePath))
    .filter((system): system is string => Boolean(system)))].sort()
  const usedSystems = new Set(claims.flatMap((claim) => [
    ...(Array.isArray(claim.supportingSystemIds) ? claim.supportingSystemIds : []),
    ...(Array.isArray(claim.opposingSystemIds) ? claim.opposingSystemIds : []),
  ]))
  const expectedUsedSystems = requiredSystems.filter((system) => usedSystems.has(system))
  const expectedOmittedSystems = requiredSystems.filter((system) => !usedSystems.has(system))
  const coverage = report?.systemCoverage
  const actualAvailable = Array.isArray(coverage?.availableTraditionalSystemIds)
    ? [...coverage.availableTraditionalSystemIds].sort()
    : []
  const actualUsed = Array.isArray(coverage?.usedSystemIds) ? [...coverage.usedSystemIds].sort() : []
  const actualOmitted = Array.isArray(coverage?.omittedSystems)
    ? [...coverage.omittedSystems].map((entry) => entry?.systemId).filter(Boolean).sort()
    : []
  if (
    actualAvailable.join('|') !== requiredSystems.join('|') ||
    actualUsed.join('|') !== expectedUsedSystems.join('|') ||
    actualOmitted.join('|') !== expectedOmittedSystems.join('|') ||
    coverage?.omittedSystems?.some((entry) => entry.reason !== 'insufficient_direct_relevance')
  ) {
    issues.push({
      code: 'report.system_coverage_invalid',
      path: 'systemCoverage',
      message: '系統覆蓋必須逐一區分實際採用與因缺乏直接關聯而未採用，不得為湊數引用',
    })
  }
  paragraphs.forEach((paragraph, index) => {
    if (
      !paragraph ||
      !Array.isArray(paragraph.claimIds) ||
      !Array.isArray(paragraph.subjectPersonIds) ||
      !paragraph.ageTopicsByPerson ||
      typeof paragraph.ageTopicsByPerson !== 'object'
    ) return
    const linkedClaims = paragraph.claimIds.map((claimId) => claimById.get(claimId)).filter(Boolean) as ClaimLedgerEntry[]
    const expectedSubjects = [...new Set(linkedClaims.flatMap((claim) => claim.subjectPersonIds))].sort()
    const actualSubjects = [...new Set(paragraph.subjectPersonIds)].sort()
    if (
      actualSubjects.length === 0 ||
      actualSubjects.join('|') !== expectedSubjects.join('|') ||
      Object.keys(paragraph.ageTopicsByPerson ?? {}).sort().join('|') !== actualSubjects.join('|')
    ) {
      issues.push({
        code: 'paragraph.subject_binding_mismatch',
        path: `paragraphs.${index}`,
        message: '段落人物與所引用 claim 的人物範圍不一致',
      })
      return
    }
    for (const personId of actualSubjects) {
      const expectedTopics = [...new Set(linkedClaims.flatMap((claim) => claim.ageTopicByPerson[personId] ? [claim.ageTopicByPerson[personId]] : []))].sort()
      const actualTopics = [...new Set(paragraph.ageTopicsByPerson[personId] ?? [])].sort()
      if (
        expectedTopics.join('|') !== actualTopics.join('|') ||
        actualTopics.some((topic) => !ageContextByPersonId.get(personId)?.allowedTopics.includes(topic))
      ) {
        issues.push({
          code: 'paragraph.age_topic_mismatch',
          path: `paragraphs.${index}.ageTopicsByPerson.${personId}`,
          message: '段落年齡主題與 claim 或 AgeContext 不一致',
        })
      }
    }
  })
  chapters.forEach((chapter, index) => {
    for (const paragraphId of chapter.paragraphIds ?? []) {
      const paragraph = paragraphById.get(paragraphId)
      if (!paragraph || paragraph.chapterId !== chapter.chapterId) {
        issues.push({
          code: 'chapter.paragraph_missing',
          path: `chapters.${index}.paragraphIds`,
          message: `章節無法反查所屬段落 ${paragraphId}`,
        })
      }
    }
    for (const claimId of chapter.claimIds ?? []) {
      const claim = claimById.get(claimId)
      if (!claim || claim.chapterId !== chapter.chapterId) {
        issues.push({
          code: 'chapter.claim_missing',
          path: `chapters.${index}.claimIds`,
          message: `章節無法反查所屬 claim ${claimId}`,
        })
      }
    }
  })
  paragraphs.forEach((paragraph, index) => {
    if (
      !paragraph ||
      typeof paragraph.paragraphId !== 'string' ||
      !Array.isArray(paragraph.claimIds) ||
      !Array.isArray(paragraph.factIds)
    ) return
    const chapter = chapterById.get(paragraph.chapterId)
    if (!chapter || !chapter.paragraphIds.includes(paragraph.paragraphId)) {
      issues.push({
        code: 'paragraph.chapter_missing',
        path: `paragraphs.${index}.chapterId`,
        message: '段落無法反查所屬章節',
      })
    }
    if (paragraph.claimIds.some((claimId) => !claimById.has(claimId))) {
      issues.push({
        code: 'paragraph.claim_missing',
        path: `paragraphs.${index}.claimIds`,
        message: '段落引用不存在的 claim',
      })
    }
    if (paragraph.factIds.some((factId) => !factIds.has(factId))) {
      issues.push({
        code: 'paragraph.fact_missing',
        path: `paragraphs.${index}.factIds`,
        message: '段落引用不存在的 fact',
      })
    }
  })
  const jobs = Array.isArray(report?.chapterJobs) ? report.chapterJobs : []
  const jobsByChapter = new Map<string, ChapterJobReceipt[]>()
  const seenIdempotencyKeys = new Set<string>()
  jobs.forEach((job, index) => {
    if (!job.idempotencyKey || seenIdempotencyKeys.has(job.idempotencyKey)) {
      issues.push({
        code: 'chapter_job.idempotency_duplicate',
        path: `chapterJobs.${index}.idempotencyKey`,
        message: '章節 job 的冪等鍵必須唯一且不可為空',
      })
    }
    seenIdempotencyKeys.add(job.idempotencyKey)
    if (!Number.isInteger(job.attempt) || job.attempt < 1) {
      issues.push({
        code: 'chapter_job.attempt_invalid',
        path: `chapterJobs.${index}.attempt`,
        message: '章節 job attempt 必須是正整數',
      })
    }
    if (!isSha256Hash(job.promptVersionHash) || !isSha256Hash(job.inputHash) || !isSha256Hash(job.outputHash)) {
      issues.push({
        code: 'chapter_job.hash_invalid',
        path: `chapterJobs.${index}`,
        message: '章節 job 必須綁定 prompt、input 與 output hash',
      })
    }
    const chapterJobs = jobsByChapter.get(job.chapterId) ?? []
    chapterJobs.push(job)
    jobsByChapter.set(job.chapterId, chapterJobs)
  })
  chapters.forEach((chapter, index) => {
    const chapterJobs = jobsByChapter.get(chapter.chapterId) ?? []
    if (chapterJobs.length !== 1 || chapterJobs[0]?.status !== 'succeeded') {
      issues.push({
        code: 'chapter_job.incomplete',
        path: `chapters.${index}.chapterId`,
        message: '每個章節必須對應一個成功且可續跑的 job',
      })
    }
  })
  const audits = Array.isArray(report?.audits) ? report.audits : []
  audits.forEach((audit, index) => {
    if (!isSha256Hash(audit.artifactHash)) {
      issues.push({
        code: 'audit.hash_invalid',
        path: `audits.${index}.artifactHash`,
        message: 'audit 收據必須綁定實際 artifact hash',
      })
    }
  })
  for (const requiredAudit of REQUIRED_AUDITS) {
    const matchingAudits = audits.filter((audit) => audit.kind === requiredAudit)
    if (matchingAudits.length === 0) {
      issues.push({
        code: 'audit.missing',
        path: 'audits',
        message: `缺少必要 audit ${requiredAudit}`,
      })
    } else if (matchingAudits.length !== 1 || matchingAudits[0]?.status !== 'passed') {
      issues.push({
        code: 'audit.not_passed',
        path: 'audits',
        message: `audit ${requiredAudit} 未通過或重複`,
      })
    }
  }
  const rendererAudit = audits.find((audit) => audit.kind === 'renderer_input_binding')
  const rendererBinding = report?.rendererBinding
  if (Number(report?.reportVersion) >= 2 || rendererBinding !== undefined) {
    let expectedBinding: RendererBinding | null = null
    try {
      if (
        rendererBinding?.version === RENDERER_BINDING_VERSION &&
        isSha256Hash(rendererBinding.releaseReceipt) &&
        isSha256Hash(rendererBinding.contentHash) &&
        isSha256Hash(rendererBinding.artifactHash)
      ) {
        expectedBinding = createRendererBinding(report as ConsultationReportContract, rendererBinding.releaseReceipt)
      }
    } catch {
      expectedBinding = null
    }
    if (
      !expectedBinding ||
      rendererBinding?.contentHash !== expectedBinding.contentHash ||
      rendererBinding?.artifactHash !== expectedBinding.artifactHash ||
      rendererAudit?.artifactHash !== expectedBinding.artifactHash
    ) {
      issues.push({
        code: 'renderer.binding_mismatch',
        path: 'rendererBinding',
        message: '網頁與 PDF 的共同來源必須綁定完整報告、人物、摘要、依據、限制與章節內容',
      })
    }
  }
  if (report?.completeness?.status !== 'complete') {
    issues.push({
      code: 'completeness.status',
      path: 'completeness.status',
      message: '所有必要內容未完成前不得標記 complete',
    })
  }
  if (!Array.isArray(report?.completeness?.missingData) || report.completeness.missingData.length > 0) {
    issues.push({
      code: 'completeness.missing_data',
      path: 'completeness.missingData',
      message: '必要資料缺口未清零',
    })
  }
  if (!Array.isArray(report?.completeness?.partialFailures) || report.completeness.partialFailures.length > 0) {
    issues.push({
      code: 'completeness.partial_failure',
      path: 'completeness.partialFailures',
      message: '完整度台帳仍有 partial failure',
    })
  }
  const hasSameUniqueIds = (required: readonly string[] | undefined, actual: readonly string[]) => {
    if (!required || required.length !== actual.length || new Set(required).size !== required.length) return false
    const actualIds = new Set(actual)
    return required.every((id) => actualIds.has(id))
  }
  if (!hasSameUniqueIds(report?.completeness?.requiredChapterIds, chapters.map((chapter) => chapter.chapterId))) {
    issues.push({
      code: 'completeness.required_chapter_mismatch',
      path: 'completeness.requiredChapterIds',
      message: '必要章節清單必須完整覆蓋組裝內容',
    })
  }
  if (!hasSameUniqueIds(report?.completeness?.requiredClaimIds, claims.map((claim) => claim.claimId))) {
    issues.push({
      code: 'completeness.required_claim_mismatch',
      path: 'completeness.requiredClaimIds',
      message: '必要 claim 清單必須完整覆蓋組裝內容',
    })
  }
  if (!hasSameUniqueIds(report?.completeness?.requiredFactIds, facts.map((fact) => fact.factId))) {
    issues.push({
      code: 'completeness.required_fact_mismatch',
      path: 'completeness.requiredFactIds',
      message: '必要 fact 清單必須完整覆蓋組裝內容',
    })
  }
  for (const layer of READING_LAYER_ORDER) {
    if (!report?.readingLayers?.[layer]) {
      issues.push({ code: 'reading_layer.missing', path: `readingLayers.${layer}`, message: '缺少閱讀層' })
    }
  }
  const chapterIds = new Set(chapters.map((chapter) => chapter.chapterId))
  const claimIds = new Set(claims.map((claim) => claim.claimId))
  const sourceIds = new Set(
    (Array.isArray(report?.sourceManifest) ? report.sourceManifest : []).map((source) => source.sourceId),
  )
  facts.forEach((fact, index) => {
    if (!sourceIds.has(fact.sourceId)) {
      issues.push({
        code: 'fact.source_missing',
        path: `factLedger.entries.${index}.sourceId`,
        message: `fact 無法反查 source ${fact.sourceId}`,
      })
    }
    if (fact.personIds.some((personId) => !seenPersonIds.has(personId))) {
      issues.push({
        code: 'fact.person_missing',
        path: `factLedger.entries.${index}.personIds`,
        message: 'fact 引用不存在的人物',
      })
    }
  })
  const quickItems = report?.readingLayers?.quick_30s?.items
  if (quickItems && quickItems.length !== 3) {
    issues.push({
      code: 'quick_30s.item_count',
      path: 'readingLayers.quick_30s.items',
      message: '30 秒層必須剛好回答三件事',
    })
  }
  quickItems?.forEach((item, index) => {
    if (!claimIds.has(item.claimId) || !item.conclusion.trim() || !item.selfCheck.trim()) {
      issues.push({
        code: 'quick_30s.item_invalid',
        path: `readingLayers.quick_30s.items.${index}`,
        message: '30 秒層每項需有結論、自我核對與有效 claim',
      })
    }
  })
  const canonicalChapterOrder = chapters.map((chapter) => chapter.chapterId)
  const routeChapterOrder = report?.readingLayers?.route_3m?.chapters?.map((chapter) => chapter.chapterId) ?? []
  const deepChapterOrder = report?.readingLayers?.deep_read?.chapterIds ?? []
  const routeChapterIds = new Set(routeChapterOrder)
  const deepChapterIds = new Set(deepChapterOrder)
  if (routeChapterOrder.join('|') !== canonicalChapterOrder.join('|')) {
    issues.push({
      code: 'route.chapter_order_mismatch',
      path: 'readingLayers.route_3m.chapters',
      message: '3 分鐘路徑必須與完整報告使用同一章節順序',
    })
  }
  if (deepChapterOrder.join('|') !== canonicalChapterOrder.join('|')) {
    issues.push({
      code: 'deep_read.chapter_order_mismatch',
      path: 'readingLayers.deep_read.chapterIds',
      message: '網頁與 PDF 必須使用同一章節順序',
    })
  }
  for (const chapterId of chapterIds) {
    if (!routeChapterIds.has(chapterId)) {
      issues.push({
        code: 'route.chapter_missing',
        path: 'readingLayers.route_3m.chapters',
        message: `3 分鐘路徑缺少章節 ${chapterId}`,
      })
    }
    if (!deepChapterIds.has(chapterId)) {
      issues.push({
        code: 'deep_read.chapter_missing',
        path: 'readingLayers.deep_read.chapterIds',
        message: `完整深讀缺少章節 ${chapterId}`,
      })
    }
  }
  const evidenceEntries = report?.readingLayers?.evidence_appendix?.entries ?? []
  const evidenceById = new Map(evidenceEntries.map((entry) => [entry.evidenceId, entry]))
  claims.forEach((claim, index) => {
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0) {
      issues.push({
        code: 'claim.evidence_missing',
        path: `claimLedger.entries.${index}.evidenceIds`,
        message: 'claim 必須有至少一項可反查依據',
      })
    }
    for (const evidenceId of claim.evidenceIds ?? []) {
      const evidence = evidenceById.get(evidenceId)
      if (!evidence || !evidence.claimIds.includes(claim.claimId)) {
        issues.push({
          code: 'evidence.missing',
          path: `claimLedger.entries.${index}.evidenceIds`,
          message: `claim 無法反查依據 ${evidenceId}`,
        })
      }
    }
    const canonicalParagraph = paragraphById.get(claim.canonicalParagraphId)
    if (
      canonicalParagraph &&
      [...claim.supportingFactIds, ...(claim.opposingFactIds ?? [])]
        .some((factId) => !canonicalParagraph.factIds.includes(factId))
    ) {
      issues.push({
        code: 'claim.paragraph_fact_mismatch',
        path: `claimLedger.entries.${index}.canonicalParagraphId`,
        message: 'claim 的 canonical 段落必須完整引用同一組 supporting facts',
      })
    }
    const evidenceFactIds = new Set(
      (claim.evidenceIds ?? []).flatMap((evidenceId) => evidenceById.get(evidenceId)?.factIds ?? []),
    )
    if ([...claim.supportingFactIds, ...(claim.opposingFactIds ?? [])].some((factId) => !evidenceFactIds.has(factId))) {
      issues.push({
        code: 'claim.evidence_fact_mismatch',
        path: `claimLedger.entries.${index}.evidenceIds`,
        message: 'claim 的依據條目必須完整覆蓋同一組 supporting facts',
      })
    }
  })
  evidenceEntries.forEach((evidence, index) => {
    if (
      evidence.claimIds.some((claimId) => !claimIds.has(claimId)) ||
      evidence.factIds.some((factId) => !factIds.has(factId)) ||
      evidence.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
    ) {
      issues.push({
        code: 'evidence.reference_invalid',
        path: `readingLayers.evidence_appendix.entries.${index}`,
        message: '依據條目引用不存在的 claim、fact 或 source',
      })
    }
    for (const claimId of evidence.claimIds) {
      const claim = claimById.get(claimId)
      if (claim && !evidence.factIds.some((factId) => claim.supportingFactIds.includes(factId))) {
        issues.push({
          code: 'evidence.claim_fact_mismatch',
          path: `readingLayers.evidence_appendix.entries.${index}`,
          message: '依據條目與所引用 claim 沒有共同 fact',
        })
      }
    }
    const expectedSourceIds = new Set<SourceId>(
      evidence.factIds
        .map((factId) => factById.get(factId)?.sourceId)
        .filter((sourceId): sourceId is SourceId => Boolean(sourceId)),
    )
    if (
      evidence.sourceIds.some((sourceId) => !expectedSourceIds.has(sourceId)) ||
      [...expectedSourceIds].some((sourceId) => !evidence.sourceIds.includes(sourceId))
    ) {
      issues.push({
        code: 'evidence.source_fact_mismatch',
        path: `readingLayers.evidence_appendix.entries.${index}.sourceIds`,
        message: '依據來源必須與 evidence fact 的 source 精確一致',
      })
    }
  })
  const coveredTopics = new Set(chapters.flatMap((chapter) => chapter.topicIds ?? []))
  if (report?.plan === 'C' || report?.plan === 'G15') {
    for (const topic of REQUIRED_TOPICS[report.plan]) {
      if (!coveredTopics.has(topic)) {
        issues.push({ code: 'topic.missing', path: 'chapters', message: `缺少主題 ${topic}` })
      }
    }
  }

  if (report?.plan === 'G15') {
    const individuallyCovered = new Set<string>()
    const exactPairs = new Set<string>()
    for (const claim of claims) {
      const subjects = [...new Set(claim.subjectPersonIds)].sort()
      if (subjects.length === 1) individuallyCovered.add(subjects[0])
      if (subjects.length === 2) exactPairs.add(subjects.join('|'))
    }
    for (const personId of seenPersonIds) {
      if (!individuallyCovered.has(personId)) {
        issues.push({
          code: 'g15.person_perspective_missing',
          path: 'claimLedger.entries',
          message: `家族報告缺少 ${personId} 的獨立視角`,
        })
      }
    }
    const memberIds = [...seenPersonIds].sort()
    for (let left = 0; left < memberIds.length; left += 1) {
      for (let right = left + 1; right < memberIds.length; right += 1) {
        const pair = `${memberIds[left]}|${memberIds[right]}`
        if (!exactPairs.has(pair)) {
          issues.push({
            code: 'g15.pair_perspective_missing',
            path: 'claimLedger.entries',
            message: `家族報告缺少成員配對 ${pair} 的逐組互動分析`,
          })
        }
      }
    }
  }

  const deterministicAudit = runDeterministicReportAudits({
    paragraphs,
    customerVisibleTexts: collectCustomerVisibleTextEntries(report),
    ageContexts,
    claimLedger: { entries: claims },
  })
  for (const auditIssue of deterministicAudit.issues) {
    issues.push({
      code: auditIssue.code,
      path: auditIssue.paragraphIds.join(','),
      message: auditIssue.message,
    })
  }

  return {
    ok: issues.length === 0,
    issues,
    metrics: {
      effectiveCjkCharacters,
      chapterCount: chapters.length,
      claimCount: claims.length,
      factCount: facts.length,
      paragraphCount: paragraphs.length,
    },
  }
}

export function validateConsultationReportContract(input: unknown): ReportContractValidation {
  try {
    return validateConsultationReportContractUnsafe(input)
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: 'contract.shape_invalid',
          path: '$',
          message: '報告 payload 結構不完整，已停止組裝',
        },
      ],
      metrics: {
        effectiveCjkCharacters: 0,
        chapterCount: 0,
        claimCount: 0,
        factCount: 0,
        paragraphCount: 0,
      },
    }
  }
}

export class ConsultationReportContractError extends Error {
  readonly issues: ReportContractIssue[]

  constructor(issues: ReportContractIssue[]) {
    super(`Consultation report contract rejected with ${issues.length} issue(s)`)
    this.name = 'ConsultationReportContractError'
    this.issues = issues
  }
}

export function assertCompleteConsultationReportContract(
  input: unknown,
): asserts input is ConsultationReportContract {
  const validation = validateConsultationReportContract(input)
  if (!validation.ok) throw new ConsultationReportContractError(validation.issues)
}
