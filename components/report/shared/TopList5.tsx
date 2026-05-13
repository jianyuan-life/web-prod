// v5.10.208 — TopList5 Top 5 列表(Jamie 規格、talentsTop5/risksTop5 對應)
import { cn } from '@/lib/utils'

export interface TopListItem {
  title: string
  supportSystems: string[] // 命理系統 chip
  confidence: 1 | 2 | 3 | 4 | 5
  detail: string // manifestation / triggerTime
  action?: string // howToAmplify / prevention
}

export interface TopList5Props {
  items: TopListItem[]
  variant?: 'talent' | 'risk'
  title?: string
  className?: string
}

const VARIANT_META = {
  talent: { icon: '✓', accent: 'var(--jy-semantic-flow)', label: '天賦' },
  risk: { icon: '⚠', accent: 'var(--jy-semantic-adjust)', label: '風險' },
} as const

export function TopList5({ items, variant = 'talent', title, className = '' }: TopList5Props) {
  const meta = VARIANT_META[variant]
  const headerTitle = title || `${meta.icon} Top ${items.length} ${meta.label}`

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="font-semibold text-lg" style={{ color: meta.accent }}>{headerTitle}</h3>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li
            key={i}
            className="rounded-xl p-4 border border-[var(--jy-border-soft)] bg-[var(--jy-bg-card)]/40"
          >
            <div className="flex items-start gap-3">
              <span
                className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums"
                style={{
                  backgroundColor: `${meta.accent}20`,
                  color: meta.accent,
                }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[var(--jy-text-primary)]">{item.title}</h4>

                {/* 信心度 dots */}
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-[var(--jy-text-muted)]">信心度:</span>
                  <span aria-label={`信心度 ${item.confidence}/5`} className="text-xs">
                    {Array.from({ length: 5 }).map((_, dotI) => (
                      <span
                        key={dotI}
                        className="inline-block w-2 h-2 rounded-full mr-0.5"
                        style={{
                          backgroundColor: dotI < item.confidence
                            ? meta.accent
                            : 'rgba(255,255,255,0.10)',
                        }}
                        aria-hidden
                      />
                    ))}
                  </span>
                </div>

                {/* 支持系統 chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.supportSystems.map((sys) => (
                    <span
                      key={sys}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px]"
                      style={{
                        backgroundColor: 'rgba(229, 185, 92, 0.10)',
                        color: 'var(--jy-text-gold)',
                        border: '1px solid var(--jy-border-hairline)',
                      }}
                    >
                      {sys}
                    </span>
                  ))}
                </div>

                {/* 顯化 / 觸發 */}
                <p className="mt-3 text-sm text-[var(--jy-text-secondary)] leading-relaxed">
                  {item.detail}
                </p>

                {/* 行動 / 預防 */}
                {item.action && (
                  <p className="mt-2 text-sm text-[var(--jy-text-tertiary)]">
                    <span className="text-[var(--jy-text-muted)]">
                      {variant === 'talent' ? '如何放大:' : '如何預防:'}
                    </span>{' '}
                    {item.action}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
