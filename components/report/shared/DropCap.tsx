// v5.10.311 — Drop Cap 首字下沉(Gemini editorial pattern: The New Yorker / Monocle)
// 用於章節首段、editorial magazine 經典手法、提升 print 級閱讀體驗
import type { ReactNode } from 'react'

export interface DropCapProps {
  children: string  // 第一段文字、提取首字做 drop cap
  className?: string
}

export function DropCap({ children, className = '' }: DropCapProps) {
  if (!children || children.length === 0) return null
  const firstChar = children.charAt(0)
  const rest = children.slice(1)

  return (
    <p
      className={`mt-6 leading-[1.85] text-[var(--jy-text-secondary)] ${className}`}
      style={{
        fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
        fontSize: 'clamp(15px, 1.4vw, 17px)',
      }}
    >
      <span
        className="float-left mr-3 text-[var(--jy-text-gold)]"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
          fontSize: 'clamp(56px, 7vw, 88px)',
          lineHeight: 0.85,
          marginTop: '6px',
          marginBottom: '-4px',
          fontWeight: 400,
          letterSpacing: '-0.02em',
        }}
        aria-hidden
      >
        {firstChar}
      </span>
      {rest}
    </p>
  )
}

// PullQuote — editorial 中段引言區塊(The New Yorker / Atlantic pattern)
export interface PullQuoteProps {
  children: ReactNode
  attribution?: string  // optional 出處(古籍 / 派別)
  className?: string
}

export function PullQuote({ children, attribution, className = '' }: PullQuoteProps) {
  return (
    <figure
      className={`my-12 mx-auto max-w-2xl text-center ${className}`}
      role="blockquote"
    >
      {/* 上方裝飾線 */}
      <div className="h-px w-16 bg-[var(--jy-text-gold)]/40 mx-auto mb-8" aria-hidden />

      {/* 引號 + 引言 */}
      <blockquote
        className="italic text-[var(--jy-text-primary)]"
        style={{
          fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
          fontSize: 'clamp(20px, 2.2vw, 28px)',
          lineHeight: 1.5,
          letterSpacing: '-0.01em',
        }}
      >
        <span
          className="text-[var(--jy-text-gold)]/40 align-top inline-block mr-1"
          style={{ fontSize: '1.5em', lineHeight: 0.5 }}
          aria-hidden
        >
          &ldquo;
        </span>
        {children}
        <span
          className="text-[var(--jy-text-gold)]/40 align-bottom inline-block ml-1"
          style={{ fontSize: '1.5em', lineHeight: 0.5 }}
          aria-hidden
        >
          &rdquo;
        </span>
      </blockquote>

      {/* 出處 attribution */}
      {attribution && (
        <figcaption
          className="mt-6 text-[10px] tracking-[0.2em] text-[var(--jy-text-muted)]"
          style={{ fontFamily: 'var(--jy-font-mono), monospace' }}
        >
          — {attribution.split('').join(' ')}
        </figcaption>
      )}

      {/* 下方裝飾線 */}
      <div className="h-px w-16 bg-[var(--jy-text-gold)]/40 mx-auto mt-8" aria-hidden />
    </figure>
  )
}

// ExecutiveSummary — McKinsey/consulting pattern「一分鐘看懂」box
export interface ExecutiveSummaryProps {
  bullets: string[]  // 3-5 條核心命理重點
  title?: string
  className?: string
}

export function ExecutiveSummary({ bullets, title = '一分鐘看懂', className = '' }: ExecutiveSummaryProps) {
  return (
    <aside
      className={`my-8 px-6 py-7 border-l-2 border-r border-y border-[var(--jy-text-gold)]/30 ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(201,168,76,0.04) 0%, transparent 60%)',
        borderLeftColor: 'var(--jy-text-gold)',
        borderLeftWidth: '3px',
      }}
      aria-label="執行摘要"
    >
      {/* small caps eyebrow */}
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px w-6 bg-[var(--jy-text-gold)]/60" aria-hidden />
        <p
          className="text-[10px] tracking-[0.25em] text-[var(--jy-text-gold)]"
          style={{ fontFamily: 'var(--jy-font-mono), monospace' }}
        >
          {title.split('').join(' ').toUpperCase()}
        </p>
      </div>

      {/* bullet list */}
      <ol className="space-y-3 ml-1">
        {bullets.map((b, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-[var(--jy-text-secondary)]"
            style={{
              fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif',
              fontSize: 'clamp(14px, 1.3vw, 16px)',
              lineHeight: 1.7,
            }}
          >
            <span
              className="flex-shrink-0 text-[10px] tabular-nums tracking-[0.15em] text-[var(--jy-text-gold)]/70 mt-1.5"
              style={{ fontFamily: 'var(--jy-font-mono), monospace' }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1">{b}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
