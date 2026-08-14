import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function loadDashboardPrivatePdfDecision() {
  const source = `${read('app/dashboard/page.tsx')}\nexport { shouldShowPrivateDashboardPdfAction }\n`
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'app/dashboard/page.tsx',
  }).outputText

  const inert = new Proxy(() => null, { get: () => inert })
  const localRequire = (specifier) => {
    if (specifier === '@/lib/consultation/routes') {
      return {
        buildPdfRoute: inert,
        buildReportRoute: inert,
        isConsultationPlan: (planCode) => planCode === 'C' || planCode === 'G15',
      }
    }
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
  return module.exports.shouldShowPrivateDashboardPdfAction
}

const structured = {
  consultation_report: { schemaVersion: 'consultation-report/v1' },
}

test('structured C/G15 reports expose the private PDF action before pdf_url exists', () => {
  const shouldShow = loadDashboardPrivatePdfDecision()
  assert.equal(typeof shouldShow, 'function')

  for (const plan_code of ['C', 'G15']) {
    assert.equal(shouldShow({ plan_code, pdf_url: null, report_result: structured }), true)
  }
})

test('E3 and legacy report PDF behavior remains unchanged', () => {
  const shouldShow = loadDashboardPrivatePdfDecision()

  assert.equal(
    shouldShow({ plan_code: 'E3', pdf_url: null, report_result: structured }),
    false,
    'E3 remains calendar-only even if malformed data contains a consultation contract',
  )
  assert.equal(
    shouldShow({ plan_code: 'D', pdf_url: 'https://files.example.test/legacy.pdf', report_result: null }),
    false,
    'non-consultation legacy plans keep using their stored PDF link branch',
  )
  assert.equal(
    shouldShow({ plan_code: 'C', pdf_url: null, report_result: null }),
    false,
    'legacy C without a stored PDF keeps its existing no-action behavior',
  )
  assert.equal(
    shouldShow({ plan_code: 'G15', pdf_url: 'private:G15/report.pdf', report_result: null }),
    true,
    'legacy G15 with an existing PDF keeps using the private download action',
  )

  const dashboard = read('app/dashboard/page.tsx')
  assert.match(dashboard, /shouldShowPrivateDashboardPdfAction\(r\)/u)
})
