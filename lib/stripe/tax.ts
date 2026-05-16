// ============================================================
// 提示詞合集 Prompt 2 — Stripe Tax 啟用 helper
// ============================================================
// 🔴 自治邊界 + 停下條件(動真錢 + 法務):
//   - 本檔 = checkout session 套用 automatic_tax / tax_id_collection
//     的「設定產生器」,FF_STRIPE_TAX flag 控制(default false)。
//   - **實際生效需老闆**:① 台灣公司統一編號(統編)填入 Stripe
//     Dashboard Tax Settings ② Stripe Dashboard 開 Tax ③ 法務確認
//     稅務文案。缺以上任一 → flag 維持 false、checkout 行為不變。
//   - 退費政策多語顯示對齊根 CLAUDE.md「退費 policy(v5.7.8)」SSOT。
//
// additive、未自動 wire。checkout route 由老闆/staging 階段引用。

import { isFlagEnabled } from '@/lib/feature-flags'

export interface CheckoutTaxOptions {
  automatic_tax?: { enabled: boolean }
  customer_update?: { address: 'auto' }
  tax_id_collection?: { enabled: boolean }
}

/**
 * 回傳要 spread 進 stripe.checkout.sessions.create({...}) 的稅務欄位。
 * flag off(預設)→ 回 {} → checkout 與現況完全一致(零行為變化、trunk 安全)。
 * flag on(老闆在 Stripe Dashboard 設好統編 + 開 Tax 後)→ 回完整設定。
 */
export function buildCheckoutTaxOptions(): CheckoutTaxOptions {
  if (!isFlagEnabled('FF_STRIPE_TAX')) return {}
  return {
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto' },
    tax_id_collection: { enabled: true },
  }
}

/** 多語稅務說明文案(checkout 頁顯示;繁中 / 英) */
export const TAX_NOTICE_I18N: Record<string, string> = {
  'zh-TW': '價格未含稅;結帳時將依您所在地區自動計算適用稅額,可選填統一編號(統編)開立發票。',
  'zh-CN': '价格未含税;结账时将依您所在地区自动计算适用税额。',
  en: 'Prices exclude tax. Applicable tax is calculated automatically at checkout based on your location.',
}

export function taxNotice(locale: string): string {
  return TAX_NOTICE_I18N[locale] || TAX_NOTICE_I18N[locale?.split('-')[0]] || TAX_NOTICE_I18N.en
}
