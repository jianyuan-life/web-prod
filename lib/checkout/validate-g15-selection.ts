import { canonicalGregorianDate } from '../consultation/calendar-date.ts'
import { replayableConsultationBirthSettings } from '../consultation/birth-input-policy.ts'
import { sha256HexSync } from '../consultation/sha256.ts'

export interface G15SelectionReportRow {
  id: string
  client_name: string | null
  plan_code: string | null
  status: string | null
  deleted_at: string | null
  user_id: string | null
  customer_email: string | null
  birth_data: unknown
}

export type QueryG15SelectionReports = (
  reportIds: readonly string[],
) => Promise<{
  data: readonly G15SelectionReportRow[] | null
  error: unknown | null
}>

export interface ValidateG15SelectionInput {
  selectedReportIds: unknown
  auth?: {
    userId?: unknown
    email?: unknown
  }
  queryReports: QueryG15SelectionReports
}

export interface ValidG15Selection {
  ok: true
  reportIds: string[]
  memberNames: string[]
  personFingerprints: string[]
}

export type G15SelectionValidationCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_SELECTION'
  | 'QUERY_FAILED'
  | 'REPORT_MISMATCH'
  | 'INELIGIBLE_REPORT'
  | 'DUPLICATE_PERSON'
  | 'CONSENT_REQUIRED'
  | 'FORBIDDEN'

export interface InvalidG15Selection {
  ok: false
  code: G15SelectionValidationCode
  message: string
}

export type G15SelectionValidationResult = ValidG15Selection | InvalidG15Selection

function reject(
  code: G15SelectionValidationCode,
  message: string,
): InvalidG15Selection {
  return { ok: false, code, message }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, '').toLocaleLowerCase('zh-TW')
    : ''
}

function normalizedGender(value: unknown): string {
  const gender = typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
  if (['m', 'male', '男'].includes(gender)) return 'male'
  if (['f', 'female', '女'].includes(gender)) return 'female'
  if (['x', 'other', '其他', '不指定'].includes(gender)) return 'other'
  return ''
}

function canonicalPersonFingerprint(row: G15SelectionReportRow): string | null {
  if (!isRecord(row.birth_data)) return null
  let replaySettings
  try { replaySettings = replayableConsultationBirthSettings(row.birth_data) } catch { return null }
  const birthName = normalizedName(row.birth_data.name)
  const rowName = normalizedName(row.client_name)
  const year = Number(row.birth_data.year)
  const month = Number(row.birth_data.month)
  const day = Number(row.birth_data.day)
  try {
    canonicalGregorianDate({ year, month, day }, { minimumYear: 1900, maximumYear: 2200 })
  } catch {
    return null
  }
  const gender = normalizedGender(row.birth_data.gender)
  if (!birthName || birthName !== rowName || !gender) return null
  const canonical = JSON.stringify({
    name: birthName,
    year,
    month,
    day,
    gender,
    calendarType: 'solar',
    ...replaySettings,
  })
  return `sha256:${sha256HexSync(canonical)}`
}

export async function validateG15Selection(
  input: ValidateG15SelectionInput,
): Promise<G15SelectionValidationResult> {
  if (
    !Array.isArray(input.selectedReportIds)
    || input.selectedReportIds.some((id) => typeof id !== 'string')
  ) {
    return reject('INVALID_SELECTION', '報告選擇格式不正確')
  }
  const reportIds = input.selectedReportIds.map((id: string) => id.toLowerCase())
  if (reportIds.length < 2 || reportIds.length > 8) {
    return reject('INVALID_SELECTION', '家族藍圖需選擇 2 至 8 份報告')
  }
  if (
    reportIds.some((id) => !UUID_PATTERN.test(id) || id === NIL_UUID)
    || new Set(reportIds).size !== reportIds.length
  ) {
    return reject('INVALID_SELECTION', '報告選擇格式不正確')
  }

  const authenticatedUserId = typeof input.auth?.userId === 'string'
    ? input.auth.userId.trim().toLowerCase()
    : ''
  const authenticatedEmail = typeof input.auth?.email === 'string'
    ? input.auth.email.trim().toLowerCase()
    : ''
  if (!authenticatedUserId && !authenticatedEmail) {
    return reject('AUTH_REQUIRED', '請先登入再選擇家庭報告')
  }

  let queryResult: Awaited<ReturnType<QueryG15SelectionReports>>
  try {
    queryResult = await input.queryReports(reportIds)
  } catch {
    return reject('QUERY_FAILED', '報告查詢失敗，請稍後再試')
  }
  if (queryResult.error || !Array.isArray(queryResult.data)) {
    return reject('QUERY_FAILED', '報告查詢失敗，請稍後再試')
  }

  const returnedIds = queryResult.data.map((row) =>
    typeof row?.id === 'string' ? row.id.toLowerCase() : '',
  )
  const selectedIdSet = new Set(reportIds)
  if (
    queryResult.data.length !== reportIds.length
    || new Set(returnedIds).size !== returnedIds.length
    || returnedIds.some((id) => !selectedIdSet.has(id))
  ) {
    return reject('REPORT_MISMATCH', '找不到可用的完整報告選擇')
  }
  if (queryResult.data.some((row) => {
    const rowUserId = row.user_id?.trim().toLowerCase() ?? ''
    const rowEmail = row.customer_email?.trim().toLowerCase() ?? ''
    const sameUser = Boolean(authenticatedUserId && rowUserId === authenticatedUserId)
    const samePurchaserEmail = Boolean(authenticatedEmail && rowEmail === authenticatedEmail)
    return !sameUser && !samePurchaserEmail
  })) {
    return reject('FORBIDDEN', '無權使用選取的報告')
  }
  if (queryResult.data.some((row) =>
    row.plan_code !== 'C'
    || row.status !== 'completed'
    || row.deleted_at !== null
    || typeof row.client_name !== 'string'
    || row.client_name.trim().length === 0
    || canonicalPersonFingerprint(row) === null
  )) {
    return reject('INELIGIBLE_REPORT', '選取的報告無法用於家族藍圖')
  }

  const rowsById = new Map(queryResult.data.map((row) => [row.id.toLowerCase(), row]))
  const reports = reportIds.map((id) => rowsById.get(id) as G15SelectionReportRow)
  const personFingerprints = reports.map((row) => canonicalPersonFingerprint(row)!)
  if (new Set(personFingerprints).size !== personFingerprints.length) {
    return reject('DUPLICATE_PERSON', '同一位成員不能用多份人生藍圖重複加入家族報告')
  }

  return {
    ok: true,
    reportIds,
    memberNames: reports.map((row) => row.client_name?.trim() ?? ''),
    personFingerprints,
  }
}
