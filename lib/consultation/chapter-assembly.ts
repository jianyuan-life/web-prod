import {
  REQUIRED_AUDITS,
  REQUIRED_PARAGRAPH_KINDS,
  assessParagraphLanguageQuality,
  assertCompleteConsultationReportContract,
  calculatorSystemFromSourcePath,
  collectCustomerVisibleTextEntries,
  countEffectiveCjkCharacters,
  createParagraphFingerprint,
  createRendererBinding,
  validateConsultationReportContract,
  type ChapterJobReceipt,
  type ClaimLedgerEntry,
  type ConsultationPlan,
  type ConsultationReportContract,
  type EvidenceAppendixEntry,
  type FactLedger,
  type InformationKind,
  type PersonContext,
  type ReportAgeContext,
  type ReportAuditReceipt,
  type ReportChapter,
  type ReportParagraph,
  type SourceManifestEntry,
} from './report-contract.ts'
import {
  runDeterministicReportAudits,
  type ReportAuditIssue as DeterministicIssue,
} from './report-audits.ts'
import {
  sha256,
  type ConsultationChapterJob,
  type ConsultationGenerationPlan,
} from './generation-plan.ts'

type LocalInformation = {
  kind: InformationKind
  localId: string
}

type RawParagraph = {
  localId: string
  kind: InformationKind
  text: string
  newInformation: LocalInformation[]
  claimLocalIds: string[]
  factIds: string[]
}

type RawClaim = {
  localId: string
  canonicalParagraphLocalId: string
  subjectPersonIds: string[]
  ageTopicByPerson: Record<string, string>
  supportingFactIds: string[]
  opposingFactIds: string[]
  evidenceLocalIds: string[]
  applicability: string
  invalidation: string
  conflictsWithClaimLocalIds: string[]
}

type RawEvidence = {
  localId: string
  label: string
  type: EvidenceAppendixEntry['type']
  factIds: string[]
  claimLocalIds: string[]
  limitations: string[]
}

export type RawConsultationChapterDraft = {
  title: string
  conclusionSubtitle: string
  quickConclusion: string
  selfCheck: string
  paragraphs: RawParagraph[]
  claims: RawClaim[]
  evidence: RawEvidence[]
}

export type ConsultationChapterDraftIssue = {
  code: string
  path: string
  message: string
}

export class ConsultationChapterDraftError extends Error {
  readonly issues: ConsultationChapterDraftIssue[]

  constructor(issues: ConsultationChapterDraftIssue[]) {
    super(`Consultation chapter draft rejected with ${issues.length} issue(s)`)
    this.name = 'ConsultationChapterDraftError'
    this.issues = issues
  }
}

export type NormalizedConsultationChapter = {
  topicId: string
  quickConclusion: string
  selfCheck: string
  chapter: ReportChapter
  paragraphs: ReportParagraph[]
  claims: ClaimLedgerEntry[]
  evidence: EvidenceAppendixEntry[]
  receipt: ChapterJobReceipt
}

export type NormalizeChapterDraftInput = {
  job: ConsultationChapterJob
  rawDraft: unknown
  allowedPersonIds: readonly string[]
  allowedAgeTopicsByPerson: Readonly<Record<string, readonly string[]>>
  sourceByFactId: Readonly<Record<string, string>>
  personIdsByFactId: Readonly<Record<string, readonly string[]>>
  systemByFactId: Readonly<Record<string, string | null>>
  attempt: number
}

const LOCAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u
const INFORMATION_KINDS = new Set<InformationKind>([
  'claim',
  'scene',
  'timing',
  'action',
  'evidence',
  'reflection',
])
const EVIDENCE_TYPES = new Set<EvidenceAppendixEntry['type']>([
  'calculator_direct',
  'traditional_interpretation',
  'action_experiment',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function localId(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_ID_PATTERN.test(value)
}

function uniqueStrings(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string') &&
    new Set(value).size === value.length
}

function addIssue(
  issues: ConsultationChapterDraftIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message })
}

function draftOutputPayload(draft: Omit<NormalizedConsultationChapter, 'receipt'>): unknown {
  return {
    topicId: draft.topicId,
    quickConclusion: draft.quickConclusion,
    selfCheck: draft.selfCheck,
    chapter: draft.chapter,
    paragraphs: draft.paragraphs,
    claims: draft.claims,
    evidence: draft.evidence,
  }
}

