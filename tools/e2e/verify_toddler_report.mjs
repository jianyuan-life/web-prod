// 兒童版 C 報告驗證:客戶視角開啟 + v5.10.488 適齡規則機檢
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('D:/npm-global/node_modules/playwright')

const TOKEN = process.argv[2]
const OUT = process.argv[3] || 'toddler_report.png'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1400 }, userAgent: UA })).newPage()

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  V ${name}`) }
  else { fail++; console.log(`  X ${name} ${detail}`) }
}

await page.goto(`https://jianyuan.life/consultation/access#token=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
try { await page.waitForURL(new RegExp(`/report/${TOKEN}`), { timeout: 30000 }) } catch {}
check('放行到正式閱讀頁', page.url().endsWith(`/report/${TOKEN}`), page.url())
await page.waitForTimeout(10000)

const info = await page.evaluate(() => {
  // 只取報告正文區(document.body.textContent 會吃進 <script>/主題切換程式碼、造成誤判)
  const root = document.querySelector('[data-report-content]') || document.querySelector('main') || document.body
  const clone = root.cloneNode(true)
  clone.querySelectorAll('script, style, noscript').forEach(el => el.remove())
  const full = clone.textContent || ''
  const count = (re) => (full.match(re) || []).length
  return {
    len: full.replace(/\s/g, '').length,
    hasError: /無法開啟報告|找不到報告/.test(full),
    childTitle: /兒童專版|兒童版/.test(full),
    // 成人期逐十年詳批(31 歲以後段落標記)
    adultDecades: count(/[34567][0-9]\s*[-–~]\s*[456780][0-9]\s*歲/g),
    decadesSamples: (full.match(/[34567][0-9]\s*[-–~]\s*[456780][0-9]\s*歲[^。]{0,30}/g) || []).slice(0, 5),
    // 成人議題
    marriage: count(/婚姻|離婚|桃花/g),
    invest: count(/投資|定期定額|基金|不動產|理財/g),
    career: count(/職場|創業|升遷/g),
    // 凶煞小標
    shaTerms: count(/絕命方|五鬼方|禍害方|六煞方|病符方/g),
    // 需求對位(前 3000 字內要回應健康/讀書)
    needsEarly: /健康|讀書|開智慧|學習/.test(full.slice(0, 3000)),
    investSamples: (full.match(/[^。\n]{0,25}(投資|定期定額|基金|不動產|理財)[^。\n]{0,25}/g) || []).slice(0, 5),
    head: full.replace(/\s+/g, ' ').slice(0, 600),
    // 章節撞號:目錄中同一個中文編號出現多次
    tocDup: (() => {
      const items = Array.from(document.querySelectorAll('nav a, aside a, [class*="toc"] a'))
        .map(a => (a.textContent || '').trim()).filter(Boolean)
      const nums = items.map(t => (t.match(/^([一二三四五六七八九十]+)、/) || [])[1]).filter(Boolean)
      const seen = {}, dup = []
      for (const n of nums) { seen[n] = (seen[n] || 0) + 1; if (seen[n] === 2) dup.push(n) }
      return { count: items.length, dup }
    })(),
    // 內部殘渣
    debris: count(/不對。正確公式|依規定略過|原報告誤判/g),
    sample: full.replace(/\s+/g, ' ').slice(0, 300),
  }
})
check('頁面無錯誤畫面', !info.hasError, info.sample)
check('標題含兒童專版', info.childTitle)
check('正文字數 > 3000', info.len > 3000, `len=${info.len}`)
check('無 31 歲以後逐十年詳批', info.adultDecades === 0, `hits=${info.adultDecades} samples=${JSON.stringify(info.decadesSamples)}`)
check('婚姻/桃花字詞 <= 2(允許否定句)', info.marriage <= 2, `hits=${info.marriage}`)
check('投資/理財字詞 <= 2', info.invest <= 2, `hits=${info.invest}`)
check('無凶煞方位小標詞', info.shaTerms === 0, `hits=${info.shaTerms}`)
check('前 3000 字回應需求(健康/讀書)', info.needsEarly)
check('無內部殘渣字句', info.debris === 0, `hits=${info.debris}`)
check('目錄章節編號無重複', info.tocDup.dup.length === 0, `dup=${JSON.stringify(info.tocDup)}`)
console.log(`職場/創業字詞: ${info.career}(參考)`)
console.log(`投資語境樣本: ${JSON.stringify(info.investSamples, null, 1)}`)
console.log(`開頭 600 字: ${info.head}`)
await page.screenshot({ path: OUT, fullPage: false })
console.log(`RESULT: ${pass} pass / ${fail} fail`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
