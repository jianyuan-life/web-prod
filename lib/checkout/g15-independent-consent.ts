import { sha256HexSync } from '../consultation/sha256.ts'

export const G15_INDEPENDENT_CONSENT_POLICY_VERSION = 'g15-family-member-consent/v4.0.0'
export const G15_CONSENT_PURPOSE = 'prepare_and_generate_g15_family_blueprint'
export const G15_CONSENT_SHARING_SCOPE = 'purchaser_and_selected_adult_members_summary_only'
export const G15_CONSENT_RECEIPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type G15IndependentConsentStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export const G15_CONSENT_SELECTION_COLUMNS = 'id,purchaser_user_id,selected_report_ids,selected_report_ids_hash,policy_version,purpose,sharing_scope,expires_at,superseded_at,consumed_at,consumed_stripe_session_id,consumed_report_id'
export const G15_CONSENT_RECEIPT_COLUMNS = 'selection_id,subject_report_id,subject_user_id,subject_email_hmac,status,accepted_at,revoked_at,expires_at,accept_token_hash,revoke_token_hash'

export type QueryG15IndependentConsent = (input: {
  selectionId: string
  purchaserUserId: string
  reportIds: readonly string[]
  subjectUserIds: readonly string[]
}) => Promise<{
  selection: unknown | null
  receipts: readonly unknown[] | null
  error: unknown | null
}>

export type G15IndependentConsentAuthority = {
  selectionId: string
  policyVersion: typeof G15_INDEPENDENT_CONSENT_POLICY_VERSION
  purpose: typeof G15_CONSENT_PURPOSE
  sharingScope: typeof G15_CONSENT_SHARING_SCOPE
  expiresAt: string
  acceptedAtByReport: Record<string, string>
}

export type G15PersistedConsentAuthority = {
  selection_id: string
  policy_version: typeof G15_INDEPENDENT_CONSENT_POLICY_VERSION
  purpose: typeof G15_CONSENT_PURPOSE
  sharing_scope: typeof G15_CONSENT_SHARING_SCOPE
  expires_at: string
  accepted_at_by_report: Record<string, string>
  subject_user_ids_by_report: Record<string, string>
}

export type G15IndependentConsentValidation =
  | { ok: true; authority: G15IndependentConsentAuthority }
  | {
      ok: false
      code: 'CONSENT_MISSING' | 'CONSENT_DRIFT' | 'CONSENT_PENDING' | 'CONSENT_EXPIRED'
      message: string
    }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u
const HMAC_SHA256_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeUuid(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function canonicalReportIds(reportIds: readonly string[]): string[] {
  return reportIds.map((reportId) => normalizeUuid(reportId)).sort()
}

export function hashG15ConsentReportIds(reportIds: readonly string[]): `sha256:${string}` {
  return `sha256:${sha256HexSync(JSON.stringify(canonicalReportIds(reportIds)))}`
}

export function hashG15ConsentToken(token: string): `sha256:${string}` {
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(token)) {
    throw new TypeError('G15 consent bearer token format is invalid')
  }
  return `sha256:${sha256HexSync(token)}`
}

