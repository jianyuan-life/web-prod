// v5.10.228 — HeroBlock 三變體(Jamie 規格、生成式 hero、wire 既有 ScoreCircle/VerdictBadge)
//
// variants:
//   score      — HeartDoubts(ScoreCircle B+/79)
//   verdict    — Compatibility(VerdictBadge ⚡合但有雷區、雙人 ✕)
//   family     — FamilyBlueprint(三人剪影圈 + 中央連線)
//
// 不重複建 component、純拼既有
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ScoreCircle, type ScoreGrade } from './ScoreCircle'
import { VerdictBadge, type Verdict } from './VerdictBadge'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

// === Score variant ===
export interface ScoreHeroProps {
  variant: 'score'
  eyebrow: string
  name: string
  birthDate?: string
  durations?: { short: number; full: number }
  grade: ScoreGrade
  value: number
  percentile?: number
  challengeLevel?: '低' | '中' | '高'
  systemsCount?: number
}

// === Verdict variant ===
export interface VerdictHeroProps {
  variant: 'verdict'
  eyebrow: string
  nameA: string
  nameB: string
  scenario: string
  durations?: { short: number; full: number }
  verdict: Verdict
  verdictSubtitle?: string
}

// === Family variant ===
export interface FamilyHeroProps {
  variant: 'family'
  eyebrow: string
  familyName: string
  members: { role: string; name: string; dayMaster?: string }[]
  durations?: { short: number; full: number }
}

export type HeroBlockProps = ScoreHeroProps | VerdictHeroProps | FamilyHeroProps

export function HeroBlock(props: HeroBlockProps) {
  switch (props.variant) {
    case 'score':
      return <ScoreHero {...props} />
    case 'verdict':
      return <VerdictHero {...props} />
    case 'family':
      return <FamilyHero {...props} />
    default: {
      const _exhaustive: never = props
      return null
    }
  }
}

function ScoreHero({ eyebrow, name, birthDate, durations, grade, value, percentile, challengeLevel, systemsCount }: ScoreHeroProps) {
  return (
    <section className="mb-16 grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
      <div className="flex flex-col items-center lg:items-start">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1
          className="mt-6 font-bold"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            background: 'var(--jy-gold-shimmer)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {name}
        </h1>
        {birthDate && (
          <p className="mt-4 text-[var(--jy-text-tertiary)]">
            出生:<span className="text-[var(--jy-text-secondary)]">{new Date(birthDate).toLocaleDateString('zh-TW')}</span>
          </p>
        )}
        {durations && (
          <p className="mt-1 text-xs text-[var(--jy-text-muted)]">
            精華 {durations.short} 分鐘 · 完整 {durations.full} 分鐘
          </p>
        )}
      </div>
      <div className="flex flex-col items-center">
        <ScoreCircle
          grade={grade}
          value={value}
          percentile={percentile}
          challengeLevel={challengeLevel}
          size={280}
        />
        {systemsCount && (
          <p className="mt-4 text-xs text-[var(--jy-text-muted)]">
            {systemsCount} 套系統交叉分析
          </p>
        )}
      </div>
    </section>
  )
}

function VerdictHero({ eyebrow, nameA, nameB, scenario, durations, verdict, verdictSubtitle }: VerdictHeroProps) {
  return (
    <section className="mb-16 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <HeroName name={nameA} />
        <span
          className="text-[var(--jy-text-gold)] cross-rotate"
          style={{ fontSize: 'clamp(28px, 3vw, 48px)' }}
          aria-hidden
        >
          ✕
        </span>
        <HeroName name={nameB} />
      </div>
      <p className="mt-4 text-[var(--jy-text-tertiary)]">
        場景:<span className="text-[var(--jy-text-secondary)]">{scenario}</span>
        {durations && <> · 精華 {durations.short} 分鐘 · 完整 {durations.full} 分鐘</>}
      </p>
      <div className="mt-10 flex justify-center">
        <VerdictBadge verdict={verdict} subtitle={verdictSubtitle} size="lg" />
      </div>
      <style>{`
        .cross-rotate { animation: cross-rotate-anim 8s linear infinite; display: inline-block; }
        @keyframes cross-rotate-anim { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .cross-rotate { animation: none; } }
      `}</style>
    </section>
  )
}

function FamilyHero({ eyebrow, familyName, members, durations }: FamilyHeroProps) {
  return (
    <section className="mb-16 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1
        className="mt-8 font-bold"
        style={{
          fontFamily: 'var(--jy-font-display)',
          fontSize: 'clamp(48px, 6vw, 88px)',
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          background: 'var(--jy-gold-shimmer)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {familyName}
      </h1>
      <p className="mt-4 text-[var(--jy-text-tertiary)]">
        {members.length} 位成員
        {durations && <> · 精華 {durations.short} 分鐘 · 完整 {durations.full} 分鐘</>}
      </p>
      <div className="mt-10 flex justify-center gap-6 flex-wrap">
        {members.map((m) => (
          <div key={m.name} className="flex flex-col items-center">
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center font-bold text-xl"
              style={{
                background: 'var(--jy-gold-shimmer)',
                color: '#0A0E1A',
                fontFamily: 'var(--jy-font-display)',
              }}
              aria-label={`${m.role} ${m.name}`}
            >
              {m.role}
            </div>
            <p className="mt-3 text-[var(--jy-text-secondary)]">{m.name}</p>
            {m.dayMaster && (
              <p className="text-xs text-[var(--jy-text-muted)]">日主 {m.dayMaster}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function HeroName({ name }: { name: string }) {
  return (
    <h1
      className="font-bold"
      style={{
        fontFamily: 'var(--jy-font-display)',
        fontSize: 'clamp(36px, 5vw, 72px)',
        lineHeight: 1.1,
        background: 'var(--jy-gold-shimmer)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {name}
    </h1>
  )
}
