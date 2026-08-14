import { timingSafeTokenCompare, validateAccessToken } from '../security/token-validator.ts'
import {
  normalizeReportPdfGenerationId,
  normalizeReportPdfId,
} from './pdf-storage.ts'
import {
  assertValidPdfBytes,
  MAX_REPORT_PDF_BYTES,
  MIN_REPORT_PDF_BYTES,
} from './pdf-bytes.ts'

const MAX_REQUEST_BYTES = 2_048
export { MAX_REPORT_PDF_BYTES as MAX_PRIVATE_REPORT_PDF_BYTES } from './pdf-bytes.ts'

type PrivatePdfRow = {
  id: string
  user_id: string | null
  customer_email: string | null
  access_token: string
  pdf_url: string | null
  status: string
  plan_code: string
  client_name: string | null
  deleted_at: string | null
}

type QueryResult = {
  data: unknown
  error: unknown
}

type AuthIdentity = {
  userId: string | null
  email: string | null
  source: string
}

type DownloadResult = {
  data: Blob | null
  error: unknown
}

type InfoResult = {
  data: unknown
  error: unknown
}

export type PrivateReportPdfDependencies = {
  supabaseUrl?: string
  findByAccessToken?: (accessToken: string) => Promise<QueryResult>
  findById?: (reportId: string) => Promise<QueryResult>
  authenticate?: (request: Request) => Promise<AuthIdentity>
  info?: (bucket: 'private-reports' | 'reports', storagePath: string) => Promise<InfoResult>
  download?: (bucket: 'private-reports' | 'reports', storagePath: string) => Promise<DownloadResult>
}

function privateHeaders(contentType = 'application/json; charset=utf-8'): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
    'Content-Type': contentType,
    Expires: '0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  }
}

function privateError(status: 400 | 404 | 409 | 413 | 415 | 503): Response {
  const code = status === 400 || status === 413 || status === 415
    ? 'invalid_request'
    : status === 404
      ? 'pdf_not_found'
      : status === 409
        ? 'pdf_unavailable'
        : 'pdf_service_unavailable'
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: privateHeaders(),
  })
}

function normalizeReportId(value: unknown): string | null {
  return normalizeReportPdfId(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePrivatePdfRow(value: unknown): PrivatePdfRow | null {
  if (!isRecord(value)) return null
  const id = normalizeReportId(value.id)
  if (
    !id
    || (value.user_id !== null && typeof value.user_id !== 'string')
    || (value.customer_email !== null && typeof value.customer_email !== 'string')
    || typeof value.access_token !== 'string'
    || (value.pdf_url !== null && typeof value.pdf_url !== 'string')
    || typeof value.status !== 'string'
    || typeof value.plan_code !== 'string'
    || (value.client_name !== null && typeof value.client_name !== 'string')
    || (value.deleted_at !== null && typeof value.deleted_at !== 'string')
  ) {
    return null
  }
  return {
    id,
    user_id: value.user_id,
    customer_email: value.customer_email,
    access_token: value.access_token,
    pdf_url: value.pdf_url,
    status: value.status,
    plan_code: value.plan_code,
    client_name: value.client_name,
    deleted_at: value.deleted_at,
  }
}

/**
 * Resolve only the one object that belongs to the already-authorized row.
 * Historical public/signed URLs remain readable after the bucket becomes
 * private, but their host and exact object path are re-derived and checked.
 */
export function resolveStoredReportPdfLocation(
  reportIdInput: unknown,
  storedValue: unknown,
  supabaseUrlInput: unknown,
): { bucket: 'private-reports' | 'reports'; path: string } | null {
  const reportId = normalizeReportId(reportIdInput)
  if (!reportId || typeof storedValue !== 'string' || storedValue.length === 0 || storedValue.length > 4_096) {
    return null
  }
  if (/[^\x20-\x7e]/u.test(storedValue) || /[\\\r\n\t]/u.test(storedValue)) return null

  const canonicalObjectPath = `${reportId}/report.pdf`
  const generatedMarker = new RegExp(
    `^(private-reports|reports)/${reportId}/generations/([^/]+)\\.pdf$`,
    'u',
  ).exec(storedValue)
  if (generatedMarker && normalizeReportPdfGenerationId(generatedMarker[2])) {
    return {
      bucket: generatedMarker[1] as 'private-reports' | 'reports',
      path: `${reportId}/generations/${generatedMarker[2]}.pdf`,
    }
  }
  if (storedValue === `private-reports/${canonicalObjectPath}`) {
    return { bucket: 'private-reports', path: canonicalObjectPath }
  }
  if (storedValue === canonicalObjectPath || storedValue === `reports/${canonicalObjectPath}`) {
    return { bucket: 'reports', path: canonicalObjectPath }
  }

  if (typeof supabaseUrlInput !== 'string' || supabaseUrlInput.length === 0) return null
  try {
    const storageOrigin = new URL(supabaseUrlInput)
    const storedUrl = new URL(storedValue)
    if (
      storedUrl.protocol !== 'https:'
      || storedUrl.username
      || storedUrl.password
      || storedUrl.hash
      || storedUrl.origin !== storageOrigin.origin
      || /%(?:2f|5c|2e)/iu.test(storedUrl.pathname)
    ) {
      return null
    }

    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(storedUrl.pathname)
    } catch {
      return null
    }
    const allowedPaths = new Map<string, 'private-reports' | 'reports'>([
      [`/storage/v1/object/public/reports/${canonicalObjectPath}`, 'reports'],
      [`/storage/v1/object/sign/reports/${canonicalObjectPath}`, 'reports'],
      [`/storage/v1/object/reports/${canonicalObjectPath}`, 'reports'],
      [`/storage/v1/object/sign/private-reports/${canonicalObjectPath}`, 'private-reports'],
      [`/storage/v1/object/private-reports/${canonicalObjectPath}`, 'private-reports'],
    ])
    const bucket = allowedPaths.get(decodedPath)
    if (bucket) return { bucket, path: canonicalObjectPath }

    const generatedPath = new RegExp(
      `^/storage/v1/object/(?:sign/)?(private-reports|reports)/${reportId}/generations/([^/]+)\\.pdf$`,
      'u',
    ).exec(decodedPath)
    if (!generatedPath || !normalizeReportPdfGenerationId(generatedPath[2])) return null
    return {
      bucket: generatedPath[1] as 'private-reports' | 'reports',
      path: `${reportId}/generations/${generatedPath[2]}.pdf`,
    }
  } catch {
    return null
  }
}

async function readBoundedJson(request: Request): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415 }
> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) return { ok: false, status: 415 }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413 }
  }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel()
        return { ok: false, status: 413 }
      }
      chunks.push(next.value)
    }
  } catch {
    return { ok: false, status: 400 }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return isRecord(parsed) ? { ok: true, value: parsed } : { ok: false, status: 400 }
  } catch {
    return { ok: false, status: 400 }
  }
}