export function validateG15PersistedConsentAuthority(input: {
  authority: unknown
  selectionId: unknown
  reportIds: readonly string[]
  subjectUserIds?: readonly string[]
}): { ok: true; authority: G15PersistedConsentAuthority } | { ok: false } {
  const selectionId = normalizeUuid(input.selectionId)
  const reportIds = canonicalReportIds(input.reportIds)
  if (
    !UUID_PATTERN.test(selectionId)
    || reportIds.length < 2
    || reportIds.length > 8
    || reportIds.some((reportId) => !UUID_PATTERN.test(reportId))
    || new Set(reportIds).size !== reportIds.length
    || !isRecord(input.authority)
    || !isRecord(input.authority.accepted_at_by_report)
    || !isRecord(input.authority.subject_user_ids_by_report)
  ) {
    return { ok: false }
  }
  const expiresAt = typeof input.authority.expires_at === 'string'
    ? Date.parse(input.authority.expires_at)
    : Number.NaN
  const acceptedAtByReport = input.authority.accepted_at_by_report
  const subjectUserIdsByReport = input.authority.subject_user_ids_by_report
  if (
    input.authority.selection_id !== selectionId
    || input.authority.policy_version !== G15_INDEPENDENT_CONSENT_POLICY_VERSION
    || input.authority.purpose !== G15_CONSENT_PURPOSE
    || input.authority.sharing_scope !== G15_CONSENT_SHARING_SCOPE
    || !Number.isFinite(expiresAt)
    || Object.keys(acceptedAtByReport).length !== reportIds.length
    || Object.keys(subjectUserIdsByReport).length !== reportIds.length
  ) {
    return { ok: false }
  }
  const normalizedAcceptedAt: Record<string, string> = {}
  const normalizedSubjectUserIds: Record<string, string> = {}
  for (const reportId of reportIds) {
    const acceptedAtValue = acceptedAtByReport[reportId]
    const acceptedAt = typeof acceptedAtValue === 'string' ? Date.parse(acceptedAtValue) : Number.NaN
    if (!Number.isFinite(acceptedAt) || acceptedAt > expiresAt) return { ok: false }
    const subjectUserId = normalizeUuid(subjectUserIdsByReport[reportId])
    if (!UUID_PATTERN.test(subjectUserId)) return { ok: false }
    normalizedAcceptedAt[reportId] = acceptedAtValue as string
    normalizedSubjectUserIds[reportId] = subjectUserId
  }
  if (new Set(Object.values(normalizedSubjectUserIds)).size !== reportIds.length) return { ok: false }
  return {
    ok: true,
    authority: {
      selection_id: selectionId,
      policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharing_scope: G15_CONSENT_SHARING_SCOPE,
      expires_at: input.authority.expires_at as string,
      accepted_at_by_report: normalizedAcceptedAt,
      subject_user_ids_by_report: normalizedSubjectUserIds,
    },
  }
}

function reject(
  code: Extract<G15IndependentConsentValidation, { ok: false }>['code'],
  message: string,
): G15IndependentConsentValidation {
  return { ok: false, code, message }
}

