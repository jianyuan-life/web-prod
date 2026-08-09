import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeConsultationPdfReport } from './make-report.mjs'
import { createConsultationPdfModel } from '../../../lib/consultation/pdf/policy.ts'
import { renderConsultationPdfModel } from '../../../lib/consultation/pdf/render.ts'

const outputDirectory = mkdtempSync(join(tmpdir(), 'jianyuan-consultation-pdf-qa-'))
const files = {}

for (const plan of ['C', 'G15']) {
  const fixture = makeConsultationPdfReport(plan)
  const model = createConsultationPdfModel(fixture.report)
  const bytes = await renderConsultationPdfModel(model)
  const pdfPath = join(outputDirectory, `${plan.toLowerCase()}-consultation-synthetic.pdf`)
  writeFileSync(pdfPath, bytes)
  files[plan] = {
    path: pdfPath,
    plan,
    planTitle: model.planTitle,
    reportNumber: model.reportNumber,
    asOfDate: model.asOfDate,
    expectedBodyCjk: fixture.expectedBodyCjk,
    expectedTextMarkers: Object.fromEntries(fixture.expectedTextMarkers),
    tailMarkers: fixture.tailMarkers,
    people: model.people,
    bytes: bytes.byteLength,
  }
  console.log(`[rendered] ${plan} ${bytes.byteLength} bytes -> ${pdfPath}`)
}

const manifestPath = join(outputDirectory, 'manifest.json')
writeFileSync(manifestPath, `${JSON.stringify({ outputDirectory, files }, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ outputDirectory, manifestPath, files }))
