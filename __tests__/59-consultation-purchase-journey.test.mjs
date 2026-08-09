import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const trigger = read('components', 'consultation', 'ConsultationCheckoutTrigger.tsx')
const pricingButton = read('components', 'PricingButton.tsx')
const pricingCards = read('components', 'PricingCards.tsx')
const productPage = read('components', 'consultation', 'marketing', 'ConsultationProductPage.tsx')
const loginPage = read('app', 'auth', 'login', 'page.tsx')
const signupPage = read('app', 'auth', 'signup', 'page.tsx')
const pricingPage = read('app', 'pricing', 'page.tsx')

test('C/G15 consultation trigger always shows the notice before auth or checkout navigation', () => {
  assert.match(trigger, /setShowNotice\(true\)/u)
  assert.match(trigger, /ConsultationPurchaseNoticeModal/u)
  assert.match(trigger, /supabase\.auth\.getUser\(\)/u)
  assert.match(trigger, /\/auth\/login\?redirect=/u)
  assert.match(trigger, /encodeURIComponent\(checkoutRoute\)/u)
  assert.match(trigger, /buildCheckoutRoute\(planCode\)/u)
})

test('all public C/G15 entry surfaces use the same notice trigger while E3 stays on its legacy link/button', () => {
  assert.match(pricingButton, /<ConsultationCheckoutTrigger/u)
  assert.match(pricingButton, /<PurchaseNoticeModal/u)
  assert.match(pricingCards, /plan\.code === 'C' \|\| plan\.code === 'G15'/u)
  assert.match(pricingCards, /<ConsultationCheckoutTrigger/u)
  assert.match(pricingCards, /<Link href=\{`\/checkout\?plan=\$\{plan\.code\}`\}/u)
  assert.equal((productPage.match(/<ConsultationCheckoutTrigger/g) || []).length, 2)
})

test('login and signup preserve the validated consultation return route', () => {
  assert.match(loginPage, /signupHref/u)
  assert.match(loginPage, /encodeURIComponent\(safeRedirect\)/u)
  assert.match(signupPage, /getSafeRedirect/u)
  assert.match(signupPage, /auth\/callback\?redirect=/u)
  assert.match(signupPage, /encodeURIComponent\(safeRedirect\)/u)
})

test('C/G15 public copy no longer promises unsupported family forecasting or stale mystical deliverables', () => {
  const cGCopy = `${pricingCards}\n${pricingPage}`
  for (const banned of ['未來五年戰略推演', '共同運勢', '家族能量圖譜', '家運走勢', '整體能量解讀']) {
    assert.equal(cGCopy.includes(banned), false, `remove stale C/G15 claim: ${banned}`)
  }
  assert.doesNotMatch(pricingPage, /大運流年走勢[^\n]+g: '&#10003;'/u)
})
