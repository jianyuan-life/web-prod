// v5.10.251 TermAuto:auto-wrap 從 term-dictionary 找到的術語為 TermTooltip
//
// 用途:
//   - 對應 Codex+Gemini P0 wire dead component(TermTooltip)
//   - 自動從 lib/term-dictionary.ts 查詢、找到才 wrap、找不到 plain text
//   - 不影響 SSR(純函式、無 hooks、可 server component)
//
// 用法:
//   <TermAuto>命主</TermAuto>          → 顯示「命主」+ tooltip 解釋
//   <TermAuto>不在字典裡的字</TermAuto> → 純 text 顯示、不 wrap
//
// 設計取捨:
//   - 不做 markdown body 自動掃描(Sprint 2.x parser 後再做)
//   - 不支援巢狀(<TermAuto><TermAuto>...))
//   - children 必為單一字串

'use client'

import { TermTooltip } from './TermTooltip'
import { getTerm } from '@/lib/term-dictionary'

export interface TermAutoProps {
  children: string // 必為純字串、不接受 ReactNode
  className?: string
}

export function TermAuto({ children, className }: TermAutoProps) {
  const def = getTerm(children)
  if (!def) {
    // 字典裡沒有 → plain text、不 wrap(避免假資訊)
    return <span className={className}>{children}</span>
  }
  return (
    <TermTooltip
      term={def.term}
      definition={def.definition}
      source={def.source}
      className={className}
    />
  )
}
