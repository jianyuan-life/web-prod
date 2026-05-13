// v5.10.208 Sprint 1 — TermTooltip 命理術語 hover/click 解釋(Jamie 規格、Radix Tooltip)
//
// 樣式:
//   inline 文字加 dotted underline(暗示可 hover)
//   hover/focus 顯示 tooltip(術語定義 + 派別出處)
//
// a11y:
//   - Radix Tooltip 內建 keyboard support(Tab focus + Esc close)
//   - 觸控裝置:tap 顯示(Radix 預設行為)
'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export interface TermTooltipProps {
  term: string // 顯示的詞(如「七殺」)
  definition: ReactNode // tooltip 內容(可帶 markdown / 派別資訊)
  source?: string // 派別出處(如「子平派」)
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function TermTooltip({
  term,
  definition,
  source,
  side = 'top',
  className = '',
}: TermTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={cn(
              'inline cursor-help border-b border-dotted',
              'border-[rgba(229,185,92,0.55)]',
              'text-[var(--jy-text-gold)] hover:text-[var(--jy-gold-50)]',
              'hover:border-[rgba(245,215,110,0.80)]',
              'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
              'transition-colors',
              className,
            )}
            aria-label={`術語解釋:${term}`}
          >
            {term}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              'z-50 max-w-xs rounded-lg p-3 text-sm',
              'bg-[var(--jy-bg-nebula)]',
              'border border-[var(--jy-border-gold)]',
              'shadow-[var(--jy-shadow-card)]',
              'text-[var(--jy-text-secondary)]',
              'data-[state=delayed-open]:animate-fade-in',
              'data-[state=closed]:animate-fade-out',
            )}
          >
            <div className="font-semibold text-[var(--jy-text-gold)] mb-1.5">{term}</div>
            <div className="leading-relaxed">{definition}</div>
            {source ? (
              <div className="mt-2 text-[10px] text-[var(--jy-text-muted)] italic">
                出處:{source}
              </div>
            ) : null}
            <Tooltip.Arrow
              className="fill-[var(--jy-bg-nebula)]"
              width={10}
              height={5}
            />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
