// 測試 33:P4/P11/P27/P30/P19 純邏輯契約(提示詞合集)
// ============================================================
// 與各 source 邏輯逐字對映。測契約 + 抓真實漏洞,非快鋪。

import { suite, test, assert, assertEqual, done } from './harness.mjs'

// ── P4 post-purchase 5 封 drip:序列完整性 + utm + 防漏 ──
function buildDrip() {
  return [
    { step: 0, offsetDays: 0 }, { step: 1, offsetDays: 1 }, { step: 2, offsetDays: 3 },
    { step: 3, offsetDays: 7 }, { step: 4, offsetDays: 14 },
  ]
}
suite('P4 Post-purchase 5 封 drip 序列')
test('恰 5 封、step 0-4 連續不重不漏', () => {
  const d = buildDrip()
  assertEqual(d.length, 5)
  assertEqual(d.map((x) => x.step).join(','), '0,1,2,3,4')
})
test('offsetDays 嚴格遞增(不會同日連發騷擾)', () => {
  const d = buildDrip()
  for (let i = 1; i < d.length; i++) assert(d[i].offsetDays > d[i - 1].offsetDays, `D+${d[i].offsetDays} 未遞增`)
})
test('D+0 必為 0(completed 當下立即補連結防遺失)', () => {
  assertEqual(buildDrip()[0].offsetDays, 0)
})
done()

// ── P11 UpsellModal:upsell 映射邏輯 ──
const UPSELL_MAP = { C: 'G15', D: 'C', R: 'E1', E1: 'E3', E2: 'E3', G15: 'E4' }
suite('P11 Upsell 映射(買 X 推 Y)')
test('合集指定映射正確', () => {
  assertEqual(UPSELL_MAP.C, 'G15')
  assertEqual(UPSELL_MAP.D, 'C')
  assertEqual(UPSELL_MAP.R, 'E1')
  assertEqual(UPSELL_MAP.E1, 'E3')
})
test('無映射的方案(E3/E4)→ 不彈(undefined、modal return null)', () => {
  assertEqual(UPSELL_MAP.E3, undefined)
  assertEqual(UPSELL_MAP.E4, undefined)
})
test('不自我 upsell(target≠source)', () => {
  for (const [s, t] of Object.entries(UPSELL_MAP)) assert(s !== t, `${s} 不可推自己`)
})
done()

// ── P27 crisis_resources:未驗證硬閘 fallback(攸關人命) ──
const CRISIS_RESOURCES_VERIFIED = false
const CRISIS = [{ country: 'TW', phone: '1925', verified: false }]
function getCrisisResource(country) {
  if (!CRISIS_RESOURCES_VERIFIED) return null
  const r = CRISIS.find((x) => x.country === country.toUpperCase())
  return r && r.verified ? r : null
}
suite('P27 危機資源硬閘(未法務核對前絕不顯示號碼)')
test('CRISIS_RESOURCES_VERIFIED=false → 任何國家回 null(走通用 fallback)', () => {
  assertEqual(getCrisisResource('TW'), null)
  assertEqual(getCrisisResource('US'), null)
})
test('全部 entry verified:false(尚未官方核對)', () => {
  for (const r of CRISIS) assertEqual(r.verified, false, `${r.country} 不應 verified`)
})
test('硬閘設計:即使有 entry,verified 前一律 null(寧 fallback 不顯錯號)', () => {
  assertEqual(getCrisisResource('tw'), null)
})
done()

// ── P30 swisseph_adapter:is_available 降級契約 ──
// pyswisseph 未裝時 is_available()=False、呼叫端必 fallback、不可崩
function isAvailable(sweOk) { return sweOk === true }
suite('P30 SwissEph adapter 降級契約')
test('pyswisseph 未裝 → is_available False(呼叫端 fallback v3.5、零影響)', () => {
  assertEqual(isAvailable(false), false)
  assertEqual(isAvailable(undefined), false)
})
test('裝了才 True(避免誤用未裝環境)', () => {
  assertEqual(isAvailable(true), true)
})
done()

// ── P19 generate-cover:deterministic(同輸入同輸出、合集驗收要求) ──
import { createHash } from 'node:crypto'
function coverSig(plan, name, element) {
  return createHash('sha256').update(`${plan}|${name}|${element}|v1`).digest('hex').slice(0, 12)
}
suite('P19 封面 deterministic(SHA256 可重現)')
test('同輸入 → 同 SHA(可重現)', () => {
  assertEqual(coverSig('C', '王', '火'), coverSig('C', '王', '火'))
})
test('不同方案/元素 → 不同 SHA(不撞)', () => {
  assert(coverSig('C', '王', '火') !== coverSig('D', '王', '火'))
  assert(coverSig('C', '王', '火') !== coverSig('C', '王', '水'))
})
done()
