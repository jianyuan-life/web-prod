import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  CONSULTATION_PURCHASE_NOTICES,
  CONSULTATION_SERVICE_GUARANTEES,
} from '../lib/checkout/consultation-purchase-notice.ts'

const root = process.cwd()
const pricingButton = readFileSync(join(root, 'components', 'PricingButton.tsx'), 'utf8')
const consultationModal = readFileSync(join(root, 'components', 'consultation', 'ConsultationPurchaseNoticeModal.tsx'), 'utf8')
const consultationModalCss = readFileSync(join(root, 'components', 'consultation', 'ConsultationPurchaseNoticeModal.module.css'), 'utf8')
const legacyModalBytes = readFileSync(join(root, 'components', 'PurchaseNoticeModal.tsx'))

test('C and G15 purchase notices describe the current consultation journey without stale guarantees', () => {
  assert.deepEqual(Object.keys(CONSULTATION_PURCHASE_NOTICES).sort(), ['C', 'G15'])

  const customerCopy = JSON.stringify({
    notices: CONSULTATION_PURCHASE_NOTICES,
    guarantees: CONSULTATION_SERVICE_GUARANTEES,
  })
  for (const banned of ['14,000', '100% 得到相同結果', '精準計算', '一次看清人生全貌', '不支援退款']) {
    assert.equal(customerCopy.includes(banned), false, `consultation notice must not contain: ${banned}`)
  }

  assert.match(customerCopy, /Stripe/u)
  assert.match(customerCopy, /醫療、法律或財務/u)
  assert.match(customerCopy, /重複扣款/u)
  assert.match(customerCopy, /未經授權/u)
  assert.match(customerCopy, /免費重新生成/u)
  assert.doesNotMatch(customerCopy, /若包含未成年人/u)
})

test('consultation modal states the real next step and explains the disabled primary action', () => {
  assert.match(consultationModal, /繼續填寫資料/u)
  assert.match(consultationModal, /勾選確認後/u)
  assert.match(consultationModal, /aria-describedby/u)
  assert.match(consultationModal, /aria-disabled/u)
  assert.match(consultationModal, /event\.key === 'Escape'/u)
  assert.match(consultationModal, /event\.key !== 'Tab'/u)
  assert.match(consultationModalCss, /prefers-reduced-motion:\s*reduce/u)
})

test('PricingButton routes only C and G15 through the shared consultation trigger', () => {
  assert.match(pricingButton, /isConsultationCheckoutPlan\(code\)/u)
  assert.match(pricingButton, /ConsultationCheckoutTrigger/u)
  assert.match(pricingButton, /<PurchaseNoticeModal/u)
})

test('legacy E-series purchase notice remains byte-for-byte unchanged', () => {
  // Hash the LF-canonical bytes (the form git stores) so a CRLF working copy
  // on Windows and an LF checkout on CI both compare against one constant.
  const canonical = legacyModalBytes.toString('utf8').replaceAll('\r\n', '\n')
  assert.equal(
    createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase(),
    '9961240B8019643A3771AEB0564D89ED41F551FCA0512E7E7651D3B3DAE6E450',
  )
})
