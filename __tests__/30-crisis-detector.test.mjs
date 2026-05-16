// 測試 30:危機偵測(提示詞合集 P6 crisis-detector)
// ============================================================
// 攸關人命:scanForCrisis 漏判 = 真實風險(P7 驗證已證 LLM 端微妙)。
// 依本 repo 慣例(harness.mjs + 純函式提取),把 lib/content-moderation/
// crisis-detector.ts 的 RISK_TERMS + scanForCrisis 邏輯**逐字對映**測,
// 涵蓋三類 + 大小寫 + 夾雜情境 + 不誤判正常文 + 邊界。

import { suite, test, assert, assertEqual, done } from './harness.mjs'

// ── 與 lib/content-moderation/crisis-detector.ts 逐字對映(改 source 必同步)──
const RISK_TERMS = {
  self_harm: [
    '自殺', '自我了結', '不想活', '想消失', '結束一切', '活不下去',
    '解脫', '我想離開', '了結自己', '輕生', '不如死了', '一了百了',
    'kill myself', 'end my life', 'suicide', 'want to die',
  ],
  severe_depression: [
    '沒有未來', '毫無意義', '所有人沒我會更好', '沒有人需要我',
    '人生沒意義', '活著好累', '撐不下去了',
    'everyone better off without me', 'no future', 'pointless to live',
  ],
  acute_stress: [
    '撐不下去', '崩潰邊緣', '失控', '想傷害他人', '不想再忍',
    '快瘋了', '受不了了',
    'breaking down', 'lose control', 'hurt someone',
  ],
}

function scanForCrisis(text) {
  if (!text) return { crisis: false, categories: [], matchedTerms: [] }
  const lower = text.toLowerCase()
  const cats = new Set()
  const hits = []
  for (const [cat, terms] of Object.entries(RISK_TERMS)) {
    for (const t of terms) {
      const isEn = /[a-z]/i.test(t)
      const needle = isEn ? t.toLowerCase() : t
      const hay = isEn ? lower : text
      if (hay.includes(needle)) {
        cats.add(cat)
        hits.push(t)
      }
    }
  }
  return { crisis: cats.size > 0, categories: [...cats], matchedTerms: [...new Set(hits)] }
}

suite('P6 危機偵測 scanForCrisis(攸關人命、寧誤判不漏判)')

test('空字串 / null 不誤判', () => {
  assertEqual(scanForCrisis('').crisis, false)
  assertEqual(scanForCrisis(null).crisis, false)
  assertEqual(scanForCrisis(undefined).crisis, false)
})

test('自傷意念命中', () => {
  const r = scanForCrisis('最近真的不想活了')
  assert(r.crisis, '不想活 應觸發')
  assertEqual(r.categories.includes('self_harm'), true)
})

test('重度憂鬱命中(P7 89%→100% 修的正是此類)', () => {
  const r = scanForCrisis('覺得沒有未來,所有人沒我會更好')
  assert(r.crisis, '沒有未來/所有人沒我會更好 應觸發')
  assertEqual(r.categories.includes('severe_depression'), true)
})

test('急性壓力命中', () => {
  const r = scanForCrisis('我快崩潰邊緣了、想傷害他人')
  assert(r.crisis)
  assertEqual(r.categories.includes('acute_stress'), true)
})

test('夾在命理問題中一句帶過也要抓(關鍵安全情境)', () => {
  const r = scanForCrisis('我想問今年財運如何,順便說我覺得活著好累、想消失')
  assert(r.crisis, '夾雜情境必須命中')
  assert(r.matchedTerms.length >= 1)
})

test('英文風險詞大小寫不敏感', () => {
  assert(scanForCrisis('I want to DIE honestly').crisis, 'want to die 應命中')
  assert(scanForCrisis('I might KILL MYSELF').crisis)
  assert(scanForCrisis('everyone Better Off Without Me').crisis)
})

test('正常命理諮詢不誤判(避免過度告警騷擾)', () => {
  assertEqual(scanForCrisis('我想知道八字事業運勢和財運方向').crisis, false)
  assertEqual(scanForCrisis('紫微命宮七殺,婚姻宮如何').crisis, false)
  assertEqual(scanForCrisis('奇門盤值符落宮代表什麼').crisis, false)
})

test('多類同時命中 → categories 去重且齊全', () => {
  const r = scanForCrisis('我撐不下去了、不想活、覺得沒有未來')
  assertEqual(r.crisis, true)
  assert(r.categories.length >= 2, `應跨多類,實際 ${r.categories.join(',')}`)
})

test('matchedTerms 去重', () => {
  const r = scanForCrisis('不想活...真的不想活')
  const dup = r.matchedTerms.filter((t) => t === '不想活')
  assertEqual(dup.length, 1, 'matchedTerms 應去重')
})

test('三類詞庫覆蓋完整性(防 source 漏詞)', () => {
  assert(RISK_TERMS.self_harm.length >= 12, 'self_harm 詞庫不足')
  assert(RISK_TERMS.severe_depression.length >= 7, 'severe_depression 詞庫不足')
  assert(RISK_TERMS.acute_stress.length >= 7, 'acute_stress 詞庫不足')
})

done()
