// v5.10.206 Sprint 1 — KeyTakeaway 共用元件(Jamie 規格 20+ 元件之一)
// v5.10.297 editorial redesign:砍 💡 emoji、改 editorial pull-quote 樣式
//   - 砍 emoji icon(降 AI 感、editorial 不需要 indicator emoji)
//   - 改 hairline left border + small caps eyebrow(像 magazine pull-quote)
//   - 字體加 serif italic(editorial 強調)
import type { ReactNode } from 'react'

export interface KeyTakeawayProps {
  children: ReactNode
  title?: string // 預設「這對你的意義」
  className?: string
}

export function KeyTakeaway({ children, title = '這對你的意義', className = '' }: KeyTakeawayProps) {
  return (
    <aside
      className={`relative pl-6 py-2 my-6 ${className}`}
      style={{
        borderLeft: '2px solid var(--jy-text-gold)',
      }}
      role="note"
      aria-label={title}
    >
      <p
        className="text-[10px] tracking-[0.2em] text-[var(--jy-text-gold)] mb-3"
        style={{ fontFamily: 'var(--jy-font-mono, ui-monospace), monospace' }}
      >
        — {title.toUpperCase().split('').join(' ')}
      </p>
      <div
        className="text-[var(--jy-text-secondary)] italic"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
          fontSize: 'clamp(15px, 1.4vw, 18px)',
          lineHeight: 1.7,
        }}
      >
        {children}
      </div>
    </aside>
  )
}
