// v5.10.206 Sprint 1 — ScoreCircle 評分圓(Jamie 規格、HeartDoubts 報告核心 hero)
//
// 樣式:SVG conic-gradient 環、中央大字 grade(B+ 96px serif)、下方 score(79/100)
// 動畫:stroke-dashoffset 1.2s 從 0 → value(prefers-reduced-motion 直接顯示終值)
// 配色:grade A=金 / B=綠 / C=橙 / D=紅
'use client'

import { useEffect, useRef, useState } from 'react'

export type ScoreGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D'

export interface ScoreCircleProps {
  grade: ScoreGrade
  value: number // 0-100
  max?: number // default 100
  percentile?: number // Top X%
  challengeLevel?: '低' | '中' | '高'
  size?: number // px、default 240
  className?: string
}

const GRADE_COLOR: Record<string, string> = {
  'A+': '#E5B95C', // gold-400
  'A': '#E5B95C',
  'B+': '#4ADE80', // flow green
  'B': '#4ADE80',
  'C+': '#FBBF24', // balance amber
  'C': '#F97316', // adjust orange
  'D': '#EF4444', // danger red
}

export function ScoreCircle({
  grade,
  value,
  max = 100,
  percentile,
  challengeLevel,
  size = 240,
  className = '',
}: ScoreCircleProps) {
  const [progress, setProgress] = useState(0)
  const animRef = useRef<number>(0)

  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress / max)
  const color = GRADE_COLOR[grade] || GRADE_COLOR['B']

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      setProgress(value)
      return
    }
    const start = performance.now()
    const duration = 1200
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setProgress(Math.round(eased * value))
      if (t < 1) animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [value, max])

  return (
    <div className={`inline-flex flex-col items-center gap-4 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`命格綜合評分:${grade} 等級、${value}/${max} 分`}
        >
          {/* 底圈 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          {/* 進度圈 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
          />
        </svg>

        {/* 中央 grade + score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold leading-none"
            style={{
              fontFamily: 'var(--jy-font-display)',
              fontSize: size * 0.32,
              color,
              background: `linear-gradient(135deg, ${color}, ${color}DD)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {grade}
          </span>
          <span
            className="mt-2 text-[var(--jy-text-secondary)]"
            style={{
              fontFamily: 'var(--jy-font-numeric)',
              fontSize: size * 0.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {progress}/{max}
          </span>
        </div>
      </div>

      {/* 副標 */}
      {(percentile || challengeLevel) ? (
        <p className="text-sm text-[var(--jy-text-tertiary)]">
          {percentile != null && `對標同型客戶 · Top ${percentile}%`}
          {percentile != null && challengeLevel && ' · '}
          {challengeLevel && `挑戰度 ${challengeLevel}`}
        </p>
      ) : null}
    </div>
  )
}
