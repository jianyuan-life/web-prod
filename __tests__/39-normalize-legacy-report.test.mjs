import { suite, test, assert, assertEqual, done } from './harness.mjs'
import { normalizeLegacyReport } from '../lib/consultation/normalize-legacy.ts'

suite('C/G15 legacy report normalizer')

test('completed C row is exposed only as provenance-labelled legacy full text', () => {
  const rawText = '# 原始人生藍圖\n\n這是舊版正文。'
  const result = normalizeLegacyReport({
    plan_code: 'C',
    status: 'completed',
    access_token: 'legacy-c-token',
    report_result: { ai_content: rawText },
  })

  assert(result.ok, '已完成且有原始正文的 C 報告應可讀')
  assertEqual(result.mode, 'legacy_full_text')
  assertEqual(result.content, rawText)
  assertEqual(result.plan, 'C')
  assertEqual(result.provenance.source, 'paid_reports')
  assertEqual(result.provenance.contentField, 'report_result.ai_content')
  assertEqual(result.asOf.status, 'unknown')
  assertEqual(result.asOf.value, null)
  assertEqual(result.facts.length, 0)
})

test('G15 never derives facts, names, roles, or years from AI prose', () => {
  const rawText = '何某是父親，2028 年一定會成功。'
  const fullCharts = { source: 'calculator', members: [{ id: 'member-1' }] }
  const narrativeSummary = { summary: '只是已儲存的摘要' }
  const result = normalizeLegacyReport({
    plan_code: 'G15',
    status: 'completed',
    access_token: 'legacy-g15-token',
    ai_content: rawText,
    full_charts: fullCharts,
    narrative_summary: narrativeSummary,
    report_result: null,
  })

  assert(result.ok, '已完成且有舊正文的 G15 報告應以 legacy 模式讀取')
  assertEqual(result.mode, 'legacy_full_text')
  assertEqual(result.content, rawText)
  assertEqual(result.provenance.contentField, 'ai_content')
  assertEqual(result.facts.length, 0)
  assert(result.fullCharts === fullCharts, '仅可原樣傳遞 DB 內的 full_charts')
  assert(result.narrativeSummary === narrativeSummary, '仅可原樣傳遞 DB 內的 narrative_summary')
  assert(!('people' in result), '不得從散文填造人物')
  assert(!('roles' in result), '不得從散文填造角色')
  assert(!('year' in result), '不得從散文填造年份')
  assert(!('conclusions' in result), '不得從散文填造結論')
})

test('E3 and every non-C/G15 plan are rejected without exposing report content', () => {
  for (const planCode of ['E3', 'D', 'R', 'E1']) {
    const result = normalizeLegacyReport({
      plan_code: planCode,
      status: 'completed',
      access_token: `unsupported-${planCode}`,
      report_result: { ai_content: `private ${planCode} content` },
    })

    assert(!result.ok, `${planCode} 必須被拒絕`)
    assertEqual(result.mode, 'HOLD')
    assertEqual(result.code, 'unsupported_plan')
    assertEqual(result.asOf.status, 'HOLD')
    assert(!('content' in result), '拒絕結果不得暴露正文')
  }
})

test('non-completed C/G15 rows remain on HOLD', () => {
  for (const status of ['pending', 'processing', 'failed', 'needs_human_review']) {
    const result = normalizeLegacyReport({
      plan_code: 'C',
      status,
      access_token: `not-completed-${status}`,
      report_result: { ai_content: 'must not be exposed' },
    })

    assert(!result.ok, `${status} 不得進入舊報告閱讀模式`)
    assertEqual(result.mode, 'HOLD')
    assertEqual(result.code, 'report_not_completed')
    assertEqual(result.asOf.status, 'HOLD')
    assert(!('content' in result), '未完成報告不得暴露半成品')
  }
})

test('missing, blank, whitespace-containing, or control-character access_token is HOLD and never echoed', () => {
  for (const accessToken of [undefined, null, '', '   ', 'legacy token', 'legacy\ntoken']) {
    const result = normalizeLegacyReport({
      plan_code: 'C',
      status: 'completed',
      access_token: accessToken,
      report_result: { ai_content: 'private legacy content' },
    })

    assert(!result.ok, '沒有可用 access_token 不得載入')
    assertEqual(result.code, 'invalid_access_token')
    assert(!('accessToken' in result), 'HOLD 不得回傳 token')
    assert(!('content' in result), 'HOLD 不得暴露正文')
  }
})

