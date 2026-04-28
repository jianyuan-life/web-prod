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
  // 數量中文(對齊鑑源品牌風格、避免「14 套」/「15 套」digit-mix)
  const countLabel = chartData.length === 14 ? '十四套' : chartData.length === 13 ? '十三套' : `${chartData.length} 套`

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
          </p>
        </div>
        <div className="text-[10px] text-text-muted/70 hidden md:block">
          滿分 100 · 滑鼠 hover 看詳細
        </div>
      </div>

      <div className="glass rounded-2xl p-3 md:p-5 border border-gold/15">
        <div style={{ width: '100%', height: 360 }}>
          {!mounted ? (
            <div className="w-full h-full flex items-center justify-center text-text-muted/60 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gold/60 animate-pulse" />
                載入評分圖表中...
              </div>
            </div>
          ) : (
          <ResponsiveContainer>
            <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <PolarGrid stroke={COLORS.grid} strokeDasharray="2 4" />
              <PolarAngleAxis
                dataKey="system"
                tick={{ fill: COLORS.axis, fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: COLORS.axis, fontSize: 9 }}
                stroke={COLORS.grid}
                tickCount={5}
              />
              <Radar
                name="評分"
                dataKey="score"
                stroke={COLORS.stroke}
                fill={COLORS.fill}
                fillOpacity={0.7}
                strokeWidth={1.8}
                dot={{ fill: COLORS.stroke, r: 3 }}
                activeDot={{ r: 5 }}
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
                formatter={(value) => {
                  const v = Array.isArray(value) ? value[0] : value
                  return [`${v ?? 0} 分`, '評分'] as [string, string]
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* 評分區段視覺說明 */}
        <div className="grid grid-cols-3 gap-2 mt-4 text-[10px]">
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-gold/30" />
            70 以上 · 命格優勢
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-gold/55" />
            60-70 · 平衡發展
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <span className="w-2 h-2 rounded-full bg-gold/80" />
            60 以下 · 需要關注
          </div>
        </div>
      </div>
    </section>
  )
}
