import { sha256HexSync } from '../consultation/sha256.ts'

export const G15_CONSENT_POLICY_VERSION = 'g15-family-data-consent/v2.0.0'
export const G15_CONSENT_MAX_AGE_MS = 30 * 60 * 1000
export const G15_AUTHORITY_BASIS = 'member_consent_or_legal_guardian' as const

export type G15ConsentAttestation = {
  accepted: true
  policy_version: typeof G15_CONSENT_POLICY_VERSION
  accepted_at: string
  selected_report_ids_hash: `sha256:${string}`
  authority_basis: typeof G15_AUTHORITY_BASIS
  minor_guardian_authority_confirmed: true
}

function normalizedReportIds(reportIds: readonly string[]): string[] {
  return reportIds.map((reportId) => reportId.trim().toLowerCase())
}

export function hashG15SelectedReportIds(reportIds: readonly string[]): `sha256:${string}` {
  const payload = JSON.stringify(normalizedReportIds(reportIds))
  return `sha256:${sha256HexSync(payload)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateG15ConsentAttestation(input: {
  attestation: unknown
  reportIds: readonly string[]
  nowMs?: number
  allowExpired?: boolean
}): { ok: true; attestation: G15ConsentAttestation } | { ok: false; message: string } {
  if (!isRecord(input.attestation) || input.attestation.accepted !== true) {
    return { ok: false, message: '請先勾選並確認已取得每位成員的資料使用同意' }
  }
  if (input.attestation.policy_version !== G15_CONSENT_POLICY_VERSION) {
    return { ok: false, message: '資料使用同意版本已更新，請重新確認' }
  }
  if (input.attestation.selected_report_ids_hash !== hashG15SelectedReportIds(input.reportIds)) {
    return { ok: false, message: '資料使用同意與目前選取的家庭成員不一致，請重新確認' }
  }
  if (
    input.attestation.authority_basis !== G15_AUTHORITY_BASIS ||
    input.attestation.minor_guardian_authority_confirmed !== true
  ) {
    return {
      ok: false,
      message: '請確認成年成員已明確同意；若包含未成年人，您具有法定監護權或已取得法定監護人授權',
    }
  }
  const acceptedAt = typeof input.attestation.accepted_at === 'string'
    ? Date.parse(input.attestation.accepted_at)
    : Number.NaN
  const nowMs = input.nowMs ?? Date.now()
  if (
    !Number.isFinite(acceptedAt) ||
    acceptedAt > nowMs + 5 * 60 * 1000 ||
    (!input.allowExpired && nowMs - acceptedAt > G15_CONSENT_MAX_AGE_MS)
  ) {
    return { ok: false, message: '資料使用同意已過期或時間不正確，請重新確認' }
  }
  return {
    ok: true,
    attestation: {
      accepted: true,
      policy_version: G15_CONSENT_POLICY_VERSION,
      accepted_at: input.attestation.accepted_at as string,
      selected_report_ids_hash: input.attestation.selected_report_ids_hash as `sha256:${string}`,
      authority_basis: G15_AUTHORITY_BASIS,
      minor_guardian_authority_confirmed: true,
    },
  }
}
