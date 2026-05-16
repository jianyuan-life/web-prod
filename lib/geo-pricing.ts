// ============================================================
// 提示詞合集 Prompt 24 — 地理定價(PPP-based)
// ============================================================
// 依購買力平價(PPP)對不同國家套折扣 Stripe coupon。
//
// 🔴 自治邊界:本 lib(純函式 + 折扣對照)= 自治。
//   實際生效需:① middleware.ts wire(P1 級、未自動 wire,見檔尾)
//   ② Stripe Dashboard 建 12 個 coupon code(老闆 / 動真錢前確認)
//   ③ 退款政策多語顯示對齊根 CLAUDE.md「退費 policy」
//   未建 coupon 前 getGeoPricing 回 discount=0(全價、安全 fail-closed)。
//
// SSOT:方案碼用 lib/plan-names.ts ALL_PLAN_CODES、不 inline。

import { ALL_PLAN_CODES } from '@/lib/plan-names'

/** PPP 折扣分組(folder = 折扣後百分比,1 = 全價) */
const PPP_GROUPS: { countries: string[]; rate: number; couponPrefix: string }[] = [
  // 新興市場 -60%
  { countries: ['IN', 'VN', 'TH', 'BR', 'PH', 'ID'], rate: 0.4, couponPrefix: 'PPP60' },
  // 中價區 -20%(台/港/新/馬 + 中)
  { countries: ['TW', 'HK', 'SG', 'MY', 'CN'], rate: 0.8, couponPrefix: 'PPP20' },
  // 高所得 100%(無折扣)
  { countries: ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'KR', 'AU', 'NL', 'CH', 'SE', 'NO'], rate: 1.0, couponPrefix: 'PPP00' },
]

export interface GeoPricing {
  country: string
  rate: number              // 0.4 / 0.8 / 1.0
  discountPercent: number   // 60 / 20 / 0
  /** Stripe coupon code(老闆須在 Dashboard 預建,否則 checkout 端忽略) */
  stripeCoupon: string | null
}

/**
 * 取某國定價策略。未知國家 → 全價(fail-closed、不誤給折扣)。
 */
export function getGeoPricing(country: string | null | undefined): GeoPricing {
  const cc = (country || '').toUpperCase()
  const grp = PPP_GROUPS.find((g) => g.countries.includes(cc))
  if (!grp || grp.rate >= 1.0) {
    return { country: cc, rate: 1.0, discountPercent: 0, stripeCoupon: null }
  }
  return {
    country: cc,
    rate: grp.rate,
    discountPercent: Math.round((1 - grp.rate) * 100),
    stripeCoupon: `${grp.couponPrefix}_${cc}`, // 例:PPP60_IN / PPP20_TW
  }
}

/**
 * 給定方案原價(美分),回 PPP 後價(美分)。
 * planCode 須在 SSOT ALL_PLAN_CODES 內,否則回原價。
 */
export function getPriceForCountry(
  planCode: string,
  baseAmountCents: number,
  country: string | null | undefined,
): { amountCents: number; pricing: GeoPricing } {
  const pricing = getGeoPricing(country)
  if (!ALL_PLAN_CODES.includes(planCode)) {
    return { amountCents: baseAmountCents, pricing: { ...pricing, rate: 1, discountPercent: 0, stripeCoupon: null } }
  }
  return { amountCents: Math.round(baseAmountCents * pricing.rate), pricing }
}

// ── middleware wire 範例(未自動套用、老闆/staging 啟用)──
//   import { getGeoPricing } from '@/lib/geo-pricing'
//   const { country } = getClientContext(request)         // 既有 trust filter
//   const gp = getGeoPricing(country)
//   if (gp.stripeCoupon) res.cookies.set('ppp_coupon', gp.stripeCoupon, { maxAge: 86400 })
//   → checkout API 讀 cookie,coupon 存在於 Stripe Dashboard 才套(否則忽略、全價)
