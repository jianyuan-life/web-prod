import {
  validateG15Selection,
  type G15SelectionValidationCode,
  type QueryG15SelectionReports,
} from './validate-g15-selection.ts'
import { validateG15ConsentAttestation } from './g15-consent.ts'
import { validateG15ConsultationContext } from './g15-context.ts'
import { replayableConsultationBirthSettings } from '../consultation/birth-input-policy.ts'
import { canonicalGregorianDate } from '../consultation/calendar-date.ts'
import { buildAgeContext } from '../consultation/age-context.ts'
import { normalizeConsultationRelationshipStatus } from '../consultation/relationship-context.ts'
import { normalizeConsultationClientQuestion } from '../consultation/client-question.ts'
import {
  classifyConsultationLocalTime,
  consultationLocalTimeIssueMessage,
  consultationTimezoneOffsetHoursAtEpoch,
  resolveConsultationUnknownTime,
} from '../consultation/local-time-validity.ts'

export const G15_SELECTION_COLUMNS = 'id,client_name,plan_code,status,deleted_at,user_id,customer_email,birth_data'

export interface PrepareCheckoutBirthDataInput {
  planCode: unknown
  birthData: unknown
  /** Date-only checkout boundary. Callers normally omit this; tests inject it. */
  asOfDate?: string
  auth?: {
    userId?: unknown
    email?: unknown
  }
  queryReports: QueryG15SelectionReports
}

export interface PreparedCheckoutBirthData {
  ok: true
  birthData: unknown
}

export interface RejectedCheckoutBirthData {
  ok: false
  code: G15SelectionValidationCode
  message: string
}

export type PrepareCheckoutBirthDataResult =
  | PreparedCheckoutBirthData
  | RejectedCheckoutBirthData

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function currentCheckoutCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function checkoutAsOfDate(value?: string): string {
  const raw = value ?? currentCheckoutCalendarDate()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw)
  if (!match) throw new RangeError('invalid checkout as-of date')
  return canonicalGregorianDate({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  })
}