async function defaultFindByAccessToken(accessToken: string): Promise<QueryResult> {
  const { createServiceClient } = await import('../supabase.ts')
  return createServiceClient()
    .from('paid_reports')
    .select('id,user_id,customer_email,access_token,pdf_url,status,plan_code,client_name,deleted_at')
    .eq('access_token', accessToken)
    .eq('status', 'completed')
    .in('plan_code', ['C', 'G15'])
    .is('deleted_at', null)
    .maybeSingle()
}

async function defaultFindById(reportId: string): Promise<QueryResult> {
  const { createServiceClient } = await import('../supabase.ts')
  return createServiceClient()
    .from('paid_reports')
    .select('id,user_id,customer_email,access_token,pdf_url,status,plan_code,client_name,deleted_at')
    .eq('id', reportId)
    .eq('status', 'completed')
    .in('plan_code', ['C', 'G15'])
    .is('deleted_at', null)
    .maybeSingle()
}

async function defaultAuthenticate(request: Request): Promise<AuthIdentity> {
  const { getAuthUser } = await import('../auth-helper.ts')
  return getAuthUser(request as Parameters<typeof getAuthUser>[0])
}

async function defaultDownload(
  bucket: 'private-reports' | 'reports',
  storagePath: string,
): Promise<DownloadResult> {
  const { createServiceClient } = await import('../supabase.ts')
  return createServiceClient().storage.from(bucket).download(storagePath)
}

async function defaultInfo(
  bucket: 'private-reports' | 'reports',
  storagePath: string,
): Promise<InfoResult> {
  const { createServiceClient } = await import('../supabase.ts')
  return createServiceClient().storage.from(bucket).info(storagePath)
}

function validStorageMetadata(
  value: unknown,
  bucket: 'private-reports' | 'reports',
  storagePath: string,
): value is { bucketId: string; name: string; size: number; contentType: string } {
  if (!isRecord(value)) return false
  const contentType = typeof value.contentType === 'string'
    ? value.contentType.trim().toLowerCase()
    : ''
  return value.bucketId === bucket
    && value.name === storagePath
    && typeof value.size === 'number'
    && Number.isSafeInteger(value.size)
    && value.size >= MIN_REPORT_PDF_BYTES
    && value.size <= MAX_REPORT_PDF_BYTES
    && contentType === 'application/pdf'
}

