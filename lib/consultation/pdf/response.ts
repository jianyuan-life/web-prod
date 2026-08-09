import { loadConsultationReport, type ConsultationReportLoadResult } from '../load-report.ts'
import type { ConsultationReportContract } from '../report-contract.ts'
import {
  buildConsultationPdfHeaders,
  buildConsultationPdfPrivateErrorHeaders,
  createConsultationPdfModel,
  type ConsultationPdfModel,
} from './policy.ts'

export type ConsultationPdfResponseDependencies = {
  load?: (token: unknown) => Promise<ConsultationReportLoadResult>
  render?: (model: ConsultationPdfModel) => Promise<Uint8Array>
}

async function defaultRender(model: ConsultationPdfModel): Promise<Uint8Array> {
  const { renderConsultationPdfModel } = await import('./render.ts')
  return renderConsultationPdfModel(model)
}

function errorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: 'pdf_unavailable' }), {
    status,
    headers: buildConsultationPdfPrivateErrorHeaders(),
  })
}

function statusForLoadFailure(code: Extract<ConsultationReportLoadResult, { ok: false }>['code']): number {
  if (code === 'invalid_token' || code === 'not_found') return 404
  if (code === 'database_error') return 503
  return 409
}

export async function createConsultationPdfResponse(
  token: unknown,
  dependencies: ConsultationPdfResponseDependencies = {},
): Promise<Response> {
  const load = dependencies.load ?? loadConsultationReport
  const render = dependencies.render ?? defaultRender
  let loaded: ConsultationReportLoadResult
  try {
    loaded = await load(token)
  } catch {
    return errorResponse(503)
  }

  if (!loaded.ok) return errorResponse(statusForLoadFailure(loaded.code))
  if (loaded.mode !== 'structured') return errorResponse(409)

  let model: ConsultationPdfModel
  try {
    model = createConsultationPdfModel(loaded.report)
  } catch {
    return errorResponse(409)
  }

  try {
    const rendered = await render(model)
    const bytes = new Uint8Array(rendered)
    if (bytes.byteLength < 8 || new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
      return errorResponse(503)
    }
    return new Response(bytes, {
      status: 200,
      headers: buildConsultationPdfHeaders(
        loaded.report as ConsultationReportContract,
        bytes.byteLength,
      ),
    })
  } catch {
    return errorResponse(503)
  }
}
