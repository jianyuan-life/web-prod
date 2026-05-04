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

// v5.7.83 撤回 v5.7.73 TL;DR 重複(page.tsx renderChapter 已有 tldrNode)
export default function SectionExpander({ fullHtml, sectionTitle: _sectionTitle }: SectionExpanderProps) {
  return <div dangerouslySetInnerHTML={{ __html: safeHtml(fullHtml) }} />
}
