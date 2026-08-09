import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { getG15CheckoutBlockers } from '../lib/checkout/g15-readiness.ts'

const root = process.cwd()
const checkoutPage = readFileSync(join(root, 'app', 'checkout', 'page.tsx'), 'utf8')
const checkoutHook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')
const finalReview = readFileSync(join(root, 'components', 'consultation', 'G15FinalReviewModal.tsx'), 'utf8')

test('G15 readiness returns every visible blocker instead of one unexplained disabled state', () => {
  assert.deepEqual(getG15CheckoutBlockers({
    selectedCount: 1,
    relationshipContext: '父子',
    consultationGoals: '',
    consentAccepted: false,
  }), [
    '請至少選擇 2 位家庭成員。',
    '請至少用 8 個字描述成員之間的關係。',
    '請至少用 8 個字描述這次最想理解或改善的事。',
    '請確認已取得每位成員的資料使用同意。',
  ])

  assert.deepEqual(getG15CheckoutBlockers({
    selectedCount: 3,
    relationshipContext: '父母與孩子共同生活，平時由父母共同照顧。',
    consultationGoals: '希望改善家庭會議時互相打斷的狀況。',
    consentAccepted: true,
  }), [])
})

test('G15 submit opens a dedicated final review instead of creating Stripe checkout immediately', () => {
  assert.match(checkoutHook, /if \(planCode === 'G15'\)[\s\S]*setShowConfirmModal\(true\)/u)
  assert.match(checkoutPage, /<G15FinalReviewModal/u)
  assert.match(finalReview, /付款前確認/u)
  assert.match(finalReview, /成員之間的關係/u)
  assert.match(finalReview, /這次最想理解或改善的事/u)
  assert.match(finalReview, /前往 Stripe 安全付款/u)
})

test('G15 search and consent UI describe the actual account boundary and mutually exclusive states', () => {
  assert.match(checkoutHook, /g15SearchAttempted/u)
  assert.match(checkoutHook, /g15SearchRequestId/u)
  assert.match(checkoutPage, /在此帳戶內依姓名篩選/u)
  assert.match(checkoutPage, /此帳戶找不到相符且已完成的人生藍圖/u)
  assert.match(checkoutPage, /g15SearchAttempted/u)
  assert.match(checkoutPage, /查看隱私政策/u)
  assert.doesNotMatch(checkoutPage, /<label[^>]*>[\s\S]*資料處理方式見[\s\S]*<Link href="\/privacy"[\s\S]*<\/label>/u)
})

test('ineligible life-blueprint reports cannot be selected for G15', () => {
  assert.match(checkoutPage, /report\.eligible !== false/u)
  assert.match(checkoutPage, /report\.eligibilityReason/u)
  assert.match(checkoutHook, /if \(report\.eligible === false\) return/u)
})
