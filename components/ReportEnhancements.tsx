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
// v5.3.48 Wave 3：改友善呈現（老闆 docx P1）
// 舊：「預計閱讀 99 分鐘」→ 給壓迫感嚇退
// 新：「精華 10 分 · 完整 N 分」雙入口呈現，降低閱讀門檻
export function ReadingTime({ textLength }: { textLength: number }) {
  const minutes = Math.max(5, Math.ceil(textLength / 450))
  const essenceMin = Math.min(15, Math.max(8, Math.round(minutes / 6)))
  return (
    <span className="text-text-muted/60 text-xs">
      精華 {essenceMin} 分 · 完整 {minutes} 分
    </span>
  )
}
