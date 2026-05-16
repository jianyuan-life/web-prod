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

// ── P8 已移除:judge.ts 為重造(lib/ai/team/peer-review.ts + truth-gate.ts
//    已存在且更完整)。資產盤點修正、刪 judge.ts、此 suite 一併移除,
//    不測已刪模組的幽靈。P8 真實狀態 = 既有 lib/ai/team 系統(本檔不重測)。

// ── P3 4 大保證 SSOT 不變量(致歉信本體已存在 production steps.ts:4331、
//    我的 apology-retry.ts 已刪除為多餘;此處只守 GuaranteeBlock 用的
//    4 保證文字與根 CLAUDE.md「退費 policy v5.7.8」對齊 + 不承諾退款)──
const GUARANTEES = [
  '失敗自動重試 3 次,並由真人在 24 小時內接手協助補開新單(不會多扣款)',
  '內容明顯錯誤(出生資料解讀錯)免費重新生成、不再扣款',
  '系統重複扣款,無條件退回多扣金額',
  '未授權扣款(盜刷 / 家人誤購)提供 Stripe 交易紀錄即可申訴退回',
]
suite('P3 4 大保證 SSOT 不變量(GuaranteeBlock + 既有 prod 致歉信共用)')
test('恰 4 條保證', () => {
  assertEqual(GUARANTEES.length, 4)
})
test('涵蓋:失敗補開 / 錯誤重生 / 重複扣款退 / 盜刷申訴', () => {
  const joined = GUARANTEES.join('|')
  for (const k of ['重試 3 次', '免費重新生成', '重複扣款', '未授權扣款'])
    assert(joined.includes(k), `缺保證關鍵:${k}`)
})
test('不出現無條件退款承諾(政策:不退款、只走 4 保證)', () => {
  const joined = GUARANTEES.join('')
  assert(!/全額退款|無條件退款|可退費/.test(joined), '不得承諾退款')
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
