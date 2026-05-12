// v5.10.198 UI redesign Phase 2 — Eyebrow 小標籤(Jamie 規格書 3.3)
//
// 樣式:
//   text-[12px] uppercase tracking-[0.24em] text-gold-500 font-medium
//   左右各一條 4×24 金色短線
import type { ReactNode } from 'react'

export interface EyebrowProps {
  children: ReactNode
  className?: string
  align?: 'center' | 'left' | 'right'
}

const ALIGN_CLASSES = {
  center: 'justify-center',
  left: 'justify-start',
  right: 'justify-end',
}

export function Eyebrow({ children, className = '', align = 'center' }: EyebrowProps) {
  const alignClass = ALIGN_CLASSES[align]

  return (
    <div className={`inline-flex items-center gap-3 ${alignClass} ${className}`}>
      <span className="h-px w-6 bg-gradient-to-r from-transparent to-[#C9A84C]" aria-hidden />
      <span
        className="text-[12px] uppercase font-medium tracking-[0.24em] text-[#C9A84C]"
        style={{ lineHeight: 1.4 }}
      >
        {children}
      </span>
      <span className="h-px w-6 bg-gradient-to-l from-transparent to-[#C9A84C]" aria-hidden />
    </div>
  )
}
