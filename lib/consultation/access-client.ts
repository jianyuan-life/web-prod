import { validateAccessToken } from '../security/token-validator.ts'
import {
  buildConsultationPdfSessionRoute,
  buildConsultationReaderRoute,
  buildLegacyReportRoute,
  isValidConsultationSessionHandle,
} from './routes.ts'

type ConsultationAccessLocation = {
  hash: string
  pathname: string
  search: string
  replace: (url: string) => void
}

type ConsultationAccessHistory = {
  replaceState: (state: unknown, title: string, url: string) => void
}

type ConsultationAccessDependencies = {
  location: ConsultationAccessLocation
  history: ConsultationAccessHistory
  fetch: (input: string, init: RequestInit) => Promise<Response>
  fragment?: string
  signal?: AbortSignal
}

export type ConsultationAccessResult =
  | { ok: true }
  | { ok: false; code: 'invalid_link' | 'exchange_failed' }

export async function exchangeConsultationFragment(
  dependencies: ConsultationAccessDependencies,
): Promise<ConsultationAccessResult> {
  const rawFragment = dependencies.fragment ?? dependencies.location.hash
  const fragment = rawFragment.startsWith('#') ? rawFragment.slice(1) : rawFragment

  // The fragment never leaves the browser, and this removes it from the
  // current history entry before any network or asynchronous work begins.
  dependencies.history.replaceState(
    null,
    '',
    `${dependencies.location.pathname}${dependencies.location.search}`,
  )

  const parameters = new URLSearchParams(fragment)
  const tokenValues = parameters.getAll('token')
  const token = tokenValues.length === 1 ? tokenValues[0] : ''
  if (
    token !== token.trim() ||
    /[\s\p{Cc}]/u.test(token) ||
    !validateAccessToken(token).valid
  ) {
    return { ok: false, code: 'invalid_link' }
  }
  const intentValues = parameters.getAll('intent')
  if (intentValues.length > 1 || (intentValues.length === 1 && intentValues[0] !== 'pdf')) {
    return { ok: false, code: 'invalid_link' }
  }
  const pdfIntent = intentValues[0] === 'pdf'
  try {
    const response = await dependencies.fetch('/api/consultation/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: dependencies.signal,
      body: JSON.stringify(pdfIntent ? { token, intent: 'pdf' } : { token }),
    })
    if (!response.ok) return { ok: false, code: 'exchange_failed' }
    const body = await response.json() as { next?: unknown; session?: unknown; legacy?: unknown }
    // v5.10.486:傳統版報告放行到正式閱讀頁。fail-closed:只認 legacy === true
    // 且 next 與 client 端以自持 token 重算的路徑逐字元全等;導航一律用
    // client 自算值,絕不使用伺服器回傳字串(杜絕 open redirect)。
    if (body.legacy === true) {
      // pdf intent 也接受放行:正式閱讀頁有自己的 PDF 入口,優雅降級勝過死按鈕
      const expectedRoute = buildLegacyReportRoute(token)
      if (body.next !== expectedRoute) return { ok: false, code: 'exchange_failed' }
      dependencies.location.replace(expectedRoute)
      return { ok: true }
    }
    if (!isValidConsultationSessionHandle(body.session)) {
      return { ok: false, code: 'exchange_failed' }
    }
    const nextRoute = pdfIntent
      ? buildConsultationPdfSessionRoute(body.session)
      : buildConsultationReaderRoute(body.session)
    if (body.next !== nextRoute) return { ok: false, code: 'exchange_failed' }
    dependencies.location.replace(nextRoute)
    return { ok: true }
  } catch {
    return { ok: false, code: 'exchange_failed' }
  }
}
