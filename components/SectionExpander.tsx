'use client'

import { useState } from 'react'

// 從 HTML 內容中提取重點（粗體+引言框+行動建議+emoji標記）
function extractHighlights(html: string): string {
  const lines = html.split(/(?:<br\s*\/?>|\n)+/)
  const highlights: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 保留：粗體結論
    if (trimmed.includes('<strong>') && trimmed.length < 500) {
      highlights.push(trimmed)
      continue
    }
    // 保留：引言框（blockquote）
    if (trimmed.includes('blockquote') || trimmed.includes('border-left')) {
      highlights.push(trimmed)
      continue
    }
    // 保留：行動建議（→ 開頭）
    if (trimmed.includes('→') || trimmed.includes('border-left:3px solid rgba(106,176,76')) {
      highlights.push(trimmed)
      continue
    }
    // 保留：emoji 分類標記（🟢🟡🔵📌）
    if (/🟢|🟡|🔵|📌/.test(trimmed)) {
      highlights.push(trimmed)
      continue
    }
    // 保留：章節標題（h3/h4）
    if (trimmed.includes('report-h3') || trimmed.includes('<h3') || trimmed.includes('<h4')) {
      highlights.push(trimmed)
      continue
    }
    // 保留：彩色框（好的地方/注意/改善）
    if (trimmed.includes('border-radius:12px') && trimmed.includes('border:')) {
      highlights.push(trimmed)
      continue
    }
  }

  return highlights.join('<br/>')
}

interface SectionExpanderProps {
  fullHtml: string
  sectionTitle: string
}

// 粗估 HTML 可見文字長度（濾 tag 和空白）— 用於判斷 highlights 是不是近乎空白
function visibleTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length
}

export default function SectionExpander({ fullHtml, sectionTitle }: SectionExpanderProps) {
  const [expanded, setExpanded] = useState(false)
  const highlightHtml = extractHighlights(fullHtml)
  const hasMore = highlightHtml.length < fullHtml.length * 0.8 // 如果提取的重點不到全文 80%，才顯示展開按鈕

  // 某些章節預設展開（短章節、寫給你的話、刻意練習）
  const alwaysExpand = /寫給|刻意練習|你的問題|你們的問題|你的答案|你們的答案/.test(sectionTitle)

  // P0-5 修復（2026-04-17）：報告頁中段 ~480px 空白區域
  // 原因：extractHighlights 只抽取「粗體/引言框/emoji/邊框」，若某章節都是純段落文字會抽成空 HTML
  //      此時 SectionExpander 會渲染一個空 div + 展開按鈕，中間留下約 480px 空白（卡片本身 padding + 一行按鈕）
  // 修法：highlights 可見文字不足 80 字時，視為抽取失敗，直接展示全文（不留空白骨架）
  const highlightVisible = visibleTextLength(highlightHtml)
  const highlightsFallbackEmpty = highlightVisible < 80

  if (alwaysExpand || !hasMore || highlightsFallbackEmpty) {
    return <div dangerouslySetInnerHTML={{ __html: fullHtml }} />
  }

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: expanded ? fullHtml : highlightHtml }} />
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-gold/70 hover:text-gold transition-colors flex items-center gap-1"
      >
        {expanded ? (
          <>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>&#9660;</span>
            收起詳細分析
          </>
        ) : (
          <>
            <span>&#9660;</span>
            展開完整分析（含命理佐證）
          </>
        )}
      </button>
    </div>
  )
}
