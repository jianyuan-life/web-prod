// C 報告開啟正向 E2E:/consultation/access#token=... → 交換 → /consultation/view → 渲染
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('D:/npm-global/node_modules/playwright')

const TOKEN = process.argv[2]
if (!TOKEN) { console.error('need access token'); process.exit(2) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1400 }, userAgent: UA })).newPage()

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  V ${name}`) }
  else { fail++; console.log(`  X ${name} ${detail}`) }
}

await page.goto(`https://jianyuan.life/consultation/access#token=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
// v5.10.486:傳統版報告安全確認後直接放行到正式閱讀頁 /report/<token>
try {
  await page.waitForURL(new RegExp(`/report/${TOKEN}`), { timeout: 30000 })
} catch {}
const url = page.url()
check('放行到正式閱讀頁 /report/<token>', url.endsWith(`/report/${TOKEN}`), url)
await page.waitForTimeout(10000)
const info = await page.evaluate(() => {
  const body = document.body.innerText || ''
  return {
    len: body.replace(/\s/g, '').length,
    hasError: /無法開啟報告|無法完成安全確認|找不到報告/.test(body),
    hasClassicReader: /排盤資料摘要|人生藍圖/.test(body) && /目錄|速覽/.test(body),
    noInternalFraming: !/舊版報告原文|資料庫保存的原文|不替舊原文補寫摘要/.test(body),
    sample: body.replace(/\s+/g, ' ').slice(0, 200),
  }
})
check('頁面無錯誤畫面', !info.hasError, info.sample)
check('正式閱讀頁(命格卡/目錄)已渲染', info.hasClassicReader, info.sample)
check('無「舊版報告」內部框架文案', info.noInternalFraming, info.sample)
check('正文字數 > 3000', info.len > 3000, `len=${info.len}`)
await page.screenshot({ path: process.env.SHOT || 'access_open_verify.png', fullPage: false })

// 14 套系統實引用掃描(全 DOM textContent、含摺疊)
const scan = await page.evaluate(() => {
  const full = document.body.textContent || ''
  const SYSTEMS = {
    '八字': /八字|四柱|日主/g, '紫微': /紫微/g, '奇門': /奇門/g, '風水': /風水/g,
    '姓名學': /姓名學|康熙筆畫|筆畫/g, '西洋占星': /西洋占星|上升星座|太陽星座/g,
    '吠陀': /吠陀/g, '易經': /易經|卦象|[乾坤震巽坎離艮兌]卦/g, '人類圖': /人類圖/g,
    '塔羅': /塔羅/g, '數字': /生命靈數|數字能量/g, '古典': /古典占星|七政/g,
    '生肖': /生肖/g, '生物節律': /生物節律|節律/g,
  }
  const counts = {}
  for (const [name, re] of Object.entries(SYSTEMS)) counts[name] = (full.match(re) || []).length
  return { counts, fullLen: full.replace(/\s/g, '').length }
})
console.log(`全文字數=${scan.fullLen}`)
console.log('14 系統引用次數:')
const zero = []
for (const [name, n] of Object.entries(scan.counts)) {
  console.log(`  ${n === 0 ? 'X' : 'V'} ${name}: ${n}`)
  if (n === 0) zero.push(name)
}
console.log(zero.length ? `未引用: ${zero.join('、')}` : '14 類特徵詞全部有引用')

console.log(`RESULT: ${pass} pass / ${fail} fail`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
