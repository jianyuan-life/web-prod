'use client'

import { useState } from 'react'

// v5.7.93 真分享(Web Share API + clipboard fallback、Gemini #5 +2 分社交貨幣)
export default function ShareReportButton({
  title = '我的命格報告',
  text,
}: {
  title?: string
  text: string
}) {
  const [copied, setCopied] = useState(false)
  const [showFallback, setShowFallback] = useState(false)

  const handleShare = async () => {
    const shareData = {
      title,
      text,
      url: typeof window !== 'undefined' ? window.location.href : '',
    }
    if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: (d: unknown) => Promise<void> }).share) {
      try {
        await (navigator as Navigator & { share: (d: unknown) => Promise<void> }).share(shareData)
      } catch {
        // user cancelled
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(`${text}\n\n${shareData.url}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        setShowFallback(true)
      }
    }
  }

  return (
    <>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition"
        style={{
          background: 'rgba(155,89,182,0.15)',
          border: '1px solid rgba(155,89,182,0.45)',
          color: '#bb8fce',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span>{copied ? '✓ 已複製' : '分享我的命格洞察'}</span>
      </button>
      {showFallback && (
        <div className="mt-3 px-3 py-2 text-[11px] text-text-muted bg-black/30 rounded">
          手動複製:{text}
        </div>
      )}
    </>
  )
}
