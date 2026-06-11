'use client'

// v5.6.10 R5-3 命理視覺化:出門訣 Top3 能量強度比較條
// 對應 IA Agent P1「Top3 卡片無視覺強度、客戶看不出能量差」+ Gemini 致命傷補強
// 資料源:report_result.top5_timings(E1 / E3 已驗證)

import { useEffect, useState } from 'react'

type Timing = {
  rank?: number
  title?: string
  date?: string
  time_start?: string
  time_end?: string
  direction?: string
  score?: number
  shichen?: string
  confidence?: string
}

const RANK_COLORS = ['#c9a84c', '#e8c87a', '#bdc3c7']  // 金、淺金、銀
const RANK_EMOJI = ['🥇', '🥈', '🥉']

export default function ChumenjiTop3Bar({
  timings,
  title = 'Top3 加乘時機 · 能量強度比較',
}: {
  timings: Timing[]
  title?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!timings || timings.length === 0) return null

  // 取前 3 個 + 過濾 score 為空
  const top3 = timings.slice(0, 3).filter((t) => typeof t.score === 'number')
  if (top3.length === 0) return null

  const maxScore = Math.max(...top3.map((t) => t.score || 0))
  const minScore = Math.min(...top3.map((t) => t.score || 0))
  const scoreSpread = maxScore - minScore

  return (
    <section className="my-8" aria-labelledby="chumenji-top3-title">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 id="chumenji-top3-title" className="text-base font-bold text-cream">
            {title}
          </h3>
          {/* v5.10.409(E1 人類視角審查 P1):分數可因吉格加乘破百、原「滿分 100」與 147 分自相矛盾 */}
          <p className="text-[11px] text-text-muted mt-0.5">
            最強 {maxScore} 分 · 最弱 {minScore} 分 · 差距 {scoreSpread} 分(基準 100、吉格加乘可破百)
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 md:p-6 border border-gold/15">
        <div className="space-y-4">
          {top3.map((t, idx) => {
            const score = t.score || 0
            const widthPct = mounted ? Math.max(8, Math.min(100, score)) : 0
            const color = RANK_COLORS[idx]
            const emoji = RANK_EMOJI[idx]
            return (
              <div key={idx} className="flex items-start gap-3">
                {/* 排名 */}
                <div
                  className="w-12 text-center shrink-0"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  <div className="text-2xl">{emoji}</div>
                  <div className="text-[10px] text-text-muted/70 mt-0.5">
                    第 {idx + 1} 名
                  </div>
                </div>

                {/* 主內容 */}
                <div className="flex-1 min-w-0">
                  {/* 標題 + 方位 — v5.10.295 砍 truncate(出門訣標題重點) */}
                  <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                    <div
                      className="text-sm font-bold text-cream leading-snug"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        wordBreak: 'keep-all',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {t.title || `時機 ${idx + 1}`}
                    </div>
                    {t.direction && (
                      <div
                        className="text-[10px] px-2 py-0.5 rounded-md shrink-0"
                        style={{
                          background: `${color}30`,
                          color: color,
                          border: `1px solid ${color}50`,
                        }}
                      >
                        朝 {t.direction}
                      </div>
                    )}
                    {t.confidence && (
                      <div className="text-[10px] text-text-muted/70 shrink-0">
                        信心 {t.confidence}
                      </div>
                    )}
                  </div>

                  {/* 時間 */}
                  {(t.date || t.time_start) && (
                    <div className="text-[11px] text-text-muted mb-2">
                      {t.date}
                      {t.time_start && t.time_end && ` · ${t.time_start}-${t.time_end}`}
                      {t.shichen && ` · ${t.shichen}時`}
                    </div>
                  )}

                  {/* 能量條 */}
                  <div
                    className="h-6 rounded-md overflow-hidden relative"
                    style={{ background: 'rgba(245, 240, 232, 0.05)' }}
                  >
                    <div
                      className="h-full rounded-md transition-all duration-1000 ease-out"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${color}40, ${color})`,
                        boxShadow: `0 0 12px ${color}50`,
                      }}
                    />
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold"
                      style={{ color: '#f5f0e8' }}
                    >
                      {score} 分
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* v5.10.303 editorial:砍 💡、改 small caps eyebrow + hairline */}
        <div className="mt-5 pt-4 border-t border-gold/10 text-[11px] text-text-muted leading-relaxed">
          <p className="text-[10px] tracking-[0.2em] text-gold/70 mb-2" style={{ fontFamily: 'var(--jy-font-mono), monospace' }}>
            解  讀  說  明
          </p>
          分數愈高代表該時辰盤面能量愈強、奇門遁甲 25 層評分(三吉門 / 三奇 / 八神 / 九星旺衰 / 天地盤干 / 28 格局)綜合判定。建議優先選第一名、若無法配合再選第二、第三。
        </div>
      </div>
    </section>
  )
}
