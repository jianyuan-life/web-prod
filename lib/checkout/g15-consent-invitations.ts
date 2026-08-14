import { createHmac, randomBytes, randomUUID } from 'node:crypto'

import { sha256HexSync } from '../consultation/sha256.ts'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_RECEIPT_MAX_AGE_MS,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
  hashG15ConsentToken,
} from './g15-independent-consent.ts'

export const G15_CONSENT_IDENTITY_LIMITATION =
  '只有登入與該份報告 user_id 相同的 Supabase 帳號才能操作；這是帳號與報告擁有者綁定，不等於實名驗證或 KYC。'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u
const SIX_DAYS_MS = Math.min(G15_CONSENT_RECEIPT_MAX_AGE_MS, 6 * 24 * 60 * 60 * 1000)

export type G15ConsentInvitationMember = {
  reportId: string
  subjectUserId: string
  name: string
  canonicalEmail: string
}

export type G15ConsentInvitationDelivery = {
  reportId: string
  name: string
  toEmail: string
  acceptToken: string
  revokeToken: string
  actionUrl: string
}

export type G15ConsentReceiptSpec = {
  report_id: string
  subject_user_id: string
  email_hmac: `hmac-sha256:${string}`
  accept_token_hash: `sha256:${string}`
  revoke_token_hash: `sha256:${string}`
}

function normalizedUuid(value: string): string {
  return value.trim().toLowerCase()
}

function normalizedEmail(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function emailHmac(email: string, secret: string): `hmac-sha256:${string}` {
  return `hmac-sha256:${createHmac('sha256', secret).update(email, 'utf8').digest('hex')}`
}

function defaultToken(): string {
  return randomBytes(32).toString('base64url')
}

export function buildG15ConsentInvitationBatch(input: {
  members: readonly G15ConsentInvitationMember[]
  purchaserUserId: string
  requestKey: string
  siteUrl: string
  emailHmacSecret: string
  nowMs?: number
  generateToken?: () => string
  generateSelectionId?: () => string
}) {
  if (input.members.length < 2 || input.members.length > 8) {
    throw new TypeError('家族藍圖逐位同意需包含 2 至 8 位成年成員')
  }
  const purchaserUserId = normalizedUuid(input.purchaserUserId)
  const requestKey = normalizedUuid(input.requestKey)
  if (!UUID_PATTERN.test(purchaserUserId) || !UUID_PATTERN.test(requestKey)) {
    throw new TypeError('G15 同意請求識別碼無效')
  }
  if (Buffer.byteLength(input.emailHmacSecret, 'utf8') < 32) {
    throw new TypeError('G15 同意 Email HMAC secret 未設定或長度不足')
  }

  const baseUrl = new URL('/g15-consent', input.siteUrl)
  if (!['https:', 'http:'].includes(baseUrl.protocol)) {
    throw new TypeError('G15 同意連結網址無效')
  }
  const members = input.members.map((member) => ({
    reportId: normalizedUuid(member.reportId),
    subjectUserId: normalizedUuid(member.subjectUserId),
    name: member.name.normalize('NFKC').trim(),
    canonicalEmail: normalizedEmail(member.canonicalEmail),
  }))
  if (
    members.some((member) => (
      !UUID_PATTERN.test(member.reportId)
      || !UUID_PATTERN.test(member.subjectUserId)
      || !member.name
      || !EMAIL_PATTERN.test(member.canonicalEmail)
    ))
    || new Set(members.map((member) => member.reportId)).size !== members.length
  ) {
    throw new TypeError('每位成年成員都必須綁定一份有效人生藍圖、Supabase 帳號與 canonical Email')
  }
  if (new Set(members.map((member) => member.subjectUserId)).size !== members.length) {
    throw new TypeError('每份報告必須屬於不同的 Supabase 帳號')
  }
  if (new Set(members.map((member) => member.canonicalEmail)).size !== members.length) {
    throw new TypeError('每位成年成員必須使用不同的 Supabase canonical Email')
  }

  const generateToken = input.generateToken ?? defaultToken
  const generateSelectionId = input.generateSelectionId ?? randomUUID
  const selectionId = normalizedUuid(generateSelectionId())
  if (!UUID_PATTERN.test(selectionId)) throw new TypeError('G15 同意 selection 識別碼無效')
  const expiresAt = new Date((input.nowMs ?? Date.now()) + SIX_DAYS_MS).toISOString()
  const seenTokens = new Set<string>()

  const receipts: G15ConsentReceiptSpec[] = []
  const deliveries: G15ConsentInvitationDelivery[] = []
  for (const member of members) {
    const acceptToken = generateToken()
    const revokeToken = generateToken()
    hashG15ConsentToken(acceptToken)
    hashG15ConsentToken(revokeToken)
    if (acceptToken === revokeToken || seenTokens.has(acceptToken) || seenTokens.has(revokeToken)) {
      throw new Error('G15 同意 bearer token 產生碰撞')
    }
    seenTokens.add(acceptToken)
    seenTokens.add(revokeToken)
    receipts.push({
      report_id: member.reportId,
      subject_user_id: member.subjectUserId,
      email_hmac: emailHmac(member.canonicalEmail, input.emailHmacSecret),
      accept_token_hash: hashG15ConsentToken(acceptToken),
      revoke_token_hash: hashG15ConsentToken(revokeToken),
    })
    const fragment = new URLSearchParams({ accept: acceptToken, revoke: revokeToken }).toString()
    deliveries.push({
      reportId: member.reportId,
      name: member.name,
      toEmail: member.canonicalEmail,
      acceptToken,
      revokeToken,
      actionUrl: `${baseUrl.toString()}#${fragment}`,
    })
  }

  const reportIds = members.map((member) => member.reportId)
  const selectedReportIdsHash = hashG15ConsentReportIds(reportIds)
  const requestPayloadHash = `sha256:${sha256HexSync(JSON.stringify({
    purchaserUserId,
    requestKey,
    reportIds: [...reportIds].sort(),
    subjectUserIds: members.map((member) => member.subjectUserId).sort(),
    emailHmacs: receipts
      .map((receipt) => [receipt.report_id, receipt.email_hmac])
      .sort(([left], [right]) => left.localeCompare(right)),
    policyVersion: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    purpose: G15_CONSENT_PURPOSE,
    sharingScope: G15_CONSENT_SHARING_SCOPE,
  }))}` as const

  const rpcArgs = {
    p_selection_id: selectionId,
    p_request_key: requestKey,
    p_request_payload_hash: requestPayloadHash,
    p_purchaser_user_id: purchaserUserId,
    p_report_ids: reportIds,
    p_selected_report_ids_hash: selectedReportIdsHash,
    p_policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    p_purpose: G15_CONSENT_PURPOSE,
    p_sharing_scope: G15_CONSENT_SHARING_SCOPE,
    p_expires_at: expiresAt,
    p_receipts: receipts,
  }

  return { selectionId, expiresAt, receipts, deliveries, rpcArgs }
}
