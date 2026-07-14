'use client'

import Link from 'next/link'
import PriceTag from './PriceTag'

const PLANS = [
  {
    code: 'D',
    name: '心之所惑',
    price: 39,
    eyebrow: '聚焦一個問題',
    forWhom: '適合已有明確困惑，希望先做一次主題分析',
    desc: '依問題類別精選 3–5 套系統，聚焦財運、事業、感情、健康、學業或搬家。',
    features: ['可描述最想釐清的困惑（200 字）', '依主題精選 3–5 套系統交叉分析', '整理好的／注意／改善三類方向'],
    delivery: '約 5,000–10,000 字 · 網頁 + PDF',
    eta: '預計約 30 分鐘',
  },
  {
    code: 'C',
    name: '人生藍圖',
    price: 89,
    recommended: true,
    eyebrow: '完整人生分析',
    forWhom: '適合想一次理解性格、事業、關係與人生階段',
    desc: '十四套東西方系統，完整檢視性格天賦、事業財運、感情健康與大運走勢。',
    features: ['14 套系統交叉驗證', '性格、事業、財運、感情與健康', '人際貴人、大運走勢與行動方向'],
    delivery: '11 章 · 30,000 字以上 · 網頁 + PDF',
    eta: '預計約 30–60 分鐘',
  },
  {
    code: 'R',
    name: '合否？',
    price: 59,
    eyebrow: '兩人關係分析',
    forWhom: '適合伴侶、曖昧或重要關係的互動理解',
    desc: '精選 4–6 套關係系統，分析兩人的互動模式、差異、優勢與關係走勢。',
    features: ['兩人命盤 4–6 套系統交叉分析', '對方可只提供年月日', '互動盲點、關係走勢與溝通方向'],
    delivery: '約 5,000–10,000 字 · 網頁 + PDF',
    eta: '預計約 30 分鐘',
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
