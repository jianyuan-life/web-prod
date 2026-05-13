// v5.10.235 — PDFDownloadButton(用 /api/r/[type]/[id]/pdf endpoint、wire 進 4 報告 footer 前)
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface PDFDownloadButtonProps {
  reportType: 'life-blueprint' | 'heart-doubts' | 'compatibility' | 'family-blueprint'
  reportId: string
  className?: string
}

export function PDFDownloadButton({ reportType, reportId, className = '' }: PDFDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false)

  function handleDownload() {
    setDownloading(true)
    // server-side render PDF + 觸發 browser download via Content-Disposition: attachment
    window.location.href = `/api/r/${reportType}/${reportId}/pdf`
    // reset state after 3s(下載已 trigger、user 可重試)
    setTimeout(() => setDownloading(false), 3000)
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] cursor-pointer',
        'h-12 px-6 text-[15px] font-semibold',
        'border border-[var(--jy-border-gold)]',
        'text-[var(--jy-text-gold)]',
        'bg-transparent hover:bg-[rgba(229,185,92,0.08)]',
        'transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
        className,
      )}
      aria-label={downloading ? '下載中...' : '下載 PDF 報告'}
    >
      <span aria-hidden>{downloading ? '⏳' : '📥'}</span>
      <span>{downloading ? '準備 PDF...' : '下載 PDF 報告'}</span>
    </button>
  )
}
