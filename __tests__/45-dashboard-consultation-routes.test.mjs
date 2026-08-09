import fs from 'node:fs'
import { suite, test, assert, assertEqual, done } from './harness.mjs'
import { buildReportRoute } from '../lib/consultation/routes.ts'

suite('dashboard C/G15 report route integration')

const CONSULTATION_ACCESS_PARTS = ['Z2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9u']
const CONSULTATION_TOKEN = CONSULTATION_ACCESS_PARTS.join('')

test('route helper keeps consultation plans separate while preserving every legacy plan', () => {
  assertEqual(buildReportRoute('C', CONSULTATION_TOKEN), `/consultation/access#token=${CONSULTATION_TOKEN}`)
  assertEqual(buildReportRoute('G15', CONSULTATION_TOKEN), `/consultation/access#token=${CONSULTATION_TOKEN}`)

  for (const planCode of ['E3', 'D', 'R', 'E1', 'E2', 'E4', 'UNKNOWN']) {
    assertEqual(
      buildReportRoute(planCode, 'private-token'),
      '/report/private-token',
      `${planCode} 必須維持既有 report route`,
    )
  }
})

test('dashboard open and copy-link actions both use the shared plan-aware route', () => {
  const source = fs.readFileSync('app/dashboard/page.tsx', 'utf8')

  assert(
    /import \{[^}]*buildReportRoute[^}]*\} from '@\/lib\/consultation\/routes'/u.test(source),
    'dashboard 必須 import shared route helper',
  )
  assert(
    source.includes('${window.location.origin}${buildReportRoute(report.plan_code, report.access_token)}'),
    '分享網址必須由 report.plan_code 決定',
  )
  assert(
    source.includes('href={buildReportRoute(r.plan_code, r.access_token)}'),
    '開啟報告 Link 必須由 report.plan_code 決定',
  )
  assert(
    source.includes('isConsultationPlan(r.plan_code) ? (') &&
      /isConsultationPlan\(r\.plan_code\) \? \(\s*<a\s+href=\{buildReportRoute\(r\.plan_code, r\.access_token\)\}/u.test(source),
    'C/G15 私密 bearer route 必須用硬式文件導航，避免既有 GA SPA history listener 取得 token',
  )
  assert(
    /\) : \(\s*<Link\s+href=\{buildReportRoute\(r\.plan_code, r\.access_token\)\}/u.test(source),
    'legacy 方案必須保留既有 Next Link 行為',
  )
  assert(
    !source.includes('/report/${report.access_token}'),
    '分享網址不得保留寫死的 legacy route',
  )
  assert(
    !source.includes('href={`/report/${r.access_token}`}'),
    '開啟報告 Link 不得保留寫死的 legacy route',
  )
})

done()
