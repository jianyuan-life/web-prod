'use client'

// ============================================================
// 提示詞合集 Prompt 11 — Post-purchase Upsell Modal
// ============================================================
// 報告 completed 後顯示相關方案。C → G15 只提供內容導覽；其他 legacy 分支保留既有顯示。
// 方案名從 lib/plan-names PLAN_NAMES 取(SSOT、不 inline)。
//
// 🔴 自治邊界:UI = 自治;Stripe promo code 需老闆 Dashboard 預建
//   (動真錢)→ 未建前 checkout 端忽略 promo、不影響。
// additive,由 app/dashboard 自行條件 render。本檔不自動掛載。

import { useState } from 'react'
import { PLAN_NAMES } from '@/lib/plan-names'

// 買 X → 推 Y(對齊提示詞合集 Prompt 11 upsell 邏輯)
// v5.10.467:目標一律收斂到可販售方案(C/G15/E3、SSOT = VISIBLE_PLAN_CODES);
// D/R/E1/E2 為隱藏方案的來源 key、留著無害(新客戶不會觸發)
const UPSELL_MAP: Record<string, string> = {
  C: 'G15',
  D: 'C',
  R: 'E3',
  E1: 'E3',
  E2: 'E3',
  G15: 'E3',
}

const FAMILY_BLUEPRINT_UPSELL_COPY = {
  eyebrow: '延伸閱讀 · 家族互動',
  title: '把個人洞察帶進家人的相處日常',
  description: '家族藍圖會把家人的人生藍圖放在同一個家庭脈絡中，整理互動優勢、容易誤解的地方，以及能一起練習的溝通方式。',
  cta: '先了解家族藍圖內容',
  ariaLabel: '了解家族藍圖',
} as const

export interface UpsellModalProps {
  sourcePlan: string
  /** GA4 事件回呼(呼叫端注入;缺則 no-op) */
  onEvent?: (name: 'upsell_shown' | 'upsell_clicked' | 'upsell_converted') => void
  /** 點擊 legacy CTA 導向(呼叫端帶 promo 的 checkout url builder；G15 內容導覽不使用) */
  checkoutUrl?: (targetPlan: string) => string
}

export default function UpsellModal({ sourcePlan, onEvent, checkoutUrl }: UpsellModalProps) {
  const target = UPSELL_MAP[sourcePlan]
  const [open, setOpen] = useState(true)
  if (!target || !open) return null
  const targetName = PLAN_NAMES[target] || target
  const isFamilyBlueprint = target === 'G15'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isFamilyBlueprint ? FAMILY_BLUEPRINT_UPSELL_COPY.ariaLabel : '專屬優惠'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0A0A0A',
          color: '#fff',
          width: '100%',
          maxWidth: 480,
          borderRadius: '16px 16px 0 0',
          padding: '26px 22px',
          border: '1px solid #B33A2E',
        }}
      >
        <p style={{ color: '#B33A2E', fontWeight: 700, margin: '0 0 6px' }}>
          {isFamilyBlueprint ? FAMILY_BLUEPRINT_UPSELL_COPY.eyebrow : '限時 24 小時 · 省 30%'}
        </p>
        <h3 style={{ fontSize: 20, margin: '0 0 10px' }}>
          {isFamilyBlueprint ? FAMILY_BLUEPRINT_UPSELL_COPY.title : <>下一步,推薦你「{targetName}」</>}
        </h3>
        <p style={{ color: '#bbb', fontSize: 14, lineHeight: 1.7, margin: '0 0 18px' }}>
          {isFamilyBlueprint
            ? FAMILY_BLUEPRINT_UPSELL_COPY.description
            : '剛讀完報告的此刻,是把洞察化為行動的最佳時機。現在加購享專屬折扣。'}
        </p>
        <a
          href={isFamilyBlueprint ? '/family-blueprint?utm_source=upsell&utm_medium=modal' : checkoutUrl ? checkoutUrl(target) : `/pricing?plan=${target}&utm_source=upsell&utm_medium=modal`}
          onClick={() => onEvent?.('upsell_clicked')}
          style={{
            display: 'block',
            textAlign: 'center',
            background: '#B33A2E',
            color: '#fff',
            padding: '12px',
            borderRadius: 10,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {isFamilyBlueprint ? FAMILY_BLUEPRINT_UPSELL_COPY.cta : <>以 30% off 加購 {targetName}</>}
        </a>
        <button
          onClick={() => setOpen(false)}
          style={{
            display: 'block',
            margin: '12px auto 0',
            background: 'none',
            border: 'none',
            color: '#777',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          下次再說
        </button>
      </div>
    </div>
  )
}
