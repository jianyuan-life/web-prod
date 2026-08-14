import {
  assertValidPdfBytes,
  MAX_REPORT_PDF_BYTES,
  MIN_REPORT_PDF_BYTES,
} from './pdf-bytes.ts'

export type PrivateReportPdfRequest = {
  accessToken?: string | null
  reportId?: string | null
  authToken?: string | null
  pdfAvailable: boolean
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function unavailable(): Error {
  return new Error('pdf_unavailable')
}

function requestHeaders(authToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return headers
}

async function ensurePrivatePdf(
  input: PrivateReportPdfRequest,
  fetchImpl: FetchLike,
  forceRepair = false,
): Promise<void> {
  if (input.pdfAvailable && !forceRepair) return
  if (!input.reportId || !input.accessToken) throw unavailable()

  const response = await fetchImpl('/api/reports/generate-pdf', {
    method: 'POST',
    headers: requestHeaders(input.authToken),
    body: JSON.stringify({
      report_id: input.reportId,
      access_token: input.accessToken,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw unavailable()

  let receipt: unknown
  try {
    receipt = await response.json()
  } catch {
    throw unavailable()
  }
  if (
    !receipt
    || typeof receipt !== 'object'
    || (receipt as { pdf_available?: unknown }).pdf_available !== true
  ) {
    throw unavailable()
  }
}

export async function requestPrivateReportPdf(
  input: PrivateReportPdfRequest,
  fetchImpl: FetchLike = fetch,
): Promise<Blob> {
  const canUseOwnerSession = Boolean(input.reportId && input.authToken)
  const canUseReportToken = Boolean(input.accessToken)
  if (!canUseOwnerSession && !canUseReportToken) throw unavailable()

  await ensurePrivatePdf(input, fetchImpl)

  const body = canUseOwnerSession
    ? { report_id: input.reportId }
    : { access_token: input.accessToken }
  const downloadPrivatePdf = () => fetchImpl('/api/reports/pdf', {
    method: 'POST',
    headers: requestHeaders(canUseOwnerSession ? input.authToken : null),
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
  })
  let response = await downloadPrivatePdf()
  if (response.status === 404 || response.status === 409) {
    // A persisted pointer can outlive, or disagree with, its storage object.
    // Ask the authenticated server to validate/repair it once, then retry the
    // private stream once.  No storage URL ever crosses this client boundary.
    await ensurePrivatePdf(input, fetchImpl, true)
    response = await downloadPrivatePdf()
  }
  if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
    throw unavailable()
  }

  const blob = await response.blob()
  if (blob.size < MIN_REPORT_PDF_BYTES || blob.size > MAX_REPORT_PDF_BYTES) throw unavailable()
  try {
    assertValidPdfBytes(new Uint8Array(await blob.arrayBuffer()))
  } catch {
    throw unavailable()
  }
  return blob
}
