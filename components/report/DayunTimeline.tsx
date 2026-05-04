'use client'

// v5.6.10 R5-4 命理視覺化:八字大運起伏時間軸
// 對應 Gemini 致命傷「缺命理視覺化」第三招
// 對標 TimePassages 大運時間軸 / Co-Star Saturn returns

import { useEffect, useState } from 'react'

type DayunStage = {
  age_start: number
  age_end?: number
  pillar?: string  // 例如「甲子」「乙丑」
  energy?: number  // 0-100 主觀能量
  theme?: string  // 例如「事業突破期」「人際擴展」
  is_current?: boolean
}

const STAGE_BG = (energy: number) => {
  if (energy >= 75) return 'linear-gradient(180deg, rgba(106,176,76,0.30), rgba(106,176,76,0.08))'
  if (energy >= 50) return 'linear-gradient(180deg, rgba(201,168,76,0.30), rgba(201,168,76,0.08))'
  if (energy >= 25) return 'linear-gradient(180deg, rgba(231,76,60,0.20), rgba(231,76,60,0.06))'
  return 'linear-gradient(180deg, rgba(189,195,199,0.20), rgba(189,195,199,0.06))'
}

export default function DayunTimeline({
  data,
  currentAge,
  title = '大運起伏時間軸',
}: {
  data: DayunStage[]
  currentAge?: number
  title?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!data || data.length === 0) return null

  const sorted = [...data].sort((a, b) => a.age_start - b.age_start)
  const stages = sorted.map((d) => ({
    ...d,
    energy: typeof d.energy === 'number' ? Math.max(0, Math.min(100, d.energy)) : 50,
    is_current:
      typeof currentAge === 'number'
        ? currentAge >= d.age_start && (d.age_end == null || currentAge < d.age_end)
        : !!d.is_current,
  }))

  const peak = stages.reduce((m, d) => (d.energy > m.energy ? d : m), stages[0])
  const valley = stages.reduce((m, d) => (d.energy < m.energy ? d : m), stages[0])

  return (
    <section className="my-8" aria-labelledby="dayun-timeline-title">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 id="dayun-timeline-title" className="text-base font-bold text-cream">
            {title}
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {stages.length} 個大運十年期 · 高峰{' '}
            <span className="text-gold">{peak.age_start}-{peak.age_end ?? `+10`} 歲 ({peak.pillar})</span>{' '}
            · 低谷{' '}
            <span className="text-text-muted/70">
              {valley.age_start}-{valley.age_end ?? `+10`} 歲 ({valley.pillar})
            </span>
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 md:p-6 border border-gold/15">
        {/* 時間軸 grid */}
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
          }}
        >
          {stages.map((s, idx) => {
            const heightPct = mounted ? Math.max(15, s.energy) : 0
            return (
              <div key={idx} className="flex flex-col items-center text-center">
                {/* 柱形 */}
                <div className="w-full h-32 flex items-end mb-2 relative">
                  <div
                    className="w-full rounded-t-lg transition-all duration-1000 ease-out"
                    style={{
                      height: `${heightPct}%`,
                      background: STAGE_BG(s.energy),
                      border: s.is_current
                        ? '2px solid #c9a84c'
                        : '1px solid rgba(245, 240, 232, 0.1)',
                      boxShadow: s.is_current ? '0 0 15px rgba(201, 168, 76, 0.5)' : 'none',
                    }}
                  >
                    {s.is_current && (
                      <div
                        className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: '#c9a84c',
                          color: '#0a0e1a',
                          fontWeight: 700,
                        }}
                      >
                        當下
                      </div>
                    )}
                  </div>
                </div>

                {/* v5.7.88 加西元年份 + 年齡 + 干支大字、Gemini「過於簡陋」P1 修 */}
                <div className="text-[10px] text-text-muted mb-0.5 font-semibold">
                  {s.age_start}-{s.age_end ?? s.age_start + 10} 歲
                </div>

                {/* 西元年份(從當前年齡推算) */}
                {(() => {
                  const currentYear = new Date().getFullYear()
                  const currentAgeApprox = currentAge || 30  // fallback 30
                  const yearStart = currentYear - currentAgeApprox + s.age_start
                  const yearEnd = currentYear - currentAgeApprox + (s.age_end ?? s.age_start + 10)
                  return (
                    <div className="text-[9px] text-gold/45 mb-1">
                      {yearStart}-{yearEnd}
                    </div>
                  )
                })()}

                {/* 干支 */}
                {s.pillar && (
                  <div
                    className="text-sm font-bold text-cream mb-0.5"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {s.pillar}
                  </div>
                )}

                {/* 能量分數 */}
                <div className="text-[9px] text-text-muted/55 mb-1">
                  能量 {s.energy}
                </div>

                {/* 主題(若有) */}
                {s.theme && (
                  <div
                    className="text-[9px] text-text-muted/70 line-clamp-2 leading-tight px-0.5"
                    title={s.theme}
                  >
                    {s.theme}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 圖例 */}
        <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-gold/10 text-[10px]">
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: '#6ab04c' }} />
            高峰期 75+
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: '#c9a84c' }} />
            穩定期 50-75
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: '#e74c3c' }} />
            轉折期 25-50
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: '#bdc3c7' }} />
            蟄伏期 0-25
          </div>
        </div>
      </div>
    </section>
  )
}
