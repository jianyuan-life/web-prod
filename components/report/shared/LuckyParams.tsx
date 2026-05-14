// v5.10.208 Sprint 1 — LuckyParams 幸運參數表(Jamie 規格、LifeBlueprint luckyParams 對應)
//
// 樣式:6 項 + 避忌、icon + label + chip 組
import { cn } from '@/lib/utils'

export interface LuckyParamsData {
  colors: string[]
  numbers: number[]
  directions: string[]
  hours: string[]
  plants: string[]
  avoid: string[]
  protectStars?: string[]
  talents?: string[]
}

export interface LuckyParamsProps {
  data: LuckyParamsData
  className?: string
}

const PARAMS = [
  { key: 'colors', label: '幸運色', icon: '🎨', accent: 'var(--jy-text-gold)' },
  { key: 'numbers', label: '幸運數字', icon: '🔢', accent: 'var(--jy-semantic-water)' },
  { key: 'directions', label: '幸運方位', icon: '🧭', accent: 'var(--jy-semantic-wood)' },
  { key: 'hours', label: '幸運時段', icon: '⏰', accent: 'var(--jy-semantic-balance)' },
  { key: 'plants', label: '幸運植物', icon: '🌿', accent: 'var(--jy-semantic-flow)' },
  { key: 'protectStars', label: '守護星耀', icon: '✨', accent: 'var(--jy-text-gold)' },
  { key: 'talents', label: '加分才藝', icon: '🎭', accent: '#A78BFA' },
] as const

export function LuckyParams({ data, className = '' }: LuckyParamsProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PARAMS.map(({ key, label, icon, accent }) => {
          const items = data[key as keyof LuckyParamsData]
          if (!items || items.length === 0) return null
          return (
            <div
              key={key}
              className={cn(
                'rounded-lg p-4 border border-[var(--jy-border-soft)]',
                'bg-[var(--jy-bg-card)]/40',
              )}
            >
              {/* v5.10.297 editorial:砍 emoji icon、改 hairline accent line + serif label */}
              <div className="flex items-center gap-3 mb-3">
                <span className="h-px w-4" style={{ background: accent, opacity: 0.5 }} aria-hidden />
                <h4
                  className="text-[11px] tracking-[0.18em] font-medium"
                  style={{ color: accent, fontFamily: 'var(--jy-font-mono), monospace' }}
                >
                  {label.split('').join(' ')}
                </h4>
              </div>
              {/* v5.10.298 editorial:rounded-full pill → hairline rect chip(QA L5 finding) */}
              <div className="flex flex-wrap gap-x-3 gap-y-2 mt-2">
                {(items as Array<string | number>).map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center text-xs border-l pl-2"
                    style={{
                      borderLeftColor: 'var(--jy-text-gold)',
                      color: 'var(--jy-text-secondary)',
                      fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* 避忌 — 紅色警示 */}
      {data.avoid.length > 0 && (
        <div
          className="rounded-lg p-4 border-l-4"
          style={{
            borderLeftColor: 'var(--jy-semantic-danger)',
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
          }}
        >
          {/* v5.10.298 editorial:砍 ⚠️、改 hairline + 避忌 chip 同 hairline */}
          <div className="flex items-center gap-3 mb-3">
            <span className="h-px w-4 bg-[var(--jy-semantic-danger)]/60" aria-hidden />
            <h4 className="text-[11px] tracking-[0.18em] font-medium text-[var(--jy-semantic-danger)]" style={{ fontFamily: 'var(--jy-font-mono), monospace' }}>
              避 忌
            </h4>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {data.avoid.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center text-xs border-l pl-2"
                style={{
                  borderLeftColor: 'var(--jy-semantic-danger)',
                  color: '#FCA5A5',
                  fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