function verifiedOwner(row: PrivatePdfRow, identity: AuthIdentity): boolean {
  if (identity.source !== 'admin-verified' || !identity.userId) return false
  if (row.user_id) return timingSafeTokenCompare(row.user_id, identity.userId)
  return Boolean(
    identity.email
    && row.customer_email
    && timingSafeTokenCompare(row.customer_email.toLowerCase(), identity.email.toLowerCase()),
  )
}

function pdfFilename(row: PrivatePdfRow): string {
  const plan = row.plan_code.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 12).toLowerCase() || 'report'
  return `jianyuan-${plan}-${row.id.slice(0, 8)}.pdf`
}

export async function createPrivateReportPdfResponse(
  request: Request,
  dependencies: PrivateReportPdfDependencies = {},
): Promise<Response> {
  const parsedBody = await readBoundedJson(request)
  if (!parsedBody.ok) return privateError(parsedBody.status)
  const keys = Object.keys(parsedBody.value).sort()
  const hasAccessToken = keys.length === 1 && keys[0] === 'access_token'
  const hasReportId = keys.length === 1 && keys[0] === 'report_id'
  if (!hasAccessToken && !hasReportId) return privateError(400)

  let rowResult: QueryResult
  let authorized = false
  if (hasAccessToken) {
    const accessToken = parsedBody.value.access_token
    if (
      typeof accessToken !== 'string'
      || accessToken !== accessToken.trim()
      || !validateAccessToken(accessToken).valid
    ) {
      return privateError(400)
    }
    try {
      rowResult = await (dependencies.findByAccessToken ?? defaultFindByAccessToken)(accessToken)
    } catch {
      return privateError(503)
    }
    const candidate = parsePrivatePdfRow(rowResult.data)
    authorized = Boolean(candidate && timingSafeTokenCompare(candidate.access_token, accessToken))
  } else {
    const reportId = normalizeReportId(parsedBody.value.report_id)
    if (!reportId) return privateError(400)
    let identity: AuthIdentity
    try {
      identity = await (dependencies.authenticate ?? defaultAuthenticate)(request)
    } catch {
      return privateError(404)
    }
    if (identity.source !== 'admin-verified') return privateError(404)
    try {
      rowResult = await (dependencies.findById ?? defaultFindById)(reportId)
    } catch {
      return privateError(503)
    }
    const candidate = parsePrivatePdfRow(rowResult.data)
    authorized = Boolean(candidate && candidate.id === reportId && verifiedOwner(candidate, identity))
  }

  if (rowResult.error) return privateError(503)
  const row = parsePrivatePdfRow(rowResult.data)
  if (
    !row
    || !authorized
    || (row.plan_code !== 'C' && row.plan_code !== 'G15')
    || row.status !== 'completed'
    || row.deleted_at !== null
  ) {
    return privateError(404)
  }

  const supabaseUrl = dependencies.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const storageLocation = resolveStoredReportPdfLocation(row.id, row.pdf_url, supabaseUrl)
  if (!storageLocation) return privateError(404)

  let metadata: InfoResult
  try {
    metadata = await (dependencies.info ?? defaultInfo)(
      storageLocation.bucket,
      storageLocation.path,
    )
  } catch {
    return privateError(503)
  }
  if (metadata.error) return privateError(503)
  if (!metadata.data) return privateError(404)
  if (!validStorageMetadata(metadata.data, storageLocation.bucket, storageLocation.path)) {
    return privateError(409)
  }

  let download: DownloadResult
  try {
    download = await (dependencies.download ?? defaultDownload)(
      storageLocation.bucket,
      storageLocation.path,
    )
  } catch {
    return privateError(503)
  }
  if (download.error) return privateError(503)
  if (!download.data) return privateError(404)
  if (
    download.data.type.toLowerCase() !== 'application/pdf'
    || download.data.size !== metadata.data.size
    || download.data.size < MIN_REPORT_PDF_BYTES
    || download.data.size > MAX_REPORT_PDF_BYTES
  ) {
    return privateError(409)
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await download.data.arrayBuffer())
  } catch {
    return privateError(503)
  }
  try {
    assertValidPdfBytes(bytes)
  } catch {
    return privateError(409)
  }

  const headers = new Headers(privateHeaders('application/pdf'))
  headers.set('Content-Disposition', `attachment; filename="${pdfFilename(row)}"`)
  headers.set('Content-Length', String(bytes.byteLength))
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(body, { status: 200, headers })
}
