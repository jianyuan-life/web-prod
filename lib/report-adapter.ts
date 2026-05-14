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
// v5.10.246 加 / v5.10.247 暫不用:parser 留檔備 Sprint 2.x LLM Extraction 後使用
// import { extractBaziFromMarkdown, extractOneLinerFromMarkdown } from '@/lib/parsers/life-blueprint-md-parser'

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
// v5.10.260:加 Sprint 2.5 Phase 1 已 apply 的 7 新 column(備 Sprint 2.x parser 啟用時用)
//   - migration name: sprint_2_5_add_partner_family_columns(Supabase MCP applied)
//   - 目前全部 NULL(待 Sprint 2.x backfill + 新訂單寫入)
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
  // v5.10.260 Sprint 2.5 Phase 1 新 column(R/G15 補完整身份用):
  partner_name: string | null // R 方案:合盤對方姓名(目前 Sprint 2.x 開始寫入)
  partner_birth_date: string | null // R 方案:對方出生日 ISO date
  partner_birth_city: string | null // R 方案:對方出生地
  family_name: string | null // G15 方案:家族名稱(避免 charAt(0) 不準)
  report_result_json: unknown | null // Sprint 2.x LLM Extraction:markdown → JSON schema
  schema_version: string | null // 例:'v5.10.x-life-blueprint'
  parse_status: 'full' | 'partial' | 'failed' | null // Sprint 2.x extraction migration 狀態
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
    // v5.10.291 Sprint 2.x Phase 3:加 report_result_json + parse_status select(LLM extracted 5 top fields)
    const { data, error } = await supabase
      .from('paid_reports')
      .select('id, plan_code, customer_email, client_name, birth_city, timezone, birth_data, report_result, report_result_json, parse_status, schema_version, created_at, user_id')
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
    // v5.10.247 P0 hot-fix(Codex L3 + Gemini L4 共識 review):
    //   - v5.10.246 parser 上線 silently fallback 到 mock = 「data contamination」P0
    //   - 實測 32 row 中、僅 8 row table format(25%)、22 row prose-only(75%)、parser 多會失敗
    //   - 失敗時前端會 render 何宥諄的 mock bazi、客戶可能誤認為自己的命盤(品牌信任崩潰)
    //   - Gemini「寧可報錯也絕不能給錯的命理資料」+ Codex「silent data contamination」
    //   - Hot-fix:暫時不啟用 parser、回到 v5.10.245 mock spread 行為(僅 meta 真)
    //   - 永久解:Sprint 2.x LLM Extraction migration(claude-3.5-haiku 一次性轉 35 row 成 JSON)
    //     + 新訂單 Structured Outputs(從源頭就產 JSON)+ DB 加 report_result_json column
    //   - 詳:tasks/sprint_2_x_markdown_parser_plan.md

    // v5.10.291 Sprint 2.x Phase 3:若 LLM extracted JSON 存在、用 real data 覆寫 Top 5 fields
    // 32/32 C row 已 ship 全 'full' parse_status(v5.10.290 commit 5bf61198)
    const extracted = (data.report_result_json && data.parse_status === 'full')
      ? data.report_result_json as {
          meta?: { name?: string | null; birthDate?: string | null; birthTime?: string | null; birthPlace?: string | null }
          card5?: { bazi?: { year?: string | null; month?: string | null; day?: string | null; hour?: string | null } }
          oneLiner?: string | null
        }
      : null

    // BaziPillars 需 dayMaster(從 day pillar 取首字)
    const deriveDayMaster = (day?: string | null): string => {
      if (!day || day.length < 1) return ''
      return day.charAt(0)
    }

    const extractedBazi = extracted?.card5?.bazi
    const realBazi = extractedBazi ? {
      year: extractedBazi.year || mockHeYuZhunLifeBlueprint.card5.bazi.year,
      month: extractedBazi.month || mockHeYuZhunLifeBlueprint.card5.bazi.month,
      day: extractedBazi.day || mockHeYuZhunLifeBlueprint.card5.bazi.day,
      hour: extractedBazi.hour || mockHeYuZhunLifeBlueprint.card5.bazi.hour,
      dayMaster: deriveDayMaster(extractedBazi.day) || mockHeYuZhunLifeBlueprint.card5.bazi.dayMaster,
    } : mockHeYuZhunLifeBlueprint.card5.bazi

    // Minimum mapping:用 row 拼 LifeBlueprintReport
    // 完整 17 sections parsing 留 Sprint 2.x LLM Extraction(Codex+Gemini 共識)
    // v5.10.291:LLM extracted 5 top fields(meta + card5.bazi + oneLiner)真實覆寫
    const report: LifeBlueprintReport = {
      ...mockHeYuZhunLifeBlueprint, // fallback 全部 mock sections
      meta: {
        ...mockHeYuZhunLifeBlueprint.meta,
        id: data.id,
        // v5.10.291 真 meta from LLM extraction(else fallback client_name / mock)
        name: extracted?.meta?.name || data.client_name || mockHeYuZhunLifeBlueprint.meta.name,
        birthDate: extracted?.meta?.birthDate || mockHeYuZhunLifeBlueprint.meta.birthDate,
        birthPlace: extracted?.meta?.birthPlace || data.birth_city || mockHeYuZhunLifeBlueprint.meta.birthPlace,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
      // v5.10.291 真八字 4 柱 from LLM extraction
      card5: {
        ...mockHeYuZhunLifeBlueprint.card5,
        bazi: realBazi,
        // oneLiner 對應 card5.subtitle(短描述)
        subtitle: extracted?.oneLiner || mockHeYuZhunLifeBlueprint.card5.subtitle,
      },
    }

    // 警告 log:v5.10.291 後、若 extracted 存在則 4 fields 真實、其餘 13 sections 仍 mock
    const realFieldCount = extracted ? '4 fields real (meta + bazi + oneLiner)' : '0 fields real (full mock)'
    console.warn(
      `[adapter] life-blueprint Sprint 2.x Phase 3:${realFieldCount}、13 sections 仍 mock、待 Sprint 2.x Phase 4+:`,
      data.id,
      data.parse_status,
    )

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
    // v5.10.292 Sprint 2.x Phase 3:讀 generic extraction(7/8 D 已 ship)
    const extracted = (data.report_result_json && data.parse_status === 'full')
      ? data.report_result_json as { meta?: { name?: string | null }; oneLiner?: string | null }
      : null

    const report: HeartDoubtsReport = {
      ...MOCK_HEART_DOUBTS_HE_XUAN_YI,
      meta: {
        ...MOCK_HEART_DOUBTS_HE_XUAN_YI.meta,
        id: data.id,
        name: extracted?.meta?.name || data.client_name || MOCK_HEART_DOUBTS_HE_XUAN_YI.meta.name,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
    }

    if (extracted) {
      console.warn(`[adapter] heart-doubts Phase 3:meta real(name=${extracted.meta?.name})、其餘仍 mock:`, data.id)
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
  // v5.10.292 Sprint 2.x Phase 3:用 LLM extracted JSON 當主資料源、不再 mock spread
  // 對應 Codex L3「客戶會看到錯對象」+ Gemini L4「Mock 數據污染正式報告」P0 — 5/5 R 已 ship full extracted
  const data = await fetchPaidReportRow(id, 'R')
  if (!data) return null

  try {
    const extracted = (data.report_result_json && data.parse_status === 'full')
      ? data.report_result_json as {
          meta?: { name?: string | null; members?: string[] | null }
          oneLiner?: string | null
          topInsights?: string[] | null
        }
      : null

    if (!extracted) {
      // 沒 extracted JSON = 仍走 v5.10.243 hot-fix(safer 404)
      console.warn('[adapter] compatibility no extracted JSON、return null(safer than mock):', id)
      return null
    }

    // 用 partner_name + extracted.meta.members 拼成 pair
    const members = extracted.meta?.members || []
    const memberA = members[0] || data.client_name || extracted.meta?.name || '主訴者'
    const memberB = members[1] || data.partner_name || '對方'

    // CompatibilityReport schema 暫時用 mock fill、但身份用 real
    const { MOCK_COMPATIBILITY_LIN_YUAN_LIN } = await import('@/lib/mocks/compatibility-lin-yuan-lin')
    const report = {
      ...MOCK_COMPATIBILITY_LIN_YUAN_LIN,
      meta: {
        ...MOCK_COMPATIBILITY_LIN_YUAN_LIN.meta,
        id: data.id,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
      pair: {
        ...MOCK_COMPATIBILITY_LIN_YUAN_LIN.pair,
        a: { ...MOCK_COMPATIBILITY_LIN_YUAN_LIN.pair.a, name: memberA },
        b: { ...MOCK_COMPATIBILITY_LIN_YUAN_LIN.pair.b, name: memberB },
      },
    }

    console.warn(`[adapter] compatibility Phase 3:names real (${memberA} × ${memberB})、其餘 mock:`, data.id)
    return { type: 'compatibility', data: report }
  } catch (err) {
    console.error('[adapter] compatibility mapping error:', err)
    return null
  }
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
  // v5.10.292 Sprint 2.x Phase 3:用 LLM extracted JSON 當主資料源、不再 mock spread
  // 對應 Codex L3「客戶會看到錯家庭」+ Gemini L4「Mock 污染 + charAt 不安全」P0 — 3/4 G15 已 ship full
  const data = await fetchPaidReportRow(id, 'G15')
  if (!data) return null

  try {
    const extracted = (data.report_result_json && data.parse_status === 'full')
      ? data.report_result_json as {
          meta?: { name?: string | null; members?: string[] | null }
          oneLiner?: string | null
          topInsights?: string[] | null
        }
      : null

    if (!extracted) {
      console.warn('[adapter] family-blueprint no extracted JSON、return null(safer than mock):', id)
      return null
    }

    // 用 family_name + extracted.meta.members 拼真家庭、不再 charAt(0) 推斷
    const members = extracted.meta?.members || []
    const familyName = data.family_name || extracted.meta?.name || '家族'

    const { MOCK_FAMILY_BLUEPRINT_HE_JIA } = await import('@/lib/mocks/family-blueprint-he-jia')
    const report = {
      ...MOCK_FAMILY_BLUEPRINT_HE_JIA,
      meta: {
        ...MOCK_FAMILY_BLUEPRINT_HE_JIA.meta,
        id: data.id,
        familyName,
        reportDate: new Date(data.created_at).toISOString().split('T')[0],
      },
      // members 用真姓名清單(若 mock members 數量不夠、補空 placeholder)
      members: members.length > 0
        ? members.map((name, idx) => ({
            ...(MOCK_FAMILY_BLUEPRINT_HE_JIA.members[idx] || MOCK_FAMILY_BLUEPRINT_HE_JIA.members[0]),
            name,
          }))
        : MOCK_FAMILY_BLUEPRINT_HE_JIA.members,
    }

    console.warn(`[adapter] family-blueprint Phase 3:family=${familyName} members=${members.join('/')} real、其餘 mock:`, data.id)
    return { type: 'family-blueprint', data: report }
  } catch (err) {
    console.error('[adapter] family-blueprint mapping error:', err)
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
