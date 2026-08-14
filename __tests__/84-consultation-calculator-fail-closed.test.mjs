import assert from 'node:assert/strict'
import test from 'node:test'

import { EXPECTED_CALCULATOR_SYSTEMS } from '../lib/consultation/calculator-facts.ts'
import {
  assertCompleteConsultationCalculatorResult,
  consultationCalculatorEvidenceForGeneration,
} from '../lib/consultation/legacy-calculator-safety.ts'

function completeResult() {
  return {
    systems_count: EXPECTED_CALCULATOR_SYSTEMS.length,
    client_data: {
      name: '虛構驗算者',
      gender: 'F',
      birth_date: '1990-01-01 12:00',
      bazi: '庚午 戊子 丙寅 甲午',
      yongshen: '木',
      five_elements: { '木': 2, '火': 3 },
    },
    analyses: EXPECTED_CALCULATOR_SYSTEMS.map((system, index) => ({
      system,
      score: 60 + index,
      summary: `${system}的虛構測試摘要`,
      success: true,
    })),
  }
}

test('all fifteen unique calculator slots are required before C generation', () => {
  const complete = completeResult()
  assert.doesNotThrow(() => assertCompleteConsultationCalculatorResult(complete))

  const missing = completeResult()
  missing.analyses.pop()
  assert.throws(() => assertCompleteConsultationCalculatorResult(missing), /缺少|15/u)

  const duplicate = completeResult()
  duplicate.analyses[14].system = duplicate.analyses[0].system
  assert.throws(() => assertCompleteConsultationCalculatorResult(duplicate), /重複|缺少/u)
})

test('partial failures and error-shaped analyses stop generation', () => {
  const topLevel = { ...completeResult(), partial_failures: ['奇門計算失敗'] }
  assert.throws(() => assertCompleteConsultationCalculatorResult(topLevel), /部分失敗/u)

  const failedAnalysis = completeResult()
  failedAnalysis.analyses[2] = {
    ...failedAnalysis.analyses[2],
    success: false,
    error: 'calculator unavailable',
  }
  assert.throws(() => assertCompleteConsultationCalculatorResult(failedAnalysis), /失敗/u)
})

test('the observed Fly calculation-error placeholder cannot enter C generation', () => {
  const livePlaceholder = completeResult()
  const westernIndex = livePlaceholder.analyses.findIndex((analysis) => analysis.system === '西洋占星')
  livePlaceholder.analyses[westernIndex] = {
    system: '西洋占星',
    score: 0,
    sub_summary: '計算異常',
    detail: "計算異常：'planet_name'",
  }

  assert.throws(
    () => consultationCalculatorEvidenceForGeneration(livePlaceholder, { time_unknown: false }),
    /西洋占星.*失敗/u,
  )
})

test('a legitimate zero score and a negated diagnostic sentence are not failure placeholders', () => {
  const legitimateZero = completeResult()
  const westernIndex = legitimateZero.analyses.findIndex((analysis) => analysis.system === '西洋占星')
  legitimateZero.analyses[westernIndex] = {
    system: '西洋占星',
    score: 0,
    sub_summary: '排盤資料完整',
    detail: '所有必要欄位均已產生，未見計算異常。',
    success: true,
  }

  assert.doesNotThrow(
    () => consultationCalculatorEvidenceForGeneration(legitimateZero, { time_unknown: false }),
  )
})

test('the existing summary-shaped analysis cannot hide a calculation failure', () => {
  const summaryPlaceholder = completeResult()
  const westernIndex = summaryPlaceholder.analyses.findIndex((analysis) => analysis.system === '西洋占星')
  summaryPlaceholder.analyses[westernIndex] = {
    system: '西洋占星',
    score: 0,
    summary: '計算異常：ephemeris unavailable',
  }

  assert.throws(
    () => consultationCalculatorEvidenceForGeneration(summaryPlaceholder, { time_unknown: false }),
    /西洋占星.*失敗/u,
  )
})

test('the held fifteenth system never supports customer conclusions', () => {
  const safe = consultationCalculatorEvidenceForGeneration(completeResult(), { time_unknown: false })
  assert.equal(safe.analyses.length, 14)
  assert.equal(safe.analyses.some((analysis) => analysis.system === '九星氣學'), false)
})

test('unknown birth time removes all time-dependent analyses and calculated client_data', () => {
  const safe = consultationCalculatorEvidenceForGeneration(completeResult(), { time_unknown: true })
  assert.deepEqual(
    safe.analyses.map((analysis) => analysis.system),
    ['數字能量學', '姓名學', '風水', '塔羅牌'],
  )
  assert.equal(safe.client_data.bazi, undefined)
  assert.equal(safe.client_data.yongshen, undefined)
  assert.equal(safe.client_data.time_unknown, true)
  assert.equal(safe.client_data.name, '虛構驗算者')
})
