import { canonicalGregorianDate } from '../consultation/calendar-date.ts'
import { buildAgeContext } from '../consultation/age-context.ts'
import {
  ConsultationBirthInputPolicyError,
  replayableConsultationBirthSettings,
} from '../consultation/birth-input-policy.ts'
import {
  classifyConsultationLocalTime,
  consultationTimezoneOffsetHoursAtEpoch,
  resolveConsultationUnknownTime,
} from '../consultation/local-time-validity.ts'
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

export type G15ReportIneligibilityCode =
  | 'REPORT_UNAVAILABLE'
  | 'CALENDAR_REVIEW_REQUIRED'
  | 'BIRTH_TIME_REVIEW_REQUIRED'
  | 'BIRTHPLACE_REVIEW_REQUIRED'
  | 'MINOR_REVIEW_REQUIRED'
  | 'BIRTH_DATA_REVIEW_REQUIRED'

export type G15ReportEligibility =
  | { eligible: true; reasonCode: null; reason: null }
  | { eligible: false; reasonCode: G15ReportIneligibilityCode; reason: string }

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

export function g15PersonFingerprint(row: G15SelectionReportRow): string | null {
  if (!isRecord(row.birth_data)) return null
  try { replayableConsultationBirthSettings(row.birth_data) } catch { return null }
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
  })
  return `sha256:${sha256HexSync(canonical)}`
}

function currentHongKongDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function g15ReportEligibility(
  row: G15SelectionReportRow,
): G15ReportEligibility {
  if (
    row.plan_code !== 'C'
    || row.status !== 'completed'
    || row.deleted_at !== null
  ) {
    return {
      eligible: false,
      reasonCode: 'REPORT_UNAVAILABLE',
      reason: '這份人生藍圖目前無法加入家族藍圖',
    }
  }
  // 座標存在不代表它是當事人的實際出生城市。舊流程曾把國家代表點
  // 當出生地；沒有 city provenance 的 C 報告必須人工確認後才可進 G15。
  if (isRecord(row.birth_data) && row.birth_data.birth_location_precision !== 'city') {
    return {
      eligible: false,
      reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
      reason: '這份人生藍圖的實際出生城市需要重新確認，暫時不能加入',
    }
  }
  let replaySettings
  try {
    replaySettings = replayableConsultationBirthSettings(row.birth_data)
  } catch (error) {
    if (!(error instanceof ConsultationBirthInputPolicyError)) {
      return {
        eligible: false,
        reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
      }
    }
    if (error.code === 'birth.calendar_not_gregorian') {
      return {
        eligible: false,
        reasonCode: 'CALENDAR_REVIEW_REQUIRED',
        reason: '這份人生藍圖的曆法資料需要人工確認，暫時不能加入',
      }
    }
    if (
      error.code.startsWith('birth.time_')
      || error.code === 'birth.unknown_time_placeholder_noncanonical'
      || error.code === 'birth.shichen_minute_invalid'
    ) {
      return {
        eligible: false,
        reasonCode: 'BIRTH_TIME_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生時間需要重新確認，暫時不能加入',
      }
    }
    if (
      error.code === 'birth.latitude_missing'
      || error.code === 'birth.longitude_missing'
      || error.code.startsWith('birth.timezone_')
    ) {
      return {
        eligible: false,
        reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生地與時區資料不完整，暫時不能加入',
      }
    }
    return {
      eligible: false,
      reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
    }
  }
  if (!isRecord(row.birth_data)) {
    return {
      eligible: false,
      reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
    }
  }
  const localDate = {
    year: Number(row.birth_data.year),
    month: Number(row.birth_data.month),
    day: Number(row.birth_data.day),
  }
  let birthDate
  try {
    birthDate = canonicalGregorianDate(localDate, { minimumYear: 1900, maximumYear: 2200 })
  } catch {
    return {
      eligible: false,
      reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
    }
  }
  if (buildAgeContext({ birthDate, asOfDate: currentHongKongDate() }).ageYears < 18) {
    return {
      eligible: false,
      reasonCode: 'MINOR_REVIEW_REQUIRED',
      reason: '未成年人專屬的內容與監護流程尚未開放，這份報告目前不能加入',
    }
  }
  const localTime = replaySettings.timeUnknown
    ? resolveConsultationUnknownTime({ ...localDate, timezone: replaySettings.timezone })
    : classifyConsultationLocalTime({
        ...localDate,
        hour: replaySettings.hour,
        minute: replaySettings.minute,
        timezone: replaySettings.timezone,
      })
  if (
    localTime.status === 'nonexistent'
    || localTime.status === 'invalid'
    || (localTime.status === 'ambiguous' && replaySettings.fold === null)
  ) {
    return {
      eligible: false,
      reasonCode: 'BIRTH_TIME_REVIEW_REQUIRED',
      reason: replaySettings.timeUnknown
        ? '這份人生藍圖的出生日期在當地時制中不存在，需要重新確認後才能加入'
        : '這份人生藍圖的出生時間正逢時制切換，需要重新確認後才能加入',
    }
  }
  const candidateEpoch = localTime.candidateEpochMs[replaySettings.fold ?? 0]
  const effectiveTimezoneOffset = consultationTimezoneOffsetHoursAtEpoch(
    replaySettings.timezone,
    candidateEpoch,
  )
  if (
    effectiveTimezoneOffset === null
    || Math.abs(effectiveTimezoneOffset - replaySettings.timezoneOffset) > 0.001
  ) {
    return {
      eligible: false,
      reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生時區未包含當時的夏令時間，暫時不能加入',
    }
  }
  if (g15PersonFingerprint(row) === null) {
    return {
      eligible: false,
      reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
    }
  }
  return { eligible: true, reasonCode: null, reason: null }
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
    const sameLegacyPurchaserEmail = Boolean(
      !rowUserId && authenticatedEmail && rowEmail === authenticatedEmail,
    )
    return !sameUser && !sameLegacyPurchaserEmail
  })) {
    return reject('FORBIDDEN', '無權使用選取的報告')
  }
  if (queryResult.data.some((row) => !g15ReportEligibility(row).eligible)) {
    return reject('INELIGIBLE_REPORT', '選取的報告無法用於家族藍圖')
  }

  const rowsById = new Map(queryResult.data.map((row) => [row.id.toLowerCase(), row]))
  const reports = reportIds.map((id) => rowsById.get(id) as G15SelectionReportRow)
  const personFingerprints = reports.map((row) => g15PersonFingerprint(row)!)
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
