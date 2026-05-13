// v5.10.214 — YearEnergyMonths 12 月份能量柱(Jamie 規格、用既有 Recharts)
//
// 樣式:Recharts BarChart、色階(順流綠 75+ / 平衡黃 55-75 / 調整橙 < 55)
// hover 顯示分數 + 順流類別 + 月份建議
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { TooltipProps } from 'recharts'

export interface MonthEnergyItem {
  month: number // 1-12
  score: number // 0-100
  note?: string // 該月註解
}

export interface YearEnergyMonthsProps {
  data: MonthEnergyItem[]
  title?: string
  height?: number
  className?: string
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function getColor(score: number): string {
  if (score >= 75) return '#4ADE80' // flow green
  if (score >= 55) return '#FBBF24' // balance amber
  return '#F97316' // adjust orange
}

function getCategory(score: number): string {
  if (score >= 75) return '🟢 順流'
  if (score >= 55) return '🟡 平衡'
  return '🟠 調整'
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  payload?: Array<{ payload: { month: string; score: number; note?: string }; value?: number }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload

  return (
    <div
      className="rounded-lg p-3 border"
      style={{
        backgroundColor: 'var(--jy-bg-nebula)',
        borderColor: 'var(--jy-border-gold)',
        boxShadow: 'var(--jy-shadow-card)',
      }}
    >
      <p className="font-medium text-[var(--jy-text-gold)]">{item.month}</p>
      <p className="text-sm text-[var(--jy-text-secondary)] mt-1">
        分數:<span className="font-mono">{item.score}</span> / 100
      </p>
      <p className="text-xs text-[var(--jy-text-tertiary)] mt-1">{getCategory(item.score)}</p>
      {item.note && (
        <p className="text-xs text-[var(--jy-text-secondary)] mt-2 max-w-[200px]">{item.note}</p>
      )}
    </div>
  )
}

export function YearEnergyMonths({
  data,
  title = '12 月份能量',
  height = 300,
  className = '',
}: YearEnergyMonthsProps) {
  // Map data to chart format
  const chartData = data.map((d) => ({
    month: MONTH_LABELS[d.month - 1] || `${d.month}月`,
    score: d.score,
    note: d.note,
  }))

  return (
    <div className={className}>
      {title && (
        <h3 className="text-lg font-semibold text-[var(--jy-text-primary)] mb-4">📅 {title}</h3>
      )}

      {/* 圖例 */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <LegendItem color="#4ADE80" label="🟢 順流(75+)" />
        <LegendItem color="#FBBF24" label="🟡 平衡(55-75)" />
        <LegendItem color="#F97316" label="🟠 調整(< 55)" />
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
          >
            <XAxis
              dataKey="month"
              tick={{ fill: 'rgba(203, 213, 225, 0.7)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'rgba(148, 163, 184, 0.6)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(229, 185, 92, 0.05)' }}
            />
            <Bar dataKey="score" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[var(--jy-text-tertiary)]">{label}</span>
    </div>
  )
}
