import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeConsultationPdfReport } from './make-report.mjs'
import { createConsultationPdfModel } from '../../../lib/consultation/pdf/policy.ts'
import { renderConsultationPdfModel } from '../../../lib/consultation/pdf/render.ts'
import {
  MAX_CONCLUSION_SUBTITLE_CHARACTERS,
  MAX_QUICK_CONCLUSION_CHARACTERS,
  MAX_QUICK_SELF_CHECK_CHARACTERS,
} from '../../../lib/consultation/report-contract.ts'
import { makeNaturalConsultationParagraph } from '../natural-consultation-text.mjs'

const outputDirectory = mkdtempSync(join(tmpdir(), 'jianyuan-consultation-pdf-qa-'))
const files = {}

async function renderFixture(fileKey, fixture) {
  const model = createConsultationPdfModel(fixture.report)
  const bytes = await renderConsultationPdfModel(model)
  const pdfPath = join(outputDirectory, `${fileKey.toLowerCase()}-consultation-synthetic.pdf`)
  writeFileSync(pdfPath, bytes)
  files[fileKey] = {
    path: pdfPath,
    plan: model.plan,
    planTitle: model.planTitle,
    reportNumber: model.reportNumber,
    asOfDate: model.asOfDate,
    expectedBodyCjk: fixture.expectedBodyCjk,
    expectedTextMarkers: Object.fromEntries(fixture.expectedTextMarkers),
    tailMarkers: fixture.tailMarkers,
    people: model.people,
    bytes: bytes.byteLength,
  }
  console.log(`[rendered] ${fileKey} ${bytes.byteLength} bytes -> ${pdfPath}`)
}

for (const plan of ['C', 'G15']) {
  await renderFixture(plan, makeConsultationPdfReport(plan))
}

const longFixture = makeConsultationPdfReport('C')
const longField = (seed, maximum, marker) => {
  const body = makeNaturalConsultationParagraph(seed, maximum, '長欄位分頁驗證')
  return `${body.slice(0, maximum - marker.length)}${marker}`
}
const quickConclusionTail = '快速結論長欄位尾端完整保留'
const selfCheckTail = '自我核對長欄位尾端完整保留'
const conclusionSubtitleTail = '章首結論長欄位尾端完整保留'
longFixture.report.readingLayers.quick_30s.items[0].conclusion = longField(
  701,
  MAX_QUICK_CONCLUSION_CHARACTERS,
  quickConclusionTail,
)
longFixture.report.readingLayers.quick_30s.items[0].selfCheck = longField(
  702,
  MAX_QUICK_SELF_CHECK_CHARACTERS,
  selfCheckTail,
)
const longConclusionSubtitle = longField(
  703,
  MAX_CONCLUSION_SUBTITLE_CHARACTERS,
  conclusionSubtitleTail,
)
longFixture.report.chapters[0].conclusionSubtitle = longConclusionSubtitle
longFixture.report.readingLayers.route_3m.chapters[0].conclusionSubtitle = longConclusionSubtitle
for (const marker of [quickConclusionTail, selfCheckTail, conclusionSubtitleTail]) {
  longFixture.expectedTextMarkers.set(marker, 1)
  longFixture.tailMarkers.push(marker)
}
await renderFixture('C_LONG_FIELDS', longFixture)

const manifestPath = join(outputDirectory, 'manifest.json')
writeFileSync(manifestPath, `${JSON.stringify({ outputDirectory, files }, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ outputDirectory, manifestPath, files }))
