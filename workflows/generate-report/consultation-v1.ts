import { extractFullCharts } from './extract-full-charts'
import {
  aiGenerateConsultationChapter,
  aiReviewConsultationDrafts,
  callPythonCalculateAttested,
  type BirthData,
  type CalcResult,
  type FamilyMemberReport,
} from './steps'
import {
  buildCalculatorRequestPayload,
  hashCalculatorRequest,
} from '@/lib/consultation/calculator-request'
import { normalizeCalculatorFacts, type CalculatorResponse } from '@/lib/consultation/calculator-facts'
import {
  generateConsultationReport,
  type ChapterAuthorInput,
  type ConsultationPipelineDependencies,
} from '@/lib/consultation/pipeline'
import { readConsultationRuntimeReceipts } from '@/lib/consultation/runtime-config'
import { createRendererInputBindingAttestation } from '@/lib/consultation/fresh-review'
import { serializeCustomerVisibleText, type ConsultationReportContract, type PersonId } from '@/lib/consultation/report-contract'
import { validateG15PersistedConsentAuthority } from '@/lib/checkout/g15-independent-consent'
import { validateG15ConsultationContext } from '@/lib/checkout/g15-context'
import type { VerifiedCalculatorResponse } from '@/lib/consultation/calculator-attestation'
import { canonicalGregorianDate } from '@/lib/consultation/calendar-date'
import { createSupabaseConsultationCostLedgerStore } from '@/lib/consultation/cost-store'
import { createSupabaseConsultationChapterDraftStore } from '@/lib/consultation/chapter-store'
import { assertGregorianConsultationBirthInput } from '@/lib/consultation/birth-input-policy'
import { normalizeConsultationClientQuestion } from '@/lib/consultation/client-question'
import { normalizeConsultationRelationshipStatus } from '@/lib/consultation/relationship-context'

export const CONSULTATION_PROMPT_VERSION = 'consultation-report/v1.0.0'

type StructuredConsultationResult = {
  report: ConsultationReportContract
  plainText: string
  moderationText: string
  aiModel: 'claude-opus-4-6'
  analysesSummary: Array<{ system: string; score: number }>
  fullCharts?: unknown
}

export const CONSULTATION_ANALYSIS_TIME_ZONE = 'Asia/Hong_Kong'

export function consultationAsOfDate(createdAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(createdAt)) return createdAt
  const instant = new Date(createdAt)
  if (!Number.isFinite(instant.getTime())) {
    throw new Error('報告 created_at 無法固定 consultation as_of')
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONSULTATION_ANALYSIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const candidate = `${value.year}-${value.month}-${value.day}`
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) {
    throw new Error('報告 created_at 無法轉換為固定分析基準日')
  }
  return candidate
}

function birthDateOf(birthData: BirthData): string {
  try {
    return canonicalGregorianDate(birthData, { minimumYear: 1900, maximumYear: 2200 })
  } catch {
    throw new Error('出生日期不完整或不可能')
  }
}

function personIdFor(reportId: string): PersonId {
  return `person:${reportId.replace(/[^\p{L}\p{N}._-]+/gu, '-')}` as PersonId
}

function withConsultationTime(birthData: BirthData, asOfDate: string): BirthData {
  assertGregorianConsultationBirthInput(birthData)
  return {
    ...birthData,
    as_of: asOfDate,
    target_year: Number(asOfDate.slice(0, 4)),
    bazi_school: birthData.bazi_school ?? 'china_mainland',
    ayanamsa_type: birthData.ayanamsa_type ?? birthData.ayanamsa ?? 'lahiri',
  }
}

export function buildConsultationCalculatorBirthData(
  birthData: BirthData,
  createdAt: string,
): BirthData {
  return withConsultationTime(birthData, consultationAsOfDate(createdAt))
}

function analysesSummary(response: CalculatorResponse): Array<{ system: string; score: number }> {
  if (!Array.isArray(response.analyses)) return []
  return response.analyses.flatMap((analysis) => {
    if (!analysis || typeof analysis !== 'object') return []
    const system = typeof analysis.system === 'string' ? analysis.system : ''
    const score = typeof analysis.score === 'number' ? analysis.score : 0
    return system ? [{ system, score }] : []
  })
}

function toPlainText(report: ConsultationReportContract): string {
  const paragraphs = new Map(report.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph.text]))
  const title = report.plan === 'C' ? '人生藍圖' : '家族藍圖'
  const lines = [title, `報告基準日：${report.asOfDate}`]
  for (const chapter of report.chapters) {
    lines.push('', chapter.title, chapter.conclusionSubtitle)
    for (const paragraphId of chapter.paragraphIds) {
      const text = paragraphs.get(paragraphId)
      if (text) lines.push('', text)
    }
  }
  return lines.join('\n').trim()
}

function dependencies(
  receipts: ReturnType<typeof readConsultationRuntimeReceipts>,
  plan: 'C' | 'G15',
  reportId: string,
): ConsultationPipelineDependencies {
  return {
    costLedgerStore: createSupabaseConsultationCostLedgerStore(),
    chapterDraftStore: createSupabaseConsultationChapterDraftStore(),
    authorChapter: async ({ job, attempt }: ChapterAuthorInput) =>
      aiGenerateConsultationChapter(
        job.systemPrompt,
        job.userPrompt,
        plan,
        `${job.topicId}_a${attempt}`,
        reportId,
        job.maxOutputTokens,
      ),
    freshContextReview: async ({ maxOutputTokens, ...input }) =>
      aiReviewConsultationDrafts(input, receipts.freshReviewHash, maxOutputTokens),
    rendererInputBindingAttestation: async (input) =>
      createRendererInputBindingAttestation({
        releaseInputBindingReceipt: receipts.rendererInputBindingHash,
        ...input,
      }),
  }
}

