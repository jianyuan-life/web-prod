// v5.10.208 — RadarTriad 三軸雷達(Jamie 規格、insight3steps.step2 dashboard 對應)
//
// 樣式:3 KPI 大數字(個性/行動/修行)+ 進度條 + 標語
//   不是真雷達圖(那是 RadarChart)、是 3 軸 KPI 卡(對應 Jamie 規格 dashboard 概念)
import { cn } from '@/lib/utils'

export interface RadarTriadData {
  personality: number // 0-100
  action: number
  cultivation: number
}

export interface RadarTriadProps {
  data: RadarTriadData
  tags?: [string, string, string] // 三標語(對應 personality/action/cultivation)
  className?: string
}

const AXES = [
  { key: 'personality', label: '個性', icon: '👤', color: 'var(--jy-semantic-water)' },
  { key: 'action', label: '行動', icon: '🚀', color: 'var(--jy-semantic-fire)' },
  { key: 'cultivation', label: '修行', icon: '🧘', color: 'var(--jy-text-gold)' },
] as const

export function RadarTriad({ data, tags, className = '' }: RadarTriadProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
      {AXES.map((axis, i) => {
        const value = data[axis.key]
        const tag = tags?.[i]

        return (
          <div
            key={axis.key}
            className="rounded-xl p-5 border border-[var(--jy-border-soft)] bg-[var(--jy-bg-card)]/40"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl" aria-hidden>{axis.icon}</span>
              <h4 className="text-sm text-[var(--jy-text-tertiary)] uppercase tracking-wider">
                {axis.label}
              </h4>
            </div>

            {/* 大數字 */}
            <div
              className="font-bold leading-none mb-3"
              style={{
                fontFamily: 'var(--jy-font-display)',
                fontSize: 'clamp(48px, 5vw, 64px)',
                color: axis.color,
                fontVariantNumeric: 'tabular-nums',
              }}
              aria-label={`${axis.label}指數 ${value} 滿分 100`}
            >
              {value}
              <span className="text-xl text-[var(--jy-text-muted)] ml-1">/100</span>
            </div>

            {/* 進度條 */}
            <div className="h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, value))}%`,
                  background: `linear-gradient(90deg, ${axis.color}80, ${axis.color})`,
                }}
              />
            </div>

            {/* 標語 */}
            {tag && (
              <p className="mt-3 text-sm text-[var(--jy-text-secondary)]">{tag}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
