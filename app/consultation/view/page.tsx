import 'server-only'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { ConsultationReportReader } from '@/components/consultation/reader/ConsultationReportReader'
import { ReportUnavailable } from '@/components/consultation/reader/ReportUnavailable'
import { buildConsultationReaderModel } from '@/components/consultation/reader/reader-model'
import { loadConsultationReportFromSession } from '@/lib/consultation/session-loader'
import { consultationSessionCookieName } from '@/lib/consultation/session'
import {
  buildConsultationPdfSessionRoute,
  readConsultationSessionHandle,
} from '@/lib/consultation/routes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type ConsultationReportViewPageProps = {
  searchParams: Promise<{ session?: string | string[] }>
}

export default async function ConsultationReportViewPage({
  searchParams,
}: ConsultationReportViewPageProps) {
  const query = await searchParams
  const sessionHandle = readConsultationSessionHandle(query.session)
  if (!sessionHandle) notFound()

  const cookieStore = await cookies()
  const sealed = cookieStore.get(consultationSessionCookieName(sessionHandle))?.value
  const loaded = await loadConsultationReportFromSession(sealed, sessionHandle)

  if (!loaded.ok) {
    if (
      loaded.code === 'invalid_session' ||
      loaded.code === 'expired_session' ||
      loaded.code === 'invalid_token' ||
      loaded.code === 'not_found'
    ) {
      notFound()
    }
    return <ReportUnavailable />
  }

  const pdfHref = loaded.mode === 'structured' || loaded.pdfUrl
    ? buildConsultationPdfSessionRoute(sessionHandle)
    : undefined

  return <ConsultationReportReader model={buildConsultationReaderModel(loaded)} pdfHref={pdfHref} />
}
