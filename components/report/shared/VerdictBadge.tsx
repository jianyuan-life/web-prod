// v5.10.206 Sprint 1 — VerdictBadge 判定徽章(Jamie 規格、Compatibility 報告核心 hero)
//
// 樣式:pill 大字 + 脈動光暈 2s ease-in-out infinite
// 4 種判定:
//   合 ✅ green
//   合但有雷區 ⚡ amber
//   需要磨合 🔧 blue
//   不合 ❌ red
export type Verdict = '合' | '合但有雷區' | '需要磨合' | '不合'

export interface VerdictBadgeProps {
  verdict: Verdict
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const VERDICT_META: Record<Verdict, { icon: string; color: string; gradient: string; glow: string }> = {
  '合': {
    icon: '✅',
    color: 'var(--jy-semantic-flow)',
    gradient: 'linear-gradient(135deg, #4ADE80 0%, #22C55E 100%)',
    glow: 'rgba(74, 222, 128, 0.5)',
  },
  '合但有雷區': {
    icon: '⚡',
    color: 'var(--jy-semantic-balance)',
    gradient: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)',
    glow: 'rgba(251, 191, 36, 0.5)',
  },
  '需要磨合': {
    icon: '🔧',
    color: 'var(--jy-semantic-water)',
    gradient: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
    glow: 'rgba(96, 165, 250, 0.5)',
  },
  '不合': {
    icon: '❌',
    color: 'var(--jy-semantic-danger)',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    glow: 'rgba(239, 68, 68, 0.5)',
  },
}

const SIZE_CLASSES = {
  sm: { pill: 'h-10 px-5 text-base', icon: 'text-lg' },
  md: { pill: 'h-14 px-7 text-xl', icon: 'text-2xl' },
  lg: { pill: 'h-20 px-10 text-3xl', icon: 'text-4xl' },
}

export function VerdictBadge({ verdict, subtitle, size = 'lg', className = '' }: VerdictBadgeProps) {
  const meta = VERDICT_META[verdict]
  const sz = SIZE_CLASSES[size]

  return (
    <div className={`inline-flex flex-col items-center gap-3 ${className}`}>
      <div
        className={`inline-flex items-center gap-2 rounded-full font-bold text-white verdict-pulse ${sz.pill}`}
        style={{
          background: meta.gradient,
          boxShadow: `0 0 0 1px ${meta.color}, 0 0 30px ${meta.glow}`,
        }}
        role="img"
        aria-label={`合盤判定:${verdict}`}
      >
        <span className={sz.icon} aria-hidden>{meta.icon}</span>
        <span>{verdict}</span>
      </div>
      {subtitle ? (
        <p className="text-sm text-[var(--jy-text-tertiary)]">{subtitle}</p>
      ) : null}

      {/* 脈動動畫 — prefers-reduced-motion 自動 disable */}
      <style>{`
        .verdict-pulse {
          animation: verdict-pulse-anim 2s ease-in-out infinite;
        }
        @keyframes verdict-pulse-anim {
          0%, 100% { box-shadow: 0 0 0 1px ${meta.color}, 0 0 20px ${meta.glow}; }
          50%      { box-shadow: 0 0 0 1px ${meta.color}, 0 0 40px ${meta.glow}; }
        }
        @media (prefers-reduced-motion: reduce) {
          .verdict-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
