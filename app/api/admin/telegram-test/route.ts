// v5.3.2 Telegram 告警測試端點（2026-04-18）
//
// POST /api/admin/telegram-test?event=<event>
// Headers: x-admin-key
//
// 供後台監控頁觸發各種告警事件，檢查 Telegram 是否實際收到訊息。
// 所有訊息會以 [TEST] 前綴標示。

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import {
  notifyFailed, notifyHighCost, notifyQualityGate, notifyDaily,
  notifyLLMBalanceLow, notifyLLMBalanceCritical,
  notifyStripeFailed, notifyEmailFailed,
  notifyReportStuck, notifyAbnormalCost,
  notifyLowRating, notifyWorkflowFailed,
} from '@/lib/ai/observability/telegram'

const DUMMY_REPORT_ID = 'test-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const event = req.nextUrl.searchParams.get('event') || ''

  let ok = false
  let label = event

  try {
    switch (event) {
      case 'failed':
        ok = await notifyFailed(`[TEST]${DUMMY_REPORT_ID}`, '測試：Claude API 回 529 連續 3 次重試失敗')
        break
      case 'high-cost':
        ok = await notifyHighCost(1.85, 1.0)
        break
      case 'quality-gate':
        ok = await notifyQualityGate(`[TEST]${DUMMY_REPORT_ID}`, 65)
        break
      case 'balance-low':
        ok = await notifyLLMBalanceLow('[TEST] deepseek', 7.50, 'USD')
        break
      case 'balance-critical':
        ok = await notifyLLMBalanceCritical('[TEST] moonshot', 2.10, 'USD')
        break
      case 'stripe-failed':
        ok = await notifyStripeFailed('[TEST] cs_test_abc123', '3D Secure 驗證失敗', 89)
        break
      case 'email-failed':
        ok = await notifyEmailFailed(`[TEST]${DUMMY_REPORT_ID}`, 'test@example.com', 'Resend 回 422（退信 hard bounce）')
        break
      case 'stuck':
        ok = await notifyReportStuck(`[TEST]${DUMMY_REPORT_ID}`, 25, '測試客戶')
        break
      case 'abnormal-cost':
        ok = await notifyAbnormalCost(42.30, 16.67)
        break
      case 'low-rating':
        ok = await notifyLowRating(`[TEST]${DUMMY_REPORT_ID}`, 2, '測試留言：報告內容太籠統，希望能更深入。')
        break
      case 'workflow-failed':
        ok = await notifyWorkflowFailed(`[TEST]${DUMMY_REPORT_ID}`, 'Error: Python 排盤 API 回 500', 'paipan_step')
        break
      case 'daily':
        ok = await notifyDaily({
          date: new Date().toISOString().slice(0, 10) + ' [TEST]',
          totalReports: 12,
          successReports: 10,
          failedReports: 2,
          totalCostUsd: 8.45,
          totalRevenueUsd: 798,
          newCustomers: 5,
          topPlans: [{ plan: 'C', count: 4 }, { plan: 'D', count: 3 }, { plan: 'E2', count: 3 }],
          notes: '測試晨報',
        })
        break
      default:
        return NextResponse.json(
          {
            error: 'unknown event',
            supported: [
              'failed', 'high-cost', 'quality-gate',
              'balance-low', 'balance-critical',
              'stripe-failed', 'email-failed',
              'stuck', 'abnormal-cost',
              'low-rating', 'workflow-failed', 'daily',
            ],
          },
          { status: 400 },
        )
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, event: label, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  await writeAuditLog(req, 'create', 'system', `telegram-test-${event}`, {
    resource: 'telegram_test',
    event,
    result_ok: ok,
  })

  return NextResponse.json({
    ok,
    event: label,
    note: ok
      ? '已嘗試發送，請確認手機收到訊息（env 未設時會被 console warn 吞掉）'
      : 'Telegram 送出失敗，請檢查 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID',
  })
}
