// v5.10.257 — /r/* 報告頁專用 error boundary(Codex+Gemini 共識 P1「Error Boundaries」)
//
// 用途:
//   - /r/[type]/[id] 渲染失敗時 graceful fallback、不顯白屏
//   - 跟 app/error.tsx 不同:本檔針對 Beta 報告路徑、UX 更貼近報告 context
//   - 在 ReportRenderer 內部 throw / Adapter 錯 / 第三方元件 render 錯時都會 trigger
//
// a11y:
//   - 包 main + role + aria-live(對應 lesson #122 wire 完整、不留 dead ui)
//
// 對應:
//   - Gemini「/r/[type]/[id] 路由與 35+ 組件在面臨無效 ID、Schema 驗證失敗或 API 超時時、是否已有優雅的 Fallback UI」
//   - Codex「錯誤/空狀態」未處理 P0

'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log error to console for debugging(Sprint 2.x 可接 Sentry / Langfuse)
  useEffect(() => {
    console.error('[report-error-boundary]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.slice(0, 500),
    })
  }, [error])

  return (
    <main
      className="min-h-[80vh] flex items-center justify-center px-6"
      role="main"
      aria-live="assertive"
    >
      <div className="text-center max-w-lg">
        {/* v5.10.304 editorial:6xl 📜 → hairline divider + serif heading */}
        <div className="h-px w-16 bg-[var(--jy-text-gold)]/40 mx-auto mb-6" aria-hidden />
        <h1 className="text-2xl font-normal text-[var(--jy-text-primary)] mb-3" style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>
          報告載入失敗
        </h1>
        <p className="text-[var(--jy-text-secondary)] mb-6 leading-relaxed">
          很抱歉、您的報告暫時無法顯示。可能是網路波動或暫時性的伺服器問題。
        </p>

        {/* 開發環境顯錯誤細節、production 隱藏 */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 text-left text-xs bg-black/20 rounded-lg p-4 border border-[var(--jy-border-soft)]">
            <summary className="cursor-pointer text-[var(--jy-text-muted)] hover:text-[var(--jy-text-gold)]">
              錯誤細節(dev only)
            </summary>
            <pre className="mt-2 overflow-auto text-[var(--jy-text-tertiary)]">
              {error.message}
              {error.digest && `\n\ndigest: ${error.digest}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-xl bg-[var(--jy-text-gold)] text-[var(--jy-bg-deep)] font-bold hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2"
          >
            重新載入報告
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl border border-[var(--jy-border-soft)] text-[var(--jy-text-secondary)] hover:bg-white/5 hover:text-[var(--jy-text-primary)] transition-all"
          >
            回到我的報告
          </Link>
        </div>

        <p className="mt-8 text-xs text-[var(--jy-text-muted)]">
          問題持續?請聯繫{' '}
          <a
            href="mailto:support@jianyuan.life"
            className="text-[var(--jy-text-gold)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2"
          >
            support@jianyuan.life
          </a>
          {error.digest && (
            <span className="block mt-2 font-mono text-[10px] text-[var(--jy-text-muted)]/60">
              錯誤 ID:{error.digest}
            </span>
          )}
        </p>
      </div>
    </main>
  )
}
