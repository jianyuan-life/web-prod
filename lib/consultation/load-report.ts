import { normalizeLegacyReport } from './normalize-legacy.ts'
import { validateConsultationReportContract } from './report-contract.ts'
import type { ConsultationReportContract } from './report-contract'
import { validateAccessToken } from '../security/token-validator.ts'
import {
  normalizeReportPdfGenerationId,
  normalizeReportPdfId,
} from '../report/pdf-storage.ts'

export const CONSULTATION_REPORT_PROJECTION =
  'plan_code,status,access_token,ai_content,full_charts,narrative_summary,report_result,pdf_url' as const

type QueryResult = {
  data: unknown
  error: unknown
}

export type ConsultationReportQuery = (token: string) => Promise<QueryResult>

type ConsultationQueryBuilder = {
  select: (projection: string) => ConsultationQueryBuilder
  eq: (field: string, value: string) => ConsultationQueryBuilder
  in: (field: string, values: string[]) => ConsultationQueryBuilder
  is: (field: string, value: null) => ConsultationQueryBuilder
  maybeSingle: () => Promise<QueryResult>
}

type ConsultationQueryClient = {
  from: (table: string) => ConsultationQueryBuilder
}

export type ConsultationReportLoadResult =
  | {
      ok: true
      mode: 'structured'
      plan: 'C' | 'G15'
      report: ConsultationReportContract
      pdfUrl: string | null
    }
  | {
      ok: true
      mode: 'legacy_full_text'
      plan: 'C' | 'G15'
      content: string
      fullCharts: unknown | null
      narrativeSummary: unknown | null
      pdfUrl: string | null
      provenance: {
        source: 'paid_reports'
        contentField: 'ai_content' | 'report_result.ai_content'
      }
      asOf: {
        status: 'unknown'
        value: null
      }
    }
  | {
      ok: false
      code:
        | 'invalid_token'
        | 'not_found'
        | 'database_error'
        | 'invalid_row'
        | 'invalid_contract'
        | 'plan_mismatch'
        | 'legacy_hold'
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeStoredPdfUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null
  if (/[\s\p{Cc}]/u.test(value)) return null
  const privateMarker = /^private-reports\/([^/]+)\/report\.pdf$/u.exec(value)
  if (privateMarker) {
    const reportId = normalizeReportPdfId(privateMarker[1])
    return reportId ? `private-reports/${reportId}/report.pdf` : null
  }
  const generatedPrivateMarker = /^private-reports\/([^/]+)\/generations\/([^/]+)\.pdf$/u.exec(value)
  if (generatedPrivateMarker) {
    const reportId = normalizeReportPdfId(generatedPrivateMarker[1])
    const generationId = normalizeReportPdfGenerationId(generatedPrivateMarker[2])
    return reportId && generationId
      ? `private-reports/${reportId}/generations/${generationId}.pdf`
      : null
  }
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
    return value
  } catch {
    return null
  }
}

export function queryConsultationReportRow(
  client: ConsultationQueryClient,
  token: string,
): Promise<QueryResult> {
  return client
    .from('paid_reports')
    .select(CONSULTATION_REPORT_PROJECTION)
    .eq('access_token', token)
    .eq('status', 'completed')
    .in('plan_code', ['C', 'G15'])
    .is('deleted_at', null)
    .maybeSingle()
}

async function defaultQuery(token: string): Promise<QueryResult> {
  const { createServiceClient } = await import('../supabase')
  return queryConsultationReportRow(
    createServiceClient() as unknown as ConsultationQueryClient,
    token,
  )
}

export async function loadConsultationReport(
  token: unknown,
  query: ConsultationReportQuery = defaultQuery,
): Promise<ConsultationReportLoadResult> {
  if (typeof token !== 'string' || token !== token.trim() || !validateAccessToken(token).valid) {
    return { ok: false, code: 'invalid_token' }
  }

  let result: QueryResult
  try {
    result = await query(token)
  } catch {
    return { ok: false, code: 'database_error' }
  }
  if (result.error) return { ok: false, code: 'database_error' }
  if (!result.data) return { ok: false, code: 'not_found' }

  if (!isRecord(result.data)) return { ok: false, code: 'invalid_row' }
  const row = result.data
  if (
    (row.plan_code !== 'C' && row.plan_code !== 'G15')
    || row.status !== 'completed'
    || row.access_token !== token
  ) {
    return { ok: false, code: 'invalid_row' }
  }

  const reportResult = isRecord(row.report_result) ? row.report_result : null
  const pdfUrl = safeStoredPdfUrl(row.pdf_url)
  if (reportResult && Object.prototype.hasOwnProperty.call(reportResult, 'consultation_report')) {
    const validation = validateConsultationReportContract(reportResult.consultation_report)
    if (!validation.ok) return { ok: false, code: 'invalid_contract' }
    const report = reportResult.consultation_report as ConsultationReportContract
    if (report.plan !== row.plan_code) return { ok: false, code: 'plan_mismatch' }
    return {
      ok: true,
      mode: 'structured',
      plan: row.plan_code,
      report,
      pdfUrl,
    }
  }

  const nestedLegacyText = reportResult?.ai_content
  const normalized = normalizeLegacyReport({
    plan_code: row.plan_code,
    status: row.status,
    access_token: row.access_token,
    full_charts: row.full_charts,
    narrative_summary: row.narrative_summary,
    report_result: isRecord(reportResult) && typeof nestedLegacyText === 'string'
      ? { ai_content: nestedLegacyText }
      : null,
  })
  if (!normalized.ok) return { ok: false, code: 'legacy_hold' }

  return {
    ok: true,
    mode: 'legacy_full_text',
    plan: normalized.plan,
    content: normalized.content,
    fullCharts: normalized.fullCharts,
    narrativeSummary: normalized.narrativeSummary,
    pdfUrl,
    provenance: {
      source: normalized.provenance.source,
      contentField: 'report_result.ai_content',
    },
    asOf: {
      status: 'unknown',
      value: null,
    },
  }
}
