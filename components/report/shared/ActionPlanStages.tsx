// v5.10.208 Sprint 1 — ActionPlanStages 三階段行動卡牌(Jamie 規格、LifeBlueprint planStages 對應)
//
// 樣式:三階段卡橫排(立刻/短期/長期)、不同 accent 色
import { cn } from '@/lib/utils'

export interface PlanItem {
  action: string
  why?: string
  how?: string
  alignment?: string
  checkpoint?: string
  outcome?: string
  deadline?: string
}

export interface ActionPlanStagesProps {
  immediate: PlanItem[] // 立刻可做
  short: PlanItem[] // 短期(1-3 月)
  long: PlanItem[] // 長期(>3 月)
  className?: string
}

// v5.10.297 editorial:砍 emoji icons、改 chapter ordinal(I/II/III roman numerals editorial 慣例)
const STAGE_META = [
  { key: 'immediate', label: '立刻可做', ordinal: 'I', color: 'var(--jy-semantic-flow)', bg: 'rgba(74, 222, 128, 0.08)' },
  { key: 'short', label: '短期(1-3 月)', ordinal: 'II', color: 'var(--jy-semantic-balance)', bg: 'rgba(251, 191, 36, 0.08)' },
  { key: 'long', label: '長期(>3 月)', ordinal: 'III', color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.08)' },
] as const

export function ActionPlanStages({ immediate, short, long, className = '' }: ActionPlanStagesProps) {
  const stages = { immediate, short, long }

  return (
    <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-3', className)}>
      {STAGE_META.map((meta) => {
        const items = stages[meta.key as keyof typeof stages]
        return (
          <div
            key={meta.key}
            className={cn(
              'rounded-xl p-5 border',
              'border-[var(--jy-border-soft)]',
            )}
            style={{ backgroundColor: meta.bg }}
          >
            {/* v5.10.297 editorial:emoji icon → roman numeral chapter style */}
            <div className="flex items-baseline gap-3 mb-4">
              <span
                className="font-mono text-[11px] tracking-[0.2em]"
                style={{ color: meta.color, fontFamily: 'var(--jy-font-mono), monospace', opacity: 0.7 }}
              >
                {meta.ordinal}
              </span>
              <span className="h-px flex-1 max-w-8" style={{ background: meta.color, opacity: 0.3 }} aria-hidden />
              <h4
                className="font-semibold text-sm tracking-wide"
                style={{ color: meta.color, wordBreak: 'keep-all' }}
              >
                {meta.label}
              </h4>
            </div>
            <ul className="space-y-4">
              {items.map((item, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium text-[var(--jy-text-primary)]">
                    {item.action}
                  </p>
                  {(item.why || item.alignment) && (
                    <p className="mt-1 text-xs text-[var(--jy-text-tertiary)]">
                      <span className="text-[var(--jy-text-muted)]">為什麼:</span>{' '}
                      {item.why || item.alignment}
                    </p>
                  )}
                  {(item.how || item.checkpoint || item.outcome) && (
                    <p className="mt-1 text-xs text-[var(--jy-text-tertiary)]">
                      <span className="text-[var(--jy-text-muted)]">怎麼做:</span>{' '}
                      {item.how || item.checkpoint || item.outcome}
                    </p>
                  )}
                  {item.deadline && (
                    <p className="mt-1 text-xs" style={{ color: meta.color }}>
                      截止 · {item.deadline}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
