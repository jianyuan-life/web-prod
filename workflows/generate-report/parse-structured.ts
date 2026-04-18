// ============================================================
// 付費報告 v2 結構化解析器（起承轉合四幕架構）
// 設計依據：Claude-鑑源命理研究部門/REPORT_WEB_PDF_REFACTOR.md
//          + 老闆 PDF_報告範本.md 的起承轉合需求
//
// 【用途】
// 新版 v3 prompt 會在 AI 輸出的最後一行附加 sentinel：
//   <<<JIANYUAN_STRUCT_V2>>>
//   {JSON payload}
//   <<<END_JIANYUAN_STRUCT_V2>>>
// 這個檔把 sentinel 之間的 JSON 抓出來、驗證結構、回傳強型別物件。
// 失敗時自動 fallback 到空物件（呼叫端會 fallback 到 v1 markdown 渲染）。
//
// 【向後相容】
// 舊版 v1 報告沒有 sentinel → parse 會回傳 null → 呼叫端走 v1 路徑。
// v2/v3 prompt 未上線前這個檔不會被呼叫到，不影響既有流程。
// ============================================================

// ── Sentinel 標記（v3 prompt 輸出末尾會附這段） ──
const SENTINEL_START = '<<<JIANYUAN_STRUCT_V2>>>'
const SENTINEL_END = '<<<END_JIANYUAN_STRUCT_V2>>>'

// ============================================================
// 型別定義（起承轉合四幕）
// ============================================================

/** 起：人生藍圖（我是誰）— 不含時間建議 */
export interface WhoAmIAct {
  headline: string            // 一句話命格封號（e.g. 「熔岩鍛造者」）
  definition: string          // 一句話定義你
  talents: string[]           // 天賦 Top 3-5
  challenges: string[]        // 課題 Top 3-5
  career_direction?: string   // 事業方向（主題式，不含時間）
  money_style?: string        // 財運風格
  love_pattern?: string       // 感情模式
  health_map?: string         // 健康地圖
  relationship_style?: string // 人際關係
  sections: Array<{           // 細分章節（可擴展）
    title: string
    body: string
  }>
}

/** 承：過去 10 年回顧 */
export interface Past10YearsAct {
  summary: string             // 開場總結（「過去 10 年你走過這些路」）
  timeline: Array<{
    years: string             // e.g. "2016-2025"
    age_range: string         // e.g. "25-34 歲"
    theme: string             // 主題句
    key_events?: string[]     // 關鍵事件類型
    blessings?: string[]      // 得到什麼
    lessons?: string[]        // 學到什麼
  }>
  reflection: string          // 結尾反思
}

/** 轉：未來 10 年 + 當前大運 */
export interface Future10YearsAct {
  current_dayun: {
    ganzhi?: string           // 當前大運干支
    age_range: string         // e.g. "35-44 歲"
    theme: string             // 當前大運主題
    overview: string          // 總覽
  }
  forecast: Array<{
    years: string
    age_range: string
    theme: string
    opportunities?: string[]
    warnings?: string[]
  }>
  turning_points?: string[]   // 轉折點提示
}

/** 合：2026 你該怎麼改變（導流出門訣） */
export interface Action2026Act {
  year_theme: string          // 2026 一句話主題
  top3_focus: Array<{
    focus: string             // 聚焦領域
    why: string               // 為什麼
    action: string            // 怎麼做
  }>
  monthly_highlights?: Array<{
    month: number             // 1-12
    caution?: string
    boost?: string
  }>
  deliberate_practice: string // 刻意練習（3 條具體行動）
  letter_to_you: string       // 寫給你的話（溫暖收尾）
  chumenji_upsell_hook: string // 導流出門訣的鉤子文案
}

/** 完整結構化報告（C 方案） */
export interface StructuredReportC {
  schema_version: 'v2'
  plan_code: 'C'
  who_am_i: WhoAmIAct
  past_10_years: Past10YearsAct
  future_10_years: Future10YearsAct
  action_2026: Action2026Act
  raw_markdown?: string       // 原始 markdown（給 v1 fallback + PDF 用）
}

