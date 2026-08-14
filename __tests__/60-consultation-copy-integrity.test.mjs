import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const readSource = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('the C report preview describes delivered sections without a fixed word-count promise', () => {
  const source = readSource('components', 'ReportPreview.tsx')

  for (const banned of ['14,000', '完整命格分析', '精密運算', '交叉驗證']) {
    assert.equal(source.includes(banned), false, `C preview must not promise: ${banned}`)
  }

  assert.match(source, /11 章主題式報告/u)
  assert.match(source, /篇幅會依資料與內容需要調整/u)
})

test('pricing and checkout metadata describe the service without certainty claims', () => {
  const metadata = [
    readSource('app', 'pricing', 'layout.tsx'),
    readSource('app', 'checkout', 'layout.tsx'),
  ].join('\n')

  for (const banned of ['精準', '完整命格', '一份看清']) {
    assert.equal(metadata.includes(banned), false, `metadata must not claim: ${banned}`)
  }

  assert.match(metadata, /家庭互動/u)
  assert.match(metadata, /付款後開始處理/u)
})

test('the C to G15 follow-up invites an informed product review without inventing a discount', () => {
  const source = readSource('components', 'UpsellModal.tsx')
  const familyCopy = source.match(/const FAMILY_BLUEPRINT_UPSELL_COPY = \{([\s\S]*?)\}\s+as const/u)?.[1]

  assert.ok(familyCopy, 'G15 needs dedicated, inspectable follow-up copy')
  for (const banned of ['24 小時', '七折', '30%', '30% off', '專屬折扣']) {
    assert.equal(familyCopy.includes(banned), false, `G15 follow-up must not claim: ${banned}`)
  }

  assert.match(familyCopy, /互動/u)
  assert.match(familyCopy, /容易誤解/u)
  assert.match(familyCopy, /先了解家族藍圖內容/u)
  assert.match(source, /target === 'G15'/u)
  assert.match(source, /href=\{isFamilyBlueprint \? '\/family-blueprint\?utm_source=upsell&utm_medium=modal'/u)

  // E3 is outside this consultation-copy change and keeps its existing mapping and copy.
  assert.match(source, /G15: 'E3'/u)
  assert.match(source, /限時 24 小時 · 省 30%/u)
  assert.match(source, /以 30% off 加購/u)
})

test('the shared auth shell only promises account actions the interface currently supports', () => {
  const source = readSource('components', 'auth', 'AuthShell.tsx')

  assert.equal(source.includes('核對或修正出生資料'), false)
  assert.match(source, /集中查看已購買與生成中的報告/u)
  assert.match(source, /可依隱私政策申請下載、更正或刪除資料/u)
})
