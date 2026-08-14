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
    allMembersAccepted: false,
  }), [
    '請至少選擇 2 位家庭成員。',
    '請至少用 8 個字描述成員之間的關係。',
    '請至少用 8 個字描述這次最想理解或改善的事。',
    '請寄出逐位同意邀請，並等待每位成年成員完成同意。',
  ])

  assert.deepEqual(getG15CheckoutBlockers({
    selectedCount: 3,
    relationshipContext: '父母與孩子共同生活，平時由父母共同照顧。',
    consultationGoals: '希望改善家庭會議時互相打斷的狀況。',
    allMembersAccepted: true,
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

test('G15 invite-code and consent UI describe the independent-owner boundary and mutually exclusive states', () => {
  assert.match(checkoutHook, /g15ConsentAccessInputs/u)
  assert.match(checkoutHook, /reportLocator/u)
  assert.match(checkoutPage, /家族邀請碼/u)
  assert.match(checkoutPage, /邀請碼不會開啟報告內容/u)
  assert.match(checkoutPage, /不同擁有者/u)
  assert.match(checkoutPage, /查看隱私政策/u)
  assert.match(checkoutPage, /待同意/u)
  assert.match(checkoutPage, /已同意/u)
  assert.match(checkoutHook, /\/api\/g15-consents/u)
  assert.match(checkoutHook, /consent_selection_id/u)
  assert.doesNotMatch(checkoutPage, /type="checkbox"[\s\S]{0,500}g15-consent/u)
  assert.doesNotMatch(checkoutHook, /consent_attestation/u)
  assert.doesNotMatch(checkoutPage, /<label[^>]*>[\s\S]*資料處理方式見[\s\S]*<Link href="\/privacy"[\s\S]*<\/label>/u)
})

test('G15 members stay opaque until every owner has accepted', () => {
  assert.match(checkoutHook, /acceptedWithTrustedIdentity/u)
  assert.match(checkoutHook, /setG15Selected\(\[\]\)/u)
  assert.match(checkoutPage, /所有人同意前.*看不到成員姓名或報告資料/u)
  assert.doesNotMatch(checkoutPage, /updateG15ConsentEmail/u)
})
