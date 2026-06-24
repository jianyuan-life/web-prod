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
      {/* v5.10.459 eyebrow 重設計(老闆「目錄不美觀」+ nano-banana pro 概念):金色短線 + 「目錄」serif、棄過寬字距 TABLE OF CONTENTS */}
      <div className="flex items-center gap-2 mb-5 pl-3">
        <span className="w-5 h-px" style={{ background: 'var(--jy-text-gold)', opacity: 0.55 }} aria-hidden />
        <p className="text-[10px] tracking-[0.32em]" style={{ color: 'var(--jy-text-muted)', fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>目　錄</p>
      </div>
      <ol className="space-y-0.5">
        {items.map((item, idx) => {
          const isActive = activeId === item.id
          const isSubLevel = item.level === 2
          return (
            <li key={item.id}>
              {/* v5.10.459 active = 金漸層膠囊 + 金左條 + serif(nano-banana 概念);inactive = 極淡金左條構成連續導引線 */}
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                className="group flex items-center gap-2 rounded-md py-2 pr-2.5 transition-all duration-200"
                style={{
                  paddingLeft: isSubLevel ? '26px' : '12px',
                  background: isActive
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--jy-text-gold) 13%, transparent) 0%, transparent 92%)'
                    : 'transparent',
                  borderLeft: isActive
                    ? '2px solid var(--jy-text-gold)'
                    : '2px solid color-mix(in srgb, var(--jy-text-gold) 13%, transparent)',
                  color: isActive ? 'var(--jy-text-gold)' : 'var(--jy-text-tertiary)',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: isActive ? 'var(--jy-font-serif, "Noto Serif TC"), serif' : 'inherit',
                }}
              >
                {!isSubLevel && (
                  <span
                    className="inline-block w-6 text-[10px] tabular-nums flex-shrink-0"
                    style={{
                      fontFamily: 'var(--jy-font-mono), monospace',
                      color: isActive ? 'var(--jy-text-gold)' : 'var(--jy-text-muted)',
                      opacity: isActive ? 0.9 : 0.45,
                    }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                )}
                <span className="text-[12.5px] leading-snug group-hover:text-[var(--jy-text-gold)] transition-colors">
                  {item.label}
                </span>
              </a>
            </li>
          )
        })}
      </ol>

      {/* footer hint */}
      <p className="mt-6 text-[10px] pl-3" style={{ color: 'color-mix(in srgb, var(--jy-text-muted) 55%, transparent)' }}>
        捲動自動高亮 · 點擊跳轉
      </p>
    </nav>
  )
}
