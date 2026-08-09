import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditTaggedPdfBytes } from './fixtures/consultation-pdf/audit-tagged-pdf.mjs'

let renderer
let reportContract
let loadError
try {
  ;[renderer, reportContract] = await Promise.all([
    import('../lib/consultation/pdf/render.ts'),
    import('../lib/consultation/report-contract.ts'),
  ])
} catch (error) {
  loadError = error
}

let passed = 0
let failed = 0

function assert(condition, message = '斷言失敗') {
  if (!condition) throw new Error(message)
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ))
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

async function test(name, run) {
  try {
    await run()
    passed += 1
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('\n--- C／G15 consultation PDF renderer ---')

let renderedPdfBytes
let basePdfModel

await test('隨專案帶入的 CJK 字型雜湊值以 SHA-256 固定', async () => {
  assert(renderer, `PDF renderer 無法載入: ${loadError?.message || 'unknown error'}`)
  const fontPath = join(
    process.cwd(),
    'lib',
    'consultation',
    'pdf',
    'assets',
    'NotoSansTC-Regular.woff2',
  )
  const hash = createHash('sha256').update(readFileSync(fontPath)).digest('hex')
  assert(hash === renderer.CONSULTATION_PDF_FONT_SHA256)
  assert(hash === 'dd7c5a343fb520359405b2dfa7988e954da2713507b9d8f56ff299c973e8ab4a')
})

await test('離線 CJK 字型可實際產生 PDF bytes', async () => {
  const model = {
    plan: 'C',
    planTitle: '人生藍圖',
    subtitle: '一份可反覆核對的生活說明書',
    reportNumber: 'C-A1B2C3D4E5',
    reportVersion: 1,
    asOfDate: '2026-08-09',
    people: ['授權樣本'],
    peopleDetails: [{ displayName: '授權樣本', ageYears: 36, stageLabel: '壯年前期' }],
    quickItems: [
      { conclusion: '先看結論一', selfCheck: '核對日常情境一' },
      { conclusion: '先看結論二', selfCheck: '核對日常情境二' },
      { conclusion: '先看結論三', selfCheck: '核對日常情境三' },
    ],
    chapters: [{
      ordinal: 1,
      title: '第一章 生活觀察',
      conclusionSubtitle: '先看見可核對的生活線索',
      paragraphs: [{ kind: 'claim', text: '繁體中文離線字型測試。這段文字不依賴外部網路。' }],
      evidence: [{
        label: '生活參考',
        sources: ['本地合成資料'],
        limitations: ['以實際經驗為準'],
        applicability: ['能在日常核對時使用'],
        invalidation: ['不符時不採用'],
        evidenceStatuses: ['convergent'],
        supportingSystems: ['八字四柱', '紫微斗數'],
        opposingSystems: [],
      }],
    }],
    sources: ['本地合成資料'],
    generalLimitations: ['以實際經驗反覆核對。'],
  }
  basePdfModel = structuredClone(model)
  const bytes = await renderer.renderConsultationPdfModel(model)
  renderedPdfBytes = bytes
  assert(bytes.byteLength > 5_000)
  assert(bytes.byteLength < renderer.MAX_RENDERED_PDF_BYTES, 'PDF 不得回退為完整 70 MB 字型嵌入')
  assert(Buffer.from(bytes).subarray(0, 5).toString('ascii') === '%PDF-')
})

await test('摘要與章首結論達欄位上限時會分頁，所有文字起點仍留在可閱讀頁界內', async () => {
  assert(basePdfModel, '前置 PDF model 尚未建立')
  const model = structuredClone(basePdfModel)
  const boundedLongText = (maximum, tail) => {
    const sentence = '這段內容保留完整語意，讓讀者可以逐步閱讀並在生活裡核對。'
    return `${sentence.repeat(Math.ceil(maximum / sentence.length)).slice(0, maximum - tail.length)}${tail}`
  }
  model.quickItems[0].conclusion = boundedLongText(
    reportContract.MAX_QUICK_CONCLUSION_CHARACTERS,
    '快速結論尾端保留',
  )
  model.quickItems[0].selfCheck = boundedLongText(
    reportContract.MAX_QUICK_SELF_CHECK_CHARACTERS,
    '自我核對尾端保留',
  )
  model.chapters[0].conclusionSubtitle = boundedLongText(
    reportContract.MAX_CONCLUSION_SUBTITLE_CHARACTERS,
    '章首結論尾端保留',
  )

  const bytes = await renderer.renderConsultationPdfModel(model)
  const audit = auditTaggedPdfBytes(bytes)
  assert(audit.pages >= 8, `超長欄位預期產生多頁，實際只有 ${audit.pages} 頁`)
  assert(audit.textBoundsVerified === true)
  assert(audit.visualOrderVerified === true)
})

await test('renderer 防守性拒絕以大量換行製造空白語意頁', async () => {
  assert(basePdfModel, '前置 PDF model 尚未建立')
  const model = structuredClone(basePdfModel)
  model.quickItems[0].conclusion = `可見內容${'\n'.repeat(1_999)}`
  let rejection
  try {
    await renderer.renderConsultationPdfModel(model)
  } catch (error) {
    rejection = error
  }
  assert(rejection instanceof Error, '大量換行必須被 renderer 拒絕')
  assert(/one semantic paragraph/u.test(rejection.message), rejection.message)
})

await test('整頁卡片的高度判斷必須連同段後距離計算，避免空白頁與頁底裁切', async () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'consultation', 'pdf', 'render.ts'), 'utf8')
  assert(source.includes('if (height + 18 > PAGE.height - PAGE.top - PAGE.bottom)'))
  assert(source.includes('if (totalHeight + 8 <= PAGE.height - PAGE.top - PAGE.bottom)'))
})

