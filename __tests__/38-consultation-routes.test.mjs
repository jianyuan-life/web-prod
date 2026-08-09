import { suite, test, assert, assertEqual, done } from './harness.mjs'
import {
  buildConsultationPdfSessionRoute,
  buildConsultationReaderRoute,
  buildCheckoutRoute,
  buildAbsoluteReportUrl,
  buildPdfRoute,
  buildReportRoute,
  isTokenlessConsultationPath,
} from '../lib/consultation/routes.ts'
import { consultationSessionCookieName } from '../lib/consultation/session.ts'

const C_ACCESS_PARTS = ['Z2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9u']
const G15_ACCESS_PARTS = ['Q2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9z']
const C_TOKEN = C_ACCESS_PARTS.join('')
const G15_TOKEN = G15_ACCESS_PARTS.join('')
const SESSION_A = 'AbCdEfGhIjKlMnOpQrStUv'
const SESSION_B = 'VwXyZ0123456789_AbCdEf'

function assertInvalidToken(fn) {
  let thrown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  assert(thrown instanceof TypeError, 'invalid token must throw TypeError')
  assert(/token/i.test(thrown.message), 'invalid-token error must name the token')
}

suite('C/G15 consultation routes')

test('C checkout uses the dedicated life blueprint route', () => {
  assertEqual(buildCheckoutRoute('C'), '/checkout/life-blueprint')
})

test('G15 checkout uses the dedicated family blueprint route', () => {
  assertEqual(buildCheckoutRoute('G15'), '/checkout/family-blueprint')
})

test('E3 checkout remains byte-for-byte on its legacy route', () => {
  assertEqual(buildCheckoutRoute('E3'), '/checkout?plan=E3')
})

test('hidden plans retain their legacy checkout routes', () => {
  for (const code of ['D', 'R', 'E1', 'E2', 'E4']) {
    assertEqual(buildCheckoutRoute(code), `/checkout?plan=${code}`)
  }
})

test('C report keeps its validated bearer token in the fragment so it never reaches the server request URL', () => {
  assertEqual(
    buildReportRoute('C', C_TOKEN),
    `/consultation/access#token=${C_TOKEN}`,
  )
})

test('G15 report uses the same fragment-only private access route', () => {
  assertEqual(buildReportRoute('G15', G15_TOKEN), `/consultation/access#token=${G15_TOKEN}`)
})

test('C/G15 route producers reject every token that the access consumer would reject', () => {
  for (const token of ['family-token', 'alpha/beta?lang=zh#section', 'a'.repeat(32)]) {
    assertInvalidToken(() => buildReportRoute('C', token))
    assertInvalidToken(() => buildPdfRoute('G15', token))
  }
})

test('middleware can distinguish tokenless static paths from legacy bearer paths', () => {
  assertEqual(isTokenlessConsultationPath('/consultation/access'), true)
  assertEqual(isTokenlessConsultationPath('/consultation/view/'), true)
  assertEqual(isTokenlessConsultationPath('/consultation/private-token'), false)
  assertEqual(isTokenlessConsultationPath('/report/e3-token'), false)
})

test('E3 report remains on the legacy report route', () => {
  assertEqual(buildReportRoute('E3', 'e3-token'), '/report/e3-token')
})

test('hidden plans retain the byte-for-byte legacy report route', () => {
  for (const code of ['D', 'R', 'E1', 'E2', 'E4']) {
    assertEqual(buildReportRoute(code, 'legacy/token'), '/report/legacy/token')
  }
})

test('E3 absolute links preserve the former interpolation, while C/G15 remove bearer tokens from requests', () => {
  assertEqual(
    buildAbsoluteReportUrl('https://jianyuan.life/', 'E3', 'legacy/token?month=8#timings'),
    'https://jianyuan.life//report/legacy/token?month=8#timings',
  )
  assertEqual(
    buildAbsoluteReportUrl('https://jianyuan.life/', 'C', C_TOKEN),
    `https://jianyuan.life/consultation/access#token=${C_TOKEN}`,
  )
})

