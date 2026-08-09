import { sha256HexSync } from './sha256.ts'
import { calcCostUsd } from '../ai/pricing.ts'
import type { ConsultationPlan } from './report-contract.ts'

export const CONSULTATION_COST_POLICY_VERSION = 'consultation-cost/v1.1.0'

export type ConsultationCostStage = 'author' | 'review'

export type ConsultationModelUsage = {
  model: string
  promptTokens: number
  completionTokens: number
  reportedCostUsd?: number
}

export type ConsultationCostCall = {
  stage: ConsultationCostStage
  scopeKey: string
  model: string
  promptTokens: number
  completionTokens: number
  maxOutputTokens: number
  promptByteUpperBound: number
  billableInputTokenUpperBound: number
  costUsd: number
  billingBasis: 'actual_usage' | 'failed_reservation'
}

export type ConsultationReservationRecord = ConsultationCostReservation & {
  reservationId: string
  status: 'pending' | 'settled' | 'failed'
}

export type ConsultationCostLedger = {
  policyVersion: typeof CONSULTATION_COST_POLICY_VERSION
  plan: ConsultationPlan
  budgetUsd: number
  actualUsd: number
  reservedUsd: number
  nextSequence: number
  calls: ConsultationCostCall[]
  reservations: ConsultationReservationRecord[]
}

export type ConsultationCostReservation = {
  reservationId: string
  scopeKey: string
  stage: ConsultationCostStage
  model: string
  maxOutputTokens: number
  promptByteUpperBound: number
  billableInputTokenUpperBound: number
  maximumCostUsd: number
}

export class ConsultationCostPolicyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ConsultationCostPolicyError'
    this.code = code
  }
}

const POLICY = {
  C: {
    priceUsd: 89,
    budgetUsd: 18,
    authorModel: 'claude-opus-4-6',
    reviewerModel: 'gemini-3.1-pro-preview',
    authorMaxOutputTokens: 9_000,
    reviewerMaxOutputTokens: 4_096,
    authorInputByteCeiling: 350_000,
    reviewerInputByteCeiling: 1_200_000,
    maximumAuthorAttemptsPerChapter: 3,
  },
  G15: {
    priceUsd: 59,
    budgetUsd: 20,
    authorModel: 'claude-opus-4-6',
    reviewerModel: 'gemini-3.1-pro-preview',
    authorMaxOutputTokens: 15_000,
    reviewerMaxOutputTokens: 4_096,
    authorInputByteCeiling: 900_000,
    reviewerInputByteCeiling: 2_000_000,
    maximumAuthorAttemptsPerChapter: 3,
  },
} as const

export function getConsultationCostPolicy(plan: ConsultationPlan) {
  return POLICY[plan]
}

export function createConsultationCostLedger(plan: ConsultationPlan): ConsultationCostLedger {
  return {
    policyVersion: CONSULTATION_COST_POLICY_VERSION,
    plan,
    budgetUsd: POLICY[plan].budgetUsd,
    actualUsd: 0,
    reservedUsd: 0,
    nextSequence: 1,
    calls: [],
    reservations: [],
  }
}

