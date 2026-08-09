import {
  g15PersonFingerprint,
  g15ReportEligibility,
  type G15ReportIneligibilityCode,
  type G15SelectionReportRow,
} from './validate-g15-selection.ts'

export type G15SearchReportRow = G15SelectionReportRow & {
  created_at: string | null
}

export type G15SearchReportProjection = {
  id: string
  name: string
  createdAt: string | null
  eligible: boolean
  reasonCode: G15ReportIneligibilityCode | 'DUPLICATE_PERSON' | null
  reason: string | null
}

/**
 * Rows arrive newest first. Keep only the newest replayable C report for each
 * person selectable; explain older duplicates before the user reaches checkout.
 */
export function projectG15SearchReports(rows: readonly G15SearchReportRow[]) {
  const seenPeople = new Set<string>()
  const projectedReports: G15SearchReportProjection[] = rows.map((row) => {
    const base = {
      id: row.id,
      name: row.client_name || '未知',
      createdAt: row.created_at,
    }
    const eligibility = g15ReportEligibility(row)
    if (!eligibility.eligible) return { ...base, ...eligibility }

    const personFingerprint = g15PersonFingerprint(row)
    if (personFingerprint && seenPeople.has(personFingerprint)) {
      return {
        ...base,
        eligible: false,
        reasonCode: 'DUPLICATE_PERSON' as const,
        reason: '同一位成員已有較新的人生藍圖可選，這份較舊版本不會重複加入',
      }
    }
    if (personFingerprint) seenPeople.add(personFingerprint)
    return { ...base, ...eligibility }
  })

  const reports = projectedReports.filter((report) => report.eligible)
  const unavailableReports = projectedReports.filter((report) => !report.eligible)
  return {
    reports,
    unavailableReports,
    eligibilitySummary: {
      eligibleCount: reports.length,
      unavailableCount: unavailableReports.length,
    },
  }
}
