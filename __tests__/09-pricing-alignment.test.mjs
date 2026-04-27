// 測試 9:8 方案定價跨檔對齊
// 防止 v5.4.1 stale price bug 類問題重現
// (v5.4.0 → v5.4.1 發現 prompts / tools 頁 / report 頁有 5 處寫舊價 $89/$99、實際 $59/$29)

import { suite, test, assert, done } from './harness.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()

// 權威源:checkout API PRICE_MAP(L17-25)
const checkoutSrc = readFileSync(join(ROOT, 'app/api/checkout/route.ts'), 'utf-8')

function parsePriceMap(src) {
  const map = {}
  const re = /(\b[CDEGR]\d?\d?)\s*:\s*\{\s*amount:\s*(\d+),\s*name:\s*['"](.+?)['"]/g
  let m
  while ((m = re.exec(src)) !== null) {
    map[m[1]] = { amount: parseInt(m[2], 10), name: m[3] }
  }
  return map
}

const PRICE_MAP = parsePriceMap(checkoutSrc)

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
  for (const k of Object.keys(PRICE_MAP)) {
    assert(webhookSrc.includes(`${k}: '`),
      `webhook PLAN_NAMES 缺方案 ${k}`)
  }
})

suite('前端 pricing 頁無 stale 價格')
const pricingSrc = readFileSync(join(ROOT, 'app/pricing/page.tsx'), 'utf-8')
test('E1 顯示 $59(非 stale $89/$119)', () => {
  const hasNew = pricingSrc.includes('$59') || pricingSrc.includes('5900')
  // 精確 stale pattern:'事件出門訣 $89' 或 '事件出門訣($89)' 或 'E1 ... $89' 緊密綁定
  const stalePatterns = [
    /事件出門訣\s*[\$＄]89(?!\d)/,
    /事件出門訣[（(]\s*[\$＄]89/,
    /\bE1\b\s*[^E\n]{0,15}[\$＄]89(?!\d)/,
    /事件出門訣\s*[\$＄]119(?!\d)/,
    /\bE1\b\s*[^E\n]{0,15}[\$＄]119(?!\d)/,
  ]
  const stale = stalePatterns.some(p => p.test(pricingSrc))
  assert(hasNew && !stale, 'E1 應顯示 $59、不應有 $89/$119 緊密綁定 stale 價')
})
test('E2 顯示 $29(非 stale $99)', () => {
  const hasNew = pricingSrc.includes('$29') || pricingSrc.includes('2900')
  const stalePatterns = [
    /月度出門訣\s*[\$＄]99(?!\d)/,
    /月度出門訣[（(]\s*[\$＄]99/,
    /\bE2\b\s*[^E\n]{0,15}[\$＄]99(?!\d)/,
  ]
  const stale = stalePatterns.some(p => p.test(pricingSrc))
  assert(hasNew && !stale, 'E2 應顯示 $29、不應有 $99 緊密綁定 stale 價')
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