export async function prepareCheckoutBirthData(
  input: PrepareCheckoutBirthDataInput,
): Promise<PrepareCheckoutBirthDataResult> {
  if (input.planCode === 'C') {
    if (!isRecord(input.birthData)) {
      return { ok: false, code: 'INVALID_SELECTION', message: '人生藍圖出生資料不完整' }
    }
    if (input.birthData.birth_location_precision !== 'city') {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '請從搜尋結果中選擇實際出生城市；不能只用國家代表座標進行計算',
      }
    }
    let birthDate = ''
    let asOfDate = ''
    let replaySettings: ReturnType<typeof replayableConsultationBirthSettings>
    try {
      replaySettings = replayableConsultationBirthSettings(input.birthData)
      birthDate = canonicalGregorianDate({
        year: Number(input.birthData.year),
        month: Number(input.birthData.month),
        day: Number(input.birthData.day),
      }, { minimumYear: 1900, maximumYear: 2200 })
      asOfDate = checkoutAsOfDate(input.asOfDate)
      const name = typeof input.birthData.name === 'string' ? input.birthData.name.trim() : ''
      const gender = typeof input.birthData.gender === 'string'
        ? input.birthData.gender.trim().toUpperCase()
        : ''
      if (!name || !['M', 'F'].includes(gender)) throw new Error('identity incomplete')
    } catch {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '請確認姓名、國曆日期、出生時間精度、地點與時區資料完整後再付款',
      }
    }
    if (birthDate > asOfDate) {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '出生日期不能晚於今天，請確認年、月、日後再付款',
      }
    }
    const localTimeValidity = replaySettings.timeMode === 'unknown'
      ? resolveConsultationUnknownTime({
          year: Number(input.birthData.year),
          month: Number(input.birthData.month),
          day: Number(input.birthData.day),
          timezone: replaySettings.timezone,
        })
      : classifyConsultationLocalTime({
        year: Number(input.birthData.year),
        month: Number(input.birthData.month),
        day: Number(input.birthData.day),
        hour: replaySettings.hour,
        minute: replaySettings.minute,
        timezone: replaySettings.timezone,
      })
    if (localTimeValidity.status !== 'unique') {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: replaySettings.timeMode === 'unknown'
          ? '這個出生日期在當地時制中不存在，請重新核對出生日期與城市'
          : consultationLocalTimeIssueMessage(localTimeValidity.status)
            || '出生時間無法安全對應到實際時刻，請重新核對後再付款',
      }
    }
    const effectiveTimezoneOffset = consultationTimezoneOffsetHoursAtEpoch(
      replaySettings.timezone,
      localTimeValidity.candidateEpochMs[0],
    )
    if (
      effectiveTimezoneOffset === null
      || Math.abs(effectiveTimezoneOffset - replaySettings.timezoneOffset) > 0.001
    ) {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '出生地固定時差未正確套用出生當時的夏令時間，請重新選擇出生城市後再付款',
      }
    }
    const ageContext = buildAgeContext({ birthDate, asOfDate })
    if (ageContext.ageYears < 18) {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '未滿 18 歲的人生藍圖專屬報告仍在完善中，目前暫不接受付款，以免產生不適齡內容',
      }
    }
    const relationshipStatus = normalizeConsultationRelationshipStatus(input.birthData.marital_status)
    if (!relationshipStatus) {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: '請重新選擇目前關係狀態後再付款',
      }
    }
    let customerNote: string | null
    try {
      customerNote = normalizeConsultationClientQuestion(input.birthData.customer_note)
    } catch (error) {
      return {
        ok: false,
        code: 'INVALID_SELECTION',
        message: error instanceof Error ? error.message : '客戶問題格式不正確',
      }
    }
    const normalizedBirthData = {
      ...input.birthData,
      marital_status: relationshipStatus,
      as_of: asOfDate,
      target_year: Number(asOfDate.slice(0, 4)),
      ...(customerNote ? { customer_note: customerNote } : { customer_note: undefined }),
    }
    return { ok: true, birthData: normalizedBirthData }
  }

  if (input.planCode !== 'G15') {
    return { ok: true, birthData: input.birthData }
  }

  if (!isRecord(input.birthData) || input.birthData.plan_type !== 'family_reports') {
    return {
      ok: false,
      code: 'INVALID_SELECTION',
      message: '家族藍圖的報告選擇格式不正確',
    }
  }

  if (!Array.isArray(input.birthData.report_ids) || input.birthData.report_ids.some((id) => typeof id !== 'string')) {
    return { ok: false, code: 'INVALID_SELECTION', message: '家族藍圖的報告選擇格式不正確' }
  }
  const hasAuth = (typeof input.auth?.userId === 'string' && input.auth.userId.trim()) ||
    (typeof input.auth?.email === 'string' && input.auth.email.trim())
  if (!hasAuth) return { ok: false, code: 'AUTH_REQUIRED', message: '請先登入再選擇家庭報告' }

  const rawReportIds = input.birthData.report_ids as string[]
  const consent = validateG15ConsentAttestation({
    attestation: input.birthData.consent_attestation,
    reportIds: rawReportIds,
  })
  if (!consent.ok) {
    return { ok: false, code: 'CONSENT_REQUIRED', message: consent.message }
  }

  const context = validateG15ConsultationContext(input.birthData)
  if (!context.ok) {
    return { ok: false, code: 'INVALID_SELECTION', message: context.message }
  }

  const validation = await validateG15Selection({
    selectedReportIds: input.birthData.report_ids,
    auth: input.auth,
    queryReports: input.queryReports,
  })
  if (!validation.ok) return validation

  let asOfDate = ''
  try {
    asOfDate = checkoutAsOfDate(input.asOfDate)
  } catch {
    return { ok: false, code: 'INVALID_SELECTION', message: '家族藍圖的報告基準日無法固定，請重新結帳' }
  }

  return {
    ok: true,
    birthData: {
      plan_type: 'family_reports',
      report_ids: validation.reportIds,
      member_names: validation.memberNames,
      stated_relationships: context.context.statedRelationships,
      consultation_goals: context.context.consultationGoals,
      consent_attestation: consent.attestation,
      as_of: asOfDate,
      target_year: Number(asOfDate.slice(0, 4)),
    },
  }
}

export function getG15ValidationHttpStatus(
  code: G15SelectionValidationCode,
): 400 | 401 | 403 | 503 {
  if (code === 'AUTH_REQUIRED') return 401
  if (code === 'FORBIDDEN') return 403
  if (code === 'QUERY_FAILED') return 503
  return 400
}