test('completed row without non-empty legacy text is HOLD instead of a fabricated report', () => {
  const missingContentRows = [
    {},
    { report_result: null },
    { ai_content: '   ' },
    { report_result: { ai_content: '\n\t' } },
    { report_result: { full_charts: { bazi: {} } } },
  ]

  for (const fields of missingContentRows) {
    const result = normalizeLegacyReport({
      plan_code: 'G15',
      status: 'completed',
      access_token: 'missing-content-token',
      ...fields,
    })

    assert(!result.ok, '無正文時必須 HOLD')
    assertEqual(result.code, 'missing_legacy_content')
    assertEqual(result.asOf.status, 'HOLD')
    assert(!('content' in result), '不得生成 placeholder 正文')
  }
})

test('loader rejects rows containing fields outside the explicit DB projection', () => {
  const result = normalizeLegacyReport({
    plan_code: 'C',
    status: 'completed',
    access_token: 'minimal-projection-token',
    report_result: { ai_content: 'legacy text' },
    client_name: '不應進入 loader',
  })

  assert(!result.ok, '呼叫端必須使用明確 DB projection')
  assertEqual(result.code, 'unexpected_row_fields')
  assertEqual(result.asOf.status, 'HOLD')
  assert(!('content' in result), '無法確認來源的 row 不得載入')
})

test('non-object input fails closed instead of throwing', () => {
  for (const input of [null, undefined, [], 'row', 42]) {
    const result = normalizeLegacyReport(input)
    assert(!result.ok, '非 DB row 必須 HOLD')
    assertEqual(result.code, 'invalid_row')
    assertEqual(result.asOf.status, 'HOLD')
  }
})

test('an explicit valid report_result.asOfDate is preserved with provenance', () => {
  const result = normalizeLegacyReport({
    plan_code: 'C',
    status: 'completed',
    access_token: 'known-as-of-token',
    report_result: {
      ai_content: 'legacy text',
      asOfDate: '2026-08-09',
    },
  })

  assert(result.ok, '有明確舊正文的報告應可讀')
  assertEqual(result.asOf.status, 'known')
  assertEqual(result.asOf.value, '2026-08-09')
  assertEqual(result.asOf.sourceField, 'report_result.asOfDate')
})

test('an explicit but invalid asOfDate is HOLD rather than silently relabelled unknown', () => {
  for (const asOfDate of ['2026-02-30', '2026/08/09', 'today', 20260809]) {
    const result = normalizeLegacyReport({
      plan_code: 'C',
      status: 'completed',
      access_token: 'invalid-as-of-token',
      report_result: { ai_content: 'legacy text', asOfDate },
    })

    assert(!result.ok, '已提供卻無效的 asOfDate 必須 HOLD')
    assertEqual(result.code, 'invalid_as_of')
    assertEqual(result.asOf.status, 'HOLD')
    assert(!('content' in result), 'HOLD 不得載入正文')
  }
})

test('string-valued legacy report_result is preserved as full text', () => {
  const rawText = '# 舊款 JSONB 前的報告內容'
  const result = normalizeLegacyReport({
    plan_code: 'C',
    status: 'completed',
    access_token: 'string-report-result-token',
    report_result: rawText,
  })

  assert(result.ok, '字串型 legacy report_result 應保留')
  assertEqual(result.mode, 'legacy_full_text')
  assertEqual(result.content, rawText)
  assertEqual(result.provenance.contentField, 'report_result')
  assertEqual(result.asOf.status, 'unknown')
})

test('conflicting direct and nested legacy text is HOLD', () => {
  const result = normalizeLegacyReport({
    plan_code: 'G15',
    status: 'completed',
    access_token: 'conflicting-content-token',
    ai_content: 'direct version',
    report_result: { ai_content: 'different nested version' },
  })

  assert(!result.ok, '兩個不同原始版本不可自動擇一')
  assertEqual(result.code, 'conflicting_legacy_content')
  assertEqual(result.asOf.status, 'HOLD')
  assert(!('content' in result), '衝突未解前不得暴露任一版')
})

done()
