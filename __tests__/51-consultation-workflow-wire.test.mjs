import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await fs.readFile(path.join(root, 'workflows', 'generate-report', 'index.ts'), 'utf8')
const steps = await fs.readFile(path.join(root, 'workflows', 'generate-report', 'steps.ts'), 'utf8')

test('workflow 只讓 C/G15 進結構化路徑並保存同一份 consultation contract', () => {
  assert.match(source, /hasConsultationOrderReleaseContract\(planCode, birthData\)/u)
  assert.match(source, /isConsultationGenerationKillSwitchEnabled\(planCode\)/u)
  assert.doesNotMatch(source, /shouldUseConsultationReportV1\(planCode\)/u)
  assert.match(source, /buildStructuredCReport\(/u)
  assert.match(source, /buildStructuredG15Report\(/u)
  assert.match(source, /structured\.report/u)
  assert.match(source, /saveReportToSupabase\([\s\S]*?structured\.report/u)
})

test('C/G15 結構化路徑必須先取得私有 PDF reference 才能完成、存檔或寄信', () => {
  const g15Start = source.indexOf('buildStructuredG15Report({')
  const g15End = source.indexOf('// AI 生成家族互動分析', g15Start)
  const cStart = source.indexOf('buildStructuredCReport({')
  const cEnd = source.indexOf('// Step 2:', cStart)

  for (const [label, slice] of [
    ['G15', source.slice(g15Start, g15End)],
    ['C', source.slice(cStart, cEnd)],
  ]) {
    assert.match(slice, /generatePDF\([\s\S]*?structured\.plainText[\s\S]*?structured\.analysesSummary/u, `${label} must generate its PDF`)
    assert.match(slice, /if \(!structuredPdfUrl\)[\s\S]*?markReportFailed[\s\S]*?return \{ success: false/u, `${label} must fail closed without a PDF`)
    assert.match(slice, /saveReportToSupabase\([\s\S]*?structuredPdfUrl/u, `${label} must persist the private PDF reference`)
    assert.ok(slice.indexOf('generatePDF(') < slice.indexOf('saveReportToSupabase('), `${label} must generate before save`)
    assert.ok(slice.indexOf('saveReportToSupabase(') < slice.indexOf('sendReportEmail('), `${label} must save before email`)
  }
})

test('C 排盤先建立唯一 canonical request；新路徑失敗不得靜默退回 legacy', () => {
  assert.match(source, /buildConsultationCalculatorBirthData\(birthData, createdAt\)/u)
  assert.match(source, /birthData:\s*calculatorBirthData/u)
  assert.match(source, /markReportFailed\(reportId, `C_STRUCTURED_GENERATION_FAILED:\$\{operationalErrorClass\(e\)\}`\)/u)
  assert.match(source, /return \{ success: false, error: 'C 結構化報告生成失敗' \}/u)
})

test('C/G15 strict request carries an exact-body HMAC, not only a public nonce', () => {
  assert.match(steps, /createCalculatorRequestAuthenticationHeaders\(\{/u)
  assert.match(steps, /requestBody,[\s\S]{0,180}nonce,[\s\S]{0,100}secret/u)
  assert.match(steps, /\[CALCULATOR_ATTESTATION_NONCE_HEADER\]: nonce,[\s\S]{0,100}\.\.\.requestAuthHeaders/u)
})

test('G15 新路徑只接受 server-verified family_reports，不讀 AI 舊報告文字當 facts', () => {
  const structuredStart = source.indexOf('buildStructuredG15Report({')
  const legacyStart = source.indexOf('aiGenerateG15(')
  assert.ok(structuredStart > 0 && legacyStart > structuredStart, 'structured G15 必須在 legacy prose generator 前完成分流')
  const structuredSlice = source.slice(Math.max(0, structuredStart - 220), legacyStart)
  assert.match(structuredSlice, /birthData\.plan_type === 'family_reports'/u)
  assert.doesNotMatch(structuredSlice, /reportContent/u)
  assert.match(source, /loadFamilyReportsByIds\(reportIds, memberNames,\s*\{\s*userId,\s*email: customerEmail/su)
  assert.match(steps, /validateG15Selection\(/u)
})

test('E3 名稱不出現在任何 consultation v1 分支判斷', () => {
  for (const line of source.split(/\r?\n/u).filter((entry) => /Consultation|Structured|consultation|structured/u.test(entry))) {
    assert.doesNotMatch(line, /E3/u)
  }
})

test('結構化與舊版 C/G15 的內容審查都 fail closed，E3 維持原路徑', () => {
  assert.match(source, /G15 內容安全審查未通過:[\s\S]*?G15 內容需人工審核/u)
  assert.match(source, /planCode === 'C' \|\| planCode === 'G15'[\s\S]*?內容安全審查未通過/u)
  assert.match(source, /內容安全審查未完整完成/u)
  assert.doesNotMatch(source, /planCode === 'E3'[\s\S]{0,160}內容安全審查/u)
})