async function normalizeOne(
  personId: PersonId,
  birthData: BirthData,
  asOfDate: string,
  receipts: ReturnType<typeof readConsultationRuntimeReceipts>,
  existingVerified?: VerifiedCalculatorResponse<CalcResult>,
) {
  const calculatorBirthData = withConsultationTime(birthData, asOfDate)
  const payload = buildCalculatorRequestPayload(calculatorBirthData, { consultationMode: true })
  const verified = existingVerified ?? await callPythonCalculateAttested(calculatorBirthData)
  const response = verified.response as unknown as CalculatorResponse
  return {
    calculatorBirthData,
    response,
    normalized: normalizeCalculatorFacts({
      personId,
      asOfDate,
      targetYear: Number(asOfDate.slice(0, 4)),
      calculatorBundleVersion: receipts.calculatorBundleVersion,
      requestPayload: payload,
      requestHash: hashCalculatorRequest(payload),
      responseAttestation: verified.receipt,
      response,
    }),
  }
}

export async function buildStructuredCReport(input: {
  reportId: string
  createdAt: string
  birthData: BirthData
  calculatorResult: VerifiedCalculatorResponse<CalcResult>
}): Promise<StructuredConsultationResult> {
  const receipts = readConsultationRuntimeReceipts()
  const asOfDate = consultationAsOfDate(input.createdAt)
  const personId = personIdFor(`${input.reportId}-primary`)
  const normalized = await normalizeOne(
    personId,
    input.birthData,
    asOfDate,
    receipts,
    input.calculatorResult,
  )
  const relationshipStatus = normalizeConsultationRelationshipStatus(input.birthData.marital_status)
  if (!relationshipStatus) {
    throw new Error('C 結構化報告缺少經驗證的關係狀態')
  }
  const clientQuestion = normalizeConsultationClientQuestion(input.birthData.customer_note)
  const report = await generateConsultationReport({
    reportId: `report:${input.reportId}`,
    reportVersion: 2,
    plan: 'C',
    asOfDate,
    promptVersion: CONSULTATION_PROMPT_VERSION,
    people: [{
      personId,
      displayName: input.birthData.name,
      birthDate: birthDateOf(input.birthData),
      authorization: 'granted',
      calculatorFacts: normalized.normalized,
    }],
    clientContext: {
      relationshipStatus,
      clientQuestion,
    },
  }, dependencies(receipts, 'C', input.reportId))
  return {
    report,
    plainText: toPlainText(report),
    moderationText: serializeCustomerVisibleText(report),
    aiModel: 'claude-opus-4-6',
    analysesSummary: analysesSummary(input.calculatorResult.response),
    fullCharts: extractFullCharts(input.calculatorResult.response),
  }
}

export async function buildStructuredG15Report(input: {
  reportId: string
  createdAt: string
  birthData: BirthData
  familyReports: FamilyMemberReport[]
  reportIds: string[]
}): Promise<StructuredConsultationResult> {
  const receipts = readConsultationRuntimeReceipts()
  const asOfDate = consultationAsOfDate(input.createdAt)
  const consent = validateG15PersistedConsentAuthority({
    authority: input.birthData.consent_authority,
    selectionId: input.birthData.consent_selection_id,
    reportIds: input.reportIds,
  })
  if (!consent.ok) {
    throw new Error('G15 缺少 checkout 已查驗的逐位成員同意證據')
  }
  const context = validateG15ConsultationContext(input.birthData)
  if (!context.ok) {
    throw new Error(`G15 缺少家庭明示的關係與諮詢目標：${context.message}`)
  }
  if (input.familyReports.length !== input.reportIds.length) {
    throw new Error('G15 家庭成員與報告 ID 數量不一致')
  }
  const people = []
  const allSummaries: Array<{ system: string; score: number }> = []
  for (const [index, member] of input.familyReports.entries()) {
    const personId = personIdFor(input.reportIds[index])
    const normalized = await normalizeOne(
      personId,
      member.birthData,
      asOfDate,
      receipts,
    )
    allSummaries.push(...analysesSummary(normalized.response))
    people.push({
      personId,
      displayName: member.name,
      birthDate: birthDateOf(member.birthData),
      authorization: 'granted' as const,
      calculatorFacts: normalized.normalized,
    })
  }
  const report = await generateConsultationReport({
    reportId: `report:${input.reportId}`,
    reportVersion: 2,
    plan: 'G15',
    asOfDate,
    promptVersion: CONSULTATION_PROMPT_VERSION,
    people,
    familyStructure: {
      purchaserAttestedPersonIds: people.map((person) => person.personId),
      statedRelationships: context.context.statedRelationships,
      consultationGoals: context.context.consultationGoals,
    },
  }, dependencies(receipts, 'G15', input.reportId))
  return {
    report,
    plainText: toPlainText(report),
    moderationText: serializeCustomerVisibleText(report),
    aiModel: 'claude-opus-4-6',
    analysesSummary: allSummaries,
  }
}
