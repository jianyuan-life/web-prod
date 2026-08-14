import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

import { buildPdfRoute } from '../lib/consultation/routes.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const C_TOKEN = ['Z2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9u'].join('')
const G15_TOKEN = ['Q2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9z'].join('')

function loadDashboardPdfResolver() {
  const source = `${read('app/dashboard/page.tsx')}\nexport { resolveDashboardPdfHref }\n`
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'app/dashboard/page.tsx',
  }).outputText

  const calls = []
  const routeStub = {
    buildPdfRoute(planCode, token) {
      calls.push([planCode, token])
      return `/consultation/access#token=${token}&intent=pdf`
    },
    buildReportRoute() { return '/report-fixture' },
    isConsultationPlan(planCode) { return planCode === 'C' || planCode === 'G15' },
  }
  const inert = new Proxy(() => null, { get: () => inert })
  const localRequire = (specifier) => {
    if (specifier === '@/lib/consultation/routes') return routeStub
    if (specifier === '@/lib/plan-names') {
      return {
        PLAN_NAMES: {},
        CHUMENJI_CODES: new Set(['E1', 'E2', 'E3', 'E4']),
      }
    }
    if (specifier === 'react/jsx-runtime') {
      return { Fragment: Symbol.for('react.fragment'), jsx: inert, jsxs: inert }
    }
    return inert
  }
  const module = { exports: {} }
  vm.runInNewContext(output, {
    URL,
    clearTimeout,
    console,
    exports: module.exports,
    module,
    require: localRequire,
    setTimeout,
  })
  return {
    calls,
    resolve: module.exports.resolveDashboardPdfHref,
  }
}

const integrations = [
  ['lib/report/completion-fallback-email.ts', /buildAbsoluteReportUrl\(siteUrl, row\.plan_code, row\.access_token\)/u],
  ['app/api/generate-report/route.ts', /buildAbsoluteReportUrl\(siteUrl, planCode, accessToken\)/u],
  ['app/api/cron/followup-email/route.ts', /buildAbsoluteReportUrl\(siteUrl, planCode, report\.access_token\)/u],
  ['app/api/cron/feedback-reminder/route.ts', /buildAbsoluteReportUrl\('https:\/\/jianyuan\.life', report\.plan_code, report\.access_token\)/u],
  ['workflows/generate-report/steps.ts', /buildAbsoluteReportUrl\(siteUrl, planCode, accessToken\)/u],
]

test('every completion and follow-up surface uses the consultation route SSOT', () => {
  for (const [path, expectedCall] of integrations) {
    const source = read(path)
    assert.match(source, /import \{ buildAbsoluteReportUrl \} from '@\/lib\/consultation\/routes'/u, `${path} must import route SSOT`)
    assert.match(source, expectedCall, `${path} must route with its actual plan code`)
  }
})

test('structured and legacy C/G15 retain a reachable PDF from reader and dashboard', () => {
  const page = read('app/consultation/view/page.tsx')
  assert.match(page, /loaded\.mode === 'structured'[\s\S]*?buildConsultationPdfSessionRoute\(sessionHandle\)/u)
  assert.match(page, /consultationSessionCookieName\(sessionHandle\)/u)
  assert.doesNotMatch(page, /\[token\]/u)
  assert.match(page, /pdfHref=/u)

  const loader = read('lib/consultation/load-report.ts')
  assert.match(loader, /report_result,pdf_url/u)
  assert.match(loader, /pdfUrl,/u)

  const reader = read('components/consultation/reader/ConsultationReportReader.tsx')
  assert.match(reader, /pdfHref\?: string/u)
  assert.match(reader, />下載 PDF</u)
  assert.doesNotMatch(reader, /PDF 完整版/u)

  const dashboard = read('app/dashboard/page.tsx')
  assert.match(dashboard, /resolveDashboardPdfHref\(r\)/u)

  const { calls, resolve } = loadDashboardPdfResolver()
  assert.equal(typeof resolve, 'function', 'dashboard 必須以可回歸驗證的單一決策函式選擇 PDF 入口')

  const structuredHref = resolve({
    plan_code: 'C',
    access_token: C_TOKEN,
    pdf_url: 'https://files.example.test/stale-structured.pdf',
    report_result: {
      consultation_report: { schemaVersion: 'consultation-report/v1' },
    },
  })
  assert.equal(structuredHref, `/consultation/access#token=${C_TOKEN}&intent=pdf`)
  assert.deepEqual(calls, [['C', C_TOKEN]], 'structured C 必須走可重試的 session PDF 路徑')

  const legacyHref = resolve({
    plan_code: 'G15',
    access_token: G15_TOKEN,
    pdf_url: 'https://files.example.test/legacy-family.pdf',
    report_result: { schemaVersion: 'consultation-report/v1' },
  })
  assert.equal(legacyHref, undefined, '舊 C/G15 PDF 必須由授權 proxy 下載，不可回傳永久 public URL')
  assert.equal(calls.length, 1, '舊報告不能因誤讀頂層 schemaVersion 而送進結構化 renderer')

  assert.equal(resolve({
    plan_code: 'G15',
    access_token: G15_TOKEN,
    pdf_url: 'javascript:alert(1)',
    report_result: {},
  }), undefined, '不安全的舊 PDF URL 不得成為可點擊連結')

  assert.equal(
    buildPdfRoute('G15', G15_TOKEN),
    `/consultation/access#token=${G15_TOKEN}&intent=pdf`,
    '真正的 route builder 必須產生 fragment 交換入口',
  )
})

test('integrated surfaces no longer hard-code the legacy report path', () => {
  for (const [path] of integrations) {
    const source = read(path)
    assert.doesNotMatch(source, /\$\{siteUrl\}\/report\/\$\{/u, `${path} still hard-codes /report`)
    assert.doesNotMatch(source, /jianyuan\.life\/report\/\$\{/u, `${path} still hard-codes production /report`)
  }
})
