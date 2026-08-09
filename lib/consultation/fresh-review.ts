import type { NormalizedConsultationChapter } from './chapter-assembly.ts'
import { sha256, stableStringify } from './generation-plan.ts'
import type { FactLedger, PersonContext, ReportAgeContext } from './report-contract.ts'

export const CONSULTATION_FRESH_REVIEW_POLICY_VERSION = 'consultation-fresh-review/v1.0.0'
export const CONSULTATION_REVIEW_DEFAULT_MODEL = 'gemini-3.1-pro-preview'

export type ConsultationFreshReviewInput = {
  plan: 'C' | 'G15'
  reportId: `report:${string}`
  contextHash: string
  asOfDate: string
  people: PersonContext[]
  ageContexts: ReportAgeContext[]
  facts: FactLedger['entries']
  drafts: NormalizedConsultationChapter[]
}

export type ConsultationFreshReviewFinding = {
  severity: 'P0' | 'P1' | 'P2'
  code: string
  message: string
  chapterId?: string
  claimId?: string
}

export type ConsultationFreshReviewResult = {
  approved: boolean
  artifactHash: `sha256:${string}`
  issues: string[]
  findings: ConsultationFreshReviewFinding[]
  reviewerModel: string
}

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildConsultationFreshReviewRequest(
  input: ConsultationFreshReviewInput,
  releasePolicyReceipt: string,
): { system: string; user: string; requestHash: `sha256:${string}` } {
  if (!isHash(releasePolicyReceipt)) throw new Error('fresh review policy receipt 必須是 SHA-256')
  if (!isHash(input.contextHash)) throw new Error('fresh review contextHash 必須是 SHA-256')
  if (input.plan !== 'C' && input.plan !== 'G15') throw new Error('fresh review 只接受 C/G15')
  if (input.facts.some((fact) => fact.evidenceClass === 'held')) {
    throw new Error('held facts 不得送入 fresh review')
  }

  const reviewPayload = {
    policyVersion: CONSULTATION_FRESH_REVIEW_POLICY_VERSION,
    releasePolicyReceipt,
    plan: input.plan,
    reportId: input.reportId,
    contextHash: input.contextHash,
    asOfDate: input.asOfDate,
    people: input.people,
    ageContexts: input.ageContexts,
    facts: input.facts,
    drafts: input.drafts,
  }
  const user = stableStringify(reviewPayload)
  return {
    system: [
      '你是與主筆隔離的報告反例審查員。你的工作是找出錯誤，不是幫主筆過關。',
      '逐項比對 facts、人物、基準日、年齡層、claims、evidence 與全文；查不到依據就列為問題，不得猜。',
      '逐一核對 supportingFactIds 是否真的支持主張、opposingFactIds 是否真的反對或限制主張；不得只看系統數量。',
      '若 evidenceStatus 是 mixed，正文必須明寫分歧；若是 single_system 或 insufficient，正文不得使用「多套系統一致」「交叉驗證」等共識語氣。',
      '確認所有可用 traditional_interpretation 系統都被如實使用或說明未採用原因；不得為湊共識把無關系統列成支持。',
      'P0：捏造排盤、人物混淆、年份錯置、危險醫療法律財務指示、跨系統幻想、未授權資料。',
      'P1：證據不支撐結論、年齡情境錯誤、性別或排行推定家庭角色、反思型資料被寫成事實、大段重複。',
      'P2：白話度、段落導航或行動可執行性仍有具體缺陷。',
      '只有找不到任何 P0/P1/P2 時才可 approved=true。',
      '只輸出單一 JSON 物件，不加 Markdown：',
      '{"approved":true,"findings":[{"severity":"P0|P1|P2","code":"stable_code","message":"具體問題","chapterId":"可省略","claimId":"可省略"}]}',
    ].join('\n'),
    user,
    requestHash: sha256(user),
  }
}

export function parseConsultationFreshReviewResponse(input: {
  rawResponse: string
  reviewerModel: string
  requestHash: string
  releasePolicyReceipt: string
}): ConsultationFreshReviewResult {
  if (!isHash(input.requestHash) || !isHash(input.releasePolicyReceipt)) {
    throw new Error('fresh review response 缺少 request/policy SHA-256')
  }
  const raw = input.rawResponse.trim()
  if (!raw.startsWith('{') || !raw.endsWith('}') || /```/u.test(raw)) {
    throw new Error('fresh review 必須是單一 JSON 物件')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`fresh review JSON 無法解析: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(parsed) || typeof parsed.approved !== 'boolean' || !Array.isArray(parsed.findings)) {
    throw new Error('fresh review JSON schema 不完整')
  }
  const findings: ConsultationFreshReviewFinding[] = parsed.findings.map((finding, index) => {
    if (
      !isRecord(finding) ||
      !['P0', 'P1', 'P2'].includes(String(finding.severity)) ||
      typeof finding.code !== 'string' || !/^[a-z0-9._-]{3,80}$/u.test(finding.code) ||
      typeof finding.message !== 'string' || !finding.message.trim()
    ) {
      throw new Error(`fresh review finding ${index} schema 不正確`)
    }
    return {
      severity: finding.severity as 'P0' | 'P1' | 'P2',
      code: finding.code,
      message: finding.message.trim(),
      ...(typeof finding.chapterId === 'string' && finding.chapterId ? { chapterId: finding.chapterId } : {}),
      ...(typeof finding.claimId === 'string' && finding.claimId ? { claimId: finding.claimId } : {}),
    }
  })
  const approved = parsed.approved === true && findings.length === 0
  const issues = findings.map((finding) => `${finding.severity}:${finding.code}:${finding.message}`)
  if (parsed.approved === true && findings.length > 0) {
    issues.unshift('P0:review.inconsistent:審查回應同時宣告 approved 且列出問題')
  }
  return {
    approved,
    issues,
    findings,
    reviewerModel: input.reviewerModel,
    artifactHash: sha256({
      policyVersion: CONSULTATION_FRESH_REVIEW_POLICY_VERSION,
      releasePolicyReceipt: input.releasePolicyReceipt,
      requestHash: input.requestHash,
      reviewerModel: input.reviewerModel,
      rawResponse: raw,
    }),
  }
}

export function createRendererInputBindingAttestation(input: {
  releaseInputBindingReceipt: string
  plan: 'C' | 'G15'
  reportId: `report:${string}`
  contextHash: string
  chapterIds: string[]
  paragraphHashes: string[]
}): { passed: true; artifactHash: `sha256:${string}` } {
  if (!isHash(input.releaseInputBindingReceipt) || !isHash(input.contextHash)) {
    throw new Error('renderer input binding 缺少 release/context SHA-256')
  }
  if (input.chapterIds.length === 0 || input.paragraphHashes.length === 0) {
    throw new Error('renderer input binding 不接受空內容')
  }
  if (!input.paragraphHashes.every(isHash)) {
    throw new Error('renderer input binding paragraph fingerprint 不完整')
  }
  return {
    passed: true,
    artifactHash: sha256({
      contract: 'consultation-renderer-input-binding/v1.0.0',
      ...input,
    }),
  }
}
