import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

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
  assert.match(reader, /下載 PDF 完整版/u)

  const dashboard = read('app/dashboard/page.tsx')
  assert.match(dashboard, /report_result\?\.schemaVersion === 'consultation-report\/v1'/u)
  assert.match(dashboard, /buildPdfRoute\(r\.plan_code, r\.access_token\)/u)
  assert.match(dashboard, /:\s*\(r\.pdf_url \|\| undefined\)/u)
})

test('integrated surfaces no longer hard-code the legacy report path', () => {
  for (const [path] of integrations) {
    const source = read(path)
    assert.doesNotMatch(source, /\$\{siteUrl\}\/report\/\$\{/u, `${path} still hard-codes /report`)
    assert.doesNotMatch(source, /jianyuan\.life\/report\/\$\{/u, `${path} still hard-codes production /report`)
  }
})
