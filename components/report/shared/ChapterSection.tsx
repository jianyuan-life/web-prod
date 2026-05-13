// v5.10.208 Sprint 1 — ChapterSection 起承轉合摺疊章節(Jamie 規格、Radix Accordion)
//
// 樣式:
//   摺疊頭:章節編號 + emoji + 標題 + ▼
//   展開:章首速覽 + 主體 + KeyTakeaway
//
// emoji 對應 Jamie 規格:✨📜🎯⚡✦✿
// a11y:Radix Accordion 內建鍵盤導航(Enter/Space/Up/Down/Home/End)
'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export interface ChapterSectionProps {
  number?: string | number // 章節編號(❶❷❸❹ or 數字)
  emoji?: string // ✨ 起 / 📜 承 / 🎯 轉 / ⚡ 合 / ✦ 額外 / ✿ 結語
  title: string
  children: ReactNode
  defaultOpen?: boolean
  value?: string // Accordion item id(for controlled use)
  className?: string
}

export interface ChapterGroupProps {
  children: ReactNode
  type?: 'single' | 'multiple' // single = 一次只開一個、multiple = 可同時開多個
  className?: string
}

/**
 * Wrapper:多個 ChapterSection 包在一起、必用
 *
 * 範例:
 *   <ChapterGroup type="multiple">
 *     <ChapterSection emoji="✨" title="一、深入解析">...</ChapterSection>
 *     <ChapterSection emoji="📜" title="二、命格與此事件的關聯">...</ChapterSection>
 *   </ChapterGroup>
 */
export function ChapterGroup({ children, type = 'multiple', className = '' }: ChapterGroupProps) {
  if (type === 'single') {
    return (
      <Accordion.Root type="single" collapsible className={cn('space-y-3', className)}>
        {children}
      </Accordion.Root>
    )
  }
  return (
    <Accordion.Root type="multiple" className={cn('space-y-3', className)}>
      {children}
    </Accordion.Root>
  )
}

export function ChapterSection({
  number,
  emoji,
  title,
  children,
  defaultOpen = false,
  value,
  className = '',
}: ChapterSectionProps) {
  const itemValue = value || `chapter-${title.replace(/\s/g, '-')}`

  return (
    <Accordion.Item
      value={itemValue}
      className={cn(
        'overflow-hidden rounded-xl border',
        'border-[var(--jy-border-soft)]',
        'bg-[var(--jy-bg-card)]/50',
        className,
      )}
      data-state={defaultOpen ? 'open' : 'closed'}
    >
      <Accordion.Header>
        <Accordion.Trigger
          className={cn(
            'group flex w-full items-center justify-between gap-3 px-5 py-4',
            'text-left transition-colors',
            'hover:bg-[var(--jy-bg-mist)]/40',
            'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
            'data-[state=open]:bg-[var(--jy-bg-mist)]/30',
          )}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {emoji ? (
              <span className="flex-shrink-0 text-2xl" aria-hidden>{emoji}</span>
            ) : null}
            {number != null ? (
              <span className="flex-shrink-0 text-sm font-medium text-[var(--jy-text-gold)] tabular-nums">
                {typeof number === 'number' ? `${number}.` : number}
              </span>
            ) : null}
            <h3
              className="font-semibold text-[var(--jy-text-primary)] truncate"
              style={{ fontFamily: 'var(--jy-font-display)' }}
            >
              {title}
            </h3>
          </div>
          <ChevronDown
            className="flex-shrink-0 h-5 w-5 text-[var(--jy-text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content
        className={cn(
          'overflow-hidden text-[var(--jy-text-secondary)]',
          'data-[state=open]:animate-accordion-down',
          'data-[state=closed]:animate-accordion-up',
        )}
      >
        <div className="px-5 py-5 space-y-4 border-t border-[var(--jy-border-hairline)]">
          {children}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  )
}

// 內聯 chevron icon(避免額外 import lucide-react、減 bundle)
function ChevronDown({ className, ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
