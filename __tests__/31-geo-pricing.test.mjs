// 測試 31:地理定價(提示詞合集 P24 geo-pricing)
// ============================================================
// 涉真錢:未知國家必須 fail-closed 回全價(誤給折扣 = 漏收入)。
// 與 lib/geo-pricing.ts 邏輯逐字對映(改 source 必同步)。

import { suite, test, assert, assertEqual, done } from './harness.mjs'

const ALL_PLAN_CODES = ['C', 'D', 'G15', 'R', 'E1', 'E2', 'E3', 'E4']
const PPP_GROUPS = [
  { countries: ['IN', 'VN', 'TH', 'BR', 'PH', 'ID'], rate: 0.4, couponPrefix: 'PPP60' },
  { countries: ['TW', 'HK', 'SG', 'MY', 'CN'], rate: 0.8, couponPrefix: 'PPP20' },
  { countries: ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'KR', 'AU', 'NL', 'CH', 'SE', 'NO'], rate: 1.0, couponPrefix: 'PPP00' },
]
function getGeoPricing(country) {
  const cc = (country || '').toUpperCase()
  const grp = PPP_GROUPS.find((g) => g.countries.includes(cc))
  if (!grp || grp.rate >= 1.0) return { country: cc, rate: 1.0, discountPercent: 0, stripeCoupon: null }
  return { country: cc, rate: grp.rate, discountPercent: Math.round((1 - grp.rate) * 100), stripeCoupon: `${grp.couponPrefix}_${cc}` }
}
function getPriceForCountry(planCode, baseAmountCents, country) {
  const pricing = getGeoPricing(country)
  if (!ALL_PLAN_CODES.includes(planCode)) return { amountCents: baseAmountCents, pricing: { ...pricing, rate: 1, discountPercent: 0, stripeCoupon: null } }
  return { amountCents: Math.round(baseAmountCents * pricing.rate), pricing }
}

suite('P24 地理定價 getGeoPricing / getPriceForCountry(fail-closed 防漏收入)')

test('未知國家 fail-closed → 全價、無 coupon(關鍵:不可誤給折扣)', () => {
  const g = getGeoPricing('ZZ')
  assertEqual(g.rate, 1.0)
  assertEqual(g.discountPercent, 0)
  assertEqual(g.stripeCoupon, null)
})

test('null / 空 country → 全價', () => {
  assertEqual(getGeoPricing(null).rate, 1.0)
  assertEqual(getGeoPricing('').rate, 1.0)
  assertEqual(getGeoPricing(undefined).stripeCoupon, null)
})

test('新興市場 -60%(印度)', () => {
  const g = getGeoPricing('in') // 小寫也要正規化
  assertEqual(g.rate, 0.4)
  assertEqual(g.discountPercent, 60)
  assertEqual(g.stripeCoupon, 'PPP60_IN')
})

test('中價區 -20%(台灣)', () => {
  const g = getGeoPricing('TW')
  assertEqual(g.rate, 0.8)
  assertEqual(g.discountPercent, 20)
  assertEqual(g.stripeCoupon, 'PPP20_TW')
})

test('高所得區無折扣(美國)→ coupon null(不建多餘 coupon)', () => {
  const g = getGeoPricing('US')
  assertEqual(g.rate, 1.0)
  assertEqual(g.discountPercent, 0)
  assertEqual(g.stripeCoupon, null)
})

test('C 方案 $89 印度價 = 8900*0.4 = 3560 cents', () => {
  const r = getPriceForCountry('C', 8900, 'IN')
  assertEqual(r.amountCents, 3560)
  assertEqual(r.pricing.discountPercent, 60)
})

test('非 SSOT 方案碼 → 原價不打折(防亂碼亂折)', () => {
  const r = getPriceForCountry('XX', 8900, 'IN')
  assertEqual(r.amountCents, 8900)
  assertEqual(r.pricing.discountPercent, 0)
  assertEqual(r.pricing.stripeCoupon, null)
})

test('台灣 C $89 = 8900*0.8 = 7120', () => {
  assertEqual(getPriceForCountry('C', 8900, 'TW').amountCents, 7120)
})

test('8 SSOT 方案碼都被認得', () => {
  for (const p of ALL_PLAN_CODES) {
    const r = getPriceForCountry(p, 10000, 'US')
    assertEqual(r.amountCents, 10000, `${p} 全價區應原價`)
  }
})

done()
