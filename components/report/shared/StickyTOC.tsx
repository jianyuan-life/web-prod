// v5.10.310 — Sticky TOC + IntersectionObserver scrollspy(QA agent P0 #1 + Gemini Substack pattern)
//
// 用法:LifeBlueprintReport / HeartDoubts / FamilyBlueprint / Compatibility 共用
// 設計 reference:Substack long-form / Stratechery / The New Yorker article TOC
// 客戶可在桌面 1280+ 一眼看到所有 section、scroll 時 active state 跟隨
'use client'

import { useEffect, useState } from 'react'

export interface TOCItem {
  id: string  // section id (對應 <section id={id}>)
  label: string  // 顯示標籤
  level?: 1 | 2  // 1 = H2 主章 / 2 = H3 子節
}

export interface StickyTOCProps {
  items: TOCItem[]
  className?: string
}

export function StickyTOC({ items, className = '' }: StickyTOCProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    // scrollspy:當 section 進入 viewport 上 30% 時 active
    const observer = new IntersectionObserver(
      (entries) => {
        // 找最靠近 viewport 上方的可見 section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        // top 100px 開始算、bottom 60% 不算(主動區在 viewport 上 30%)
        rootMargin: '-100px 0px -60% 0px',
        threshold: 0,
      },
    )

    items.forEach((item) => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [items])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) {
      // smooth scroll、offset 80px(避開 sticky toolbar)
      const top = el.getBoundingClientRect().top + window.pageYOffset - 80
      window.scrollTo({ top, behavior: 'smooth' })
      // URL hash 同步、瀏覽器歷史保留
      window.history.replaceState(null, '', `#${id}`)
    }
  }

  return (
    <nav
      className={`hidden xl:block sticky top-24 self-start ${className}`}
      aria-label="報告章節導航"
    >
      {/* small caps eyebrow */}
      <p
        className="text-[10px] tracking-[0.25em] text-[var(--jy-text-muted)] mb-4"
        style={{ fontFamily: 'var(--jy-font-mono), monospace' }}
      >
        T  A  B  L  E    O  F    C  O  N  T  E  N  T  S
      </p>
      <ol className="space-y-1.5 border-l border-[var(--jy-border-hairline)]">
        {items.map((item, idx) => {
          const isActive = activeId === item.id
          const isSubLevel = item.level === 2
          return (
            <li key={item.id} className="relative">
              {/* active indicator(hairline left bar)*/}
              {isActive && (
                <span
                  className="absolute -left-px top-0 bottom-0 w-px bg-[var(--jy-text-gold)]"
                  aria-hidden
                />
              )}
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                className="block py-1.5 text-xs leading-relaxed transition-colors group"
                style={{
                  paddingLeft: isSubLevel ? '32px' : '16px',
                  color: isActive
                    ? 'var(--jy-text-gold)'
                    : 'var(--jy-text-tertiary)',
                  fontWeight: isActive ? 500 : 400,
                  fontFamily: isActive
                    ? 'var(--jy-font-serif, "Noto Serif TC"), serif'
                    : 'inherit',
                }}
              >
                {/* chapter ordinal(只 level 1 顯示)*/}
                {!isSubLevel && (
                  <span
                    className="inline-block w-7 text-[10px] tabular-nums"
                    style={{
                      fontFamily: 'var(--jy-font-mono), monospace',
                      color: isActive ? 'var(--jy-text-gold)' : 'var(--jy-text-muted)',
                      opacity: isActive ? 1 : 0.5,
                    }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                )}
                <span className="group-hover:text-[var(--jy-text-gold)] transition-colors">
                  {item.label}
                </span>
              </a>
            </li>
          )
        })}
      </ol>

      {/* footer hint */}
      <p className="mt-6 text-[10px] text-[var(--jy-text-muted)]/60 pl-4">
        scroll 時自動高亮 · click 跳轉
      </p>
    </nav>
  )
}
