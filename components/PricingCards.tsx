'use client'

import Link from 'next/link'
import PriceTag from './PriceTag'
import ConsultationCheckoutTrigger from './consultation/ConsultationCheckoutTrigger'

// v5.10.467:方案陣容收斂(2026-08-01 拍板:只售 C / G15 / E3,SSOT = lib/plan-names.ts VISIBLE_PLAN_CODES)
const PLANS = [
  {
    code: 'C',
    name: '人生藍圖',
    price: 89,
    recommended: true,
    eyebrow: '完整人生分析',
    forWhom: '適合想整理性格、壓力反應、關係、工作與人生階段',
    desc: '把十四套命理系統放在同一份分析中對照；共識、分歧、限制與下一步分開呈現，讓你能用自己的經驗逐項核對。',
    features: ['14 套系統交叉參照', '重要模式與人生階段整理', '依目前年齡調整閱讀重點', '分階段行動與自我觀察建議'],
    delivery: '網頁重點版 + PDF 完整版',
    eta: '通常需 30 分鐘以上，完成後寄信通知',
  },
  {
    code: 'G15',
    name: '家族藍圖',
    price: 59,
    eyebrow: '家庭互動分析',
    forWhom: '適合想看懂家人之間互動模式的家庭',
    desc: '以同一帳戶內 2–8 份已完成的人生藍圖為基礎，整理每位成員的需要、互動循環、界線與可執行的溝通建議。',
    features: ['前提：每位成員先完成人生藍圖', '成員視角與兩兩互動分析', '家庭溝通模式、常見誤解與界線', '分階段的家庭行動建議'],
    delivery: '家族互動報告 · 網頁 + PDF',
    eta: '依成員數與資料狀況而定，完成後寄信通知',
  },
  {
    code: 'E3',
    name: '月度精選',
    price: 89,
    eyebrow: '每月行動時機',
    forWhom: '適合拿到方向後，需要每月具體行動時窗的人',
    desc: '古法奇門遁甲嚴剔 32 凶煞、25 吉法則加權，依你選定的主題嚴選最多 8 個高純度吉時與方位。',
    features: ['最多 8 個嚴選吉時（寧缺勿濫）', '選 1-3 個主題（事業／財運／感情等）', '真太陽時經度校準 + 年命宮驗證', '行事曆邀約一鍵加入'],
    delivery: '吉時清單 + 方位 + 行事曆邀約',
    eta: '預計 40 分鐘以上',
  },
]

export default function PricingCards() {
  return (
    <div className="jy-grid-3">
      {PLANS.map((plan) => (
        <article
          key={plan.code}
          className={`jy-card p-6 md:p-7 flex flex-col ${plan.recommended ? 'jy-card--accent' : ''}`}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-[11px] font-bold tracking-[0.12em] text-[color:var(--jy-ui-gold)] mb-2">
                {plan.eyebrow}
              </div>
              <h3 className="jy-subheading">{plan.name}</h3>
            </div>
            {plan.recommended && (
              <span className="shrink-0 rounded-full border border-[color:var(--jy-ui-line-strong)] px-3 py-1 text-[11px] font-bold text-[color:var(--jy-ui-gold)]">
                適合想一次看全貌
              </span>
            )}
          </div>

          <p className="text-sm leading-7 text-[color:var(--jy-ui-ink)] font-semibold">{plan.forWhom}</p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--jy-ui-ink-muted)]">{plan.desc}</p>

          <div className="my-6 border-y border-[color:var(--jy-ui-line)] py-5">
            <PriceTag usd={plan.price} size="md" />
            <span className="text-sm text-[color:var(--jy-ui-ink-muted)] ml-1">USD · 一次性付款</span>
          </div>

          <ul className="space-y-3 mb-6 flex-1">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm leading-6 text-[color:var(--jy-ui-ink-muted)]">
                <svg className="mt-1 h-4 w-4 shrink-0 text-[color:var(--jy-ui-gold)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="m3 8.2 3 3L13 4.8" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <dl className="mb-6 grid gap-2 border-t border-[color:var(--jy-ui-line)] pt-4 text-xs leading-5 text-[color:var(--jy-ui-ink-subtle)]">
            <div className="flex justify-between gap-4"><dt>交付內容</dt><dd className="text-right">{plan.delivery}</dd></div>
            <div className="flex justify-between gap-4"><dt>完成時間</dt><dd className="text-right">{plan.eta}</dd></div>
          </dl>

          {plan.code === 'C' || plan.code === 'G15' ? (
            <ConsultationCheckoutTrigger
              planCode={plan.code}
              className={`jy-button ${plan.recommended ? 'jy-button--primary' : 'jy-button--secondary'}`}
              ariaLabel={`選擇${plan.name}，${plan.price} 美元一次性付款；先查看購買須知`}
            >
              選擇「{plan.name}」
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </ConsultationCheckoutTrigger>
          ) : (
            <Link href={`/checkout?plan=${plan.code}`}
              className={`jy-button ${plan.recommended ? 'jy-button--primary' : 'jy-button--secondary'}`}
              aria-label={`選擇${plan.name}，${plan.price} 美元一次性付款`}>
              選擇「{plan.name}」
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </Link>
          )}
        </article>
      ))}
    </div>
  )
}
