// v5.10.213 — MouseGlow 滑鼠跟隨光暈(Jamie 規格 4 全域動效之一)
//
// 樣式:fixed cursor-following radial gradient、低 opacity、prefers-reduced-motion / 觸控裝置自動 disable
'use client'

import { useEffect, useRef } from 'react'

export interface MouseGlowProps {
  size?: number // px、default 600
  intensity?: number // 0-1、default 0.08
  className?: string
}

export function MouseGlow({ size = 600, intensity = 0.08, className = '' }: MouseGlowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 觸控裝置不啟用(無 cursor)
    const hasMouse = window.matchMedia('(pointer: fine)').matches
    if (!hasMouse) return

    // prefers-reduced-motion 不啟用
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    function onMouseMove(e: MouseEvent) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (!ref.current) return
        ref.current.style.transform = `translate(${e.clientX - size / 2}px, ${e.clientY - size / 2}px)`
        ref.current.style.opacity = '1'
      })
    }

    function onMouseLeave() {
      if (ref.current) ref.current.style.opacity = '0'
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('mouseleave', onMouseLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [size])

  return (
    <div
      ref={ref}
      className={`fixed top-0 left-0 pointer-events-none z-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle, rgba(229, 185, 92, ${intensity}) 0%, transparent 60%)`,
        opacity: 0,
        transition: 'opacity 300ms ease-out',
        willChange: 'transform',
      }}
      aria-hidden
    />
  )
}
