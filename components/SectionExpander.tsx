'use client'

import { useState, useEffect } from 'react'
import { safeHtml } from '@/lib/sanitize'

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
  const [simpleMode, setSimpleMode] = useState(false)
  const [userExpanded, setUserExpanded] = useState(false)

  useEffect(() => {
    const sync = () => {
      const isSimple = document.documentElement.getAttribute('data-view-mode') === 'simple'
      setSimpleMode(isSimple)
      if (!isSimple) setUserExpanded(false) // 回完整版時重置(下次切精簡版重新截斷)
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-view-mode'] })
    return () => obs.disconnect()
  }, [])

  const collapsed = simpleMode && !userExpanded

  return (
    <div className="section-expander">
      <div
        style={collapsed ? {
          maxHeight: '300px',
          overflow: 'hidden',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
          maskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
        } : undefined}
        dangerouslySetInnerHTML={{ __html: safeHtml(fullHtml) }}
      />
      {collapsed && (
        <button
          type="button"
          onClick={() => setUserExpanded(true)}
          className="mt-3 text-sm rounded-md px-4 py-1.5 transition-colors"
          style={{ color: '#c9a84c', border: '1px solid rgba(197,150,58,0.35)', background: 'rgba(197,150,58,0.08)' }}
        >
          展開本章全文 ↓
        </button>
      )}
    </div>
  )
}
