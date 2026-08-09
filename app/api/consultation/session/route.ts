import { createConsultationSessionResponse } from '@/lib/consultation/session-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request): Promise<Response> {
  return createConsultationSessionResponse(request)
}
