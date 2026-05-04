'use client'

import { useState, useEffect } from 'react'

// v5.9.8 行動項互動 checkbox(Claude「驗證迴圈是單向 checklist、需雙向反饋閉環」修)
// localStorage 持久化、用戶可勾選追蹤進度
export default function InteractiveActionItem({
  storageKey,
  badge,
  badgeBg,
  badgeColor,
  children,
}: {
  storageKey: string
  badge: string
  badgeBg: string
  badgeColor: string
  children: React.ReactNode
}) {
  const [checked, setChecked] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === '1') setChecked(true)
    } catch {}
  }, [storageKey])

  const toggle = () => {
    const next = !checked
    setChecked(next)
    try {
      if (next) localStorage.setItem(storageKey, '1')
      else localStorage.removeItem(storageKey)
    } catch {}
  }

  return (
    <div className="flex items-start gap-2">
      <button
        onClick={toggle}
        className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all hover:scale-110"
        style={{
          background: checked ? '#6ab04c' : 'rgba(0,0,0,0.30)',
          borderColor: checked ? '#6ab04c' : 'rgba(106,176,76,0.50)',
        }}
        aria-label={checked ? '已完成' : '標記完成'}
      >
        {mounted && checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>
      <span className={checked ? 'text-text-muted/45 line-through' : ''}>{children}</span>
    </div>
  )
}
