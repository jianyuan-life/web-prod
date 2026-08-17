// 結帳頁亮色主題:所有原生輸入控件的前景/背景對比度量測(WCAG 4.5:1)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('D:/npm-global/node_modules/playwright')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const REF = 'jvmnntavizbjsgofnusy'
const FAKE_USER = { id: '00000000-0000-4000-8000-00000000e2e1', aud: 'authenticated', role: 'authenticated', email: 'cbe566+paytest0814@gmail.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: '測試客戶' }, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-17T00:00:00Z' }
const mk = () => ({ access_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: FAKE_USER })
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, colorScheme: 'light' })
await ctx.route(`https://${REF}.supabase.co/auth/v1/user**`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) }))
await ctx.route(`https://${REF}.supabase.co/auth/v1/token**`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mk()) }))
await ctx.addInitScript((s) => { try { localStorage.setItem('sb-jianyuan-auth', JSON.stringify(s)) } catch {} }, mk())
const p = await ctx.newPage()
await p.goto('https://jianyuan.life/checkout?plan=C', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.waitForTimeout(9000)
const skip = await p.$('text=跳過、直接填表')
if (skip) { await skip.click(); await p.waitForTimeout(3500) }
const rows = await p.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, bb] = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb
  }
  const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
  // 修正:父層若用 linear-gradient(backgroundColor 會是 transparent),
  // 取漸層第一個 rgb/rgba 色停當作有效底色——否則會爬過頭拿到頁面底色、誤判。
  const solidBg = (el) => {
    let cur = el
    while (cur) {
      const cs = getComputedStyle(cur)
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
      if (m) {
        const parts = m[1].split(',').map(s => Number(s.trim()))
        const a = parts.length > 3 ? parts[3] : 1
        if (a >= 0.9) return parts.slice(0, 3)
      }
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const g = cs.backgroundImage.match(/rgba?\(([^)]+)\)/)
        if (g) {
          const parts = g[1].split(',').map(s => Number(s.trim()))
          const a = parts.length > 3 ? parts[3] : 1
          if (a >= 0.5) return parts.slice(0, 3)
        }
      }
      cur = cur.parentElement
    }
    return [255, 255, 255]
  }
  const out = []
  document.querySelectorAll('.checkout-shell input:not([type=checkbox]):not([type=radio]), .checkout-shell select, .checkout-shell textarea').forEach(el => {
    const cs = getComputedStyle(el)
    const fg = parse(cs.color)
    const bg = solidBg(el)
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    out.push({ id: el.id || el.tagName.toLowerCase(), color: cs.color, bg: `rgb(${bg.join(',')})`, ratio: Number(ratio.toFixed(2)) })
  })
  return out
})
let bad = 0
for (const r of rows) {
  const ok = r.ratio >= 4.5
  if (!ok) bad++
  console.log(`${ok ? 'V' : 'X'} ${r.id.padEnd(28)} ratio=${r.ratio}  fg=${r.color} bg=${r.bg}`)
}
console.log(bad === 0 ? 'ALL_CONTROLS_PASS_AA' : `${bad}_CONTROLS_BELOW_AA`)
await b.close()
process.exit(bad === 0 ? 0 : 1)
