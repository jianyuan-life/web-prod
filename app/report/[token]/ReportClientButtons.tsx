'use client'
import { useState } from 'react'

export default function ReportClientButtons() {
  const [shareLabel, setShareLabel] = useState('分享報告')

  const handleShare = async () => {
    const url = window.location.href
    // v5.3.20：移除 navigator.share（桌面 Safari 有 bug，會彈出「無法為您顯示所有可分享的方式」
    //   且不走 catch → fallback 失效）
    //   直接 clipboard 複製 = 最穩 UX，點下去就看到「✓ 連結已複製！」
    try {
      await navigator.clipboard.writeText(url)
      setShareLabel('✓ 連結已複製！')
      setTimeout(() => setShareLabel('分享報告'), 2500)
    } catch {
      // 最後手段：prompt 讓用戶手動複製（HTTPS 沒拿到或 permission 被拒）
      window.prompt('複製此報告連結：', url)
    }
  }

  return (
    <div className="no-print mt-8 flex justify-center">
      <button
        type="button"
        onClick={handleShare}
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all hover:scale-105"
        style={{ background: 'rgba(197,150,58,0.15)', border: '1px solid rgba(197,150,58,0.25)', color: 'var(--color-gold)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        {shareLabel}
      </button>
    </div>
  )
}
