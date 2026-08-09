import {
  loadConsultationReport,
  type ConsultationReportLoadResult,
} from './load-report.ts'
import {
  CONSULTATION_SESSION_COOKIE_OPTIONS,
  consultationSessionCookieName,
  createConsultationSessionHandle,
  sealConsultationSession,
} from './session.ts'
import {
  buildConsultationPdfSessionRoute,
  buildConsultationReaderRoute,
} from './routes.ts'

const MAX_SESSION_REQUEST_BYTES = 2_048

type ConsultationSessionResponseDependencies = {
  load?: (token: unknown) => Promise<ConsultationReportLoadResult>
  createHandle?: (token: string) => string | Promise<string>
  seal?: (token: string, handle: string) => Promise<string>
}

function privateHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  })
}

function jsonResponse(status: number, body: Record<string, string>): Response {
  const headers = privateHeaders()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

function failureStatus(result: Extract<ConsultationReportLoadResult, { ok: false }>): number {
  if (result.code === 'invalid_token' || result.code === 'not_found') return 404
  if (result.code === 'database_error') return 503
  return 409
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function serializeSessionCookie(handle: string, value: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) throw new TypeError('Invalid session cookie value')
  return [
    `${consultationSessionCookieName(handle)}=${value}`,
    `Max-Age=${CONSULTATION_SESSION_COOKIE_OPTIONS.maxAge}`,
    `Path=${CONSULTATION_SESSION_COOKIE_OPTIONS.path}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ')
}

export async function createConsultationSessionResponse(
  request: Request,
  dependencies: ConsultationSessionResponseDependencies = {},
): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse(403, { error: 'session_unavailable' })
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (!contentType.startsWith('application/json')) {
    return jsonResponse(415, { error: 'session_unavailable' })
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SESSION_REQUEST_BYTES) {
    return jsonResponse(413, { error: 'session_unavailable' })
  }

  let parsed: unknown
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_SESSION_REQUEST_BYTES) {
      return jsonResponse(413, { error: 'session_unavailable' })
    }
    parsed = JSON.parse(text)
  } catch {
    return jsonResponse(400, { error: 'session_unavailable' })
  }

  const token = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as { token?: unknown }).token
    : undefined
  const intent = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as { intent?: unknown }).intent
    : undefined
  if (typeof token !== 'string') return jsonResponse(404, { error: 'session_unavailable' })
  if (intent !== undefined && intent !== 'pdf') {
    return jsonResponse(400, { error: 'session_unavailable' })
  }
  let loaded: ConsultationReportLoadResult
  try {
    loaded = await (dependencies.load ?? loadConsultationReport)(token)
  } catch {
    return jsonResponse(503, { error: 'session_unavailable' })
  }
  if (!loaded.ok) {
    return jsonResponse(failureStatus(loaded), { error: 'session_unavailable' })
  }
  if (intent === 'pdf' && loaded.mode !== 'structured') {
    return jsonResponse(409, { error: 'session_unavailable' })
  }

  try {
    const handle = await (dependencies.createHandle ?? createConsultationSessionHandle)(token)
    const sealed = await (dependencies.seal ?? sealConsultationSession)(token, handle)
    const nextRoute = intent === 'pdf'
      ? buildConsultationPdfSessionRoute(handle)
      : buildConsultationReaderRoute(handle)
    const headers = privateHeaders()
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Set-Cookie', serializeSessionCookie(handle, sealed))
    return new Response(JSON.stringify({ next: nextRoute, session: handle }), {
      status: 200,
      headers,
    })
  } catch {
    return jsonResponse(503, { error: 'session_unavailable' })
  }
}

export async function createLegacyConsultationPdfRedirect(
  request: Request,
  token: unknown,
  dependencies: ConsultationSessionResponseDependencies = {},
): Promise<Response> {
  let loaded: ConsultationReportLoadResult
  try {
    loaded = await (dependencies.load ?? loadConsultationReport)(token)
  } catch {
    return jsonResponse(503, { error: 'pdf_unavailable' })
  }
  if (!loaded.ok) return jsonResponse(failureStatus(loaded), { error: 'pdf_unavailable' })
  if (loaded.mode !== 'structured') return jsonResponse(409, { error: 'pdf_unavailable' })
  if (typeof token !== 'string') return jsonResponse(404, { error: 'pdf_unavailable' })

  try {
    const handle = await (dependencies.createHandle ?? createConsultationSessionHandle)(token)
    const sealed = await (dependencies.seal ?? sealConsultationSession)(token, handle)
    const destination = new URL(buildConsultationPdfSessionRoute(handle), request.url)
    const headers = privateHeaders()
    headers.set('Location', destination.toString())
    headers.set('Set-Cookie', serializeSessionCookie(handle, sealed))
    return new Response(null, { status: 307, headers })
  } catch {
    return jsonResponse(503, { error: 'pdf_unavailable' })
  }
}
