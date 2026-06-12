'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { safeReportHtml } from '@/lib/sanitize'

interface SectionExpanderProps {
  fullHtml: string
  sectionTitle: string
}

// v5.10.406 #2 修(老闆登入 UI 抓「精簡版沒用好 + 觀看疲勞 44.6 螢幕」):
//   恢復章節摺疊 — v5.10.192 清 dead code 後本元件變「純全展開」(只 render full div)、
//   致 22 章內文全攤開 = 44.6 螢幕疲勞 + 精簡版 toggle 無東西可收(主文 0 個 .expert-only)。
//   修法:接 data-view-mode —
//     · 完整版(expert、預設):全展開(維持現有客戶體驗)
//     · 精簡版(simple):章節內文截斷 300px + 漸層遮罩 + 「展開本章」按鈕(抓重點、不疲勞)
//   SSR safe:初始全展開避免 hydration 閃爍、mounted 後依 view-mode 同步 + MutationObserver 即時切換。
export default function SectionExpander({ fullHtml, sectionTitle: _sectionTitle }: SectionExpanderProps) {
  // v5.10.408(L4 Gemini P0 修):simpleMode 初始 null = 「未知」、首幀 inline style
  // 完全不設、交給 layout.tsx inline script 已寫好的 html[data-view-mode] + globals.css
  // 摺疊規則決定 — 任何 inline 值(300px 或 none)在首幀都會對另一群用戶造成 CLS:
  //   · 預設/已存 simple 用戶:首幀 inline none → 全文閃現再收合(跳 29 螢幕)
  //   · 已存 expert 用戶:首幀 inline 300px → 收合閃現再展開
  // null 首幀 = CSS 控制、兩群都零跳動;effect 同步後才接手互動狀態。
  const [simpleMode, setSimpleMode] = useState<boolean | null>(null)
  const [userExpanded, setUserExpanded] = useState(false)
  // v5.10.409(D 審查 P1「完整版空殼」+ R P2「已全顯仍標展開」):
  // 短章(內容高 ≤ 340px、本來就不到截斷線)摺疊毫無意義 — 14 顆「展開」鍵點了零增量
  // = 假功能、廉價感。mount 後量一次 scrollHeight(不受 maxHeight clamp 影響)、
  // 過短 → 完全停用摺疊(inline none 蓋過 html[data-view-mode] CSS 規則)。
  const [tooShort, setTooShort] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => {
      const isSimple = document.documentElement.getAttribute('data-view-mode') === 'simple'
      setSimpleMode(isSimple)
      if (!isSimple) setUserExpanded(false) // 回完整版時重置(下次切精簡版重新截斷)
    }
    sync()
    if (contentRef.current && contentRef.current.scrollHeight <= 340) setTooShort(true)
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-view-mode'] })
    return () => obs.disconnect()
  }, [])

  const collapsed = simpleMode === true && !userExpanded && !tooShort
  const contentId = useId()

  // 互動後的 inline style:收合=與 CSS 同值(無視覺變化)、用戶展開/短章=none 蓋過 CSS、
  // 未知(null)/expert=undefined 交給 CSS(expert 時 attr 不匹配、自然全文)。
  const contentStyle = collapsed
    ? {
        maxHeight: '300px',
        overflow: 'hidden' as const,
        WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
        maskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
      }
    : tooShort || (simpleMode === true && userExpanded)
      ? { maxHeight: 'none', overflow: 'visible' as const, WebkitMaskImage: 'none', maskImage: 'none' }
      : undefined

  return (
    <div className="section-expander">
      <div
        id={contentId}
        ref={contentRef}
        style={contentStyle}
        dangerouslySetInnerHTML={{ __html: safeReportHtml(fullHtml) }}
      />
      {collapsed && (
        <button
          type="button"
          onClick={() => setUserExpanded(true)}
          aria-expanded={false}
          aria-controls={contentId}
          title="精簡版只是導讀、完整內容未刪減"
          className="mt-3 text-sm rounded-md px-4 py-1.5 transition-colors"
          style={{ color: '#c9a84c', border: '1px solid rgba(197,150,58,0.35)', background: 'rgba(197,150,58,0.08)' }}
        >
          展開本章全文 ↓<span className="ml-2 text-xs opacity-60">內容未刪減</span>
        </button>
      )}
    </div>
  )
}
