'use client'

import { safeHtml } from '@/lib/sanitize'

interface SectionExpanderProps {
  fullHtml: string
  sectionTitle: string
}

// v5.10.192(lesson #113 #4): Codex L3 抓 35fb7a78 留 dead helpers
//   原檔留 extractHighlights / visibleTextLength / useState、但 component body 不再呼叫
//   清掉 dead code、僅保留實際 render
// v5.7.83 撤回 v5.7.73 TL;DR 重複(page.tsx renderChapter 已有 tldrNode)
export default function SectionExpander({ fullHtml, sectionTitle: _sectionTitle }: SectionExpanderProps) {
  return <div dangerouslySetInnerHTML={{ __html: safeHtml(fullHtml) }} />
}
