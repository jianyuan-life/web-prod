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

// v5.7.73 抽第一句精華(粗體優先、blockquote 次之、第一段 fallback)
function extractTLDR(html: string): string {
  // 1. 第一個粗體句(strong/b)
  const boldMatch = html.match(/<(?:strong|b)[^>]*>([^<]{10,180})<\/(?:strong|b)>/i)
  if (boldMatch) return boldMatch[1].trim()
  // 2. 第一個 blockquote 內容
  const bqMatch = html.match(/<blockquote[^>]*>[\s\S]*?<p[^>]*>([^<]{10,200})<\/p>[\s\S]*?<\/blockquote>/i)
  if (bqMatch) return bqMatch[1].replace(/[「」"']/g, '').trim()
  // 3. 第一個非標題段落(skip h1-h6)
  const pMatch = html.match(/<p[^>]*>([^<]{30,250})<\/p>/i)
  if (pMatch) {
    const text = pMatch[1].trim()
    // 跳過 transition 詞開頭
    if (/^(?:接下來|以下是|現在|讓我們|我們)/.test(text)) {
      const next = html.match(/<p[^>]*>(?!.*?(?:接下來|以下是|現在|讓我們|我們))([^<]{30,250})<\/p>/i)
      if (next) return next[1].trim()
    }
    // 取第一個句號前
    const firstSentence = text.split(/[。！？!?]/)[0]
    if (firstSentence.length >= 20 && firstSentence.length <= 150) return firstSentence
    return text.slice(0, 130) + (text.length > 130 ? '...' : '')
  }
  return ''
}

export default function SectionExpander({ fullHtml, sectionTitle: _sectionTitle }: SectionExpanderProps) {
  const tldr = extractTLDR(fullHtml)
  const safe = safeHtml(fullHtml)
  if (!tldr) {
    return <div dangerouslySetInnerHTML={{ __html: safe }} />
  }
  return (
    <div>
      {/* v5.7.73 章節 TL;DR pull-quote(漸進式揭露、Notion toggle 範本、Gemini 標 P1 +4-9) */}
      <div className="mb-4 px-5 py-3 rounded-lg" style={{
        background: 'linear-gradient(135deg, rgba(197,150,58,0.10), rgba(197,150,58,0.03))',
        borderLeft: '3px solid rgba(197,150,58,0.55)',
      }}>
        <div className="text-gold/55 text-[10px] tracking-[2px] mb-1 font-semibold">★ 重點一句話</div>
        <div className="text-cream/95 text-[15px] leading-relaxed font-medium italic">「{tldr}」</div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  )
}
