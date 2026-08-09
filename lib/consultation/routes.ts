import { validateAccessToken } from '../security/token-validator.ts'

const CONSULTATION_CHECKOUT_ROUTES = {
  C: '/checkout/life-blueprint',
  G15: '/checkout/family-blueprint',
} as const

type ConsultationPlanCode = keyof typeof CONSULTATION_CHECKOUT_ROUTES

export const CONSULTATION_ACCESS_ROUTE = '/consultation/access'
export const CONSULTATION_READER_ROUTE = '/consultation/view'
export const CONSULTATION_PDF_ROUTE = '/api/consultation/pdf'
export const CONSULTATION_SESSION_QUERY = 'session'

const CONSULTATION_SESSION_HANDLE_PATTERN = /^[A-Za-z0-9_-]{22}$/u

export function isConsultationReaderPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && pathname.startsWith('/consultation/')
}

export function isTokenlessConsultationPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false
  const normalized = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return normalized === CONSULTATION_ACCESS_ROUTE || normalized === CONSULTATION_READER_ROUTE
}

export function isConsultationPlan(planCode: string): planCode is ConsultationPlanCode {
  return Object.prototype.hasOwnProperty.call(CONSULTATION_CHECKOUT_ROUTES, planCode)
}

export function isValidConsultationSessionHandle(value: unknown): value is string {
  return typeof value === 'string' && CONSULTATION_SESSION_HANDLE_PATTERN.test(value)
}

function assertConsultationSessionHandle(handle: unknown): asserts handle is string {
  if (!isValidConsultationSessionHandle(handle)) {
    throw new TypeError('Invalid consultation session selector')
  }
}

export function buildConsultationReaderRoute(handle: string): string {
  assertConsultationSessionHandle(handle)
  return `${CONSULTATION_READER_ROUTE}?${CONSULTATION_SESSION_QUERY}=${handle}`
}

export function buildConsultationPdfSessionRoute(handle: string): string {
  assertConsultationSessionHandle(handle)
  return `${CONSULTATION_PDF_ROUTE}?${CONSULTATION_SESSION_QUERY}=${handle}`
}

export function readConsultationSessionHandle(
  value: string | string[] | null | undefined,
): string | null {
  return isValidConsultationSessionHandle(value) ? value : null
}

function encodeToken(token: string): string {
  if (typeof token !== 'string' || token.length === 0 || /[\s\p{Cc}]/u.test(token)) {
    throw new TypeError('Invalid token: expected a non-empty value without whitespace or control characters')
  }
  try {
    return encodeURIComponent(token)
  } catch (error) {
    if (error instanceof URIError) {
      throw new TypeError('Invalid token: value must be URL-encodable')
    }
    throw error
  }
}

function encodeConsultationToken(token: string): string {
  if (
    typeof token !== 'string' ||
    token !== token.trim() ||
    /[\s\p{Cc}]/u.test(token) ||
    !validateAccessToken(token).valid
  ) {
    throw new TypeError('Invalid consultation access token')
  }
  return encodeToken(token)
}

export function buildConsultationAccessRoute(
  token: string,
  intent?: 'pdf',
): string {
  const encodedToken = encodeConsultationToken(token)
  return `${CONSULTATION_ACCESS_ROUTE}#token=${encodedToken}${intent === 'pdf' ? '&intent=pdf' : ''}`
}

export function buildCheckoutRoute(planCode: string): string {
  if (isConsultationPlan(planCode)) return CONSULTATION_CHECKOUT_ROUTES[planCode]
  return `/checkout?plan=${encodeURIComponent(planCode)}`
}

export function buildReportRoute(planCode: string, token: string): string {
  if (isConsultationPlan(planCode)) return buildConsultationAccessRoute(token)
  // E3 and the hidden legacy plans stay byte-for-byte on their former route.
  // Their stored tokens are generated server-side; do not silently rewrite an
  // already-issued customer URL while introducing C/G15 fragment exchange.
  return `/report/${token}`
}

export function buildAbsoluteReportUrl(
  siteUrl: string,
  planCode: string,
  token: string,
): string {
  if (isConsultationPlan(planCode)) {
    return `${siteUrl.replace(/\/+$/u, '')}${buildReportRoute(planCode, token)}`
  }
  // Preserve the pre-consultation interpolation exactly, including its
  // historical trailing-slash behavior for non-C/G15 plans.
  return `${siteUrl}/report/${token}`
}

export function buildPdfRoute(
  planCode: string,
  token: string,
  legacyPdfUrl?: string,
): string | undefined {
  if (isConsultationPlan(planCode)) {
    encodeConsultationToken(token)
    if (legacyPdfUrl) return legacyPdfUrl
    return buildConsultationAccessRoute(token, 'pdf')
  }
  return legacyPdfUrl || undefined
}
