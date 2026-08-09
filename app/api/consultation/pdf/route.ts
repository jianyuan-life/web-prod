import { cookies } from 'next/headers'
import { consultationSessionCookieName } from '@/lib/consultation/session'
import { createConsultationPdfResponseFromSession } from '@/lib/consultation/session-pdf-response'
import { readConsultationSessionHandle } from '@/lib/consultation/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request): Promise<Response> {
  const values = new URL(request.url).searchParams.getAll('session')
  const sessionHandle = readConsultationSessionHandle(values.length === 1 ? values[0] : null)
  if (!sessionHandle) {
    return createConsultationPdfResponseFromSession(undefined, undefined)
  }
  const cookieStore = await cookies()
  const sealed = cookieStore.get(consultationSessionCookieName(sessionHandle))?.value
  return createConsultationPdfResponseFromSession(sealed, sessionHandle)
}
