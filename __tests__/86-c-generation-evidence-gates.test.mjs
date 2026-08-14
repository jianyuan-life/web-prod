import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(
  new URL('../workflows/generate-report/index.ts', import.meta.url),
  'utf8',
)

test('legacy C requires a complete calculator response before any prompt receives evidence', () => {
  const calculate = workflow.indexOf('const rawCalcResult = planCode')
  const sanitize = workflow.indexOf('consultationCalculatorEvidenceForGeneration(rawCalcResult')
  const generation = workflow.indexOf("if (planCode === 'C')", workflow.indexOf('// Step 2: AI'))

  assert.ok(calculate > 0)
  assert.ok(sanitize > calculate)
  assert.ok(generation > sanitize)
  assert.match(
    workflow.slice(calculate, generation),
    /planCode === 'C'[\s\S]{0,120}callPythonCalculate\(calculatorBirthData, \{ consultationMode: true \}\)/u,
  )
  assert.match(workflow.slice(calculate, generation), /: await callPythonCalculate\(calculatorBirthData\)/u)
})

test('every C generation pass uses the immutable period and the normalized client question', () => {
  const cBlockStart = workflow.indexOf("if (planCode === 'C')", workflow.indexOf('// Step 2: AI'))
  const cBlockEnd = workflow.indexOf('// ── 其他方案', cBlockStart)
  const cBlock = workflow.slice(cBlockStart, cBlockEnd)

  assert.match(cBlock, /const cBirthData = calculatorBirthData/u)
  assert.match(cBlock, /normalizeConsultationClientQuestion/u)
  assert.match(cBlock, /aiGenerateCall1\(calcResult, cBirthData, clientQuestion, reportId\)/u)
  assert.match(cBlock, /aiGenerateCall2\(calcResult, cBirthData, r1\.content, reportId, clientQuestion\)/u)
  assert.match(cBlock, /aiGenerateCall3\([\s\S]{0,220}reportId, clientQuestion\)/u)
})

test('C post-generation data comparison fails closed before quality review and delivery', () => {
  const qaStart = workflow.indexOf('// Step 2.5: Post-generation QA')
  const qualityStart = workflow.indexOf('// Step 3: 品質閘門', qaStart)
  const qaBlock = workflow.slice(qaStart, qualityStart)

  assert.match(qaBlock, /planCode === 'C' \? calculatorBirthData : birthData/u)
  assert.match(
    qaBlock,
    /if \(planCode === 'C'\)[\s\S]{0,900}markReportNeedsHumanReview[\s\S]{0,700}return \{ success: false/u,
  )
})

test('the dormant retry path cannot lose C context if retries are re-enabled later', () => {
  const retryStart = workflow.indexOf('// 3e. 重試')
  const retryEnd = workflow.indexOf('// 3f.', retryStart)
  const retry = workflow.slice(retryStart, retryEnd)

  assert.match(retry, /normalizeConsultationClientQuestion/u)
  assert.match(retry, /aiGenerateCall1\(calcResult, calculatorBirthData, clientQuestion, reportId\)/u)
  assert.match(retry, /aiGenerateCall2\(calcResult, calculatorBirthData, r1\.content, reportId, clientQuestion\)/u)
  assert.match(retry, /reportId,[\s\S]{0,60}clientQuestion/u)
  assert.match(retry, /cleanFinalReport\(rawContent, calculatorBirthData\.name\)/u)
})
