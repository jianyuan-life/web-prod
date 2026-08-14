'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { requestPrivateReportPdf } from '@/lib/report/private-pdf-client'

type PrivatePdfDownloadButtonProps = {
  accessToken?: string | null
  reportId?: string | null
  authToken?: string | null
  pdfAvailable: boolean
  filename: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  children: ReactNode
}

export default function PrivatePdfDownloadButton({
  accessToken,
  reportId,
  authToken,
  pdfAvailable,
  filename,
  className,
  style,
  ariaLabel = '下載 PDF',
  children,
}: PrivatePdfDownloadButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const canUseOwnerSession = Boolean(reportId && authToken)
  const canUseReportToken = Boolean(accessToken)
  const disabled = state === 'loading' || (!canUseOwnerSession && !canUseReportToken)

  const download = async () => {
    if (disabled) return
    setState('loading')
    try {
      const blob = await requestPrivateReportPdf({
        accessToken,
        reportId,
        authToken,
        pdfAvailable,
      })

      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoking synchronously can race the browser's download navigation.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={ariaLabel}
      aria-busy={state === 'loading'}
      disabled={disabled}
      onClick={download}
    >
      {state === 'loading' ? '準備 PDF…' : state === 'error' ? 'PDF 暫時無法下載' : children}
    </button>
  )
}
