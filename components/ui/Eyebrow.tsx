// v5.10.198 UI redesign Phase 2 — Eyebrow 小標籤(Jamie 規格書 3.3)
// v5.10.294 editorial redesign — 降 AI 感 / 提權威感:
//   - 砍 uppercase(對中文無效、對中英混排造成奇怪節奏)
//   - 字級 12px → 11px(更 editorial)
//   - tracking 0.24em → 0.18em(refined)
//   - 線條改為 solid hairline(去漸層、editorial 慣例)
//   - chapter prop 支援章節編號型 eyebrow(像 magazine「Chapter 02」)
import type { ReactNode } from 'react'

export interface EyebrowProps {
  children: ReactNode
  className?: string
  align?: 'center' | 'left' | 'right'
  /** 章節編號(如「02」「Vol. III」)、左側顯示 */
  chapter?: string
  /** 變體:default(線條型)/ minimal(無線條、純文字)/ chapter(章節編號優先) */
  variant?: 'default' | 'minimal' | 'chapter'
}

const ALIGN_CLASSES = {
  center: 'justify-center',
  left: 'justify-start',
  right: 'justify-end',
}

export function Eyebrow({
  children,
  className = '',
  align = 'center',
  chapter,
  variant = 'default',
}: EyebrowProps) {
  const alignClass = ALIGN_CLASSES[align]

  // chapter 變體:editorial magazine style「02 — 命格名片」
  if (variant === 'chapter' || chapter) {
    return (
      <div className={`inline-flex items-baseline gap-4 ${alignClass} ${className}`}>
        {chapter && (
          <span
            className="font-mono text-[11px] tracking-[0.2em] text-[#C9A84C]/70"
            style={{ fontFamily: 'var(--jy-font-mono, ui-monospace), monospace' }}
          >
            {chapter}
          </span>
        )}
        <span className="h-px w-8 bg-[#C9A84C]/30" aria-hidden />
        <span
          className="text-[12px] font-medium tracking-[0.12em] text-[#C9A84C]"
          style={{ lineHeight: 1.4 }}
        >
          {children}
        </span>
      </div>
    )
  }

  // minimal 變體:純文字、無線條(用於 nested 章節)
  if (variant === 'minimal') {
    return (
      <div className={`inline-flex items-center ${alignClass} ${className}`}>
        <span
          className="text-[11px] font-medium tracking-[0.18em] text-[#C9A84C]/80"
          style={{ lineHeight: 1.4 }}
        >
          {children}
        </span>
      </div>
    )
  }

  // default:左右 hairline + 中央文字(去 gradient、用 solid hairline editorial 樣式)
  return (
    <div className={`inline-flex items-center gap-3 ${alignClass} ${className}`}>
      <span className="h-px w-6 bg-[#C9A84C]/40" aria-hidden />
      <span
        className="text-[11px] font-medium tracking-[0.18em] text-[#C9A84C]"
        style={{ lineHeight: 1.4 }}
      >
        {children}
      </span>
      <span className="h-px w-6 bg-[#C9A84C]/40" aria-hidden />
    </div>
  )
}
