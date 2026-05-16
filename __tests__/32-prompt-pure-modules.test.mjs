// 測試 32:P8/P17/P3/P5 純函式契約(提示詞合集)
// ============================================================
// 與各 source 邏輯逐字對映(改 source 必同步)。測契約,非快鋪。

import { suite, test, assert, assertEqual, assertIncludes, done } from './harness.mjs'

// ── P17 ifs_translator：toIfsPart 契約 ──
const IFS = [
  { term: '值符', system: '奇門', part: '你內在那個負責主導決策、想掌控全局的 part' },
  { term: '七殺', system: '紫微', part: '你內在那個衝動、不顧後果、想殺出一條路的 part' },
  { term: '傷官', system: '八字', part: '你內在那個有才華但怕不被看見、容易叛逆的 part' },
]
const BY_TERM = new Map(IFS.map((e) => [e.term, e]))
const toIfsPart = (t) => BY_TERM.get(t)?.part ?? null

suite('P17 IFS 翻譯層 toIfsPart')
test('已知術語回 part 語言、不含凶煞字', () => {
  const p = toIfsPart('值符')
  assert(p && p.includes('part'), '應翻成 part 語言')
  assert(!/凶|煞|破/.test(p), 'IFS 翻譯不得含凶煞標籤')
})
test('未知術語回 null(不亂編)', () => {
  assertEqual(toIfsPart('不存在的星'), null)
  assertEqual(toIfsPart(''), null)
})
test('七殺(紫微)與傷官(八字)各有對應且語感一致', () => {
  assert(toIfsPart('七殺').includes('part'))
  assert(toIfsPart('傷官').includes('part'))
})
done()

// ── P8 judge：JSON verdict 解析韌性 ──
function parseVerdict(txt) {
  const s = txt.indexOf('{')
  const e = txt.lastIndexOf('}')
  if (s < 0 || e < 0) return { score: -1, hallucinations: [], missing_citations: [] }
  try {
    const p = JSON.parse(txt.slice(s, e + 1))
    return {
      score: typeof p.score === 'number' ? p.score : -1,
      hallucinations: Array.isArray(p.hallucinations) ? p.hallucinations : [],
      missing_citations: Array.isArray(p.missing_citations) ? p.missing_citations : [],
    }
  } catch {
    return { score: -1, hallucinations: [], missing_citations: [] }
  }
}
suite('P8 Writer-Judge 解析韌性(judge 掛掉不可阻斷主流程)')
test('正常 JSON', () => {
  const v = parseVerdict('結果:{"score":92,"hallucinations":[],"missing_citations":["八字日主"]}')
  assertEqual(v.score, 92)
  assertEqual(v.missing_citations.length, 1)
})
test('文字包裹 JSON 仍可解析', () => {
  assertEqual(parseVerdict('```json\n{"score":80,"hallucinations":["編造流年"]}\n```').score, 80)
})
test('壞 JSON → score -1(呼叫端視為 judge 不可用、不丟棄報告)', () => {
  assertEqual(parseVerdict('完全不是 json').score, -1)
  assertEqual(parseVerdict('{壞掉').score, -1)
})
test('score 非數字 → -1(防型別污染)', () => {
  assertEqual(parseVerdict('{"score":"high"}').score, -1)
})
done()

// ── P3 apology-retry：4 大保證齊全 + SSOT 對齊 ──
const GUARANTEES = [
  '失敗自動重試 3 次,並由真人在 24 小時內接手協助補開新單(不會多扣款)',
  '內容明顯錯誤(出生資料解讀錯)免費重新生成、不再扣款',
  '系統重複扣款,無條件退回多扣金額',
  '未授權扣款(盜刷 / 家人誤購)提供 Stripe 交易紀錄即可申訴退回',
]
function buildApology(name, plan) {
  return {
    subject: `${name},您的「${plan}」報告我們正在親自為您處理`,
    text: `${name}...4 大保證:\n` + GUARANTEES.map((g, i) => `${i + 1}. ${g}`).join('\n'),
  }
}
suite('P3 失敗致歉信 — 4 大保證對齊根 CLAUDE.md SSOT')
test('subject 含客戶名與方案名', () => {
  const e = buildApology('王先生', '人生藍圖')
  assertIncludes(e.subject.split(''), '王')
  assert(e.subject.includes('人生藍圖'))
})
test('4 大保證全列、不缺項', () => {
  const e = buildApology('A', 'C')
  assertEqual(GUARANTEES.length, 4)
  for (const g of GUARANTEES) assert(e.text.includes(g.slice(0, 6)), `缺保證:${g}`)
})
test('不承諾退款(政策不退款、只走 4 保證)', () => {
  const e = buildApology('A', 'C')
  assert(!/全額退款|無條件退款|退費/.test(e.text), '不得出現無條件退款承諾')
})
done()

// ── P5 free-tool-schema：JSON-LD 三層結構 ──
function buildJsonLd(tool) {
  const names = { bazi: '免費八字排盤線上工具 含十神大運流年', ziwei: '免費紫微斗數命盤 含 12 宮主星詳解', qimen: '免費奇門遁甲排盤 含九宮八神時家局' }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', name: names[tool], applicationCategory: 'LifestyleApplication', offers: { '@type': 'Offer', price: '0' } },
      { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question' }, { '@type': 'Question' }, { '@type': 'Question' }, { '@type': 'Question' }] },
      { '@type': 'HowTo', step: [1, 2, 3, 4, 5].map((i) => ({ '@type': 'HowToStep', position: i })) },
    ],
  }
}
suite('P5 免費工具 JSON-LD 三層 schema')
test('三工具皆產 SoftwareApplication+FAQPage+HowTo', () => {
  for (const t of ['bazi', 'ziwei', 'qimen']) {
    const g = buildJsonLd(t)['@graph']
    assertEqual(g[0]['@type'], 'SoftwareApplication')
    assertEqual(g[1]['@type'], 'FAQPage')
    assertEqual(g[2]['@type'], 'HowTo')
    assert(g[1].mainEntity.length >= 4, 'FAQ 至少 4 題(長尾關鍵字)')
    assert(g[2].step.length === 5, 'HowTo 5 步驟')
  }
})
test('免費價格標 0(SoftwareApplication offer)', () => {
  assertEqual(buildJsonLd('bazi')['@graph'][0].offers.price, '0')
})
test('長尾關鍵字塞進 name', () => {
  assert(buildJsonLd('ziwei')['@graph'][0].name.includes('12 宮主星'))
})
done()