export function validateConsultationCostLedger(
  value: unknown,
  expectedPlan: ConsultationPlan,
): ConsultationCostLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '持久成本台帳不是物件')
  }
  const ledger = value as Partial<ConsultationCostLedger>
  const policy = POLICY[expectedPlan]
  if (
    ledger.policyVersion !== CONSULTATION_COST_POLICY_VERSION || ledger.plan !== expectedPlan ||
    ledger.budgetUsd !== policy.budgetUsd || !Number.isFinite(ledger.actualUsd) ||
    Number(ledger.actualUsd) < 0 || !Number.isFinite(ledger.reservedUsd) ||
    Number(ledger.reservedUsd) < 0 || !Number.isSafeInteger(ledger.nextSequence) ||
    Number(ledger.nextSequence) < 1 ||
    !Array.isArray(ledger.calls) || !Array.isArray(ledger.reservations)
  ) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '持久成本台帳欄位與現行政策不一致')
  }
  const calls = ledger.calls as ConsultationCostCall[]
  const reservations = ledger.reservations as ConsultationReservationRecord[]
  if (calls.some((call) =>
    !call || !['author', 'review'].includes(call.stage) ||
    typeof call.scopeKey !== 'string' || !call.scopeKey ||
    !['actual_usage', 'failed_reservation'].includes(call.billingBasis) ||
    !Number.isFinite(call.costUsd) || call.costUsd < 0,
  )) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '持久成本台帳含畸形呼叫收據')
  }
  if (reservations.some((reservation) =>
    !reservation || typeof reservation.reservationId !== 'string' ||
    typeof reservation.scopeKey !== 'string' || !reservation.scopeKey ||
    !['pending', 'settled', 'failed'].includes(reservation.status) ||
    !Number.isFinite(reservation.maximumCostUsd) || reservation.maximumCostUsd < 0,
  )) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '持久成本台帳含畸形預留')
  }
  const calculatedActual = Math.round(calls.reduce((sum, call) => sum + call.costUsd, 0) * 1_000_000) / 1_000_000
  const calculatedReserved = Math.round(reservations
    .filter((reservation) => reservation.status === 'pending')
    .reduce((sum, reservation) => sum + reservation.maximumCostUsd, 0) * 1_000_000) / 1_000_000
  if (
    Math.abs(calculatedActual - Number(ledger.actualUsd)) > 1e-6 ||
    Math.abs(calculatedReserved - Number(ledger.reservedUsd)) > 1e-6 ||
    calculatedActual + calculatedReserved > policy.budgetUsd + 1e-9
  ) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '持久成本台帳總額無法與逐筆收據對帳')
  }
  return ledger as ConsultationCostLedger
}

function assertFiniteTokenCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConsultationCostPolicyError('cost.usage_invalid', `${label} 必須是非負安全整數`)
  }
}

export function reserveConsultationCall(input: {
  ledger: ConsultationCostLedger
  stage: ConsultationCostStage
  scopeKey: string
  prompt: string
}): ConsultationCostReservation {
  const policy = POLICY[input.ledger.plan]
  if (
    input.ledger.policyVersion !== CONSULTATION_COST_POLICY_VERSION ||
    input.ledger.budgetUsd !== policy.budgetUsd ||
    !Number.isFinite(input.ledger.actualUsd) || input.ledger.actualUsd < 0 ||
    !Number.isFinite(input.ledger.reservedUsd) || input.ledger.reservedUsd < 0 ||
    !Number.isSafeInteger(input.ledger.nextSequence) || input.ledger.nextSequence < 1 ||
    !Array.isArray(input.ledger.calls) || !Array.isArray(input.ledger.reservations)
  ) {
    throw new ConsultationCostPolicyError('cost.ledger_invalid', '成本台帳與現行政策不一致')
  }
  if (typeof input.prompt !== 'string' || input.prompt.length === 0) {
    throw new ConsultationCostPolicyError('cost.prompt_missing', '成本預留需要實際 prompt')
  }
  if (typeof input.scopeKey !== 'string' || !/^[A-Za-z0-9._:-]{3,240}$/u.test(input.scopeKey)) {
    throw new ConsultationCostPolicyError('cost.scope_invalid', '成本預留缺少穩定 job scope key')
  }

  // UTF-8 BPE token 不可能多於輸入 bytes；用 bytes 當 token 上界，寧可高估成本。
  const promptByteUpperBound = Buffer.byteLength(input.prompt, 'utf8')
  const inputByteCeiling = input.stage === 'author'
    ? policy.authorInputByteCeiling
    : policy.reviewerInputByteCeiling
  if (promptByteUpperBound > inputByteCeiling) {
    throw new ConsultationCostPolicyError(
      'cost.input_ceiling',
      `${input.stage} prompt ${promptByteUpperBound} bytes 超過 ${inputByteCeiling} bytes 上限`,
    )
  }
  const model = input.stage === 'author' ? policy.authorModel : policy.reviewerModel
  const maxOutputTokens = input.stage === 'author'
    ? policy.authorMaxOutputTokens
    : policy.reviewerMaxOutputTokens
  const billableInputTokenUpperBound = input.stage === 'author'
    ? Math.ceil(promptByteUpperBound * 1.25)
    : promptByteUpperBound
  const maximumCostUsd = calcCostUsd(model, billableInputTokenUpperBound, maxOutputTokens)
  if (input.ledger.actualUsd + input.ledger.reservedUsd + maximumCostUsd > policy.budgetUsd + 1e-9) {
    throw new ConsultationCostPolicyError(
      'cost.budget_exceeded',
      `${input.stage} 呼叫最壞成本會使本報告超過 USD ${policy.budgetUsd} 硬預算`,
    )
  }
  const reservation: ConsultationReservationRecord = {
    reservationId: `${input.ledger.plan.toLowerCase()}-${input.ledger.nextSequence}`,
    scopeKey: input.scopeKey,
    stage: input.stage,
    model,
    maxOutputTokens,
    promptByteUpperBound,
    billableInputTokenUpperBound,
    maximumCostUsd,
    status: 'pending',
  }
  input.ledger.nextSequence += 1
  input.ledger.reservations.push(reservation)
  input.ledger.reservedUsd = Math.round((input.ledger.reservedUsd + maximumCostUsd) * 1_000_000) / 1_000_000
  return { ...reservation }
}

