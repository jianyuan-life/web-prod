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
import { verifyG15ConsumedOrderBinding } from '@/lib/checkout/g15-consent-order.server'
import {
  operationalErrorClass,
  operationalFingerprint,
} from '@/lib/security/operational-telemetry'

function reportLogContext(reportId: string): { reportFingerprint?: string } {
  const reportFingerprint = operationalFingerprint(reportId)
  return reportFingerprint === 'unavailable' ? {} : { reportFingerprint }
}

export async function POST(req: NextRequest) {
  try {
    // 安全驗證：只允許內部呼叫（Webhook/Cron/Fallback）
    // 使用 CRON_SECRET 或 ADMIN_KEY 驗證，不依賴可偽造的 Origin/Referer
    // v5.3.34：如果 CRON_SECRET 未設定，直接拒絕，避免空字串繞過
    const cronSecret = process.env.CRON_SECRET
    if (typeof cronSecret !== 'string' || cronSecret.trim().length === 0) {
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

    const { reportId } = await req.json() as { reportId?: unknown }

    if (typeof reportId !== 'string' || reportId.trim().length === 0) {
      return NextResponse.json({ error: '缺少 reportId' }, { status: 400 })
    }

    // 防重複觸發：先檢查報告狀態
    const supabase = createServiceClient()
    const { data: report, error: statusError } = await supabase
      .from('paid_reports')
      .select('status,plan_code,stripe_session_id,user_id,birth_data')
      .eq('id', reportId)
      .single()

    if (statusError) {
      console.error('Workflow 狀態查詢失敗', {
        ...reportLogContext(reportId),
        errorType: operationalErrorClass(statusError),
      })
      return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 503 })
    }

    if (!report) {
      console.warn('Workflow 報告不存在', reportLogContext(reportId))
      return NextResponse.json({ error: 'REPORT_NOT_FOUND' }, { status: 404 })
    }

    if (report?.status === 'completed') {
      console.info('Workflow 跳過已完成報告', reportLogContext(reportId))
      return NextResponse.json({ success: true, skipped: true, reason: '已完成' })
    }

    if (report?.status === 'generating') {
      console.info('Workflow 跳過生成中報告', reportLogContext(reportId))
      return NextResponse.json({ success: true, skipped: true, reason: '正在生成中' })
    }

    if (report.status !== 'pending' && report.status !== 'failed') {
      console.warn('Workflow 報告狀態不允許啟動', reportLogContext(reportId))
      return NextResponse.json({ error: 'REPORT_NOT_STARTABLE' }, { status: 409 })
    }

    if (report.plan_code === 'G15') {
      const consentBindingValid = await verifyG15ConsumedOrderBinding({
        supabase,
        reportId,
        stripeSessionId: report.stripe_session_id,
        purchaserUserId: report.user_id,
        birthData: report.birth_data,
      })
      if (!consentBindingValid) {
        console.error('[workflow-start][g15-consent] consumed order binding invalid', reportLogContext(reportId))
        return NextResponse.json({ error: 'G15_CONSENT_ORDER_BINDING_INVALID' }, { status: 409 })
      }
    }

    console.info('啟動報告生成 workflow', reportLogContext(reportId))
    const run = await start(generateReportWorkflow, [reportId])

    return NextResponse.json({
      success: true,
      runId: run.runId,
    })
  } catch (err) {
    console.error('Workflow 啟動失敗', { errorType: operationalErrorClass(err) })
    return NextResponse.json(
      { error: 'WORKFLOW_START_FAILED' },
      { status: 500 },
    )
  }
}
