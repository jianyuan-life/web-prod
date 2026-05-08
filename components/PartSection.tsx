'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import type { PartMeta } from '@/lib/report-structure'

interface PartSectionProps {
  part: PartMeta
  chapterCount: number
  defaultExpanded?: boolean
  children: ReactNode
  /** 本篇在全部篇章中的順序（1-based），用於進度提示 */
  currentOrder?: number
  /** 總共幾篇 */
  totalParts?: number
}

/**
 * 起承轉合外框——包裹一個篇章（含 N 個章節）
 *
 * 視覺設計：
 * - 頂部金色分隔帶（icon + 「第一篇 · 起」+ 篇名）
 * - TL;DR 一行描述
 * - 右側摺疊箭頭 + 章節數標記
 * - 內容區塊背景略淺化，層次分明
 * - 起/承 預設展開（核心認知），轉/合 可折疊（深入探索）
 */
export default function PartSection({
  part,
  chapterCount,
  defaultExpanded = true,
  children,
  currentOrder,
  totalParts,
}: PartSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const sectionRef = useRef<HTMLElement>(null)
  const showProgress = typeof currentOrder === 'number' && typeof totalParts === 'number' && totalParts > 1

  // v5.10.60 P0 修(老闆「逐頁看」抓 zhuan/he scroll 32028 全黑、children 永遠 render 但 fold height=0):
  // hash change / scroll 偵測:當 anchor (#sec-N) 命中本 part 內的 chapter id 時自動展開
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkAndExpand = () => {
      const hash = window.location.hash.slice(1)
      if (!hash) return
      // 抓本 PartSection 內的所有 chapter id="sec-N"
      const sec = sectionRef.current
      if (!sec) return
      const match = sec.querySelector(`[id="${hash}"]`)
      if (match && !expanded) {
        setExpanded(true)
        // 等 expand transition 後再 scroll(避免 height 0 時 scroll 不準)
        setTimeout(() => {
          match.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 320)
      }
    }

    // 初次載入 + hash change + 程式化 scroll 都偵測
    checkAndExpand()
    window.addEventListener('hashchange', checkAndExpand)

    return () => window.removeEventListener('hashchange', checkAndExpand)
  }, [expanded])

  return (
    <section ref={sectionRef} className="mb-8">
      {/* 篇章分隔帶 */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full mb-4 group"
        aria-expanded={expanded}
        style={{
          display: 'block',
          background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(26,42,74,0.28))',
          border: '1px solid rgba(197,150,58,0.28)',
          borderRadius: '14px',
          padding: '18px 22px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.25s ease',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 左側：篇章編號 + icon 圓徽 */}
          <div
            className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl"
            style={{
              background: 'rgba(197,150,58,0.18)',
              border: '1px solid rgba(197,150,58,0.35)',
              color: '#c9a84c',
              fontSize: '1.5rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
            }}
            aria-hidden
          >
            {part.icon}
          </div>

          {/* 中央：標籤+篇名+TL;DR */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-[10px] tracking-[3px]"
                style={{ color: 'rgba(197,150,58,0.7)' }}
              >
                {part.label}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(197,150,58,0.12)',
                  color: '#c9a84c',
                  border: '1px solid rgba(197,150,58,0.25)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {part.stage}
              </span>
              <span
                className="text-[10px]"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {chapterCount} 章
              </span>
              {showProgress && (
                <span
                  className="text-[10px] ml-auto"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  aria-label={`第 ${currentOrder} 篇／共 ${totalParts} 篇`}
                >
                  {currentOrder} / {totalParts}
                </span>
              )}
            </div>
            {/* 進度條（細線）*/}
            {showProgress && (
              <div
                className="mt-2 h-[2px] rounded-full"
                style={{
                  background: 'rgba(197,150,58,0.12)',
                  overflow: 'hidden',
                }}
                aria-hidden
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(currentOrder! / totalParts!) * 100}%`,
                    background: 'linear-gradient(90deg, rgba(197,150,58,0.3), rgba(197,150,58,0.6))',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
            <h2
              className="text-xl sm:text-[1.4rem] font-semibold mt-1.5"
              style={{
                color: '#e6d89a',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.02em',
              }}
            >
              {part.name}
            </h2>
            <p
              className="text-sm mt-1.5 leading-6"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              {part.tldr}
            </p>
          </div>

          {/* 右側：摺疊箭頭 */}
          <div
            className="shrink-0 text-xs self-center"
            style={{
              color: '#c9a84c',
              opacity: 0.6,
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.3s ease',
              display: 'inline-block',
            }}
            aria-hidden
          >
            &#9660;
          </div>
        </div>
      </button>

      {/* 章節內容(摺疊式)
          v5.10.54 P0 修 R sec-3..8 + G15 sec-4..10 dead anchor 真因:
            原 `{expanded && (<>{children}</>)}` conditional render、折疊時 children 完全不在 DOM
            zhuan/he part 預設折疊、其 chapter id={`sec-${globalIdx}`} 在初始 render 不在 DOM
            nav 9 hrefs vs chapter id 只 3 個(qi+cheng)、6 個 dead = zhuan/he 折疊
          修補:children 永遠 render、用 CSS height/overflow 折疊(對齊 CollapsibleSection L113-130 設計) */}
      <div
        className="pl-0 sm:pl-4"
        style={{
          animation: expanded ? 'fadeIn 0.3s ease' : undefined,
          height: expanded ? 'auto' : 0,
          overflow: 'hidden',
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: expanded ? 'auto' : 'none',
        }}
        aria-hidden={!expanded}
      >
        {children}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* 列印時：所有篇章永遠展開，背景轉為白底 */
        @media print {
          section button {
            background: #f8f4e8 !important;
            border: 1px solid #c9a84c !important;
            color: #333 !important;
          }
          section button h2 {
            color: #1a2a4a !important;
          }
          section button p {
            color: #555 !important;
          }
        }
      `}</style>
    </section>
  )
}
