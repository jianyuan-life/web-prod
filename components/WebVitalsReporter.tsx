'use client'

// v5.10.325 (P0 #1 監控對齊 — 客製 Web Vitals 上報)
// 補充 Vercel SpeedInsights 不足:
//   - SpeedInsights tier 限月 25K 事件、過量會 sample
//   - 我們 keep 自己 endpoint 的 raw data 做歷史趨勢分析
// 用 next/web-vitals 的 useReportWebVitals hook(Next.js 16+)

import { useReportWebVitals } from 'next/web-vitals'
import { reportWebVital, type WebVitalMetric } from '@/lib/monitoring/web-vitals'

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // metric 從 next/web-vitals 出來、形狀對得上 WebVitalMetric interface
    reportWebVital(metric as WebVitalMetric)
  })

  return null
}
