import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()
const home = readFileSync(join(root, 'app', 'page.tsx'), 'utf8')
const pricing = readFileSync(join(root, 'app', 'pricing', 'page.tsx'), 'utf8')
const pricingCards = readFileSync(join(root, 'components', 'PricingCards.tsx'), 'utf8')
const presentation = readFileSync(join(root, 'app', 'presentation.css'), 'utf8')

function loadPublicSitemap() {
  const source = readFileSync(join(root, 'app', 'sitemap.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const sitemapModule = { exports: {} }
  vm.runInNewContext(compiled, {
    exports: sitemapModule.exports,
    module: sitemapModule,
    require(specifier) {
      assert.equal(specifier, '@/lib/blog')
      return { BLOG_POSTS: [] }
    },
  })
  return sitemapModule.exports.default()
}

test('homepage removes unverified scale and obsolete entry-price claims', () => {
  for (const banned of ['44,421', 'US$29', '精準分析', '保證改運', '一定改運']) {
    assert.equal(home.includes(banned), false, `homepage must not contain ${banned}`)
  }
})

test('homepage leads with C and G15 consultation outcomes and deep product routes', () => {
  assert.match(home, /<h1[^>]*>[\s\S]*人生[\s\S]*家人[\s\S]*<\/h1>/)
  assert.match(home, /href="\/life-blueprint"/)
  assert.match(home, /href="\/family-blueprint"/)
  assert.match(home, /人生諮詢/)
  assert.match(home, /家庭諮詢/)
  assert.match(home, /不把未知寫成確定/)
})

test('homepage systems navigation lands on method content instead of the C/G15 dossier cards', () => {
  assert.match(home, /<section id="systems"[^>]*>[\s\S]*?分析方法[\s\S]*?可重播的計算/)
  assert.match(home, /<section id="consultation-paths"[^>]*aria-labelledby="consultation-paths-title"/)
  assert.equal((home.match(/id="systems"/g) || []).length, 1)
})

test('homepage explains the four reading layers and professional boundaries', () => {
  for (const phrase of ['30 秒', '3 分鐘', '深入閱讀', '依據附錄']) {
    assert.match(home, new RegExp(phrase))
  }
  for (const boundary of ['醫療', '法律', '財務', '心理健康']) {
    assert.match(home, new RegExp(boundary))
  }
})

test('pricing gives C and G15 a full-brief route without adding one to E3', () => {
  assert.match(pricing, /detailHref:\s*'\/life-blueprint'/)
  assert.match(pricing, /detailHref:\s*'\/family-blueprint'/)
  assert.match(pricing, /plan\.detailHref\s*&&/)
  assert.match(pricing, /先看完整交付內容/)
  assert.doesNotMatch(pricing, /code:\s*'E3'[\s\S]{0,500}detailHref:/)
})

test('public sitemap publishes both C and G15 product pages as current commercial routes', () => {
  const entriesByUrl = new Map(loadPublicSitemap().map((entry) => [entry.url, entry]))

  for (const url of [
    'https://jianyuan.life/life-blueprint',
    'https://jianyuan.life/family-blueprint',
  ]) {
    const entry = entriesByUrl.get(url)
    assert.ok(entry, `${url} must be present in the public sitemap`)
    assert.equal(entry.changeFrequency, 'weekly')
    assert.equal(entry.priority, 0.9)
    assert.equal(Object.prototype.toString.call(entry.lastModified), '[object Date]')
    assert.equal(Number.isNaN(entry.lastModified.getTime()), false)
  }
})

test('E3 home-card source remains byte-for-byte in its protected content contract', () => {
  const expected = [
    "code: 'E3'",
    "name: '月度精選'",
    "price: 89",
    "eyebrow: '每月行動時機'",
    "forWhom: '適合拿到方向後，需要每月具體行動時窗的人'",
    "desc: '古法奇門遁甲嚴剔 32 凶煞、25 吉法則加權，依你選定的主題嚴選最多 8 個高純度吉時與方位。'",
    "delivery: '吉時清單 + 方位 + 行事曆邀約'",
    "eta: '預計 40 分鐘以上'",
  ]
  for (const fragment of expected) assert.ok(pricingCards.includes(fragment), fragment)
})

test('E3 pricing-card source remains on the legacy card path and action', () => {
  const expected = [
    "{ code: 'E3', name: '月度精選', price: 89, popular: true",
    "E3: { delivery: '最多 8 個吉時、主題用神與行事曆邀約', eta: '通常需 40 分鐘以上' }",
  ]
  for (const fragment of expected) assert.ok(pricing.includes(fragment), fragment)
  assert.match(pricing, /<PricingButton\s+code=\{plan\.code\}/)
})

test('new home and pricing styles are explicitly scoped and accessible', () => {
  assert.match(presentation, /\.jy-home-page\s+\.jy-home-consultation/)
  assert.match(presentation, /\.jy-pricing-page\s+\.jy-pricing-plan__detail/)
  assert.match(presentation, /\.jy-home-page[^}]*:focus-visible|\.jy-home-consultation[^}]*:focus-visible/s)
  assert.match(presentation, /prefers-reduced-motion:\s*reduce/)
  assert.match(presentation, /@media\s*\(max-width:\s*640px\)/)
})
