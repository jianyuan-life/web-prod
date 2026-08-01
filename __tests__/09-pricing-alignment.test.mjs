// 測試 9:8 方案定價跨檔對齊
// 防止 v5.4.1 stale price bug 類問題重現
// (v5.4.0 → v5.4.1 發現 prompts / tools 頁 / report 頁有 5 處寫舊價 $89/$99、實際 $59/$29)

import { suite, test, assert, done } from './harness.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()

// 權威源：lib/plan-names.ts 的 PLAN_PRICES；checkout route 僅 import SSOT。
const planNamesSrc = readFileSync(join(ROOT, 'lib/plan-names.ts'), 'utf-8')

function parsePlanPrices(src) {
  const map = {}
  const block = src.match(/export const PLAN_PRICES[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  const re = /^\s*(?:['"]([^'"]+)['"]|([A-Z]\d*))\s*:\s*(\d+)/gm
  let m
  while ((m = re.exec(block)) !== null) {
    const code = m[1] || m[2]
    map[code] = { amount: parseInt(m[3], 10) }
  }
  return map
}

const PRICE_MAP = parsePlanPrices(planNamesSrc)

suite('checkout API PRICE_MAP 解析')
test('找到至少 8 個方案', () => {
  const keys = Object.keys(PRICE_MAP)
  assert(keys.length >= 8, `期望 ≥8、實際 ${keys.length}: ${keys.join(',')}`)
})
test('8 個必要方案全在(C/D/G15/R/E1/E2/E3/E4)', () => {
  for (const k of ['C', 'D', 'G15', 'R', 'E1', 'E2', 'E3', 'E4']) {
    assert(typeof PRICE_MAP[k] === 'object', `缺方案 ${k}`)
    assert(typeof PRICE_MAP[k].amount === 'number', `${k} amount 不是數字`)
    assert(PRICE_MAP[k].amount > 0, `${k} amount 必 >0`)
  }
})
test('amount 在合理範圍(1000-50000 cents = $10-$500)', () => {
  for (const [k, v] of Object.entries(PRICE_MAP)) {
    assert(v.amount >= 1000 && v.amount <= 50000,
      `${k} amount=${v.amount} 超出合理範圍`)
  }
})

suite('Stripe webhook PLAN_NAMES 對齊')
const webhookSrc = readFileSync(join(ROOT, 'app/api/webhook/stripe/route.ts'), 'utf-8')
test('webhook PLAN_NAMES 含全 8 方案', () => {
  assert(webhookSrc.includes("import { PLAN_NAMES } from '@/lib/plan-names'"),
    'webhook 應直接 import 方案名稱 SSOT')
})

suite('前端 pricing 頁價格對齊(v5.10.467 三方案陣容)')
const pricingSrc = readFileSync(join(ROOT, 'app/pricing/page.tsx'), 'utf-8')
// v5.10.467 方案收斂:對外只售 C/G15/E3(SSOT = lib/plan-names.ts VISIBLE_PLAN_CODES 預設值)。
// 可見方案的頁面價格必須對齊 PLAN_PRICES;隱藏方案不得出現在定價頁資料中。
const VISIBLE = ['C', 'G15', 'E3']
const HIDDEN = ['D', 'R', 'E1', 'E2', 'E4']
for (const code of VISIBLE) {
  test(`${code} 頁面價格對齊 PLAN_PRICES`, () => {
    const usd = PRICE_MAP[code].amount / 100
    const re = new RegExp(`code:\\s*['"]${code}['"][\\s\\S]{0,160}?price:\\s*${usd}\\b`)
    assert(re.test(pricingSrc), `${code} 應在定價頁顯示 price: ${usd}(對齊 PLAN_PRICES ${PRICE_MAP[code].amount} cents)`)
  })
}
test('隱藏方案(D/R/E1/E2/E4)不出現在定價頁資料', () => {
  for (const code of HIDDEN) {
    const re = new RegExp(`code:\\s*['"]${code}['"]`)
    assert(!re.test(pricingSrc), `定價頁不應含隱藏方案 ${code}(2026-08-01 方案收斂)`)
  }
})

suite('免費工具 4 頁 CTA 無 stale 價格')
const pages = [
  'app/tools/bazi/page.tsx',
  'app/tools/ziwei/page.tsx',
  'app/tools/qimen/page.tsx',
  'app/tools/name/page.tsx',
]
for (const p of pages) {
  test(`${p} 無 E1 \$89 / E2 \$99 stale`, () => {
    let src
    try { src = readFileSync(join(ROOT, p), 'utf-8') }
    catch { return }  // 該頁不存在則跳過
    const staleE1 = /事件出門訣 \$89(?!\d)/.test(src)
    const staleE2 = /月度出門訣 \$99(?!\d)/.test(src)
    assert(!staleE1 && !staleE2,
      `${p} 仍有 stale 價(E1 \$89=${staleE1} / E2 \$99=${staleE2})`)
  })
}

suite('AI prompt(generate-report)無 stale 價格')
const promptSrc = readFileSync(join(ROOT, 'app/api/generate-report/route.ts'), 'utf-8')
test('E1 prompt 無 $89', () => {
  const e1Block = promptSrc.match(/\bE1:\s*`([\s\S]{0,500})/)?.[1] || ''
  const hasStale = e1Block.includes('$89')
  assert(!hasStale, `E1 prompt 仍提 \$89(stale): ${e1Block.slice(0, 100)}`)
})
test('E2 prompt 無 $99', () => {
  const e2Block = promptSrc.match(/\bE2:\s*`([\s\S]{0,500})/)?.[1] || ''
  const hasStale = e2Block.includes('$99')
  assert(!hasStale, `E2 prompt 仍提 \$99(stale): ${e2Block.slice(0, 100)}`)
})

done()
