'use client'
import { useState } from 'react'
import { trackFunnelClient } from '@/lib/funnel-tracker'
import { buildPdfDownloadUrl, buildPdfDownloadFilename } from '@/lib/pdf-download'

export default function ReportClientButtons({ pdfUrl, planCode, reportId, clientName, accessToken }: {
  pdfUrl: string | null
  planCode?: string
  reportId?: string
  clientName?: string
  accessToken?: string  // v5.3.34：report-view API 強制要求 access_token 防刷
}) {
  const [shareLabel, setShareLabel] = useState('分享報告')
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState<string | null>(null)
  // v5.3.59 規格書對齊：E1-E4 全部提供 PDF（規格書明確要求）
  // E1/E2 有金色日曆式按鈕、E3 8 卡片 PDF、E4 13 份 PDF 批次
  const isChumenji = planCode === 'E1' || planCode === 'E2' || planCode === 'E3' || planCode === 'E4'

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
      body: JSON.stringify({ report_id: reportId, plan_code: planCode, event_type: 'pdf_download', access_token: accessToken }),
    }).catch(() => {})
    // v5.3.2：同步寫入 funnel 事件
    trackFunnelClient({ step: 'pdf_downloaded', planCode, reportId })
  }

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
          href={buildPdfDownloadUrl(pdfUrl, planCode, clientName)}
          download={buildPdfDownloadFilename(planCode, clientName)}
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
          {planCode === 'E1' ? '下載 Top3 吉時 PDF' : planCode === 'E2' ? '下載本月月盤 PDF' : '下載 4 週吉時月度 PDF'}
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
        {generating ? '正在生成 PDF...' : (planCode === 'E1' ? '生成 Top3 吉時 PDF' : planCode === 'E2' ? '生成本月月盤 PDF' : '生成 4 週吉時月度 PDF')}
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

        {/* v5.3.59 規格書要求：E1-E4 出門訣全系列 PDF 按鈕（金色日曆式） */}
        {/* v5.3.75：E3 月度訂閱不提供 PDF（老闆明確指示、深度綁定 web 策略）
            行事曆按鈕才是 E3 主力交付管道。E1/E2/E4 保留舊邏輯 */}
        {isChumenji && planCode !== 'E3' && renderChumenjiPdfButton()}

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
