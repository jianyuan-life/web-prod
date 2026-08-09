import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { buildCheckoutRoute } from '../lib/consultation/routes.ts'
import {
  CONSULTATION_PRODUCTS,
} from '../components/consultation/marketing/product-data.ts'

const root = process.cwd()
const componentPath = join(
  root,
  'components',
  'consultation',
  'marketing',
  'ConsultationProductPage.tsx',
)
const stylesPath = join(
  root,
  'components',
  'consultation',
  'marketing',
  'ConsultationProductPage.module.css',
)
const lifePagePath = join(root, 'app', 'life-blueprint', 'page.tsx')
const familyPagePath = join(root, 'app', 'family-blueprint', 'page.tsx')

function strings(value) {
  return JSON.stringify(value)
}

function assertCompleteProduct(product, expectedCode) {
  assert.equal(product.code, expectedCode)
  assert.equal(product.currency, 'USD')
  assert.ok(product.title.length >= 4)
  assert.ok(product.description.length >= 40)
  assert.ok(product.forWhom.length >= 3)
  assert.ok(product.deliverables.length >= 6)
  assert.equal(product.process.length, 4)
  assert.ok(product.boundaries.length >= 4)
  assert.ok(product.faqs.length >= 4)
  assert.ok(product.ctaLabel.length >= 4)
  assert.ok(product.checkoutLabel.length >= 4)
}

test('C and G15 product contracts are complete and use the dedicated checkout routes', () => {
  assert.deepEqual(Object.keys(CONSULTATION_PRODUCTS).sort(), ['C', 'G15'])
  assertCompleteProduct(CONSULTATION_PRODUCTS.C, 'C')
  assertCompleteProduct(CONSULTATION_PRODUCTS.G15, 'G15')
  assert.equal(CONSULTATION_PRODUCTS.C.price, 89)
  assert.equal(CONSULTATION_PRODUCTS.G15.price, 59)
  assert.equal(buildCheckoutRoute('C'), '/checkout/life-blueprint')
  assert.equal(buildCheckoutRoute('G15'), '/checkout/family-blueprint')
})

test('public copy states the 14-system method without unsupported efficacy claims', () => {
  const copy = strings(CONSULTATION_PRODUCTS)
  assert.match(copy, /14 套命理系統/)
  for (const banned of ['44,421', '95%', '大家都說', '保證一定改運', '一定可以改運']) {
    assert.equal(copy.includes(banned), false, `copy must not contain ${banned}`)
  }
})

test('C is framed as a layered life consultation rather than a prediction dump', () => {
  const product = CONSULTATION_PRODUCTS.C
  const copy = strings(product)
  assert.match(copy, /30 秒/)
  assert.match(copy, /3 分鐘/)
  assert.match(copy, /深入閱讀/)
  assert.match(copy, /依據附錄/)
  assert.match(copy, /90 天/)
  assert.match(copy, /人生階段/)
})

test('G15 requires 2–8 completed C reports and protects family roles', () => {
  const product = CONSULTATION_PRODUCTS.G15
  const copy = strings(product)
  assert.match(copy, /2–8 份/)
  assert.match(copy, /已完成/)
  assert.match(copy, /人生藍圖/)
  assert.match(copy, /不會依性別或排序指定父母角色/)
  assert.match(copy, /監護人/)
})

test('both products disclose reflective scope and professional-service boundaries', () => {
  for (const product of Object.values(CONSULTATION_PRODUCTS)) {
    const copy = strings(product)
    assert.match(copy, /反思/)
    assert.match(copy, /不保證/)
    assert.match(copy, /醫療/)
    assert.match(copy, /法律/)
    assert.match(copy, /財務/)
    assert.match(copy, /心理健康/)
  }
})

test('server-rendered component preserves semantic and structured-data essentials without nesting main landmarks', () => {
  const source = readFileSync(componentPath, 'utf8')
  assert.equal(source.includes("'use client'"), false)
  assert.match(source, /buildCheckoutRoute/)
  assert.match(source, /<article\s+id="consultation-main"/)
  assert.equal(/<main(?:\s|>)/.test(source), false)
  assert.match(source, /<h1/)
  assert.match(source, /<details/)
  assert.match(source, /aria-label=/)
  assert.match(source, /application\/ld\+json/)
  assert.match(source, /skipLink/)
})

test('motion is restrained, content remains visible, and reduced motion is supported', () => {
  const css = readFileSync(stylesPath, 'utf8')
  assert.match(css, /--motion-quick:\s*160ms/)
  assert.match(css, /--motion-base:\s*240ms/)
  assert.match(css, /--motion-slow:\s*320ms/)
  assert.equal(/opacity:\s*0(?:[;\s]|$)/.test(css), false)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.doesNotMatch(css, /transition-duration:\s*0\.01ms/)
  assert.match(css, /transition:\s*none\s*!important/)
  assert.match(css, /focus-visible/)
  assert.match(
    css,
    /\.root\s+:is\(a, summary\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--vermilion\)\s*!important/s,
    '淺色諮詢頁的朱砂焦點環必須覆蓋全域金色 !important 規則',
  )
  assert.match(css, /@media\s*\(max-width:/)
})

test('single-column hero permits grid children to shrink inside a 390px viewport', () => {
  const css = readFileSync(stylesPath, 'utf8')
  assert.match(css, /\.heroCopy,\s*\n?\.dossier\s*\{[^}]*min-width:\s*0/s)
  assert.match(css, /\.dossier\s*\{[^}]*max-width:\s*100%/s)
  assert.match(
    css,
    /\.sectionHeading\s*>\s*\*,\s*\.boundarySection\s*>\s*\*,\s*\.finalCta\s*>\s*\*\s*\{[^}]*min-width:\s*0/s,
  )
  assert.ok((css.match(/grid-template-columns:\s*minmax\(0,\s*1fr\)/g) || []).length >= 3)
})

test('each route exports distinct SEO metadata and canonical URLs', () => {
  const lifePage = readFileSync(lifePagePath, 'utf8')
  const familyPage = readFileSync(familyPagePath, 'utf8')
  for (const source of [lifePage, familyPage]) {
    assert.match(source, /export const metadata: Metadata/)
    assert.match(source, /openGraph:/)
    assert.match(source, /twitter:/)
    assert.match(source, /robots:/)
  }
  assert.match(lifePage, /https:\/\/jianyuan\.life\/life-blueprint/)
  assert.match(familyPage, /https:\/\/jianyuan\.life\/family-blueprint/)
})

test('new marketing surface contains no sample identity or E3 implementation reference', () => {
  const sources = [
    strings(CONSULTATION_PRODUCTS),
    readFileSync(componentPath, 'utf8'),
    readFileSync(lifePagePath, 'utf8'),
    readFileSync(familyPagePath, 'utf8'),
  ].join('\n')
  for (const forbidden of ['何宣逸', '何紀萳', '何宥諄', "planCode: 'E3'", '月度精選']) {
    assert.equal(sources.includes(forbidden), false, `surface must not contain ${forbidden}`)
  }
})
