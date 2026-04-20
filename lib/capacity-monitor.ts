// 容量監控機制（v5.3.51）
//
// 目的：當報告生成積壓過多時，自動暫停新訂單結帳、避免 AI API rate limit 全面爆炸
//
// 判定策略：
// 1. 環境變數 QIMEN_CAPACITY_MODE：'open' / 'throttle' / 'closed'
//    - open（預設）：全開放
//    - throttle：E1-E4 出門訣暫停（這些生成最耗資源）；C/D/G15/R 繼續接單
//    - closed：完全暫停
// 2. 動態判斷：過去 15 分鐘 pending/generating 報告數量是否超過 QIMEN_CAPACITY_THRESHOLD
//
// 使用方式：
//   import { checkCapacity } from '@/lib/capacity-monitor'
//   const cap = await checkCapacity(planCode)
//   if (!cap.allowed) return cap.message

import { createClient } from '@supabase/supabase-js'

const CAPACITY_MODE = (process.env.QIMEN_CAPACITY_MODE || 'open').toLowerCase()
const CAPACITY_THRESHOLD = parseInt(process.env.QIMEN_CAPACITY_THRESHOLD || '20', 10)
const CAPACITY_WINDOW_MIN = parseInt(process.env.QIMEN_CAPACITY_WINDOW_MIN || '15', 10)

export interface CapacityDecision {
  allowed: boolean
  mode: string
  message?: string
  activeCount?: number
  threshold?: number
}

/**
 * 結帳前容量檢查
 * 調用位置：/api/checkout/route.ts 首行、/api/webhook/stripe/route.ts（可選）
 */
export async function checkCapacity(planCode: string): Promise<CapacityDecision> {
  // Step 1：強制模式判斷
  if (CAPACITY_MODE === 'closed') {
    return {
      allowed: false,
      mode: 'closed',
      message: '系統正進行維護，新訂單暫停中。請稍後再試或關注公告。',
    }
  }

  if (CAPACITY_MODE === 'throttle' && ['E1', 'E2', 'E3', 'E4'].includes(planCode)) {
    return {
      allowed: false,
      mode: 'throttle',
      message: '出門訣方案因系統繁忙暫停受理。請稍後再試，或考慮改選其他命格分析方案。',
    }
  }

  // Step 2：動態負載判斷（讀 Supabase pending/generating 數量）
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      // Supabase 未設定則直接放行（避免開發環境誤擋）
      return { allowed: true, mode: CAPACITY_MODE }
    }

    const supabase = createClient(url, key)
    const since = new Date(Date.now() - CAPACITY_WINDOW_MIN * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('paid_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'generating'])
      .gte('created_at', since)

    if (error) {
      // 查詢失敗則放行（不以監控機制反過來阻塞正常流量）
      console.warn('[capacity] Supabase query error:', error.message)
      return { allowed: true, mode: CAPACITY_MODE }
    }

    const active = count || 0
    if (active >= CAPACITY_THRESHOLD) {
      return {
        allowed: false,
        mode: 'dynamic_throttle',
        activeCount: active,
        threshold: CAPACITY_THRESHOLD,
        message: `系統目前有 ${active} 份報告正在生成中（超出安全閾值 ${CAPACITY_THRESHOLD}）。為保證報告品質，請於 ${CAPACITY_WINDOW_MIN} 分鐘後再試。`,
      }
    }

    return {
      allowed: true,
      mode: CAPACITY_MODE,
      activeCount: active,
      threshold: CAPACITY_THRESHOLD,
    }
  } catch (err) {
    // 任何意外錯誤都放行（fail-open）
    console.warn('[capacity] 檢查失敗，放行:', err)
    return { allowed: true, mode: CAPACITY_MODE }
  }
}

/**
 * 管理員手動切換容量模式（可用 API 路由呼叫）
 * 實作留給 /api/admin/capacity/route.ts（搭配 ADMIN_KEY 驗證）
 */
export function getCurrentCapacityMode(): string {
  return CAPACITY_MODE
}

export function getCapacityConfig() {
  return {
    mode: CAPACITY_MODE,
    threshold: CAPACITY_THRESHOLD,
    windowMin: CAPACITY_WINDOW_MIN,
  }
}
