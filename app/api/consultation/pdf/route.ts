import { cookies } from 'next/headers'
import { consultationSessionCookieName } from '@/lib/consultation/session'
import { createConsultationPdfResponseFromSession } from '@/lib/consultation/session-pdf-response'
import { readConsultationSessionHandle } from '@/lib/consultation/routes'
import { buildConsultationReaderRoute } from '@/lib/consultation/routes'
import { createConsultationPdfUnavailablePage } from '@/lib/consultation/pdf/unavailable-page'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request): Promise<Response> {
  const values = new URL(request.url).searchParams.getAll('session')
  const sessionHandle = readConsultationSessionHandle(values.length === 1 ? values[0] : null)
  const response = sessionHandle
    ? await (async () => {
        const cookieStore = await cookies()
        const sealed = cookieStore.get(consultationSessionCookieName(sessionHandle))?.value
        return createConsultationPdfResponseFromSession(sealed, sessionHandle)
      })()
    : await createConsultationPdfResponseFromSession(undefined, undefined)

  const browserNavigation = request.headers.get('accept')?.includes('text/html')
    || request.headers.get('sec-fetch-mode') === 'navigate'
  if (response.ok || !browserNavigation) return response

  const retryHref = sessionHandle
    ? `/api/consultation/pdf?session=${encodeURIComponent(sessionHandle)}`
    : '/dashboard'
  const reportHref = sessionHandle ? buildConsultationReaderRoute(sessionHandle) : '/dashboard'
  return createConsultationPdfUnavailablePage({
    status: response.status,
    reportHref,
    retryHref,
  })
}
