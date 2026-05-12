// v5.10.198 UI redesign Phase 2 — GoldDivider 金色分隔線(Jamie 規格書 3.6)
//
// 樣式:24×1 金色漸層短線
import type { CSSProperties } from 'react'

export interface GoldDividerProps {
  width?: number // px、default 24
  height?: number // px、default 1
  align?: 'left' | 'center' | 'right'
  className?: string
  style?: CSSProperties
}

const ALIGN_CLASSES = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
}

export function GoldDivider({
  width = 24,
  height = 1,
  align = 'center',
  className = '',
  style,
}: GoldDividerProps) {
  return (
    <div
      className={`${ALIGN_CLASSES[align]} ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: 'linear-gradient(to right, rgba(201,168,76,0.1), rgba(201,168,76,0.7), rgba(201,168,76,0.1))',
        ...style,
      }}
      aria-hidden
    />
  )
}
