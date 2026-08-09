export type LegacyConsultationPlan = 'C' | 'G15'

export type LegacyReportRow = {
  plan_code: LegacyConsultationPlan
  status: 'completed'
  access_token: string
  ai_content?: unknown
  full_charts?: unknown
  narrative_summary?: unknown
  report_result?: unknown
}

export type LegacyReportReady = {
  ok: true
  mode: 'legacy_full_text'
  plan: LegacyConsultationPlan
  accessToken: string
  content: string
  fullCharts: unknown | null
  narrativeSummary: unknown | null
  facts: never[]
  provenance: {
    source: 'paid_reports'
    contentField: 'ai_content' | 'report_result' | 'report_result.ai_content'
  }
  asOf:
    | {
        status: 'known'
        value: string
        sourceField: 'report_result.asOfDate'
      }
    | {
        status: 'unknown'
        value: null
      }
}

export type LegacyReportHoldCode =
  | 'unsupported_plan'
  | 'report_not_completed'
  | 'invalid_access_token'
  | 'missing_legacy_content'
  | 'unexpected_row_fields'
  | 'invalid_row'
  | 'invalid_as_of'
  | 'conflicting_legacy_content'

export type LegacyReportHold = {
  ok: false
  mode: 'HOLD'
  code: LegacyReportHoldCode
  reasons: string[]
  provenance: {
    source: 'paid_reports'
    status: 'rejected'
  }
  asOf: {
    status: 'HOLD'
    value: null
  }
}

export type LegacyReportNormalization = LegacyReportReady | LegacyReportHold

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const ALLOWED_ROW_FIELDS = new Set([
  'plan_code',
  'status',
  'access_token',
  'ai_content',
  'full_charts',
  'narrative_summary',
  'report_result',
])

function hold(code: LegacyReportHoldCode, reason: string): LegacyReportHold {
  return {
    ok: false,
    mode: 'HOLD',
    code,
    reasons: [reason],
    provenance: {
      source: 'paid_reports',
      status: 'rejected',
    },
    asOf: {
      status: 'HOLD',
      value: null,
    },
  }
}

export function normalizeLegacyReport(input: unknown): LegacyReportNormalization {
  if (!isRecord(input)) {
    return hold('invalid_row', 'Input is not a paid_reports row object')
  }
  const row = input as LegacyReportRow
  const unexpectedFields = Object.keys(row).filter((field) => !ALLOWED_ROW_FIELDS.has(field))
  if (unexpectedFields.length > 0) {
    return hold(
      'unexpected_row_fields',
      'The paid_reports row was not loaded with the explicit legacy projection',
    )
  }
  if (row.plan_code !== 'C' && row.plan_code !== 'G15') {
    return hold('unsupported_plan', 'Only completed C and G15 paid_reports rows are eligible')
  }
  if (row.status !== 'completed') {
    return hold('report_not_completed', 'The paid_reports row is not completed')
  }
  if (
    typeof row.access_token !== 'string'
    || row.access_token.trim().length === 0
    || /[\s\p{Cc}]/u.test(row.access_token)
  ) {
    return hold('invalid_access_token', 'The paid_reports row has no usable access_token')
  }
  const reportResult = isRecord(row.report_result) ? row.report_result : null
  if (
    reportResult &&
    Object.prototype.hasOwnProperty.call(reportResult, 'asOfDate') &&
    !isIsoCalendarDate(reportResult.asOfDate)
  ) {
    return hold(
      'invalid_as_of',
      'report_result.asOfDate is present but is not a valid ISO calendar date',
    )
  }
  const nestedContent = reportResult?.ai_content
  if (
    typeof row.ai_content === 'string' &&
    typeof nestedContent === 'string' &&
    row.ai_content !== nestedContent
  ) {
    return hold(
      'conflicting_legacy_content',
      'ai_content and report_result.ai_content do not contain the same bytes',
    )
  }
  const hasDirectContent = typeof row.ai_content === 'string'
  const content = hasDirectContent
    ? row.ai_content as string
    : typeof nestedContent === 'string'
      ? nestedContent
      : typeof row.report_result === 'string'
        ? row.report_result
        : ''
  const contentField = hasDirectContent
    ? 'ai_content' as const
    : typeof nestedContent === 'string'
      ? 'report_result.ai_content' as const
      : 'report_result' as const
  if (content.trim().length === 0) {
    return hold(
      'missing_legacy_content',
      'No non-empty legacy full text exists in the paid_reports row',
    )
  }
  const fullCharts = row.full_charts ?? reportResult?.full_charts ?? null
  const narrativeSummary = row.narrative_summary ?? reportResult?.narrative_summary ?? null
  const asOf = isIsoCalendarDate(reportResult?.asOfDate)
    ? {
        status: 'known' as const,
        value: reportResult.asOfDate,
        sourceField: 'report_result.asOfDate' as const,
      }
    : {
        status: 'unknown' as const,
        value: null,
      }

  return {
    ok: true,
    mode: 'legacy_full_text',
    plan: row.plan_code,
    accessToken: row.access_token,
    content,
    fullCharts,
    narrativeSummary,
    facts: [],
    provenance: {
      source: 'paid_reports',
      contentField,
    },
    asOf,
  }
}
