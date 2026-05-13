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
import { getServerComponentUserEmail } from '@/lib/auth-helper-server'
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
import { extractBaziFromMarkdown, extractOneLinerFromMarkdown } from '@/lib/parsers/life-blueprint-md-parser'

// v5.10.240 Sprint 2 starter — Supabase service client(server-only、bypass RLS for adapter)
// 對應 Codex L3 + Gemini L4 共識:adapter 用 service_role、user-facing path 用 RLS
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// plan_code → ReportType mapping(對齊 lib/plan-names.ts SSOT)
// v5.10.244 P2 修(Codex L3 audit):union type narrowing、編譯期抓錯 plan_code
export type SupportedPlanCode = 'C' | 'D' | 'R' | 'G15'

const PLAN_CODE_TO_TYPE: Record<SupportedPlanCode, ReportType> = {
  'C': 'life-blueprint',
  'D': 'heart-doubts',
  'R': 'compatibility',
  'G15': 'family-blueprint',
}

// 從 paid_reports 拉 row 的 minimum 型別(v5.10.244 修 Codex P2:row 無型別)
// v5.10.245:加 birth_data + user_id(SQL 實際 schema 確認、user_id 已存在)
// Sprint 2.x markdown parser 完成後再加 report_result 詳細型別
export interface PaidReportRow {
  id: string
  plan_code: string
  customer_email: string | null
  client_name: string | null
  birth_city: string | null
  timezone: string | null
  birth_data: BirthData | null // JSONB、含 R/G15 members
  report_result: ReportResult | null // JSONB、含 ai_content markdown
  created_at: string
  user_id: string | null // v5.10.245 確認 column 已存在(80 row 中 32.5% match)
}

// v5.10.245:birth_data 多型(C/D 單人 vs R 雙人 vs G15 家庭)
export interface PersonBirthInfo {
  name: string
  role?: 'self' | 'other' | string
  year: number
  month: number
  day: number
  hour: number
  minute?: number
  gender?: 'M' | 'F'
  birth_city?: string
  city_lat?: number
  city_lng?: number
  latitude?: number
  longitude?: number
  timezone_offset?: number
  time_mode?: 'exact' | 'shichen' | string
  time_unknown?: boolean
  calendar_type?: 'solar' | 'lunar' | string
}

export type BirthData =
  | { plan: 'C' | 'D'; members?: PersonBirthInfo[] } // 單人
  | { plan: 'R'; members: PersonBirthInfo[]; customer_note?: string; relation_description?: string } // 雙人
  | { plan_type: 'family_reports'; report_ids: string[]; member_names: string[] } // G15 多人(別 schema)
  | Record<string, unknown> // 兼容舊 row format

export interface ReportResult {
  ai_model?: string
  ai_tokens?: number
  ai_content?: string // markdown、Sprint 2.x parse 成 schema sections
  report_id?: string
  systems_count?: number
  analyses_summary?: unknown
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

  // v5.10.240 Sprint 2 starter + v5.10.242 擴 4 type:真接 Supabase paid_reports
  // 對應 Codex L3 SOP「1 個 type 真接 + minimum mapping」+ Gemini L4 「ownership check」
  // 4 type 全擴、共用 ownership + plan_code 驗證模式
  if (type === 'life-blueprint') {
    return await fetchLifeBlueprintFromSupabase(id)
  }
  if (type === 'heart-doubts') {
    return await fetchHeartDoubtsFromSupabase(id)
  }
  if (type === 'compatibility') {
    return await fetchCompatibilityFromSupabase(id)
  }
  if (type === 'family-blueprint') {
    return await fetchFamilyBlueprintFromSupabase(id)
  }

  return null
}

/**
 * v5.10.242 共用 helper:fetch + ownership + plan_code 驗證
 * 對應 Gemini Sprint 2 review 抓 service_role bypass RLS 漏洞、必手動驗 ownership
 *
 * 回傳 row data 給各 type adapter 自己 mapping、null 表示拒絕(not found / RLS / type mismatch)
 */
