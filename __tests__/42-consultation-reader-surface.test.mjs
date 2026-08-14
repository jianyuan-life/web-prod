import fs from 'node:fs'
import path from 'node:path'
import { suite, test, assert, done } from './harness.mjs'

suite('C/G15 consultation reader surface')

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('consultation route is server-only, dynamic, no-store, and noindex', () => {
  const page = read('app/consultation/view/page.tsx')
  const layout = read('app/consultation/layout.tsx')

  assert(page.includes("import 'server-only'"), '報告路由必須鎖在 server component')
  assert(page.includes("dynamic = 'force-dynamic'"), '報告頁不得靜態輸出')
  assert(page.includes('revalidate = 0'), '報告頁不得重用舊內容')
  assert(page.includes("fetchCache = 'force-no-store'"), '報告頁的 fetch 不得快取')
  assert(/robots\s*:\s*\{[\s\S]*index:\s*false[\s\S]*follow:\s*false/u.test(layout), '報告頁不得被搜尋引擎索引或追蹤')
})

test('reader ships four accessible layers without client-only reveal or unsafe HTML', () => {
  const routeChrome = read('components/RouteChrome.tsx')
  const component = read('components/consultation/reader/ConsultationReportReader.tsx')
  const unavailable = read('components/consultation/reader/ReportUnavailable.tsx')
  const notFound = read('app/consultation/not-found.tsx')
  const access = read('app/consultation/access/page.tsx')

  for (const id of ['quick-reading', 'reading-route', 'deep-reading', 'evidence-appendix']) {
    assert(component.includes(`id="${id}"`), `缺少 SSR 可見閱讀層 ${id}`)
  }
  assert(component.includes('<article'), '閱讀器需要獨立的報告 article')
  assert(component.includes('data-consultation-report'), '報告根節點需要穩定的版面識別屬性')
  const composedMainCount = [routeChrome, component, unavailable, notFound, access]
    .reduce((count, source) => count + (source.match(/<main\b/gu) || []).length, 0)
  assert(composedMainCount === 1, `完整私人報告頁必須只有一個 main landmark，目前為 ${composedMainCount}`)
  assert(routeChrome.includes('id="main-content"'), '唯一 main 必須保留全站 skip-link 的目標')
  assert(!component.includes('<main'), '全域 layout 已有 main，報告內不得再嵌套 main')
  assert(!unavailable.includes('<main'), '狀態頁不得在全域 main 內再嵌套 main')
  assert(!notFound.includes('<main'), '404 頁不得在全域 main 內再嵌套 main')
  assert(!access.includes('<main'), '安全交換頁不得在全域 main 內再嵌套 main')
  assert(access.includes('再試一次'), '暫時性安全交換失敗需要明確的原地重試動作')
  assert(component.includes('aria-label="報告閱讀與下載導覽"'), '目錄需要可辨識且涵蓋下載動作的名稱')
  for (const label of ['30 秒先讀', '3 分鐘導讀', '完整報告', '依據與限制']) {
    assert(component.includes(label), `閱讀導覽缺少 ${label}`)
  }
  assert(component.includes('快讀、詳讀與依據'), '內容安排要使用客戶看得懂的語言')
  assert(component.includes('這段判讀參考了'), '資料提示要說明用途，不使用系統連線語言')
  assert(!component.includes('四層閱讀版'), '不得把內部版型名稱當客戶文案')
  assert(!component.includes('本段連到'), '不得把資料關係寫成機器連線語言')
  assert(!component.includes("'use client'"), '正文不得等候 client hydration 才出現')
  assert(!component.includes('dangerouslySetInnerHTML'), '舊報告不得進入 HTML 注入路徑')
})

test('reader styling includes keyboard, reduced-motion, print, and mobile protections', () => {
  const css = read('components/consultation/reader/ConsultationReportReader.module.css')

  assert(css.includes(':focus-visible'), '鍵盤焦點必須清楚可見')
  assert(
    /\.shell a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--vermilion\)\s*!important/su.test(css),
    '閱讀器的朱砂焦點環必須覆蓋全域金色 !important 規則',
  )
  assert(css.includes('@media (prefers-reduced-motion: reduce)'), '必須尊重 reduced motion')
  assert(css.includes('@media print'), '長報告必須有列印版面')
  assert(css.includes('min-height: 44px'), '互動目標不得小於 44px')
  assert(/\.rail nav a\s*\{[\s\S]*?min-height:\s*48px/u.test(css), '桌面閱讀導覽不得小於 48px')
  assert(/@media \(max-width: 980px\)[\s\S]*?\.rail nav a\s*\{[\s\S]*?min-height:\s*50px/u.test(css), '手機閱讀導覽不得小於 50px')
  assert(!css.includes('backdrop-filter'), '閱讀器不得使用玻璃模糊效果')
  assert(!css.includes('opacity: 0'), 'SSR 正文不得先隱藏')
})

test('new production surface stays isolated from E3 and named sample fixtures', () => {
  const productionFiles = [
    'app/consultation/layout.tsx',
    'app/consultation/access/page.tsx',
    'app/consultation/view/page.tsx',
    'app/consultation/not-found.tsx',
    'components/consultation/reader/ConsultationReportReader.tsx',
    'components/consultation/reader/ReportUnavailable.tsx',
    'components/consultation/reader/reader-model.ts',
    'components/consultation/reader/ConsultationReportReader.module.css',
    'lib/consultation/load-report.ts',
  ]
  const combined = productionFiles.map(read).join('\n')

  assert(!/\bE3\b/u.test(combined), 'C/G15 新路徑不得含 E3 分支')
  assert(!/何宣逸|何紀萳|何宥諄/u.test(combined), 'production 不得含報告樣本姓名')
})

done()
