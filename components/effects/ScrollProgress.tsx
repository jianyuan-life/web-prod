// v5.10.213 — ScrollProgress 滾動進度條(Jamie 規格 4 全域動效之一)
//
// 樣式:top fixed 4px 金色漸層條、隨 scroll 推進
'use client'

import { useEffect, useRef } from 'react'

export interface ScrollProgressProps {
  height?: number // px、default 3
  className?: string
}

export function ScrollProgress({ height = 3, className = '' }: ScrollProgressProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    function updateProgress() {
      if (!barRef.current) return
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      barRef.current.style.width = `${Math.min(100, Math.max(0, progress))}%`
    }

    function onScroll() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateProgress)
    }

    updateProgress()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', updateProgress)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', updateProgress)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] pointer-events-none ${className}`}
      style={{ height: `${height}px`, background: 'rgba(255,255,255,0.03)' }}
      role="progressbar"
      aria-label="頁面閱讀進度"
    >
      <div
        ref={barRef}
        style={{
          height: '100%',
          width: '0%',
          background: 'var(--jy-gold-shimmer)',
          transition: 'width 100ms ease-out',
        }}
      />
    </div>
  )
}
