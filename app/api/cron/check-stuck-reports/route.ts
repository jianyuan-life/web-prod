// v5.3.2 卡住報告告警 Cron（2026-04-18）
//
// GET /api/cron/check-stuck-reports
// Header: Authorization: Bearer ${CRON_SECRET}
// Vercel Cron 每 15 分跑一次
//
// 邏輯：找 status='generating' 且 created_at < now - 20min 的報告
//      → 整合成一則 Telegram 訊息（避免 1 份發 1 則訊息刷屏）
//      → 已告警過的不重複（24 小時內只告警一次，用 generation_progress.last_alerted_at 判斷）
//
// 注意：retry-pending cron 已負責 60 分鐘才 failed，這裡只做早期告警不干預狀態。

import { NextRequest, NextResponse } from 'next/server'
import { notifyReportStuck, notify } from '@/lib/ai/observability/telegram'
import { checkCronAuth } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

export const maxDuration = 30

const STUCK_THRESHOLD_MIN = 20
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 同一份報告 6 小時只告警一次

export async function GET(req: NextRequest) {
  // v5.10.279 fail-closed auth(Codex P0#3)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const supabase = createServiceClient()

  const now = Date.now()
  const threshold = new Date(now - STUCK_THRESHOLD_MIN * 60 * 1000).toISOString()

  // v5.10.283 soft delete filter:軟刪 stuck 報告不再 alert / 處理
  const { data: stuck, error } = await supabase
    .from('paid_reports')
    .select('id, client_name, plan_code, created_at, generation_progress')
    .eq('status', 'generating')
    .lt('created_at', threshold)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stuckList = stuck || []
  const toAlert: typeof stuckList = []
  const updates: Array<{ id: string; newProgress: Record<string, unknown> }> = []

  for (const r of stuckList) {
    const progress = (r.generation_progress || {}) as Record<string, string>
    const lastAlertedAt = progress.last_stuck_alert_at ? new Date(progress.last_stuck_alert_at).getTime() : 0
    if (now - lastAlertedAt < ALERT_COOLDOWN_MS) continue
    toAlert.push(r)
    updates.push({
      id: r.id,
      newProgress: { ...progress, last_stuck_alert_at: new Date(now).toISOString() },
    })
  }

  // 批次告警（超過 3 份整合成一則訊息）
  if (toAlert.length === 0) {
    return NextResponse.json({ message: '沒有需告警的卡住報告', scanned: stuckList.length })
  }

  if (toAlert.length <= 3) {
    for (const r of toAlert) {
      const mins = Math.round((now - new Date(r.created_at).getTime()) / 60000)
      await notifyReportStuck(r.id, mins, r.client_name || undefined)
    }
  } else {
    const listText = toAlert.slice(0, 8).map(r => {
      const mins = Math.round((now - new Date(r.created_at).getTime()) / 60000)
      return `• ${r.id.slice(0, 8)} / ${r.client_name || '?'} / ${r.plan_code} / 卡 ${mins} 分`
    }).join('\n')
    await notify(
      `⏱ 多份報告卡住（${toAlert.length} 份）`,
      `超過 ${STUCK_THRESHOLD_MIN} 分鐘未完成：\n\n${listText}\n\n${toAlert.length > 8 ? `...還有 ${toAlert.length - 8} 份未列出` : ''}\n請到 /jamie/monitoring 查看並重試`,
    )
  }

  // 更新告警時間戳（避免下次重發）
  for (const u of updates) {
    await supabase
      .from('paid_reports')
      .update({ generation_progress: u.newProgress })
      .eq('id', u.id)
  }

  return NextResponse.json({
    message: '告警完成',
    alerted: toAlert.length,
    scanned: stuckList.length,
  })
}