export function isReusableNormalizedChapter(
  job: ConsultationChapterJob,
  value: unknown,
): value is NormalizedConsultationChapter {
  if (!isRecord(value) || !isRecord(value.receipt) || !isRecord(value.chapter)) return false
  const draft = value as unknown as NormalizedConsultationChapter
  if (
    draft.topicId !== job.topicId || draft.chapter.chapterId !== job.chapterId ||
    !Array.isArray(draft.paragraphs) || !Array.isArray(draft.claims) || !Array.isArray(draft.evidence) ||
    draft.receipt.status !== 'succeeded' || draft.receipt.attempt < 1 ||
    draft.receipt.idempotencyKey !== job.idempotencyKey ||
    draft.receipt.promptVersionHash !== job.promptVersionHash ||
    draft.receipt.inputHash !== job.inputHash
  ) return false
  return draft.receipt.outputHash === sha256(draftOutputPayload({
    topicId: draft.topicId,
    quickConclusion: draft.quickConclusion,
    selfCheck: draft.selfCheck,
    chapter: draft.chapter,
    paragraphs: draft.paragraphs,
    claims: draft.claims,
    evidence: draft.evidence,
  }))
}

export function normalizeChapterDraft(
  input: NormalizeChapterDraftInput,
): NormalizedConsultationChapter {
  const issues: ConsultationChapterDraftIssue[] = []
  if (!isRecord(input.rawDraft)) {
    throw new ConsultationChapterDraftError([{ code: 'draft.invalid', path: '$', message: '章節輸出不是物件' }])
  }
  const raw = input.rawDraft as unknown as RawConsultationChapterDraft
  for (const field of ['title', 'conclusionSubtitle', 'quickConclusion', 'selfCheck'] as const) {
    if (!nonEmptyText(raw[field])) addIssue(issues, 'draft.text_missing', field, `${field} 不可為空`)
  }
  if (!Array.isArray(raw.paragraphs) || raw.paragraphs.length === 0) {
    addIssue(issues, 'paragraphs.missing', 'paragraphs', '章節至少需要一段正文')
  }
  if (!Array.isArray(raw.claims) || raw.claims.length === 0) {
    addIssue(issues, 'claims.missing', 'claims', '章節至少需要一項可追溯主張')
  }
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) {
    addIssue(issues, 'evidence.missing', 'evidence', '章節至少需要一項白話依據')
  }
  if (issues.length > 0) throw new ConsultationChapterDraftError(issues)

  // Draft references arrive from an untrusted model response as plain strings;
  // compare them against the typed job allow-list without widening the job contract.
  const allowedFacts = new Set<string>(input.job.factIds)
  const allowedPeople = new Set(input.allowedPersonIds)
  const paragraphIds = new Set<string>()
  const claimIds = new Set<string>()
  const evidenceIds = new Set<string>()
  const informationIds = new Set<string>()

  raw.paragraphs.forEach((paragraph, index) => {
    if (!isRecord(paragraph) || !localId(paragraph.localId) || paragraphIds.has(paragraph.localId)) {
      addIssue(issues, 'paragraph.id_invalid', `paragraphs.${index}.localId`, '段落 localId 缺失、重複或格式錯誤')
    } else paragraphIds.add(paragraph.localId)
    if (!INFORMATION_KINDS.has(paragraph.kind)) {
      addIssue(issues, 'paragraph.kind_invalid', `paragraphs.${index}.kind`, '段落類型不支援')
    }
    if (!nonEmptyText(paragraph.text)) {
      addIssue(issues, 'paragraph.text_missing', `paragraphs.${index}.text`, '段落文字不可為空')
    }
    const paragraphCjk = typeof paragraph.text === 'string'
      ? (paragraph.text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu)?.length ?? 0)
      : 0
    if (paragraphCjk < input.job.minimumParagraphCjk || paragraphCjk > input.job.maximumParagraphCjk) {
      addIssue(
        issues,
        'paragraph.reading_length_invalid',
        `paragraphs.${index}.text`,
        `段落有效中文字數 ${paragraphCjk} 必須介於 ${input.job.minimumParagraphCjk} 與 ${input.job.maximumParagraphCjk}`,
      )
    }
    if (typeof paragraph.text === 'string') {
      for (const qualityIssue of assessParagraphLanguageQuality(paragraph.text)) {
        addIssue(issues, qualityIssue.code, `paragraphs.${index}.text`, qualityIssue.message)
      }
    }
    if (!uniqueStrings(paragraph.claimLocalIds) || paragraph.claimLocalIds.length === 0 || !uniqueStrings(paragraph.factIds)) {
      addIssue(issues, 'paragraph.references_invalid', `paragraphs.${index}`, '段落引用必須是唯一字串陣列')
    } else if (paragraph.factIds.length === 0 || paragraph.factIds.some((factId) => !allowedFacts.has(factId))) {
      addIssue(issues, 'paragraph.fact_out_of_scope', `paragraphs.${index}.factIds`, '段落引用了本章以外或空白 fact')
    }
    if (!Array.isArray(paragraph.newInformation) || paragraph.newInformation.length === 0) {
      addIssue(issues, 'paragraph.new_information_missing', `paragraphs.${index}.newInformation`, '每段至少要新增一項資訊')
    } else {
      for (const [infoIndex, information] of paragraph.newInformation.entries()) {
        if (!isRecord(information) || !INFORMATION_KINDS.has(information.kind as InformationKind) || !localId(information.localId)) {
          addIssue(issues, 'information.invalid', `paragraphs.${index}.newInformation.${infoIndex}`, '新資訊 ID 格式不正確')
          continue
        }
        const canonical = `${information.kind}:${input.job.topicId}:${information.localId}`
        if (informationIds.has(canonical)) {
          addIssue(issues, 'information.duplicate', `paragraphs.${index}.newInformation.${infoIndex}`, '新資訊只能首次出現一次')
        }
        informationIds.add(canonical)
      }
    }
  })

  if (raw.paragraphs.length < input.job.minimumParagraphs) {
    addIssue(issues, 'chapter.paragraph_count_insufficient', 'paragraphs', `本章至少需要 ${input.job.minimumParagraphs} 段`)
  }
  const paragraphKinds = new Set(raw.paragraphs.map((paragraph) => paragraph.kind))
  const missingKinds = REQUIRED_PARAGRAPH_KINDS.filter((kind) => !paragraphKinds.has(kind))
  if (missingKinds.length > 0) {
    addIssue(issues, 'chapter.reading_mix_incomplete', 'paragraphs', `缺少必要段落類型 ${missingKinds.join(',')}`)
  }

  raw.claims.forEach((claim, index) => {
    if (!isRecord(claim) || !localId(claim.localId) || claimIds.has(claim.localId)) {
      addIssue(issues, 'claim.id_invalid', `claims.${index}.localId`, 'claim localId 缺失、重複或格式錯誤')
    } else claimIds.add(claim.localId)
    if (!localId(claim.canonicalParagraphLocalId)) {
      addIssue(issues, 'claim.paragraph_invalid', `claims.${index}.canonicalParagraphLocalId`, 'canonical 段落格式不正確')
    }
    if (!uniqueStrings(claim.subjectPersonIds) || claim.subjectPersonIds.length === 0 || claim.subjectPersonIds.some((id) => !allowedPeople.has(id))) {
      addIssue(issues, 'claim.person_out_of_scope', `claims.${index}.subjectPersonIds`, 'claim 引用未知或空白人物')
    }
    if (
      !isRecord(claim.ageTopicByPerson) ||
      Object.keys(claim.ageTopicByPerson).sort().join('|') !== [...claim.subjectPersonIds].sort().join('|') ||
      claim.subjectPersonIds.some((personId) =>
        typeof claim.ageTopicByPerson[personId] !== 'string' ||
        !input.allowedAgeTopicsByPerson[personId]?.includes(claim.ageTopicByPerson[personId]),
      )
    ) {
      addIssue(issues, 'claim.age_topic_invalid', `claims.${index}.ageTopicByPerson`, '每位主張對象都必須選用該年齡層允許的主題')
    }
    if (!uniqueStrings(claim.supportingFactIds) || claim.supportingFactIds.length === 0 || claim.supportingFactIds.some((id) => !allowedFacts.has(id))) {
      addIssue(issues, 'claim.fact_out_of_scope', `claims.${index}.supportingFactIds`, 'claim 引用本章以外或空白 fact')
    }
    if (
      !uniqueStrings(claim.opposingFactIds) ||
      claim.opposingFactIds.some((id) => !allowedFacts.has(id) || claim.supportingFactIds.includes(id))
    ) {
      addIssue(issues, 'claim.opposing_fact_invalid', `claims.${index}.opposingFactIds`, '分歧 fact 必須在本章範圍內，且不得同時列為支持 fact')
    }
    if (
      uniqueStrings(claim.subjectPersonIds) &&
      uniqueStrings(claim.supportingFactIds) &&
      claim.subjectPersonIds.some((personId) =>
        !claim.supportingFactIds.some((factId) => input.personIdsByFactId[factId]?.includes(personId)),
      )
    ) {
      addIssue(issues, 'claim.subject_fact_coverage', `claims.${index}.supportingFactIds`, '每位主張對象都必須有至少一項本人 fact')
    }
    if (!uniqueStrings(claim.evidenceLocalIds) || claim.evidenceLocalIds.length === 0 || !uniqueStrings(claim.conflictsWithClaimLocalIds)) {
      addIssue(issues, 'claim.references_invalid', `claims.${index}`, 'claim 的 evidence 或 conflict 引用格式不正確')
    }
    if (!nonEmptyText(claim.applicability) || !nonEmptyText(claim.invalidation)) {
      addIssue(issues, 'claim.boundary_missing', `claims.${index}`, 'claim 必須說明適用與失效條件')
    }
  })

  raw.evidence.forEach((evidence, index) => {
    if (!isRecord(evidence) || !localId(evidence.localId) || evidenceIds.has(evidence.localId)) {
      addIssue(issues, 'evidence.id_invalid', `evidence.${index}.localId`, 'evidence localId 缺失、重複或格式錯誤')
    } else evidenceIds.add(evidence.localId)
    if (!nonEmptyText(evidence.label) || !EVIDENCE_TYPES.has(evidence.type)) {
      addIssue(issues, 'evidence.shape_invalid', `evidence.${index}`, 'evidence 標籤或類型不正確')
    }
    if (!uniqueStrings(evidence.factIds) || evidence.factIds.length === 0 || evidence.factIds.some((id) => !allowedFacts.has(id) || !input.sourceByFactId[id])) {
      addIssue(issues, 'evidence.fact_out_of_scope', `evidence.${index}.factIds`, 'evidence 引用無來源或本章以外的 fact')
    }
    if (!uniqueStrings(evidence.claimLocalIds) || evidence.claimLocalIds.length === 0 || !Array.isArray(evidence.limitations)) {
      addIssue(issues, 'evidence.references_invalid', `evidence.${index}`, 'evidence 的 claim 或限制格式不正確')
    }
  })

  if (issues.length === 0) {
    raw.paragraphs.forEach((paragraph, index) => {
      if (paragraph.claimLocalIds.some((id) => !claimIds.has(id))) {
        addIssue(issues, 'paragraph.claim_missing', `paragraphs.${index}.claimLocalIds`, '段落引用不存在的 claim')
      }
    })
    raw.claims.forEach((claim, index) => {
      const canonical = raw.paragraphs.find((paragraph) => paragraph.localId === claim.canonicalParagraphLocalId)
      if (!canonical || !canonical.claimLocalIds.includes(claim.localId)) {
        addIssue(issues, 'claim.canonical_mismatch', `claims.${index}.canonicalParagraphLocalId`, 'canonical 段落不存在或未反向引用 claim')
      }
      if (claim.evidenceLocalIds.some((id) => !evidenceIds.has(id)) || claim.conflictsWithClaimLocalIds.some((id) => !claimIds.has(id))) {
        addIssue(issues, 'claim.reference_missing', `claims.${index}`, 'claim 引用不存在的 evidence 或 conflict')
      }
      if (canonical && [...claim.supportingFactIds, ...claim.opposingFactIds].some((factId) => !canonical.factIds.includes(factId))) {
        addIssue(issues, 'claim.paragraph_fact_mismatch', `claims.${index}.canonicalParagraphLocalId`, 'canonical 段落必須完整引用 claim 的 supporting facts')
      }
      const evidenceFacts = new Set(
        raw.evidence
          .filter((entry) => claim.evidenceLocalIds.includes(entry.localId))
          .flatMap((entry) => entry.factIds),
      )
      if ([...claim.supportingFactIds, ...claim.opposingFactIds].some((factId) => !evidenceFacts.has(factId))) {
        addIssue(issues, 'claim.evidence_fact_mismatch', `claims.${index}.evidenceLocalIds`, 'claim 的 evidence 必須完整覆蓋 supporting facts')
      }
    })
    raw.evidence.forEach((evidence, index) => {
      if (evidence.claimLocalIds.some((id) => !claimIds.has(id))) {
        addIssue(issues, 'evidence.claim_missing', `evidence.${index}.claimLocalIds`, 'evidence 引用不存在的 claim')
      }
      if (evidence.claimLocalIds.some((claimId) => {
        const claim = raw.claims.find((entry) => entry.localId === claimId)
        return claim && !evidence.factIds.some((factId) =>
          claim.supportingFactIds.includes(factId) || claim.opposingFactIds.includes(factId),
        )
      })) {
        addIssue(issues, 'evidence.claim_fact_mismatch', `evidence.${index}`, 'evidence 與所引用 claim 必須有共同 fact')
      }
    })
  }

  for (const [coverageIndex, required] of input.job.requiredSubjectPersonIds.entries()) {
    const expected = [...required].sort().join('|')
    const covered = raw.claims.some((claim) => [...new Set(claim.subjectPersonIds)].sort().join('|') === expected)
    if (!covered) {
      addIssue(issues, 'claim.required_subject_missing', `requiredSubjectPersonIds.${coverageIndex}`, `本章缺少指定人物組合 ${expected}`)
    }
  }

  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    addIssue(issues, 'attempt.invalid', 'attempt', 'attempt 必須是正整數')
  }
  const cjkCount = (raw.paragraphs ?? []).reduce(
    (sum, paragraph) => sum + (paragraph.text?.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu)?.length ?? 0),
    0,
  )
  if (cjkCount < input.job.minimumEffectiveCjk) {
    addIssue(issues, 'chapter.too_short', 'paragraphs', `本章有效 CJK ${cjkCount} 低於 ${input.job.minimumEffectiveCjk}`)
  }
  if (issues.length > 0) throw new ConsultationChapterDraftError(issues)

  const chapterId = input.job.chapterId
  const rawClaimById = new Map(raw.claims.map((claim) => [claim.localId, claim]))
  const paragraphs: ReportParagraph[] = raw.paragraphs.map((paragraph) => {
    const text = paragraph.text.trim()
    const paragraphClaims = paragraph.claimLocalIds.map((claimId) => rawClaimById.get(claimId)!)
    const subjectPersonIds = [...new Set(paragraphClaims.flatMap((claim) => claim.subjectPersonIds))]
    const ageTopicsByPerson = Object.fromEntries(subjectPersonIds.map((personId) => {
      const topics = [...new Set(paragraphClaims.flatMap((claim) => claim.ageTopicByPerson[personId] ? [claim.ageTopicByPerson[personId]] : []))]
      return [personId, topics]
    }))
    return {
      paragraphId: `paragraph:${input.job.topicId}:${paragraph.localId}`,
      chapterId,
      kind: paragraph.kind,
      subjectPersonIds,
      ageTopicsByPerson,
      text,
      newInformationIds: paragraph.newInformation.map(
        (information) => `${information.kind}:${input.job.topicId}:${information.localId}`,
      ),
      claimIds: paragraph.claimLocalIds.map((id) => `claim:${input.job.topicId}:${id}`),
      factIds: [...paragraph.factIds],
      fingerprint: createParagraphFingerprint(text),
    } as ReportParagraph
  })
  const claims: ClaimLedgerEntry[] = raw.claims.map((claim) => {
    const supportingSystemIds = [...new Set(claim.supportingFactIds
      .map((factId) => input.systemByFactId[factId])
      .filter((system): system is string => Boolean(system)))].sort()
    const opposingSystemIds = [...new Set(claim.opposingFactIds
      .map((factId) => input.systemByFactId[factId])
      .filter((system): system is string => Boolean(system)))].sort()
    const evidenceStatus: ClaimLedgerEntry['evidenceStatus'] = supportingSystemIds.length >= 2
      ? (opposingSystemIds.length > 0 ? 'mixed' : 'convergent')
      : supportingSystemIds.length === 1
        ? 'single_system'
        : 'insufficient'
    return {
    claimId: `claim:${input.job.topicId}:${claim.localId}`,
    chapterId,
    canonicalParagraphId: `paragraph:${input.job.topicId}:${claim.canonicalParagraphLocalId}`,
    subjectPersonIds: [...claim.subjectPersonIds],
    ageTopicByPerson: { ...claim.ageTopicByPerson },
    supportingFactIds: [...claim.supportingFactIds],
    opposingFactIds: [...claim.opposingFactIds],
    supportingSystemIds,
    opposingSystemIds,
    evidenceStatus,
    evidenceIds: claim.evidenceLocalIds.map((id) => `evidence:${input.job.topicId}:${id}`),
    applicability: claim.applicability.trim(),
    invalidation: claim.invalidation.trim(),
    conflictsWithClaimIds: claim.conflictsWithClaimLocalIds.map((id) => `claim:${input.job.topicId}:${id}`),
    status: 'approved',
  } as ClaimLedgerEntry
  })
  const evidence: EvidenceAppendixEntry[] = raw.evidence.map((entry) => ({
    evidenceId: `evidence:${input.job.topicId}:${entry.localId}`,
    label: entry.label.trim(),
    type: entry.type,
    factIds: [...entry.factIds],
    claimIds: entry.claimLocalIds.map((id) => `claim:${input.job.topicId}:${id}`),
    sourceIds: [...new Set(entry.factIds.map((factId) => input.sourceByFactId[factId]))],
    limitations: entry.limitations.map((item) => String(item).trim()).filter(Boolean),
  } as EvidenceAppendixEntry))
  const chapter: ReportChapter = {
    chapterId,
    topicIds: [input.job.topicId] as ReportChapter['topicIds'],
    title: raw.title.trim(),
    conclusionSubtitle: raw.conclusionSubtitle.trim(),
    firstReadParagraphId: paragraphs[0].paragraphId,
    paragraphIds: paragraphs.map((paragraph) => paragraph.paragraphId),
    claimIds: claims.map((claim) => claim.claimId),
    status: 'complete',
  }
  const normalizedWithoutReceipt = {
    topicId: input.job.topicId,
    quickConclusion: raw.quickConclusion.trim(),
    selfCheck: raw.selfCheck.trim(),
    chapter,
    paragraphs,
    claims,
    evidence,
  }
  const deterministicAudit = runDeterministicReportAudits({
    paragraphs,
    customerVisibleTexts: [
      raw.title,
      raw.conclusionSubtitle,
      raw.quickConclusion,
      raw.selfCheck,
      ...raw.paragraphs.map((paragraph) => paragraph.text),
      ...raw.claims.flatMap((claim) => [claim.applicability, claim.invalidation]),
      ...raw.evidence.flatMap((entry) => [entry.label, ...entry.limitations]),
    ].map((text, index) => ({ paragraphId: `visible:${input.job.topicId}:${index}`, text })),
  })
  if (!deterministicAudit.ok) {
    throw new ConsultationChapterDraftError(deterministicAudit.issues.map((audit) => ({
      code: audit.code,
      path: audit.paragraphIds.join(','),
      message: audit.message,
    })))
  }
  return {
    ...normalizedWithoutReceipt,
    receipt: {
      jobId: `job:${input.job.topicId}`,
      chapterId,
      idempotencyKey: input.job.idempotencyKey,
      status: 'succeeded',
      attempt: input.attempt,
      promptVersionHash: input.job.promptVersionHash,
      inputHash: input.job.inputHash,
      outputHash: sha256(draftOutputPayload(normalizedWithoutReceipt)),
    },
  }
}

