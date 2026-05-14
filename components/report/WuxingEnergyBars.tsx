'use client'

// v5.6.10 R5-2 命理視覺化:五行能量條(對應 Gemini「致命傷」第二招)
// 對標 TimePassages 元素分布圖 / Co-Star elemental balance
// 資料源:從 ai_content 解析或手動傳入 wuxing distribution

import { useEffect, useState } from 'react'

type WuxingValue = {
  element: '木' | '火' | '土' | '金' | '水'
  percent: number  // 0-100
  hint?: string
}

// v5.10.299 editorial:砍西方 emoji(🌿🔥🌍⚜💧)、改漢字 + 色塊已足夠
// 五行漢字本身就是 2000 年文化 icon、加 emoji 反而西化 + AI 感
const ELEMENT_META: Record<string, { color: string; bg: string; desc: string }> = {
  木: { color: '#6ab04c', bg: 'rgba(106, 176, 76, 0.18)', desc: '生長、創新、人際' },
  火: { color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.18)', desc: '熱情、表達、行動' },
  土: { color: '#c9a84c', bg: 'rgba(201, 168, 76, 0.20)', desc: '穩定、信任、責任' },
  金: { color: '#bdc3c7', bg: 'rgba(189, 195, 199, 0.18)', desc: '決斷、紀律、銳利' },
  水: { color: '#3498db', bg: 'rgba(52, 152, 219, 0.18)', desc: '智慧、流動、深思' },
}

export default function WuxingEnergyBars({
  data,
  title = '五行能量分布',
}: {
  data: WuxingValue[]
  title?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!data || data.length === 0) return null

  // 標準化(總和 100)
  const total = data.reduce((s, d) => s + d.percent, 0)
  const normalized = data.map((d) => ({
    ...d,
    percent: total > 0 ? (d.percent / total) * 100 : 0,
  }))

  // 按 element 順序排(木火土金水)
  const order: WuxingValue['element'][] = ['木', '火', '土', '金', '水']
  const sorted = order
    .map((el) => normalized.find((d) => d.element === el))
    .filter((d): d is WuxingValue => Boolean(d))

  if (sorted.length < 5) return null

  const peak = sorted.reduce((m, d) => (d.percent > m.percent ? d : m), sorted[0])
  const valley = sorted.reduce((m, d) => (d.percent < m.percent ? d : m), sorted[0])

  return (
    <section className="my-8" aria-labelledby="wuxing-bars-title">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 id="wuxing-bars-title" className="text-base font-bold text-cream">
            {title}
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            最強:<span style={{ color: ELEMENT_META[peak.element].color }}>{peak.element}</span>{' '}
            ({peak.percent.toFixed(0)}%) · 最弱:
            <span style={{ color: ELEMENT_META[valley.element].color }}>{valley.element}</span>{' '}
            ({valley.percent.toFixed(0)}%)
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 md:p-6 border border-gold/15">
        <div className="space-y-3">
          {sorted.map((d) => {
            const meta = ELEMENT_META[d.element]
            const widthPct = mounted ? d.percent : 0
            return (
              <div key={d.element} className="flex items-center gap-3">
                {/* v5.10.299 editorial:砍 emoji、漢字本身已足、加 hairline color accent */}
                <div className="w-20 flex items-center gap-3 shrink-0">
                  <span
                    className="h-px w-3 shrink-0"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-base font-bold"
                    style={{ color: meta.color, fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}
                  >
                    {d.element}
                  </span>
                </div>

                {/* 能量條 */}
                <div
                  className="flex-1 h-7 rounded-md overflow-hidden relative"
                  style={{ background: 'rgba(245, 240, 232, 0.05)' }}
                >
                  <div
                    className="h-full rounded-md transition-all duration-1000 ease-out"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, ${meta.bg}, ${meta.color})`,
                      boxShadow: `0 0 12px ${meta.bg}`,
                    }}
                  />
                  {/* 百分比 */}
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold"
                    style={{ color: '#f5f0e8' }}
                  >
                    {d.percent.toFixed(1)}%
                  </span>
                </div>

                {/* 描述 */}
                <div className="w-28 text-[10px] text-text-muted/70 hidden md:block shrink-0">
                  {d.hint || meta.desc}
                </div>
              </div>
            )
          })}
        </div>

        {/* 平衡度指標 */}
        <div className="mt-5 pt-4 border-t border-gold/10 text-[11px] text-text-muted">
          {(() => {
            const variance =
              sorted.reduce((s, d) => s + Math.pow(d.percent - 20, 2), 0) / sorted.length
            const balance = Math.max(0, 100 - Math.sqrt(variance) * 4)
            const verdict =
              balance > 75
                ? '五行均衡、五行相生有度'
                : balance > 50
                ? '略有偏重、整體仍在常態'
                : '五行偏重明顯、建議透過後天環境補益'
            return (
              <span>
                <span className="text-gold/70">五行均衡度:</span> {balance.toFixed(0)} / 100 · {verdict}
              </span>
            )
          })()}
        </div>
      </div>
    </section>
  )
}
