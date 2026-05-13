// v5.10.208 — MonthlyDecisionTable 月份決策表(Jamie 規格、HeartDoubts/LifeBlueprint timing 對應)
//
// 樣式:月份/行動/命理依據/注意 4 欄、可高亮「全年最佳簽約月」
//   高亮列:金色背景、edge glow、☆ icon
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export interface MonthlyRow {
  period: string // 月份 / 期間
  action: string // 建議行動
  reason: string // 命理依據
  note?: string // 注意事項
  highlight?: boolean // 標示為最佳月份
}

export interface MonthlyDecisionTableProps {
  rows: MonthlyRow[]
  title?: string
  className?: string
}

export function MonthlyDecisionTable({
  rows,
  title = '月份決策表',
  className = '',
}: MonthlyDecisionTableProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <h3 className="font-semibold text-lg text-[var(--jy-text-primary)]">📅 {title}</h3>
      )}

      {/* Desktop:傳統 table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[var(--jy-border-soft)]">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--jy-bg-card)]/60 border-b border-[var(--jy-border-soft)]">
              <Th>期間</Th>
              <Th>建議行動</Th>
              <Th>命理依據</Th>
              <Th>注意事項</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-b border-[var(--jy-border-hairline)] last:border-0 transition-colors hover:bg-[var(--jy-bg-mist)]/30',
                  row.highlight && 'monthly-highlight',
                )}
              >
                <Td>
                  <span className="font-medium text-[var(--jy-text-gold)] inline-flex items-center gap-1">
                    {row.highlight && <span aria-label="最佳期間" title="最佳期間">★</span>}
                    {row.period}
                  </span>
                </Td>
                <Td>{row.action}</Td>
                <Td className="text-sm text-[var(--jy-text-tertiary)]">{row.reason}</Td>
                <Td className="text-sm text-[var(--jy-text-tertiary)]">
                  {row.note || <span className="text-[var(--jy-text-muted)]">—</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile:卡片堆疊 */}
      <div className="md:hidden space-y-3">
        {rows.map((row, i) => (
          <article
            key={i}
            className={cn(
              'rounded-xl p-4 border border-[var(--jy-border-soft)] bg-[var(--jy-bg-card)]/40',
              row.highlight && 'monthly-highlight',
            )}
          >
            <header className="flex items-center gap-2 mb-2">
              {row.highlight && <span className="text-[var(--jy-text-gold)]" aria-label="最佳期間">★</span>}
              <h4 className="font-medium text-[var(--jy-text-gold)]">{row.period}</h4>
            </header>
            <p className="text-sm text-[var(--jy-text-primary)] mb-2">{row.action}</p>
            <p className="text-xs text-[var(--jy-text-tertiary)] mb-1">
              <span className="text-[var(--jy-text-muted)]">依據:</span> {row.reason}
            </p>
            {row.note && (
              <p className="text-xs text-[var(--jy-text-tertiary)]">
                <span className="text-[var(--jy-text-muted)]">注意:</span> {row.note}
              </p>
            )}
          </article>
        ))}
      </div>

      <style>{`
        .monthly-highlight {
          background: linear-gradient(90deg, rgba(229, 185, 92, 0.12), rgba(229, 185, 92, 0.06)) !important;
          box-shadow: inset 0 0 0 1px rgba(229, 185, 92, 0.30);
        }
      `}</style>
    </div>
  )
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="text-left text-xs font-semibold text-[var(--jy-text-muted)] uppercase tracking-wider px-4 py-3">
      {children}
    </th>
  )
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-3 text-[var(--jy-text-secondary)]', className)}>{children}</td>
  )
}