test('C PDF preserves an existing stored PDF instead of routing legacy content to the structured endpoint', () => {
  assertEqual(
    buildPdfRoute('C', C_TOKEN, 'https://legacy.invalid/report.pdf?download=1'),
    'https://legacy.invalid/report.pdf?download=1',
  )
})

test('G15 PDF preserves an existing stored PDF', () => {
  assertEqual(
    buildPdfRoute('G15', G15_TOKEN, 'https://legacy.invalid/family.pdf'),
    'https://legacy.invalid/family.pdf',
  )
})

test('structured C/G15 PDF links establish a session through a fragment before the tokenless endpoint', () => {
  assertEqual(
    buildPdfRoute('C', C_TOKEN),
    `/consultation/access#token=${C_TOKEN}&intent=pdf`,
  )
  assertEqual(
    buildPdfRoute('G15', G15_TOKEN),
    `/consultation/access#token=${G15_TOKEN}&intent=pdf`,
  )
})

test('each open report gets a non-bearer selector and a distinct HttpOnly cookie namespace', () => {
  assertEqual(buildConsultationReaderRoute(SESSION_A), `/consultation/view?session=${SESSION_A}`)
  assertEqual(buildConsultationPdfSessionRoute(SESSION_A), `/api/consultation/pdf?session=${SESSION_A}`)
  assertEqual(consultationSessionCookieName(SESSION_A), `__Host-jy_consultation_${SESSION_A}`)
  assert(
    consultationSessionCookieName(SESSION_A) !== consultationSessionCookieName(SESSION_B),
    'two reports must never overwrite the same cookie',
  )
})

test('E3 PDF returns the legacy URL byte-for-byte without inventing an endpoint', () => {
  const legacyUrl = 'https://files.invalid/e3.pdf?download=%E7%B2%BE%E9%81%B8&v=1#page=2'
  assertEqual(buildPdfRoute('E3', 'e3-token', legacyUrl), legacyUrl)
})

test('hidden-plan PDFs return their legacy URL byte-for-byte', () => {
  const legacyUrl = '/storage/v1/object/sign/reports/report.pdf?token=a%2Fb&download=1'
  for (const code of ['D', 'R', 'E1', 'E2', 'E4']) {
    assertEqual(buildPdfRoute(code, 'legacy-token', legacyUrl), legacyUrl)
  }
})

test('legacy PDF behavior remains absent when no stored URL exists', () => {
  assertEqual(buildPdfRoute('E3', 'e3-token'), undefined)
  assertEqual(buildPdfRoute('D', 'hidden-token'), undefined)
  assertEqual(buildPdfRoute('E3', 'e3-token', ''), undefined)
})

test('private C/G15 report routes reject empty, whitespace, and control characters in tokens', () => {
  const invalidTokens = [
    '',
    '   ',
    'token with space',
    'token\twith-tab',
    'token\nwith-newline',
    `token${String.fromCharCode(0)}nul`,
    `token${String.fromCharCode(0x7f)}del`,
    `token${String.fromCharCode(0x85)}c1`,
  ]

  for (const token of invalidTokens) {
    assertInvalidToken(() => buildReportRoute('C', token))
  }
})

test('private consultation PDF routes reject unsafe tokens', () => {
  for (const token of ['', 'family token', 'token\nnext-line']) {
    assertInvalidToken(() => buildPdfRoute('C', token, 'https://legacy.invalid/c.pdf'))
    assertInvalidToken(() => buildPdfRoute('G15', token, 'https://legacy.invalid/g15.pdf'))
  }
})

test('tokens that cannot be URL-encoded fail with the same public error type', () => {
  const loneHighSurrogate = String.fromCharCode(0xd800)
  assertInvalidToken(() => buildReportRoute('C', loneHighSurrogate))
  assertInvalidToken(() => buildPdfRoute('G15', loneHighSurrogate))
})

done()
