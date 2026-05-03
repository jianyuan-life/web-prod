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

export default function SectionExpander({ fullHtml, sectionTitle: _sectionTitle }: SectionExpanderProps) {
  // v5.7.46 根治:預設展開全文(老闆 lesson #061「底層根治、不 patch」)
  // 證據:Gemini visual eval P0「課題 Top 5 沒顯示」「思維模式截斷天機是」「命理依據塔羅惡魔牌綜...」
  // 真因:原預設只顯示 extractHighlights 摘要、未點展開鈕看不到全文、Gemini OCR 認為是截斷 bug
  // 客戶體驗:付費 $89 應預設看全文、摘要 UX 反而讓客戶覺得內容缺失
  // 修:直接 return 全文、移除展開按鈕邏輯
  return <div dangerouslySetInnerHTML={{ __html: safeHtml(fullHtml) }} />

  // v5.7.46:舊摘要 UX 已移除、預設展開全文(見上方 return)
}
