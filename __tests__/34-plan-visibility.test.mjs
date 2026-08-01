// 測試 34:方案可見性白名單(v5.10.467 硬閘)
// ════════════════════════════════════════════════════════════
// 用途:白名單是「隱藏 D/R/E1/E2/E4」唯一以販售語意運作的伺服器防線,原本沒有任何測試保護。
//       兩輪機械 QA(codex-cli)皆把「缺此測試」判為 critical。
//
// 放置方式:改名為 __tests__/34-plan-visibility.test.mjs 即可被 run-tests.mjs 撿到。
//          本檔以 .draft 結尾放在 tasks/ 下,是為了不與網頁部門 integration owner 的
//          working tree 衝突;由該 owner 決定何時移入。
//
// 介面已對齊既有慣例(harness.mjs 的 suite/test/assert/done、ROOT = process.cwd())。
//
// 設計原則:純靜態 + 邏輯求值,不打真實 HTTP、不碰 Stripe、不寫 DB。
//          「隱藏方案真的無法完成付款」屬金流路徑,需另行授權實跑。
// ════════════════════════════════════════════════════════════

import { suite, test, assert, done } from './harness.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, 'lib/plan-names.ts'), 'utf-8')

// ── 從真實原始碼抽出 ALL_PLAN_CODES 與可見性運算式 ──────────────
const allMatch = src.match(/export const ALL_PLAN_CODES[^=]*=\s*(\[[^\]]*\])/)
if (!allMatch) throw new Error('plan-names.ts 找不到 ALL_PLAN_CODES(結構已變?)')
const ALL_PLAN_CODES = eval(allMatch[1])

const blockMatch = src.match(/const _rawVisiblePlans[\s\S]*?\n(?=export const isVisiblePlan)/)
if (!blockMatch) throw new Error('plan-names.ts 找不到 VISIBLE_PLAN_CODES 區塊(結構已變?)')
const visibleExpr = blockMatch[0]
  // 通用剝除 TS 型別註記(涵蓋 `: readonly string[] =`、`: string[] =` 等寫法)
  // —— v5.10.468 新增 `const _parsedVisible: string[] =`,只處理 readonly 會語法錯
  .replace(/:\s*(readonly\s+)?string\s*\[\]\s*=/g, ' =')
  .replace(/export const/g, 'const')

/** 以指定 env 值求值真實的 VISIBLE_PLAN_CODES 運算式 */
function visibleWith(envValue) {
  const fakeProcess = { env: {} }
  if (envValue !== undefined) fakeProcess.env.NEXT_PUBLIC_VISIBLE_PLAN_CODES = envValue
  const fn = new Function('ALL_PLAN_CODES', 'process', visibleExpr + '\nreturn VISIBLE_PLAN_CODES;')
  return fn(ALL_PLAN_CODES, fakeProcess)
}
const isVisible = (list, code) => !!code && list.includes(code)

// ════════════════════════════════════════════════════════════
suite('方案可見性:預設只開 C/G15/E3')

test('未設 env → C/G15/E3 皆可販售', () => {
  const v = visibleWith(undefined)
  assert(['C', 'G15', 'E3'].every(c => isVisible(v, c)),
    `C/G15/E3 應全部可見,實得 [${v.join(',')}]`)
})

for (const code of ['D', 'R', 'E1', 'E2', 'E4']) {
  test(`未設 env → ${code} 不可販售`, () => {
    const v = visibleWith(undefined)
    assert(!isVisible(v, code), `${code} 不應可見,實得 [${v.join(',')}]`)
  })
}

// ════════════════════════════════════════════════════════════
suite('方案可見性:R-ADD 偽方案不得放行')
// R-ADD 在 PRICE_MAP 有 $19,若進得了白名單就是可下單的偽方案

test('R-ADD 不在 ALL_PLAN_CODES(加人附加費、非方案)', () => {
  assert(!ALL_PLAN_CODES.includes('R-ADD'), 'R-ADD 不得被視為方案代碼')
})

test('env 明寫 R-ADD → 仍不可販售', () => {
  assert(!isVisible(visibleWith('R-ADD'), 'R-ADD'), 'R-ADD 絕不可進白名單')
})

test('env 為 C,G15,E3,R-ADD → R-ADD 被濾掉、三方案不受影響', () => {
  const v = visibleWith('C,G15,E3,R-ADD')
  assert(!isVisible(v, 'R-ADD'), 'R-ADD 必須被濾除')
  assert(['C', 'G15', 'E3'].every(c => isVisible(v, c)), '三方案應保留')
})

test('env 含未知代碼 → 被濾除', () => {
  const v = visibleWith('C,G15,E3,XXX,ZZZ')
  assert(!isVisible(v, 'XXX') && !isVisible(v, 'ZZZ'), '未知代碼必須被濾除')
})

// ════════════════════════════════════════════════════════════
suite('方案可見性:可逆性與緊急開關')

test('env 設 8 方案全列 → 全部恢復可販售', () => {
  const v = visibleWith('C,D,G15,R,E1,E2,E3,E4')
  assert(ALL_PLAN_CODES.every(c => isVisible(v, c)),
    `8 方案應全部可見,實得 [${v.join(',')}]`)
})

test("env='NONE' → 全部停售(fail-closed)", () => {
  assert(visibleWith('NONE').length === 0, 'NONE 應清空白名單')
})

// v5.10.468 修掉了大小寫陷阱(加 .trim().toUpperCase() + 丟棄值 console.warn)。
// 本測試鎖住該修復,防止日後有人把正規化拿掉、再次造成小寫 env 靜默全站停售。
test('小寫 env 仍可正確解析(v5.10.468 大小寫正規化回歸鎖)', () => {
  const v = visibleWith('c,g15,e3')
  assert(['C', 'G15', 'E3'].every(c => isVisible(v, c)),
    `小寫 env 應正規化為三方案;若此處失敗代表正規化被移除、小寫會導致全站停售。實得 [${v.join(',')}]`)
})

test('混合大小寫 + 空白 env 仍可正確解析', () => {
  const v = visibleWith(' c , G15 ,e3 ')
  assert(['C', 'G15', 'E3'].every(c => isVisible(v, c)),
    `應正規化為三方案,實得 [${v.join(',')}]`)
})

// ════════════════════════════════════════════════════════════
suite('方案可見性:硬閘接線與既有客戶保護')

test('/api/checkout 有 import 並呼叫 isVisiblePlan', () => {
  const co = readFileSync(join(ROOT, 'app/api/checkout/route.ts'), 'utf-8')
  assert(/import\s*\{[^}]*isVisiblePlan[^}]*\}\s*from\s*['"]@\/lib\/plan-names['"]/.test(co),
    'checkout 必須 import isVisiblePlan')
  assert(/if\s*\(\s*!\s*isVisiblePlan\s*\(\s*planCode\s*\)\s*\)/.test(co),
    'checkout 必須以 !isVisiblePlan(planCode) 擋下不可見方案')
})

// 縮水會讓舊訂單顯示成裸 code、後台營收報表吃掉歷史資料
test('PLAN_NAMES 仍含全 8 方案(既有客戶顯示用)', () => {
  for (const c of ['C', 'D', 'G15', 'R', 'E1', 'E2', 'E3', 'E4']) {
    assert(new RegExp(`\\b${c}:\\s*'`).test(src), `PLAN_NAMES 缺 ${c}`)
  }
})

test('ALL_PLAN_CODES 仍為 8 個(後台報表 / geo-pricing 依賴)', () => {
  assert(ALL_PLAN_CODES.length === 8, `應為 8 個,實得 ${ALL_PLAN_CODES.length}`)
})

done()
