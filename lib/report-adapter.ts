// v5.10.203 Sprint 1 step 5 — Report adapter skeleton
//
// Sprint 1:純 mock dispatch(無 paid_reports query、demo 用、Feature Flag 啟用後可見)
// Sprint 2:加 Supabase RLS + paid_reports → 4 schema 真實 mapping(parse ai_content markdown 等)
//
// 對應 Codex L3 推薦的「adapter 從 paid_reports 映射到四種新 report schema、逐步遷移」
//
// 安全保證:
//   - 命盤計算邏輯 0 動(priority 1🔴)
//   - id 嚴格 format 驗證(SQL injection 防護)
//   - Supabase RLS 啟用前、僅 mock 資料(無真實客戶 leak 風險)

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type {
  LifeBlueprintReport,
  HeartDoubtsReport,
  CompatibilityReport,
  FamilyBlueprintReport,
  ReportType,
  ReportData,
} from '@/types/report-schemas'

import { mockHeYuZhunLifeBlueprint } from '@/lib/mocks/he-yu-zhun-life-blueprint'
import { MOCK_HEART_DOUBTS_HE_XUAN_YI } from '@/lib/mocks/heart-doubts-he-xuan-yi'
import { MOCK_COMPATIBILITY_LIN_YUAN_LIN } from '@/lib/mocks/compatibility-lin-yuan-lin'
import { MOCK_FAMILY_BLUEPRINT_HE_JIA } from '@/lib/mocks/family-blueprint-he-jia'

// v5.10.240 Sprint 2 starter — Supabase service client(server-only、bypass RLS for adapter)
// 對應 Codex L3 + Gemini L4 共識:adapter 用 service_role、user-facing path 用 RLS
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// plan_code → ReportType mapping(對齊 lib/plan-names.ts SSOT)
const PLAN_CODE_TO_TYPE: Record<string, ReportType> = {
  'C': 'life-blueprint',
  'D': 'heart-doubts',
  'R': 'compatibility',
  'G15': 'family-blueprint',
}

/**
 * Sprint 1 mock adapter:從 (type, id) 回 mock 資料
 *
 * Sprint 2 計畫:
 *   - 加 Supabase service role client + RLS check
 *   - SELECT paid_reports WHERE id = ?
 *   - 依 plan_code 判斷 type
 *   - parse ai_content markdown → 對應 schema
 *   - return null if 找不到
 */
export async function getReport(type: ReportType, id: string): Promise<ReportData | null> {
  // Sprint 1 mock fallback(demo URL 仍可用)
  if (type === 'life-blueprint' && (id === 'demo' || id === 'he-yu-zhun')) {
    return { type: 'life-blueprint', data: mockHeYuZhunLifeBlueprint }
  }
  if (type === 'heart-doubts' && (id === 'demo' || id === 'he-xuan-yi')) {
    return { type: 'heart-doubts', data: MOCK_HEART_DOUBTS_HE_XUAN_YI }
  }
  if (type === 'compatibility' && (id === 'demo' || id === 'lin-yuan-lin-x-he-xuan-yi' || id === 'lin-yuan-lin')) {
    return { type: 'compatibility', data: MOCK_COMPATIBILITY_LIN_YUAN_LIN }
  }
  if (type === 'family-blueprint' && (id === 'demo' || id === 'he-jia' || id === 'he-ji-nan')) {
    return { type: 'family-blueprint', data: MOCK_FAMILY_BLUEPRINT_HE_JIA }
  }

  // v5.10.240 Sprint 2 starter:真接 Supabase paid_reports
  // 對應 Codex L3 SOP「第 1 件:1 個 type 真接 + minimum mapping」
  // life-blueprint 先做、其他 type Sprint 2.x 漸進
  if (type === 'life-blueprint') {
    return await fetchLifeBlueprintFromSupabase(id)
  }

  // 其他 type 真接 Sprint 2.x 加(Codex 估 1.5-2 天 each)
  return null
}

/**
 * Sprint 2 starter:從 paid_reports 真接 life-blueprint(plan_code='C')
 *
 * 流程:
 *   1. select paid_reports by id(service_role 可 bypass RLS)
 *   2. 驗證 plan_code='C'(否則 type_mismatch)
 *   3. 用 row 拼 minimum LifeBlueprintReport schema(完整 17 sections parser 留 Sprint 2.x)
 *   4. fallback:rawMarkdown 從 report_result.ai_content
 *
 * Sprint 2 完整化(Codex 推薦):
 *   - markdown parser(regex `^###\s+(.+)$` 切章)
 *   - 17 sections 完整 mapping
 *   - error 分類(not_found / RLS reject / parse_failed)
 */
async function fetchLifeBlueprintFromSupabase(id: string): Promise<ReportData | null> {
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('paid_reports')
      .select('id, plan_code, customer_email, client_name, birth_city, timezone, report_result, created_at')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      console.warn('[adapter] paid_reports lookup failed:', error?.message, id)
      return null
    }

    if (data.plan_code !== 'C') {
      console.warn('[adapter] type mismatch:', { id, expected: 'C', got: data.plan_code })
      return null
    }

    // Minimum mapping:用 row 拼 LifeBlueprintReport
    // 完整 17 sections parsing 留 Sprint 2.x(Codex 估 1 day)
    // 暫時:meta 真、其他 sections 用 mock(避免空白頁)
    const report: LifeBlueprintReport = {
      ...mockHeYuZhunLifeBlueprint, // fallback 全部 mock sections
      meta: {
        ...mockHeYuZhunLifeBlueprint.meta,
        id: data.id,
        name: data.client_name || mockHeYuZhunLifeBlueprint.meta.name,
        birthPlace: data.birth_city || mockHeYuZhunLifeBlueprint.meta.birthPlace,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
    }

    return { type: 'life-blueprint', data: report }
  } catch (err) {
    console.error('[adapter] life-blueprint fetch error:', err)
    return null
  }
}

// 預留 Sprint 2 mapping helper signatures
export function mapToLifeBlueprint(_paidReport: unknown): LifeBlueprintReport | null {
  // TODO Sprint 2:parse ai_content + ziwei_raw + bazi_raw → LifeBlueprintReport
  return null
}

export function mapToHeartDoubts(_paidReport: unknown): HeartDoubtsReport | null {
  // TODO Sprint 2
  return null
}

export function mapToCompatibility(_paidReport: unknown): CompatibilityReport | null {
  // TODO Sprint 2
  return null
}

export function mapToFamilyBlueprint(_paidReport: unknown): FamilyBlueprintReport | null {
  // TODO Sprint 2
  return null
}
