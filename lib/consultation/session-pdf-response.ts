import { createConsultationPdfResponse } from './pdf/response.ts'
import {
  openConsultationSession,
  type ConsultationSessionOpenResult,
} from './session.ts'

type ConsultationSessionPdfDependencies = {
  open?: (sealed: unknown, expectedHandle: unknown) => Promise<ConsultationSessionOpenResult>
  create?: (token: unknown) => Promise<Response>
}

function unavailablePdfResponse(status: 404 | 503): Response {
  return new Response(JSON.stringify({ error: 'pdf_unavailable' }), {
    status,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    },
  })
}

export async function createConsultationPdfResponseFromSession(
  sealed: unknown,
  expectedHandle: unknown,
  dependencies: ConsultationSessionPdfDependencies = {},
): Promise<Response> {
  let opened: ConsultationSessionOpenResult
  try {
    opened = await (dependencies.open ?? openConsultationSession)(sealed, expectedHandle)
  } catch {
    return unavailablePdfResponse(503)
  }
  if (!opened.ok) {
    return unavailablePdfResponse(opened.code === 'configuration_error' ? 503 : 404)
  }

  try {
    return await (dependencies.create ?? createConsultationPdfResponse)(opened.token)
  } catch {
    return unavailablePdfResponse(503)
  }
}
