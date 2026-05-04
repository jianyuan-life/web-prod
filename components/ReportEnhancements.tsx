'use client'

import { useEffect, useState } from 'react'

// #11 閱讀進度條
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight > 0) {
        setProgress(Math.min(100, Math.round((scrollTop / docHeight) * 100)))
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="fixed top-16 left-0 right-0 z-40 h-1 no-print" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <div
        className="h-full transition-all duration-150"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #c9a84c, #e8c87a)',
          boxShadow: '0 0 8px rgba(201,168,76,0.4)',
        }}
      />
    </div>
  )
}

// v5.8.4 多功能浮動操作面板(列印 + 回頂 + 分享、互動性 P2 修)
export function FloatingActionPanel() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const handleScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  if (!show) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 no-print">
      <button
        onClick={() => window.print()}
        className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: 'rgba(155,89,182,0.9)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
        aria-label="列印 / 儲存為 PDF"
        title="列印 / 儲存為 PDF"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
        </svg>
      </button>
    </div>
  )
}

// #13 回到頂部浮動按鈕
export function BackToTopButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShow(window.scrollY > 600)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110 no-print"
      style={{
        background: 'rgba(201,168,76,0.9)',
        color: '#0a0e1a',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
      aria-label="回到頂部"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}

// #14 閱讀時間估算
// v5.7.65 修 Gemini P2「339 分鐘語意不明」:reading speed 450→1000 chars/min(中文輕度閱讀)、完整版 cap 120 分鐘
// 範本:「精華 10 分 · 完整 N 分」雙入口呈現,降低閱讀門檻
export function ReadingTime({ textLength }: { textLength: number }) {
  const rawMin = Math.max(5, Math.ceil(textLength / 1000))  // 1000 chars/min realistic 中文輕讀
  const minutes = Math.min(120, rawMin)  // cap 120 min(避免 339 等不切實際數)
  const essenceMin = Math.min(15, Math.max(8, Math.round(minutes / 8)))
  return (
    <span className="text-text-muted/60 text-xs">
      精華 {essenceMin} 分 · 完整版 {minutes} 分
    </span>
  )
}
