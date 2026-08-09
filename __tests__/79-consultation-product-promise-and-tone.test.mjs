import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { CONSULTATION_PRODUCTS } from '../components/consultation/marketing/product-data.ts'
import { CONSULTATION_PURCHASE_NOTICES } from '../lib/checkout/consultation-purchase-notice.ts'

const root = process.cwd()
const productPage = readFileSync(join(root, 'components', 'consultation', 'marketing', 'ConsultationProductPage.tsx'), 'utf8')
const finalReviewCss = readFileSync(join(root, 'components', 'consultation', 'G15FinalReviewModal.module.css'), 'utf8')

test('C and G15 only promise structures delivered by the current report path', () => {
  const copy = JSON.stringify(CONSULTATION_PRODUCTS)
  for (const unsupported of [
    '30 秒',
    '3 分鐘',
    '90 天',
    '雙人互動地圖',
    '家庭會議與對話腳本',
  ]) {
    assert.equal(copy.includes(unsupported), false, `current product copy must not promise: ${unsupported}`)
  }
  assert.match(copy, /分階段行動/u)
  assert.match(copy, /排盤速覽/u)
  assert.match(copy, /家庭溝通模式/u)
})

test('consultation-facing product language is plain Traditional Chinese', () => {
  const copy = `${JSON.stringify(CONSULTATION_PRODUCTS)}\n${productPage}`
  for (const internalTerm of [
    '卷宗',
    '戰犯',
    'CONSULTATION DOSSIER',
    'READY WHEN YOU ARE',
  ]) {
    assert.equal(copy.includes(internalTerm), false, `customer UI must not contain: ${internalTerm}`)
  }
  assert.match(copy, /個人報告/u)
  assert.match(copy, /家庭報告/u)
})

test('minor availability is consistent before purchase and in G15 notice', () => {
  const familyFaq = CONSULTATION_PRODUCTS.G15.faqs.find((faq) => faq.question === '小孩可以納入嗎？')
  assert.ok(familyFaq)
  assert.match(familyFaq.answer, /目前不開放/u)
  assert.match(familyFaq.answer, /未成年人/u)
  assert.doesNotMatch(
    CONSULTATION_PURCHASE_NOTICES.G15.beforeContinuing.join('\n'),
    /若包含未成年人/u,
  )
})

test('G15 final review follows the site data-theme contract', () => {
  assert.match(finalReviewCss, /:global\(\[data-theme="dark"\]\)/u)
  assert.doesNotMatch(finalReviewCss, /:global\(\.dark\)/u)
})
