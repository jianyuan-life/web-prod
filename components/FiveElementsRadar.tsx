'use client'

/**
 * v5.7.59 五行能量雷達圖
 * 4 LLM 共識最高 ROI 改造項(Claude/Gemini/GPT-4o/Kimi 都標)
 * 對標 16Personalities 特質雷達 / Mint 財務圓餅 / The Pattern 視覺化
 */
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'

type FiveElements = {
  wood?: number
  fire?: number
  earth?: number
  metal?: number
  water?: number
}

export default function FiveElementsRadar({ data, title = '五行能量分布' }: { data: FiveElements; title?: string }) {
  // 從輸入抽 5 維、未提供則 0
  const chartData = [
    { element: '木', value: data.wood || 0, fill: '#6ab04c' },
    { element: '火', value: data.fire || 0, fill: '#e74c3c' },
    { element: '土', value: data.earth || 0, fill: '#d4a373' },
    { element: '金', value: data.metal || 0, fill: '#bdc3c7' },
    { element: '水', value: data.water || 0, fill: '#3498db' },
  ]
  const max = Math.max(5, ...chartData.map(d => d.value))

  return (
    <div className="my-4 p-4 rounded-xl" style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(197,150,58,0.2)',
    }}>
      <div className="text-gold/70 text-[11px] tracking-[3px] mb-2 text-center font-semibold">{title}</div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="rgba(197,150,58,0.2)" />
            <PolarAngleAxis dataKey="element" tick={{ fill: '#e8dcb2', fontSize: 14, fontWeight: 600 }} />
            <PolarRadiusAxis angle={90} domain={[0, max]} tick={false} axisLine={false} />
            <Radar name="能量" dataKey="value" stroke="#c9a84c" fill="#c9a84c" fillOpacity={0.35} strokeWidth={2} />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,22,40,0.95)',
                border: '1px solid rgba(197,150,58,0.4)',
                borderRadius: '8px',
                color: '#e8dcb2',
                fontSize: '13px',
              }}
              formatter={(value: unknown) => [`${typeof value === 'number' ? value.toFixed(1) : value}`, '能量值']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {/* 數值表格(輔助) */}
      <div className="grid grid-cols-5 gap-2 mt-2 text-center text-xs">
        {chartData.map((d, i) => (
          <div key={i}>
            <div style={{ color: d.fill, fontWeight: 700 }}>{d.element}</div>
            <div className="text-cream/70 mt-0.5" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{d.value.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
