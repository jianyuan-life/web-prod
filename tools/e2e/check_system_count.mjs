// 對外 14 套一致性復驗:桌機+手機都不得出現「15 套」且標示數=實際筆數
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('D:/npm-global/node_modules/playwright')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const TOKEN = process.argv[2]
const b = await chromium.launch({ headless: true })
let fail = 0
for (const [label, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, userAgent: UA })).newPage()
  await p.goto(`https://jianyuan.life/report/${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(9000)
  const r = await p.evaluate(() => {
    const root = document.querySelector('[data-report-content]') || document.body
    const c = root.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove())
    const txt = c.textContent || ''
    return {
      fifteen: (txt.match(/15\s*套|十五\s*套|15\s*系統|十五系統/g) || []),
      claims: (txt.match(/\d+\s*套系統/g) || []).slice(0, 6),
    }
  })
  const ok = r.fifteen.length === 0
  if (!ok) fail++
  console.log(`${label}: ${ok ? 'V' : 'X'} 十五套字樣=${JSON.stringify(r.fifteen)} 宣稱=${JSON.stringify(r.claims)}`)
  await p.screenshot({ path: `${process.argv[3]}/sys_count_${label}.png` })
}
await b.close()
console.log(fail === 0 ? 'SYSTEM_COUNT_CONSISTENT' : 'SYSTEM_COUNT_INCONSISTENT')
process.exit(fail === 0 ? 0 : 1)
