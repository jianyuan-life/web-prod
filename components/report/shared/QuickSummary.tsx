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
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg" aria-hidden>✨</span>
        <h4 className="font-medium text-[var(--jy-text-gold)] text-sm tracking-wide">
          {title}
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
