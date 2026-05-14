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

// v5.10.305 editorial:砍 ✓⚠ icon、editorial label
const VARIANT_META = {
  talent: { accent: 'var(--jy-semantic-flow)', label: '天賦' },
  risk: { accent: 'var(--jy-semantic-adjust)', label: '風險' },
} as const

export function TopList5({ items, variant = 'talent', title, className = '' }: TopList5Props) {
  const meta = VARIANT_META[variant]
  const headerTitle = title || `Top ${items.length} ${meta.label}`

  return (
    <div className={cn('space-y-5', className)}>
      {/* v5.10.305 editorial:editorial section header(small caps + hairline + serif title) */}
      <div className="flex items-baseline gap-3">
        <span className="h-px w-6" style={{ background: meta.accent, opacity: 0.5 }} aria-hidden />
        <h3
          className="font-medium text-lg"
          style={{
            color: meta.accent,
            fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
          }}
        >
          {headerTitle}
        </h3>
      </div>
      <ol className="space-y-4">
        {items.map((item, i) => (
          <li
            key={i}
            className="border-l-2 pl-5 py-2"
            style={{ borderLeftColor: `${meta.accent}40` }}
          >
            <div className="flex items-baseline gap-4">
              {/* v5.10.305 editorial:rounded-full numbered avatar → mono ordinal chapter style */}
              <span
                className="flex-shrink-0 text-xs tabular-nums tracking-[0.15em]"
                style={{
                  color: meta.accent,
                  fontFamily: 'var(--jy-font-mono), monospace',
                  opacity: 0.7,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                {/* v5.10.305 editorial:title 改 serif normal、字級放大、wordBreak */}
                <h4
                  className="font-medium text-[var(--jy-text-primary)] leading-snug"
                  style={{
                    fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
                    fontSize: '17px',
                    wordBreak: 'keep-all',
                    overflowWrap: 'break-word',
                  }}
                >
                  {item.title}
                </h4>

                {/* 信心度 — v5.10.305 editorial:小型 mono dots、不再 gap-2 跟 SaaS 感 */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] tracking-[0.18em] text-[var(--jy-text-muted)]" style={{ fontFamily: 'var(--jy-font-mono), monospace' }}>
                    CONFIDENCE
                  </span>
                  <span aria-label={`信心度 ${item.confidence}/5`} className="inline-flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, dotI) => (
                      <span
                        key={dotI}
                        className="inline-block w-1.5 h-1.5"
                        style={{
                          backgroundColor: dotI < item.confidence
                            ? meta.accent
                            : 'rgba(255,255,255,0.08)',
                        }}
                        aria-hidden
                      />
                    ))}
                  </span>
                </div>

                {/* 支持系統 chips — v5.10.299 editorial:rounded-full pill → hairline serif chip */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {item.supportSystems.map((sys) => (
                    <span
                      key={sys}
                      className="inline-flex items-center text-[11px] border-l pl-2"
                      style={{
                        borderLeftColor: 'var(--jy-text-gold)',
                        color: 'var(--jy-text-gold)',
                        fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
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
