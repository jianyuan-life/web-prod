// 客戶漏斗事件追蹤（L7+ 2026-04-17）
//
// 用途：記錄客戶從訪客→結帳→付款→報告生成→查看→下載 PDF 的每一步。
//       對應 migration：supabase/migrations/create_customer_funnel_events.sql
//
// 伺服器端使用（推薦）：
//   import { trackFunnelServer } from '@/lib/funnel-tracker'
//   await trackFunnelServer({ sessionId, step: 'payment_success', planCode: 'C', reportId })
//
// 前端使用：
//   import { trackFunnelClient } from '@/lib/funnel-tracker'
//   trackFunnelClient({ step: 'visit_pricing' })

import { createClient } from '@supabase/supabase-js'

export type FunnelStep =
  | 'visit_pricing'
  | 'start_checkout'
  | 'begin_payment'
  | 'payment_success'
  | 'report_generated'
  | 'report_viewed'
  | 'pdf_downloaded'

export type FunnelEvent = {
  sessionId: string
  step: FunnelStep
  userId?: string | null
  planCode?: string | null
  reportId?: string | null
  amountUsd?: number | null
  metadata?: Record<string, unknown>
}

/**
 * 伺服器端寫入（用 service_role，繞過 RLS）
 * 失敗不拋錯（非關鍵流程）
 */
export async function trackFunnelServer(event: FunnelEvent): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const supabase = createClient(url, key)
    // 使用 upsert ignoreDuplicates 避免觸發 UNIQUE 衝突
    await supabase
      .from('customer_funnel_events')
      .insert({
        session_id: event.sessionId,
        user_id: event.userId || null,
        step: event.step,
        plan_code: event.planCode || null,
        report_id: event.reportId || null,
        amount_usd: event.amountUsd || null,
        metadata: event.metadata || {},
      })
      .select()  // 不用 on conflict ignore，DB 層 unique index 會直接擋，讓錯誤吞掉即可
  } catch {
    // 靜默：UNIQUE violation 或其他錯誤不影響主流程
  }
}

/**
 * 前端追蹤（走公開 POST /api/track/funnel，anon 可寫入）
 */
export async function trackFunnelClient(params: {
  step: FunnelStep
  planCode?: string
  reportId?: string
  amountUsd?: number
  metadata?: Record<string, unknown>
}): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    // 沿用 Tracker.tsx 已設定的 session id（存於 localStorage）
    const sessionId = getOrCreateClientSessionId()
    await fetch('/api/track/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        step: params.step,
        plan_code: params.planCode || null,
        report_id: params.reportId || null,
        amount_usd: params.amountUsd || null,
        metadata: params.metadata || {},
      }),
      keepalive: true,
    })
  } catch {
    /* ignore */
  }
}

function getOrCreateClientSessionId(): string {
  try {
    // 優先使用 Tracker.tsx 已有的 sessionStorage['jy_session']（與 visitor_events 同軌）
    const ss = sessionStorage.getItem('jy_session')
    if (ss) return ss

    // 次選 localStorage（跨 session 持久化，用於付款後回到新 tab 仍能保留漏斗）
    const key = 'jy_session_id'
    let s = localStorage.getItem(key)
    if (!s) {
      s = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)) as string
      localStorage.setItem(key, s)
    }
    return s
  } catch {
    return 'anon_' + Math.random().toString(36).slice(2)
  }
}
