'use client'

import type { PartMeta } from '@/lib/report-structure'

// 本地 type（對應 page.tsx 的 ContentSection）
interface ContentSectionLite {
  title: string
  content: string
}

interface PartHighlightsProps {
  part: PartMeta
  sections: ContentSectionLite[]
}

/**
 * 每篇開頭的「重點提煉」卡 — 讓 UI 畫重點、5 秒抓到精華
 *
 * 老闆原則：「UI 講重點，PDF 講細節」
 * 從章節內容自動抽取每章第一句「有力道的重點句」作為預覽
 * 每篇最多 3 個重點
 */
export default function PartHighlights({ part, sections }: PartHighlightsProps) {
  // 從每個章節抽取「重點句」— 優先抓粗體或結論式句子
  const highlights = extractHighlights(sections).slice(0, 3)
  if (highlights.length === 0) return null

  // 四大篇色系
  const palette = {
    qi: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', accent: '#22c55e', label: '這一篇，你會認識自己' },
    cheng: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', accent: '#3b82f6', label: '這一篇，回顧你走過的路' },
    zhuan: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', accent: '#a855f7', label: '這一篇，看見未來 10 年' },
    he: { bg: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.3)', accent: '#c9a84c', label: '這一篇，告訴你該怎麼做' },
  } as const
  const c = palette[part.key as keyof typeof palette] || palette.qi

  return (
    <div
      className="mb-5 rounded-xl p-5"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: c.accent, fontSize: '1.1rem' }}>✨</span>
        <span className="text-[11px] tracking-[2px]" style={{ color: c.accent, opacity: 0.9 }}>
          {c.label}
        </span>
      </div>
      <ul className="space-y-2.5">
        {highlights.map((h, i) => (
          <li key={i} className="flex gap-3 text-sm leading-7" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <span
              className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mt-0.5"
              style={{ background: `${c.accent}30`, color: c.accent }}
            >
              {i + 1}
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {/* v5.3.25：起篇專屬「關鍵詞速覽」— 5 秒建立認知（DeepSeek 建議） */}
      {part.key === 'qi' && sections.length > 0 && (() => {
        const tags = extractKeywords(sections).slice(0, 8)
        if (tags.length < 3) return null
        return (
          <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${c.border}` }}>
            <div className="text-[10px] mb-2" style={{ color: c.accent, opacity: 0.7, letterSpacing: '2px' }}>
              你的關鍵字
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs"
                  style={{
                    background: `${c.accent}18`,
                    color: c.accent,
                    border: `1px solid ${c.accent}30`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function extractKeywords(sections: ContentSectionLite[]): string[] {
  // 從「關鍵字」或「人格標籤」章節抽取
  const keywords: string[] = []
  for (const sec of sections) {
    // 抓「冷靜 · 透徹 · 孤獨」這類以 · 分隔的關鍵字串
    const dotStyle = sec.content.match(/\*\*([^*\n]*(?:·|\s·\s|、)[^*\n]*?)\*\*/g)
    if (dotStyle) {
      for (const m of dotStyle) {
        const clean = m.replace(/\*\*/g, '').trim()
        const items = clean.split(/\s*[·、]\s*/).filter(t => t.length >= 2 && t.length <= 10)
        keywords.push(...items)
      }
    }
    // 抓標題含「關鍵字」的章節內容
    if (/關鍵字|人格標籤/.test(sec.title)) {
      const quick = sec.content.match(/\*\*([^*\n]{2,15})\*\*/g)
      if (quick) {
        for (const m of quick) {
          keywords.push(m.replace(/\*\*/g, '').trim())
        }
      }
    }
  }
  // v5.10.98 P0 修(visual_audit_2026-05-10 N6 共識「chip 整句外洩」、4 件 C/G15):
  //   實測何紀萳 chip「然後一次崩潰」。」含「」」+「。」結尾標點 = 句子非 keyword
  //   修補 1:strip 開頭/結尾的全形/半形標點與引號
  //   修補 2:過濾含句末標點(。！？)的、必為句子片段非 keyword
  //   修補 3:過濾含分句符號(/、，)的、避免「A / B / C」整段
  return Array.from(new Set(
    keywords
      .map(t => t.replace(/^[「」『』。、！？，：；\-—\s]+|[「」『』。、！？，：；\-—\s]+$/g, '').trim())
      .filter(t => t.length >= 2 && t.length <= 12)
      .filter(t => !/[。！？]/.test(t))  // 含句末標點 = 句子片段、非 keyword
      .filter(t => !/\s\/\s|\s—\s/.test(t))  // 含「 / 」「 — 」分句符 = 多句串接
      // v5.10.99 P0 修(visual_audit_2026-05-10「也特別容易跟您起衝突」躲過 v5.10.98 filter):
      //   chip 應為抽象 keyword(冷靜/直覺/樂高)、不該含人稱代詞(您/你/他/她/我)
      //   含人稱代詞 = 句子片段、非 keyword
      .filter(t => !/[您你他她我們它]/.test(t))
      // v5.10.103 P0 修(verify v5.10.99 sub-agent 抓:C 何紀萳 5 + G15 霖 3 + C 何宥諄 1 = 9 個 fragment 漏網):
      //   pattern 1:連接詞 / 副詞開頭 → 句子片段(「然後X」「也X」「但是X」)
      //   pattern 2:含介詞 / 動詞片語 → 句子片段(「跟X」「對X」「給X」「讓X」)
      //   chip 必為抽象名詞(冷靜/直覺/樂高、無連接詞 / 介詞 / 動詞)
      .filter(t => !/^(然後|但是|可是|不過|只是|因為|所以|如果|而且|還有|另外|此外|至於|至少|至多|甚至|或者|然而|不僅|不但|要是|即使|雖然|儘管|似乎|大概|可能|應該|將會|已經|曾經|偶爾|常常|有時|總是|永遠|從不|有點|很多|一些|某些|一個|這個|那個|這些|那些|本月|今年|去年|明年)/.test(t))
      .filter(t => !/[跟對給讓被把為向往從到於和及與]/.test(t))  // 含中文介詞 / 動詞 = 句子片段非 keyword
  ))
}

function extractHighlights(sections: ContentSectionLite[]): string[] {
  const highlights: string[] = []
  for (const sec of sections) {
    const content = sec.content || ''
    const boldMatches = content.match(/\*\*([^*\n]{15,80})\*\*/g)
    if (boldMatches && boldMatches.length > 0) {
      for (const bm of boldMatches.slice(0, 1)) {
        const clean = bm.replace(/\*\*/g, '').trim()
        if (clean.length >= 15 && !highlights.includes(clean)) {
          highlights.push(clean)
          break
        }
      }
      continue
    }
    const firstSentence = content.split(/[。！\n]/).find((s: string) => {
      const t = s.trim()
      return t.length >= 20 && t.length <= 120
    })
    if (firstSentence && !highlights.includes(firstSentence.trim())) {
      highlights.push(firstSentence.trim())
    }
  }
  return highlights
}
