// v5.10.208 Sprint 1 — EvidenceList 命盤佐證列表(Jamie 規格、HeartDoubts 12 條核心)
//
// 樣式:摺疊頭「⟐ icon + 命盤佐證(N 條)」、展開 grid 2 欄、每條 system chip + finding
'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export interface EvidenceItem {
  system: string // 如「紫微」「八字」「吠陀」
  finding: string | ReactNode
}

export interface EvidenceListProps {
  items: EvidenceItem[]
  title?: string
  defaultOpen?: boolean
  className?: string
}

export function EvidenceList({
  items,
  title,
  defaultOpen = false,
  className = '',
}: EvidenceListProps) {
  const headerTitle = title || `命盤佐證(${items.length} 條)`

  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue={defaultOpen ? 'evidence' : undefined}
      className={className}
    >
      <Accordion.Item
        value="evidence"
        className={cn(
          'overflow-hidden rounded-xl border',
          'border-[var(--jy-border-soft)]',
          'bg-[var(--jy-bg-card)]/40',
        )}
      >
        <Accordion.Header>
          <Accordion.Trigger
            className={cn(
              'group flex w-full items-center justify-between gap-3 px-5 py-4',
              'text-left transition-colors',
              'hover:bg-[var(--jy-bg-mist)]/40',
              'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
            )}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="flex-shrink-0 text-xl text-[var(--jy-text-gold)]" aria-hidden>⟐</span>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-[var(--jy-text-primary)]">{headerTitle}</h4>
                <p className="mt-1 text-xs text-[var(--jy-text-tertiary)]">
                  點開查看本報告引用的具體命盤欄位
                </p>
              </div>
            </div>
            <svg
              className="flex-shrink-0 h-5 w-5 text-[var(--jy-text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180"
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Accordion.Trigger>
        </Accordion.Header>

        <Accordion.Content className="overflow-hidden">
          <div className="px-5 py-4 border-t border-[var(--jy-border-hairline)]">
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg p-3 bg-[var(--jy-bg-space)]/40 border border-[var(--jy-border-hairline)] hover:border-[var(--jy-border-gold)] transition-colors"
                >
                  <span
                    className="flex-shrink-0 inline-flex h-6 px-2 items-center justify-center rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: 'rgba(229, 185, 92, 0.15)',
                      color: 'var(--jy-text-gold)',
                    }}
                  >
                    {item.system}
                  </span>
                  <span className="flex-1 text-sm leading-relaxed text-[var(--jy-text-secondary)]">
                    {item.finding}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  )
}
