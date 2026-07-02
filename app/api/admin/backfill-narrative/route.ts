// ============================================================
// v5.10.461(P0-4 修)— 舊報告敘事綜合萃取 backfill
//
// 背景:命格綜合卡(v5.10.454 招牌「答案先行」)只在 durable workflow path
// 有接 aiExtractNarrative;fallback 重生報告 + v454 前舊報告 + 萃取 silent-fail
// 的報告 narrative_summary 全空 → 卡片 0 客戶可見(2026-07-03 production 實測 5/5)。
//
// 行為:撈 completed + 非出門訣 + narrative_summary 為空的報告、逐份跑
// extractNarrativeFromContent(黃金驗證過、忠於原文、失敗回 null)、
// 只「加」narrative_summary 欄位、絕不動 ai_content / full_charts / status。
//
// 安全:
//   - ADMIN_KEY 保護 + rate limit + audit log(對齊 recalculate-report 模式)
//   - dryRun=true 只列清單不寫
//   - reportId 指定單份(測試報告先驗、lesson #058 精神)
//   - limit 上限 10/次(Gemini 60s/份、maxDuration 300s 內安全)
//   - 寫回用 read-merge-write、只 patch narrative_summary key
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { createServiceClient } from '@/lib/supabase'
import { isChumenjiPlan } from '@/lib/plan-names'
import { extractNarrativeFromContent } from '@/lib/report/extract-narrative'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  let body: { reportId?: string; limit?: number; dryRun?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* 空 body = 預設 */
  }
  const dryRun = body.dryRun === true
  // Codex P2:每份萃取最長 60s、maxDuration=300s → 上限 4 份/次(留 audit log/回應餘裕)
  const limit = Math.min(Math.max(body.limit ?? 3, 1), 4)

  const supabase = createServiceClient()

  let query = supabase
    .from('paid_reports')
    .select('id, plan_code, report_result')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  if (body.reportId) {
    query = query.eq('id', body.reportId)
  }

  const { data: rows, error } = await query.limit(body.reportId ? 1 : 60)
  if (error) {
    return NextResponse.json({ error: `查詢失敗: ${error.message}` }, { status: 500 })
  }

  // 過濾:非出門訣、有 ai_content、narrative_summary 為空
  const candidates = (rows || []).filter((r) => {
    if (isChumenjiPlan(r.plan_code)) return false
    const rr = (r.report_result || {}) as Record<string, unknown>
    const content = rr.ai_content
    if (typeof content !== 'string' || content.length < 800) return false
    return rr.narrative_summary == null
  }).slice(0, limit)

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      candidates: candidates.map((r) => ({ id: r.id, plan_code: r.plan_code })),
    })
  }

  const results: Array<{ id: string; plan_code: string; ok: boolean; archetype?: string | null; error?: string }> = []
  for (const r of candidates) {
    const rr = (r.report_result || {}) as Record<string, unknown>
    try {
      const narrative = await extractNarrativeFromContent(rr.ai_content as string)
      if (!narrative) {
        results.push({ id: r.id, plan_code: r.plan_code, ok: false, error: '萃取回 null(內容過短/無命格名片/API 失敗)' })
        continue
      }
      // read-merge-write:只 patch narrative_summary、其餘欄位原樣保留
      const merged = { ...rr, narrative_summary: narrative }
      const { error: upErr } = await supabase
        .from('paid_reports')
        .update({ report_result: merged })
        .eq('id', r.id)
        .eq('status', 'completed') // 防 race:仍是 completed 才寫
      if (upErr) {
        results.push({ id: r.id, plan_code: r.plan_code, ok: false, error: upErr.message })
      } else {
        results.push({ id: r.id, plan_code: r.plan_code, ok: true, archetype: narrative.archetype })
      }
    } catch (e) {
      results.push({ id: r.id, plan_code: r.plan_code, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await writeAuditLog(req, 'backfill', 'report', body.reportId || `batch-${results.length}`, {
    scope: 'narrative_summary',
    results: results.map((x) => ({ id: x.id, ok: x.ok, archetype: x.archetype ?? null, error: x.error ?? null })),
  })

  return NextResponse.json({ ok: true, processed: results.length, results })
}
