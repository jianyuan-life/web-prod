// v5.10.206 Sprint 1 — KeyTakeaway 共用元件(Jamie 規格 20+ 元件之一)
//
// 樣式:橙色左邊條卡(4px adjust)+ 💡 icon + 「這對你的意義」標題
import type { ReactNode } from 'react'

export interface KeyTakeawayProps {
  children: ReactNode
  title?: string // 預設「這對你的意義」
  className?: string
}

export function KeyTakeaway({ children, title = '這對你的意義', className = '' }: KeyTakeawayProps) {
  return (
    <aside
      className={`relative rounded-r-xl border-l-4 p-5 ${className}`}
      style={{
        borderLeftColor: 'var(--jy-semantic-adjust)',
        backgroundColor: 'rgba(249, 115, 22, 0.08)',
      }}
      role="note"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 text-xl" aria-hidden>💡</span>
        <div className="flex-1">
          <h4 className="font-semibold text-[var(--jy-semantic-adjust)] text-sm mb-2">
            {title}
          </h4>
          <div className="text-[var(--jy-text-secondary)] leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </aside>
  )
}
