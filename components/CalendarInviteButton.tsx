'use client'

import { useState } from 'react'
import type { CalendarTiming } from '@/lib/calendar-invite'
import { buildGoogleCalendarUrl, downloadIcs } from '@/lib/calendar-invite'

interface Props {
  timings: CalendarTiming[]
  planCode?: string
  // 顯示樣式：'single' = 單吉時（E1 每一項各一顆按鈕）、'batch' = 批次（E3/E4 多個一起）
  mode?: 'single' | 'batch'
  // 批次模式時的檔名（不含 .ics）
  batchFilename?: string
  // 自訂 UI
  className?: string
}

/**
 * 通用行事曆邀約按鈕（E1/E2/E3/E4 共用）
 *
 * single 模式：單一吉時，渲染 Google + iCal 兩個按鈕
 * batch 模式：多個吉時一次下載 ics（常用於 E3 訂閱 8 個吉時、E4 年度 12 個月盤）
 */
export default function CalendarInviteButton({
  timings,
  planCode = 'E1',
  mode = 'single',
  batchFilename,
  className = '',
}: Props) {
  const [icsDownloaded, setIcsDownloaded] = useState(false)

  if (!timings || timings.length === 0) return null

  const handleIcs = () => {
    const filename = batchFilename
      ? `${batchFilename}.ics`
      : `qimen-${planCode.toLowerCase()}-${Date.now()}.ics`
    downloadIcs(timings, filename)
    setIcsDownloaded(true)
    setTimeout(() => setIcsDownloaded(false), 2500)
  }

  // Single 模式：一個吉時對應一組按鈕
  if (mode === 'single' && timings.length === 1) {
    const t = timings[0]
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <a
          href={buildGoogleCalendarUrl(t)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
          style={{ background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.3)', color: '#6aa3f5' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          加入 Google Calendar
        </a>
        <button
          onClick={handleIcs}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
          style={{ background: 'rgba(197,150,58,0.12)', border: '1px solid rgba(197,150,58,0.3)', color: 'var(--color-gold)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {icsDownloaded ? '✓ 已下載' : '下載 .ics'}
        </button>
      </div>
    )
  }

  // Batch 模式：多個吉時一起匯出
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <button
        onClick={handleIcs}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #c9a84c 0%, #e8c87a 50%, #f7dfa0 100%)',
          color: '#0a0e1a',
          boxShadow: '0 4px 14px rgba(201, 168, 76, 0.35)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <polyline points="8 15 12 19 16 15"/>
          <line x1="12" y1="13" x2="12" y2="19"/>
        </svg>
        {icsDownloaded ? '✓ 已下載到您的裝置' : `一次匯入 ${timings.length} 個吉時到行事曆`}
      </button>
      <p className="w-full text-[11px] text-text-muted/70 text-center">
        下載 .ics 檔後雙擊即可匯入 Apple Calendar / Google Calendar / Outlook
      </p>
    </div>
  )
}
