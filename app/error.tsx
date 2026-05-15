'use client'

// T9 v5.10.353 (Master Plan Sprint 7 真修):error.tsx 升級
// L2 IA 抓到第一次 Write 失敗(File not read first)的 architectural half-fix、本次補上
// - 自動 Sentry / audit-event 上報(useEffect)
// - 顯示 error digest 客戶可截圖 report
// - retry button 加 3 秒 cooldown 防 cascade(若 server-side error 立刻 retry 可能再爆)
// - friendly 訊息 + a11y(role + aria-live)

import { useEffect, useState } from 'react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

// T9 v5.10.354 (L4 Gemini 加 PII / GraphQL / debug-only patterns、衝 95 gate):
// error.message 直 render 可能洩 stack/secret/DB schema/PII/etc
// 白名單模式:只顯示已知安全 message;其他一律泛用文字
function sanitizeErrorMessage(msg: string | undefined): string {
  if (!msg) return '頁面載入時發生錯誤、請稍後再試。'
  const trimmed = msg.trim()
  // 攔住可能的 leak pattern(L4 Gemini 補完 12 種、OWASP Sensitive Data Exposure 對齊)
  const dangerousPatterns = [
    // === Code / Debug leak(原 8 條)===
    /at\s+\w+\s+\(/,                           // stack trace "at fn ("
    /Error:\s+\w+/i,                            // generic error
    /SELECT|INSERT|UPDATE|DELETE\s+/i,          // SQL
    /Bearer\s+/i,                               // token
    /https?:\/\/[\w.-]+/,                       // URL leak
    /\/\w+(\/\w+)+\.(ts|tsx|js|py)/,            // file path
    /sk_test|sk_live|pk_test|pk_live/,          // Stripe key prefix
    /password|api_key|secret/i,                 // 字面 leak
    // === T9 v5.10.354 L4 Gemini 加(PII / framework debug)===
    /[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/,          // email PII
    /(\+?886[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/, // 台灣手機 09xx-xxx-xxx 含國際 +886912xxxxxx
    /\b\d{3}-?\d{2}-?\d{4}\b/,                  // US SSN PII
    /"errors"\s*:\s*\[/,                        // GraphQL error format
    /webpack-internal:|\(rsc\)|__next|node_modules/i, // Next.js / RSC framework debug-only
  ]
  for (const p of dangerousPatterns) {
    if (p.test(trimmed)) return '頁面載入時發生錯誤、請稍後再試。'
  }
  // 允許短 friendly 訊息(< 100 字)
  if (trimmed.length > 100) return '頁面載入時發生錯誤、請稍後再試。'
  return trimmed
}

export default function Error({ error, reset }: ErrorPageProps) {
  const [cooldown, setCooldown] = useState(0)

  // T9:啟動時自動上報 /api/error-report(client-side)
  useEffect(() => {
    const payload = {
      ts: new Date().toISOString(),
      digest: error.digest,
      message: error.message?.slice(0, 500),
      stack: error.stack?.split('\n').slice(0, 5).join(' | '),
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
    }
    try {
      // 用 sendBeacon 不阻塞 UI(若可用)
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        navigator.sendBeacon('/api/error-report', blob)
      } else {
        fetch('/api/error-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      /* 失敗不影響 UI */
    }
  }, [error])

  // T9:retry button cooldown(防客戶連按 cascade)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleRetry = () => {
    setCooldown(3)
    reset()
  }

  return (
    <div
      className="min-h-[80vh] flex items-center justify-center px-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
        <h1 className="text-2xl font-bold text-white mb-3">發生了一些問題</h1>
        <p className="text-text-muted mb-6">
          {sanitizeErrorMessage(error.message)}
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={handleRetry}
            disabled={cooldown > 0}
            className="px-6 py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={cooldown > 0 ? `${cooldown} 秒後可重試` : '重試'}
          >
            {cooldown > 0 ? `等 ${cooldown} 秒...` : '重試'}
          </button>
          <a
            href="/"
            className="px-6 py-3 glass rounded-xl text-cream hover:bg-white/10 transition-colors"
          >
            回到首頁
          </a>
        </div>
        {error.digest && (
          <p className="mt-6 text-[10px] text-text-muted/40 font-mono select-all">
            錯誤代碼:{error.digest}(若聯繫客服請附此代碼)
          </p>
        )}
        <p className="mt-4 text-xs text-text-muted/50">
          如果問題持續發生、請聯繫{' '}
          <a
            href="mailto:support@jianyuan.life"
            className="text-gold/70 hover:text-gold"
          >
            support@jianyuan.life
          </a>
        </p>
      </div>
    </div>
  )
}
