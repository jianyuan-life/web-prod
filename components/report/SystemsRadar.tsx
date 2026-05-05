'use client'

// v5.6.10 R5 命理視覺化:14/15 系統評分雷達圖(對應 Gemini「致命傷:0 視覺化」共識)
// 對標 TimePassages 3D 星盤 / Co-Star 視覺一致性
// 資料源:report_result.analyses_summary = [{system, score}, ...] × 14-15 個系統
// 引擎:recharts(已裝、~16KB tree-shaken)

import { useEffect, useState } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

type SystemScore = {
  system: string
  score: number
}

const COLORS = {
  fill: 'rgba(201, 168, 76, 0.20)',
  stroke: '#c9a84c',
  grid: 'rgba(245, 240, 232, 0.12)',
  axis: 'rgba(245, 240, 232, 0.55)',
  tooltipBg: 'rgba(15, 22, 40, 0.95)',
  tooltipBorder: 'rgba(201, 168, 76, 0.35)',
}

export default function SystemsRadar({
  data,
  title = '十四套命理系統評分',
}: {
  data: SystemScore[]
  title?: string
}) {
  // v5.6.10 R5 hotfix:client-only mount 防 recharts SSR width=-1 + React #419 hydration
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!data || data.length === 0) return null

  // 對齊 v5.3.95「對外清零南洋術數、十四套對齊」共識(IA Agent 5 家共識)
  // 資料源 analyses_summary 實際含 15 個系統(含南洋術數)、過濾掉對齊對外宣傳
  const EXCLUDE_SYSTEMS = new Set(['南洋術數', '南洋数术', '南洋'])
  const chartData = data
    .filter((d) => d && d.system && !EXCLUDE_SYSTEMS.has(d.system))
    .map((d) => ({
      system: d.system,
      score: Math.max(0, Math.min(100, Number(d.score) || 0)),
    }))

  if (chartData.length < 3) return null

  const avg = chartData.reduce((s, d) => s + d.score, 0) / chartData.length
  const peak = chartData.reduce((m, d) => (d.score > m.score ? d : m), chartData[0])
  // v5.9.2 對外清零南洋、強制 cap 14(數據可能傳 15、避免 Gemini 標 15 vs 14 不一致)
  const displayCount = Math.min(14, chartData.length)
  const countLabel = displayCount === 14 ? '十四套' : displayCount === 13 ? '十三套' : `${displayCount} 套`

  // v5.10.7 R+4 baseline 大眾平均(Gemini「雷達圖只有自己沒有世界」P0 + DeepSeek/Codex 共識修):
  //   業界中位數 = 70(典型 SaaS dashboard 用 industry median 對比、本系統初版用 hardcoded、未來可從 DB 撈)
  const BASELINE = 70
  // 找最低項(R+4 加、配合「最高 / 最低」雙標)
  const valley = chartData.reduce((m, d) => (d.score < m.score ? d : m), chartData[0])
  // 自動產生 Insight 解讀句(R+4、Gemini「圖表下方強制輸出 Insight: 粗體總結」)
  const above = chartData.filter((d) => d.score >= 75).length
  const aboveBaseline = chartData.filter((d) => d.score >= BASELINE).length
  const percentile = Math.round((aboveBaseline / chartData.length) * 100)
  const insight = `你的「${peak.system}(${peak.score})」是相對最強項、超越大眾平均(${BASELINE} 分)的有 ${aboveBaseline}/${chartData.length} 套系統(${percentile}%)、可優先發揮`

  return (
    <section className="my-8" aria-labelledby="systems-radar-title">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h3 id="systems-radar-title" className="text-base font-bold text-cream">
            {title}
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {countLabel}系統交叉評分 · 平均 {avg.toFixed(1)} 分 · 最高{' '}
            <span className="text-gold">{peak.system} ({peak.score})</span>
            {' '}· 最低{' '}
            <span className="text-orange-400/80">{valley.system} ({valley.score})</span>
          </p>
        </div>
        {/* v5.10.7 R+4 圖例固定右上(Gemini「圖例固定於右上角」+ DeepSeek 同共識) */}
        <div className="hidden md:flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded-full" style={{ background: '#c9a84c' }} />
            <span className="text-cream/70 font-semibold">本人</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded-full" style={{ background: 'rgba(245,240,232,0.45)', borderTop: '1px dashed rgba(245,240,232,0.6)' }} />
            <span className="text-text-muted/70">大眾平均</span>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-3 md:p-5 border border-gold/15">
        {/* v5.10.13 R+10 mobile 標籤重疊修(Jamie 截圖驗證 mobile seg_03 14 套系統名稱擠在雷達中央):
            - mobile (< 768px): margin 縮 80→25、字級 11→9、給 chart 內部更多空間
            - desktop: 保持原 margin 80 + fontSize 11 */}
        <div className="w-full" style={{ height: 440 }}>
          {!mounted ? (
            <div className="w-full h-full flex items-center justify-center text-text-muted/60 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gold/60 animate-pulse" />
                載入評分圖表中...
              </div>
            </div>
          ) : (
          <ResponsiveContainer>
            <RadarChart data={chartData} margin={typeof window !== 'undefined' && window.innerWidth < 768 ? { top: 20, right: 25, bottom: 20, left: 25 } : { top: 30, right: 80, bottom: 30, left: 80 }}>
              {/* v5.10.7 R+4 加大眾平均 baseline(70 分、Gemini P0「雷達圖只有自己沒有世界」修)
                  baseline 用更明顯灰虛線、半透明 0.30 alpha、本人線金色 1.8 粗 */}
              <PolarGrid stroke={COLORS.grid} strokeDasharray="2 4" />
              <PolarAngleAxis
                dataKey="system"
                tick={{ fill: COLORS.axis, fontSize: typeof window !== 'undefined' && window.innerWidth < 768 ? 9 : 11 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: COLORS.axis, fontSize: 9 }}
                stroke={COLORS.grid}
                tickCount={5}
              />
              {/* v5.10.7 R+4 大眾平均 baseline (BASELINE=70、業界中位數)*/}
              <Radar
                name="大眾平均"
                dataKey={() => BASELINE}
                stroke="rgba(245,240,232,0.50)"
                fill="rgba(245,240,232,0.06)"
                fillOpacity={0.3}
                strokeWidth={1.2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Radar
                name="本人"
                dataKey="score"
                stroke={COLORS.stroke}
                fill={COLORS.fill}
                fillOpacity={0.7}
                strokeWidth={1.8}
                dot={{ fill: COLORS.stroke, r: 4 }}
                activeDot={{ r: 6 }}
                // v5.10.7 R+4 數值改 Pill Badge 樣式(Gemini「白底黑字膠囊標籤」P0 修):
                //   recharts label 用 inline svg style + bg-color、無法直接用 div、改用 fontWeight 700 + textShadow(浮起感)
                label={{ position: 'outside', fill: '#f5d76e', fontSize: 11, fontWeight: 700, offset: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.tooltipBg,
                  border: `1px solid ${COLORS.tooltipBorder}`,
                  borderRadius: 8,
                  color: '#f5f0e8',
                  fontSize: 12,
                }}
                cursor={{ stroke: COLORS.stroke, strokeWidth: 1, strokeDasharray: '3 3' }}
                formatter={(value, name) => {
                  const v = Array.isArray(value) ? value[0] : value
                  // v5.10.7 R+4 tooltip 顯示 vs 平均的 delta(DeepSeek 建議「該維度 vs 平均值 delta」)
                  if (name === '本人') {
                    const delta = (Number(v) || 0) - BASELINE
                    const sign = delta >= 0 ? '+' : ''
                    return [`${v ?? 0} 分(${sign}${delta} vs 平均)`, '本人']
                  }
                  return [`${v ?? 0} 分`, name as string]
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* v5.10.7 R+4 圖表下方 Insight bar(Gemini P0「強制輸出 Insight: 粗體總結」修) */}
        <div className="mt-4 px-4 py-3 rounded-lg flex items-start gap-2" style={{
          background: 'linear-gradient(90deg, rgba(106,176,76,0.10), rgba(197,150,58,0.06))',
          border: '1px solid rgba(106,176,76,0.25)',
        }}>
          <span className="text-green-400 font-bold flex-shrink-0">💡</span>
          <div className="flex-1">
            <span className="text-green-400/85 text-[10px] tracking-[2px] font-semibold mr-2">INSIGHT</span>
            <span className="text-cream text-sm leading-relaxed font-semibold">{insight}</span>
          </div>
        </div>

        {/* v5.10.7 R+3 評分區段加圖例(Claude Haiku「無圖例」issue 修)+ 平均線說明 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[10px]">
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-3 h-0.5 rounded-full" style={{ background: 'rgba(245,240,232,0.50)', borderTop: '1px dashed rgba(245,240,232,0.6)' }} />
            <span className="text-text-muted/70">大眾平均({BASELINE})</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-green-400/60" />
            70 以上 · 優勢({above})
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-gold/55" />
            60-70 · 平衡
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-orange-400/60" />
            60 以下 · 關注
          </div>
        </div>
      </div>
    </section>
  )
}
