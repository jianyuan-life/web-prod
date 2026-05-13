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
  // Sprint 1:demo 路徑、only 接受 mock id
  if (type === 'life-blueprint' && (id === 'demo' || id === 'he-yu-zhun')) {
    return { type: 'life-blueprint', data: mockHeYuZhunLifeBlueprint }
  }
  if (type === 'heart-doubts' && (id === 'demo' || id === 'he-xuan-yi')) {
    return { type: 'heart-doubts', data: MOCK_HEART_DOUBTS_HE_XUAN_YI }
  }
  // Sprint 2 mock(林沅霖 compatibility / 何紀萳 family-blueprint)待加

  // 真 paid_reports 查 → Sprint 2 加
  // const supabase = createClient(...)
  // const { data } = await supabase.from('paid_reports').select('*').eq('id', id).maybeSingle()
  // if (!data) return null
  // return mapPaidReportToSchema(type, data)

  return null
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
