import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('legacy purchase modal remains byte-frozen but no sellable C or G15 entry can reach it', () => {
  const legacyModal = read('components', 'PurchaseNoticeModal.tsx')
  const pricingButton = read('components', 'PricingButton.tsx')
  assert.match(legacyModal, /title:\s*'人生藍圖須知'/u)
  assert.match(legacyModal, /title:\s*'家族藍圖須知'/u)
  assert.match(pricingButton, /if \(consultationPlan\)[\s\S]{0,500}<ConsultationCheckoutTrigger/u)
  assert.match(pricingButton, /planCode=\{code as 'E1' \| 'E2' \| 'E3' \| 'E4' \| 'D' \| 'R'\}/u)
})

test('all visible C and G15 pricing cards avoid unsupported fixed-duration deliverables', () => {
  const pricingCards = read('components', 'PricingCards.tsx')
  const consultationCards = pricingCards.slice(0, pricingCards.indexOf("code: 'E3'"))
  for (const unsupported of ['90 天', '家庭會議與', '修復對話']) {
    assert.equal(consultationCards.includes(unsupported), false, `pricing card must not promise: ${unsupported}`)
  }
  assert.match(consultationCards, /分階段行動/u)
  assert.match(consultationCards, /家庭溝通模式/u)
})

test('C and G15 use the dedicated consultation notice at every sellable entry point', () => {
  for (const file of [
    ['components', 'PricingButton.tsx'],
    ['components', 'PricingCards.tsx'],
    ['components', 'consultation', 'marketing', 'ConsultationProductPage.tsx'],
  ]) {
    const source = read(...file)
    assert.match(source, /ConsultationCheckoutTrigger/u, `${file.join('/')} must use consultation trigger`)
  }
})