export type AssembleConsultationReportInput = {
  reportId: `report:${string}`
  reportVersion: number
  plan: ConsultationPlan
  locale: 'zh-TW'
  asOfDate: string
  contextHash: string
  people: PersonContext[]
  ageContexts: ReportAgeContext[]
  sourceManifest: SourceManifestEntry[]
  factLedger: FactLedger
  generationPlan: ConsultationGenerationPlan
  drafts: NormalizedConsultationChapter[]
  externalAuditArtifacts: Partial<Record<'renderer_input_binding' | 'fresh_context' | 'cost_budget', string>>
}

export class ConsultationAssemblyError extends Error {
  readonly issues: Array<{ code: string; path: string; message: string }>

  constructor(issues: Array<{ code: string; path: string; message: string }>) {
    super(`Consultation report assembly rejected with ${issues.length} issue(s)`)
    this.name = 'ConsultationAssemblyError'
    this.issues = issues
  }
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

export function assembleConsultationReport(
  input: AssembleConsultationReportInput,
): ConsultationReportContract {
  const issues: Array<{ code: string; path: string; message: string }> = []
  if (
    input.generationPlan.reportId !== input.reportId ||
    input.generationPlan.reportVersion !== input.reportVersion ||
    input.generationPlan.plan !== input.plan ||
    input.generationPlan.asOfDate !== input.asOfDate ||
    input.generationPlan.contextHash !== input.contextHash
  ) {
    issues.push({ code: 'plan.context_mismatch', path: 'generationPlan', message: '生成計畫與組裝 context 不一致' })
  }
  const jobsByChapter = new Map(input.generationPlan.jobs.map((job) => [job.chapterId, job]))
  const draftsByChapter = new Map<ReportChapter['chapterId'], NormalizedConsultationChapter[]>()
  for (const draft of input.drafts ?? []) {
    const bucket = draftsByChapter.get(draft.chapter.chapterId) ?? []
    bucket.push(draft)
    draftsByChapter.set(draft.chapter.chapterId, bucket)
  }
  for (const job of input.generationPlan.jobs) {
    const matching = draftsByChapter.get(job.chapterId) ?? []
    if (matching.length !== 1) {
      issues.push({ code: 'draft.count_mismatch', path: job.chapterId, message: '每個章節必須恰有一份成功草稿' })
      continue
    }
    const draft = matching[0]
    if (
      draft.receipt.idempotencyKey !== job.idempotencyKey ||
      draft.receipt.inputHash !== job.inputHash ||
      draft.receipt.promptVersionHash !== job.promptVersionHash ||
      draft.receipt.outputHash !== sha256(draftOutputPayload({
        topicId: draft.topicId,
        quickConclusion: draft.quickConclusion,
        selfCheck: draft.selfCheck,
        chapter: draft.chapter,
        paragraphs: draft.paragraphs,
        claims: draft.claims,
        evidence: draft.evidence,
      }))
    ) {
      issues.push({ code: 'draft.receipt_mismatch', path: job.chapterId, message: '章節草稿與 job 收據不一致' })
    }
  }
  for (const chapterId of draftsByChapter.keys()) {
    if (!jobsByChapter.has(chapterId)) {
      issues.push({ code: 'draft.unknown_chapter', path: chapterId, message: '草稿不屬於生成計畫' })
    }
  }
  for (const kind of ['renderer_input_binding', 'fresh_context', 'cost_budget'] as const) {
    if (!isHash(input.externalAuditArtifacts?.[kind])) {
      issues.push({ code: 'audit.external_missing', path: `externalAuditArtifacts.${kind}`, message: `${kind} 收據缺失或未綁定 hash` })
    }
  }

  const orderedDrafts = input.generationPlan.jobs
    .map((job) => draftsByChapter.get(job.chapterId)?.[0])
    .filter((draft): draft is NormalizedConsultationChapter => Boolean(draft))
  const paragraphs = orderedDrafts.flatMap((draft) => draft.paragraphs)
  const claims = orderedDrafts.flatMap((draft) => draft.claims)
  const chapters = orderedDrafts.map((draft) => draft.chapter)
  const evidence = orderedDrafts.flatMap((draft) => draft.evidence)
  const draftReportForAudit = {
    people: input.people,
    sourceManifest: input.sourceManifest,
    chapters,
    paragraphs,
    claimLedger: { entries: claims },
    readingLayers: {
      quick_30s: {
        items: orderedDrafts.map((draft) => ({
          claimId: draft.claims[0].claimId,
          conclusion: draft.quickConclusion,
          selfCheck: draft.selfCheck,
        })),
      },
      evidence_appendix: { entries: evidence },
    },
  } as unknown as ConsultationReportContract
  const deterministicAudit = runDeterministicReportAudits({
    paragraphs,
    customerVisibleTexts: collectCustomerVisibleTextEntries(draftReportForAudit),
    ageContexts: input.ageContexts,
    claimLedger: { entries: claims },
  })
  issues.push(...deterministicAudit.issues.map((audit: DeterministicIssue) => ({
    code: audit.code,
    path: audit.paragraphIds.join(','),
    message: audit.message,
  })))
  if (issues.length > 0) throw new ConsultationAssemblyError(issues)

  const auditHashes: Record<string, string> = {
    facts_normalization: sha256({ sourceManifest: input.sourceManifest, factLedger: input.factLedger }),
    cross_chapter_consistency: sha256({ chapters, claims }),
    exact_dedup: sha256(paragraphs.map((paragraph) => ({ id: paragraph.paragraphId, fingerprint: paragraph.fingerprint }))),
    near_dedup: sha256({ threshold: 'report-audits/v1', issues: [] }),
    human_language: sha256({ customerVisibleTexts: collectCustomerVisibleTextEntries(draftReportForAudit), issues: [] }),
    age_safety: sha256({ ageContexts: input.ageContexts, issues: [] }),
    grounding: sha256({ claims, evidence, facts: input.factLedger.entries.map((fact) => fact.factId) }),
    renderer_input_binding: input.externalAuditArtifacts.renderer_input_binding!,
    fresh_context: input.externalAuditArtifacts.fresh_context!,
    cost_budget: input.externalAuditArtifacts.cost_budget!,
  }
  const audits: ReportAuditReceipt[] = REQUIRED_AUDITS.map((kind) => ({
    kind,
    status: 'passed',
    artifactHash: auditHashes[kind],
  }))
  const quickDrafts = orderedDrafts.slice(0, 3)
  const availableTraditionalSystemIds = [...new Set(input.factLedger.entries
    .filter((fact) => fact.evidenceClass === 'traditional_interpretation')
    .map((fact) => calculatorSystemFromSourcePath(fact.sourcePath))
    .filter((system): system is string => Boolean(system)))].sort()
  const usedSystemSet = new Set(claims.flatMap((claim) => [
    ...claim.supportingSystemIds,
    ...claim.opposingSystemIds,
  ]))
  const usedSystemIds = availableTraditionalSystemIds.filter((system) => usedSystemSet.has(system))
  const report: ConsultationReportContract = {
    schemaVersion: 'consultation-report/v1',
    reportId: input.reportId,
    reportVersion: input.reportVersion,
    plan: input.plan,
    locale: input.locale,
    asOfDate: input.asOfDate,
    contextHash: input.contextHash,
    people: input.people,
    ageContexts: input.ageContexts,
    sourceManifest: input.sourceManifest,
    factLedger: input.factLedger,
    claimLedger: { status: 'complete', entries: claims },
    chapters,
    paragraphs,
    readingLayers: {
      quick_30s: {
        items: quickDrafts.map((draft) => ({
          claimId: draft.claims[0].claimId,
          conclusion: draft.quickConclusion,
          selfCheck: draft.selfCheck,
        })) as ConsultationReportContract['readingLayers']['quick_30s']['items'],
      },
      route_3m: {
        chapters: orderedDrafts.map((draft) => ({
          chapterId: draft.chapter.chapterId,
          conclusionSubtitle: draft.chapter.conclusionSubtitle,
          firstReadParagraphId: draft.chapter.firstReadParagraphId,
          readingLoad: countEffectiveCjkCharacters(draft.paragraphs) >= 9_000 ? 'deep' : 'focused',
        })),
      },
      deep_read: { chapterIds: chapters.map((chapter) => chapter.chapterId) },
      evidence_appendix: { entries: evidence },
    },
    systemCoverage: {
      availableTraditionalSystemIds,
      usedSystemIds,
      omittedSystems: availableTraditionalSystemIds
        .filter((system) => !usedSystemSet.has(system))
        .map((systemId) => ({ systemId, reason: 'insufficient_direct_relevance' as const })),
    },
    rendererBinding: undefined,
    chapterJobs: orderedDrafts.map((draft) => draft.receipt),
    audits,
    completeness: {
      status: 'complete',
      requiredChapterIds: chapters.map((chapter) => chapter.chapterId),
      requiredClaimIds: claims.map((claim) => claim.claimId),
      requiredFactIds: input.factLedger.entries.map((fact) => fact.factId),
      missingData: [],
      partialFailures: [],
    },
  }

  const rendererBinding = createRendererBinding(
    report,
    input.externalAuditArtifacts.renderer_input_binding!,
  )
  report.rendererBinding = rendererBinding
  const rendererAudit = report.audits.find((audit) => audit.kind === 'renderer_input_binding')
  if (rendererAudit) rendererAudit.artifactHash = rendererBinding.artifactHash

  const validation = validateConsultationReportContract(report)
  if (!validation.ok) throw new ConsultationAssemblyError(validation.issues)
  assertCompleteConsultationReportContract(report)
  return report
}
