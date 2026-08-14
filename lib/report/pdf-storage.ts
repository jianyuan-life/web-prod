export type ReportPdfStorageTarget = {
  bucket: 'reports' | 'private-reports'
  path: string
  privateReference: string | null
}

export type GeneratedReportPdf = {
  reference: string
  bucket: 'reports' | 'private-reports'
  path: string
  generationId: string
}

const REPORT_PDF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const CANONICAL_GENERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
// Removed plans can still exist in historical paid_reports rows and must keep
// their established reports-bucket behavior. Unknown future codes fail closed.
const LEGACY_PUBLIC_PDF_PLANS = new Set([
  'A', 'G3', 'M', 'Y',
  'D', 'R', 'E1', 'E2', 'E3', 'E4',
])

export function normalizeReportPdfId(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim() || !REPORT_PDF_ID_PATTERN.test(value)) {
    return null
  }
  return value.toLowerCase()
}

export function getReportPdfStorageTarget(
  planCode: string,
  reportId: string,
): ReportPdfStorageTarget {
  const normalizedReportId = normalizeReportPdfId(reportId)
  if (!normalizedReportId) throw new Error('invalid report PDF id')

  const normalizedPlanCode = planCode.trim().toUpperCase()
  const path = `${normalizedReportId}/report.pdf`
  if (normalizedPlanCode === 'C' || normalizedPlanCode === 'G15') {
    return {
      bucket: 'private-reports',
      path,
      privateReference: `private-reports/${path}`,
    }
  }
  if (!LEGACY_PUBLIC_PDF_PLANS.has(normalizedPlanCode)) {
    throw new Error('unknown report PDF plan')
  }
  return { bucket: 'reports', path, privateReference: null }
}

export function normalizeReportPdfGenerationId(value: unknown): string | null {
  if (typeof value !== 'string' || !CANONICAL_GENERATION_ID_PATTERN.test(value)) return null
  return value
}

/**
 * Allocate an immutable object name owned by one producer attempt. The caller
 * may publish this exact reference with a database CAS and may remove it only
 * after an observed zero-row CAS. Existing `report.pdf` objects stay readable
 * for backwards compatibility but are never used for a new upload.
 */
export function getGeneratedReportPdfStorageTarget(
  planCode: string,
  reportId: string,
  generationId: string,
): ReportPdfStorageTarget {
  const normalizedReportId = normalizeReportPdfId(reportId)
  if (!normalizedReportId) throw new Error('invalid report PDF id')
  const normalizedGenerationId = normalizeReportPdfGenerationId(generationId)
  if (!normalizedGenerationId) throw new Error('invalid report PDF generation id')

  const target = getReportPdfStorageTarget(planCode, normalizedReportId)
  const path = `${normalizedReportId}/generations/${normalizedGenerationId}.pdf`
  return {
    bucket: target.bucket,
    path,
    privateReference: target.privateReference ? `${target.bucket}/${path}` : null,
  }
}
