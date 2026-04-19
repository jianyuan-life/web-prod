'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  /** 章節標題 */
  title: string
  /** 章節編號顯示（如 "01" 或 "3/12"） */
  chapterLabel?: ReactNode
  /** 標題左側圖標 */
  icon?: ReactNode
  /** 標題顏色 */
  titleColor?: string
  /** 是否預設展開 */
  defaultExpanded?: boolean
  /** 子內容 */
  children: ReactNode
  /** 額外的 className（套用在外層容器上） */
  className?: string
  /** 額外的 style */
  style?: React.CSSProperties
  /** HTML id（用於錨點跳轉） */
  id?: string
}

export default function CollapsibleSection({
  title,
  chapterLabel,
  icon,
  titleColor = 'var(--color-gold)',
  defaultExpanded = true,
  children,
  className = '',
  style,
  id,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto')

  // 測量內容高度以實現平滑動畫
  // Bug #14：確認 node 仍 connected 再訪問，避免 parentNode null 錯誤
  useEffect(() => {
    const node = contentRef.current
    if (!node || !node.isConnected) return
    const resizeObserver = new ResizeObserver(() => {
      const n = contentRef.current
      if (n && n.isConnected && expanded) {
        setContentHeight(n.scrollHeight)
      }
    })
    resizeObserver.observe(node)
    return () => resizeObserver.disconnect()
  }, [expanded])

  // 展開/收起時更新高度
  useEffect(() => {
    const node = contentRef.current
    if (!node || !node.isConnected) return
    if (expanded) {
      setContentHeight(node.scrollHeight)
      // 動畫結束後切換為 auto（讓內部內容自由伸縮）
      const timer = setTimeout(() => setContentHeight('auto'), 350)
      return () => clearTimeout(timer)
    } else {
      // 先設定確切高度，再在下一幀設為 0（觸發 CSS transition）
      setContentHeight(node.scrollHeight)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setContentHeight(0)
        })
      })
    }
  }, [expanded])

  return (
    <div id={id} className={`section-card ${className}`} style={style}>
      {/* 可點擊的標題列 */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-3 text-left group"
        aria-expanded={expanded}
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
      >
        {/* 章節編號或圖標 */}
        {icon && <div className="shrink-0">{icon}</div>}
        {!icon && chapterLabel && <div className="shrink-0">{chapterLabel}</div>}

        {/* 標題文字 */}
        <h2 className="text-lg font-semibold flex-1" style={{ color: titleColor, fontFamily: 'var(--font-sans)' }}>
          {title}
        </h2>

        {/* 展開/收起箭頭 */}
        <span
          className="shrink-0 text-xs transition-transform duration-300 ease-in-out"
          style={{
            color: 'var(--color-gold)',
            opacity: 0.5,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'inline-block',
          }}
        >
          &#9660;
        </span>
      </button>

      {/* 內容區域（平滑動畫） */}
      <div
        ref={contentRef}
        style={{
          height: typeof contentHeight === 'number' ? `${contentHeight}px` : 'auto',
          overflow: 'hidden',
          transition: 'height 0.3s ease-in-out, opacity 0.3s ease-in-out',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="mt-4">
          {children}
        </div>
      </div>
    </div>
  )
}
