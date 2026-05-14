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
  birthYear,
  title = '大運起伏時間軸',
}: {
  data: DayunStage[]
  currentAge?: number
  birthYear?: number  // v5.10.178 加、frontend 大運年份計算用 birthYear + age_start、不用 fallback 30 算錯
  title?: string
}) {
  const [mounted, setMounted] = useState(false)
  // v5.7.92 互動化:點擊柱顯示細節(Gemini #2 +6 分)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
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

  // 預設展開「當下」
  const currentIdx = stages.findIndex((s) => s.is_current)
  const displayIdx = activeIdx !== null ? activeIdx : currentIdx >= 0 ? currentIdx : 0
  const displayStage = stages[displayIdx]

  const peak = stages.reduce((m, d) => (d.energy > m.energy ? d : m), stages[0])
  const valley = stages.reduce((m, d) => (d.energy < m.energy ? d : m), stages[0])
  // v5.10.5 R+1 修(Gemini mobile P1「高峰=低谷同十年」邏輯矛盾):
  //   若 peak.energy === valley.energy(所有大運能量相同、客戶大運平穩)
  //   → 不顯示「高峰 / 低谷」誤導文字、改顯示「能量平穩 · 整段大運起伏不大」
  //   依據:Gemini eval「這個錯誤會嚴重打擊我對整份報告數據準確性的信任」
  const samePeakValley = peak.age_start === valley.age_start && peak.age_end === valley.age_end
  const energyFlat = peak.energy === valley.energy

  return (
    <section className="my-8" aria-labelledby="dayun-timeline-title">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 id="dayun-timeline-title" className="text-base font-bold text-cream">
            {title}
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {stages.length} 個大運十年期 ·{' '}
            {samePeakValley || energyFlat ? (
              <span className="text-gold/70">能量平穩 · 整段大運起伏不大、屬「穩中求進」型節奏</span>
            ) : (
              <>
                高峰{' '}
                <span className="text-gold">{peak.age_start}-{peak.age_end ?? `+10`} 歲 ({peak.pillar})</span>{' '}
                · 低谷{' '}
                <span className="text-text-muted/70">
                  {valley.age_start}-{valley.age_end ?? `+10`} 歲 ({valley.pillar})
                </span>
              </>
            )}
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
            const isActive = idx === displayIdx
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx === activeIdx ? null : idx)}
                className="flex flex-col items-center text-center cursor-pointer transition-transform hover:scale-[1.04] focus:outline-none focus:ring-2 focus:ring-gold/40 rounded"
                aria-label={`${s.age_start}-${s.age_end ?? s.age_start + 10} 歲、${s.pillar} 大運、能量 ${s.energy}`}
              >
                {/* v5.10.3 R2 P0-6 修(STRICT 2 LLM 標「擁擠」):柱高 h-32 → h-40(+25%)、視覺呼吸感 + 大運期感更清晰 */}
                <div className="w-full h-40 flex items-end mb-2 relative">
                  <div
                    className="w-full rounded-t-lg transition-all duration-1000 ease-out"
                    style={{
                      height: `${heightPct}%`,
                      background: STAGE_BG(s.energy),
                      border: isActive
                        ? '2px solid #c9a84c'
                        : s.is_current
                        ? '2px solid #c9a84c'
                        : '1px solid rgba(245, 240, 232, 0.1)',
                      boxShadow: isActive
                        ? '0 0 25px rgba(201, 168, 76, 0.6)'
                        : s.is_current
                        ? '0 0 15px rgba(201, 168, 76, 0.5)'
                        : 'none',
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

                {/* v5.10.180 修:hide 西元年份顯示、避免起運偏移錯算
                    對應 Gemini+Qwen audit C v5.10.179 共識 P0:「2023-2034」應為「2024-2033」
                    真因:birthYear + age_start 沒考慮起運 9m10d 偏移、嬰兒不到 1 歲起運實際是 2024
                    最務實修法:不顯示西元年份、只留歲數 + 干支(歲數對應 AI 內文「丙辰大運 0-11 歲」已對)
                    AI 內文已正確寫「丙辰 2024-2033」、frontend 不重複算、避免錯
                */}

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

                {/* 主題(若有)— v5.10.295 line-clamp-2 → 3、防大運主題重點被截 */}
                {s.theme && (
                  <div
                    className="text-[9px] text-text-muted/70 leading-tight px-0.5"
                    title={s.theme}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {s.theme}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* v5.7.92 互動詳情面板:點擊柱顯示這個大運期細節 */}
        {displayStage && (
          <div className="mt-5 px-5 py-4 rounded-xl" style={{
            background: 'rgba(197,150,58,0.08)',
            border: '1px solid rgba(197,150,58,0.30)',
          }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-gold" style={{ fontFamily: 'var(--font-sans)' }}>
                  {displayStage.pillar}
                </div>
                <div>
                  <div className="text-cream text-sm font-semibold">{displayStage.age_start}-{displayStage.age_end ?? displayStage.age_start + 10} 歲大運</div>
                  <div className="text-text-muted text-[11px] mt-0.5">能量指數 {displayStage.energy} / 100 · {displayStage.is_current ? '正在經歷' : displayStage.age_start > (currentAge || 30) ? '未來十年' : '已過'}</div>
                </div>
              </div>
              {activeIdx !== null && (
                <button onClick={() => setActiveIdx(null)} className="text-text-muted/60 hover:text-cream text-xs">×</button>
              )}
            </div>
            <div className="text-cream/85 text-sm leading-relaxed mt-2">
              {displayStage.theme || `${displayStage.pillar} 大運主題:${displayStage.energy >= 75 ? '能量高峰、適合主動推進大計畫' : displayStage.energy >= 50 ? '穩定發展期、適合厚積薄發' : '轉折調整期、宜謹慎、避免重大決策'}`}
            </div>
            <div className="text-text-muted/45 text-[10px] mt-2 text-right">↑ 點擊上方柱形切換其他大運期</div>
          </div>
        )}

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