export function commitConsultationUsage(input: {
  ledger: ConsultationCostLedger
  reservation: ConsultationCostReservation
  usage: ConsultationModelUsage
}): ConsultationCostCall {
  const policy = POLICY[input.ledger.plan]
  const persistedReservation = input.ledger.reservations.find((entry) =>
    entry.reservationId === input.reservation.reservationId,
  )
  if (!persistedReservation || persistedReservation.status !== 'pending') {
    throw new ConsultationCostPolicyError('cost.reservation_invalid', '成本預留不存在或已結算')
  }
  const expectedModel = input.reservation.stage === 'author' ? policy.authorModel : policy.reviewerModel
  if (input.usage.model !== expectedModel || input.reservation.model !== expectedModel) {
    throw new ConsultationCostPolicyError('cost.model_mismatch', `${input.reservation.stage} 使用了未核准模型`)
  }
  assertFiniteTokenCount(input.usage.promptTokens, 'promptTokens')
  assertFiniteTokenCount(input.usage.completionTokens, 'completionTokens')
  if (input.usage.promptTokens > input.reservation.billableInputTokenUpperBound) {
    throw new ConsultationCostPolicyError('cost.prompt_usage_impossible', '回傳計費 input tokens 超過含快取寫入係數的安全上界')
  }
  if (input.usage.completionTokens > input.reservation.maxOutputTokens) {
    throw new ConsultationCostPolicyError('cost.output_ceiling', '回傳 output tokens 超過已預留上限')
  }
  const costUsd = calcCostUsd(
    expectedModel,
    input.usage.promptTokens,
    input.usage.completionTokens,
  )
  const nextReserved = Math.max(0, Math.round(
    (input.ledger.reservedUsd - persistedReservation.maximumCostUsd) * 1_000_000,
  ) / 1_000_000)
  const nextActual = Math.round((input.ledger.actualUsd + costUsd) * 1_000_000) / 1_000_000
  if (nextActual > policy.budgetUsd + 1e-9) {
    throw new ConsultationCostPolicyError('cost.budget_exceeded', '實際用量超過整份報告硬預算')
  }
  const call: ConsultationCostCall = {
    stage: input.reservation.stage,
    scopeKey: input.reservation.scopeKey,
    model: expectedModel,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    maxOutputTokens: input.reservation.maxOutputTokens,
    promptByteUpperBound: input.reservation.promptByteUpperBound,
    billableInputTokenUpperBound: input.reservation.billableInputTokenUpperBound,
    costUsd,
    billingBasis: 'actual_usage',
  }
  persistedReservation.status = 'settled'
  input.ledger.reservedUsd = nextReserved
  input.ledger.calls.push(call)
  input.ledger.actualUsd = nextActual
  return call
}

