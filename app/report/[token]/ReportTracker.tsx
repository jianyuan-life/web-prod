'use client'
import { useEffect } from 'react'
import { trackFunnelClient } from '@/lib/funnel-tracker'
import { internalPost } from '@/lib/api'  // T10b v5.10.380(timeout + 429)

// 報告瀏覽追蹤元件
// 載入後自動記錄一次瀏覽事件，5 分鐘內同一 token 不重複計算
// v5.3.2：同步觸發 customer_funnel_events 的 report_viewed

interface ReportTrackerProps {
  reportId: string
  planCode: string
  token: string
}

export default function ReportTracker({ reportId, planCode, token }: ReportTrackerProps) {
  useEffect(() => {
    const storageKey = `report_viewed_${token}`
    const lastViewed = sessionStorage.getItem(storageKey)
    const now = Date.now()

    // 5 分鐘內不重複記錄
    if (lastViewed && now - parseInt(lastViewed, 10) < 5 * 60 * 1000) {
      return
    }

    sessionStorage.setItem(storageKey, now.toString())

    // T10b v5.10.380 — internalPost 統一處理(timeout + 429 silent fail)
    internalPost('/api/report-view', {
      report_id: reportId,
      plan_code: planCode,
      event_type: 'view',
      access_token: token, // v5.3.34:API 強制要求 access_token 防刷
    }).catch(() => {
      // 追蹤失敗不影響使用者體驗(含 RateLimitError)
    })

    // 同時寫入 customer_funnel_events（v5.3.2 監控漏斗）
    trackFunnelClient({
      step: 'report_viewed',
      planCode,
      reportId,
    })
  }, [reportId, planCode, token])

  return null
}
