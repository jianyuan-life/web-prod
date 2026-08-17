// v5.10.495:對外 14 套系統 SSOT 合約
// 根因(production 兒童實單 2b3cb069 實測):對外清零 15→14 的排除清單原本在
// 5 處各自維護、且用完全比對 ['南洋術數','南洋数术','南洋'];AI 產出「南洋命理」
// 等變體就漏接 → 同屏「14 套系統 · 點擊跳詳解」與右側「15 套」自相矛盾。
import { isExcludedSystem, publicSystems, publicSystemCount, PUBLIC_SYSTEM_CAP } from '../lib/report-systems.ts'

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`) }
  catch (e) { failed++; console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('\n--- 對外 14 套系統 SSOT ---')

const FIFTEEN = [
  '八字四柱', '紫微斗數', '奇門遁甲', '風水', '姓名學', '西洋占星', '吠陀占星',
  '易經', '人類圖', '塔羅牌', '數字能量學', '古典占星', '生肖運勢', '生物節律',
  '南洋術數',
].map((system, i) => ({ system, score: 60 + (i % 30) }))

check('命名變體全部視為排除(南洋術數/南洋数术/南洋命理/南洋命理參考/南洋術)', () => {
  for (const v of ['南洋術數', '南洋数术', '南洋', '南洋命理', '南洋命理參考', '南洋術']) {
    assert(isExcludedSystem(v), `「${v}」應被排除`)
  }
  assert(!isExcludedSystem('八字四柱'), '正常系統不得被排除')
  assert(isExcludedSystem(''), '空值 fail closed')
  assert(isExcludedSystem(null), 'null fail closed')
})

check('15 套輸入 → 對外 14 套(標準命名)', () => {
  assert(publicSystemCount(FIFTEEN) === 14, `應為 14、實得 ${publicSystemCount(FIFTEEN)}`)
})

check('15 套輸入(南洋用變體名) → 仍是 14 套(原漏接案例)', () => {
  const variant = FIFTEEN.map(a => a.system === '南洋術數' ? { ...a, system: '南洋命理參考' } : a)
  assert(publicSystemCount(variant) === 14, `應為 14、實得 ${publicSystemCount(variant)}`)
  assert(!publicSystems(variant).some(a => /南洋/.test(a.system)), '清單不得含南洋')
})

check('超量輸入硬 cap 在 14(對外宣稱上限)', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ system: `系統${i}`, score: 80 }))
  assert(publicSystemCount(many) === PUBLIC_SYSTEM_CAP, '應 cap 14')
})

check('minScore 過濾 missing data(score<=30 不顯示)', () => {
  const withMissing = [
    { system: '八字四柱', score: 80 },
    { system: '西洋占星', score: 0 },
    { system: '風水', score: 25 },
    { system: '易經', score: 65 },
  ]
  const shown = publicSystems(withMissing, 30)
  assert(shown.length === 2, `應剩 2、實得 ${shown.length}`)
  assert(!shown.some(a => a.system === '西洋占星'), '0 分不得顯示')
})

check('顯示清單長度與計數永遠一致(防標題/數字自相矛盾)', () => {
  for (const input of [FIFTEEN, FIFTEEN.slice(0, 5), []]) {
    assert(publicSystems(input).length === publicSystemCount(input), '兩者必須一致')
  }
})

check('壞輸入不炸(null/undefined/非陣列)', () => {
  assert(publicSystemCount(null) === 0)
  assert(publicSystemCount(undefined) === 0)
  assert(publicSystems('x').length === 0)
})

console.log(`\n{"suite":"對外 14 套系統 SSOT","passed":${passed},"failed":${failed},"skipped":0}`)
if (failed > 0) process.exit(1)