await test('所有實際文字色在三種紙色上都達 WCAG AA 4.5:1', async () => {
  const colors = renderer.CONSULTATION_PDF_PALETTE
  assert(colors, 'PDF palette 必須可供稽核')
  for (const foregroundName of [
    'ink',
    'inkSoft',
    'inkMuted',
    'vermilion',
    'bronze',
    'indigo',
    'sage',
  ]) {
    for (const backgroundName of ['paper', 'paperDeep', 'white']) {
      const ratio = contrastRatio(colors[foregroundName], colors[backgroundName])
      assert(
        ratio >= 4.5,
        `${foregroundName} on ${backgroundName} 對比只有 ${ratio.toFixed(2)}:1`,
      )
    }
  }
})

await test('PDF 有真實語意標記、文件語言與可驗證的閱讀順序', async () => {
  assert(renderedPdfBytes, '前置 PDF 渲染未完成')
  const audit = auditTaggedPdfBytes(renderedPdfBytes)
  assert(audit.marked === true)
  assert(audit.language === 'zh-TW')
  assert(audit.structureTags.Document === 1)
  assert(audit.structureTags.H1 >= 1)
  assert(audit.structureTags.H2 >= 1)
  assert(audit.structureTags.P >= 1)
  assert(audit.readingOrderVerified === true)
  assert(audit.visualOrderVerified === true)
  assert(audit.textBoundsVerified === true)
  assert(audit.artifactPolicyVerified === true)
  assert(audit.parentTreeVerified === true)
  assert(audit.allTextMarked === true)

  const falselyMarked = Buffer.from(renderedPdfBytes)
  const markedTrue = Buffer.from('/Marked true', 'ascii')
  const offset = falselyMarked.indexOf(markedTrue)
  assert(offset >= 0, '校準用 MarkInfo/Marked true 位置不存在')
  Buffer.from('/Marked false', 'ascii').copy(falselyMarked, offset)
  let falseMarkedError
  try {
    auditTaggedPdfBytes(falselyMarked)
  } catch (error) {
    falseMarkedError = error
  }
  assert(/MarkInfo\/Marked true/u.test(falseMarkedError?.message || ''))
})

await test('字型沒有的碼位 fail closed，不輸出缺字方框', async () => {
  const model = {
    plan: 'C',
    planTitle: '人生藍圖',
    subtitle: '字型覆蓋檢查',
    reportNumber: 'C-F6E5D4C3B2',
    reportVersion: 1,
    asOfDate: '2026-08-09',
    people: ['授權樣本'],
    peopleDetails: [{ displayName: '授權樣本', ageYears: 36, stageLabel: '壯年前期' }],
    quickItems: [
      { conclusion: '先看結論一', selfCheck: '核對日常情境一' },
      { conclusion: '先看結論二', selfCheck: '核對日常情境二' },
      { conclusion: '先看結論三', selfCheck: '核對日常情境三' },
    ],
    chapters: [{
      ordinal: 1,
      title: '第一章',
      conclusionSubtitle: '這個私用區碼位不應被畫成缺字方框',
      paragraphs: [{ kind: 'claim', text: '文字\u{e000}' }],
      evidence: [],
    }],
    sources: ['本地合成資料'],
    generalLimitations: ['以實際經驗反覆核對。'],
  }
  let error
  try {
    await renderer.renderConsultationPdfModel(model)
  } catch (caught) {
    error = caught
  }
  assert(error, '未覆蓋碼位必須阻止 PDF 產生')
  assert(/font coverage/iu.test(error.message))
})

console.log(JSON.stringify({ suite: 'C／G15 consultation PDF renderer', passed, failed, skipped: 0 }))
if (failed > 0) process.exitCode = 1
