import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const legacyReport = readFileSync(join(root, 'app', 'report', '[token]', 'page.tsx'), 'utf8')
const og = readFileSync(join(root, 'app', 'report', '[token]', 'opengraph-image.tsx'), 'utf8')
const pdfPolicy = readFileSync(join(root, 'lib', 'consultation', 'pdf', 'policy.ts'), 'utf8')
const pdfRender = readFileSync(join(root, 'lib', 'consultation', 'pdf', 'render.ts'), 'utf8')

test('legacy C and G15 links bridge to the single consultation reader while E3 stays legacy', () => {
  assert.match(legacyReport, /if \(isConsultationPlan\(report\.plan_code\)\)/u)
  assert.match(legacyReport, /redirect\(buildConsultationAccessRoute\(token\)\)/u)
  assert.doesNotMatch(legacyReport, /report\.plan_code === 'E3'[\s\S]{0,120}buildConsultationAccessRoute/u)
})

test('C and G15 public share copy avoids precision and completeness promises', () => {
  assert.match(og, /C: '交叉整理人生模式/u)
  assert.match(og, /G15: '整理家族互動/u)
  assert.doesNotMatch(og, /C: '.*完整命格分析/u)
  assert.doesNotMatch(og, /G15: '.*精準/u)
})

test('consultation PDF copy is human-facing and family limits are G15-only', () => {
  assert.match(pdfPolicy, /report\.plan === 'G15'/u)
  assert.match(pdfRender, /諮詢報告/u)
  assert.match(pdfRender, /個人專屬報告/u)
  assert.doesNotMatch(pdfRender, /當代鑑識卷宗/u)
  assert.doesNotMatch(pdfRender, /PRIVATE COPY/u)
  assert.doesNotMatch(pdfRender, /LIVING DOSSIER/u)
})
