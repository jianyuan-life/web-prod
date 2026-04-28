'use client'

// v5.6.10 R3:Checkout 進度條(填表 → 確認 → 付款)
// 對應 5 家 audit 共識「checkout funnel 缺進度感、客戶不知道流程多長」
// 對標 Co-Star / 16P / Pattern checkout funnel

type Step = {
  num: number
  label: string
  desc: string
}

const STEPS: Step[] = [
  { num: 1, label: '填寫資料', desc: '出生資訊與聯絡' },
  { num: 2, label: '安全付款', desc: 'Stripe 加密處理' },
  { num: 3, label: '生成報告', desc: '14 系統交叉分析' },
]

export default function CheckoutProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="結帳進度" className="mb-8">
      <ol className="flex items-center justify-between max-w-md mx-auto">
        {STEPS.map((step, idx) => {
          const done = step.num < current
          const active = step.num === current
          const isLast = idx === STEPS.length - 1
          return (
            <li
              key={step.num}
              className={`flex items-center ${isLast ? '' : 'flex-1'}`}
              aria-current={active ? 'step' : undefined}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                    done
                      ? 'bg-gold/90 border-gold/90 text-dark'
                      : active
                      ? 'border-gold text-gold ring-2 ring-gold/30 ring-offset-2 ring-offset-dark'
                      : 'border-cream/20 text-text-muted'
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{step.num}</span>
                  )}
                </div>
                <div className="mt-1.5">
                  <div className={`text-[11px] font-semibold ${active ? 'text-gold' : done ? 'text-cream/80' : 'text-text-muted'}`}>
                    {step.label}
                  </div>
                  <div className="text-[9px] text-text-muted/70 mt-0.5">{step.desc}</div>
                </div>
              </div>
              {!isLast && (
                <div
                  className={`flex-1 h-px mx-2 mb-6 transition-colors ${
                    done ? 'bg-gold/60' : 'bg-cream/15'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
