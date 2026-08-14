import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  currentLocalCalendarDate,
  isConsultationBirthDateInFuture,
} from '../lib/checkout/consultation-input-contract.ts'
import { withClientTimeout } from '../lib/checkout/client-timeout.ts'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const checkoutPage = read('app', 'checkout', 'page.tsx')
const checkoutHook = read('hooks', 'useCheckoutForm.ts')
const purchaseNotice = read('components', 'consultation', 'ConsultationPurchaseNoticeModal.tsx')
const purchaseCopy = read('lib', 'checkout', 'consultation-purchase-notice.ts')
const checkoutTrigger = read('components', 'consultation', 'ConsultationCheckoutTrigger.tsx')
const g15Review = read('components', 'consultation', 'G15FinalReviewModal.tsx')
const confirmation = read('components', 'consultation', 'CFinalReviewModal.tsx')
const coupon = read('components', 'checkout', 'CouponInput.tsx')
const points = read('components', 'checkout', 'PointsRedeem.tsx')
const birthFields = read('components', 'checkout', 'BirthDataFields.tsx')

test('purchase notice displays the canonical one-time USD price without a fixed word-count promise', () => {
  assert.match(purchaseNotice, /PLAN_PRICES/u)
  assert.match(purchaseNotice, /一次性價格/u)
  assert.match(purchaseNotice, /USD \{noticePrice\}/u)
  assert.doesNotMatch(`${purchaseNotice}\n${purchaseCopy}`, /14,?000|固定.{0,8}字|至少.{0,8}字/u)
})

test('client timeout rejects a stalled auth lookup and both consultation auth entry points use it', async () => {
  await assert.rejects(
    withClientTimeout(new Promise(() => {}), 5, '登入狀態確認逾時'),
    /登入狀態確認逾時/u,
  )
  assert.match(checkoutTrigger, /withClientTimeout\([\s\S]*supabase\.auth\.getUser\(\)/u)
  assert.match(checkoutHook, /withClientTimeout\([\s\S]*supabase\.auth\.getUser\(\)/u)
})

test('consultation date boundary follows Hong Kong calendar time and explicitly rejects future dates', () => {
  assert.equal(currentLocalCalendarDate(new Date('2026-08-09T15:59:59.000Z')), '2026-08-09')
  assert.equal(currentLocalCalendarDate(new Date('2026-08-09T16:00:00.000Z')), '2026-08-10')
  assert.equal(isConsultationBirthDateInFuture('2026', '8', '10', '2026-08-09'), true)
  assert.equal(isConsultationBirthDateInFuture('2026', '8', '9', '2026-08-09'), false)
  assert.equal(isConsultationBirthDateInFuture('2026', '2', '30', '2026-08-09'), false)
  assert.match(birthFields, /以香港日期/u)
})

test('G15 independent-consent status is visible and stale authority is cleared on invite-code changes', () => {
  assert.match(checkoutHook, /clearG15ConsentAuthority/u)
  assert.match(checkoutHook, /setG15ConsentSelectionId\(''\)/u)
  assert.match(checkoutHook, /setG15ConsentExpiresAt\(''\)/u)
  assert.match(checkoutHook, /每位成年成員必須提供不同的家族邀請碼/u)
  assert.match(checkoutHook, /家族邀請碼已變更；請重新寄出逐位同意邀請/u)
  assert.match(checkoutHook, /refreshG15ConsentStatus/u)
  assert.match(checkoutHook, /g15ConsentStatusMessage/u)
  assert.match(checkoutPage, /g15ConsentStatusMessage/u)
  assert.match(g15Review, /逐位同意/u)
  assert.doesNotMatch(checkoutPage, /若所選成員包含未成年人/u)
})

test('G15 review stays open while checkout is being created and surfaces retryable errors', () => {
  assert.match(checkoutHook, /if \(planCode !== 'G15'\) setShowConfirmModal\(false\)/u)
  assert.doesNotMatch(checkoutHook, /const confirmCheckout = async \(\) => \{\s*setShowConfirmModal\(false\)/u)
  assert.match(g15Review, /submitError/u)
  assert.match(g15Review, /role="alert"/u)
  assert.match(g15Review, /aria-busy=\{loading\}/u)
})

test('coupon and points Enter actions are guarded against duplicate or stale requests', () => {
  assert.match(checkoutHook, /couponRequestId/u)
  assert.match(checkoutHook, /couponRequestInFlight/u)
  assert.match(coupon, /couponLoading/u)
  assert.match(coupon, /驗證中/u)
  assert.match(points, /pointsRequestInFlight/u)
  assert.match(points, /if \(enforceMutualExclusion && \(validating \|\| !isReady \|\| pointsRequestInFlight\.current\)\)/u)
  assert.match(points, /couponActiveRef/u)
})

test('final confirmation shows original price, every discount, and a truthful zero-dollar path', () => {
  for (const source of [confirmation, g15Review]) {
    assert.match(source, /方案原價/u)
    assert.match(source, /優惠碼折抵/u)
    assert.match(source, /積分折抵/u)
    assert.match(source, /本次實付/u)
  }
  assert.match(confirmation, /本次無須刷卡/u)
  assert.match(g15Review, /本次無須刷卡/u)
  assert.match(g15Review, /couponDiscount/u)
  assert.match(g15Review, /pointsDiscount/u)
})

test('disabled controls explain their state and city Escape dismisses only the result list', () => {
  assert.match(coupon, /aria-busy=\{couponLoading\}/u)
  assert.match(points, /aria-busy=\{enforceMutualExclusion \? validating : undefined\}/u)
  assert.match(points, /已套用優惠碼/u)
  assert.match(birthFields, /onCityResultsDismiss/u)
  assert.doesNotMatch(
    birthFields.match(/case 'Escape':[\s\S]*?break/u)?.[0] || '',
    /onCitySearch\(''\)/u,
  )
  assert.match(checkoutPage, /完成以下項目後即可繼續/u)
  assert.match(checkoutPage, /所有人顯示「已同意」前不會建立付款/u)
  assert.match(checkoutPage, /disabled:cursor-not-allowed/u)
})

test('consultation checkout copy consistently addresses the customer as 您', () => {
  const customerCopy = [purchaseNotice, purchaseCopy, g15Review].join('\n')
  assert.doesNotMatch(customerCopy, /你|妳/u)
  assert.match(customerCopy, /您/u)
})
