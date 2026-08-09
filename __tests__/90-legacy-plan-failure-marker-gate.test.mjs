// D／R／legacy G15 的窄型排盤失敗閘。
//
// C 走 15 槽完整性斷言,但那個門檻只對 C 成立:D 只取 5–8 套、R 取 8 套、
// legacy G15 的 canonical family 路徑根本不重算。硬套 15 槽會把正常的 D／R
// 也擋掉。所以這裡只驗一件事:回應裡不得帶失敗標記。
//
// E1–E4 完全排除。它們也會走到同一個 callPythonCalculate,所以排除必須是
// 明確的方案碼判斷,不能靠「反正 C 以外都套」。E3 是凍結契約,一個 byte 都不動。
//
// 這個閘擋的是 Fly 唯讀驗算實際觀察到的形狀:HTTP 200、systems_count=15、
// 沒有 partial_failures、沒有 failed_systems、success 不是 false、沒有 error 欄位,
// 只有某一套的 detail 寫著「計算異常：'planet_name'」。只檢查 success/error
// 會整個漏掉。

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertNoLegacyCalculatorFailureMarkers,
  LEGACY_FAILURE_GATE_PLANS,
} from '../lib/consultation/legacy-calculator-safety.ts'

// 取自 tasks/fly_readonly_validation_2026-08-09.md 的實際 live 形狀
function liveWesternPlaceholderResult() {
  return {
    systems_count: 15,
    client_data: { name: '虛構案例甲' },
    analyses: [
      { system: '八字四柱', detail: '日主辛金…', sub_summary: '身弱', score: 72 },
      {
        system: '西洋占星',
        detail: "計算異常：'planet_name'",
        sub_summary: '計算異常',
        score: 0,
        good_points: [],
        bad_points: [],
        warnings: ["此系統計算時發生錯誤：'planet_name'"],
      },
    ],
  }
}

function healthyResult(systemCount = 6) {
  return {
    systems_count: systemCount,
    client_data: { name: '虛構案例甲' },
    analyses: Array.from({ length: systemCount }, (_, index) => ({
      system: `系統${index + 1}`,
      detail: `第 ${index + 1} 套的實質排盤內容`,
      sub_summary: '正常',
      score: index === 0 ? 0 : 60 + index,
    })),
  }
}

test('閘只涵蓋 D／R／G15,完全排除 E1–E4', () => {
  assert.deepEqual([...LEGACY_FAILURE_GATE_PLANS].sort(), ['D', 'G15', 'R'])
  for (const plan of ['E1', 'E2', 'E3', 'E4']) {
    assert.equal(LEGACY_FAILURE_GATE_PLANS.has(plan), false, `${plan} 不得進入本閘`)
  }
})

test('live 的「計算異常」placeholder 會被擋下(D／R／G15)', () => {
  for (const plan of ['D', 'R', 'G15']) {
    assert.throws(
      () => assertNoLegacyCalculatorFailureMarkers(liveWesternPlaceholderResult(), plan),
      /西洋占星/u,
      `${plan} 沒有擋下 placeholder`,
    )
  }
})

test('E1–E4 一律不套用本閘,即使回應帶 placeholder', () => {
  for (const plan of ['E1', 'E2', 'E3', 'E4']) {
    assert.doesNotThrow(
      () => assertNoLegacyCalculatorFailureMarkers(liveWesternPlaceholderResult(), plan),
      `${plan} 被本閘影響了,凍結邊界破了`,
    )
  }
})

test('不要求 15 槽 —— D 取 5–8 套、R 取 8 套都要放行', () => {
  for (const count of [5, 6, 7, 8]) {
    for (const plan of ['D', 'R', 'G15']) {
      assert.doesNotThrow(() => assertNoLegacyCalculatorFailureMarkers(healthyResult(count), plan))
    }
  }
})

test('合法的 score=0 不得被誤判為失敗', () => {
  const result = healthyResult(5)
  result.analyses[0].score = 0
  result.analyses[0].sub_summary = '本項無明顯吉凶'
  assert.doesNotThrow(() => assertNoLegacyCalculatorFailureMarkers(result, 'D'))
})

test('內容裡出現「未見計算異常」這種否定句不得被誤擋', () => {
  const result = healthyResult(5)
  result.analyses[1].detail = '本次排盤未見計算異常,全部欄位齊全'
  assert.doesNotThrow(() => assertNoLegacyCalculatorFailureMarkers(result, 'R'))
})

test('頂層 failed_systems／partial_failures／success:false／error 都要擋', () => {
  const cases = [
    { ...healthyResult(5), failed_systems: ['西洋占星'] },
    { ...healthyResult(5), partial_failures: [{ system: '風水' }] },
    { ...healthyResult(5), success: false },
    { ...healthyResult(5), error: '排盤引擎異常' },
  ]
  for (const value of cases) {
    assert.throws(() => assertNoLegacyCalculatorFailureMarkers(value, 'D'))
  }
})

test('空 analyses 或缺 client_data 要擋', () => {
  assert.throws(() => assertNoLegacyCalculatorFailureMarkers(
    { systems_count: 0, client_data: { name: 'x' }, analyses: [] }, 'D'))
  assert.throws(() => assertNoLegacyCalculatorFailureMarkers(
    { systems_count: 5, analyses: healthyResult(5).analyses }, 'R'))
  assert.throws(() => assertNoLegacyCalculatorFailureMarkers(null, 'D'))
})

test('錯誤訊息要指名是哪一套,不能只說「排盤失敗」', () => {
  try {
    assertNoLegacyCalculatorFailureMarkers(liveWesternPlaceholderResult(), 'D')
    assert.fail('should have thrown')
  } catch (error) {
    assert.match(error.message, /西洋占星/u)
    assert.doesNotMatch(error.message, /planet_name/u, '不要把內部例外字串轉給客戶端訊息')
  }
})

test('detail 中性但 warnings 帶失敗字串,仍要擋', () => {
  // producer 兩處都寫:detail 是「計算異常：{e}」,warnings 是
  // 「此系統計算時發生錯誤：{e}」。原本只看 detail/sub_summary/summary,
  // 所以把 detail 換成中性字串就能整個繞過閘。
  const result = healthyResult(6)
  result.analyses[2].detail = '本系統已完成基本計算'
  result.analyses[2].sub_summary = '正常'
  result.analyses[2].warnings = ["此系統計算時發生錯誤：'planet_name'"]
  for (const plan of ['D', 'R', 'G15']) {
    assert.throws(
      () => assertNoLegacyCalculatorFailureMarkers(result, plan),
      /系統3/u,
      `${plan} 沒有從 warnings 認出失敗`,
    )
  }
})

test('warnings 裡的一般提醒不得被誤判為失敗', () => {
  const result = healthyResult(5)
  result.analyses[1].warnings = ['本次排盤未見計算異常', '流年變動較大,宜保守']
  assert.doesNotThrow(() => assertNoLegacyCalculatorFailureMarkers(result, 'D'))
})
