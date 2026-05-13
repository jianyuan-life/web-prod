// v5.10.208 — PracticeCard 處方箋風練習卡(Jamie 規格、practices5/practices 對應)
//
// 樣式:處方箋風(上方藥單格式線條 + 下方簽名章紋)
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export interface PracticeCardProps {
  title: string
  purpose?: string // 目的
  bond?: string // 連結命格
  duration?: string // 持續時間
  steps: string[] // 怎麼做(2-3 條)
  obstacle?: string // 最大障礙 / 失敗回復
  difficulty?: { easy?: string; mid?: string; hard?: string } // 三難度級
  className?: string
}

export function PracticeCard({
  title,
  purpose,
  bond,
  duration,
  steps,
  obstacle,
  difficulty,
  className = '',
}: PracticeCardProps) {
  return (
    <article
      className={cn(
        'relative rounded-xl p-6 overflow-hidden',
        'bg-[var(--jy-bg-card)]',
        'border border-[var(--jy-border-gold)]',
        'shadow-[var(--jy-shadow-card)]',
        className,
      )}
    >
      {/* 上方藥單線條(裝飾)*/}
      <div
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ background: 'var(--jy-gold-shimmer)' }}
        aria-hidden
      />

      <header className="flex items-start gap-3 mb-4">
        <span className="flex-shrink-0 text-2xl" aria-hidden>✿</span>
        <div className="flex-1 min-w-0">
          <h4
            className="font-semibold text-[var(--jy-text-gold)]"
            style={{ fontFamily: 'var(--jy-font-display)' }}
          >
            {title}
          </h4>
          {duration && (
            <p className="mt-0.5 text-xs text-[var(--jy-text-tertiary)]">⏱ {duration}</p>
          )}
        </div>
      </header>

      <div className="space-y-3 text-sm">
        {purpose && (
          <Section label="目的" content={purpose} />
        )}
        {bond && (
          <Section label="連結命格" content={bond} />
        )}

        {/* 步驟 */}
        <div>
          <h5 className="text-xs uppercase tracking-wider text-[var(--jy-text-muted)] mb-2">
            怎麼做
          </h5>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[var(--jy-text-secondary)]">
                <span
                  className="flex-shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: 'rgba(229, 185, 92, 0.15)',
                    color: 'var(--jy-text-gold)',
                  }}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {obstacle && (
          <div
            className="rounded p-3 mt-3"
            style={{
              backgroundColor: 'rgba(251, 191, 36, 0.06)',
              borderLeft: '3px solid var(--jy-semantic-balance)',
            }}
          >
            <p className="text-xs text-[var(--jy-semantic-balance)] font-medium mb-1">最大障礙</p>
            <p className="text-[var(--jy-text-secondary)]">{obstacle}</p>
          </div>
        )}

        {/* 難度三級 */}
        {difficulty && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--jy-border-hairline)]">
            {difficulty.easy && <DifficultyChip level="easy" text={difficulty.easy} />}
            {difficulty.mid && <DifficultyChip level="mid" text={difficulty.mid} />}
            {difficulty.hard && <DifficultyChip level="hard" text={difficulty.hard} />}
          </div>
        )}
      </div>

      {/* 下方簽名章紋(裝飾)*/}
      <div
        className="absolute bottom-3 right-3 text-xs opacity-30"
        style={{ color: 'var(--jy-text-gold)', fontFamily: 'var(--jy-font-display)' }}
        aria-hidden
      >
        鑒源 · 命格處方箋
      </div>
    </article>
  )
}

function Section({ label, content }: { label: string; content: ReactNode }) {
  return (
    <div>
      <h5 className="text-xs uppercase tracking-wider text-[var(--jy-text-muted)] mb-1">
        {label}
      </h5>
      <p className="text-[var(--jy-text-secondary)]">{content}</p>
    </div>
  )
}

function DifficultyChip({ level, text }: { level: 'easy' | 'mid' | 'hard'; text: string }) {
  const META = {
    easy: { color: 'var(--jy-semantic-flow)', icon: '🟢' },
    mid: { color: 'var(--jy-semantic-balance)', icon: '🟡' },
    hard: { color: 'var(--jy-semantic-danger)', icon: '🔴' },
  }
  const meta = META[level]
  return (
    <span
      className="flex-1 inline-flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px]"
      style={{
        backgroundColor: `${meta.color}15`,
        color: meta.color,
        border: `1px solid ${meta.color}40`,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      <span className="text-[var(--jy-text-secondary)]">{text}</span>
    </span>
  )
}
