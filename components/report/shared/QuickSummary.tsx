// v5.10.206 Sprint 1 — QuickSummary 章首速覽(Jamie 規格 20+ 元件之一)
//
// 樣式:灰底圓角、3 條摘要、編號 chip
import type { ReactNode } from 'react'

export interface QuickSummaryProps {
  bullets: string[] | ReactNode[] // 3-5 條摘要
  title?: string // 預設「章首速覽」
  className?: string
}

export function QuickSummary({ bullets, title = '章首速覽', className = '' }: QuickSummaryProps) {
  return (
    <section
      className={`rounded-xl p-6 ${className}`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--jy-border-soft)',
      }}
      aria-label={title}
    >
      {/* v5.10.297 editorial:砍 ✨ emoji、改 small caps eyebrow */}
      <div className="flex items-center gap-3 mb-5">
        <span className="h-px w-6 bg-[var(--jy-text-gold)]/40" aria-hidden />
        <h4
          className="text-[11px] tracking-[0.18em] text-[var(--jy-text-gold)]"
          style={{ fontFamily: 'var(--jy-font-mono, ui-monospace), monospace' }}
        >
          {title.split('').join(' ').toUpperCase()}
        </h4>
      </div>
      <ol className="space-y-3">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3 text-[var(--jy-text-secondary)]">
            <span
              className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(229, 185, 92, 0.15)',
                color: 'var(--jy-text-gold)',
              }}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="flex-1 leading-relaxed pt-0.5">{b}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
