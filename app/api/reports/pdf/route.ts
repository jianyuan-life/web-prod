import { createPrivateReportPdfResponse } from '@/lib/report/private-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  return createPrivateReportPdfResponse(request)
}