/** D 方案（心之所惑）— 主題聚焦 */
export interface StructuredReportD {
  schema_version: 'v2'
  plan_code: 'D'
  question: string            // 客戶問題
  chart_evidence: string[]    // 命盤依據（每點必須溯源）
  answer_direct: string       // 直接回答
  answer_detailed: string     // 詳細解析
  action_plan: string[]       // 行動清單
  warnings: string[]          // 注意事項
  letter_to_you: string
  raw_markdown?: string
}

/** R 方案（合否）— 四選一結論 */
export interface StructuredReportR {
  schema_version: 'v2'
  plan_code: 'R'
  verdict: 'great_match' | 'match_with_work' | 'challenging' | 'not_recommended' // 🟢🟡🟠🔴
  verdict_text: string        // 一句話結論
  strengths: string[]
  friction_points: string[]
  advice_for_each: Array<{ name: string; advice: string }>
  long_term_forecast: string
  letter_to_you: string
  raw_markdown?: string
}

/** G15 方案（家族藍圖） */
export interface StructuredReportG15 {
  schema_version: 'v2'
  plan_code: 'G15'
  family_overview: string
  member_grid: Array<{
    name: string
    role: string              // 家庭角色定位
    strengths: string[]
    needs: string[]            // 需要被看見的地方
  }>
  dynamics: Array<{            // 成員間互動
    pair: [string, string]
    pattern: string
    advice: string
  }>
  family_year_theme: string    // 家庭 2026 主題
  raw_markdown?: string
}

/** E1 方案（事件出門訣） */
export interface StructuredReportE1 {
  schema_version: 'v2'
  plan_code: 'E1'
  event_description: string
  event_type: string
  top3_timings: Array<{
    rank: number
    date: string
    time_range: string
    direction: string
    angle?: string
    reason: string
    confidence: string
    boost_explanation?: string
  }>
  preparation_guide: string
  backup_advice: string
  raw_markdown?: string
}

/** E2 方案（月度出門訣） */
export interface StructuredReportE2 {
  schema_version: 'v2'
  plan_code: 'E2'
  month_theme: string
  weekly_timings: Array<{
    week_number: number
    week_label: string
    week_range: string
    date: string
    time_range: string
    direction: string
    reason: string
  }>
  monthly_fortune: string
  letter_to_you: string
  raw_markdown?: string
}

/** 統一型別（任一方案） */
export type StructuredReport =
  | StructuredReportC
  | StructuredReportD
  | StructuredReportR
  | StructuredReportG15
  | StructuredReportE1
  | StructuredReportE2

// ============================================================
// 解析主函式
// ============================================================

/**
 * 從 AI 輸出中抓 sentinel 之間的 JSON 並解析。
 * @returns StructuredReport | null（失敗/無 sentinel 時回 null，呼叫端走 v1 markdown fallback）
 */
export function parseStructuredReport(aiOutput: string): StructuredReport | null {
  if (!aiOutput || typeof aiOutput !== 'string') return null

  const startIdx = aiOutput.indexOf(SENTINEL_START)
  const endIdx = aiOutput.indexOf(SENTINEL_END)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // 沒有 sentinel = 舊版 v1 報告，呼叫端負責 fallback
    return null
  }

  const jsonStr = aiOutput.slice(startIdx + SENTINEL_START.length, endIdx).trim()
  if (!jsonStr) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    console.warn('[parseStructuredReport] JSON 解析失敗:', e instanceof Error ? e.message : e)
    return null
  }

  // 驗證結構
  const validated = validateStructuredReport(parsed)
  if (!validated) {
    console.warn('[parseStructuredReport] 結構驗證失敗，fallback 到 v1 markdown')
    return null
  }

  // 附上原始 markdown（移除 sentinel 區塊）
  const markdownOnly = aiOutput.slice(0, startIdx).trim()
  validated.raw_markdown = markdownOnly

  return validated
}

/**
 * 把結構化 JSON 的結尾 sentinel 區塊從 markdown 中剝離（給 v1 渲染器用）。
 * 即使 parse 失敗，這個函式也要能清理 markdown，避免前端顯示 raw JSON。
 */
