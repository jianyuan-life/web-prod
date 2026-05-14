'use client'

/**
 * v5.10.145 DS4 #2 麵包屑導航 — 客戶位置感(連貫性 +10)
 *
 * 跟 ScrollSpy 連動:讀 .toc-link[data-active="true"] 的 textContent 顯示當前章節
 * sticky 在 page top 之下、滾到第 N 章時自動顯示「鑑源 / 第 N 章」
 *
 * 業界共識:Stripe / Linear / Notion 全用 sticky breadcrumb 給客戶位置感
 */
import { useEffect, useState } from 'react'

export default function ReportBreadcrumb({ planName }: { planName: string }) {
  const [currentChapter, setCurrentChapter] = useState<string>('')

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const active = document.querySelector('.toc-link[data-active="true"]')
      if (active) {
        const text = active.textContent?.trim() || ''
        if (text && text !== currentChapter) setCurrentChapter(text.slice(0, 30))
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [currentChapter])

  if (!currentChapter) return null

  return (
    <nav
      className="sticky top-14 z-30 no-print backdrop-blur-md hidden sm:flex items-center gap-2 text-xs px-4 py-2 rounded-full mb-4 mt-2 self-start"
      style={{
        background: 'rgba(15,22,40,0.85)',
        border: '1px solid rgba(212,175,55,0.20)',
        color: 'rgba(232,220,178,0.75)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        maxWidth: 'fit-content',
      }}
      aria-label="頁面位置"
    >
      <span className="text-gold/65">鑑源</span>
      <span className="text-gold/40">/</span>
      <span className="text-gold/65">{planName}</span>
      <span className="text-gold/40">/</span>
      {/* v5.10.297:章節名稱重要、加 title hover 完整 */}
      <span
        className="text-cream/90 font-medium truncate"
        style={{ maxWidth: '200px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}
        title={currentChapter}
      >
        {currentChapter}
      </span>
    </nav>
  )
}
