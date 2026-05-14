// v5.10.228 — HeroBlock 三變體(Jamie 規格、生成式 hero、wire 既有 ScoreCircle/VerdictBadge)
// v5.10.296 editorial redesign:
//   - 砍 shimmer gradient 金字標題 → solid serif gold
//   - 砍 ScoreCircle 大數字 SaaS 感 → editorial verdict statement
//   - 加 Issue line(委託人/系列/簽發日)editorial pattern
//   - cross-rotate animation 砍(過度炫技)
//
// variants:
//   score      — HeartDoubts(評等改 editorial verdict)
//   verdict    — Compatibility(雙人 × 改 hairline + serif)
//   family     — FamilyBlueprint(三人剪影圈 → 改 editorial 家族卷首)
//
// 不重複建 component、純拼既有
import { ScoreCircle, type ScoreGrade } from './ScoreCircle'
import { VerdictBadge, type Verdict } from './VerdictBadge'

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

// v5.10.296 editorial Issue line — 共用 helper(magazine 慣例)
function IssueLine({ label, name, durations }: { label: string; name: string; durations?: { short: number; full: number } }) {
  return (
    <div className="mt-10 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] tracking-[0.18em] text-[var(--jy-text-muted)]">
      <span>委 託 人 · {name}</span>
      <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
      <span>系 列 · {label}</span>
      {durations && (
        <>
          <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
          <span>{durations.full} 分 鐘 通 讀</span>
        </>
      )}
    </div>
  )
}

function ScoreHero({ name, birthDate, durations, grade, value, percentile, challengeLevel, systemsCount }: ScoreHeroProps) {
  // v5.10.296 grade → 文字判詞(editorial verdict)
  const gradeStatement = (() => {
    if (grade === 'A+' || grade === 'A') return '局勢明朗 · 順流而行'
    if (grade === 'B+' || grade === 'B') return '局勢有解 · 智慧抉擇'
    if (grade === 'C+' || grade === 'C') return '挑戰當前 · 深思而動'
    return '危機四伏 · 守靜為上'
  })()

  return (
    <section className="mb-20 text-center">
      {/* eyebrow:純中文系列分類(去 ALL CAPS 混排)*/}
      <p className="text-[10px] tracking-[0.3em] text-[var(--jy-text-muted)] mb-2">
        鑒  源  心  之  所  惑  分  析
      </p>
      <p className="text-[12px] tracking-[0.18em] text-[var(--jy-text-gold)]">
        Vol. II  ·  深 度 占 問
      </p>

      {/* 主姓名:solid gold serif、不再 shimmer */}
      <h1
        className="mt-10 font-normal"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
          fontSize: 'clamp(40px, 5vw, 72px)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--jy-text-gold)',
        }}
      >
        {name}
      </h1>

      {/* editorial verdict statement(取代 ScoreCircle 大數字)*/}
      <p
        className="mt-8 italic text-[var(--jy-text-secondary)]"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
          fontSize: 'clamp(20px, 2vw, 28px)',
          lineHeight: 1.6,
        }}
      >
        {gradeStatement}
      </p>

      {/* small grade badge(評分降為次要、不主導視覺)*/}
      <div className="mt-6 inline-flex items-center gap-3 text-[12px] tracking-[0.12em] text-[var(--jy-text-muted)]">
        <span>整 體 評 等</span>
        <span
          className="font-medium text-[var(--jy-text-gold)]"
          style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: '18px' }}
        >
          {grade}
        </span>
        {percentile && (
          <>
            <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
            <span>同 級 {percentile}% 以 內</span>
          </>
        )}
        {challengeLevel && (
          <>
            <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
            <span>挑 戰 度 · {challengeLevel}</span>
          </>
        )}
      </div>

      {/* metadata: 生日 + 系統數 + durations、small caps editorial footer */}
      {(birthDate || systemsCount) && (
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[10px] tracking-[0.15em] text-[var(--jy-text-tertiary)]">
          {birthDate && <span>{new Date(birthDate).toLocaleDateString('zh-TW')}</span>}
          {birthDate && systemsCount && <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />}
          {systemsCount && <span>{systemsCount} 套 系 統 交 叉</span>}
        </div>
      )}

      <IssueLine label="心之所惑" name={name} durations={durations} />

      {/* 隱藏的 ScoreCircle 留作 PDF / SEO fallback、不顯示 */}
      <span className="sr-only">
        <ScoreCircle grade={grade} value={value} percentile={percentile} challengeLevel={challengeLevel} />
      </span>
    </section>
  )
}

