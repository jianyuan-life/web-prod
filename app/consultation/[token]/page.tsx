import 'server-only'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { buildConsultationAccessRoute } from '@/lib/consultation/routes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type LegacyConsultationReportPageProps = {
  params: Promise<{ token: string }>
}

export default async function LegacyConsultationReportPage({
  params,
}: LegacyConsultationReportPageProps) {
  const { token } = await params
  let accessRoute: string
  try {
    accessRoute = buildConsultationAccessRoute(token)
  } catch {
    notFound()
  }
  // The Node session POST validates the completed C/G15 row before it sets
  // any report-scoped cookie. This fallback is used only if middleware did
  // not already turn the legacy bearer path into the fragment access route.
  redirect(accessRoute)
}