export function stripSentinelBlock(aiOutput: string): string {
  if (!aiOutput) return ''
  const startIdx = aiOutput.indexOf(SENTINEL_START)
  if (startIdx === -1) return aiOutput
  const endIdx = aiOutput.indexOf(SENTINEL_END)
  if (endIdx === -1) {
    // 只有開頭標記沒有結尾，整段砍掉
    return aiOutput.slice(0, startIdx).trim()
  }
  const before = aiOutput.slice(0, startIdx)
  const after = aiOutput.slice(endIdx + SENTINEL_END.length)
  return (before + after).trim()
}

// ============================================================
// 型別守衛（取代 zod，零依賴）
// ============================================================

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v)
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString)
}

function validateStructuredReport(data: unknown): StructuredReport | null {
  if (!isObject(data)) return null
  if (data.schema_version !== 'v2') return null
  if (!isString(data.plan_code)) return null

  switch (data.plan_code) {
    case 'C': return validateC(data)
    case 'D': return validateD(data)
    case 'R': return validateR(data)
    case 'G15': return validateG15(data)
    case 'E1': return validateE1(data)
    case 'E2': return validateE2(data)
    default: return null
  }
}

function validateC(d: Record<string, unknown>): StructuredReportC | null {
  if (!isObject(d.who_am_i)) return null
  if (!isObject(d.past_10_years)) return null
  if (!isObject(d.future_10_years)) return null
  if (!isObject(d.action_2026)) return null

  const who = d.who_am_i
  if (!isString(who.headline) || !isString(who.definition)) return null
  if (!isStringArray(who.talents) || !isStringArray(who.challenges)) return null

  return d as unknown as StructuredReportC
}

function validateD(d: Record<string, unknown>): StructuredReportD | null {
  if (!isString(d.question)) return null
  if (!isStringArray(d.chart_evidence)) return null
  if (!isString(d.answer_direct)) return null
  return d as unknown as StructuredReportD
}

function validateR(d: Record<string, unknown>): StructuredReportR | null {
  const allowed = ['great_match', 'match_with_work', 'challenging', 'not_recommended']
  if (!isString(d.verdict) || !allowed.includes(d.verdict)) return null
  if (!isString(d.verdict_text)) return null
  if (!isStringArray(d.strengths)) return null
  if (!isStringArray(d.friction_points)) return null
  return d as unknown as StructuredReportR
}

function validateG15(d: Record<string, unknown>): StructuredReportG15 | null {
  if (!isString(d.family_overview)) return null
  if (!Array.isArray(d.member_grid)) return null
  return d as unknown as StructuredReportG15
}

function validateE1(d: Record<string, unknown>): StructuredReportE1 | null {
  if (!isString(d.event_description)) return null
  if (!Array.isArray(d.top3_timings)) return null
  return d as unknown as StructuredReportE1
}

function validateE2(d: Record<string, unknown>): StructuredReportE2 | null {
  if (!isString(d.month_theme)) return null
  if (!Array.isArray(d.weekly_timings)) return null
  return d as unknown as StructuredReportE2
}

// ============================================================
// 給呼叫端用的輔助函式
// ============================================================

/**
 * 判斷一份 AI 輸出是否為 v2 結構化報告（無需完整解析）。
 * 前端 page.tsx / PDF routes 可用這個快速分支。
 */
export function isV2StructuredReport(aiOutput: string | undefined | null): boolean {
  if (!aiOutput || typeof aiOutput !== 'string') return false
  return aiOutput.includes(SENTINEL_START) && aiOutput.includes(SENTINEL_END)
}

/**
 * 安全存取：即使 structured 裡面某一幕缺失，也回傳空殼避免前端 crash。
 */
export function getSafeActC(structured: StructuredReportC): {
  who_am_i: WhoAmIAct
  past_10_years: Past10YearsAct
  future_10_years: Future10YearsAct
  action_2026: Action2026Act
} {
  return {
    who_am_i: structured.who_am_i || {
      headline: '', definition: '', talents: [], challenges: [], sections: [],
    },
    past_10_years: structured.past_10_years || {
      summary: '', timeline: [], reflection: '',
    },
    future_10_years: structured.future_10_years || {
      current_dayun: { age_range: '', theme: '', overview: '' },
      forecast: [],
    },
    action_2026: structured.action_2026 || {
      year_theme: '', top3_focus: [], deliberate_practice: '',
      letter_to_you: '', chumenji_upsell_hook: '',
    },
  }
}
