'use client'

// v5.3.2 監控系統：頁面級 funnel 事件追蹤元件
// 放在頁面最上方，首次渲染即打一次 trackFunnelClient()。
// 用 useRef 防止 StrictMode 重複打（雖然伺服器端 UNIQUE index 會擋，但省一次網路）。

import { useEffect, useRef } from 'react'
import { trackFunnelClient, type FunnelStep } from '@/lib/funnel-tracker'

export default function FunnelPageHit({
  step,
  planCode,
  reportId,
  amountUsd,
}: {
  step: FunnelStep
  planCode?: string
  reportId?: string
  amountUsd?: number
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackFunnelClient({ step, planCode, reportId, amountUsd })
  }, [step, planCode, reportId, amountUsd])
  return null
}
