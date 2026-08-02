'use client'

import Link from 'next/link'
import PriceTag from './PriceTag'

// v5.10.467:方案陣容收斂(2026-08-01 拍板:只售 C / G15 / E3,SSOT = lib/plan-names.ts VISIBLE_PLAN_CODES)
const PLANS = [
  {
    code: 'C',
    name: '人生藍圖',
    price: 89,
    recommended: true,
    eyebrow: '完整人生分析',
    forWhom: '適合想一次理解性格、事業、關係與人生階段',
    desc: '十四套東西方系統交叉驗證，完整檢視性格天賦、事業財運、感情健康與大運走勢；正文白話直說結論，每個判斷都可核對命理依據。',
    features: ['14 套系統交叉驗證', '性格、事業、財運、感情與健康', '未來五年戰略推演與關鍵節點', '刻意練習——具體可執行的改善計劃'],
    delivery: '網頁重點版 + PDF 完整版',
    eta: '預計約 30–60 分鐘',
  },
  {
    code: 'G15',
    name: '家族藍圖',
    price: 59,
    eyebrow: '家庭互動分析',
    forWhom: '適合想看懂家人之間互動模式的家庭',
    desc: '在每位家人完成「人生藍圖」後，深度分析家庭互動關係、溝通模式與共同運勢。',
    features: ['前提：每位成員先完成人生藍圖', '家族能量圖譜（五行互補/衝突）', '親子教養／夫妻相處具體建議', '家運走勢與共同行動指南'],
    delivery: '成員個別分析＋家族互動解讀 · 網頁 + PDF',
    eta: '依家庭成員數量而定',
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

          <Link href={`/checkout?plan=${plan.code}`}
            className={`jy-button ${plan.recommended ? 'jy-button--primary' : 'jy-button--secondary'}`}
            aria-label={`選擇${plan.name}，${plan.price} 美元一次性付款`}>
            選擇「{plan.name}」
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </article>
      ))}
    </div>
  )
}