export function validateG15IndependentConsent(input: {
  selection: unknown
  receipts: unknown
  purchaserUserId: unknown
  reportIds: readonly string[]
  subjectUserIds: readonly string[]
  nowMs?: number
}): G15IndependentConsentValidation {
  const purchaserUserId = normalizeUuid(input.purchaserUserId)
  const reportSubjectPairs = input.reportIds.map((reportId, index) => ({
    reportId: normalizeUuid(reportId),
    subjectUserId: normalizeUuid(input.subjectUserIds[index]),
  })).sort((left, right) => left.reportId.localeCompare(right.reportId))
  const requestedReportIds = reportSubjectPairs.map((pair) => pair.reportId)
  const requestedSubjectUserIds = reportSubjectPairs.map((pair) => pair.subjectUserId)
  if (
    !UUID_PATTERN.test(purchaserUserId)
    || requestedReportIds.length < 2
    || requestedReportIds.length > 8
    || requestedReportIds.some((reportId) => !UUID_PATTERN.test(reportId))
    || new Set(requestedReportIds).size !== requestedReportIds.length
    || requestedSubjectUserIds.length !== requestedReportIds.length
    || requestedSubjectUserIds.some((userId) => !UUID_PATTERN.test(userId))
    || new Set(requestedSubjectUserIds).size !== requestedSubjectUserIds.length
    || !isRecord(input.selection)
    || !Array.isArray(input.receipts)
  ) {
    return reject('CONSENT_MISSING', '找不到可驗證的逐位成員同意紀錄')
  }

  const selectionId = normalizeUuid(input.selection.id)
  const selectionPurchaserId = normalizeUuid(input.selection.purchaser_user_id)
  const selectionReportIds = Array.isArray(input.selection.selected_report_ids)
    && input.selection.selected_report_ids.every((value) => typeof value === 'string')
    ? canonicalReportIds(input.selection.selected_report_ids as string[])
    : []
  if (
    !UUID_PATTERN.test(selectionId)
    || selectionPurchaserId !== purchaserUserId
    || JSON.stringify(selectionReportIds) !== JSON.stringify(requestedReportIds)
    || input.selection.selected_report_ids_hash !== hashG15ConsentReportIds(requestedReportIds)
    || input.selection.policy_version !== G15_INDEPENDENT_CONSENT_POLICY_VERSION
    || input.selection.purpose !== G15_CONSENT_PURPOSE
    || input.selection.sharing_scope !== G15_CONSENT_SHARING_SCOPE
    || input.selection.superseded_at !== null
    || input.selection.consumed_at !== null
    || input.selection.consumed_stripe_session_id !== null
    || input.selection.consumed_report_id !== null
  ) {
    return reject('CONSENT_DRIFT', '逐位成員同意紀錄與目前家庭選擇不一致')
  }

  const nowMs = input.nowMs ?? Date.now()
  const selectionExpiresAt = typeof input.selection.expires_at === 'string'
    ? Date.parse(input.selection.expires_at)
    : Number.NaN
  if (!Number.isFinite(selectionExpiresAt) || selectionExpiresAt <= nowMs) {
    return reject('CONSENT_EXPIRED', '逐位成員同意已過期，請重新邀請')
  }

  if (input.receipts.length !== requestedReportIds.length) {
    return reject('CONSENT_PENDING', '仍有家庭成員尚未完成獨立同意')
  }

  const receiptsByReport = new Map<string, Record<string, unknown>>()
  const subjectUserIdByReport = new Map(
    requestedReportIds.map((reportId, index) => [reportId, requestedSubjectUserIds[index]]),
  )
  for (const rawReceipt of input.receipts) {
    if (!isRecord(rawReceipt)) {
      return reject('CONSENT_DRIFT', '逐位成員同意紀錄格式不正確')
    }
    const reportId = normalizeUuid(rawReceipt.subject_report_id)
    if (
      normalizeUuid(rawReceipt.selection_id) !== selectionId
      || !requestedReportIds.includes(reportId)
      || receiptsByReport.has(reportId)
      || normalizeUuid(rawReceipt.subject_user_id) !== subjectUserIdByReport.get(reportId)
      || typeof rawReceipt.subject_email_hmac !== 'string'
      || !HMAC_SHA256_PATTERN.test(rawReceipt.subject_email_hmac)
    ) {
      return reject('CONSENT_DRIFT', '逐位成員同意紀錄與目前家庭選擇不一致')
    }
    receiptsByReport.set(reportId, rawReceipt)
  }

  const acceptedAtByReport: Record<string, string> = {}
  for (const reportId of requestedReportIds) {
    const receipt = receiptsByReport.get(reportId)
    if (!receipt) {
      return reject('CONSENT_PENDING', '仍有家庭成員尚未完成獨立同意')
    }
    const receiptExpiresAt = typeof receipt.expires_at === 'string'
      ? Date.parse(receipt.expires_at)
      : Number.NaN
    if (!Number.isFinite(receiptExpiresAt) || receiptExpiresAt <= nowMs) {
      return reject('CONSENT_EXPIRED', '逐位成員同意已過期，請重新邀請')
    }
    if (
      receipt.status !== 'accepted'
      || receipt.revoked_at !== null
      || receipt.accept_token_hash !== null
      || typeof receipt.revoke_token_hash !== 'string'
      || !SHA256_PATTERN.test(receipt.revoke_token_hash)
    ) {
      return reject('CONSENT_PENDING', '仍有家庭成員尚未完成獨立同意，或同意已撤回')
    }
    const acceptedAt = typeof receipt.accepted_at === 'string'
      ? Date.parse(receipt.accepted_at)
      : Number.NaN
    if (!Number.isFinite(acceptedAt) || acceptedAt > nowMs + 5 * 60 * 1000) {
      return reject('CONSENT_DRIFT', '逐位成員同意時間不正確')
    }
    acceptedAtByReport[reportId] = receipt.accepted_at as string
  }

  return {
    ok: true,
    authority: {
      selectionId,
      policyVersion: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharingScope: G15_CONSENT_SHARING_SCOPE,
      expiresAt: input.selection.expires_at as string,
      acceptedAtByReport,
    },
  }
}
