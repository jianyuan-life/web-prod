import { createHash } from 'node:crypto'
import {
  validateConsultationReportContract,
  type ConsultationPlan,
  type ConsultationReportContract,
  type EvidenceAppendixEntry,
  type InformationKind,
} from '../report-contract.ts'

export const MAX_PDF_TEXT_CHARACTERS = 300_000
export const MAX_PDF_PARAGRAPHS = 2_000

const HTML_PATTERN = /<\/?[a-z][^>]{0,300}>|&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/iu
const MARKDOWN_PATTERN = /(?:\*\*|__|`{1,3}|^\s*#{1,6}\s|^\s*>\s|^\s*[-*+]\s|\|\s*[-:]{2,}\s*\|)/mu
const EMOJI_PATTERN = /[\u2600-\u27bf\u{1f000}-\u{1faff}]/u
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u
const INTERNAL_PROCESS_PATTERN = /(?:facts?\s+ledger|claim\s+ledger|schema|json|pipeline|驗證通過|品質閣門|台帳|模型輸出|prompt|token|artifact|hash|fly-release|digest\s*=|sha256:|\bgit\s*=)/iu

const PLAN_TITLES: Record<ConsultationPlan, string> = {
  C: '人生藍圖',
  G15: '家族藍圖',
}

const PLAN_SUBTITLES: Record<ConsultationPlan, string> = {
  C: '一份能反覆回來核對的人生說明書',
  G15: '一份讓家人比較好開口的共同說明書',
}

const AGE_STAGE_LABELS: Record<string, string> = {
  toddler: '幼兒期',
  child: '兒童期',
  teen: '青少年期',
  young_adult: '青年期',
  early_mid: '壯年前期',
  mid: '壯年期',
  pre_senior: '成熟過渡期',
  elder: '熟齡期',
}

export class ConsultationPdfPolicyError extends Error {
  readonly codes: string[]

  constructor(codes: string[]) {
    super('Consultation PDF rejected by policy')
    this.name = 'ConsultationPdfPolicyError'
    this.codes = [...new Set(codes)]
  }
}

export type ConsultationPdfParagraph = {
  kind: InformationKind
  text: string
}

export type ConsultationPdfEvidence = {
  label: string
  sources: string[]
  limitations: string[]
  applicability: string[]
  invalidation: string[]
  evidenceStatuses: ConsultationReportContract['claimLedger']['entries'][number]['evidenceStatus'][]
  supportingSystems: string[]
  opposingSystems: string[]
}

export type ConsultationPdfChapter = {
  ordinal: number
  title: string
  conclusionSubtitle: string
  paragraphs: ConsultationPdfParagraph[]
  evidence: ConsultationPdfEvidence[]
}

export type ConsultationPdfModel = {
  plan: ConsultationPlan
  planTitle: string
  subtitle: string
  reportNumber: string
  reportVersion: number
  asOfDate: string
  rendererBindingHash: string
  people: string[]
  peopleDetails: Array<{
    displayName: string
    ageYears: number
    stageLabel: string
    birthTimeLabel: string
  }>
  quickItems: Array<{
    conclusion: string
    selfCheck: string
  }>
  chapters: ConsultationPdfChapter[]
  sources: string[]
  generalLimitations: string[]
}

function collectTextSafetyCodes(label: string, value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [`${label}.empty`]
  const codes: string[] = []
  if (HTML_PATTERN.test(value)) codes.push(`${label}.html`)
  if (MARKDOWN_PATTERN.test(value)) codes.push(`${label}.markdown`)
  if (EMOJI_PATTERN.test(value)) codes.push(`${label}.emoji`)
  if (CONTROL_PATTERN.test(value)) codes.push(`${label}.control`)
  if (INTERNAL_PROCESS_PATTERN.test(value)) codes.push(`${label}.internal_process`)
  return codes
}

export function buildClientReportNumber(plan: ConsultationPlan, reportId: string): string {
  const fingerprint = createHash('sha256')
    .update(`${plan}\u0000${reportId}`, 'utf8')
    .digest('hex')
    .slice(0, 10)
    .toUpperCase()
  return `${plan}-${fingerprint}`
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function evidenceForChapter(
  report: ConsultationReportContract,
  chapterClaimIds: readonly string[],
): ConsultationPdfEvidence[] {
  const claimById = new Map(report.claimLedger.entries.map((claim) => [claim.claimId, claim]))
  const sourceById = new Map(report.sourceManifest.map((source) => [source.sourceId, source]))
  const evidenceEntries = report.readingLayers.evidence_appendix.entries.filter((entry) =>
    entry.claimIds.some((claimId) => chapterClaimIds.includes(claimId)),
  )

  return evidenceEntries.map((entry: EvidenceAppendixEntry) => {
    const relatedClaims = entry.claimIds
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))
    return {
      label: entry.label,
      sources: uniqueStrings(
        entry.sourceIds
          .map((sourceId) => sourceById.get(sourceId)?.title ?? '')
          .filter(Boolean),
      ),
      limitations: uniqueStrings(entry.limitations),
      applicability: uniqueStrings(relatedClaims.map((claim) => claim.applicability)),
      invalidation: uniqueStrings(relatedClaims.map((claim) => claim.invalidation)),
      evidenceStatuses: uniqueStrings(relatedClaims.map((claim) => claim.evidenceStatus)) as ConsultationPdfEvidence['evidenceStatuses'],
      supportingSystems: uniqueStrings(relatedClaims.flatMap((claim) => claim.supportingSystemIds)),
      opposingSystems: uniqueStrings(relatedClaims.flatMap((claim) => claim.opposingSystemIds)),
    }
  })
}

function displayedTextEntries(report: ConsultationReportContract): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  report.people.forEach((person, index) => entries.push([`people.${index}.displayName`, person.displayName]))
  report.chapters.forEach((chapter, index) => {
    entries.push([`chapters.${index}.title`, chapter.title])
    entries.push([`chapters.${index}.conclusionSubtitle`, chapter.conclusionSubtitle])
  })
  report.paragraphs.forEach((paragraph, index) => entries.push([`paragraphs.${index}.text`, paragraph.text]))
  report.readingLayers.quick_30s.items.forEach((item, index) => {
    entries.push([`quick.${index}.conclusion`, item.conclusion])
    entries.push([`quick.${index}.selfCheck`, item.selfCheck])
  })
  report.readingLayers.evidence_appendix.entries.forEach((entry, index) => {
    entries.push([`evidence.${index}.label`, entry.label])
    entry.limitations.forEach((limitation, limitationIndex) => {
      entries.push([`evidence.${index}.limitations.${limitationIndex}`, limitation])
    })
  })
  report.sourceManifest.forEach((source, index) => entries.push([`sources.${index}.title`, source.title]))
  report.claimLedger.entries.forEach((claim, index) => {
    entries.push([`claims.${index}.applicability`, claim.applicability])
    entries.push([`claims.${index}.invalidation`, claim.invalidation])
  })
  return entries
}

export function createConsultationPdfModel(input: unknown): ConsultationPdfModel {
  const validation = validateConsultationReportContract(input)
  if (!validation.ok) {
    throw new ConsultationPdfPolicyError(validation.issues.map((issue) => `contract.${issue.code}`))
  }
  const report = input as ConsultationReportContract
  const policyCodes = displayedTextEntries(report).flatMap(([label, value]) =>
    collectTextSafetyCodes(label, value),
  )
  const totalCharacters = displayedTextEntries(report).reduce((sum, [, value]) => sum + value.length, 0)
  if (totalCharacters > MAX_PDF_TEXT_CHARACTERS) policyCodes.push('document.text_limit')
  if (report.paragraphs.length > MAX_PDF_PARAGRAPHS) policyCodes.push('document.paragraph_limit')
  if (policyCodes.length > 0) throw new ConsultationPdfPolicyError(policyCodes)

  const paragraphById = new Map(report.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph]))
  const ageByPersonId = new Map(report.ageContexts.map((context) => [context.personId, context]))

  return {
    plan: report.plan,
    planTitle: PLAN_TITLES[report.plan],
    subtitle: PLAN_SUBTITLES[report.plan],
    reportNumber: buildClientReportNumber(report.plan, report.reportId),
    reportVersion: report.reportVersion,
    asOfDate: report.asOfDate,
    rendererBindingHash: report.rendererBinding?.contentHash ?? '',
    people: report.people.map((person) => person.displayName),
    peopleDetails: report.people.map((person) => {
      const age = ageByPersonId.get(person.personId)
      return {
        displayName: person.displayName,
        ageYears: age?.ageYears ?? 0,
        stageLabel: AGE_STAGE_LABELS[age?.stage ?? ''] ?? '生命階段',
        birthTimeLabel: person.birthTime.status === 'unknown'
          ? `出生時間未知；${person.birthTime.affectedSystems.join('、')}已停止用來支撐結論`
          : '已提供出生時間',
      }
    }),
    quickItems: report.readingLayers.quick_30s.items.map((item) => ({
      conclusion: item.conclusion,
      selfCheck: item.selfCheck,
    })),
    chapters: report.chapters.map((chapter, index) => ({
      ordinal: index + 1,
      title: chapter.title,
      conclusionSubtitle: chapter.conclusionSubtitle,
      paragraphs: chapter.paragraphIds.map((paragraphId) => {
        const paragraph = paragraphById.get(paragraphId)
        if (!paragraph) throw new ConsultationPdfPolicyError(['chapter.paragraph_missing'])
        return { kind: paragraph.kind, text: paragraph.text }
      }),
      evidence: evidenceForChapter(report, chapter.claimIds),
    })),
    sources: uniqueStrings(report.sourceManifest.map((source) => source.title)),
    generalLimitations: [
      '報告內容是自我觀察與家庭對話的線索，請用真實經驗反覆核對。',
      '涉及醫療、心理、法律或重大財務決策時，請另向合資格專業人士求證。',
      '家族報告只描述已授權成員與已知關係，不以性別或資料順序推定家庭角色。',
    ],
  }
}

export function buildConsultationPdfHeaders(
  report: Pick<ConsultationReportContract, 'plan' | 'reportId'>,
  contentLength: number,
): Record<string, string> {
  const reportNumber = buildClientReportNumber(report.plan, report.reportId)
  const asciiFilename = `jianyuan-${reportNumber.toLowerCase()}.pdf`
  const displayFilename = `鑑源-${PLAN_TITLES[report.plan]}-${reportNumber}.pdf`
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(displayFilename)}`,
    'Content-Length': String(contentLength),
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'X-Content-Type-Options': 'nosniff',
  }
}

export function buildConsultationPdfPrivateErrorHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'X-Content-Type-Options': 'nosniff',
  }
}
