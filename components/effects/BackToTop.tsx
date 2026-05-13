// v5.10.236 — BackToTop 回到頂部按鈕(Jamie 規格 4 全域動效之 4/4 — Confetti+ScrollProgress+MouseGlow+Stagger 已建)
//
// 樣式:fixed bottom-right、scroll > 200px 顯示、smooth scroll to top、prefers-reduced-motion 直接跳
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface BackToTopProps {
  threshold?: number // px、default 200
  className?: string
}

export function BackToTop({ threshold = 200, className = '' }: BackToTopProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onScroll() {
      setVisible((window.scrollY || document.documentElement.scrollTop) > threshold)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  function handleClick() {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="回到頂部"
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'inline-flex items-center justify-center',
        'w-12 h-12 rounded-full',
        'transition-all duration-300',
        'hover:scale-110',
        'shadow-[var(--jy-shadow-gold)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
        className,
      )}
      style={{
        background: 'var(--jy-gold-shimmer)',
        color: '#0A0E1A',
      }}
    >
      <span className="text-xl" aria-hidden>↑</span>
    </button>
  )
}
