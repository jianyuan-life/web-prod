'use client'

import PriceTag from './PriceTag'

const PLANS = [
  { code: 'D', name: '心之所惑', price: 39, desc: '依問題類別精選 3–5 套系統(八字 + 紫微 + 占星)聚焦深度剖析', features: ['財運/事業/感情/健康/學業/搬家', '描述你最想釐清的困惑（200字）', '依主題精選 3–5 套系統交叉分析', '好的/注意/改善三大建議'], cta: '入門首選' },
  { code: 'C', name: '人生藍圖', price: 89, popular: true, desc: '十四套東西方系統完整人生面向交叉分析', features: ['性格天賦+事業財運+感情健康', '14 套系統交叉驗證 · 不是某位老師說', '人際貴人+大運走勢', '好的/注意/改善三大建議', '網頁展示+PDF報告'], cta: '最受歡迎' },
  { code: 'R', name: '合否？', price: 59, desc: '精選 4–6 套關係系統(八字合婚 + 紫微夫妻宮 + 占星 Synastry + 易經)合盤', features: ['兩人命盤 4–6 套系統交叉分析', '對方可只提供年月日', '互動建議+關係走勢', '好的/注意/改善三大建議'], cta: '關係分析' },
]

export default function PricingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {PLANS.map((plan) => (
        <div key={plan.code}
          className={`relative glass rounded-2xl p-7 flex flex-col transition-all duration-300 ${plan.popular ? 'border-gold/40 ring-1 ring-gold/20 md:scale-[1.03]' : ''}`}>
          {plan.popular && (
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gold text-dark text-[11px] font-bold rounded-full shadow-lg shadow-gold/20">
              {plan.cta}
            </div>
          )}
          {!plan.popular && <div className="text-xs text-gold/70 font-mono mb-1">{plan.cta}</div>}
          <h3 className="text-xl font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>{plan.name}</h3>
          <p className="text-xs text-text-muted mt-1">{plan.desc}</p>
          <div className="my-5">
            <PriceTag usd={plan.price} size="lg" />
            <span className="text-sm text-text-muted ml-1">/ 份</span>
          </div>
          <ul className="space-y-2.5 mb-7 flex-1">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-text">
                <span className="text-gold mt-0.5 text-xs">&#10003;</span>{f}
              </li>
            ))}
          </ul>
          <a href={`/checkout?plan=${plan.code}`}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${plan.popular ? 'bg-gold text-dark btn-glow hover:scale-[1.02]' : 'border border-gold/35 text-gold hover:bg-gold/10 hover:border-gold/70'}`}>
            選擇方案
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </a>
        </div>
      ))}
    </div>
  )
}
