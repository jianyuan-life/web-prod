// v5.10.325 (P0 #1 監控對齊)
// 客製 Web Vitals 上報(client-side、補充 Vercel SpeedInsights)
// 為什麼還要做客製:Vercel SpeedInsights tier 限月 25K 事件、過量會被 sample
// 我們可以另外把 INP / LCP / CLS 寫到自己的 endpoint、long-term 留存

export interface WebVitalMetric {
  id: string
  name: 'CLS' | 'INP' | 'FCP' | 'LCP' | 'TTFB' | 'FID'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  navigationType: string
}

const ENDPOINT = '/api/web-vitals'

/**
 * 上報 Web Vital metric 到 /api/web-vitals(beacon API、不阻塞)
 * 用於 app/layout.tsx + reportWebVitals (Next.js client component)
 */
export function reportWebVital(metric: WebVitalMetric) {
  // 只上報生產環境
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return

  const payload = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    page: window.location.pathname,
    ts: Date.now(),
  })

  // 優先用 sendBeacon(可靠、頁面 unload 時也能送)
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon(ENDPOINT, blob)
      return
    }
  } catch (e) {
    // sendBeacon 不可用、fall back to fetch
  }

  // Fallback:fetch + keepalive
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* 失敗靜默、不影響 UX */
    })
  } catch (e) {
    /* 連 fetch 都不可用、靜默 */
  }
}

/**
 * Vercel Web Vitals rating thresholds(2026-05 spec)
 * https://web.dev/articles/vitals#core-web-vitals
 */
export const VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  FID: { good: 100, poor: 300 },
} as const
