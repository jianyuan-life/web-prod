import {
  validateG15Selection,
  type G15SelectionValidationCode,
  type QueryG15SelectionReports,
} from './validate-g15-selection.ts'
import { validateG15ConsentAttestation } from './g15-consent.ts'
import { validateG15ConsultationContext } from './g15-context.ts'
import { replayableConsultationBirthSettings } from '../consultation/birth-input-policy.ts'
import { canonicalGregorianDate } from '../consultation/calendar-date.ts'

export const G15_SELECTION_COLUMNS = 'id,client_name,plan_code,status,deleted_at,user_id,customer_email,birth_data'

export interface PrepareCheckoutBirthDataInput {
  planCode: unknown
  birthData: unknown
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

export async function prepareCheckoutBirthData(
  input: PrepareCheckoutBirthDataInput,
): Promise<PrepareCheckoutBirthDataResult> {
  if (input.planCode === 'C') {
    if (!isRecord(input.birthData)) {
      return { ok: false, code: 'INVALID_SELECTION', message: '人生藍圖出生資料不完整' }
    }
    try {
      replayableConsultationBirthSettings(input.birthData)
      canonicalGregorianDate({
        year: Number(input.birthData.year),
        month: Number(input.birthData.month),
        day: Number(input.birthData.day),
      }, { minimumYear: 1900, maximumYear: 2200 })
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
    return { ok: true, birthData: input.birthData }
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

  return {
    ok: true,
    birthData: {
      plan_type: 'family_reports',
      report_ids: validation.reportIds,
      member_names: validation.memberNames,
      stated_relationships: context.context.statedRelationships,
      consultation_goals: context.context.consultationGoals,
      consent_attestation: consent.attestation,
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