async function fetchPaidReportRow(
  id: string,
  expectedPlanCode: SupportedPlanCode,
): Promise<PaidReportRow | null> {
  try {
    const userEmail = await getServerComponentUserEmail()
    if (!userEmail) {
      console.warn('[adapter] no logged-in user、reject Supabase fetch')
      return null
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('paid_reports')
      .select('id, plan_code, customer_email, client_name, birth_city, timezone, birth_data, report_result, created_at, user_id')
      .eq('id', id)
      .maybeSingle<PaidReportRow>()

    if (error || !data) {
      console.warn('[adapter] paid_reports lookup failed:', error?.message, id)
      return null
    }

    // P0 ownership check:user email 必 match customer_email(case-insensitive)
    if (!data.customer_email || data.customer_email.toLowerCase() !== userEmail.toLowerCase()) {
      console.warn('[adapter] ownership reject:', { userEmail, customer: data.customer_email, id })
      return null
    }

    if (data.plan_code !== expectedPlanCode) {
      console.warn('[adapter] type mismatch:', { id, expected: expectedPlanCode, got: data.plan_code })
      return null
    }

    return data
  } catch (err) {
    console.error('[adapter] fetchPaidReportRow error:', err)
    return null
  }
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
  // v5.10.241 + v5.10.242:共用 ownership + plan_code 驗證 helper
  const data = await fetchPaidReportRow(id, 'C')
  if (!data) return null

  try {
    // v5.10.246:從 ai_content markdown 抽真資料(Top-1 ROI:bazi + oneLiner)
    // 解析失敗 fallback mock(過渡期、Sprint 2.x LLM Extraction migration 後可廢)
    const aiContent = data.report_result?.ai_content || ''
    const realBazi = extractBaziFromMarkdown(aiContent)
    const realOneLiner = extractOneLinerFromMarkdown(aiContent)

    // Minimum mapping:用 row 拼 LifeBlueprintReport
    // 完整 17 sections parsing 留 Sprint 2.x LLM Extraction(Codex+Gemini 共識)
    const report: LifeBlueprintReport = {
      ...mockHeYuZhunLifeBlueprint, // fallback 全部 mock sections
      meta: {
        ...mockHeYuZhunLifeBlueprint.meta,
        id: data.id,
        name: data.client_name || mockHeYuZhunLifeBlueprint.meta.name,
        birthPlace: data.birth_city || mockHeYuZhunLifeBlueprint.meta.birthPlace,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
      // v5.10.246:card5.bazi 真資料(若 parser 成功)、否則保留 mock
      card5: {
        ...mockHeYuZhunLifeBlueprint.card5,
        bazi: realBazi || mockHeYuZhunLifeBlueprint.card5.bazi,
      },
      // v5.10.246:oneLiner 真資料(若 parser 成功)、否則保留 mock
      oneLiner: realOneLiner || mockHeYuZhunLifeBlueprint.oneLiner,
    }

    if (realBazi) console.info('[adapter] bazi parsed from markdown:', realBazi)
    if (realOneLiner) console.info('[adapter] oneLiner parsed from markdown(len):', realOneLiner.length)

    return { type: 'life-blueprint', data: report }
  } catch (err) {
    console.error('[adapter] life-blueprint mapping error:', err)
    return null
  }
}

/**
 * v5.10.242 Sprint 2 擴:heart-doubts(plan_code='D')真接
 * Minimum mapping、完整 12 sections + 12 evidence parser 留 Sprint 2.x
 */
async function fetchHeartDoubtsFromSupabase(id: string): Promise<ReportData | null> {
  const data = await fetchPaidReportRow(id, 'D')
  if (!data) return null

  try {
    const report: HeartDoubtsReport = {
      ...MOCK_HEART_DOUBTS_HE_XUAN_YI,
      meta: {
        ...MOCK_HEART_DOUBTS_HE_XUAN_YI.meta,
        id: data.id,
        name: data.client_name || MOCK_HEART_DOUBTS_HE_XUAN_YI.meta.name,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
    }

    return { type: 'heart-doubts', data: report }
  } catch (err) {
    console.error('[adapter] heart-doubts mapping error:', err)
    return null
  }
}

/**
 * v5.10.242 Sprint 2 擴:compatibility(plan_code='R')真接
 * v5.10.243 P0 修(Codex P1 + Gemini P0 共識):
 *   - Mock spread pair.b 會洩漏「林沅霖」假身份給付費客戶
 *   - 比 not-found 更糟:客戶看到錯伴侶名字 = 信任崩潰
 *   - Hot-fix:R 方案暫時 return null(404 better than 假身份)
 *   - Sprint 2.x 完整修:加 select partner_name/partner_birth_date/partner_birth_city
 *     + DTO/Zod schema mapping、不再 mock spread
 */
async function fetchCompatibilityFromSupabase(id: string): Promise<ReportData | null> {
  // v5.10.243:不從 Supabase fetch 真資料、直接 return null
  // 對應 Codex L3「客戶會看到錯對象」+ Gemini L4「Mock 數據污染正式報告」P0
  // demo URL(lin-yuan-lin-x-he-xuan-yi)仍由上方 mock fallback 接(行 65)
  console.warn('[adapter] compatibility Supabase fetch deferred to Sprint 2.x:', id)
  return null
}

/**
 * v5.10.242 Sprint 2 擴:family-blueprint(plan_code='G15')真接
 * v5.10.243 P0 修(Codex P1 + Gemini P0 共識):
 *   - Mock spread members 會洩漏「何家三口」假家庭給付費客戶
 *   - charAt(0) 推 familyName 對複姓/英文/原住民全錯(Gemini P1)
 *   - Hot-fix:G15 方案暫時 return null
 *   - Sprint 2.x 完整修:加 select family_members(JSONB)+ family_name 欄位
 *     + DTO/Zod schema mapping
 */
async function fetchFamilyBlueprintFromSupabase(id: string): Promise<ReportData | null> {
  // v5.10.243:不從 Supabase fetch 真資料、直接 return null
  // 對應 Codex L3「客戶會看到錯家庭」+ Gemini L4「Mock 污染 + charAt 不安全」P0
  // demo URL(he-jia / he-ji-nan)仍由上方 mock fallback 接(行 68)
  console.warn('[adapter] family-blueprint Supabase fetch deferred to Sprint 2.x:', id)
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
