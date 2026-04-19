'use client'

import { useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'

// AI 生成內容 XSS 防護：統一白名單（僅允許報告用到的安全標籤/屬性）
// 禁止 script/iframe/object/embed/form/input、禁止 on* event handlers、禁止 javascript:
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p','h1','h2','h3','h4','h5','h6','strong','em','u','s','ul','ol','li',
    'a','br','hr','blockquote','table','thead','tbody','tr','th','td',
    'code','pre','span','div','b','i','sup','sub',
  ],
  ALLOWED_ATTR: ['href','target','rel','class','id','style','colspan','rowspan','align'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script','iframe','object','embed','form','input','button','link','meta','style'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','onsubmit','formaction'],
}

function safeHtml(html: string): string {
  return DOMPurify.sanitize(html || '', SANITIZE_CONFIG)
}

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
    return <div dangerouslySetInnerHTML={{ __html: safeHtml(fullHtml) }} />
  }

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: safeHtml(expanded ? fullHtml : highlightHtml) }} />
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium transition-all px-4 py-2 rounded-lg no-print"
        style={{
          color: '#c9a84c',
          background: expanded ? 'rgba(197,150,58,0.10)' : 'rgba(197,150,58,0.04)',
          border: '1px solid rgba(197,150,58,0.32)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(197,150,58,0.15)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = expanded ? 'rgba(197,150,58,0.10)' : 'rgba(197,150,58,0.04)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.3s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          aria-hidden
        >
          &#9660;
        </span>
        {expanded ? '收起詳細分析' : '展開完整分析（含命理佐證）'}
      </button>
    </div>
  )
}
