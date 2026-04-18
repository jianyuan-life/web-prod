'use client'
import { useState } from 'react'
import { trackFunnelClient } from '@/lib/funnel-tracker'

export default function ReportClientButtons({ pdfUrl, planCode, reportId }: { pdfUrl: string | null; planCode?: string; reportId?: string }) {
  const [shareLabel, setShareLabel] = useState('分享報告')
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState<string | null>(null)
  const isChumenji = planCode === 'E1' || planCode === 'E2'

  // PDF 下載追蹤（5 分鐘內同一報告不重複計算）
  const trackPdfDownload = () => {
    if (!reportId) return
    const storageKey = `pdf_downloaded_${reportId}`
    const lastDownloaded = sessionStorage.getItem(storageKey)
    const now = Date.now()
    if (lastDownloaded && now - parseInt(lastDownloaded, 10) < 5 * 60 * 1000) return
    sessionStorage.setItem(storageKey, now.toString())
    fetch('/api/report-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, plan_code: planCode, event_type: 'pdf_download' }),
    }).catch(() => {})
    // v5.3.2：同步寫入 funnel 事件
    trackFunnelClient({ step: 'pdf_downloaded', planCode, reportId })
  }

  const handleShare = async () => {
    const url = window.location.href
    // Web Share API（iOS/Android 原生分享選單）
    if (navigator.share) {
      try {
        await navigator.share({ title: '鑒源命理報告', text: '我的命理分析報告，分享給你看看', url })
        return
      } catch {
        // 使用者取消或不支援，fallback 到複製
      }
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url)
      setShareLabel('✓ 連結已複製！')
      setTimeout(() => setShareLabel('分享報告'), 2500)
    } catch {
      // 最後手段：提示手動複製
      window.prompt('複製此連結分享給家人（無需登入即可查看）：', url)
    }
  }

  // E1/E2：若 pdf_url 尚未就緒，觸發後端重新生成 PDF
  const handleGeneratePdf = async () => {
    if (!reportId || generating) return
    setGenerating(true)
    setGenerateMsg('正在為你重新生成 PDF，約 30 秒...')
    try {
      const res = await fetch('/api/reports/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.pdf_url) {
        setGenerateMsg('✓ PDF 已就緒，即將開啟...')
        setTimeout(() => { window.open(data.pdf_url, '_blank') }, 500)
      } else {
        setGenerateMsg('生成中，請稍候刷新頁面')
      }
    } catch (err) {
      console.error(err)
      setGenerateMsg('生成失敗，請稍後再試或聯繫客服')
    } finally {
      setTimeout(() => setGenerating(false), 2000)
    }
  }

  // E1/E2 專屬 PDF 按鈕（金色漸層 + 日曆 icon）
  const renderChumenjiPdfButton = () => {
    if (pdfUrl) {
      return (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackPdfDownload}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:scale-105 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #c9a84c 0%, #e8c87a 50%, #f7dfa0 100%)',
            color: '#0a0e1a',
            boxShadow: '0 4px 14px rgba(201, 168, 76, 0.4)',
          }}
        >
          {/* 日曆+下載複合圖示 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <polyline points="8 15 12 19 16 15" />
            <line x1="12" y1="13" x2="12" y2="19" />
          </svg>
          {planCode === 'E1' ? '下載 Top3 吉時 PDF' : '下載 4 週吉時月度 PDF'}
        </a>
      )
    }
    // pdf_url 尚未就緒：顯示「生成 PDF」按鈕
    return (
      <button
        onClick={handleGeneratePdf}
        disabled={generating}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #c9a84c 0%, #e8c87a 50%, #f7dfa0 100%)',
          color: '#0a0e1a',
          boxShadow: '0 4px 14px rgba(201, 168, 76, 0.4)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          {generating ? (
            <circle cx="12" cy="15" r="3" />
          ) : (
            <>
              <polyline points="8 15 12 19 16 15" />
              <line x1="12" y1="13" x2="12" y2="19" />
            </>
          )}
        </svg>
        {generating ? '正在生成 PDF...' : (planCode === 'E1' ? '生成 Top3 吉時 PDF' : '生成 4 週吉時月度 PDF')}
      </button>
    )
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-3">
        {/* C/D/G15/R：原有 PDF 按鈕 */}
        {pdfUrl && !isChumenji && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackPdfDownload}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #e8c87a)', color: '#0a0e1a' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            下載 PDF 完整報告
          </a>
        )}

        {/* E1/E2：獨立金色日曆式按鈕（支援 pdf_url 下載 & fallback 觸發生成） */}
        {isChumenji && renderChumenjiPdfButton()}

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all hover:scale-105"
          style={{ background: 'rgba(197,150,58,0.15)', border: '1px solid rgba(197,150,58,0.25)', color: 'var(--color-gold)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          {shareLabel}
        </button>
      </div>
      {generateMsg && (
        <p className="text-xs text-text-muted mt-1">{generateMsg}</p>
      )}
    </div>
  )
}
