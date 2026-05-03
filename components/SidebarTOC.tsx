'use client'

/**
 * v5.7.53 Sticky Left Sidebar TOC(桌面 lg+ 顯示)
 *
 * 整合 ScrollSpy(對應 a.toc-link[href^="#sec-"] + data-active="true" CSS)
 * 業界共識:Notion 224 / Stripe 240-280 / Vercel 256
 * Wikipedia 2023 A/B 實證 deep exploration +53%
 *
 * 桌面 lg+ 顯示、mobile/tablet 隱藏(後續加 bottom drawer)
 */
type SectionItem = { idx: number; title: string; partLabel?: string }

export default function SidebarTOC({ sections }: { sections: SectionItem[] }) {
  if (!sections.length) return null

  return (
    <aside
      className="hidden lg:block no-print sticky-sidebar-toc"
      style={{
        position: 'sticky',
        top: '6rem',
        alignSelf: 'start',
        maxHeight: 'calc(100vh - 8rem)',
        overflowY: 'auto',
        paddingRight: '1rem',
      }}
    >
      <div className="text-gold/50 text-[10px] tracking-[3px] mb-3 uppercase font-semibold">本報告章節</div>
      <nav>
        {sections.map((s) => (
          <a
            key={s.idx}
            href={`#sec-${s.idx}`}
            className="toc-link block py-2 px-3 mb-0.5 text-sm transition-all rounded"
            style={{
              color: 'rgba(232, 220, 178, 0.55)',
              borderLeft: '2px solid transparent',
              lineHeight: '1.5',
            }}
            onMouseEnter={(e) => {
              if (e.currentTarget.getAttribute('data-active') !== 'true') {
                e.currentTarget.style.color = 'rgba(232, 220, 178, 0.85)'
              }
            }}
            onMouseLeave={(e) => {
              if (e.currentTarget.getAttribute('data-active') !== 'true') {
                e.currentTarget.style.color = 'rgba(232, 220, 178, 0.55)'
              }
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>
      {/* 對應 ScrollSpy data-active CSS:金邊 + 粗體 + 金字 */}
      <style jsx>{`
        .toc-link[data-active='true'] {
          color: #c9a84c !important;
          border-left-color: #c9a84c !important;
          background: rgba(197, 150, 58, 0.08);
          font-weight: 600;
        }
      `}</style>
    </aside>
  )
}
