// ============================================================
// Workflow 觸發端點：啟動報告生成 workflow
// POST /api/workflows/generate-report
//
// 防重複觸發：
// 1. 檢查報告狀態，只有 pending/failed 才啟動
// 2. generating/completed 直接跳過，避免重複浪費 API
// ============================================================

import { start } from 'workflow/api'
import { NextRequest, NextResponse } from 'next/server'
import { generateReportWorkflow } from '@/workflows/generate-report'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

export async function POST(req: NextRequest) {
  try {
    // 安全驗證：只允許內部呼叫（Webhook/Cron/Fallback）
    // 使用 CRON_SECRET 或 ADMIN_KEY 驗證，不依賴可偽造的 Origin/Referer
    // v5.3.34：如果 CRON_SECRET 未設定，直接拒絕，避免空字串繞過
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('❌ CRON_SECRET 未設定，拒絕 workflow 觸發')
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization')
    const hasCronSecret = authHeader === `Bearer ${cronSecret}`
    // 內部呼叫（同一 Vercel 部署）的 server-to-server fetch 不帶 Origin
    // 用 x-internal-secret header 取代 Origin 判斷
    const internalSecret = req.headers.get('x-internal-secret')
    const isInternalCall = internalSecret === cronSecret

    if (!isInternalCall && !hasCronSecret) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { reportId } = await req.json()

    if (!reportId) {
      return NextResponse.json({ error: '缺少 reportId' }, { status: 400 })
    }

    // 防重複觸發：先檢查報告狀態
    const supabase = createServiceClient()
    const { data: report } = await supabase
      .from('paid_reports')
      .select('status')
      .eq('id', reportId)
      .single()

    if (report?.status === 'completed') {
      console.info(`⏭️ 報告 ${reportId} 已完成，跳過重複觸發`)
      return NextResponse.json({ success: true, skipped: true, reason: '已完成' })
    }

    if (report?.status === 'generating') {
      console.info(`⏭️ 報告 ${reportId} 正在生成中，跳過重複觸發`)
      return NextResponse.json({ success: true, skipped: true, reason: '正在生成中' })
    }

    console.info(`啟動報告生成 workflow: ${reportId}`)
    const run = await start(generateReportWorkflow, [reportId])

    return NextResponse.json({
      success: true,
      runId: run.runId,
      reportId,
    })
  } catch (err) {
    console.error('Workflow 啟動失敗:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 },
    )
  }
}
