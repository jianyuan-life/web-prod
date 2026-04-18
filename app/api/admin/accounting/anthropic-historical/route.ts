// Anthropic 歷史成本回填 API (v5.3.5 2026-04-18)
//
// POST /api/admin/accounting/anthropic-historical
// Headers: x-admin-key
// Body: {
//   try_admin_api?: boolean        // 先嘗試 Admin API (/v1/organizations/cost_report)
//   manual_amount?: number         // 若 Admin API 無法取，直接寫這個金額
//   start_date?: string            // YYYY-MM-DD，預設 2026-04-06
//   end_date?: string              // YYYY-MM-DD，預設今天
//   note?: string
// }
//
// 流程：
//   1. 若 try_admin_api=true：呼叫 Anthropic Admin API（需 Admin Key + anthropic-beta: admin-2025-04-15）
//      - 成功：將每日成本拆成多筆寫入 expense_log(category='ai_cost', subcategory='anthropic_historical')
//      - 失敗：fallback 到手動金額
//   2. 若只提供 manual_amount：直接寫一筆聚合 expense_log
//   3. 永不虛構金額，一定標註資料來源（Admin API / 手動）

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { recordExpense } from '@/lib/accounting'
import { recordAIUsage } from '@/lib/ai-cost-tracker'

type AdminCostReportResp = {
  data?: Array<{
    date?: string              // YYYY-MM-DD
    amount?: number            // USD
    amount_usd?: number
    workspace_id?: string
    cost_basis?: string
    [k: string]: unknown
  }>
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: {
    try_admin_api?: boolean
    manual_amount?: number
    start_date?: string
    end_date?: string
    note?: string
    key?: string
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const startDate = body.start_date || '2026-04-06'
  const endDate = body.end_date || new Date().toISOString().slice(0, 10)
  const note = body.note || `Anthropic 歷史成本回填（${startDate} ~ ${endDate}）`

  const tryAdmin = body.try_admin_api !== false
  const manualAmount = Number(body.manual_amount || 0)

  let adminApiResult: { ok: boolean; records_written: number; total_usd: number; raw: unknown } = {
    ok: false, records_written: 0, total_usd: 0, raw: null,
  }

  if (tryAdmin) {
    try {
      const adminKey = process.env.ANTHROPIC_ADMIN_KEY || process.env.CLAUDE_ADMIN_KEY || process.env.CLAUDE_API_KEY || ''
      if (!adminKey) {
        adminApiResult = {
          ok: false,
          records_written: 0,
          total_usd: 0,
          raw: { error: 'ANTHROPIC_ADMIN_KEY 未設定' },
        }
      } else {
        const url = new URL('https://api.anthropic.com/v1/organizations/cost_report')
        url.searchParams.set('starting_at', startDate)
        url.searchParams.set('ending_at', endDate)

        const res = await fetch(url.toString(), {
          headers: {
            'x-api-key': adminKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'admin-2025-04-15',
          },
          signal: AbortSignal.timeout(30000),
        })

        if (res.ok) {
          const data = await res.json() as AdminCostReportResp
          const records = Array.isArray(data?.data) ? data.data : []
          let total = 0
          let written = 0

          for (const rec of records) {
            const amount = Number(rec.amount_usd ?? rec.amount ?? 0)
            if (!(amount > 0)) continue
            const date = rec.date || startDate

            await recordExpense({
              category: 'ai_cost',
              subcategory: 'anthropic_historical',
              amountUsd: amount,
              description: `Anthropic 歷史成本（${date}，Admin API）`,
              source: 'backfill',
              createdBy: 'admin_anthropic_historical',
              occurredAt: date,
              metadata: { source: 'admin_api', date, raw: rec },
            })

            // 也寫一筆 ai_cost_log 以便舊 view 能看到（無 token，status=incomplete）
            try {
              await recordAIUsage({
                provider: 'anthropic', model: 'claude-opus-4-6',
                promptTokens: 0, completionTokens: 0,
                callStage: 'historical_backfill',
                status: 'incomplete',
                errorMessage: 'backfill-admin-api',
                metadata: { backfill_source: 'admin_api', date, reported_amount_usd: amount },
              })
            } catch { /* noop */ }

            total += amount
            written += 1
          }

          adminApiResult = { ok: true, records_written: written, total_usd: Math.round(total * 100) / 100, raw: data }
        } else {
          const text = await res.text()
          adminApiResult = {
            ok: false,
            records_written: 0,
            total_usd: 0,
            raw: { http_status: res.status, error: text.slice(0, 500) },
          }
        }
      }
    } catch (e) {
      adminApiResult = {
        ok: false,
        records_written: 0,
        total_usd: 0,
        raw: { error: e instanceof Error ? e.message : String(e) },
      }
    }
  }

  // 若 Admin API 無法取且有 manual_amount → 手動寫一筆聚合 expense
  let manualRecord: { written: boolean; amount: number } | null = null
  if (!adminApiResult.ok && manualAmount > 0) {
    await recordExpense({
      category: 'ai_cost',
      subcategory: 'anthropic_historical_manual',
      amountUsd: manualAmount,
      description: `${note}（手動聚合 $${manualAmount}，來源：console.anthropic.com）`,
      source: 'backfill',
      createdBy: 'admin_manual',
      occurredAt: startDate,
      metadata: {
        source: 'manual',
        start_date: startDate,
        end_date: endDate,
        note,
        admin_api_attempt: adminApiResult,
      },
    })
    manualRecord = { written: true, amount: manualAmount }
  }

  await writeAuditLog(req, 'backfill', 'anthropic_historical', null, {
    start_date: startDate,
    end_date: endDate,
    admin_api_ok: adminApiResult.ok,
    admin_api_records: adminApiResult.records_written,
    manual_amount: manualAmount,
  })

  return NextResponse.json({
    success: adminApiResult.ok || manualRecord !== null,
    admin_api: adminApiResult,
    manual: manualRecord,
    message: adminApiResult.ok
      ? `Admin API 成功：寫入 ${adminApiResult.records_written} 筆，合計 $${adminApiResult.total_usd}`
      : manualRecord
        ? `手動回填：$${manualRecord.amount} 已寫入 expense_log（subcategory=anthropic_historical_manual）`
        : 'Admin API 不可用且未提供 manual_amount，未寫入任何記錄',
  })
}