function VerdictHero({ nameA, nameB, scenario, durations, verdict, verdictSubtitle }: VerdictHeroProps) {
  return (
    <section className="mb-20 text-center">
      {/* eyebrow */}
      <p className="text-[10px] tracking-[0.3em] text-[var(--jy-text-muted)] mb-2">
        鑒  源  關  係  合  盤  分  析
      </p>
      <p className="text-[12px] tracking-[0.18em] text-[var(--jy-text-gold)]">
        Vol. III  ·  合 否 判 詞
      </p>

      {/* 雙人 × — 砍 cross-rotate animation、改 editorial hairline */}
      <div className="mt-10 inline-flex items-baseline justify-center gap-6">
        <h1 style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--jy-text-gold)', fontWeight: 'normal', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {nameA}
        </h1>
        <span
          className="text-[var(--jy-text-gold)]/60"
          style={{ fontSize: 'clamp(24px, 2.5vw, 36px)', fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}
          aria-hidden
        >
          ·
        </span>
        <h1 style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--jy-text-gold)', fontWeight: 'normal', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {nameB}
        </h1>
      </div>

      {/* scenario subtitle */}
      <p
        className="mt-8 italic text-[var(--jy-text-secondary)]"
        style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: 'clamp(17px, 1.6vw, 21px)', lineHeight: 1.7 }}
      >
        {scenario}
      </p>

      {/* verdict — small but distinct */}
      <div className="mt-10 flex justify-center">
        <VerdictBadge verdict={verdict} subtitle={verdictSubtitle} size="lg" />
      </div>

      <IssueLine label="合否?" name={`${nameA} × ${nameB}`} durations={durations} />
    </section>
  )
}

function FamilyHero({ familyName, members, durations }: FamilyHeroProps) {
  return (
    <section className="mb-20 text-center">
      {/* eyebrow */}
      <p className="text-[10px] tracking-[0.3em] text-[var(--jy-text-muted)] mb-2">
        鑒  源  家  族  藍  圖  分  析
      </p>
      <p className="text-[12px] tracking-[0.18em] text-[var(--jy-text-gold)]">
        Vol. IV  ·  家 族 藍 圖
      </p>

      {/* 家族名 — solid serif gold */}
      <h1
        className="mt-10 font-normal"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
          fontSize: 'clamp(40px, 5vw, 72px)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--jy-text-gold)',
        }}
      >
        {familyName}
      </h1>

      <p
        className="mt-4 italic text-[var(--jy-text-secondary)]"
        style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: 'clamp(16px, 1.4vw, 19px)', lineHeight: 1.6 }}
      >
        {members.length} 位 成 員 ·  跨 代 動 力 · 家 族 業 力
      </p>

      {/* members:editorial 家族成員列表(去 round avatar + shimmer)*/}
      <div className="mt-10 inline-flex flex-wrap justify-center gap-x-10 gap-y-6 max-w-3xl">
        {members.map((m, i) => (
          <div key={m.name} className="flex flex-col items-center">
            {/* 編號 chapter-style ordinal */}
            <span
              className="text-[10px] tracking-[0.2em] text-[var(--jy-text-muted)] mb-2 font-mono"
              style={{ fontFamily: 'var(--jy-font-mono), monospace' }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div
              className="h-px w-12 bg-[var(--jy-text-gold)]/40 mb-3"
              aria-hidden
            />
            <p
              className="text-[var(--jy-text-gold)]"
              style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontSize: '24px', lineHeight: 1.2 }}
            >
              {m.name}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.15em] text-[var(--jy-text-muted)]">{m.role}</p>
            {m.dayMaster && (
              <p className="mt-1 text-[10px] tracking-[0.1em] text-[var(--jy-text-tertiary)]">
                日 主 · <span className="text-[var(--jy-text-gold)]/80">{m.dayMaster}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      <IssueLine label="家族藍圖" name={familyName} durations={durations} />
    </section>
  )
}