export function failConsultationReservation(input: {
  ledger: ConsultationCostLedger
  reservation: ConsultationCostReservation
}): ConsultationCostCall {
  const persistedReservation = input.ledger.reservations.find((entry) =>
    entry.reservationId === input.reservation.reservationId,
  )
  if (!persistedReservation || persistedReservation.status !== 'pending') {
    throw new ConsultationCostPolicyError('cost.reservation_invalid', '失敗呼叫的成本預留不存在或已結算')
  }
  const nextActual = Math.round(
    (input.ledger.actualUsd + persistedReservation.maximumCostUsd) * 1_000_000,
  ) / 1_000_000
  if (nextActual > input.ledger.budgetUsd + 1e-9) {
    throw new ConsultationCostPolicyError('cost.budget_exceeded', '失敗呼叫的預留成本超過硬預算')
  }
  input.ledger.reservedUsd = Math.max(0, Math.round(
    (input.ledger.reservedUsd - persistedReservation.maximumCostUsd) * 1_000_000,
  ) / 1_000_000)
  input.ledger.actualUsd = nextActual
  persistedReservation.status = 'failed'
  const call: ConsultationCostCall = {
    stage: persistedReservation.stage,
    scopeKey: persistedReservation.scopeKey,
    model: persistedReservation.model,
    promptTokens: 0,
    completionTokens: 0,
    maxOutputTokens: persistedReservation.maxOutputTokens,
    promptByteUpperBound: persistedReservation.promptByteUpperBound,
    billableInputTokenUpperBound: persistedReservation.billableInputTokenUpperBound,
    costUsd: persistedReservation.maximumCostUsd,
    billingBasis: 'failed_reservation',
  }
  input.ledger.calls.push(call)
  return call
}

export function reconcilePendingConsultationReservations(
  ledger: ConsultationCostLedger,
): ConsultationCostCall[] {
  const pending = ledger.reservations
    .filter((reservation) => reservation.status === 'pending')
    .map((reservation) => ({ ...reservation }))
  return pending.map((reservation) => failConsultationReservation({ ledger, reservation }))
}

export function finalizeConsultationCostLedger(
  ledger: ConsultationCostLedger,
  expected?: { minimumAuthorCalls?: number; requireReview?: boolean },
): {
  artifactHash: `sha256:${string}`
  policyVersion: typeof CONSULTATION_COST_POLICY_VERSION
  budgetUsd: number
  actualUsd: number
  callCount: number
} {
  const policy = POLICY[ledger.plan]
  if (ledger.actualUsd > policy.budgetUsd + 1e-9) {
    throw new ConsultationCostPolicyError('cost.budget_exceeded', '成本台帳超出政策預算')
  }
  if (ledger.reservedUsd > 1e-9 || ledger.reservations.some((reservation) => reservation.status === 'pending')) {
    throw new ConsultationCostPolicyError('cost.reservation_pending', '仍有未結算的模型成本預留')
  }
  const authorCalls = ledger.calls.filter((call) => call.stage === 'author').length
  const reviewCalls = ledger.calls.filter((call) => call.stage === 'review').length
  if (expected?.minimumAuthorCalls && authorCalls < expected.minimumAuthorCalls) {
    throw new ConsultationCostPolicyError('cost.author_receipts_missing', '章節作者用量收據不足')
  }
  if (expected?.requireReview && reviewCalls < 1) {
    throw new ConsultationCostPolicyError('cost.review_receipt_missing', '獨立審查至少需要一筆用量收據')
  }
  const payload = {
    policyVersion: CONSULTATION_COST_POLICY_VERSION,
    plan: ledger.plan,
    budgetUsd: policy.budgetUsd,
    actualUsd: ledger.actualUsd,
    reservedUsd: ledger.reservedUsd,
    calls: ledger.calls,
    reservations: ledger.reservations,
  }
  const digest = sha256HexSync(JSON.stringify(payload))
  return {
    artifactHash: `sha256:${digest}`,
    policyVersion: CONSULTATION_COST_POLICY_VERSION,
    budgetUsd: policy.budgetUsd,
    actualUsd: ledger.actualUsd,
    callCount: ledger.calls.length,
  }
}
