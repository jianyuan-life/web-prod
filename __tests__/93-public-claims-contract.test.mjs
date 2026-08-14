import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { translateToEn } from '../lib/i18n-en.ts'
import { PUBLIC_CLAIMS } from '../lib/public-claims.ts'
import { buildFreeToolJsonLd } from '../lib/seo/free-tool-schema.ts'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const withoutDeferredE3Faq = (source) => source
  .replace(/\{\s*q: '奇門遁甲用的是什麼派別\?'[\s\S]*?\n\s*\},\s*\n\s*\],/u, '],')
  .replace(/\{\s*title: '出門訣專屬'[\s\S]*?\n\s*\},\s*\n\s*\]/u, ']')

test('public-facing methodology copy has one typed conservative source', () => {
  const source = read('lib', 'public-claims.ts')

  assert.match(source, /export interface PublicClaims/u)
  assert.match(source, /export const PUBLIC_CLAIMS[\s\S]+satisfies PublicClaims/u)
  assert.match(source, /依方案與資料完整度計算可用項目/u)
  assert.match(source, /屬於傳統詮釋，不是實證預測/u)
})

test('brand, about and FAQ reuse the conservative methodology source', () => {
  const surfaces = [
    ['lib', 'brand.ts'],
    ['app', 'about', 'page.tsx'],
    ['app', 'faq', 'page.tsx'],
  ]
  const forbidden = [
    '44,421',
    '十四套系統交叉驗證',
    '14 套系統交叉驗證',
    '14 套東西方系統的共識',
    '權威典籍',
    '更可靠的結論',
  ]

  for (const path of surfaces) {
    const originalSource = read(...path)
    const source = path.join('/') === 'app/faq/page.tsx'
      ? withoutDeferredE3Faq(originalSource)
      : originalSource
    assert.match(source, /PUBLIC_CLAIMS\.methodology/u, `${path.join('/')} must use the public claims SSOT`)
    for (const phrase of forbidden) {
      assert.equal(source.includes(phrase), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('the former whitepaper is a methods-and-limits page without an unaudited PDF offer', () => {
  const source = read('app', 'whitepaper', 'page.tsx')
  const claims = read('lib', 'public-claims.ts')

  assert.match(source, /PUBLIC_CLAIMS\.whitepaper/u)
  assert.match(claims, /title: '排盤方法與資料限制說明'/u)
  assert.equal(source.includes('/whitepaper_v1.pdf'), false)
  assert.equal(source.includes('KEY_METRICS'), false)

  for (const phrase of ['44,421', '102,998', '97.2%', '工業級', '所有數字、案例、引用皆可追溯']) {
    assert.equal(source.includes(phrase), false, `whitepaper page must not publish: ${phrase}`)
  }
})

test('privacy copy states actual analytics use and conditional legal rights without unsupported promises', () => {
  const source = read('app', 'privacy', 'page.tsx')
  const claims = read('lib', 'public-claims.ts')

  assert.match(source, /PUBLIC_CLAIMS\.privacy/u)
  assert.match(claims, /在一個月內回覆/u)
  assert.match(claims, /再延長最多兩個月/u)
  assert.match(claims, /第一個月內告知延長與理由/u)
  assert.match(claims, /若 CCPA \/ CPRA 適用/u)
  assert.match(claims, /頁面瀏覽及部分工具完成事件/u)

  for (const phrase of [
    'TLS 1.3',
    'AES-256',
    '定期安全審計',
    'Standard Contractual Clauses',
    'DPO',
    'JSON 格式',
    '所有相關資料',
    '符合 GDPR',
  ]) {
    assert.equal(source.includes(phrase), false, `privacy page must not promise: ${phrase}`)
  }
})

test('free tools disclose input, school and character limits plus consented analytics use', () => {
  const layouts = [
    ['app', 'tools', 'name', 'layout.tsx'],
    ['app', 'tools', 'qimen', 'layout.tsx'],
    ['app', 'tools', 'bazi', 'layout.tsx'],
  ]
  const pages = [
    ['app', 'tools', 'name', 'page.tsx'],
    ['app', 'tools', 'qimen', 'page.tsx'],
    ['app', 'tools', 'bazi', 'page.tsx'],
    ['app', 'tools', 'ziwei', 'page.tsx'],
  ]
  const forbidden = [
    '102,998',
    '準確無誤',
    '最精密',
    '最為精密',
    '最廣泛使用',
    '完全正確',
    '交叉驗證精準',
    '精準計算天地人外總五格',
    '康熙筆畫精準',
    '精準計算四柱',
    '確保命盤排列的準確性',
    '精確度約 95%',
  ]

  for (const path of layouts) {
    const source = read(...path)
    assert.match(source, /PUBLIC_CLAIMS\.tools/u, `${path.join('/')} must use tool-limit metadata`)
  }
  for (const path of pages) {
    const source = read(...path)
    assert.match(source, /PUBLIC_CLAIMS\.tools/u, `${path.join('/')} must show tool limits`)
    assert.match(source, /PUBLIC_CLAIMS\.privacy\.freeToolAnalytics/u, `${path.join('/')} must disclose analytics use`)
  }

  for (const path of [...layouts, ...pages]) {
    const source = read(...path)
    for (const phrase of forbidden) {
      assert.equal(source.includes(phrase), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('only the audited public-claims surfaces are free of the retired claims', () => {
  const surfaces = [
    ['lib', 'public-claims.ts'],
    ['lib', 'brand.ts'],
    ['app', 'about', 'page.tsx'],
    ['app', 'faq', 'page.tsx'],
    ['app', 'whitepaper', 'page.tsx'],
    ['app', 'privacy', 'page.tsx'],
    ['app', 'tools', 'name', 'layout.tsx'],
    ['app', 'tools', 'name', 'page.tsx'],
    ['app', 'tools', 'qimen', 'layout.tsx'],
    ['app', 'tools', 'qimen', 'page.tsx'],
    ['app', 'tools', 'bazi', 'layout.tsx'],
    ['app', 'tools', 'bazi', 'page.tsx'],
    ['app', 'tools', 'ziwei', 'page.tsx'],
  ]
  const forbidden = [
    '44,421',
    '102,998',
    '排盤 100%',
    '一致率 100%',
    '97.2%',
    '99.5 分',
    '工業級排盤',
    '完全正確',
    '準確無誤',
    '14 套命理系統運算',
    '14 系統個人化深度分析',
    'TLS 1.3',
    'AES-256',
    '定期安全審計',
    '符合 GDPR',
    '依 GDPR / CCPA 標準',
  ]

  for (const path of surfaces) {
    const originalSource = read(...path)
    const source = path.join('/') === 'app/faq/page.tsx'
      ? withoutDeferredE3Faq(originalSource)
      : originalSource
    for (const phrase of forbidden) {
      assert.equal(source.includes(phrase), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('global metadata, JSON-LD and terms use the public claims source without unsupported accuracy claims', () => {
  const surfaces = [
    ['app', 'layout.tsx'],
    ['app', 'terms', 'page.tsx'],
  ]
  const forbidden = [
    '44,421',
    '精準',
    '精准',
    '精密計算',
    '精密计算',
    '交叉驗證',
    '交叉验证',
    'cross-validation',
    'cross-validated',
    '100%準確',
    '100%准确',
  ]

  const layout = read(...surfaces[0])
  const terms = read(...surfaces[1])
  const claims = read('lib', 'public-claims.ts')

  assert.match(layout, /PUBLIC_CLAIMS\.site/u, 'root metadata and JSON-LD must use the public claims SSOT')
  assert.match(terms, /PUBLIC_CLAIMS\.terms/u, 'terms must use the public claims SSOT')
  assert.match(claims, /傳統詮釋/u)
  assert.match(claims, /自我反思/u)

  for (const path of surfaces) {
    const source = read(...path)
    for (const phrase of forbidden) {
      assert.equal(source.toLowerCase().includes(phrase.toLowerCase()), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('localized homepage and brand copy frame the service as traditional reflection, not validated prediction', () => {
  const surfaces = [
    ['lib', 'i18n.ts'],
    ['lib', 'brand.ts'],
  ]
  const forbidden = [
    '44,421',
    '十四套系統交叉驗證',
    '十四套系统交叉验证',
    'fourteen systems cross-validated',
    '數萬條專業規則',
    '数万条专业规则',
    'tens of thousands of professional rules',
    '精準',
    '精准',
    '精確排盤',
    '精确排盘',
    'precise chart',
    '經得起驗證',
    '经得起验证',
    'you can verify',
  ]

  const i18n = read(...surfaces[0])
  assert.match(i18n, /PUBLIC_CLAIMS\.home/u, 'localized homepage copy must use the public claims SSOT')

  for (const path of surfaces) {
    const source = read(...path).toLowerCase()
    for (const phrase of forbidden) {
      assert.equal(source.includes(phrase.toLowerCase()), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('generated social cards reuse conservative public copy instead of unsupported proof signals', () => {
  const surfaces = [
    ['app', 'opengraph-image.tsx'],
    ['app', 'pricing', 'opengraph-image.tsx'],
  ]
  const forbidden = [
    '44,421',
    '精準',
    '精准',
    '交叉驗證',
    '交叉验证',
    '14 套系統交叉',
    '14 套系统交叉',
    'cross-validation',
    'cross-validated',
  ]

  for (const path of surfaces) {
    const source = read(...path)
    assert.match(source, /PUBLIC_CLAIMS\.social/u, `${path.join('/')} must use social claims SSOT`)
    for (const phrase of forbidden) {
      assert.equal(source.toLowerCase().includes(phrase.toLowerCase()), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('trust and FAQ surfaces do not turn traditional comparisons or security controls into proof claims', () => {
  const surfaces = [
    ['components', 'TrustBar.tsx'],
    ['app', 'faq', 'page.tsx'],
  ]
  const forbidden = [
    '交叉驗證',
    '交叉验证',
    '精密計算',
    '精密计算',
    'TLS 1.3',
    'AES-256',
    '符合 GDPR',
    'cross-validation',
    'cross-validated',
  ]

  for (const path of surfaces) {
    const source = read(...path)
    assert.match(source, /PUBLIC_CLAIMS/u, `${path.join('/')} must use the public claims SSOT`)
    for (const phrase of forbidden) {
      assert.equal(source.toLowerCase().includes(phrase.toLowerCase()), false, `${path.join('/')} must not publish: ${phrase}`)
    }
  }
})

test('blog comparison and CTA do not rank traditional frameworks by unsupported accuracy', () => {
  const blog = read('lib', 'blog.ts')
  const firstPost = blog.slice(0, blog.indexOf("slug: 'ziwei-doushu-tutorial'"))
  const articlePage = read('app', 'blog', '[slug]', 'page.tsx')

  assert.match(blog, /PUBLIC_CLAIMS\.blog\.comparisonTable/u)
  assert.match(articlePage, /PUBLIC_CLAIMS\.blog\.cta/u)
  for (const phrase of [
    '| 分析方式 | 精確度 |',
    '| **14 系統交叉驗證** | **最高** |',
    '鑒源獨家：八字+紫微+奇門遁甲等 14 套系統交叉比對',
  ]) {
    assert.equal(firstPost.includes(phrase), false, `blog comparison must not publish: ${phrase}`)
  }
  assert.equal(articlePage.includes('人生藍圖用 14 套系統交叉驗證'), false)
})

test('English locale translates conservative public claims without reintroducing validation language', () => {
  const translated = [
    PUBLIC_CLAIMS.methodology.summary,
    PUBLIC_CLAIMS.methodology.comparison,
    PUBLIC_CLAIMS.methodology.limits,
    PUBLIC_CLAIMS.terms.service,
    PUBLIC_CLAIMS.terms.limits,
    PUBLIC_CLAIMS.trust.comparisonTooltip,
    PUBLIC_CLAIMS.trust.fulfillmentNotice,
    PUBLIC_CLAIMS.blog.cta,
    PUBLIC_CLAIMS.tools.baziDayBoundaryFaq,
    PUBLIC_CLAIMS.tools.birthLocationFaq,
  ].map((claim) => translateToEn(claim))

  for (const value of translated) {
    assert.equal(typeof value, 'string')
    assert.equal(/[\u4e00-\u9fff]/u.test(value), false, `English claim must not retain Chinese text: ${value}`)
    for (const phrase of ['cross-validation', 'cross-validated', 'precise', 'scientifically proven']) {
      assert.equal(value.toLowerCase().includes(phrase), false, `English claim must not publish: ${phrase}`)
    }
  }
  assert.match(translated.join(' '), /traditional/u)
  assert.match(translated.join(' '), /self-reflection/u)
})

test('retired Chinese marketing claims cannot reappear as stronger English translations', () => {
  const legacyKeys = [
    '十四套系統交叉驗證',
    '44,421+ 條規則客觀運算',
    '14 系統交叉驗證',
    '每套系統各司其職，交叉驗證給你最完整的答案',
    '14 系統交叉驗證方法論與工業級排盤引擎技術報告',
    '44,421+ 條',
    '44,421+ 條規則源自《滴天髓》《紫微斗數全書》《窮通寶鑑》等經典，由分析引擎整合成有深度的個人化報告。',
    '排盤計算使用確定性算法（如壽星天文曆、Swiss Ephemeris），結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則，經引擎精密計算整合成個人化報告。鑒源最多用十四套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統的判斷。',
    '不同系統觀察的角度不同，偶有差異屬正常。這正是鑒源的核心價值——我們用三層加權架構進行交叉驗證，取各系統共識作為最終結論。單一系統只有一個觀點，十四套系統交叉驗證才能得到更全面、更可靠的結論。',
  ]

  for (const key of legacyKeys) {
    const value = translateToEn(key)
    assert.equal(typeof value, 'string')
    for (const phrase of ['44,421', 'cross-validation', 'cross-validated', 'industrial-grade', 'objective']) {
      assert.equal(value.toLowerCase().includes(phrase), false, `retired claim must not translate to: ${phrase}`)
    }
  }
})

test('free-tool JSON-LD uses disclosed settings and limits instead of unsupported validation claims', () => {
  const source = read('lib', 'seo', 'free-tool-schema.ts')
  assert.match(source, /PUBLIC_CLAIMS\.tools/u)

  for (const tool of ['bazi', 'ziwei', 'qimen']) {
    const schema = JSON.stringify(buildFreeToolJsonLd(tool))
    for (const phrase of [
      '20 組 Windada 交叉驗證',
      '最多 14 套系統交叉',
      '降低單一系統偏誤',
      '萬年曆級',
      '自動換算真太陽時',
    ]) {
      assert.equal(schema.includes(phrase), false, `${tool} JSON-LD must not publish: ${phrase}`)
    }
  }
})

test('non-E3 FAQ explains day-boundary and birthplace settings without unaudited authority or error rates', () => {
  const source = withoutDeferredE3Faq(read('app', 'faq', 'page.tsx'))
  assert.match(source, /PUBLIC_CLAIMS\.tools\.baziDayBoundaryFaq/u)
  assert.match(source, /PUBLIC_CLAIMS\.tools\.birthLocationFaq/u)
  for (const phrase of [
    '清代《滴天髓》、《窮通寶鑑》、《三命通會》主流派別',
    '精確計算「真太陽時」',
    '誤差可達 ±60 分鐘',
    '誤差 ≤ 2 分鐘',
  ]) {
    assert.equal(source.includes(phrase), false, `FAQ must not publish: ${phrase}`)
  }
})
