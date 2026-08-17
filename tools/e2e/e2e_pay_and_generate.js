// E2E:production 完成一筆 Stripe 測試付款、觸發真實報告生成
// email 用 cbe566+paytest0814@gmail.com(老闆信箱別名、完成信可收到)
const { chromium } = require('D:/npm-global/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const OUT = __dirname
const REF = 'jvmnntavizbjsgofnusy'
const EMAIL = 'cbe566+paytest0814@gmail.com'
const log = []
function note(m) { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l) }
async function shot(p, n) { try { await p.screenshot({ path: path.join(OUT, `pay_${n}.png`) }) } catch {} }
function save() { fs.writeFileSync(path.join(OUT, 'pay_log.txt'), log.join('\n'), 'utf8') }

const FAKE_USER = {
  id: '00000000-0000-4000-8000-00000000e2e1', aud: 'authenticated', role: 'authenticated',
  email: EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: '付款測試' }, identities: [],
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
}
function makeSession() {
  return {
    access_token: 'e2e-fake-access-token', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'e2e-fake-refresh', user: FAKE_USER,
  }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  })
  await ctx.route(`https://${REF}.supabase.co/auth/v1/user**`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) }))
  await ctx.route(`https://${REF}.supabase.co/auth/v1/token**`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeSession()) }))
  await ctx.addInitScript((sess) => { try { window.localStorage.setItem('sb-jianyuan-auth', JSON.stringify(sess)) } catch {} }, makeSession())

  const page = await ctx.newPage()
  page.on('response', async r => {
    if (r.url().includes('/api/checkout') && r.request().method() === 'POST') {
      let b = ''; try { b = (await r.text()).slice(0, 300) } catch {}
      note(`checkout RESP ${r.status()} :: ${b}`)
    }
  })

  note('STEP 1: goto /checkout?plan=C (站內 /life-blueprint 的第一級入口)')
  await page.goto('https://jianyuan.life/checkout?plan=C', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)

  // 問診卡:選面向後完成
  for (let i = 0; i < 6; i++) {
    if (await page.$('#checkout-name')) break
    const topic = await page.$('button:has-text("事業方向")')
    if (topic && await topic.isVisible().catch(() => false)) { await topic.click(); await page.waitForTimeout(1800); continue }
    const done = await page.$('button:has-text("完成、開始填寫出生資料")') || await page.$('button:has-text("跳過、直接填表")')
    if (done && await done.isVisible().catch(() => false)) { await done.click(); await page.waitForTimeout(1800); continue }
    await page.waitForTimeout(1500)
  }
  const nameInput = await page.$('#checkout-name')
  if (!nameInput) { note('NO FORM'); await shot(page, 'noform'); save(); await browser.close(); process.exit(1) }

  note('STEP 2: fill form')
  await nameInput.fill('陳建宏')
  await page.fill('#checkout-birth-year', '1990')
  await page.selectOption('#checkout-birth-month', '6')
  await page.selectOption('#checkout-birth-day', '15')
  await page.check('input[name="gender"][value="M"]')
  await page.evaluate(() => { const r = document.querySelector('input[name="marital_status"]'); if (r) r.click() })
  const hourSel = await page.$('select[id$="-hour"]')
  if (hourSel) {
    await hourSel.selectOption('10').catch(() => {})
    const minSel = await page.$('select[id$="-minute"]')
    if (minSel) await minSel.selectOption('30').catch(() => {})
  }
  await page.fill('#checkout-birth-city', '台北')
  await page.waitForTimeout(2500)
  const cityPicked = await page.evaluate(() => {
    const cityInput = document.querySelector('#checkout-birth-city')
    const container = cityInput ? cityInput.closest('div.relative') || cityInput.parentElement : null
    if (!container) return 'no-container'
    for (const it of container.querySelectorAll('li, [role="option"], button, div[class*="cursor-pointer"]')) {
      const t = (it.innerText || '').trim()
      if (t && (t.includes('台北') || t.includes('臺北'))) { it.click(); return 'clicked: ' + t.slice(0, 40) }
    }
    return 'no-item'
  })
  note('city: ' + cityPicked)
  await page.waitForTimeout(1200)

  note('STEP 3: submit → confirm → Stripe')
  await page.click('button:has-text("檢查資料並付款")')
  await page.waitForTimeout(2500)
  for (const t of ['確認無誤，前往 Stripe', '確認無誤', '確認']) {
    const b = await page.$(`button:has-text("${t}")`)
    if (b && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break }
  }
  // 等 Stripe 頁
  try { await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 }) } catch {}
  note('URL: ' + page.url())
  if (!page.url().includes('checkout.stripe.com')) { note('DID NOT REACH STRIPE'); await shot(page, 'nostripe'); save(); await browser.close(); process.exit(1) }
  await page.waitForTimeout(6000)
  await shot(page, 'stripe')

  note('STEP 4: fill Stripe test card')
  // Stripe hosted checkout:email 已預填;卡號欄位在主頁 DOM(非 iframe、hosted 版)
  const typeIfPresent = async (sel, val) => {
    const el = await page.$(sel)
    if (el) { await el.fill(val).catch(async () => { await el.type(val, { delay: 30 }).catch(() => {}) }); return true }
    return false
  }
  await typeIfPresent('#email', EMAIL)
  const cardOk = await typeIfPresent('#cardNumber', '4242424242424242')
  await typeIfPresent('#cardExpiry', '12 / 34')
  await typeIfPresent('#cardCvc', '123')
  await typeIfPresent('#billingName', 'PAY TEST')
  // 國家選台灣(若有)
  const country = await page.$('#billingCountry')
  if (country) { await country.selectOption('TW').catch(() => {}) }
  if (!cardOk) {
    // fallback:iframe 版
    note('hosted fields not found, trying iframes')
    for (const f of page.frames()) {
      const cn = await f.$('input[name="cardnumber"], #cardNumber').catch(() => null)
      if (cn) { await cn.type('4242424242424242', { delay: 30 }); note('card via frame') }
      const exp = await f.$('input[name="exp-date"], #cardExpiry').catch(() => null)
      if (exp) await exp.type('1234', { delay: 30 })
      const cvc = await f.$('input[name="cvc"], #cardCvc').catch(() => null)
      if (cvc) await cvc.type('123', { delay: 30 })
    }
  }
  await shot(page, 'stripe_filled')
  const payBtn = await page.$('button[type="submit"], .SubmitButton')
  if (!payBtn) { note('NO STRIPE SUBMIT'); save(); await browser.close(); process.exit(1) }
  note('STEP 5: submit payment')
  await payBtn.click()
  // 等回跳 dashboard
  try { await page.waitForURL(/jianyuan\.life\/dashboard/, { timeout: 60000 }) } catch {}
  await page.waitForTimeout(5000)
  note('FINAL URL: ' + page.url())
  await shot(page, 'after_payment')
  const bodyTxt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
  note('PAGE: ' + bodyTxt)
  save()
  await browser.close()
  note('DONE')
})().catch(e => { note('FATAL: ' + e.stack); save(); process.exit(1) })
