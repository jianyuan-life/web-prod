'use client'

/**
 * v5.10.146 DS4 #3 浮動 prev/next button + mobile bottom bar 整合(連貫性 +8)
 *
 * desktop: 浮動 prev/next 在右下(SidebarTOC 之外、給已知章節快速跳)
 * mobile: sticky bottom 全寬 bar「← 上章 | 📑 目錄 | 下章 →」(整合 v5.10.144 FAB)
 *
 * 跟 ScrollSpy 連動讀當前 idx、按鈕 href 跳 prev/next sec-{idx}
 *
 * 業界共識:Vercel Docs / Linear / Stripe 全用 prev-next + sticky mobile bar
 */
import { useEffect, useState } from 'react'

interface ChapterNavProps {
  totalSections: number
  hasMobileTOC: boolean
}

export default function ChapterNav({ totalSections, hasMobileTOC }: ChapterNavProps) {
  const [currentIdx, setCurrentIdx] = useState<number>(-1)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const active = document.querySelector('.toc-link[data-active="true"]') as HTMLAnchorElement | null
      if (active) {
        const href = active.getAttribute('href') || ''
        const m = href.match(/#sec-(\d+)/)
        if (m) {
          const idx = parseInt(m[1], 10)
          if (idx !== currentIdx) setCurrentIdx(idx)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [currentIdx])

  if (totalSections < 4) return null

  const prevIdx = currentIdx > 0 ? currentIdx - 1 : -1
  const nextIdx = currentIdx >= 0 && currentIdx < totalSections - 1 ? currentIdx + 1 : -1

  return (
    <>
      {/* mobile sticky bottom bar(整合 prev / TOC / next) */}
      <nav
        className="fixed bottom-0 inset-x-0 lg:hidden z-50 no-print flex items-stretch backdrop-blur-md"
        style={{
          background: 'rgba(15,22,40,0.95)',
          borderTop: '1px solid rgba(212,175,55,0.30)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-label="章節導航"
      >
        <a
          href={prevIdx >= 0 ? `#sec-${prevIdx}` : '#'}
          className={`flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium ${prevIdx < 0 ? 'opacity-30 pointer-events-none' : 'active:bg-gold/10'}`}
          style={{ color: prevIdx >= 0 ? 'rgba(232,220,178,0.85)' : 'rgba(232,220,178,0.40)' }}
          aria-label="上一章"
        >
          <span>←</span><span>上章</span>
        </a>
        {hasMobileTOC && (
          <a
            href="#mobile-toc"
            className="flex-1 flex items-center justify-center gap-1 py-3 text-sm font-semibold active:bg-gold/10"
            style={{
              color: '#c9a84c',
              borderLeft: '1px solid rgba(212,175,55,0.20)',
              borderRight: '1px solid rgba(212,175,55,0.20)',
            }}
            aria-label="目錄"
          >
            <span>📑</span><span>目錄</span>
          </a>
        )}
        <a
          href={nextIdx >= 0 ? `#sec-${nextIdx}` : '#'}
          className={`flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium ${nextIdx < 0 ? 'opacity-30 pointer-events-none' : 'active:bg-gold/10'}`}
          style={{ color: nextIdx >= 0 ? 'rgba(232,220,178,0.85)' : 'rgba(232,220,178,0.40)' }}
          aria-label="下一章"
        >
          <span>下章</span><span>→</span>
        </a>
      </nav>

      {/* desktop 浮動 prev/next 在右下(SidebarTOC 已有完整 TOC、這裡只給快速跳) */}
      <div
        className="hidden lg:flex fixed bottom-8 right-8 z-40 no-print flex-col gap-2"
        aria-label="章節快速跳"
      >
        <a
          href={prevIdx >= 0 ? `#sec-${prevIdx}` : '#'}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-lg ${prevIdx < 0 ? 'opacity-30 pointer-events-none' : 'hover:bg-gold/20'}`}
          style={{
            background: 'rgba(15,22,40,0.85)',
            border: '1px solid rgba(212,175,55,0.30)',
            color: prevIdx >= 0 ? '#c9a84c' : 'rgba(232,220,178,0.30)',
            transition: 'all var(--motion-fast, 150ms) var(--easing-standard, cubic-bezier(0.2, 0, 0, 1))',
          }}
          aria-label="上一章"
          title="上一章"
        >
          ↑
        </a>
        <a
          href={nextIdx >= 0 ? `#sec-${nextIdx}` : '#'}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-lg ${nextIdx < 0 ? 'opacity-30 pointer-events-none' : 'hover:bg-gold/20'}`}
          style={{
            background: 'rgba(15,22,40,0.85)',
            border: '1px solid rgba(212,175,55,0.30)',
            color: nextIdx >= 0 ? '#c9a84c' : 'rgba(232,220,178,0.30)',
            transition: 'all var(--motion-fast, 150ms) var(--easing-standard, cubic-bezier(0.2, 0, 0, 1))',
          }}
          aria-label="下一章"
          title="下一章"
        >
          ↓
        </a>
      </div>
    </>
  )
}
