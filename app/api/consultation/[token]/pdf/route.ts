import { createLegacyConsultationPdfRedirect } from '@/lib/consultation/session-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type ConsultationPdfRouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(
  request: Request,
  { params }: ConsultationPdfRouteContext,
): Promise<Response> {
  const { token } = await params
  return createLegacyConsultationPdfRedirect(request, token)
}
