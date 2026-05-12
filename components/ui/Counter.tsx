// v5.10.198 UI redesign Phase 2 — Counter 滾動計數(Jamie 規格書 3.4)
//
// 行為:
//   - IntersectionObserver 60% threshold 觸發
//   - 2 秒從 0 到 value、easeOutCubic
//   - tabular-nums(數字寬度一致)
//   - 可選 localStorage 還原(避免 reload 重跑、防假數據跳動)
//   - prefers-reduced-motion 直接顯示終值
'use client'

import { useEffect, useRef, useState } from 'react'

export interface CounterProps {
  value: number
  suffix?: string
  prefix?: string
  duration?: number // 動畫 ms、default 2000
  format?: (n: number) => string // 客製 format(如 1,284)
  storageKey?: string // localStorage key(若需穩定遞增、傳此 key)
  incrementPerVisit?: [number, number] // [min, max] 每訪客自增區間
  className?: string
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function defaultFormat(n: number): string {
  return n.toLocaleString('en-US')
}

export function Counter({
  value: initialValue,
  suffix = '',
  prefix = '',
  duration = 2000,
  format = defaultFormat,
  storageKey,
  incrementPerVisit,
  className = '',
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const animatedOnce = useRef(false)
  const [displayValue, setDisplayValue] = useState(0)
  const [targetValue, setTargetValue] = useState(initialValue)

  // localStorage 還原 + 每訪客自增
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(storageKey)
      let v = stored ? parseInt(stored, 10) : initialValue
      if (isNaN(v) || v < initialValue) v = initialValue
      if (incrementPerVisit) {
        const [min, max] = incrementPerVisit
        const inc = Math.floor(Math.random() * (max - min + 1)) + min
        v += inc
        localStorage.setItem(storageKey, String(v))
      }
      setTargetValue(v)
    } catch {
      setTargetValue(initialValue)
    }
  }, [storageKey, initialValue, incrementPerVisit])

  // IntersectionObserver 觸發
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = ref.current
    if (!el) return

    // prefers-reduced-motion 直接顯示終值
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      setDisplayValue(targetValue)
      animatedOnce.current = true
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animatedOnce.current) {
            animatedOnce.current = true
            const start = performance.now()
            const tick = (now: number) => {
              const elapsed = now - start
              const t = Math.min(elapsed / duration, 1)
              const eased = easeOutCubic(t)
              setDisplayValue(Math.round(eased * targetValue))
              if (t < 1) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          }
        })
      },
      { threshold: 0.6 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [targetValue, duration])

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}
    >
      {prefix}{format(displayValue)}{suffix}
    </span>
  )
}
