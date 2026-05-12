// ============================================================
// 報告生成 Workflow — Step Functions（完整 Node.js 存取）
// 每個 step 自動重試、結果持久化
// ============================================================

import { getWritable } from 'workflow'
import { FatalError, RetryableError } from 'workflow'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getUnsubscribeHtml, getUnsubscribeUrl } from '@/lib/unsubscribe'
import { recordAIUsage } from '@/lib/ai-cost-tracker'
import { recordEmailSend } from '@/lib/email-send-log'
import { notifyEmailFailed } from '@/lib/ai/observability/telegram'
import { PLAN_NAMES, isChumenjiPlan, ALL_PLAN_CODES } from '@/lib/plan-names'
// v5.10.88 Stage 1 USE_PLAN_V3 feature flag(SOP `tasks/prompt_v3_switch_sop_2026-05-08.md`):
//   c_plan v2 vs v3 export 同 11 個 symbol 同 signature(已 grep 驗證)、namespace import 後 flag 切
//   預設 false → production 仍走 v2、零風險;Vercel env `USE_PLAN_V3=true` → trigger redeploy 即生效 v3
//   d_plan / r_plan / g15_plan 後續 commit 接(本 commit 只動 c、stage 1 最小驗證)
import * as _cV2 from '@/prompts/c_plan_v2'
import * as _cV3 from '@/prompts/c_plan_v3'
const _C_PROMPTS = process.env.USE_PLAN_V3 === 'true' ? _cV3 : _cV2
const {
  getAgeGroup,
  FORBIDDEN_WORDS_BY_STAGE,
  buildCall1Prompt, buildCall2Prompt, buildCall3Prompt,
  buildUserPrompt, buildAppendix,
  extractCall1Summary, extractCall1And2Summary,
  SYSTEM_GROUPS,
} = _C_PROMPTS
// v5.10.23 (2026-05-06) Round 2:G15 v6.0 prompt 預備接線(Feature Flag、Round 3 啟用)
// 目前 quality gate 已用 G15_V2_QUALITY_GATE env 嚴格度切換、Round 3 將接線 buildG15Call*Prompt
// 暫不切換 systemPrompt(避免 1-Call vs 3-Call 架構衝突、Round 3 一併處理)
import { getG15PromptVersion as _getG15PromptVersion } from '@/prompts/g15_plan_v2'
void _getG15PromptVersion  // 防 tsc unused import warning、Round 3 啟用時移除 void

// ── 常數 ──
const PYTHON_API = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

// ── 多 API Key 輪詢（防 429 限流 + 提高併發吞吐量）──
// 支援 1~N 個 key：CLAUDE_API_KEY, CLAUDE_API_KEY_2, CLAUDE_API_KEY_3, ...
// 每個 key 來自不同帳號 = 獨立 rate limit = 線性擴展
function getClaudeApiKeys(): string[] {
  const keys: string[] = []
  // 主 key
  if (process.env.CLAUDE_API_KEY) keys.push(process.env.CLAUDE_API_KEY)
  // 額外 key：CLAUDE_API_KEY_2 ~ CLAUDE_API_KEY_20
  for (let i = 2; i <= 20; i++) {
    const key = process.env[`CLAUDE_API_KEY_${i}`]
    if (key) keys.push(key)
  }
  return keys
}

// 全域計數器：輪詢分配，確保每個 key 均勻使用
let claudeKeyIndex = 0
function getNextClaudeKey(): string {
  const keys = getClaudeApiKeys()
  if (keys.length === 0) return ''
  const key = keys[claudeKeyIndex % keys.length]
  claudeKeyIndex++
  return key
}

// ── 型別 ──
export interface BirthData {
  name: string
  year: number
  month: number
  day: number
  hour: number
  minute?: number
  gender: string
  locale?: string
  cityLat?: number
  cityLng?: number
  address?: string
  customer_note?: string
  topic?: string
  question?: string
  // Sprint 4 國際化
  timezone?: string        // IANA 時區
  timezone_offset?: number
  birth_city?: string
  birth_country?: string   // ISO 3166-1 alpha-2
  [key: string]: unknown
}

export interface ProgressUpdate {
  step: string
  progress: number  // 0-100
  message: string
}

interface AnalysisItem {
  system: string
  score: number
  summary?: string
  good_points?: string[]
  bad_points?: string[]
  warnings?: string[]
  improvements?: string[]
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  details?: string | Record<string, unknown>
  info_boxes?: Array<{ title?: string; items?: string[] }>
  // v5.6 P0 (round 2):calculator raw_data 直通、供 ETHICS_RULES raw_data 條件指令使用
  // 包括:asc_confidence / time_precision_warning(06/07/09 birth-time 警告)
  //       time_mode / time_unknown(子情境 A/B 分流)
  //       未來可擴展:school_info / karmic_debt / homophone_taboo 等 v5.4.0 既有條件
  raw_data?: Record<string, unknown>
}

interface CalcResult {
  client_data: {
    bazi?: string
    yongshen?: string
    five_elements?: Record<string, number>
    lunar_date?: string
    nayin?: string
    ming_gong?: string
    [key: string]: unknown
  }
  analyses: AnalysisItem[]
}

// ── Supabase 客戶端 ──
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )
}

// ── 進度串流輔助 ──
// 同時寫入 writable stream + Supabase generation_progress，讓前端能讀到真實進度
let _currentReportId: string | null = null

export function setCurrentReportId(id: string) {
  _currentReportId = id
}

async function emitProgress(update: ProgressUpdate) {
  "use step";
  const writable = getWritable<ProgressUpdate>()
  const writer = writable.getWriter()
  try {
    await writer.write(update)
  } finally {
    writer.releaseLock()
  }

  // 同步寫入 Supabase，讓前端 polling 能取得真實進度
  if (_currentReportId) {
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('paid_reports')
        .select('generation_progress')
        .eq('id', _currentReportId)
        .single()
      const existing = (data?.generation_progress as Record<string, unknown>) || {}
      await supabase
        .from('paid_reports')
        .update({
          generation_progress: {
            ...existing,
            step: update.step,
            progress: update.progress,
            message: update.message,
            progress_updated_at: new Date().toISOString(),
          },
        })
        .eq('id', _currentReportId)
    } catch (e) {
      // 進度更新失敗不阻塞報告生成
      console.warn(`[emitProgress] Supabase 進度寫入失敗:`, e)
    }
  }
}

// ── AI 回應清理（單次 call 級別）──
// 截斷防護：如果 AI 輸出被 max_tokens 切斷，裁到最後一個完整句子
function trimToLastCompleteSentence(text: string): string {
  const trimmed = text.trimEnd()
  if (!trimmed) return trimmed
  const lastChar = trimmed[trimmed.length - 1]
  // 已經是完整句子
  if (/[。！？」\n]/.test(lastChar)) return trimmed
  // 找最後一個句末標點的位置
  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('。'),
    trimmed.lastIndexOf('！'),
    trimmed.lastIndexOf('？'),
    trimmed.lastIndexOf('」'),
  )
  if (lastSentenceEnd > trimmed.length * 0.8) {
    // 只有在最後 20% 的範圍內找到句末標點才裁剪（避免裁掉太多內容）
    console.log(`[trimToLastCompleteSentence] 裁剪截斷：從 ${trimmed.length} 字裁到 ${lastSentenceEnd + 1} 字`)
    return trimmed.slice(0, lastSentenceEnd + 1)
  }
  // 找不到合適的句末標點，加個省略句號
  console.log(`[trimToLastCompleteSentence] 無法找到合適的裁剪點，加句號收尾`)
  return trimmed + '。'
}

function cleanAIResponse(text: string): string {
  console.log(`[cleanAIResponse] 開始清理，原始長度: ${text.length} 字`)
  let cleaned = text

  // 1. AI 前言
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n---\s*\n?/i, '')
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n(?=#{1,4}\s)/i, '')
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n\n/i, '')
  cleaned = cleaned.replace(/^(好的|收到|我將|我會|讓我|以下是|沒問題|當然)[^\n]*\n+/i, '')

  // 2. prompt 結構標籤（任何位置出現都刪整行）
  //    只刪精確的 meta 標記：「完整分析請繼續閱讀」「本報告分 X 批生成」等
  //    不再刪「第一幕/第二幕/第三幕/壓軸/收尾」——這些可能是有意義的章節標題
  cleaned = cleaned.replace(/^.*(?:完整分析請繼續閱讀|本報告分.{0,5}批生成).*$/gm, '')

  // 3. AI 批次標記
  cleaned = cleaned.replace(/（第[一二三四]批）/g, '')

  // 4. 改名建議整行刪除（v5.3.43 修 Bug2 復發）
  // 舊 regex `^.*建議改名.*$(\n(?!#).*$)*` 會貪婪吃到下個 # 前的所有行——
  // 如果改名建議段落後面接的是列表/段落/空行而非 `#` 開頭章節，就會把下個系統的
  // 正文整段吞掉，導致 Tier 3 系統（奇門/風水/易經/七政/節律）在最終報告出現
  // 次數 <5 次。改為只刪單行，原意是去掉「建議改名」這句結論句，其餘正文保留。
  cleaned = cleaned.replace(/^.*(?:建議改名|改名建議|建議名字改為).*$/gm, '')

  // 5. 禁止字眼整行刪除
  cleaned = cleaned.replace(/^.*(?:跳過|本次數據不足|待分析|本次不適用|需面部照片|需掌紋照片|需即時起卦|需即時抽牌|手相掌紋).*$/gm, '')

  // 6. __TABLE__ 原始標記清理（AI 不應該回吐排盤原始數據的表格標記）
  // 把 __TABLE__ 行轉成可讀的格式：__TABLE__ key1 val1 key2 val2 → 「key1：val1｜key2：val2」
  cleaned = cleaned.replace(/^__TABLE__\s+(.+)$/gm, (_match, content) => {
    const parts = content.trim().split(/\s{2,}/)
    if (parts.length >= 4) {
      // 偶數個 token → key-value 對
      const pairs: string[] = []
      for (let i = 0; i < parts.length - 1; i += 2) {
        pairs.push(`**${parts[i]}**：${parts[i + 1]}`)
      }
      return pairs.join('　｜　')
    }
    // 奇數個 token → 用分隔符連接
    return parts.join('　｜　')
  })

  // 7. Markdown 垃圾
  cleaned = cleaned.replace(/^---+$/gm, '')
  cleaned = cleaned.replace(/^\|[-:]+\|[-:| ]*$/gm, '')
  cleaned = cleaned.replace(/-{6,}/g, ' — ')
  cleaned = cleaned.replace(/\.{6,}/g, '…')
  cleaned = cleaned.replace(/·{6,}/g, '…')

  // 7. 重點突出：> 結論：開頭的行加粗
  cleaned = cleaned.replace(/^(>\s*結論[：:]\s*)(.+)$/gm, '$1**$2**')
  // 🎯 開頭的行加粗
  cleaned = cleaned.replace(/^(🎯\s*)(.+)$/gm, '$1**$2**')
  // 「關鍵發現」開頭段落裡的結論句加粗
  cleaned = cleaned.replace(/^(關鍵發現[：:]\s*)(.+)$/gm, '$1**$2**')

  // 8. 品牌名
  cleaned = cleaned.replace(/鑑源/g, '鑒源')

  // 9. P0-2 修復（2026-04-17）：R 方案「026」年份 bug
  // AI 把「丙午（2026-2028）」輸出成「丙午026-2028」（可能是 AI 把 2 當成上一段的尾數）
  // 全局修正四種格式，套用到 DB 存的 ai_content（之前只在 renderInlineMarkdown 修）
  cleaned = cleaned.replace(/丙午\s*026\s*-\s*2028/g, '丙午（2026-2028）')
  cleaned = cleaned.replace(/(甲子|乙丑|丙寅|丁卯|戊辰|己巳|庚午|辛未|壬申|癸酉|甲戌|乙亥|丙子|丁丑|戊寅|己卯|庚辰|辛巳|壬午|癸未|甲申|乙酉|丙戌|丁亥|戊子|己丑|庚寅|辛卯|壬辰|癸巳|甲午|乙未|丙申|丁酉|戊戌|己亥|庚子|辛丑|壬寅|癸卯|甲辰|乙巳|丙午|丁未|戊申|己酉|庚戌|辛亥|壬子|癸丑|甲寅|乙卯|丙辰|丁巳|戊午|己未|庚申|辛酉|壬戌|癸亥)(\d{3})(?=[-－]\s*\d{4})/g, '$1（2$2')
  // 同時補上結尾的全形括號（如果已經被補前綴）
  cleaned = cleaned.replace(/（2(\d{3})-(\d{4})(?![）)])/g, '（2$1-$2）')

  // 10. P0-3 修復（2026-04-17）：清理 AI 在章節開頭寫的 H1（# ...）
  // 前端 parseStructuredContent 用 ^## 切章節，H1 會混進章節首行被顯示為原始文字
  // AI prompt 禁用 H1 但偶爾偷用，此處做最終安全網
  cleaned = cleaned.replace(/^#\s+(.+?)$/gm, '$1')
  // 清理章節標題內殘留的 # 前綴（parseStructuredContent split 後 title 可能帶 #）
  cleaned = cleaned.replace(/^(##+)\s*#+\s*(.+?)$/gm, '$1 $2')

  // 11. P0-4 修復（2026-04-17）：分數超過 100 clamp 到 0-100
  // AI 偶爾輸出「220 分」「200/100」「評分：110」等超範圍數字
  cleaned = cleaned.replace(/(\d{1,4})\s*\/\s*100/g, (_m, s) => {
    const n = Math.max(0, Math.min(100, parseInt(s, 10) || 0))
    return `${n}/100`
  })
  cleaned = cleaned.replace(/((?:綜合|整體|總|系統|本系統)?評分[：:]\s*)(\d{1,4})/g, (_m, prefix, s) => {
    const n = Math.max(0, Math.min(100, parseInt(s, 10) || 0))
    return `${prefix}${n}`
  })
  // 「200 分」「110 分」等獨立分數
  cleaned = cleaned.replace(/(\s|^)(\d{3,4})\s*分(?=[，。,.、；;！？\s])/g, (_m, pre, s) => {
    const n = Math.max(0, Math.min(100, parseInt(s, 10) || 0))
    return `${pre}${n} 分`
  })

  // 12. 連續空行
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

  console.log(`[cleanAIResponse] 清理完成，清理後長度: ${cleaned.trim().length} 字`)
  return cleaned.trim()
}

// ============================================================
// Post-generation QA：比對 AI 報告內容與排盤原始數據
// 發現幻覺（AI 寫錯排盤數據）時自動修正或記錄警告
// ============================================================

interface QACorrection {
  field: string       // 被檢查的欄位名稱
  expected: string    // 排盤數據的正確值
  found: string       // AI 報告中的錯誤值
  corrected: boolean  // 是否已自動修正
}

/**
 * 從 calcResult 的 analyses 陣列中，按系統名稱關鍵字找到對應的分析項目，
 * 再從 summary / details / good_points 中提取指定 pattern 的值。
 */
function extractFromAnalyses(
  analyses: AnalysisItem[],
  systemKeyword: string,
  extractPattern: RegExp,
): string | null {
  const analysis = analyses.find(a =>
    a.system?.includes(systemKeyword)
  )
  if (!analysis) return null

  // 優先從 summary 提取
  if (analysis.summary) {
    const match = analysis.summary.match(extractPattern)
    if (match?.[1]) return match[1].trim()
  }

  // 其次從 details 提取
  if (analysis.details) {
    const detailStr = typeof analysis.details === 'string'
      ? analysis.details
      : JSON.stringify(analysis.details)
    const match = detailStr.match(extractPattern)
    if (match?.[1]) return match[1].trim()
  }

  // 再從 good_points / bad_points / info_boxes 提取
  const textParts = [
    ...(analysis.good_points || []),
    ...(analysis.bad_points || []),
    ...(analysis.warnings || []),
    ...(analysis.info_boxes?.flatMap(b => b.items || []) || []),
  ]
  for (const text of textParts) {
    const match = text.match(extractPattern)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

/**
 * 在報告中搜尋「標記詞 + 星座/天干地支/數字」的組合，
 * 如果找到的值與正確值不一致，則自動修正。
 */
function checkAndReplace(
  content: string,
  label: string,
  correctValue: string,
  searchPatterns: RegExp[],
  corrections: QACorrection[],
): string {
  if (!correctValue) return content

  let result = content
  for (const pattern of searchPatterns) {
    const matches = result.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))
    for (const match of matches) {
      const foundValue = match[1]?.trim()
      if (!foundValue) continue

      // 比較時移除空白和標點
      const normalize = (s: string) => s.replace(/[\s,，。：:]/g, '')
      if (normalize(foundValue) !== normalize(correctValue)) {
        // 確認這是真正的錯誤（不只是截斷或部分匹配）
        if (normalize(correctValue).includes(normalize(foundValue)) || normalize(foundValue).includes(normalize(correctValue))) {
          // 部分匹配（例如「甲木」vs「甲木日主」），不算錯誤，只記錄
          console.log(`[QA] ${label}: 部分匹配 — 排盤「${correctValue}」↔ 報告「${foundValue}」，跳過`)
          continue
        }

        corrections.push({
          field: label,
          expected: correctValue,
          found: foundValue,
          corrected: true,
        })
        console.warn(`[QA] 🔧 修正 ${label}: 「${foundValue}」→「${correctValue}」`)
        // 精確替換：只替換被匹配到的那段文字中的錯誤值
        result = result.replace(match[0], match[0].replace(foundValue, correctValue))
      }
    }
  }
  return result
}

/**
 * Post-generation QA 主函式：
 * 比對 AI 報告內容與排盤原始數據，自動修正明顯的幻覺錯誤。
 *
 * 修正策略「保守」：只修確定錯的，不確定的只記錄不改。
 */
export function validateReportAgainstData(
  reportContent: string,
  calcResult: CalcResult | null | undefined,
  birthData: BirthData | null | undefined,
): string {
  if (!reportContent) return reportContent
  if (!calcResult && !birthData) return reportContent

  const corrections: QACorrection[] = []
  let content = reportContent

  const cd = calcResult?.client_data || {}
  const analyses = calcResult?.analyses || []

  // ────────────────────────────────────────────
  // 1. 八字四柱檢查
  // ────────────────────────────────────────────
  if (cd.bazi) {
    // bazi 格式通常是「甲子 乙丑 丙寅 丁卯」（四柱用空格分隔）
    const pillars = cd.bazi.split(/\s+/)
    const pillarNames = ['年柱', '月柱', '日柱', '時柱']

    for (let i = 0; i < Math.min(pillars.length, 4); i++) {
      if (!pillars[i] || pillars[i].length < 2) continue
      const pillarName = pillarNames[i]
      const correctPillar = pillars[i]

      // 在報告中搜尋「年柱：XX」「年柱為XX」等格式
      content = checkAndReplace(
        content,
        pillarName,
        correctPillar,
        [
          new RegExp(`${pillarName}[：:為是]\\s*([^\\s，,。\\n]{2,4})`, 'g'),
        ],
        corrections,
      )
    }

    // 完整八字檢查：如果報告寫了完整四柱，但跟排盤不一致
    const fullBaziPatterns = [
      /八字[：:為是]\s*([^\n，,。]{6,20})/g,
      /四柱[：:為是]\s*([^\n，,。]{6,20})/g,
    ]
    content = checkAndReplace(content, '完整八字', cd.bazi, fullBaziPatterns, corrections)
  }

  // ────────────────────────────────────────────
  // 2. 流年干支檢查（2026 丙午）
  // ────────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  // 天干地支紀年表（60年循環）
  const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
  const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
  const tgIndex = (currentYear - 4) % 10
  const dzIndex = (currentYear - 4) % 12
  const correctLiunian = `${TIANGAN[tgIndex]}${DIZHI[dzIndex]}`

  // 搜尋「2026年」或「今年」後面跟著的天干地支
  const liunianPatterns = [
    new RegExp(`${currentYear}[年]?[：:，,]?\\s*([^\\s年，,。\\n]{2})年`, 'g'),
    new RegExp(`流年[：:為是]?\\s*([^\\s，,。\\n]{2})`, 'g'),
    new RegExp(`今年[是為]?\\s*([^\\s，,。\\n]{2})年`, 'g'),
  ]
  content = checkAndReplace(content, `${currentYear}流年`, correctLiunian, liunianPatterns, corrections)

  // ────────────────────────────────────────────
  // 3. 西洋占星：太陽/月亮/上升星座
  // ────────────────────────────────────────────
  const zodiacSigns = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座',
    // 別名
    '白羊座',
  ]
  const zodiacPattern = `(${zodiacSigns.join('|')})`

  // 從 analyses 中提取西洋占星數據
  const sunSign = extractFromAnalyses(analyses, '西洋占星', new RegExp(`太陽[星座：:在]*\\s*${zodiacPattern}`))
    || extractFromAnalyses(analyses, '占星', new RegExp(`太陽[星座：:在]*\\s*${zodiacPattern}`))
  const moonSign = extractFromAnalyses(analyses, '西洋占星', new RegExp(`月亮[星座：:在]*\\s*${zodiacPattern}`))
    || extractFromAnalyses(analyses, '占星', new RegExp(`月亮[星座：:在]*\\s*${zodiacPattern}`))
  const risingSign = extractFromAnalyses(analyses, '西洋占星', new RegExp(`上升[星座：:在]*\\s*${zodiacPattern}`))
    || extractFromAnalyses(analyses, '占星', new RegExp(`上升[星座：:在]*\\s*${zodiacPattern}`))

  // 也從 client_data 嘗試提取（如果 Python API 有直接放）
  const sunSignFinal = sunSign || (cd as Record<string, unknown>).sun_sign as string || null
  const moonSignFinal = moonSign || (cd as Record<string, unknown>).moon_sign as string || null
  const risingSignFinal = risingSign || (cd as Record<string, unknown>).rising_sign as string || null

  if (sunSignFinal) {
    content = checkAndReplace(content, '太陽星座', sunSignFinal, [
      new RegExp(`太陽[星座：:在]*\\s*${zodiacPattern}`, 'g'),
    ], corrections)
  }
  if (moonSignFinal) {
    content = checkAndReplace(content, '月亮星座', moonSignFinal, [
      new RegExp(`月亮[星座：:在]*\\s*${zodiacPattern}`, 'g'),
    ], corrections)
  }
  if (risingSignFinal) {
    content = checkAndReplace(content, '上升星座', risingSignFinal, [
      new RegExp(`上升[星座：:在]*\\s*${zodiacPattern}`, 'g'),
    ], corrections)
  }

  // ────────────────────────────────────────────
  // 4. 生命靈數
  // ────────────────────────────────────────────
  const lifeNumber = extractFromAnalyses(analyses, '數字', /(?:生命靈數|靈數|主命數)[：:為是]\s*(\d+)/)
    || extractFromAnalyses(analyses, '靈數', /(?:生命靈數|靈數|主命數)[：:為是]\s*(\d+)/)
    || (cd as Record<string, unknown>).life_number as string || null

  if (lifeNumber) {
    content = checkAndReplace(content, '生命靈數', String(lifeNumber), [
      /生命靈數[：:為是]\s*(\d+)/g,
      /靈數[：:為是]\s*(\d+)/g,
      /主命數[：:為是]\s*(\d+)/g,
    ], corrections)
  }

  // ────────────────────────────────────────────
  // 5. 紫微命宮主星
  // ────────────────────────────────────────────
  const mingGong = cd.ming_gong
    || extractFromAnalyses(analyses, '紫微', /命宮[：:主星]*\s*([^\n，,。]{2,10})/)
    || null

  if (mingGong) {
    content = checkAndReplace(content, '紫微命宮主星', mingGong, [
      /命宮主星[：:為是]\s*([^\n，,。]{2,10})/g,
      /命宮[：:]\s*([^\n，,。]{2,10})/g,
    ], corrections)
  }

  // ────────────────────────────────────────────
  // 6. 用神
  // ────────────────────────────────────────────
  if (cd.yongshen) {
    content = checkAndReplace(content, '用神', cd.yongshen, [
      /用神[：:為是]\s*([^\n，,。]{1,6})/g,
    ], corrections)
  }

  // ────────────────────────────────────────────
  // 7. 納音
  // ────────────────────────────────────────────
  if (cd.nayin) {
    content = checkAndReplace(content, '納音', cd.nayin, [
      /納音[：:為是]\s*([^\n，,。]{2,8})/g,
    ], corrections)
  }

  // ────────────────────────────────────────────
  // 8. 出生年份 → 生肖檢查
  // ────────────────────────────────────────────
  // R 方案（合盤）和 G15（家族）有多人，每個人生肖不同
  // 不能用單一生肖替換所有提及，否則會把第二個人的正確生肖改錯
  const planCode = birthData?.plan || ''
  if (birthData?.year && planCode !== 'R' && planCode !== 'G15') {
    const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
    const correctShengxiao = SHENGXIAO[(birthData.year - 4) % 12]
    content = checkAndReplace(content, '生肖', correctShengxiao, [
      /生肖[：:為是屬]\s*([^\n，,。]{1,2})/g,
      /屬\s*([鼠牛虎兔龍蛇馬羊猴雞狗豬])/g,
    ], corrections)
  } else if (birthData?.year && (planCode === 'R' || planCode === 'G15')) {
    // 多人方案：只記錄不替換，避免破壞正確的多人生肖分析
    const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
    const mainShengxiao = SHENGXIAO[(birthData.year - 4) % 12]
    corrections.push({
      field: '生肖（多人方案僅記錄）',
      expected: mainShengxiao,
      found: '多人各有不同生肖，跳過全局替換',
      corrected: false,
    })

    // R 方案：針對當前這位成員，檢查 AI 是否在該姓名附近說錯生肖
    // 例：「李進壹屬鼠」應被改為「李進壹屬狗」（若其真實生肖不同）
    if (planCode === 'R' && birthData?.name) {
      const name = String(birthData.name).slice(0, 8)
      // 搜尋「{姓名}...屬X」「{姓名}屬X」模式，區間內 40 字
      const nameZodiacPattern = new RegExp(`(${name}[^\\n]{0,40}?屬\\s*)([鼠牛虎兔龍蛇馬羊猴雞狗豬])`, 'g')
      const beforeLen = content.length
      content = content.replace(nameZodiacPattern, (match, pre, wrong) => {
        if (wrong !== mainShengxiao) {
          corrections.push({
            field: `生肖（${name}）`,
            expected: mainShengxiao,
            found: wrong,
            corrected: true,
          })
          return `${pre}${mainShengxiao}`
        }
        return match
      })
      if (content.length !== beforeLen) {
        // 可能整體長度有變，但我們主要是替換同等長度字元
      }

      // v5.10.182:lesson #110 — R 方案 per-member 太陽星座替換(對應 v5.10.181 SELF-CHECK 失敗)
      // raw_data 中 western_astrology.sun_deg → 算正確 sun_sign label、抓「{name}太陽 X 座 Y°」regex 強制覆寫
      const sunDeg = (calcResult?.analyses || []).find(a => a.system === '西洋占星')
      const sunDegMatch = sunDeg ? JSON.stringify(sunDeg).match(/sun_deg["\s:]+(-?\d+\.?\d*)/i) : null
      const sunDegValue = sunDegMatch ? parseFloat(sunDegMatch[1]) : null
      if (sunDegValue !== null && !isNaN(sunDegValue)) {
        const SUN_SIGNS = ['白羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚']
        const correctIdx = Math.floor(((sunDegValue % 360) + 360) % 360 / 30)
        const correctSign = SUN_SIGNS[correctIdx]
        const correctDeg = (sunDegValue % 30).toFixed(2)
        // 抓「{name}太陽 (Y座) X.XX°」regex 強制覆寫
        // v5.10.188:lesson #112(Codex L3 抓):原字元類別 `[白羊金牛...]` 只匹配單字、
        //   抓不到實際 AI 輸出「金牛座」兩字 → 改 name alternation `(白羊|金牛|...)`
        const SIGN_ALT = SUN_SIGNS.join('|')
        const nameSunPattern = new RegExp(`(${name}[^太陽]{0,5}?太陽[星座是]*\\s*)(${SIGN_ALT})(座?\\s*\\d*\\.?\\d*°?)`, 'g')
        content = content.replace(nameSunPattern, (match, pre, wrongSign, suffix) => {
          if (wrongSign !== correctSign) {
            corrections.push({
              field: `太陽星座（${name}）`,
              expected: `${correctSign}座 ${correctDeg}°`,
              found: `${wrongSign}${suffix}`,
              corrected: true,
            })
            // v5.10.189:Codex re-review P2 修(度數保留)— 用 correctDeg 強制覆寫
            //   原 return `${pre}${correctSign}座`(吃掉 suffix 度數、產生「太陽天秤座」無 deg)
            //   現 return 含 correctDeg、deg 從 raw_data sun_deg % 30 重算正確值
            return `${pre}${correctSign}座 ${correctDeg}°`
          }
          return match
        })
      }
    }
  }

  // ────────────────────────────────────────────
  // 9. R 方案專屬：合盤禁忌語檢查（不存在的地支關係）
  // ────────────────────────────────────────────
  if (planCode === 'R') {
    const forbiddenRelations: [RegExp, string][] = [
      [/子戌相刑|戌子相刑/g, '(禁用詞：子戌無刑，地支三刑為寅巳申、丑戌未、子卯、自刑)'],
      [/丙庚相沖|庚丙相沖/g, '(禁用詞：天干無丙庚沖，只有甲庚/乙辛/壬丙/癸丁四沖)'],
      [/狗鼠相害|鼠狗相害/g, '(禁用詞：狗鼠無害，地支六害為子未、丑午、寅巳、卯辰、申亥、酉戌)'],
      [/狗兔相沖/g, '(禁用詞：狗兔為卯戌六合，非相沖)'],
      [/馬雞相沖|午酉相沖/g, '(禁用詞：馬雞中性，無合無沖)'],
    ]
    let violations = 0
    for (const [pat, note] of forbiddenRelations) {
      const m = content.match(pat)
      if (m) {
        violations += m.length
        corrections.push({
          field: 'R方案禁忌關係',
          expected: note,
          found: m[0],
          corrected: false,
        })
      }
    }
    if (violations > 0) {
      console.warn(`[QA] R 方案發現 ${violations} 處禁忌關係語（未自動修正，需改 prompt 重生）`)
    }
  }

  // ────────────────────────────────────────────
  // QA 結果彙總
  // ────────────────────────────────────────────
  if (corrections.length > 0) {
    console.warn(`[QA] ⚠️ Post-generation QA 發現 ${corrections.length} 項數據不一致：`)
    for (const c of corrections) {
      console.warn(`  - ${c.field}: 期望「${c.expected}」，AI 寫「${c.found}」${c.corrected ? '（已自動修正）' : '（未修正，僅記錄）'}`)
    }
  } else {
    console.log('[QA] ✅ Post-generation QA 通過：AI 報告與排盤數據一致')
  }

  return content
}

// ── 合併後最終清理（處理跨 call 的問題）──
export function cleanFinalReport(text: string, clientName?: string): string {
  let cleaned = text
  console.log('[cleanFinalReport] 開始最終清理...')

  // 0. v5.3.43 修 Bug1 復發：h2 主章節 0 個
  // Claude 在 v5.3.41 c_plan_v2.ts v6.0 下仍習慣用 `### 一、...` 做主章節，
  // 造成報告頁目錄/進度條/章節折疊全壞。此處硬升級：凡 `### <中文數字>、` 或
  // `### <阿拉伯數字>、` 開頭的行，一律升格為 `## ...`。細分章節（`### 6.1 ...`
  // `### N.M ...`）不匹配此模式，保留不動。
  {
    // v5.7.22 真因修(e3fff2b2 鐵證「37 章節 < 300 字」):
    //   原 regex 含 `\d+、` 把 ### 子節阿拉伯編號(### 1、命格封號 / ### 2、xxx)誤升成 ##
    //   → 大量短章節 → quality gate「敷衍章節 < 300 字」reject → needs_human_review
    //   修:只升格中文編號(一、二、...十七)、不升阿拉伯(子節常用 1、2、3)
    //   AI prompt c_plan_v2.ts 主章節都用「## 一、xxx」中文、子節用 ### 1、阿拉伯
    const h2PromoteRegex = /^### ([一二三四五六七八九十百]+[、\.])(.*)$/gm
    let promoteCount = 0
    cleaned = cleaned.replace(h2PromoteRegex, (_m, num, rest) => {
      promoteCount++
      return `## ${num}${rest}`
    })
    if (promoteCount > 0) console.log(`[cleanFinalReport] h2 升格(僅中文編號):${promoteCount} 個 ### 主章節 → ##`)
  }

  // 0c. v5.7.25 反向降格(子節攤平還原、Opus 4.6 真因修)
  //   證據:7a10ce3c 重跑(2026-05-03 v5.7.24 prompt)後 ai_content 含 52 個 ##、0 個 ###
  //         Opus 寫「## 情感模式」「## 思維模式」等(本應 `### 情感模式` 在「## 二、你是什麼樣的人」下)
  //         結果 quality gate「20 個章節 < 300 字」rejected、跟前一輪同樣 fail mode
  //   修:把「## XXX」其中 XXX 不以「中文編號(一-百)+、/.」或「阿拉伯編號+、/.」開頭、
  //       且不含「附錄/藍圖/全運/報告」(這些是合理 ## 主章節或 H1 標題)、降為 ### 子節
  //   注意:此 block 必在 0(中文編號升 ##)之後跑、不會影響升好的主章節
  {
    // v5.7.28 修 v5.7.25 P0(logic review 抓):
    //   原 (?!附錄) 對 「## 附錄一、節氣表」/「## 附錄 A」 仍 match → 誤降
    //   原 (?!.*^報告) 邏輯顛倒(^ 在中括號外無錨定行首作用)、需用更嚴 lookahead
    // 修法:
    //   (?!附錄) → (?!附錄[\s一二三四五六七八九十百\d、\.]) 涵蓋「附錄+空白/編號/標點」開頭
    //   (?!.*(?:藍圖|全運|^報告)) → (?!.*(?:藍圖|全運|報告)) 不錨定行首、避開行內任何「報告」字眼章節
    //   (?!附件)、(?!參考)、(?!尾聲)、(?!作者)、(?!版權) 額外保留合理 ## 主章節
    const h2DemoteRegex = /^## (?![一二三四五六七八九十百]+[、\.])(?!\d+[、\.])(?!附錄[\s一二三四五六七八九十百\d、\.])(?!附件)(?!參考)(?!尾聲)(?!作者)(?!版權)(?!.*(?:藍圖|全運|報告)).+$/gm
    const matches = cleaned.match(h2DemoteRegex) || []
    cleaned = cleaned.replace(h2DemoteRegex, (m) => '### ' + m.slice(3))
    if (matches.length > 0) console.log(`[cleanFinalReport] v5.7.25/v5.7.28 h2 降格(子節攤平還原):${matches.length} 個 ## → ###`)
  }

  // 0b. v5.3.44 清 prompt 模板字數提示殘留（AI 把「（800-1200 字）」等範本指令原樣複製到正文）
  // 支援：（800-1200字）/ （~3,500字）/ （3000 字）/ （800-1200 字）/ （2,500 字）
  {
    const wordHintRegex = /[（(]\s*[~～]?\s*\d{2,5}(?:,\d{3})?\s*(?:[-－~～]\s*\d{2,5}(?:,\d{3})?)?\s*字\s*[）)]/g
    const hintCount = (cleaned.match(wordHintRegex) || []).length
    if (hintCount > 0) {
      cleaned = cleaned.replace(wordHintRegex, '')
      console.log(`[cleanFinalReport] 清 prompt 字數提示殘留：${hintCount} 處`)
    }
  }

  // v5.7.45 內部術語清理(Gemini visual eval 標 P1「對客戶意義不明、像 debug log」)
  // 證據:HYC + HJN 都標出「(系統交叉驗證)」「多系統共識」「最高純血量」「J 牌」是內部術語洩漏
  {
    const internalTermsBefore = cleaned.length
    cleaned = cleaned
      .replace(/[（(]\s*系統交叉驗證\s*[）)]/g, '')                 // (系統交叉驗證) → 砍
      .replace(/多系統共識/g, '綜合分析')                         // 多系統共識 → 綜合分析
      .replace(/[二三四五六七八九十]?\s*系統共識/g, '綜合分析')      // N 系統共識 → 綜合分析
      .replace(/最高純血量\s*[（(]?\s*\d+\s*[）)]?/g, '')          // 最高純血量(95) → 砍
      .replace(/純血量\s*[（(]?\s*\d+\s*[）)]?/g, '')              // 純血量 95 → 砍
      .replace(/\bJ\s*牌\b/g, '')                                  // J 牌(內部術語)→ 砍
      .replace(/\(\s*ajna\s*\)/gi, '(Ajna 中心)')                 // 修術語錯誤
      .replace(/[，,]\s*[，,]+/g, ',')                             // 連續逗號清
      .replace(/[（(]\s*[）)]/g, '')                               // 空括號清
    if (cleaned.length !== internalTermsBefore) {
      console.log(`[cleanFinalReport] v5.7.45 清內部術語: -${internalTermsBefore - cleaned.length} 字`)
    }
  }

  // 1. 刪除重複報告標題（保留第一個）
  // 策略 A：如果有客戶名字，匹配含客戶名的 h1/h2 標題
  if (clientName) {
    const escapedName = clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const namePattern = new RegExp(`^#{1,2}\\s*.*${escapedName}.*報告.*$`, 'gm')
    let count = 0
    cleaned = cleaned.replace(namePattern, (match) => {
      count++
      return count === 1 ? match : ''
    })
    if (count > 1) console.log(`[cleanFinalReport] 刪除 ${count - 1} 個含客戶名的重複標題`)
  }
  // 策略 B：刪除所有重複的 # 報告標題（匹配 # ...報告 格式）
  {
    const h1Pattern = /^# .+報告.*$/gm
    let h1Count = 0
    cleaned = cleaned.replace(h1Pattern, (match) => {
      h1Count++
      return h1Count === 1 ? match : ''
    })
    if (h1Count > 1) console.log(`[cleanFinalReport] 刪除 ${h1Count - 1} 個重複 H1 報告標題`)
  }
  // 策略 C：刪除重複的客戶資料區塊（**客戶：** ... **報告撰寫日：**）
  {
    const infoPattern = /^\*\*客戶[：:]?\*\*.*$(\n^\*\*.+\*\*.*$)*/gm
    let infoCount = 0
    cleaned = cleaned.replace(infoPattern, (match) => {
      infoCount++
      return infoCount === 1 ? match : ''
    })
    if (infoCount > 1) console.log(`[cleanFinalReport] 刪除 ${infoCount - 1} 個重複客戶資料區塊`)
  }

  // 2. v5.7.20 拍板(Jamie 糾正「幹嘛砍字、字多沒問題」)
  //    移除「合併重複章節」+「刪除空章節 < 50 字」激進邏輯
  //    根因:何宣逸 C 方案 report_id=870bae9a-... 第二次跑 AI 寫 54,633 tokens(~55K 字)
  //          但 cleanFinalReport 後 ai_content 只 16,487 字(砍 70%)、quality gate reject
  //          真兇:normalizeSectionTitle 砍掉編號 + titlesAreSimilar 80% 模糊比對
  //               → Call 1「一、命格」normalize 後 = "命格"、Call 3「一、整合矩陣」normalize 後 = "整合矩陣"
  //               → 但若標題短(如「結語」「總結」)、80% 相似誤合併、整章被砍
  //    新邏輯:只合併「完全相同字串」的標題、保留 AI 寫的全部 + 不刪「空章節」
  //
  // 2a. 嚴格合併重複章節(僅完全相同字串、保留後者品質通常更完整)
  const sections = cleaned.split(/(?=^## )/m)
  const sectionMap = new Map<string, number>()  // exact title → last index
  const duplicateIndices = new Set<number>()
  sections.forEach((sec, idx) => {
    const titleMatch = sec.match(/^## (.+?)[\n\r]/)
    if (!titleMatch) return
    const exactTitle = titleMatch[1].trim()
    if (!exactTitle) return
    if (sectionMap.has(exactTitle)) {
      const prevIdx = sectionMap.get(exactTitle)!
      duplicateIndices.add(prevIdx)
      sectionMap.set(exactTitle, idx)
      console.log(`[cleanFinalReport] v5.7.20 嚴格合併重複章節(完全相同字串): "${exactTitle}"`)
    } else {
      sectionMap.set(exactTitle, idx)
    }
  })
  if (duplicateIndices.size > 0) {
    cleaned = sections.filter((_, idx) => !duplicateIndices.has(idx)).join('')
  }

  // 2b. v5.7.20:不再「刪除空章節」(老闆「字多沒問題」)、保留 AI 寫的全部、即使章節短也保留

  // 4. 連續空行收攏
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

  // v5.3.11：清 Markdown 殘留（Qwen/Gemini QA 反覆抓到的 `**` `##` 裸露）
  //   策略：把內嵌的 **加粗** 裸符號保留（有意義），但純粹裸露 `**` `##` 在行尾/行首沒接內容的去掉
  //   1. 行首 `##` 後沒跟空格/內容 → 刪除整行
  cleaned = cleaned.replace(/^#{1,6}\s*$/gm, '')
  //   2. 單獨出現的 `**` 或 `##` 符號（非配對使用）
  cleaned = cleaned.replace(/^\s*\*\*\s*$/gm, '')
  //   3. 行中意外出現的 ``` 程式碼 fence（命理報告不該有）
  cleaned = cleaned.replace(/^```[\w]*\s*$/gm, '')

  // v5.3.11：繁體中文強制轉換（Qwen 反覆抓到「你/的/是」等簡體殘留）
  //   簡體 → 繁體 的高頻字對應表（只處理常見 10+ 個，OpenCC 過度工程）
  //   只轉「純粹簡體字」到繁體，不動已經是繁體的字
  const simplifiedToTraditional: Record<string, string> = {
    '个': '個', '为': '為', '发': '發', '会': '會', '时': '時',
    '这': '這', '来': '來', '过': '過', '还': '還', '从': '從',
    '们': '們', '门': '門', '问': '問', '间': '間', '关': '關',
    '书': '書', '车': '車', '长': '長', '东': '東', '马': '馬',
    '龙': '龍', '只': '隻', '种': '種', '话': '話', '体': '體',
    '学': '學', '风': '風', '气': '氣', '节': '節', '号': '號',
    '国': '國', '应': '應',
    '对': '對', '实': '實', '现': '現', '业': '業', '动': '動',
    '经': '經', '样': '樣', '说': '說', '开': '開', '达': '達',
    '进': '進', '离': '離', '写': '寫', '当': '當', '该': '該',
    '后': '後', '机': '機', '转': '轉', '场': '場', '爱': '愛',
    '见': '見', '帮': '幫', '读': '讀', '举': '舉', '识': '識',
    '让': '讓', '听': '聽', '题': '題', '围': '圍',
    '请': '請', '权': '權', '证': '證', '词': '詞', '译': '譯',
    '页': '頁', '议': '議', '评': '評', '财': '財', '脑': '腦',
    '险': '險', '获': '獲', '华': '華', '辩': '辯', '远': '遠',
    '状': '狀', '亏': '虧', '丧': '喪', '严': '嚴', '乐': '樂',
    '习': '習', '虑': '慮', '构': '構', '营': '營', '续': '續',
    '虽': '雖', '灵': '靈', '愿': '願',
  }
  //   注意：「你/的/是/人/在/有/不/和/得/好/心/生/老/子/大/小/中/上/下/左/右」
  //   這些字簡繁相同，不需要轉換
  let conversions = 0
  cleaned = cleaned.replace(/[\u4e00-\u9fa5]/g, (ch) => {
    if (simplifiedToTraditional[ch]) {
      conversions += 1
      return simplifiedToTraditional[ch]
    }
    return ch
  })
  if (conversions > 0) {
    console.log(`[cleanFinalReport] 繁體化：轉換 ${conversions} 個簡體字`)
  }

  // v5.7.29 通用簡轉繁誤字修正(取代 v5.7.27 的 13 詞 dict、解 dict 永遠不全的根因)
  // 證據:eval v3 通用 regex 抓到老 dict 漏 29 處錯字(隻做/隻需/隻記/隻見/隻堆/隻說/隻動/隻收/隻靠 等)
  // 邏輯:
  //   - 「只」中文兩讀:zhǐ(副詞、僅僅)→ 繁體「只」 / zhī(量詞、一隻)→ 繁體「隻」
  //   - opencc 把簡體「只」全轉「隻」、誤把副詞變量詞
  //   - 通用解:若「隻」前不是量詞前綴(數字/兩/幾/數/每/其)、則「隻」為副詞誤、改回「只」
  // 白名單:量詞前綴 [一二三四五六七八九十百千萬兩數幾每其\d十百] + 「字片語」結尾
  const ZHI_TYPO_RE = /(?<![一二三四五六七八九十百千萬兩數幾每其\d十百])隻(?=[一-龥])/g
  // 排除合法量詞 context(隻字片語、本隻、整隻、半隻、單隻)
  const ZHI_LEGIT_CONTEXTS = ['隻字片語', '單隻', '整隻', '半隻', '本隻']
  let typoFixCount = 0
  // mark legit 「隻」 with placeholder 避免被誤替換
  const PLACEHOLDER = ''  // private use area
  for (const legit of ZHI_LEGIT_CONTEXTS) {
    const masked = legit.replace('隻', PLACEHOLDER)
    cleaned = cleaned.split(legit).join(masked)
  }
  // apply universal fix
  cleaned = cleaned.replace(ZHI_TYPO_RE, () => { typoFixCount++; return '只' })
  // restore placeholders
  cleaned = cleaned.split(PLACEHOLDER).join('隻')
  if (typoFixCount > 0) {
    console.log(`[cleanFinalReport] v5.7.29 通用 typo fix:${typoFixCount} 處「隻→只」(副詞誤判量詞)`)
  }

  // v5.7.33 廢話 meta label 全面過濾(老闆「最高品質、客戶不需要看 meta」)
  // 證據:5 LLM eval 共識「🪞 你看得懂的版本」「📚 命理深析(PDF 專屬深度版)」 label 殘留扣 UI 分(D-V3 給 92)
  // 修:寫入 Supabase 前過濾、避免 LLM eval 讀 ai_content 看到 label
  const beforeLabel = cleaned.length
  cleaned = cleaned
    .replace(/^###\s*🪞?\s*你看得懂的版本\s*$\n?/gm, '')
    .replace(/^>\s*\*{0,2}\s*📚\s*\*{0,2}\s*命理深析[^\n]*\n?/gm, '')
    .replace(/^>\s*\*{0,2}\s*命理深析\s*[(（]\s*PDF\s*專屬深度版\s*[)）]\s*\*{0,2}\s*\n?/gm, '')
    .replace(/[(（]\s*PDF\s*專屬深度版\s*[)）]/g, '')
    .replace(/^>\s*$\n?/gm, '')   // 空 blockquote line(避免上行過濾後留白)
    .replace(/\n{3,}/g, '\n\n')   // 多空行壓縮
  const labelRemoved = beforeLabel - cleaned.length
  if (labelRemoved > 0) {
    console.log(`[cleanFinalReport] v5.7.33 meta label filter:移除 ${labelRemoved} 字廢話 label`)
  }

  console.log(`[cleanFinalReport] 最終清理完成，${cleaned.length} 字`)
  return cleaned.trim()
}

// ── locale prompt 轉換 ──
function localizePrompt(prompt: string, locale?: string): string {
  if (locale === 'zh-CN') {
    return prompt.replace(/語言：繁體中文。/g, '語言：簡體中文。')
  }
  return prompt
}

// ── Step 0: 載入報告記錄 ──
export async function loadReportRecord(reportId: string) {
  "use step";
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('paid_reports')
    .select('retry_count, status, birth_data, plan_code, access_token, customer_email')
    .eq('id', reportId)
    .single()

  if (error || !data) {
    throw new FatalError(`找不到報告記錄: ${reportId}`)
  }

  // 防重複生成：如果報告已完成或正在生成中，直接跳過
  if (data.status === 'completed') {
    throw new FatalError(`報告 ${reportId} 已完成，跳過重複生成`)
  }
  if (data.status === 'generating') {
    throw new FatalError(`報告 ${reportId} 正在生成中，跳過重複觸發`)
  }

  if (!data.birth_data) {
    throw new FatalError(`報告 ${reportId} 缺少出生資料`)
  }

  // ── 併發控制閘門：限制同時生成的報告數量 ──
  // 防止 1000 人同時付款時 3000 個 Claude 呼叫打爆 API
  const MAX_CONCURRENT_REPORTS = 15 // 最多 15 份報告同時生成（= 45 個 Claude 呼叫）
  // 排除超過 30 分鐘的殭屍進程，只計算真正在跑的報告
  // 注意：paid_reports 沒有 updated_at 欄位，改用 created_at 作為近似的活躍度判斷
  // （生成中的報告 created_at 通常就是最近幾分鐘內，超過 30 分鐘視為殭屍）
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { count: generatingCount } = await supabase
    .from('paid_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'generating')
    .gt('created_at', thirtyMinAgo)

  if ((generatingCount || 0) >= MAX_CONCURRENT_REPORTS) {
    // 排隊等候：利用 Workflow 的 RetryableError 機制自動延遲重試
    // 每次延遲 30-90 秒（加隨機抖動避免驚群效應）
    const jitter = Math.floor(Math.random() * 60) + 30
    console.log(`⏳ 報告 ${reportId} 排隊中（目前 ${generatingCount} 份生成中，上限 ${MAX_CONCURRENT_REPORTS}），${jitter} 秒後重試`)
    throw new RetryableError(
      `併發上限：目前 ${generatingCount} 份報告正在生成，等待空位`,
      { retryAfter: `${jitter}s` },
    )
  }

  // 用原子操作搶佔：只有從 pending/failed 轉為 generating 才繼續
  // 這可以防止 Webhook + Fallback + Cron 同時觸發時的競態條件
  const { data: updated, error: updateErr } = await supabase.from('paid_reports').update({
    status: 'generating',
    error_message: null,
    // 記錄真實的 workflow 啟動時間，供 cron 精準判斷超時
    generation_progress: {
      started_at: new Date().toISOString(),
      workflow_instance: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  })
    .eq('id', reportId)
    .in('status', ['pending', 'failed'])
    .select('id')

  if (updateErr || !updated?.length) {
    throw new FatalError(`報告 ${reportId} 狀態搶佔失敗（可能已被其他程序處理）`)
  }

  return {
    birthData: data.birth_data as BirthData,
    planCode: data.plan_code as string,
    accessToken: data.access_token as string,
    customerEmail: data.customer_email as string,
    retryCount: data.retry_count ?? 0,
  }
}

// ── Step 1: 呼叫 Python API 排盤 ──
export async function callPythonCalculate(birthData: BirthData) {
  "use step";
  await emitProgress({ step: '排盤運算', progress: 10, message: '正在計算十五大命理系統排盤...' })

  // 60 秒超時：防止 Fly.io 無回應時無限等待
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  let res: Response
  try {
    res = await fetch(`${PYTHON_API}/api/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: birthData.name,
        year: birthData.year, month: birthData.month, day: birthData.day,
        hour: birthData.hour, minute: birthData.minute || 0,
        gender: birthData.gender,
        calendar_type: birthData.calendar_type || birthData.calendarType || 'solar',
        lunar_leap: birthData.lunar_leap || birthData.lunarLeap || false,
        time_unknown: birthData.time_unknown || false,
        time_mode: birthData.time_mode || birthData.timeMode || 'shichen',
        ...((birthData.latitude || birthData.cityLat) && (birthData.longitude || birthData.cityLng) ? {
          latitude: birthData.latitude || birthData.cityLat,
          longitude: birthData.longitude || birthData.cityLng,
          timezone_offset: birthData.timezone_offset || birthData.cityTz || 8,
        } : {}),
        // Sprint 4 國際化：IANA 時區 + 地區資訊（Python BirthInput 自動算 DST）
        ...(birthData.timezone ? { timezone: birthData.timezone } : {}),
        ...(birthData.birth_city ? { birth_city: birthData.birth_city } : {}),
        ...(birthData.birth_country ? { birth_country: birthData.birth_country } : {}),
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new RetryableError('排盤 API 超時（60秒）', { retryAfter: '10s' })
    }
    throw e
  }
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text()
    // Python API 可能暫時不可用，允許重試
    throw new RetryableError(`排盤 API 回傳 ${res.status}: ${errText}`, { retryAfter: '10s' })
  }

  const result: CalcResult = await res.json()
  console.log(`排盤完成: ${result.analyses?.length || 0} 套系統`)

  // 排盤結果完整性驗證：空結果或缺關鍵數據時重試
  if (!result.analyses?.length) {
    throw new RetryableError('排盤 API 回傳空結果（analyses 為空陣列）', { retryAfter: '15s' })
  }
  if (!result.client_data) {
    throw new RetryableError('排盤 API 缺少 client_data', { retryAfter: '15s' })
  }

  return result
}
callPythonCalculate.maxRetries = 3

// ── 出門訣引擎 Top 結果（E1=Top3 / E2=每週Top1×4）──
export interface ChumenjiTopItem {
  rank: number
  date: string
  solar_date: string
  shichen: string
  time_range: string
  direction: string
  door: string
  star: string
  shen: string
  score: number
  reason: string
  confidence: Record<string, unknown>
  ju: string
  gong: string
  kongwang: boolean
  shensha_warning: string
  week_number?: number
  week_label?: string
  week_range?: string
}

export interface ChumenjiTopResult {
  plan_code: string
  results: ChumenjiTopItem[]
  detected_event_type?: string
  detected_event_types?: Record<string, number>
}

/**
 * AI 事件類型分類（DeepSeek，快速+便宜）
 * 從客戶描述自動識別事件意圖，返回多類型+信心分數
 */
async function aiClassifyEventType(customerText: string): Promise<Record<string, number> | null> {
  if (!customerText.trim() || !DEEPSEEK_KEY) return null

  const prompt = `你是奇門遁甲事件分類器。根據客戶描述，判斷屬於以下哪些事件類型，給出信心分數（0-1）。
只回覆 JSON，不要任何解釋。

事件類型清單：面試、求官、求財、簽約、談判、考試、出行、求醫、嫁娶、求學、開業、訴訟、求子、搬遷、置產、感情、化解、討債

分類原則：
- 跟錢直接相關（薪水/投資/報酬/財運）→ 求財
- 面試只是場景，如果有談薪目的 → 求財應比面試高
- 可以同時匹配多個類型
- 只回覆信心 > 0.2 的類型

客戶描述：「${customerText}」

回覆格式：{"求財": 0.8, "面試": 0.3, "談判": 0.6}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000) // 8秒超時

    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error(`AI 事件分類失敗: ${res.status}`)
      return null
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content?.trim() || ''

    // 解析 JSON（可能被包在 ```json ``` 裡）
    const jsonMatch = content.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, number>
    // 過濾掉信心太低的
    const filtered: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && v > 0.1) {
        filtered[k] = v
      }
    }

    if (Object.keys(filtered).length > 0) {
      console.log(`AI 事件分類結果: ${JSON.stringify(filtered)}`)
      return filtered
    }
    return null
  } catch (e) {
    console.error('AI 事件分類異常（不阻塞）:', e)
    return null
  }
}

export async function callChumenjiTop(
  planCode: string,
  birthData: BirthData,
): Promise<ChumenjiTopResult | null> {
  "use step";
  await emitProgress({ step: '出門訣計算', progress: 15, message: '正在計算最佳出門時辰（奇門遁甲引擎）...' })

  // 從出生年推算地支
  const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
  const birthYearDizhi = DIZHI[(birthData.year - 4) % 12] || ''

  // 合併客戶文字描述（嘗試所有可能的欄位名）
  const bd = birthData as Record<string, unknown>
  const customerText = [
    bd.topic || '',
    bd.question || '',
    bd.customer_note || '',
    bd.analysis_topic || '',
    bd.event_description || '',
    bd.note || '',
  ].filter(Boolean).map(String).join(' ')
  console.log(`[chumenji] customerText (${customerText.length} chars): ${customerText.substring(0, 100)}`)

  // AI 事件分類（DeepSeek，主方案；失敗時由後端關鍵字 fallback）
  let eventTypesWeighted: Record<string, number> | null = null
  if (customerText.trim()) {
    eventTypesWeighted = await aiClassifyEventType(customerText)
  }

  const body: Record<string, unknown> = {
    plan_code: planCode,
    birth_year_dizhi: birthYearDizhi,
    event_type: (birthData.event_type as string) || '出行',
    // 傳入客戶文字描述（後端關鍵字 fallback 用）
    topic: birthData.topic || '',
    question: birthData.question || '',
    customer_note: birthData.customer_note || '',
    // AI 分類結果（前端 DeepSeek 預分類）
    event_types_weighted: eventTypesWeighted,
    // P0 修復（2026-04-17 稽核）：傳入完整八字供後端推算日主喜用神個人化
    // 後端 /api/chumenji-top 會自動推導 rizhu_gan/xiyongshen_wx/jishen_wx/bazi_strength
    birth_year: birthData.year,
    birth_month: birthData.month,
    birth_day: birthData.day,
    birth_hour: birthData.hour,
    birth_minute: (birthData as Record<string, unknown>).minute || 0,
  }

  if (planCode === 'E1') {
    body.event_start_date = birthData.event_start_date || new Date().toISOString().split('T')[0]
    body.event_end_date = birthData.event_end_date || birthData.event_start_date || ''
    // v5.3.23：E1 升級 — 傳 has_exact_time + event_exact_time 給 Python
    //   yes 模式：Python 驗證該時辰吉凶 + 前置補運 Top 3
    //   no 模式：Python 掃描 Top 3 最佳時機（舊行為）
    const hasExactTime = Boolean((birthData as Record<string, unknown>).has_exact_time)
    body.has_exact_time = hasExactTime
    if (hasExactTime) {
      const exactTime = (birthData as Record<string, unknown>).event_exact_time
      if (typeof exactTime === 'string' && /^\d{2}:\d{2}$/.test(exactTime)) {
        body.event_exact_time = exactTime
      }
    }
  } else if (planCode === 'E2') {
    // v5.3.79 v2.0：E2 月家奇門古法、單月 1 盤
    // handler 端會依伺服器當前時間自動算農曆晦日 22:20-23:00
    // 不需要 start_date 或掃描參數
  } else if (planCode === 'E3') {
    // v5.3.62：E3 月度精選 — 從今天起 4 週、每週 Top 2 = 8 個吉時
    // 主題用神權重 60% + 基礎格局 20% + 年命宮 20%（古法占事派）
    body.start_date = new Date().toISOString().split('T')[0]
    body.top_per_week = 2        // 每週取 Top 2
    body.total_weeks = 4         // 共 4 週
    body.expected_top_count = 8  // 共 8 個吉時
    // E3 主題選擇（8 類選 1-3、順序即 TOP 1/2/3 優先序）
    const topics = (birthData as Record<string, unknown>).topics
    const topicRank = (birthData as Record<string, unknown>).topic_rank
    if (Array.isArray(topics) && topics.length > 0) {
      body.topics = topics
      body.topic_rank = topicRank || {}
    }
  }

  // P0 修復：傳入客戶可用時段，引擎只在這些時段內掃描
  // available_time_slots 格式：[{start:"09:00",end:"12:00"},{start:"19:00",end:"23:00"}]
  const timeSlots = birthData.available_time_slots as Array<{start: string, end: string}> | undefined
  if (timeSlots && timeSlots.length > 0) {
    body.available_time_slots = timeSlots
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(`${PYTHON_API}/api/chumenji-top`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text()
      console.error(`出門訣 Top 計算失敗: ${res.status} ${errText}`)
      return null  // 不阻塞主流程，AI 仍可生成報告
    }

    const result: ChumenjiTopResult = await res.json()
    console.log(`出門訣引擎 Top 結果: ${result.results?.length || 0} 項`)
    return result
  } catch (e) {
    clearTimeout(timeout)
    console.error('出門訣 Top 計算異常（不阻塞）:', e)
    return null
  }
}
callChumenjiTop.maxRetries = 1

// ── 串流存檔：讀取已存的部分內容 ──
async function loadPartialContent(reportId: string, callLabel: string): Promise<string | null> {
  if (!reportId) return null
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('paid_reports')
      .select('generation_progress')
      .eq('id', reportId)
      .single()
    const progress = data?.generation_progress as Record<string, string> | null
    return progress?.[callLabel] || null
  } catch {
    return null
  }
}

// ── 串流存檔：儲存部分內容到 Supabase ──
// v5.3.32：同步更新 progress_updated_at + progress（字數換算），讓前端即時感知「還在寫」
//   - 以前只更新 Call N 內容但不更 progress_updated_at → 前端 2 分鐘 timer 判定「無進度」
//     fallback 到純時間估算，直接飆到 97%（假 97% 欺騙 bug）
//   - 現在 savePartialContent 一起更新 progress_updated_at 讓前端判定仍有新鮮進度
const CALL_EXPECTED_CHARS: Record<string, number> = {
  'Call 1': 18000,
  'Call 2': 15000,
  'Call 3': 13000,
}
// Call 1 = 0-30%, Call 2 = 30-60%, Call 3 = 60-90%, 剩 10% 留給 PDF/Storage/Email
const CALL_PROGRESS_RANGE: Record<string, { base: number; span: number }> = {
  'Call 1': { base: 10, span: 30 }, // 10→40
  'Call 2': { base: 40, span: 25 }, // 40→65
  'Call 3': { base: 65, span: 25 }, // 65→90
}

async function savePartialContent(reportId: string, callLabel: string, content: string): Promise<void> {
  if (!reportId) return
  try {
    const supabase = getSupabase()
    // 先讀取現有進度（保留其他 call 的資料）
    const { data } = await supabase
      .from('paid_reports')
      .select('generation_progress')
      .eq('id', reportId)
      .single()
    const existing = (data?.generation_progress as Record<string, unknown>) || {}

    // 以字數換算真實進度（Call N 已寫字數 / 預期字數 × span + base）
    const update: Record<string, unknown> = {
      ...existing,
      [callLabel]: content,
      [`${callLabel}_updated`]: new Date().toISOString(),
      // 關鍵修復：同步更新 progress_updated_at，避免前端誤判「卡住」fallback 時間估算
      progress_updated_at: new Date().toISOString(),
    }

    const range = CALL_PROGRESS_RANGE[callLabel]
    const expected = CALL_EXPECTED_CHARS[callLabel]
    if (range && expected && typeof content === 'string' && content.length > 0) {
      const ratio = Math.min(content.length / expected, 1)
      const realProgress = Math.round(range.base + ratio * range.span)
      update.progress = realProgress
      update.step = 'AI分析'
      update.message = `正在為您撰寫 ${callLabel}（${content.length} 字）...`
    }

    await supabase
      .from('paid_reports')
      .update({ generation_progress: update })
      .eq('id', reportId)
  } catch (e) {
    // 存檔失敗不阻塞串流
    console.warn(`串流存檔失敗（${callLabel}）:`, e)
  }
}

// ── Claude 串流呼叫（內部輔助，非 step）——含 600s 超時 + 串流存檔 ──
// 回傳 content + usage（input/output tokens）以供 ai-cost-tracker 記錄
async function claudeStreamingCall(
  systemPrompt: string, userPrompt: string, maxTokens: number,
  reportId?: string, callLabel?: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const checkpointKey = callLabel || 'default'

  // 串流存檔：檢查是否有上次中斷的部分內容，用「從這裡繼續」的 prompt
  let actualUserPrompt = userPrompt
  let prefixContent = ''
  if (reportId && callLabel) {
    const partial = await loadPartialContent(reportId, checkpointKey)
    if (partial && partial.length > 1000) {
      console.log(`發現 ${checkpointKey} 的部分內容（${partial.length} 字），從斷點續寫`)
      prefixContent = partial
      // 取最後 2000 字作為上下文，讓 AI 從斷點接續
      const tail = partial.slice(-2000)
      actualUserPrompt = `${userPrompt}\n\n【重要】以下是你之前寫到一半的內容（因超時中斷），請從斷點處直接繼續寫完，不要重複已寫的內容：\n\n...${tail}\n\n請從這裡接續，直接輸出後續內容。`
    }
  }

  // 900 秒超時：Workflow step 最長支援 900s，配合 128k max_tokens 需要更多時間
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 900000)

  let res: Response
  try {
    res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'x-api-key': getNextClaudeKey(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      // v5.3.9：Claude Opus 4.7 不接受 temperature 參數（API 400: deprecated for this model）
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'user', content: actualUserPrompt }],
        system: systemPrompt,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new RetryableError('Claude API 連線超時（900秒）', { retryAfter: '15s' })
    }
    throw e
  }

  if (!res.ok) {
    clearTimeout(timeout)
    const errText = await res.text()
    if (res.status === 429) {
      // 指數退避 + 隨機抖動：防止 1000 人同時重試造成 429 瀑布
      // 解析 Anthropic 的 retry-after header（如果有的話）
      const retryAfterHeader = res.headers.get('retry-after')
      const baseDelay = retryAfterHeader ? parseInt(retryAfterHeader) : 60
      const jitter = Math.floor(Math.random() * 30) + 15 // 15-45 秒隨機
      const delay = baseDelay + jitter
      throw new RetryableError(`Claude API 429 限流，${delay}s 後重試`, { retryAfter: `${delay}s` })
    }
    if (res.status === 529) {
      const jitter529 = Math.floor(Math.random() * 60) + 90 // 90-150 秒隨機
      throw new RetryableError(`Claude API 529 過載，${jitter529}s 後重試`, { retryAfter: `${jitter529}s` })
    }
    if (res.status === 402) {
      throw new FatalError(`Claude API 402 額度不足：請到 console.anthropic.com 充值。${errText.slice(0, 200)}`)
    }
    if (res.status >= 500) {
      const jitter5xx = Math.floor(Math.random() * 15) + 15 // 15-30 秒隨機
      throw new RetryableError(`Claude API ${res.status}: ${errText.slice(0, 300)}`, { retryAfter: `${jitter5xx}s` })
    }
    throw new FatalError(`Claude API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timeout)
    throw new Error('Claude API 無回應串流')
  }

  const decoder = new TextDecoder()
  let result = ''
  let buffer = ''
  let lastCheckpoint = 0
  // token 計量（從 SSE message_start / message_delta 事件收集）
  let inputTokens = 0
  let outputTokens = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            result += event.delta.text
          } else if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens || 0
            // message_start 也可能帶初始 output_tokens（通常為 0~少量）
            outputTokens = event.message.usage.output_tokens || outputTokens
          } else if (event.type === 'message_delta' && event.usage) {
            // Anthropic 串流：message_delta 的 usage.output_tokens 是累積值
            if (typeof event.usage.output_tokens === 'number') {
              outputTokens = event.usage.output_tokens
            }
            if (typeof event.usage.input_tokens === 'number' && event.usage.input_tokens > 0) {
              inputTokens = event.usage.input_tokens
            }
          }
        } catch { /* 忽略 */ }
      }

      // 串流存檔：每 3000 字存一次到 Supabase
      if (reportId && callLabel && result.length > lastCheckpoint + 3000) {
        const fullContent = prefixContent ? prefixContent + result : result
        savePartialContent(reportId, checkpointKey, fullContent).catch(() => {})
        lastCheckpoint = result.length
      }
    }
  } catch (e) {
    // 超時或斷線：先存檔再拋錯
    if (reportId && callLabel && result.length > 0) {
      const fullContent = prefixContent ? prefixContent + result : result
      try {
        await savePartialContent(reportId, checkpointKey, fullContent)
        console.log(`串流中斷，已存檔 ${fullContent.length} 字到 ${checkpointKey}`)
      } catch { /* 存檔失敗不阻塞 */ }
    }

    if (e instanceof Error && e.name === 'AbortError') {
      clearTimeout(timeout)
      throw new RetryableError(`Claude API 串流超時（900秒，已收到 ${result.length} 字，已存檔）`, { retryAfter: '30s' })
    }
    clearTimeout(timeout)
    throw e
  }

  clearTimeout(timeout)

  // 串流完成：合併 prefix + 新內容，並清除存檔
  const finalResult = prefixContent ? prefixContent + result : result

  // 清除此 call 的部分存檔（串流已正常完成）
  // 必須 await，避免清除失敗導致下次 retry 載入舊內容造成重複章節
  if (reportId && callLabel) {
    try {
      await savePartialContent(reportId, checkpointKey, '')
    } catch {
      console.warn(`清除串流存檔失敗（${checkpointKey}），不影響本次結果`)
    }
  }

  return { content: finalResult, inputTokens, outputTokens }
}

// ── DeepSeek 呼叫（內部輔助，非 step）——含 180s 超時 ──
async function deepseekCall(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
  // 180 秒超時
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)

  let res: Response
  try {
    res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new RetryableError('DeepSeek API 超時（180秒）', { retryAfter: '15s' })
    }
    throw e
  }
  clearTimeout(timeout)

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) {
      throw new RetryableError(`DeepSeek API 429 限流`, { retryAfter: '15s' })
    }
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── 構建非 C 方案的通用 user prompt ──
function buildGenericUserPrompt(
  birthData: BirthData,
  cd: CalcResult['client_data'],
  analyses: AnalysisItem[],
  topic?: string,
  question?: string,
  additionalPeople?: Array<{ name: string; gender: string; marital_status?: string; year: number; month: number; day: number; hour: string | number; time_unknown?: boolean }>,
  chumenjiTop?: ChumenjiTopResult | null,
  planCode?: string,
): string {
  // v5.3.73 P0 修復：birthData.plan_code 在 JSONB 裡為 null、以外層 planCode 參數為準
  const effectivePlanCode: string = planCode || (birthData.plan_code as string) || ''
  // G15 家族方案（舊版 family 模式）安全防護：多人 birthData 不能走單人 prompt
  if (birthData.plan_type === 'family' && Array.isArray(birthData.members)) {
    let memberPrompts = '家庭成員資料：\n'
    for (const m of birthData.members as Array<{ name?: string; gender?: string; marital_status?: string; year?: number; month?: number; day?: number; hour?: number }>) {
      const ms = m.marital_status === 'married' ? '已婚' : m.marital_status === 'unmarried' ? '未婚' : '未提供'
      memberPrompts += `\n【${m.name || ''}】${m.gender === 'M' ? '男' : '女'}，婚姻：${ms}，${m.year}年${m.month}月${m.day}日${m.hour}時\n`
    }
    memberPrompts += `\n八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}\n`
    memberPrompts += `${analyses.length}套系統排盤完整數據：\n`
    // 繼續走下方分析資料拼接
    let userPrompt = memberPrompts
    for (const a of analyses.slice(0, 15)) {
      userPrompt += `\n【${a.system}】評分：${a.score}分`
      if (a.summary) userPrompt += `\n摘要：${a.summary}`
    }
    if (topic) userPrompt += `\n分析方向：${topic}\n`
    if (question) userPrompt += `客戶問題描述：${question}\n`
    return userPrompt
  }

  // E1/E2/E3/E4 出門訣：只傳奇門遁甲數據，不傳其他系統（避免 AI 混用）
  // v5.3.73 P0 修復：用 effectivePlanCode（外層 planCode > birthData.plan_code、後者在 JSONB 裡常為 null）
  // v5.7.17:IA round 9 P1 — 用 isChumenjiPlan 統一(原 E1||E2||E3 漏 E4、v5.8 立春前 30 天上線時連帶 bug)
  const isChumenji = isChumenjiPlan(effectivePlanCode)

  // v5.10.5 婚姻狀況(D/G15-old/R 用)— E 系列出門訣不需此欄(出門訣 = 純奇門 / 不寫感情段)
  const maritalStatusZh =
    birthData.marital_status === 'married' ? '已婚' :
    birthData.marital_status === 'unmarried' ? '未婚' : '未提供'
  const maritalLine = !isChumenji ? `，婚姻：${maritalStatusZh}` : ''

  let userPrompt = `${birthData.name || ''}，${birthData.gender === 'M' ? '男' : '女'}${maritalLine}，${birthData.year}年${birthData.month}月${birthData.day}日${birthData.hour}時\n`

  if (isChumenji) {
    userPrompt += `出生年地支（年命宮依據）：${cd.birth_dizhi || ''}\n`
    userPrompt += `農曆：${cd.lunar_date || ''}\n`
    // 只傳奇門遁甲的排盤數據
    const qimenAnalysis = analyses.find(a => a.system === '奇門遁甲' || a.system?.includes('奇門'))
    if (qimenAnalysis) {
      userPrompt += `\n【奇門遁甲排盤數據】\n`
      if (qimenAnalysis.summary) userPrompt += `摘要：${qimenAnalysis.summary}\n`
      if (qimenAnalysis.tables?.length) {
        for (const t of qimenAnalysis.tables) {
          userPrompt += `\n表格「${t.title}」：\n`
          if (t.headers) userPrompt += `| ${t.headers.join(' | ')} |\n`
          if (t.rows) {
            for (const row of t.rows) userPrompt += `| ${row.join(' | ')} |\n`
          }
        }
      }
      if (qimenAnalysis.details) {
        const detail = typeof qimenAnalysis.details === 'string' ? qimenAnalysis.details : JSON.stringify(qimenAnalysis.details)
        userPrompt += `\n詳細排盤：\n${detail}\n`
      }
    }

    // v5.3.23：E1 新增命盤×事件背景（八字+紫微精簡摘要）
    //   E1 從「純奇門」升級為「奇門為主，八字/紫微為輔」
    //   AI 先看客戶本命對此事件的傾向（助力/阻力），再給 Top 3 吉時
    //   E2 維持純奇門（不加）
    if (effectivePlanCode === 'E1') {
      userPrompt += `\n【客戶命盤背景 — 八字/紫微摘要（僅供事件本質分析）】\n`
      userPrompt += `八字：${cd.bazi || ''}\n`
      if (cd.yongshen) userPrompt += `用神：${cd.yongshen}\n`
      if (cd.five_elements) userPrompt += `五行分佈：${JSON.stringify(cd.five_elements)}\n`

      const baziAnalysis = analyses.find(a => a.system === '八字' || (a.system || '').includes('八字'))
      if (baziAnalysis?.summary) {
        userPrompt += `八字摘要：${String(baziAnalysis.summary).slice(0, 600)}\n`
      }

      const ziweiAnalysis = analyses.find(a => a.system === '紫微斗數' || (a.system || '').includes('紫微'))
      if (ziweiAnalysis?.summary) {
        userPrompt += `紫微摘要：${String(ziweiAnalysis.summary).slice(0, 600)}\n`
      }
    }

    // v5.3.72 P0 修復：E3 傳客戶選的 TOP3 主題給 AI
    // 之前 topic_rank 只傳給 Python 排盤引擎、沒給 AI → AI 看盤自動推成 career/wealth/noble
    if (effectivePlanCode === 'E3') {
      const e3Topics = (birthData as Record<string, unknown>).topics as string[] | undefined
      const e3TopicRank = (birthData as Record<string, unknown>).topic_rank as Record<string, number> | undefined
      if (Array.isArray(e3Topics) && e3Topics.length > 0) {
        const TOPIC_ZH: Record<string, string> = {
          career: '事業運',
          wealth: '財運',
          love: '感情運',
          health: '健康',
          study: '學業',
          noble: '貴人',
          villain: '化解小人',
          family: '家庭',
        }
        const sortedTopics = [...e3Topics].sort((a, b) => {
          const rankA = e3TopicRank?.[a] ?? 99
          const rankB = e3TopicRank?.[b] ?? 99
          return rankA - rankB
        })
        userPrompt += `\n【客戶選的 TOP${sortedTopics.length} 主題 — 按優先序、不可變更】\n`
        sortedTopics.forEach((t) => {
          const rank = e3TopicRank?.[t] ?? 0
          const zh = TOPIC_ZH[t] || t
          userPrompt += `TOP ${rank}：${zh}（code: ${t}）\n`
        })
        userPrompt += `\n**硬性規則（違反即重寫）**：\n`
        userPrompt += `1. 所有 8 張卡片標題格式「主題：X（TOP N）」的 X 必須嚴格用上述中文名、N 必須匹配上述 rank 數字。\n`
        userPrompt += `2. 禁止把客戶沒選的主題寫進報告（例如客戶沒選 noble，整份報告就不能出現「貴人」作為主題標籤；客戶沒選 career，就不能出現「事業運」作為主題標籤）。\n`
        userPrompt += `3. 每張卡片的「優勢」「最適合做的事」「行動建議」必須完全貼合該卡片主題——健康卡寫身體調養/療癒/醫療建議、家庭卡寫親情/家宅/長輩建議、化解小人卡寫避禍/人際摩擦化解建議，不可套用通用事業/財運話術。\n`
        userPrompt += `4. 引言必須明確列出客戶選的 TOP${sortedTopics.length} 主題（例如「這 4 週是為你的 ① ${TOPIC_ZH[sortedTopics[0]] || sortedTopics[0]} ② ${sortedTopics[1] ? (TOPIC_ZH[sortedTopics[1]] || sortedTopics[1]) : ''}${sortedTopics[2] ? ` ③ ${TOPIC_ZH[sortedTopics[2]] || sortedTopics[2]}` : ''} 量身挑選」），讓客戶一打開就確認你看到了他的需求。\n`
      }
    }
    userPrompt += '\n'
  } else {
    userPrompt += `八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}
農曆：${cd.lunar_date || ''} | 納音：${cd.nayin || ''} | 命宮：${cd.ming_gong || ''}
${analyses.length}套系統排盤完整數據：
`
  }

  const analysesToInclude = isChumenji ? [] : analyses.slice(0, 15)
  for (const a of analysesToInclude) {
    userPrompt += `\n【${a.system}】評分：${a.score}分`
    if (a.summary) userPrompt += `\n摘要：${a.summary}`
    // v5.6 P0 (round 2):注入 raw_data 精簡白名單(birth-time 精度 flag)、讓 ETHICS_RULES 06/07/09 disclaimer 規則可生效
    // 不全傳避免 token bloat、只傳 ETHICS_RULES 條件指令需要的 key
    if (a.raw_data && typeof a.raw_data === 'object') {
      // v5.6.6 round 3 Wave 5 Top 10 #2: 拆 3 個 label、補 v5.4.0 漏注入的 key、4 LLM round 2 共識
      // (1) birth-time 精度 JSON 注入(v5.6.0)
      // (2) 紫微三核心中文 label(v5.6.6)
      // (3) v5.4.0 既有條件指令的 raw_data 注入(karmic_debt/karmic_lessons/master_number_warning/homophone_taboo、之前漏)

      // (1) birth-time 精度
      const timeFlags: Record<string, unknown> = {}
      if (a.raw_data['asc_confidence'] !== undefined) timeFlags['asc_confidence'] = a.raw_data['asc_confidence']
      if (a.raw_data['time_precision_warning'] !== undefined) timeFlags['time_precision_warning'] = a.raw_data['time_precision_warning']
      if (Object.keys(timeFlags).length > 0) {
        userPrompt += `\nbirth-time 精度標記：${JSON.stringify(timeFlags)}`
      }

      // (2) 紫微三核心(中文 label、4 個 key 都判 undefined)
      const mingZhu = a.raw_data['ming_zhu']
      const shenZhu = a.raw_data['shen_zhu']
      const douJun = a.raw_data['dou_jun']
      const douJunPalace = a.raw_data['dou_jun_palace']
      if (mingZhu !== undefined || shenZhu !== undefined || douJun !== undefined || douJunPalace !== undefined) {
        const ziweiParts: string[] = []
        if (mingZhu !== undefined && mingZhu !== null) ziweiParts.push(`命主=${mingZhu}`)
        if (shenZhu !== undefined && shenZhu !== null) ziweiParts.push(`身主=${shenZhu}`)
        if (douJun !== undefined && douJun !== null) ziweiParts.push(`流年斗君=${douJun}`)
        if (douJunPalace !== undefined && douJunPalace !== null) ziweiParts.push(`斗君落宮=${douJunPalace}`)
        if (ziweiParts.length > 0) {
          // v5.6.6 round 4 Gemini P1 對齊:加粗體跟 plan-prompts.ts L79「**紫微核心參數**」一致、LLM 觸發更精準
          userPrompt += `\n**紫微核心參數**：${ziweiParts.join('、')}`
        }
      }

      // (3) v5.4.0 既有條件指令對應 raw_data 注入(plan-prompts.ts L75-78 已寫指令、之前 steps.ts 漏注入)
      // round 4 Gemini P1:label 簡化「raw_data 擷取」更直白對應 prompt 的「raw_data 含 X」字眼
      // round 4 IA P2:統一 strict undefined && null check
      const v54Flags: Record<string, unknown> = {}
      const v54Keys = ['karmic_debt', 'karmic_lessons', 'master_number_warning', 'homophone_taboo']
      for (const key of v54Keys) {
        const v = a.raw_data[key]
        if (v !== undefined && v !== null) v54Flags[key] = v
      }
      if (Object.keys(v54Flags).length > 0) {
        userPrompt += `\nraw_data 擷取(v5.4.0 條件指令對應)：${JSON.stringify(v54Flags)}`
      }

      // (4) v5.6.6 Top 10 #4 Wave 5: school_info 派別 metadata + academic_reference 學術引用(biorhythm Hines 1998 PMID 9775660)
      // IA round 1 抓 P0:之前白名單沒注入、AI 看不到、本次補
      // 跨全 15 系統:school_info(派別/古籍/信心度)+ academic_reference(學術 critique、目前僅 14 biorhythm 有)
      const metaFlags: Record<string, unknown> = {}
      const metaKeys = ['school_info', 'academic_reference']
      for (const key of metaKeys) {
        const v = a.raw_data[key]
        if (v !== undefined && v !== null) metaFlags[key] = v
      }
      if (Object.keys(metaFlags).length > 0) {
        userPrompt += `\n派別 + 學術引用 metadata：${JSON.stringify(metaFlags)}`
      }
    }
    if (a.good_points?.length) {
      userPrompt += `\n好的地方：`
      for (const g of a.good_points) userPrompt += `\n- ${g}`
    }
    if (a.bad_points?.length) {
      userPrompt += `\n需要注意：`
      for (const b of a.bad_points) userPrompt += `\n- ${b}`
    }
    if (a.warnings?.length) {
      userPrompt += `\n注意事項：`
      for (const w of a.warnings) userPrompt += `\n- ${w}`
    }
    if (a.improvements?.length) {
      userPrompt += `\n改善建議：`
      for (const imp of a.improvements) userPrompt += `\n- ${imp}`
    }
    if (a.tables?.length) {
      for (const t of a.tables) {
        userPrompt += `\n表格「${t.title}」：\n`
        if (t.headers) userPrompt += `| ${t.headers.join(' | ')} |\n`
        if (t.rows) {
          for (const row of t.rows) userPrompt += `| ${row.join(' | ')} |\n`
        }
      }
    }
    if (a.details) {
      const detail = typeof a.details === 'string' ? a.details : JSON.stringify(a.details)
      userPrompt += `\n詳細排盤：\n${detail}\n`
    }
    if (a.info_boxes?.length) {
      for (const box of a.info_boxes) {
        userPrompt += `\n${box.title || '補充'}：\n`
        if (box.items) {
          for (const item of box.items) userPrompt += `- ${item}\n`
        }
      }
    }
    userPrompt += '\n'
  }

  // 報告生成日期：讓 AI 知道「今天」是哪天，避免推薦過去的日期
  const generationDate = new Date().toISOString().split('T')[0]
  userPrompt += `\n【報告生成日期】${generationDate}\n吉時推薦只能推薦此日期之後（含當天）的日期，不可推薦已經過去的日期。\n`

  // 出門訣時間限制：客戶選的可配合時段
  if (birthData.available_time_slots && Array.isArray(birthData.available_time_slots) && birthData.available_time_slots.length > 0) {
    const slotsDesc = birthData.available_time_slots.map((s: { start?: string; end?: string }) => `${s.start || ''}~${s.end || ''}`).join('、')
    userPrompt += `\n【重要】客戶只有以下時段有空出門：${slotsDesc}\n吉時推薦必須只推薦在這些時段內的時機，不可推薦客戶無法出門的時段。\n`
  }

  // E1 事件時間範圍
  if (birthData.event_start_date) {
    userPrompt += `\n事件時間範圍：${birthData.event_start_date} 至 ${birthData.event_end_date || birthData.event_start_date}\n`
  }

  // ── 出門訣引擎 Top 結果強制注入（P0-1 修復）──
  // AI 必須使用引擎算出的時辰，不能自己猜
  if (chumenjiTop?.results?.length) {
    userPrompt += `\n${'='.repeat(60)}\n`
    userPrompt += `【奇門遁甲排盤引擎計算結果 — 不可更改】\n`
    userPrompt += `以下是排盤引擎用 25+ 步量化評分體系算出的最佳出門時辰。\n`
    userPrompt += `你必須使用這些結果，不能更換、不能調整、不能用任何理由否決。\n`
    userPrompt += `你的工作是用白話文解釋為什麼這些時辰最好，讓客戶看得懂。\n\n`

    // 計算整批結果的排序位置（用於相對描述，非絕對分數）
    const sortedByScore = [...chumenjiTop.results].sort((a, b) => b.score - a.score)
    const rankMap = new Map(sortedByScore.map((r, i) => [r, i + 1]))

    for (const item of chumenjiTop.results) {
      const dir = item.direction || ''
      const weekInfo = item.week_label ? `【${item.week_label}（${item.week_range}）最佳】` : `【第${item.rank}名】`
      const globalRank = rankMap.get(item) || item.rank
      const tier = globalRank === 1 ? '最高（TOP1）' : globalRank <= 3 ? `前三（第${globalRank}）` : `中段（第${globalRank}）`
      userPrompt += `${weekInfo}\n`
      userPrompt += `  日期：${item.date}（${item.solar_date}）\n`
      userPrompt += `  時辰：${item.shichen}時（${item.time_range}）\n`
      userPrompt += `  方位：${dir}\n`
      userPrompt += `  奇門盤：${item.door}+${item.star}+${item.shen}\n`
      userPrompt += `  局：${item.ju}\n`
      userPrompt += `  宮位：${item.gong}\n`
      userPrompt += `  能量等級：${tier}（相對排序，非絕對分數）\n`
      if (item.kongwang) userPrompt += `  ⚠ 空亡：是（能量有損耗，已反映在排序中）\n`
      if (item.shensha_warning) userPrompt += `  ⚠ 神煞：${item.shensha_warning}\n`
      userPrompt += `  能量理由：${item.reason}\n\n`
    }

    userPrompt += `【強制規則（違反即需重寫）】\n`
    userPrompt += `1. 以上時辰是奇門遁甲排盤引擎的精確計算結果，你不可更改。\n`
    userPrompt += `2. JSON 輸出中的 date/time_start/time_end/direction 必須與上方引擎結果完全一致。\n`
    userPrompt += `3. 【禁止使用任何具體分數】不得寫出「100 分」「229 分」「70%」等任何分數、百分比、數值評級。只能用「最高」「強」「次之」「中等」「偏弱」等相對描述。\n`
    userPrompt += `4. 不得使用生物節律、體力週期、智力週期、情緒週期、美感週期、直覺週期、低潮日、西洋占星、八字、風水八宅或任何非奇門遁甲系統來否決或調整這些時辰。\n`
    userPrompt += `5. 你的任務：(a) 用白話文解釋門+星+神組合的含義 (b) 給出具體的穿著/物品/行為建議 (c) 說明為什麼這個組合對客戶的事件有利。\n`
    userPrompt += `6. 所有加減分因素（年命宮共振、格局、空亡、神煞）已包含在排序中，不需要你重新計算或解釋分數來源。\n`
    userPrompt += `${'='.repeat(60)}\n\n`
  }

  // D 方案：強制注入客戶原始問題 + 老闆鐵律（每條論述必須引用具體命盤欄位）
  const bdAny = birthData as Record<string, unknown>
  const isDPlan = effectivePlanCode === 'D'
  const dTopic = (topic || bdAny.analysis_topic || bdAny.topic || '') as string
  const dQuestion = (question || bdAny.customer_note || bdAny.other_question || bdAny.question || '') as string
  if (isDPlan) {
    userPrompt += `\n${'='.repeat(60)}\n`
    userPrompt += `【D 方案「心之所惑」$39 — 客戶的具體問題（整份報告必須 100% 圍繞此展開）】\n`
    if (dTopic) userPrompt += `主題：${dTopic}\n`
    if (dQuestion) userPrompt += `客戶原文：「${dQuestion}」\n`
    if (!dQuestion && dTopic) userPrompt += `（客戶只填了主題沒有詳細描述，你要根據主題給出有衝擊力的具體解答，而不是泛泛分析整個命格）\n`
    userPrompt += `\n【強制規則——違反一條直接重寫】\n`
    userPrompt += `1. 「你的問題」章節必須一字不改引用客戶原文（或主題）。\n`
    userPrompt += `2. 「你的答案」必須 10 秒內給明確方向，且每句話都要括號標明具體命盤欄位（日主X干/X宮X主星/X大運/X格局），禁止用「命盤顯示...」這類空話。\n`
    userPrompt += `3. 字數嚴格 6,000-9,000 字（不是 C 方案的 15,000+），精簡到每句都是重點。\n`
    userPrompt += `4. 只用 5-8 套最相關系統，跟問題無關的系統一個字都不寫。\n`
    userPrompt += `5. 好的地方/需要注意/改善建議各 3-4 條（不是 6-7 條），精選不灌水。\n`
    userPrompt += `6. 改善建議不得出現「佩戴X飾品/穿X顏色/在家擺X方位/換姓名」等民俗擺設建議——$39 客戶要行為改變，不是民俗周邊。\n`
    userPrompt += `${'='.repeat(60)}\n`
  } else {
    if (dTopic) userPrompt += `\n分析方向：${dTopic}\n`
    if (dQuestion) userPrompt += `客戶問題描述：${dQuestion}\n`
  }
  if (additionalPeople?.length) {
    userPrompt += `\n其他人資料：\n`
    for (const p of additionalPeople) {
      // v5.10.5 R 各成員婚姻狀況注入
      const pAny = p as Record<string, unknown>
      const pMs = pAny.marital_status === 'married' ? '已婚' : pAny.marital_status === 'unmarried' ? '未婚' : '未提供'
      userPrompt += `- ${p.name}，${p.gender === 'M' ? '男' : '女'}，婚姻：${pMs}，${p.year}年${p.month}月${p.day}日${p.hour === 'unknown' || p.time_unknown ? '（時辰不確定）' : ` ${p.hour}時`}\n`
    }
  }

  userPrompt += `\n請根據以上所有排盤數據，撰寫完整的分析報告。
重要提醒：
1. 現在是2026年丙午年。
2. 你的每一個分析論點都必須引用上方排盤數據中的具體結果，不得編造。
3. 排盤數據中「好的地方」和「需要注意」的每一條都必須在報告中被展開分析，不可遺漏。
4. 如果某個系統數據不完整，跳過該系統，不要瞎編。`

  return userPrompt
}

// ── 付費報告 AI 呼叫（只用 Claude Opus，不降級）──
// 客戶付了錢，就必須給最高品質。Claude 沒額度就報錯，不給次級品質。
// 每次呼叫（成功/失敗）都會寫一筆到 ai_cost_log，方便查帳與異常分析。
async function callClaudeOnly(
  systemPrompt: string, userPrompt: string, maxTokens: number, label: string,
  reportId?: string,
): Promise<{ content: string; model: string }> {
  const model = 'claude-opus-4-6'
  const start = Date.now()

  if (getClaudeApiKeys().length === 0) {
    // 缺 key：記一筆 error，讓後台也能看到是環境設定問題
    try {
      await recordAIUsage({
        provider: 'claude',
        model,
        promptTokens: 0,
        completionTokens: 0,
        reportId,
        callStage: label,
        latencyMs: Date.now() - start,
        status: 'error',
        errorMessage: 'missing CLAUDE_API_KEY',
      })
    } catch { /* ai_cost_log 壞了不能擋主流程 */ }
    throw new FatalError(`${label}: 缺少 CLAUDE_API_KEY，付費報告必須使用 Claude Opus。請到 console.anthropic.com 充值。`)
  }

  try {
    const { content, inputTokens, outputTokens } = await claudeStreamingCall(
      systemPrompt, userPrompt, maxTokens, reportId, label,
    )

    // v5.3.19：空內容保護（Bug 4 根因）
    //   Claude streaming 偶爾回空字串（early disconnect / rate limit abort），
    //   但 fetch 成功 → callClaudeOnly 不拋錯 → workflow 拿到 content='' 繼續往下
    //   → Call 1 空內容 merge 進 rawContent → 品質閘門找不到「人生速覽」章節
    //   → hardFail → retry 又空 → needs_human_review（3 份 C 方案 0 bytes 根因）
    //   修：content 太短直接拋 RetryableError 觸發 workflow step 的 3 次 retry
    if (!content || content.trim().length < 100) {
      console.error(`${label}: Claude 返回空內容或過短（${content?.length ?? 0} 字），拋 RetryableError 觸發 step retry`)
      throw new RetryableError(
        `${label}: Claude 返回內容過短（${content?.length ?? 0} 字），視為失敗要求重試`,
      )
    }

    // 成功：寫一筆 success log（含 token 用量與 latency）
    try {
      await recordAIUsage({
        provider: 'claude',
        model,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        reportId,
        callStage: label,
        latencyMs: Date.now() - start,
        status: 'success',
      })
    } catch { /* 記錄失敗不影響主流程 */ }

    console.log(`${label} 完成 (${model}): ${content.length} 字, tokens=${inputTokens}/${outputTokens}`)
    return { content, model }
  } catch (err) {
    // 失敗（429/529/超時/AbortError 等）：寫一筆 error log，
    // 即使 tokens 未知也保留一筆紀錄以便後台統計失敗率
    try {
      const status: 'timeout' | 'error' | 'retry' =
        err instanceof RetryableError
          ? (err.message?.includes('超時') ? 'timeout' : 'retry')
          : 'error'
      await recordAIUsage({
        provider: 'claude',
        model,
        promptTokens: 0,
        completionTokens: 0,
        reportId,
        callStage: label,
        latencyMs: Date.now() - start,
        status,
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      })
    } catch { /* 記錄失敗不影響主流程 */ }
    throw err
  }
}

// ── Step 2a: C 方案 AI 生成 — Call 1（命格名片+你是什麼樣的人+事業+財運） ──
export async function aiGenerateCall1(
  calcResult: CalcResult, birthData: BirthData, question?: string, reportId?: string,
) {
  "use step";
  console.log('Call 1 開始：命格名片+人格畫像+事業+財運')
  await emitProgress({ step: 'AI分析', progress: 20, message: '正在分析命格名片、人格畫像、事業與財運...' })

  const ageGroup = getAgeGroup(birthData.year)
  const clientNeed = question || undefined
  const userPrompt = buildUserPrompt(calcResult.client_data, calcResult.analyses, SYSTEM_GROUPS.call1, birthData)
  const systemPrompt = buildCall1Prompt(ageGroup, clientNeed, birthData.locale, birthData.year)

  const result = await callClaudeOnly(systemPrompt, userPrompt, 128000, 'Call 1', reportId)
  result.content = trimToLastCompleteSentence(cleanAIResponse(result.content))
  console.log(`Call 1 完成：${result.content.length} 字`)
  return result
}
aiGenerateCall1.maxRetries = 3

// ── Step 2b: C 方案 AI 生成 — Call 2（感情+健康+大運+流年） ──
export async function aiGenerateCall2(
  calcResult: CalcResult, birthData: BirthData, call1Content: string, reportId?: string,
) {
  "use step";
  console.log('Call 2 開始：感情+健康+大運+流年')
  await emitProgress({ step: 'AI分析', progress: 40, message: '正在分析感情、健康、大運走勢與流年重點...' })

  const ageGroup = getAgeGroup(birthData.year)
  const call1Summary = extractCall1Summary(call1Content)
  const userPrompt = buildUserPrompt(calcResult.client_data, calcResult.analyses, SYSTEM_GROUPS.call2, birthData)
  const systemPrompt = buildCall2Prompt(ageGroup, call1Summary, birthData.locale, birthData.year)

  const result = await callClaudeOnly(systemPrompt, userPrompt, 128000, 'Call 2', reportId)
  result.content = trimToLastCompleteSentence(cleanAIResponse(result.content))
  console.log(`Call 2 完成：${result.content.length} 字`)
  return result
}
aiGenerateCall2.maxRetries = 3

// ── Step 2c: C 方案 AI 生成 — Call 3（一句話+刻意練習+寫給你的話） ──
export async function aiGenerateCall3(
  calcResult: CalcResult, birthData: BirthData, call1Content: string, call2Content: string,
  isRetry?: boolean, missingParts?: string[], reportId?: string,
) {
  "use step";
  console.log('Call 3 開始：一句話+刻意練習+寫給你的話')
  await emitProgress({ step: 'AI分析', progress: 60, message: '正在生成刻意練習與寫給你的話...' })

  const ageGroup = getAgeGroup(birthData.year)
  const call1and2Summary = extractCall1And2Summary(call1Content, call2Content)
  let userPrompt = buildUserPrompt(calcResult.client_data, calcResult.analyses, SYSTEM_GROUPS.call3, birthData)

  if (isRetry && missingParts?.length) {
    userPrompt += `\n\n【重要提醒——你上次漏掉了以下章節，這次必須全部補上】\n${missingParts.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n不要寫任何前言，直接從章節標題開始。`
  }

  const maxTokens = 128000
  const systemPrompt = buildCall3Prompt(ageGroup, birthData.name, call1and2Summary, birthData.locale, birthData.year)

  const result = await callClaudeOnly(systemPrompt, userPrompt, maxTokens, 'Call 3', reportId)
  result.content = trimToLastCompleteSentence(cleanAIResponse(result.content))
  console.log(`Call 3 完成：${result.content.length} 字`)
  return result
}
aiGenerateCall3.maxRetries = 3

// ── Step 2e: 非 C 方案 AI 生成（單次呼叫） ──
export async function aiGenerateGeneric(
  calcResult: CalcResult, birthData: BirthData, planCode: string,
  systemPrompt: string, topic?: string, question?: string, reportId?: string,
  chumenjiTop?: ChumenjiTopResult | null,
) {
  "use step";
  const userPrompt = buildGenericUserPrompt(birthData, calcResult.client_data, calcResult.analyses, topic, question, undefined, chumenjiTop, planCode)
  const localizedPrompt = localizePrompt(systemPrompt, birthData.locale)

  // 付費報告只用 Claude Opus，不降級（透過 callClaudeOnly 同步記錄成本）
  const { content } = await callClaudeOnly(localizedPrompt, userPrompt, 128000, `${planCode}_main`, reportId)
  const cleaned = trimToLastCompleteSentence(cleanAIResponse(content))
  console.log(`方案 ${planCode} AI 完成 (claude-opus-4-6): ${cleaned.length} 字`)
  return { content: cleaned, model: 'claude-opus-4-6' }
}
aiGenerateGeneric.maxRetries = 2

// ── G15 家族藍圖：載入家庭成員的已完成人生藍圖報告 ──
export interface FamilyMemberReport {
  email: string
  name: string
  reportContent: string
  birthData: BirthData
}

export async function loadFamilyReports(
  memberEmails: string[], memberNames: string[],
): Promise<FamilyMemberReport[]> {
  "use step";
  await emitProgress({ step: '載入資料', progress: 10, message: '正在載入家庭成員的人生藍圖報告...' })

  const supabase = getSupabase()
  const results: FamilyMemberReport[] = []

  for (let i = 0; i < memberEmails.length; i++) {
    const email = memberEmails[i].trim().toLowerCase()
    const { data, error } = await supabase
      .from('paid_reports')
      .select('client_name, report_result, birth_data')
      .eq('customer_email', email)
      .eq('plan_code', 'C')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      throw new FatalError(`找不到 ${email} 的已完成人生藍圖報告`)
    }

    results.push({
      email,
      name: data.client_name || memberNames[i] || '',
      reportContent: typeof data.report_result === 'string'
        ? data.report_result
        : JSON.stringify(data.report_result || ''),
      birthData: data.birth_data as BirthData,
    })
  }

  console.log(`載入 ${results.length} 份家庭成員報告`)
  return results
}
loadFamilyReports.maxRetries = 2

// ── G15 家族藍圖（新版）：用 report ID 直接載入成員報告 ──
export async function loadFamilyReportsByIds(
  reportIds: string[], memberNames: string[],
): Promise<FamilyMemberReport[]> {
  "use step";
  await emitProgress({ step: '載入資料', progress: 10, message: '正在載入家庭成員的人生藍圖報告...' })

  const supabase = getSupabase()
  const results: FamilyMemberReport[] = []

  for (let i = 0; i < reportIds.length; i++) {
    const { data, error } = await supabase
      .from('paid_reports')
      .select('client_name, report_result, birth_data, customer_email')
      .eq('id', reportIds[i])
      .eq('plan_code', 'C')
      .eq('status', 'completed')
      .single()

    if (error || !data) {
      throw new FatalError(`找不到報告 ID: ${reportIds[i]} 的已完成人生藍圖`)
    }

    results.push({
      email: data.customer_email || '',
      name: data.client_name || memberNames[i] || '',
      reportContent: typeof data.report_result === 'string'
        ? data.report_result
        : JSON.stringify(data.report_result || ''),
      birthData: data.birth_data as BirthData,
    })
  }

  console.log(`載入 ${results.length} 份家庭成員報告（by ID）`)
  return results
}
loadFamilyReportsByIds.maxRetries = 2

// ── G15 家族藍圖：從報告中提取互動關鍵數據（不餵原文，避免 AI 重複個人分析）──
function extractKeyDataForFamily(reportContent: string, bd: BirthData): string {
  const lines: string[] = []

  // 基本出生資料（從 birthData 直接取，最可靠）
  if (bd.year && bd.month && bd.day) {
    lines.push(`出生：${bd.year}年${bd.month}月${bd.day}日${bd.hour || '未知'}時`)
  }

  // 從報告中用 regex 提取各系統關鍵數據（每個系統取第一段摘要）
  const systemPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: '八字', pattern: /(?:八字|四柱)[：:]\s*(.+?)(?:\n|$)/i },
    { name: '用神', pattern: /用神[：:]\s*(.+?)(?:\n|$)/i },
    { name: '五行', pattern: /五行[：:]\s*(.+?)(?:\n|$)/i },
    { name: '日主', pattern: /日主[為是]\s*(.+?)(?:\n|[，,。])/i },
    { name: '日柱', pattern: /日柱[：:為是]\s*(.+?)(?:\n|[，,。])/i },
    { name: '紫微命宮', pattern: /命宮[：:主星]*\s*(.+?)(?:\n|[，,。])/i },
    { name: '夫妻宮', pattern: /夫妻宮[：:主星]*\s*(.+?)(?:\n|[，,。])/i },
    { name: '子女宮', pattern: /子女宮[：:主星]*\s*(.+?)(?:\n|[，,。])/i },
    { name: '生肖', pattern: /生肖[：:為是]\s*(.+?)(?:\n|[，,。])/i },
    { name: '人類圖類型', pattern: /(?:人類圖|類型)[：:]\s*(.+?)(?:\n|[，,。])/i },
    { name: '人類圖權威', pattern: /(?:內在權威|權威)[：:]\s*(.+?)(?:\n|[，,。])/i },
    { name: '西洋太陽', pattern: /太陽[星座：:]*\s*(.+?)(?:\n|[，,。])/i },
    { name: '西洋月亮', pattern: /月亮[星座：:]*\s*(.+?)(?:\n|[，,。])/i },
    { name: '生命靈數', pattern: /(?:生命靈數|靈數)[：:為是]\s*(.+?)(?:\n|[，,。])/i },
    { name: '納音', pattern: /納音[：:]\s*(.+?)(?:\n|[，,。])/i },
  ]

  for (const sp of systemPatterns) {
    const match = reportContent.match(sp.pattern)
    if (match?.[1]) {
      // 只取前 80 字，避免過長
      lines.push(`${sp.name}：${match[1].trim().slice(0, 80)}`)
    }
  }

  // 如果 regex 提取結果太少（< 5 項），補充從報告各系統章節取前 2 行
  if (lines.length < 5) {
    const sectionPattern = /【(.+?)】[^\n]*\n([^\n]*\n?[^\n]*)/g
    let sectionMatch
    let extraCount = 0
    while ((sectionMatch = sectionPattern.exec(reportContent)) !== null && extraCount < 8) {
      const sectionName = sectionMatch[1].trim()
      const sectionContent = sectionMatch[2].trim().slice(0, 150)
      if (sectionContent && !lines.some(l => l.includes(sectionName))) {
        lines.push(`${sectionName}：${sectionContent}`)
        extraCount++
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : reportContent.slice(0, 1000)
}

// ── G15 家族藍圖：AI 生成家族互動分析 ──
// v6.0 (2026-05-05) Round 5 接線:Feature Flag 控制 v1 (1-Call 認可版) / v2 (3-Call LLM 共識版)
// - v1 path:沿用既有 1-Call 邏輯、向後相容、不影響真實付費 G15 客戶 (yutingo / kone13852476)
// - v2 path:對齊 c_plan v2 模式、使用 g15_plan_v2.ts 的 buildG15Call1/2/3Prompt
// - 啟用方式:G15_PROMPT_V2_ENABLED=true 全開、或 G15_V2_TEST_REPORTS=<reportId,...> 白名單
// - 對應 R5 strict eval 從 79.3 → 90+ 的真因修復(原本 v6.0 prompt 寫好但沒接線、LLM 看的仍是 v1)
export async function aiGenerateG15(
  familyReports: FamilyMemberReport[], planCode: string, systemPrompt: string, reportId?: string,
) {
  "use step";
  await emitProgress({ step: 'AI分析', progress: 30, message: '正在分析家族成員互動關係...' })

  // ── Feature Flag:判斷走 v1 (認可版) 還是 v2 (LLM 共識版) ──
  const { getG15PromptVersion, buildG15Call1Prompt, buildG15Call2Prompt, buildG15Call3Prompt, extractG15Call1Summary, extractG15Call1And2Summary } = await import('@/prompts/g15_plan_v2')
  const promptVersion = getG15PromptVersion(reportId)
  console.log(`G15 prompt version: ${promptVersion} (reportId=${reportId})`)

  // ── 共用:組 user prompt(成員命理關鍵數據摘要)──
  let baseUserPrompt = `家族藍圖分析 — 共 ${familyReports.length} 位成員\n\n`
  for (let i = 0; i < familyReports.length; i++) {
    const member = familyReports[i]
    const bd = member.birthData
    baseUserPrompt += `=== 成員${i + 1}：${member.name} ===\n`
    baseUserPrompt += `性別：${bd.gender === 'M' ? '男' : '女'}，出生：${bd.year}年${bd.month}月${bd.day}日${bd.hour}時\n`
    const keyData = extractKeyDataForFamily(member.reportContent, bd)
    baseUserPrompt += `命理關鍵數據：\n${keyData}\n\n`
  }

  const locale = familyReports[0]?.birthData?.locale
  const memberCount = familyReports.length

  // ──────────── v2 path:3-Call LLM 共識版 ────────────
  // v5.10.27 hotfix: force v1 fallback,v2 path call3 從未跑通(workflow 卡 call2 後、可能 Vercel timeout)
  // 對應 lesson #073「連 3 輪 accept」、暫關 v2、回 v1 認可版穩定 path
  // 待 debug v2 call3 真因後再啟動(Round 6+ 範圍)
  const FORCE_V1_FALLBACK = true
  if (promptVersion === 'v2' && !FORCE_V1_FALLBACK) {
    console.log(`G15 v2 啟動:3-Call 模式、memberCount=${memberCount}`)

    // Call 1:Hero + 一~四章(命理 60% + 心理 40%、~6000-10500 字)
    await emitProgress({ step: 'AI分析', progress: 30, message: 'G15 Call 1:能量全貌 + 互動關係 + 結構動力 + 跨代慣性 + 角色溝通...' })
    const call1Prompt = buildG15Call1Prompt(memberCount, locale)
    const call1UserPrompt = baseUserPrompt + `\n請依本 Call 範圍輸出章節 0-4(Hero + 一~四章)、不要寫前言、直接從 "## 0." 開始。`
    const call1Result = await callClaudeOnly(call1Prompt, call1UserPrompt, 128000, 'G15_v2_call1', reportId)
    const call1Content = trimToLastCompleteSentence(cleanAIResponse(call1Result.content))
    console.log(`G15 v2 Call 1 完成:${call1Content.length} 字`)

    // Call 2:五~九章(時間軸 + 財務 + 健康 + 風水 + 教育、~6000-10500 字)
    await emitProgress({ step: 'AI分析', progress: 50, message: 'G15 Call 2:時間軸 + 財務命脈 + 身心健康 + 環境風水 + 教育傳承...' })
    const call1Summary = extractG15Call1Summary(call1Content)
    const call2Prompt = buildG15Call2Prompt(memberCount, call1Summary, locale)
    const call2UserPrompt = baseUserPrompt + `\n請依本 Call 範圍輸出章節 5-9(五~九章)、不要寫前言、直接從 "## 五、" 開始。`
    const call2Result = await callClaudeOnly(call2Prompt, call2UserPrompt, 128000, 'G15_v2_call2', reportId)
    const call2Content = trimToLastCompleteSentence(cleanAIResponse(call2Result.content))
    console.log(`G15 v2 Call 2 完成:${call2Content.length} 字`)

    // Call 3:十~十七章 + 寫給 + 法務免責(~5500-10000 字)
    await emitProgress({ step: 'AI分析', progress: 70, message: 'G15 Call 3:好的地方 + 注意 + 改善 + 刻意練習 + 故事 + 流年 + 行動 + 寫給...' })
    const call1And2Summary = extractG15Call1And2Summary(call1Content, call2Content)
    const call3Prompt = buildG15Call3Prompt(memberCount, extractG15Call1Summary(call1Content), extractG15Call1Summary(call2Content), locale)
    const call3UserPrompt = baseUserPrompt + `\n請依本 Call 範圍輸出章節 10-17 + 寫給 + 法務免責、不要寫前言、直接從 "## 十、" 開始。\n\n【Call 1 + 2 完整摘要供延續】\n${call1And2Summary.slice(0, 4000)}`
    const call3Result = await callClaudeOnly(call3Prompt, call3UserPrompt, 128000, 'G15_v2_call3', reportId)
    const call3Content = trimToLastCompleteSentence(cleanAIResponse(call3Result.content))
    console.log(`G15 v2 Call 3 完成:${call3Content.length} 字`)

    // 整合三 Call 為最終報告
    const finalContent = `${call1Content}\n\n${call2Content}\n\n${call3Content}`
    console.log(`G15 v2 全 3 Call 完成:總長 ${finalContent.length} 字 (Call1=${call1Content.length} + Call2=${call2Content.length} + Call3=${call3Content.length})`)
    return { content: finalContent, model: 'claude-opus-4-6' }
  }

  // ──────────── v1 path:1-Call 認可版(向後相容、預設路徑)────────────
  let userPrompt = baseUserPrompt
  userPrompt += `\n請根據以上所有成員的命理關鍵數據，撰寫完整的家族互動分析報告。
重要提醒：
1. 你收到的是每位成員的關鍵命理數據摘要，不是完整報告。不要試圖重寫個人命格分析。
2. 所有分析必須是成員之間的互動比較，不是個人特質描述。例如：「A的日主甲木與B的日主庚金形成甲庚沖」，而不是「A是甲木，性格正直」。
3. 著重分析成員之間的能量互補或衝突、相處模式、溝通建議。
4. 每個論點都必須引用具體的命理數據來支撐（如日柱、命宮主星、生肖關係等）。`

  const localizedPrompt = localizePrompt(systemPrompt, locale)

  const { content } = await callClaudeOnly(localizedPrompt, userPrompt, 128000, 'G15_main', reportId)
  const cleaned = trimToLastCompleteSentence(cleanAIResponse(content))
  console.log(`G15 v1 家族藍圖 AI 完成: ${cleaned.length} 字`)
  return { content: cleaned, model: 'claude-opus-4-6' }
}
aiGenerateG15.maxRetries = 2

// ── R 方案專用：命理事實計算助手（硬編碼查表，不靠 AI） ──
// 從八字字串（例「甲戌 丙子 丙申 乙未」或「甲戌丙子丙申乙未」）抽取年支、日干、日支
function parseBazi(bazi: string): { yearGan: string; yearZhi: string; dayGan: string; dayZhi: string } | null {
  if (!bazi) return null
  const clean = bazi.replace(/\s+/g, '')
  if (clean.length < 8) return null
  return {
    yearGan: clean[0], yearZhi: clean[1],
    dayGan: clean[4], dayZhi: clean[5],
  }
}

// 地支→生肖
const ZHI_TO_ZODIAC: Record<string, string> = {
  子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龍', 巳: '蛇',
  午: '馬', 未: '羊', 申: '猴', 酉: '雞', 戌: '狗', 亥: '豬',
}

// 地支合沖刑害查表
function dizhiRelation(a: string, b: string): string[] {
  const rels: string[] = []
  const pair = [a, b].sort().join('')
  const liuhe: Record<string, string> = {
    '丑子': '六合', '亥寅': '六合', '卯戌': '六合',
    '酉辰': '六合', '巳申': '六合', '午未': '六合',
  }
  const liuchong: Record<string, string> = {
    '午子': '六沖', '丑未': '六沖', '申寅': '六沖',
    '卯酉': '六沖', '戌辰': '六沖', '亥巳': '六沖',
  }
  const liuhai: Record<string, string> = {
    '子未': '六害', '丑午': '六害', '巳寅': '六害',
    '卯辰': '六害', '申亥': '六害', '戌酉': '六害',
  }
  if (liuhe[pair]) rels.push(liuhe[pair])
  if (liuchong[pair]) rels.push(liuchong[pair])
  if (liuhai[pair]) rels.push(liuhai[pair])
  const sanhe: Record<string, string[]> = {
    水: ['申', '子', '辰'], 金: ['巳', '酉', '丑'],
    火: ['寅', '午', '戌'], 木: ['亥', '卯', '未'],
  }
  for (const [type, set] of Object.entries(sanhe)) {
    if (set.includes(a) && set.includes(b) && a !== b) {
      rels.push(`三合${type}局半合`)
    }
  }
  if (a === b && ['辰', '午', '酉', '亥'].includes(a)) rels.push('自刑')
  if ((a === '子' && b === '卯') || (a === '卯' && b === '子')) rels.push('相刑（子卯無禮）')
  if (rels.length === 0) return ['中性（無合無沖無刑無害）']
  return rels
}

// 天干合沖剋查表
function tianganRelation(a: string, b: string): string[] {
  const rels: string[] = []
  const p = [a, b].sort().join('')
  const wuhe: Record<string, string> = {
    '己甲': '甲己合化土', '乙庚': '乙庚合化金',
    '丙辛': '丙辛合化水', '丁壬': '丁壬合化木', '戊癸': '戊癸合化火',
  }
  if (wuhe[p]) rels.push(wuhe[p])
  const chong: Record<string, string> = {
    '甲庚': '甲庚沖', '乙辛': '乙辛沖',
    '丙壬': '丙壬沖', '丁癸': '丁癸沖',
  }
  if (chong[p]) rels.push(chong[p])
  if (rels.length === 0) {
    const wuxing: Record<string, string> = {
      甲: '木', 乙: '木', 丙: '火', 丁: '火',
      戊: '土', 己: '土', 庚: '金', 辛: '金',
      壬: '水', 癸: '水',
    }
    const xa = wuxing[a], xb = wuxing[b]
    const shengKe: Record<string, Record<string, string>> = {
      木: { 火: '生', 土: '剋', 金: '被剋', 水: '被生', 木: '同類' },
      火: { 土: '生', 金: '剋', 水: '被剋', 木: '被生', 火: '同類' },
      土: { 金: '生', 水: '剋', 木: '被剋', 火: '被生', 土: '同類' },
      金: { 水: '生', 木: '剋', 火: '被剋', 土: '被生', 金: '同類' },
      水: { 木: '生', 火: '剋', 土: '被剋', 金: '被生', 水: '同類' },
    }
    const rel = shengKe[xa]?.[xb]
    if (rel) rels.push(`${a}(${xa})${rel}${b}(${xb})`)
  }
  return rels
}

// 十神關係（日主看對方天干）
function shishen(myDayGan: string, otherGan: string): string {
  const wuxing: Record<string, string> = {
    甲: '木', 乙: '木', 丙: '火', 丁: '火',
    戊: '土', 己: '土', 庚: '金', 辛: '金',
    壬: '水', 癸: '水',
  }
  const yinYang: Record<string, boolean> = {
    甲: true, 丙: true, 戊: true, 庚: true, 壬: true,
    乙: false, 丁: false, 己: false, 辛: false, 癸: false,
  }
  const myX = wuxing[myDayGan], oX = wuxing[otherGan]
  const sameYY = yinYang[myDayGan] === yinYang[otherGan]
  if (!myX || !oX) return '未知'
  if (myX === oX) return sameYY ? '比肩' : '劫財'
  const rel = ({
    木: { 火: 'sheng', 土: 'ke', 金: 'keFromMe', 水: 'beSheng' },
    火: { 土: 'sheng', 金: 'ke', 水: 'keFromMe', 木: 'beSheng' },
    土: { 金: 'sheng', 水: 'ke', 木: 'keFromMe', 火: 'beSheng' },
    金: { 水: 'sheng', 木: 'ke', 火: 'keFromMe', 土: 'beSheng' },
    水: { 木: 'sheng', 火: 'ke', 土: 'keFromMe', 金: 'beSheng' },
  } as Record<string, Record<string, string>>)[myX]?.[oX]
  if (rel === 'sheng') return sameYY ? '食神' : '傷官'
  if (rel === 'ke') return sameYY ? '偏財' : '正財'
  if (rel === 'keFromMe') return sameYY ? '七殺' : '正官'
  if (rel === 'beSheng') return sameYY ? '偏印' : '正印'
  return '未知'
}

// ── R 方案「合否？」：為每位成員分別排盤，合併後 AI 生成合盤分析 ──
export async function aiGenerateR(
  memberResults: CalcResult[], birthData: BirthData, systemPrompt: string, reportId?: string,
) {
  "use step";
  await emitProgress({ step: 'AI分析', progress: 40, message: '正在分析雙方命格合盤...' })

  const members = (birthData.members || []) as Array<{
    name?: string; gender?: string; year?: number; month?: number; day?: number; hour?: number
  }>
  const relationDescription = (birthData.relation_description || birthData.relation || '') as string
  const customerNote = (birthData.customer_note || '') as string

  let userPrompt = `合否？關係合盤分析 — 共 ${members.length} 位成員\n\n`

  // 如果有關係描述，先放在最前面
  if (relationDescription) {
    userPrompt += `【關係描述】${relationDescription}\n\n`
  }

  // 客戶備注/想了解的問題
  if (customerNote) {
    userPrompt += `【客戶想了解的問題】${customerNote}\n\n`
  }

  // ── 強制注入「合盤事實表」— AI 絕對不可違反（Windada/lunar-python 精算）──
  const parsedList = memberResults.map((calc, i) => {
    const bazi = (calc.client_data?.bazi as string) || ''
    const p = parseBazi(bazi)
    return {
      name: members[i]?.name || `成員${i + 1}`,
      bazi,
      parsed: p,
      zodiac: p ? ZHI_TO_ZODIAC[p.yearZhi] || '未知' : '未知',
    }
  })
  if (parsedList.length >= 2 && parsedList[0].parsed && parsedList[1].parsed) {
    const A = parsedList[0], B = parsedList[1]
    const pa = A.parsed!, pb = B.parsed!
    userPrompt += `\n════════════════════════════════════════════\n`
    userPrompt += `【合盤事實表（違反即不合格，所有論述必須以此為準）】\n`
    userPrompt += `════════════════════════════════════════════\n`
    userPrompt += `${A.name}：八字「${A.bazi}」\n`
    userPrompt += `  → 日主：${pa.dayGan}  日支：${pa.dayZhi}\n`
    userPrompt += `  → 年支：${pa.yearZhi}  生肖：${A.zodiac}\n`
    userPrompt += `${B.name}：八字「${B.bazi}」\n`
    userPrompt += `  → 日主：${pb.dayGan}  日支：${pb.dayZhi}\n`
    userPrompt += `  → 年支：${pb.yearZhi}  生肖：${B.zodiac}\n\n`

    userPrompt += `【雙方年支生肖關係】${pa.yearZhi}(${A.zodiac}) × ${pb.yearZhi}(${B.zodiac}) = ${dizhiRelation(pa.yearZhi, pb.yearZhi).join('、')}\n`
    userPrompt += `【雙方日支關係】${pa.dayZhi} × ${pb.dayZhi} = ${dizhiRelation(pa.dayZhi, pb.dayZhi).join('、')}\n`
    userPrompt += `【雙方日干關係】${pa.dayGan} × ${pb.dayGan} = ${tianganRelation(pa.dayGan, pb.dayGan).join('、')}\n`
    userPrompt += `【十神（以${A.name}為我）】${pa.dayGan}見${pb.dayGan} = ${shishen(pa.dayGan, pb.dayGan)}\n`
    userPrompt += `【十神（以${B.name}為我）】${pb.dayGan}見${pa.dayGan} = ${shishen(pb.dayGan, pa.dayGan)}\n`
    userPrompt += `\n※ 所有事實來自 lunar-python 精算，禁止 AI 自行推測生肖、日主、十神、合沖刑害。\n`
    userPrompt += `※ 若你寫的論述與此事實表衝突，你必須立刻修正。\n`
    userPrompt += `════════════════════════════════════════════\n\n`
  }

  // 逐一列出每位成員的排盤數據
  for (let i = 0; i < members.length; i++) {
    const member = members[i]
    const calc = memberResults[i]
    if (!calc) continue

    userPrompt += `=== 成員${i + 1}：${member.name || ''} ===\n`
    userPrompt += `性別：${member.gender === 'M' ? '男' : '女'}，出生：${member.year}年${member.month}月${member.day}日${member.hour}時\n`

    const cd = calc.client_data || {}
    userPrompt += `八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}\n`
    userPrompt += `農曆：${cd.lunar_date || ''} | 納音：${cd.nayin || ''} | 命宮：${cd.ming_gong || ''}\n`

    // L3 P0 Bug 4 修復：R 方案 userPrompt 預篩 8 套最相關系統（關係合盤）
    // 不餵全 14 套以免稀釋焦點（奇門/風水/塔羅/生物節律對關係合盤貢獻低）
    const R_RELEVANT_SYSTEMS = [
      '八字四柱', '紫微斗數', '西洋占星', '吠陀占星',
      '人類圖', '數字能量學', '姓名學', '生肖運勢',
    ]
    const analyses = (calc.analyses || []).filter((a: { system?: string }) =>
      a.system && R_RELEVANT_SYSTEMS.includes(a.system),
    )
    userPrompt += `${analyses.length} 套關係相關系統排盤數據（八字/紫微/西洋占星/吠陀占星/人類圖/數字能量學/姓名學/生肖）：\n`
    for (const a of analyses.slice(0, 8)) {
      userPrompt += `\n【${a.system}】`
      if (a.summary) userPrompt += `\n摘要：${a.summary}`
      if (a.good_points?.length) {
        userPrompt += `\n好的地方：`
        for (const g of a.good_points) userPrompt += `\n- ${g}`
      }
      if (a.bad_points?.length) {
        userPrompt += `\n需要注意：`
        for (const b of a.bad_points) userPrompt += `\n- ${b}`
      }
      if (a.tables?.length) {
        for (const t of a.tables) {
          userPrompt += `\n表格「${t.title}」：\n`
          if (t.headers) userPrompt += `| ${t.headers.join(' | ')} |\n`
          if (t.rows) {
            for (const row of t.rows) userPrompt += `| ${row.join(' | ')} |\n`
          }
        }
      }
      if (a.details) {
        const detail = typeof a.details === 'string' ? a.details : JSON.stringify(a.details)
        userPrompt += `\n詳細排盤：\n${detail}\n`
      }
      userPrompt += '\n'
    }
    userPrompt += '\n'
  }

  userPrompt += `\n請根據以上所有成員的排盤數據，撰寫完整的關係合盤分析報告。
重要提醒：
1. 所有分析必須基於排盤數據中的具體結果，不得編造。
2. 【最高優先】合盤事實表（生肖、日主、合沖刑害、十神）為絕對事實，違反即不合格。
3. 每個分析論點都必須引用至少一個系統的具體合盤結果。
4. 禁止任何評分或分數——關係不該有分數，用文字描述而非數字。
5. 現在是2026年丙午年。
6. 好的地方和需要注意的地方都必須涉及雙方互動，不是個人特質描述。
7. 先給明確結論（合/不合/合但有致命雷區），再展開分析。
8. 寫完每章後，請自我檢查：「我剛寫的生肖是否與事實表一致？合沖刑害是否與事實表一致？十神是否與事實表一致？」如有不符立刻修正。`

  const localizedPrompt = localizePrompt(systemPrompt, birthData.locale)

  const { content } = await callClaudeOnly(localizedPrompt, userPrompt, 128000, 'R_main', reportId)
  const cleaned = trimToLastCompleteSentence(cleanAIResponse(content))
  console.log(`R 方案合否 AI 完成: ${cleaned.length} 字`)
  return { content: cleaned, model: 'claude-opus-4-6' }
}
aiGenerateR.maxRetries = 2

// ── Step 3: 生成 PDF ──
export async function generatePDF(
  reportId: string, planCode: string, birthData: BirthData,
  reportContent: string, analyses: Array<{ system: string; score: number }>,
) {
  "use step";
  // E1/E2 出門訣也生成 PDF（客戶付費產品應有 PDF 下載）

  await emitProgress({ step: '生成PDF', progress: 80, message: '正在生成精美報告 PDF...' })

  // v5.7.13:改 PLAN_NAMES from lib/plan-names(IA round 7 P1、廢棄 Y 砍掉)
  const planName = PLAN_NAMES[planCode] || '命理分析報告'

  // PDF 專用預處理：清除殘留橫線 + 分數清理 + 轉換 Markdown 格式為 PDF 友好格式
  const pdfContent = reportContent
    .replace(/^---+$/gm, '')           // 標準 markdown 橫線
    .replace(/^___+$/gm, '')           // 底線型橫線
    .replace(/^\*\*\*+$/gm, '')        // 星號型橫線
    .replace(/^[\s]*[-─—═]+[\s]*$/gm, '') // 全形橫線/裝飾線
    // ── 分數殘留清理 ──
    // 移除「N/100」格式的評分（如「85/100」「90/100」），但不影響「4/9」等章節編號
    .replace(/\d{1,3}\/100/g, '')
    // 移除評分相關文字（綜合評分、整體評分、總評分等）
    .replace(/[（(]?\s*(?:綜合|整體|總|系統|本系統)?評分[：:]\s*\d*\s*[）)]?/g, '')
    .replace(/(?:綜合|整體|總)評分\s*(?:為|是|：|:)?\s*\d*/g, '')
    // 移除獨立的「評分」行
    .replace(/^\s*評分\s*[:：]?\s*\d*\s*$/gm, '')
    // 清理 AI 進度標記（如「4/9」「5/9」等章節編號）
    .replace(/(\d+)\/(\d+)\s*(?=\n|$|「)/gm, '')
    // 修正流年被截斷（「流年丙午026」→「流年（2026」）
    .replace(/流年丙午(\d{3})/g, '流年（20$1')
    // 清理空的「→ 具體應對：」標題
    .replace(/→\s*具體應對[：:]\s*(?=\n\n|\n[0-9]|\n[一二三四五])/g, '')
    // 引言框：> 開頭 → 去掉 > 前綴，Python ReportLab 會處理為引用段落
    .replace(/^>\s*(.+)$/gm, '「$1」')
    // Emoji → 文字替代（PDF 字體無法渲染 emoji，會變成 ◆◆）
    .replace(/🟢/g, '【好】')
    .replace(/🟡/g, '【注意】')
    .replace(/🔵/g, '【改善】')
    .replace(/📌/g, '【重點】')
    .replace(/✅/g, '【✓】')
    .replace(/⚠️/g, '【!】')
    .replace(/🔧/g, '【建議】')
    .replace(/🎯/g, '【核心】')
    .replace(/💡/g, '【提示】')
    .replace(/❤️/g, '【愛】')
    .replace(/⭐/g, '【星】')
    .replace(/🔑/g, '【關鍵】')
    // 清理其他可能的 emoji（BMP 以外的 Unicode 字元會在 PDF 中變成方塊）
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')   // 表情符號
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')   // 雜項符號
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')   // 交通符號
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')   // 補充符號
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')   // 棋牌符號
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')   // 擴展符號
    .replace(/[\u{2600}-\u{26FF}]/gu, '')     // 雜項符號（太陽、雨傘等）
    .replace(/[\u{2702}-\u{27B0}]/gu, '')     // 裝飾符號
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')     // 變體選擇器
    .replace(/\u{200D}/gu, '')                 // ZWJ 連接符
    .replace(/\n{3,}/g, '\n\n')        // 清理後的連續空行

  // PDF 生成超時控制：90 秒
  const pdfController = new AbortController()
  const pdfTimeout = setTimeout(() => pdfController.abort(), 90000)
  const pdfRes = await fetch(`${PYTHON_API}/api/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: pdfController.signal,
    body: JSON.stringify({
      report_id: reportId,
      plan_code: planCode,
      client_name: birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports'
        ? ((birthData.member_names as string[] | undefined)?.filter(Boolean).join('、') || 'Unknown')
        : birthData.plan_type === 'family'
        ? ((birthData.members as Array<{ name?: string }> | undefined)?.map(m => m.name).filter(Boolean).join('、') || 'Unknown')
        : (birthData.name || 'Unknown'),
      plan_name: planName,
      ai_content: pdfContent,
      locale: birthData.locale || 'zh-TW',
      analyses_summary: analyses,
      // PDF 版面增強：品牌頁首頁尾 + 目錄頁 + 緊湊封面
      show_header_footer: true,  // 每頁顯示品牌 logo + 頁碼 + 客戶名
      show_toc_page: true,       // 第 2 頁加目錄
      cover_style: 'compact',    // 封面不要太多空白
    }),
  })

  clearTimeout(pdfTimeout)

  if (!pdfRes.ok) {
    console.error('PDF 生成失敗:', await pdfRes.text())
    return null // PDF 失敗不阻塞整體流程
  }

  const pdfData = await pdfRes.json()
  if (!pdfData.pdf_base64) return null

  // 上傳到 Supabase Storage
  // v5.3.32：加 60 秒 timeout 保護，避免 storage 卡住讓整個 workflow 停滯
  const supabase = getSupabase()
  const pdfBytes = Buffer.from(pdfData.pdf_base64, 'base64')
  const storagePath = `${reportId}/report.pdf`

  const uploadPromise = supabase.storage
    .from('reports')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
  const uploadTimeout = new Promise<{ error: Error }>((resolve) =>
    setTimeout(() => resolve({ error: new Error('Supabase Storage 上傳超時（60秒）') }), 60000),
  )

  let uploadErr: unknown = null
  try {
    const result = await Promise.race([uploadPromise, uploadTimeout])
    uploadErr = (result as { error?: unknown }).error
  } catch (e) {
    uploadErr = e
  }

  if (uploadErr) {
    console.error('Supabase Storage 上傳失敗:', uploadErr)
    return null  // PDF 失敗不阻塞整體流程（呼叫端有 try-catch）
  }

  const { data: urlData } = supabase.storage.from('reports').getPublicUrl(storagePath)
  console.log(`✅ PDF 上傳完成: ${urlData.publicUrl} (${pdfData.file_size_kb}KB)`)
  return urlData.publicUrl
}
generatePDF.maxRetries = 2

// ── Step 3.5: 自動品質閘門 ──
// 檢查報告完整性：15 系統覆蓋、禁止字眼、句子截斷
export async function qualityGate(
  reportContent: string, planCode: string, systemsCount: number,
  chumenjiTop?: ChumenjiTopResult | null,
  birthData?: BirthData,
) {
  "use step";
  await emitProgress({ step: '品質檢查', progress: 70, message: '正在執行品質閘門檢查...' })

  const warnings: string[] = []

  // 1. 系統數量檢查（C 方案需 15 套）
  if (planCode === 'C' && systemsCount < 15) {
    warnings.push(`排盤系統不足: 期望 15 套，實際 ${systemsCount} 套`)
  }

  // v5.3.26：C 方案結構性檢查放寬（修 v5.3.23 的誤判 bug）
  //   v5.3.23 用「## 章節數 >= 5」→ 但 Claude 認可版用 ### 為主（## 只 1-3 個）
  //   → 重新生成後又 fail「章節數過少」→ 老闆又燒 $5
  //   修：計算 ## + ### 總數，降門檻到 8（認可版通常 30+ 個 ###）
  if (planCode === 'C') {
    const h2Matches = reportContent.match(/^## [^\n]+/gm) || []
    const h3Matches = reportContent.match(/^### [^\n]+/gm) || []
    const totalHeadings = h2Matches.length + h3Matches.length
    if (totalHeadings < 8) {
      warnings.push(`[軟性] C 方案章節數偏少: ## ${h2Matches.length} + ### ${h3Matches.length} = ${totalHeadings}（期望 >= 8）`)
    }

    // 結尾完整性：最後 500 字必須有結尾符號（軟性不擋）
    const tail = reportContent.slice(-500).trim()
    if (tail.length > 0 && !/[。！？」\]]\s*$/.test(tail)) {
      warnings.push(`[軟性] C 方案結尾可能被截斷: "${tail.slice(-80)}"`)
    }
  }

  // 2c. E1 事件擇吉必要章節檢查（Top3 加乘時機）
  // v5.6 P0(2026-04-27 最終地基修): C 方案章節必含 hardFailure
  // 證據: 3 LLM(Claude+Codex+Gemini)+ 3 sub-agent 對齊、b8e97a13 殘缺 10/100 fail
  // 對齊 D/G15/R/E1/E2/E3 既有 cRequired pattern, lessons #054/#055
  if (planCode === 'C') {
    // v5.6.3 (2026-04-28) ROI #2 round 2: cRequired 從 9 條 → 13 條(9 hard + 4 軟)
    // IA round 1 抓出 P0:全當 hardFailure 會擴大 retry 攻擊面 +44%、最壞 $14 燒
    // 修法:新加 4 條集大成檢查走 [軟性]、由 5 LLM QA 兜底品質、結構檢查保留 9 老條當地基
    const cRequired = [
      { pattern: /人生速覽|你的人生速覽/, name: '人生速覽', soft: false },
      { pattern: /命格名片|命格.*封號|核心身份/, name: '命格名片', soft: false },
      // v5.7.47:加父母版變體(toddler/child voice=parent 寫「您的孩子是什麼樣的人」)
      { pattern: /你是什麼樣的人|您的孩子是什麼樣的人|你的孩子是什麼樣的人|寶寶是什麼樣的人|本我|核心人格/, name: '你是什麼樣的人', soft: false },
      { pattern: /事業.*天賦|天賦.*事業|事業分析/, name: '事業與天賦', soft: false },
      { pattern: /財運分析|賺錢模式|財運/, name: '財運分析', soft: false },
      { pattern: /感情.*人際|感情分析/, name: '感情與人際', soft: false },
      { pattern: /健康提醒|健康.*建議|健康分析/, name: '健康提醒', soft: false },
      { pattern: /大運.*走勢|流年.*重點|2026.*流年|大運/, name: '運勢章節', soft: false },
      // v5.6.3 新增 4 條集大成檢查 (對齊 c_plan_v2.ts 17 章規格)、走軟性避免 retry 連鎖
      { pattern: /十五系統.*交叉.*驗證|交叉.*矩陣|十五系統.*矩陣|系統.*共識/, name: '十五系統交叉驗證矩陣', soft: true },
      { pattern: /TOP\s*5\s*優勢|前\s*5.*優勢|五大.*優勢/, name: 'TOP 5 優勢', soft: true },
      { pattern: /TOP\s*5\s*風險|前\s*5.*風險|五大.*風險|TOP\s*5\s*挑戰/, name: 'TOP 5 風險', soft: true },
      { pattern: /三階段.*行動|行動.*計畫|短期.*中期.*長期|分階段.*行動/, name: '三階段行動計畫', soft: true },
      { pattern: /寫給.*的話|寫給.*的一封信|刻意練習|給.*的信/, name: '收尾章節', soft: false },
    ]
    for (const sec of cRequired) {
      if (!sec.pattern.test(reportContent)) {
        const prefix = sec.soft ? '[軟性] ' : ''
        warnings.push(`${prefix}人生藍圖缺少必要章節: ${sec.name}`)
      }
    }

    // v5.7.39 年齡段禁詞掃描(對應 9 份全球研究共識、infant 不寫戀愛 / elder 不寫壽命預測)
    if (birthData?.year) {
      const stage = getAgeGroup(birthData.year)
      const forbidden = FORBIDDEN_WORDS_BY_STAGE[stage] || []
      for (const word of forbidden) {
        if (reportContent.includes(word)) {
          warnings.push(`[軟性][年齡段禁詞] ${stage} 段違反禁詞「${word}」(對應 toddler/elder 倫理鐵律、9 國研究共識)`)
        }
      }
    }

    // v5.7.55 廢話檢測 7 黑名單(細分 #7 報告語氣 P0、ROI 高)
    // 證據:LLM evals 連續標「以下我們」「接下來」「現在」廢話開頭、共識報告語氣鐵律最大缺口
    const FORBIDDEN_PHRASES_BLACKLIST: { regex: RegExp; name: string }[] = [
      { regex: /(?:^|\n)\s*接下來(?:我們)?(?:將|會|要)?[來去]?(?:看|分析|了解|介紹|談)/g, name: '廢話開頭「接下來」' },
      { regex: /(?:^|\n)\s*以下(?:就)?(?:是|為|讓我們)/g, name: '廢話開頭「以下是/讓我們」' },
      { regex: /(?:^|\n)\s*現在(?:我們)?(?:就)?[來去]?(?:看|分析|了解|談)/g, name: '廢話開頭「現在我們」' },
      { regex: /(?:^|\n)\s*在這個章節(?:中|裡)/g, name: '廢話開頭「在這個章節」' },
      { regex: /(?:^|\n)\s*在本章中?/g, name: '廢話開頭「在本章中」' },
      { regex: /(?:^|\n)\s*上一章(?:看到|提到|談到)/g, name: '廢話開頭「上一章看到」' },
      { regex: /(?:^|\n)\s*讓我們(?:來)?(?:看|分析|了解)/g, name: '廢話開頭「讓我們來看」' },
    ]
    for (const { regex, name } of FORBIDDEN_PHRASES_BLACKLIST) {
      const matches = reportContent.match(regex)
      if (matches && matches.length > 0) {
        warnings.push(`[軟性][廢話檢測] ${name}:命中 ${matches.length} 次(細分 #7 報告語氣 P0)`)
      }
    }

    // ── v5.10.x R1 護欄 grep(2026-05-05、c_plan_v2.ts L173-298 軟約束變硬擋)──
    // 對應 c_plan_v2.ts C_PLAN_CONTENT_GUARDRAILS_R1 6 條護欄、quality gate 把 LLM 軟約束變硬擋
    // P0 違規 → 直接走 warnings(不加 [軟性] 前綴)、會被 criticalWarnings filter 收成 hardFailures、觸發 fail
    //   → MAX_QUALITY_RETRIES=0 下 = needs_human_review、不會 retry 燒錢(對應 lesson #058)
    // P1/P2 違規 → 加 [軟性] 前綴、只 log、不擋
    // 注意:命格 5 件套(R1 第 1 條)= 結構檢查、不在禁詞範圍、由既有 cRequired「命格名片」+「四柱八字」(L2634-2637)兜底
    const R1_FORBIDDEN_PATTERNS: { name: string; patterns: RegExp[]; severity: 'P0' | 'P1' | 'P2'; desc: string }[] = [
      // 規則 2:禁廢話開頭(段落內部開頭、章節間 bridge 例外)
      // 涵蓋 R1 完整 19 個禁詞中、v5.7.55 已覆蓋之外的 14 個缺口、避免規則重複
      // 章節間 bridge 例外:不擋「上一章看完」「下一章我們」(對應 L757-775 hard rule、屬 callback/preview 結構)
      // grep 策略:只擋「行首縮排空白 +(章節標題層級非 ##/###)+ 禁詞 + 鋪墊動詞」、避開純 bridge sentence
      {
        name: '禁廢話開頭(R1 第 2 條完整 19 詞缺口補)',
        patterns: [
          // 「下面」「下面是」「下面我們」+ 鋪墊動詞
          /(?:^|\n)(?!#{1,6}\s)\s*下面(?:是|我們|就)?[來去]?(?:看|分析|了解|介紹|談|是)/g,
          // 「首先」「其次」「再次」「最後」+ 鋪墊動詞或逗號(段落內部開場、非條列項)
          // 避開 numbered list「1. 首先」「* 首先」這類條列、只擋段落起頭散文式
          /(?:^|\n)(?![*\-\d]\s|#{1,6}\s)\s*(?:首先|其次|再次|最後)[，,、]?(?:我們)?(?:來|要|會|將)?(?:看|分析|了解|介紹|談)/g,
          // 「總之」「綜上所述」「綜合來看」「總的來說」「總結一下」段落起頭
          /(?:^|\n)(?!#{1,6}\s)\s*(?:總之|綜上所述|綜合來看|總的來說|總結一下)[，,、]?/g,
          // 「上面提到」「前面說過」段落起頭(非 bridge sentence、bridge 用「上一章」)
          /(?:^|\n)(?!#{1,6}\s)\s*(?:上面提到|前面說過)/g,
          // 「以下我們來」(R1 第 2 條 enum、v5.7.55「以下是/讓我們」未涵蓋)
          /(?:^|\n)(?!#{1,6}\s)\s*以下我們來(?:看|分析|了解|介紹|談)/g,
        ],
        severity: 'P0',
        desc: '段落內部廢話開頭(下面/首先/總之/綜上所述/上面提到 等 14 詞、c_plan_v2.ts R1 第 2 條 P0)',
      },
      // 規則 3:禁 Meta 標籤殘留(章節標題層級 ## / ### 含 meta 標籤)
      // 例外:markdown 引言塊「> 📚 命理深析(PDF 專屬深度版)」屬 P0-12 規範允許、行首「> 」開頭不擋
      {
        name: '禁 Meta 標籤(R1 第 3 條)',
        patterns: [
          // 行首「## 」或「### 」(非「> 」引言塊)+ 標題含 meta 標籤
          // 用 (?<!>\s) 排除「> 📚 命理深析(PDF 專屬深度版)」這類 blockquote 例外
          /(?:^|\n)#{1,6}\s+[^\n]*(?:🪞 你看得懂的版本|🪞📚 PDF 專屬深度版|PDF 專屬深度版|PDF 專屬|網頁版|網頁專屬|進階版|精簡版|速覽版|完整版|深度版|擴充版|網頁短版|網頁版本)/g,
        ],
        severity: 'P0',
        desc: 'Meta 標籤出現在 ## / ### 章節標題層級(c_plan_v2.ts R1 第 3 條 P0、引言塊 > 例外)',
      },
      // 規則 4:禁相對時間單獨用(無絕對年月配對)
      // P1 級、不擋只警告(c_plan_v2.ts 標 P1)、避免 retry 燒錢
      {
        name: '禁相對時間單獨用(R1 第 4 條)',
        patterns: [
          // 「再半年」「再過幾個月」「再過幾年」「不久前」「不久後」「未來幾年」「過去幾年」「前陣子」「最近這段」
          // 後方 200 字內無絕對年月「2[0-9]{3}年」「[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]年」配對 = 失格
          // 用 negative lookahead、限制 200 char window 內必有絕對年月
          /(?:再半年|再過幾個月|再過幾年|不久前|不久後|未來幾年|過去幾年|前陣子|最近這段)(?![^。\n]{0,200}(?:2[0-9]{3}\s*年|[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*年|立春|清明|大運|流年[甲乙丙丁戊己庚辛壬癸]))/g,
        ],
        severity: 'P1',
        desc: '相對時間單獨用、無絕對年月配對(c_plan_v2.ts R1 第 4 條 P1)',
      },
      // 規則 6a:雙介詞 / 雙助詞錯用(P2、不擋只警告)
      {
        name: '雙介詞錯用(R1 第 6a 條)',
        patterns: [
          /在家裡中|在心裡上|在工作中裡|在學校中裡|在家庭中裡/g,
        ],
        severity: 'P2',
        desc: '雙介詞錯用「在家裡中/在心裡上」等(c_plan_v2.ts R1 第 6a 條 P2)',
      },
      // 規則 6c:中英混雜口語(技術專名 Stripe/Claude/Excel 例外、不擋只警告 P2)
      {
        name: '中英混雜口語(R1 第 6c 條)',
        patterns: [
          // 「ok 的」「OK 啦」「double check」「review 一下」「follow up」「meeting」(非接大寫專名)「deadline」
          // negative lookahead `(?!\s*[A-Z])` 排除「meeting Stripe」「meeting Claude」這類技術專名(雖罕見)
          // R+1 修(Codex L3 P3):JavaScript `\b` 不認中文 word boundary、「ok 的/啦/嘛」「review 一下」原 `\b` 後綴失效;改用顯式 char enum 避開
          /\b[oO][kK]\s+(?:的|啦|嘛)|\bdouble\s+check\b|\breview\s+一下|\bfollow\s+up\b|\bmeeting\b(?!\s*[A-Z])|\bdeadline\b/gi,
        ],
        severity: 'P2',
        desc: '中英混雜口語「ok 的/double check/meeting/deadline」等(c_plan_v2.ts R1 第 6c 條 P2、技術專名例外)',
      },
    ]
    for (const rule of R1_FORBIDDEN_PATTERNS) {
      const allMatches: string[] = []
      for (const pat of rule.patterns) {
        const m = reportContent.match(pat)
        if (m) allMatches.push(...m.slice(0, 5).map(s => s.trim().slice(0, 60)))
      }
      if (allMatches.length > 0) {
        // P0 → 不加 [軟性] 前綴、會被 criticalWarnings filter 收成 hardFailures、觸發 fail
        // P1/P2 → 加 [軟性] 前綴、只 log、不擋(避免 retry 燒錢)
        const prefix = rule.severity === 'P0' ? '' : '[軟性]'
        warnings.push(`${prefix}[R1-${rule.severity}] ${rule.name}:命中 ${allMatches.length} 次(${allMatches.slice(0, 3).join(' / ')})`)
      }
    }
  }

  if (planCode === 'E1') {
    const e1Required = [
      { pattern: /事件判斷|事件吉凶|你的事件/, name: '事件判斷' },
      { pattern: /Top3|加乘時機|最佳出行/, name: 'Top3 加乘時機' },
      { pattern: /行動建議|建議|行動/, name: '行動建議' },
      { pattern: /補運|操作指南/, name: '補運操作指南' },
      { pattern: /忌方|忌日|注意事項/, name: '注意事項' },
    ]
    for (const sec of e1Required) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`出門訣缺少必要章節: ${sec.name}`)
      }
    }
    // Top3 JSON 檢查（相容舊版 TOP5 標記）
    if (!/===TOP3_JSON_START===/.test(reportContent) && !/===TOP5_JSON_START===/.test(reportContent)) {
      warnings.push('出門訣缺少 Top3 吉時 JSON 區塊')
    }
    // 內容長度檢查
    if (reportContent.length < 2500) {
      warnings.push(`出門訣內容偏短: ${reportContent.length} 字（期望 > 2,500 字）`)
    }
  }

  // 2c-2. E2 月度單盤 v2.0 必要章節檢查（v5.3.79、月家奇門古法、單月 1 盤、500 字極簡）
  if (planCode === 'E2') {
    const e2Required = [
      { pattern: /本月能量總覽|本月出行能量/, name: '本月能量總覽' },
      { pattern: /本月最佳出行時機|最佳出行時機/, name: '本月最佳出行時機' },
      { pattern: /補運操作指南|操作指南/, name: '補運操作指南' },
      { pattern: /月度執行提醒/, name: '月度執行提醒' },
      { pattern: /寫給你的話/, name: '寫給你的話' },
    ]
    for (const sec of e2Required) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`月度單盤缺少必要章節: ${sec.name}`)
      }
    }
    // E2 v2.0 只需要 1 個 TOP1 JSON 區塊（單月盤）
    const top1Matches = reportContent.match(/===TOP1_JSON_START===/g)
    const count = top1Matches?.length || 0
    if (count === 0) {
      warnings.push('月度單盤缺少吉時 JSON 區塊（期望 1 個單月盤）')
    } else if (count > 1) {
      warnings.push(`月度單盤 JSON 區塊過多: 找到 ${count} 個（v2.0 期望 1 個單月盤）`)
    }
    // 內容長度檢查（v5.7.11 寬容 1200、Gemini round 6 警告 LLM 字數控制不精準、prompt 1500-2500 但實寫 1200-1400 常見）
    if (reportContent.length < 1200) {
      warnings.push(`月度單盤內容偏短: ${reportContent.length} 字（v2.0 期望 1500-2500 字、容錯底線 1200）`)
    }
  }

  // 2c-2b. E3 月度精選必要章節檢查（v5.3.62 新增、8 卡片格式）
  if (planCode === 'E3') {
    const e3Required = [
      { pattern: /第 ?1 ?週|第一週/, name: '第一週' },
      { pattern: /第 ?2 ?週|第二週/, name: '第二週' },
      { pattern: /第 ?3 ?週|第三週/, name: '第三週' },
      { pattern: /第 ?4 ?週|第四週/, name: '第四週' },
      { pattern: /TOP\s?1|Top\s?1/, name: '主題 TOP 1' },
    ]
    for (const sec of e3Required) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`月度精選缺少必要章節: ${sec.name}`)
      }
    }
    const jsonBlocks = (reportContent.match(/===TOP\d+_JSON_START===/g) || []).length
    if (jsonBlocks < 8) {
      warnings.push(`月度精選 JSON 區塊不足: 找到 ${jsonBlocks} 個（期望 8 個吉時卡片）`)
    }
    if (reportContent.length < 2000) {
      warnings.push(`月度精選內容偏短: ${reportContent.length} 字（期望 > 2,400 字 = 8 卡 × 300 字）`)
    }

    // v5.3.67 E3 主用神硬驗：報告必須命中古法九星+八門+八神名稱 ≥ 16 次（8 卡 × 每卡最少 2 次）
    const yongshenNames = [
      // 九星
      '天蓬', '天任', '天沖', '天輔', '天英', '天芮', '天柱', '天心', '天禽',
      // 八門
      '休門', '生門', '傷門', '杜門', '景門', '死門', '驚門', '開門',
      // 八神（陰盤/陽盤都有的）
      '值符', '螣蛇', '太陰', '六合', '白虎', '玄武', '九地', '九天', '勾陳', '朱雀',
    ]
    let yongshenHits = 0
    for (const name of yongshenNames) {
      const matches = reportContent.match(new RegExp(name, 'g'))
      if (matches) yongshenHits += matches.length
    }
    if (yongshenHits < 16) {
      warnings.push(`E3 主用神引用不足：全文命中 ${yongshenHits} 次（期望 ≥ 16 = 8 卡 × 每卡 2 次）— AI 需具名引用九星／八門／八神`)
    }

    // v5.3.72 P0 修復：主題一致性硬驗 — AI 寫的主題必須 ⊆ 客戶選的 TOP3
    // 之前 AI 會自動把第 3 位寫成「貴人」不管客戶選什麼
    const TOPIC_ZH_TO_CODE: Record<string, string> = {
      '事業運': 'career',
      '財運': 'wealth',
      '感情運': 'love',
      '健康': 'health',
      '學業': 'study',
      '貴人': 'noble',
      '化解小人': 'villain',
      '家庭': 'family',
    }
    const TOPIC_CODE_TO_ZH: Record<string, string> = Object.fromEntries(
      Object.entries(TOPIC_ZH_TO_CODE).map(([zh, code]) => [code, zh])
    )
    const customerTopics = birthData ? ((birthData as unknown as Record<string, unknown>).topics as string[] | undefined) : undefined
    if (Array.isArray(customerTopics) && customerTopics.length > 0) {
      const customerTopicZh = new Set(customerTopics.map(c => TOPIC_CODE_TO_ZH[c]).filter(Boolean))
      const aiTopicMatches = reportContent.matchAll(/主題：(\S+?)（TOP\s?\d）/g)
      const aiWrittenTopics = new Set<string>()
      for (const m of aiTopicMatches) {
        aiWrittenTopics.add(m[1])
      }
      const wrongTopics: string[] = []
      for (const t of aiWrittenTopics) {
        if (!customerTopicZh.has(t)) {
          wrongTopics.push(t)
        }
      }
      if (wrongTopics.length > 0) {
        warnings.push(`E3 主題不對題：AI 卡片寫了客戶沒選的主題 [${wrongTopics.join('、')}]、客戶實選 [${Array.from(customerTopicZh).join('、')}] — 必須重寫`)
      }
      // 也檢查客戶選了但 AI 完全沒寫的主題
      const missingTopics: string[] = []
      for (const t of customerTopicZh) {
        if (!aiWrittenTopics.has(t)) {
          missingTopics.push(t)
        }
      }
      if (missingTopics.length > 0) {
        warnings.push(`E3 主題遺漏：客戶選了 [${missingTopics.join('、')}] 但 AI 報告卡片沒出現 — 必須補寫`)
      }
    }

    // v5.3.73 P0：8 張卡片必須全部有 plain_advantage + plain_purpose（個人化、非罐頭）
    const jsonBlockMatches = reportContent.matchAll(/===TOP\d+_JSON_START===([\s\S]+?)===TOP\d+_JSON_END===/g)
    let hasAdvantageCount = 0
    let hasPurposeCount = 0
    const totalJsonBlocks2 = (reportContent.match(/===TOP\d+_JSON_START===/g) || []).length
    for (const jm of jsonBlockMatches) {
      try {
        const jsonStr = (jm[1] || '').trim().replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
        const parsed = JSON.parse(jsonStr)
        if (parsed.plain_advantage && typeof parsed.plain_advantage === 'string' && parsed.plain_advantage.length >= 30) {
          hasAdvantageCount++
        }
        if (Array.isArray(parsed.plain_purpose) && parsed.plain_purpose.length >= 2) {
          hasPurposeCount++
        }
      } catch {
        // JSON 解析失敗也算沒寫
      }
    }
    if (hasAdvantageCount < totalJsonBlocks2) {
      warnings.push(`E3 plain_advantage 個人化缺失：${hasAdvantageCount}/${totalJsonBlocks2} 張卡片有 ≥30 字的 plain_advantage — 必須每張都寫「坐這個盤對客戶該卡主題的輔助」`)
    }
    if (hasPurposeCount < totalJsonBlocks2) {
      warnings.push(`E3 plain_purpose 主題行動缺失：${hasPurposeCount}/${totalJsonBlocks2} 張卡片有 ≥2 條主題行動 — 必須每張 2-3 條針對該卡主題的具體行動`)
    }
  }

  // 2c-3. E1/E2/E3 出門訣：非奇門詞彙檢查
  // v5.3.19：從 hardFail 降級為 soft warning（index.ts 已有 bannedTerms 自動 replace）
  //   AI 偶爾違反 prompt 寫出「八字/紫微/生氣位」等跨系統詞彙
  //   現在 index.ts 的 bannedTerms regex 會自動把這些詞 replace 掉，這裡只做 soft 紀錄
  if (isChumenjiPlan(planCode)) {
    const nonQimenTerms = [
      '用神', '喜神', '日主', '八字', '風水', '八宅', '本命卦',
      '天醫位', '生氣位', '延年位', '生物節律', '臨界日',
      '紫微', '太陽星座', '西洋占星', '吠陀', '南洋術數',
      '命宮主星', '人類圖', '姓名學', '數字能量',
    ]
    const foundTerms: string[] = []
    for (const term of nonQimenTerms) {
      if (reportContent.includes(term)) {
        foundTerms.push(term)
      }
    }
    if (foundTerms.length > 0) {
      // [軟性] 前綴讓下游 criticalWarnings filter 把它排除 → 不觸發 retry
      warnings.push(`[軟性] 出門訣含非奇門詞彙（${foundTerms.length} 種）: ${foundTerms.join('、')}（將自動替換）`)
    }
  }

  // 2c-4. [CHUMENJI DEEP AUDIT 2026-04-18] 引擎硬比對：AI 輸出的 JSON 必須等於 chumenjiTop
  // 這是 P0 級修復 — 歷史發現 Claude Opus 4.6 在 E1/E2 偶爾覆寫引擎結果（自己編 date/time/door）
  // 從這裡起，AI JSON 的 (date, time_start, direction) 必須與引擎輸出 100% 一致，否則觸發 retry
  if ((isChumenjiPlan(planCode)) && chumenjiTop?.results?.length) {
    try {
      // 抽取 AI 寫的 JSON 區塊
      const aiJsonMatches: Array<{ date?: string; time_start?: string; direction?: string; title?: string }> = []
      // TOP3_JSON 區塊（E1 可能是陣列）
      const top3Block = reportContent.match(/===TOP3_JSON_START===\s*([\s\S]*?)\s*===TOP3_JSON_END===/)
      if (top3Block) {
        try {
          const parsed = JSON.parse(top3Block[1])
          if (Array.isArray(parsed)) aiJsonMatches.push(...parsed)
          else aiJsonMatches.push(parsed)
        } catch { /* noop */ }
      }
      // TOP1_JSON 區塊（E2 每週一個、E3 8 個、E4 12 個、可能多個）
      // v5.7.17:Codex round 9 P2 — TOP1 內可能是 array shape `[{...}]`(E3/E4 慣例)、必須 flatten 否則 aj.date undefined 跳過硬比對
      const top1Regex = /===TOP1_JSON_START===\s*([\s\S]*?)\s*===TOP1_JSON_END===/g
      let m: RegExpExecArray | null
      while ((m = top1Regex.exec(reportContent)) !== null) {
        try {
          const parsed = JSON.parse(m[1])
          if (Array.isArray(parsed)) aiJsonMatches.push(...parsed)
          else aiJsonMatches.push(parsed)
        } catch { /* noop */ }
      }
      // 舊版 TOP5_JSON（相容）
      const top5Block = reportContent.match(/===TOP5_JSON_START===\s*([\s\S]*?)\s*===TOP5_JSON_END===/)
      if (top5Block) {
        try {
          const parsed = JSON.parse(top5Block[1])
          if (Array.isArray(parsed)) aiJsonMatches.push(...parsed)
        } catch { /* noop */ }
      }

      // 比對：AI 的每一筆都必須有對應的引擎結果（date + time_start 符合）
      const engineList = chumenjiTop.results
      const mismatches: string[] = []
      for (const aj of aiJsonMatches) {
        if (!aj.date || !aj.time_start) continue
        const match = engineList.find(r => {
          if (r.date !== aj.date) return false
          // time_start 比對（HH:MM）
          const rStart = (r.time_range || '').split('-')[0].trim().padStart(5, '0')
          return rStart === aj.time_start || r.shichen === (aj as { shichen?: string }).shichen
        })
        if (!match) {
          mismatches.push(`AI 輸出 ${aj.date} ${aj.time_start}（${aj.direction || ''}）不在引擎計算結果內`)
        } else {
          // date 對上，再比對 direction
          if (aj.direction && match.direction && aj.direction !== match.direction) {
            mismatches.push(`AI ${aj.date} ${aj.time_start} 方位=${aj.direction}，引擎=${match.direction}（不符）`)
          }
        }
      }
      if (mismatches.length > 0) {
        warnings.push(`[硬門檻] 出門訣引擎硬比對失敗（${mismatches.length} 項）：${mismatches.slice(0, 3).join('；')}`)
      } else if (aiJsonMatches.length === 0) {
        warnings.push(`[硬門檻] 出門訣缺少 AI JSON 輸出區塊，無法驗證是否遵守引擎結果`)
      }
    } catch (e) {
      console.error('chumenjiTop 硬比對異常（降級為警告）:', e)
      warnings.push('[軟性] 出門訣引擎硬比對異常，已降級')
    }
  }

  // 2d. R 方案「合否？」必要章節檢查
  if (planCode === 'R') {
    // v5.6.5 (2026-04-28) ROI #8 (軟性): 加雙人對位視覺化檢查、避免 R 報告純文字弱於市面對手
    // production 確認 (Supabase 撈 r_production_status.md):R 已通 4/4、待辦 #4 過期、CLAUDE.md 待關
    // 12 天 0 新單 → funnel 斷、不是 AI 問題、本 ROI 補對位表強化視覺差異化
    const rRequired = [
      { pattern: /你們的問題|關係描述/, name: '你們的問題', soft: false },
      { pattern: /你們的答案|合否結論/, name: '你們的答案', soft: false },
      { pattern: /化學反應|合盤分析/, name: '化學反應', soft: false },
      { pattern: /好的地方|最好的/, name: '好的地方', soft: false },
      { pattern: /需要注意|最該注意/, name: '需要注意的地方', soft: false },
      { pattern: /改善建議|關係處方/, name: '改善建議', soft: false },
      { pattern: /刻意練習/, name: '刻意練習', soft: false },
      { pattern: /流年|2026|2027/, name: '關係流年', soft: false },
      { pattern: /寫給.*的話/, name: '寫給你們的話', soft: false },
      // v5.6.5 ROI #8 軟性檢查:雙人對位視覺(八字並列 / 紫微合盤格式 / 對照表)
      { pattern: /\|.*[男女夫妻甲方乙方].*\|.*[男女夫妻甲方乙方].*\||並列|對位|對照表|Synastry/, name: '雙人對位視覺(八字並列表 / 紫微合盤格式)', soft: true },
    ]
    for (const sec of rRequired) {
      if (!sec.pattern.test(reportContent)) {
        const prefix = sec.soft ? '[軟性] ' : ''
        warnings.push(`${prefix}合否缺少必要章節: ${sec.name}`)
      }
    }
    // R 方案已禁止評分（命不該有分數），改為檢查是否有明確的合/不合結論
    const hasConclusion = /結論\s*[:：]/.test(reportContent) || /你們(合|不合|合，但)/.test(reportContent)
    if (!hasConclusion) {
      warnings.push('合否缺少明確結論（應有「你們合/不合/合但有致命雷區」）')
    }
    // 內容長度檢查
    if (reportContent.length < 8000) {
      warnings.push(`合否內容偏短: ${reportContent.length} 字（期望 > 8,000 字）`)
    }
    // L3 P0 Bug 4 修復：雙方互動比例檢查（>= 40% 段落必須包含雙方互動字眼）
    // 掃描段落中是否有「你們」「兩個人」「互動」「彼此」「對方」「她/他」等雙方字眼
    const paragraphs = reportContent.split(/\n\s*\n/).filter(p => p.trim().length > 50)
    const interactionPattern = /你們|兩個人|兩人|彼此|互動|對方|一個.{0,3}一個|互相|雙方/
    const interactionParagraphs = paragraphs.filter(p => interactionPattern.test(p))
    const interactionRatio = paragraphs.length > 0 ? interactionParagraphs.length / paragraphs.length : 0
    if (interactionRatio < 0.40) {
      warnings.push(`合否雙方互動比例過低: ${(interactionRatio * 100).toFixed(0)}% 段落含互動字眼（期望 >= 40%，避免變成個人分析）`)
    }
    // R 每章三段式總結檢查（🟢🟡🔵）
    const hasTrinitySummary = /🟢|好的地方/.test(reportContent)
      && /🟡|需要注意/.test(reportContent)
      && /🔵|改善建議|關係處方/.test(reportContent)
    if (!hasTrinitySummary) {
      warnings.push('合否缺少三段式總結（🟢好的地方/🟡需要注意/🔵改善建議）')
    }
  }

  // 2e. D 方案「心之所惑」必要章節檢查
  if (planCode === 'D') {
    const dRequired = [
      { pattern: /你的問題/, name: '你的問題（客戶原文引用）' },
      { pattern: /你的答案/, name: '你的答案（直接回答）' },
      { pattern: /深入解析|命格.*看/, name: '深入解析' },
      { pattern: /根源剖析|為什麼.*卡/, name: '根源剖析' },
      { pattern: /你的路|怎麼走/, name: '你的路' },
      { pattern: /好的地方/, name: '好的地方' },
      { pattern: /需要注意/, name: '需要注意的地方' },
      { pattern: /改善建議/, name: '改善建議' },
      { pattern: /寫給.*的話/, name: '寫給你的話' },
    ]
    for (const sec of dRequired) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`心之所惑缺少必要章節: ${sec.name}`)
      }
    }
    // D 方案字數範圍 6,000-9,000 字（物超所值鐵律）
    // v5.6.3 (2026-04-28) ROI #4: 下限從 5500 → 5000（避免邊緣 retry 燒 Claude $1+ /次）
    // 5000-5499 範圍仍可接受、寫進 warnings 但不該觸發 retry（成本 vs 品質權衡）
    if (reportContent.length < 5000) {
      warnings.push(`心之所惑內容偏短: ${reportContent.length} 字（期望 6,000-9,000 字、< 5,000 觸發重跑）`)
    }
    if (reportContent.length > 11000) {
      warnings.push(`[軟性] 心之所惑內容過長: ${reportContent.length} 字（D 方案應 6,000-9,000 字，不是 C 方案的百科全書）`)
    }
    // 老闆鐵律：禁止「命盤顯示」這類空話——要求每個論述引用具體命盤欄位
    const vagueHitCount = (reportContent.match(/命盤顯示[^，。？！\n]{0,10}[你妳]?(很|有|能|會|需要)/g) || []).length
    if (vagueHitCount >= 3) {
      warnings.push(`[軟性] 心之所惑「命盤顯示」類空話出現 ${vagueHitCount} 次，應改為具體命盤欄位（日主X金/X宮X星/X格局）`)
    }
    // 「好的地方」條數檢查（應 3-4 項，不應灌水到 6+）
    const goodPartsMatch = reportContent.match(/##?\s*(?:[一二三四五六七八九十]+、\s*)?好的地方[\s\S]*?(?=\n##?\s|$)/)
    if (goodPartsMatch) {
      const goodItems = (goodPartsMatch[0].match(/^\*\*\d+\./gm) || []).length
      if (goodItems > 6) warnings.push(`[軟性] 心之所惑「好的地方」${goodItems} 條偏多（建議 3-4 條精選）`)
    }
  }

  // 2f. G15 家族藍圖必要章節檢查
  // v5.10.23 (2026-05-06) Round 2 升級:加 v6.0 P0 grep(對應 g15_plan_v2.ts 16 條護欄)
  // - v1 預設(G15_V2_QUALITY_GATE != 'true'):新增 grep 走 [軟性] 警告、不擋 v1 prompt 出來的舊報告
  // - v2 啟用(G15_V2_QUALITY_GATE = 'true'):新增 grep 走 hardFailures(unprefixed warnings)
  //   → MAX_QUALITY_RETRIES=0 不 retry 燒錢、fail 即 needs_human_review(對應 lesson #058)
  // 對應接力檔:tasks/next_session_handoff_2026-05-06_g15_R1_prompt_complete.md「Round 2 立即可動清單」
  if (planCode === 'G15') {
    const g15V2Strict = process.env.G15_V2_QUALITY_GATE === 'true'
    const g15Prefix = g15V2Strict ? '' : '[軟性]'  // 空字串 = 走 hardFailures、[軟性] = 只 log
    const g15LegacyPrefix = '[軟性]'  // 既有 v1 grep 永遠 [軟性](保留向後相容)

    // ── 既有 v1 互動比例(≥ 35% [軟性]、保留向後相容)──
    // v5.6.3 (2026-04-28) ROI #9 round 2: 加互動比例 ≥ 35% [軟性] 警告(對齊 R 方案 ≥ 40%、家族藍圖比例可略低)
    // 避免 G15 變成「N 個人個人分析的拼貼」、確保有真實「成員互動」段落
    // IA round 1 抓 P2:單字「兒/女」會誤觸發、改多字組合避免 false positive(個人段落被誤算互動)
    // [軟性] 標籤避免擴大 retry 攻擊面、由 G15 cRequired 章節結構 + 5 LLM QA 兜底
    const g15Paragraphs = reportContent.split(/\n\s*\n/).filter(p => p.trim().length > 50)
    const g15InteractionPattern = /家族成員|父母|爸媽|兒子|女兒|姊妹|兄弟|手足|親子|配偶|長輩|晚輩|互動|彼此|對方|你們|你跟|這家|這個家|家庭關係|家中/
    const g15InteractionParas = g15Paragraphs.filter(p => g15InteractionPattern.test(p))
    const g15InteractionRatio = g15Paragraphs.length > 0 ? g15InteractionParas.length / g15Paragraphs.length : 0
    if (g15InteractionRatio < 0.35) {
      warnings.push(`${g15LegacyPrefix} 家族藍圖成員互動比例過低: ${(g15InteractionRatio * 100).toFixed(0)}% 段落含家族/互動字眼(期望 >= 35%、避免變成個人分析的拼貼)`)
    }

    // ── 既有 v1 必要章節 ──
    const g15Required = [
      { pattern: /家族能量|能量圖譜|能量全貌/, name: '家族能量圖譜' },
      { pattern: /互動關係|成員互動|互動.*分析/, name: '成員互動關係深度分析' },
      { pattern: /好的地方/, name: '好的地方' },
      { pattern: /需要注意/, name: '需要注意的地方' },
      { pattern: /改善建議/, name: '改善建議' },
      { pattern: /刻意練習/, name: '刻意練習' },
      { pattern: /溝通模式/, name: '家庭溝通模式' },
      { pattern: /家族流年|流年運勢|家運走勢|家運/, name: '家族流年運勢' },
      { pattern: /行動指南|家族行動/, name: '家族行動指南' },
      { pattern: /寫給.*家|寫給這個家/, name: '寫給這個家的話' },
    ]
    for (const sec of g15Required) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`家族藍圖缺少必要章節: ${sec.name}`)
      }
    }

    // ── 既有 v1 內容長度(依家庭人數)──
    const memberCount = systemsCount || 2
    const minG15Length = memberCount <= 2 ? 8000 : memberCount <= 3 ? 10000 : 12000
    if (reportContent.length < minG15Length) {
      warnings.push(`家族藍圖內容偏短: ${reportContent.length} 字(期望 > ${minG15Length} 字)`)
    }

    // ════════════════════════════════════════════════════════════
    // ── v5.10.23 Round 2 v6.0 升級 grep(對應 g15_plan_v2.ts 16 條護欄)──
    // 對應接力檔 P0-1 ~ P0-6、嚴格度由 G15_V2_QUALITY_GATE env 控制
    // ════════════════════════════════════════════════════════════

    // P0-1:家族 5 件套必含(對應護欄 G15-1、Hero 章節 strict template)
    const G15_FAMILY_CARD_5 = [
      { pattern: /主角.*姓名|為主角|主訴者/, name: '主角標識' },
      { pattern: /家庭結構|成員列表|本次合盤共/, name: '家庭結構圖' },
      { pattern: /主要動力|誰主導|主軸動力/, name: '主要動力標識' },
      { pattern: /主要業力|跨代主軸|跨代慣性|代際傳遞/, name: '主要業力標識' },
      { pattern: /共同願景|2026.*行動|全家.*目標/, name: '共同願景標識' },
    ]
    let g15Card5Missing = 0
    for (const card of G15_FAMILY_CARD_5) {
      if (!card.pattern.test(reportContent)) {
        warnings.push(`${g15Prefix}[G15-v6.0 P0-1] 家族 5 件套缺:${card.name}`)
        g15Card5Missing++
      }
    }
    // 5 件套若 ≥ 3 缺 = 結構嚴重不全(v2 strict 模式不論前綴都升 hard、避免 LLM 寫到一半就漏)
    if (g15V2Strict && g15Card5Missing >= 3) {
      warnings.push(`[G15-v6.0 P0-1 升級] 家族 5 件套缺 ${g15Card5Missing}/5、結構嚴重不全`)
    }

    // P0-2:18 章節必含(v6.0 strict template、缺 ≥ 3 章節 = P0)
    const G15_V6_REQUIRED_SECTIONS = [
      { pattern: /能量全貌|能量地圖|家族能量/, name: '0 你們家的能量全貌' },
      { pattern: /互動關係|成員互動.*分析|互動.*深度/, name: '一、成員互動關係深度分析' },
      { pattern: /家族結構|結構與動力|Minuchin|邊界/, name: '二、家族結構與動力' },
      { pattern: /跨代|業力|祖德|代際傳遞|Hellinger/, name: '三、跨代家族慣性 / 業力' },
      { pattern: /角色與溝通|Satir|溝通姿態|六親|六宮/, name: '四、家族成員角色與溝通' },
      { pattern: /時間軸|Erikson|大運疊加|Saturn/, name: '五、家族發展時間軸' },
      { pattern: /財務命脈|財星|財帛宮|金錢信念|代際財富/, name: '六、家族財務命脈' },
      { pattern: /身心健康|疾厄宮|遺傳|跨代創傷|ACEs/, name: '七、家族身心健康' },
      { pattern: /環境.*風水|陽宅|Vastu|家相/, name: '八、家族環境與風水' },
      { pattern: /教育傳承|親子教養|子女宮|文化身份/, name: '九、家族教育傳承' },
      { pattern: /好的地方/, name: '十、好的地方' },
      { pattern: /需要注意/, name: '十一、需要注意的地方' },
      { pattern: /改善建議/, name: '十二、改善建議' },
      { pattern: /刻意練習/, name: '十三、刻意練習' },
      { pattern: /故事重寫|敘事治療|外化問題|家族.*motto/, name: '十四、家族故事重寫' },
      { pattern: /流年運勢|2026.*2030|家族流年/, name: '十五、家族流年運勢' },
      { pattern: /行動指南|家族行動/, name: '十六、家族行動指南' },
      { pattern: /寫給.*家|寫給這個家/, name: '寫給這個家的話' },
    ]
    let g15V6MissingCount = 0
    for (const sec of G15_V6_REQUIRED_SECTIONS) {
      if (!sec.pattern.test(reportContent)) g15V6MissingCount++
    }
    if (g15V6MissingCount >= 3) {
      warnings.push(`${g15Prefix}[G15-v6.0 P0-2] 18 章節缺 ${g15V6MissingCount} 章(v6.0 strict template 期望 ≥ 16/18)`)
    } else if (g15V6MissingCount > 0) {
      warnings.push(`[軟性][G15-v6.0 P0-2] 18 章節缺 ${g15V6MissingCount} 章(可接受、但 v6.0 期望全部 18 章)`)
    }

    // v5.10.47 P0-7 升級(老闆抓「練習編號 1→2→5 跳號 + 章節空殼」第 N 次再犯):
    //   v5.10.44 regex `## 十三、?\s*刻意練習` 抓不到 AI 改用「### 練習1:」拆章結構
    //   修補:用 alternative regex 抓 H2「## 十三、刻意練習」OR 整段「### 練習 1-5」累計字數
    //   + 加練習編號連續性檢查(練習1/2/3/4/5 必須出現、跳號 = P0)
    const G15_CHAPTER_MIN_LEN: Array<{ pattern: RegExp; name: string; minLen: number }> = [
      // 「五、刻意練習」/「十三、刻意練習」/「### 練習 1-5」三種格式都抓
      { pattern: /(?:##\s*(?:十三|五)、?\s*刻意練習|###\s*練習\s*[1-5一二三四五])[\s\S]*?(?=\n##\s|$)/, name: '刻意練習章節', minLen: 1500 },
      { pattern: /##\s*(?:十二|四)、?\s*改善建議[\s\S]*?(?=##|$)/, name: '改善建議', minLen: 1200 },
      { pattern: /##\s*(?:十|二)、?\s*好的地方[\s\S]*?(?=##|$)/, name: '好的地方', minLen: 1000 },
      { pattern: /##\s*(?:十一|三)、?\s*需要注意[\s\S]*?(?=##|$)/, name: '需要注意的地方', minLen: 1000 },
      { pattern: /##\s*(?:十四|六)、?\s*家族故事重寫[\s\S]*?(?=##|$)/, name: '家族故事重寫', minLen: 600 },
      { pattern: /##\s*(?:一|一、)、?\s*成員互動[\s\S]*?(?=##|$)/, name: '一、成員互動關係深度分析', minLen: 2500 },
    ]
    for (const ch of G15_CHAPTER_MIN_LEN) {
      const m = reportContent.match(ch.pattern)
      if (!m) {
        warnings.push(`${g15Prefix}[G15-v6.0 P0-7] ${ch.name} 章節缺失(regex 抓不到、結構可能改變)`)
        continue
      }
      const bodyLen = m[0].length
      if (bodyLen < ch.minLen) {
        warnings.push(`${g15Prefix}[G15-v6.0 P0-7 章節空殼] ${ch.name} 字數 ${bodyLen} < ${ch.minLen}(prompt 鐵律未執行)`)
      }
    }
    // 練習編號連續性檢查(老闆抓 1→2→5 跳號)
    const exerciseNums = Array.from(reportContent.matchAll(/###\s*練習\s*([1-9])/g)).map(m => parseInt(m[1], 10))
    if (exerciseNums.length > 0) {
      const expected = [1, 2, 3, 4, 5]
      const missing = expected.filter(n => !exerciseNums.includes(n))
      if (missing.length > 0) {
        warnings.push(`${g15Prefix}[G15-v6.0 P0-7 練習跳號] 缺練習 ${missing.join('/')} (實際出現:${exerciseNums.join(',')})`)
      }
    }

    // P0-3:互動比例 ≥ 50%(v6.0 升、原 v1 是 ≥ 35%)
    if (g15InteractionRatio < 0.50) {
      warnings.push(`${g15Prefix}[G15-v6.0 P0-3] 互動比例過低: ${(g15InteractionRatio * 100).toFixed(0)}%(v6.0 期望 ≥ 50%)`)
    }

    // P0-4:健康章節法務免責強制(對應護欄 G15-6、必含「不取代醫療診斷」+ 危機轉介)
    const g15LegalDisclaimer = /命理建議.*非.*醫療診斷|有疑慮.*請就醫|本內容不能.*取代醫療|建議諮詢.*醫師|不取代醫療診斷|分享.*非.*取代醫療/.test(reportContent)
    if (!g15LegalDisclaimer) {
      warnings.push(`${g15Prefix}[G15-v6.0 P0-4] 第七章「家族身心健康」缺法務免責語(必含「命理建議非醫療診斷」字眼)`)
    }

    // P0-5:跨系統幻想禁區(對應護欄 G15-10、lesson #056)
    // 任一命中 = P0 永遠擋(不論 v2 strict、跨系統幻想是 0 古籍依據幻想)
    const G15_FORBIDDEN_CROSS_SYSTEM = [
      { pattern: /八字.*喜用神.*奇門.*方位|奇門.*依.*八字.*喜用神/, name: '八字喜用神 × 奇門擇方(禁)' },
      { pattern: /紫微.*命主.*奇門|紫微.*對應.*奇門盤面/, name: '紫微命主 × 奇門對應(禁)' },
      { pattern: /西占.*八字.*十神.*映射|十神.*對應.*行星/, name: '西占 × 八字十神映射(禁)' },
      { pattern: /喜用神.*[→指].*門.*星.*神|五行.*[→指].*門.*星.*神/, name: '五行 → 門/星/神 cross-domain mapping(禁)' },
    ]
    for (const rule of G15_FORBIDDEN_CROSS_SYSTEM) {
      if (rule.pattern.test(reportContent)) {
        warnings.push(`[G15-v6.0 P0-5] 跨系統幻想禁區命中:${rule.name}(lesson #056、永遠 hardFailures、不論 v2 strict)`)
      }
    }

    // P0-6:v6.0 字數下限(2 人 22K / 3 人 27.5K / 4-5 人 32.5K / 6 人 38K、僅 v2 模式擋)
    const minG15LengthV6 = memberCount <= 2 ? 22000 : memberCount <= 3 ? 27500 : memberCount <= 5 ? 32500 : 38000
    if (reportContent.length < minG15LengthV6) {
      warnings.push(`${g15Prefix}[G15-v6.0 P0-6] 內容偏短: ${reportContent.length} 字(v6.0 期望 ≥ ${minG15LengthV6} 字、${memberCount} 人合盤)`)
    }
  }

  // 2f. C 方案字數下限（預期 30,000+ 字）
  if (planCode === 'C' && reportContent.length < 20000) {
    warnings.push(`人生藍圖內容偏短: ${reportContent.length} 字（期望 > 20,000 字）`)
  }

  // 2f-3. v5.10.62 14 系統最少引用次數 quality gate(sub-agent strict eval finding)
  // 真因:G15 何家報告易經/奇門/風水/姓名/吠陀 0-1 次、$59 對外宣稱「14 套交叉」貨不對板
  //       D 何宣九星 2 次 / 易經 4 次幾乎缺席
  //       C 何宥諄九星 4 次偏弱
  // 修補:14 系統各自最少引用次數鐵律、不足 = warnings(prefix [軟性] 不擋舊報告、新報告生效)
  if (planCode === 'C' || planCode === 'G15' || planCode === 'D') {
    const SYSTEM_NAMES = [
      { name: '八字', min: 30 },     // 主力系統、應 ≥ 30 次
      { name: '紫微', min: 30 },     // 主力系統
      { name: '吠陀', min: 5 },      // 至少有意義出現
      { name: '占星', min: 5 },
      { name: '人類圖', min: 5 },
      { name: '易經', min: 3 },      // 較少用、寬鬆
      { name: '奇門', min: 5 },
      { name: '風水', min: 5 },
      { name: '姓名', min: 3 },
      { name: '九星', min: 3 },      // 對應 sub-agent finding C/G15/D 都偏弱
    ]
    for (const sys of SYSTEM_NAMES) {
      const count = (reportContent.match(new RegExp(sys.name, 'g')) || []).length
      if (count < sys.min) {
        warnings.push(`[軟性][14 系統不均 P1] ${planCode} 報告「${sys.name}」僅 ${count} 次(期望 ≥ ${sys.min}、貨不對板風險、對應 sub-agent strict eval finding)`)
      }
    }
  }

  // 2f-2. C 方案 quality gate v5.10.56(老闆「逐頁看」抓 C 何宥諄「十五、刻意練習 119 字空殼」、lesson #076 同根再犯)
  // 對齊 G15 v5.10.42/.47 chapter min len + 練習編號連續性
  // v5.10.57 修(Codex P0):全部 [軟性] 會被 L3429 排除、passed 仍 true、沒真擋。對齊 G15 v2 strict 模式
  // 用 C_V2_QUALITY_GATE env(v2 啟用)= '' 走 hardFailures、(v1 預設)= '[軟性]' 只 log
  if (planCode === 'C') {
    const cV2Strict = process.env.C_V2_QUALITY_GATE === 'true'
    const cPrefix = cV2Strict ? '' : '[軟性]'  // 對齊 G15 v5.10.47 pattern

    const C_CHAPTER_MIN_LEN: Array<{ pattern: RegExp; name: string; minLen: number }> = [
      // C 方案章節編號是「十五、刻意練習」(C prompt L1404 寫「十六」、實際 render 重編後變十五)
      { pattern: /(?:##\s*(?:十五|十六)、?\s*刻意練習|###\s*練習\s*[1-5一二三四五])[\s\S]*?(?=\n##\s|$)/, name: '十五、刻意練習', minLen: 1500 },
      { pattern: /##\s*(?:十四|十五)、?\s*給[你您]的一句話[\s\S]*?(?=##|$)/, name: '十四、給您的一句話', minLen: 600 },
      { pattern: /##\s*(?:十二|十三)、?\s*三階段行動計畫[\s\S]*?(?=##|$)/, name: '十二、三階段行動計畫', minLen: 1500 },
    ]
    for (const ch of C_CHAPTER_MIN_LEN) {
      const m = reportContent.match(ch.pattern)
      if (!m) {
        warnings.push(`${cPrefix}[C-v5.10.56 P0] ${ch.name} 章節缺失(regex 抓不到、結構可能改變)`)
        continue
      }
      const bodyLen = m[0].length
      if (bodyLen < ch.minLen) {
        warnings.push(`${cPrefix}[C-v5.10.56 P0 章節空殼] ${ch.name} 字數 ${bodyLen} < ${ch.minLen}(prompt 鐵律未執行、客戶級空殼 bug、對應 lesson #076)`)
      }
    }
    // 練習編號連續性(C 方案同 G15、5 練習 1-5)
    const cExerciseNums = Array.from(reportContent.matchAll(/###\s*練習\s*([1-9])/g)).map(m => parseInt(m[1], 10))
    if (cExerciseNums.length > 0) {
      const expected = [1, 2, 3, 4, 5]
      const missing = expected.filter(n => !cExerciseNums.includes(n))
      if (missing.length > 0) {
        warnings.push(`${cPrefix}[C-v5.10.56 P0 練習跳號] 缺練習 ${missing.join('/')} (實際出現:${cExerciseNums.join(',')})`)
      }
    }
  }

  // 3. 禁止字眼檢查（命理報告禁用語）
  const forbiddenPatterns = [
    { pattern: /命中注定/, replacement: '命盤顯示傾向' },
    { pattern: /這輩子就是/, replacement: '目前的命格走向' },
    { pattern: /前世業障/, replacement: '命格中的成長課題' },
    { pattern: /別想太多/, replacement: '你的感受是合理的' },
    { pattern: /想開一點/, replacement: '你的感受是合理的' },
    { pattern: /跳過/, replacement: '（不應出現在報告中）' },
    { pattern: /數據不足/, replacement: '（不應出現在報告中）' },
    { pattern: /待分析/, replacement: '（不應出現在報告中）' },
    { pattern: /不適用/, replacement: '（不應出現在報告中）' },
    { pattern: /__TABLE__/, replacement: '（排盤原始標記外洩）' },
    { pattern: /從命理角度來看/, replacement: '（廢話，整篇都是命理）' },
  ]
  for (const fp of forbiddenPatterns) {
    if (fp.pattern.test(reportContent)) {
      warnings.push(`含有禁止字眼: "${fp.pattern.source}" (應改為 "${fp.replacement}")`)
    }
  }

  // 4. 句子截斷檢查（報告末尾不應以不完整句子結束）——軟性警告，不觸發重跑
  const trimmedEnd = reportContent.trim()
  const lastChar = trimmedEnd[trimmedEnd.length - 1]
  if (lastChar && !/[。！？」\n\r*]/.test(lastChar)) {
    warnings.push(`[軟性] 報告可能被截斷: 末尾字元為 "${lastChar}"（非句末標點）`)
  }

  // 5. 內容長度檢查——軟性警告，不觸發重跑
  if (planCode === 'C' && reportContent.length < 15000) {
    warnings.push(`[軟性] C 方案內容偏短: ${reportContent.length} 字（期望 > 15,000 字）`)
  }

  // passed 判定：排除「含有禁止字眼」和「[軟性]」警告
  // 只有結構性問題（缺章節、系統子章節大量缺失）才觸發重跑
  const criticalWarnings = warnings.filter(w => !w.startsWith('含有禁止字眼') && !w.startsWith('[軟性]'))

  // ── L3 P0 Bug 1 修復：品質閘門從「警告式」升級為「阻斷式」 ──
  // 分級輸出 hard/soft 問題，讓上游 workflow 可以做 retry 決策
  // hardFailures = 致命結構問題（必觸發 retry），softWarnings = 文字瑕疵（只 log）
  const hardFailures: string[] = [...criticalWarnings]
  const softWarnings: string[] = warnings.filter(w => w.startsWith('[軟性]') || w.startsWith('含有禁止字眼'))

  // R 方案硬門檻：禁忌關係詞（不存在的地支/天干關係）
  if (planCode === 'R') {
    const forbiddenRelations: [RegExp, string][] = [
      [/子戌相刑|戌子相刑/g, '子戌相刑（不存在，地支三刑為寅巳申/丑戌未/子卯/自刑）'],
      [/丙庚相沖|庚丙相沖/g, '丙庚相沖（不存在，只有甲庚/乙辛/壬丙/癸丁四沖）'],
      [/狗鼠相害|鼠狗相害/g, '狗鼠相害（不存在，地支六害為子未/丑午/寅巳/卯辰/申亥/酉戌）'],
      [/狗兔相沖/g, '狗兔相沖（不存在，卯戌為六合）'],
      [/馬雞相沖|午酉相沖/g, '馬雞相沖（不存在，中性關係）'],
    ]
    for (const [pat, note] of forbiddenRelations) {
      if (pat.test(reportContent)) {
        hardFailures.push(`[R方案硬門檻] 發現不存在的命理關係：${note}`)
      }
    }
    // 生肖自相矛盾檢查：同一成員被說成不同生肖
    // 這個在多人場景複雜，僅做粗略檢查
  }

  // C 方案硬門檻（L3 Audit 建議）：字數 >= 8,000 + 每章 >= 300
  if (planCode === 'C') {
    // 8,000 字硬底線：低於即判定為 hardFailure（無論原本歸類）
    if (reportContent.length < 8000 && !hardFailures.some(h => h.includes('偏短'))) {
      hardFailures.push(`[硬門檻] C 方案總字數 ${reportContent.length} 低於 8,000 字下限`)
    }
    // 每章字數檢查（以 ## 分段）
    const chapters = reportContent.split(/^##\s/m).slice(1)
    let shortChapterCount = 0
    for (const ch of chapters) {
      const chLen = ch.replace(/\s/g, '').length
      if (chLen > 0 && chLen < 300) shortChapterCount++
    }
    if (shortChapterCount >= 3) {
      hardFailures.push(`[硬門檻] 有 ${shortChapterCount} 個章節字數 < 300 字（疑似 AI 敷衍）`)
    }
  }

  const passed = hardFailures.length === 0
  console.log(`品質閘門: ${passed ? '通過' : '失敗'} (硬門檻失敗 ${hardFailures.length} 項, 軟警告 ${softWarnings.length} 項)`)
  return {
    passed,
    warnings,
    hardFailures,   // L3 新增：致命結構問題，觸發 retry
    softWarnings,   // L3 新增：文字瑕疵，只 log
  }
}

// ── Step 3.5: AI 自我審核（5 LLM 並行評分，Post-Gen QA 流水線）──
// Post-Gen 5 LLM QA Pipeline（2026-04-18）：
//   原本單 Claude 自審 → 5 LLM（GPT/Qwen/Gemini/Kimi/DeepSeek）並行評分
//   最低分 < 95 或 平均分 < 93 → workflow 視為 hardFailure 觸發 retry
//   所有評分寫入 report_qa_log，供後台 /jamie/quality-reports 檢視
//
// 回傳舊介面 { score, issues }：避免既有 caller 破版
//   新增 fiveLLM 擴充欄位，workflow 可用 scores/avg/min 做更嚴格判斷
export async function aiReviewReport(
  reportContent: string,
  planCode: string,
  options: {
    reportId?: string
    round?: number
    chartDataJson?: string
    customerName?: string
  } = {},
): Promise<{
  score: number
  issues: string[]
  fiveLLM?: {
    scores: Record<string, number>
    avg: number
    min: number
    max: number
    passed: boolean
    severity: 'ok' | 'yellow' | 'red'
    criticalErrors: string[]
    totalCostUsd: number
    totalLatencyMs: number
  }
}> {
  "use step";
  // v5.7.13:E3/E4 出門訣審核邏輯不同(月度精選/年度全運不適用 5 LLM C/D/R 通用審核流程)
  // 故意跳過、return 85 預設值、後續若 E3/E4 加專屬審核器再升級
  if (!['C', 'D', 'R', 'E1', 'E2', 'G15'].includes(planCode)) return { score: 85, issues: [] }

  await emitProgress({ step: 'AI審核', progress: 72, message: '5 LLM 並行品質審核中...' })

  // 動態 import：workflow 環境避免 ESM 循環/熱載入問題
  const { fiveLLMQualityReview } = await import('@/lib/ai/team/five-llm-qa')

  try {
    const result = await fiveLLMQualityReview(
      reportContent,
      planCode,
      options.chartDataJson || '',
      options.customerName || '',
      options.reportId,
    )

    console.log(
      `5 LLM QA: avg=${result.avg}, min=${result.min}, max=${result.max}, ` +
      `passed=${result.passed}, severity=${result.severity}, ` +
      `$${result.totalCostUsd.toFixed(4)}, ${result.totalLatencyMs}ms`
    )

    // 寫入 report_qa_log（失敗不阻塞）
    if (options.reportId) {
      try {
        await writeReportQaLog(options.reportId, planCode, options.round ?? 1, result.reviewer_notes)
      } catch (e) {
        console.error('[five-llm-qa] 寫入 report_qa_log 失敗（不阻塞）:', e)
      }
    }

    return {
      score: Math.round(result.avg),
      issues: result.issues.slice(0, 20),
      fiveLLM: {
        scores: result.scores,
        avg: result.avg,
        min: result.min,
        max: result.max,
        passed: result.passed,
        severity: result.severity,
        criticalErrors: result.criticalErrors,
        totalCostUsd: result.totalCostUsd,
        totalLatencyMs: result.totalLatencyMs,
      },
    }
  } catch (e) {
    console.error('5 LLM QA 執行失敗（降級為 score 80，不阻塞交付）:', e)
    return {
      score: 80,
      issues: [`5 LLM QA 執行例外: ${e instanceof Error ? e.message : String(e)}`],
    }
  }
}

// 寫入 report_qa_log（5 LLM 每人一筆）
async function writeReportQaLog(
  reportId: string,
  planCode: string,
  round: number,
  reviewerNotes: Array<{
    reviewer: string
    provider: string
    model: string
    score: number
    issues: string[]
    criticalErrors: string[]
    strengths: string[]
    suggestions: string[]
    latencyMs: number
    costUsd: number
    passed: boolean
    error?: string
  }>,
): Promise<void> {
  const supabase = getSupabase()
  const rows = reviewerNotes.map(n => ({
    report_id: reportId,
    plan_code: planCode,
    round,
    reviewer: n.reviewer,
    model: n.model,
    score: n.score,
    issues: n.issues,
    critical_errors: n.criticalErrors,
    strengths: n.strengths,
    suggestions: n.suggestions,
    passed: n.passed,
    latency_ms: typeof n.latencyMs === 'number' ? Math.round(n.latencyMs) : null,
    cost_usd: n.costUsd || 0,
    error_message: n.error || null,
  }))
  const { error } = await supabase.from('report_qa_log').insert(rows)
  if (error) {
    // Migration 沒跑 / 表不存在：只 log，不拋
    console.warn('[report_qa_log] insert 失敗:', error.message)
  }
}

// ── Step 3.5a (legacy): 單 Claude 自審（備援，保留函式以防 fallback）──
export async function aiReviewReportLegacy(
  reportContent: string,
  planCode: string,
  reportId?: string,
): Promise<{ score: number; issues: string[] }> {
  "use step";
  // v5.7.13:E3/E4 故意跳過(同 aiReviewReport 註釋)、return 預設 85 不審核
  if (!['C', 'D', 'R', 'E1', 'E2', 'G15'].includes(planCode)) return { score: 85, issues: [] }

  await emitProgress({ step: 'AI審核(legacy)', progress: 72, message: '單 Claude 自審中...' })

  const tStart = Date.now()
  try {
    const apiKey = getNextClaudeKey()
    if (!apiKey) return { score: 80, issues: ['無可用 API Key'] }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      // v5.3.9：Claude Opus 4.7 不接受 temperature 參數
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `你是一個花了真金白銀買命理報告的客戶。你剛讀完整份報告。請從客戶角度評分。

評分標準（每項 20 分，總分 100）：
1. **一針見血**（20分）：讀第一段就有「靠，這也太準了」的衝擊感嗎？每章開頭的結論夠犀利嗎？
2. **重點清晰**（20分）：只看粗體就能抓到 80% 重點嗎？三段式總結（好的/注意/改善）齊全嗎？
3. **具體可行**（20分）：改善建議夠具體嗎？有「做什麼、什麼時候做」嗎？不是泛泛的「注意健康」？
4. **命理依據**（20分）：每個結論都有標明來自哪個系統嗎？多系統交叉驗證有做到嗎？
5. **物超所值**（20分）：整體讀完覺得物超所值嗎？會推薦給朋友嗎？

只回 JSON：{"score":85,"issues":["具體問題1","具體問題2"],"highlights":["做得好的1","做得好的2"]}

報告全文（${reportContent.length} 字）：
${reportContent}`
        }],
      })
    })

    if (!res.ok) {
      // v5.3.5：寫失敗 log（含 latency）
      try {
        await recordAIUsage({
          provider: 'anthropic',
          model: 'claude-opus-4-6',
          promptTokens: 0,
          completionTokens: 0,
          reportId,
          planCode,
          callStage: 'review_legacy',
          latencyMs: Date.now() - tStart,
          status: 'error',
          errorMessage: `HTTP ${res.status}`,
        })
      } catch { /* log 失敗不影響主流程 */ }
      return { score: 80, issues: ['AI審核API失敗'] }
    }
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const promptTokens = Number(data?.usage?.input_tokens || 0)
    const completionTokens = Number(data?.usage?.output_tokens || 0)

    // v5.3.5：寫成功 log
    try {
      await recordAIUsage({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens,
        completionTokens,
        reportId,
        planCode,
        callStage: 'review_legacy',
        latencyMs: Date.now() - tStart,
        status: 'success',
      })
    } catch { /* log 失敗不影響主流程 */ }

    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const result = JSON.parse(match[0])
      const highlights = result.highlights || []
      console.log(`AI 審核分數: ${result.score}, 問題: ${result.issues?.length || 0}, 亮點: ${highlights.length}`)
      return { score: result.score || 80, issues: result.issues || [] }
    }
    return { score: 80, issues: [] }
  } catch (e) {
    console.error('AI 審核失敗:', e)
    try {
      await recordAIUsage({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 0,
        completionTokens: 0,
        reportId,
        planCode,
        callStage: 'review_legacy',
        latencyMs: Date.now() - tStart,
        status: 'error',
        errorMessage: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
      })
    } catch { /* log 失敗不影響主流程 */ }
    return { score: 80, issues: [] }
  }
}

// ── Step 3.7: 內容安全審查（黑名單 + AI Moderation）──
// 回傳：action = pass / warn / retry_with_guard / hard_block
// retry_with_guard 時 workflow 可在 prompt 附上 guardInstruction 重跑一次
export async function contentModerationStep(
  reportId: string,
  reportContent: string,
  planCode: string,
  options: { skipAi?: boolean; customerName?: string; otherClientNames?: string[]; retryAttempt?: number } = {},
) {
  "use step";
  await emitProgress({ step: '內容審查', progress: 74, message: '正在執行內容安全審查...' })

  try {
    const { moderateContent, logModerationEvent } = await import('@/lib/content-moderation')
    const report = await moderateContent(reportContent, {
      skipAi: options.skipAi,
      customerName: options.customerName,
      otherClientNames: options.otherClientNames,
    })

    // 無論通過與否都記錄（方便日後稽核）
    await logModerationEvent({
      reportId,
      planCode,
      action: report.action,
      blocked: report.blocked,
      reason: report.reason,
      hits: report.blacklistHits,
      aiScores: report.ai?.scores || {},
      contentPreview: reportContent.slice(0, 500),
      retryAttempt: options.retryAttempt ?? 0,
    })

    console.log(
      `[content-moderation] ${reportId} ${planCode}: action=${report.action}, ` +
      `黑名單命中 ${report.blacklistHits.length} 項, 警告 ${report.warnings.length} 項`,
    )

    return {
      action: report.action,
      blocked: report.blocked,
      warnings: report.warnings,
      guardInstruction: report.guardInstruction || '',
      reason: report.reason,
      blacklistCount: report.blacklistHits.length,
    }
  } catch (e) {
    // 審查自身失敗不阻塞報告交付（降級為 pass）
    console.error('[content-moderation] 執行失敗，降級為 pass:', e)
    return {
      action: 'pass' as const,
      blocked: false,
      warnings: [`content-moderation 執行例外: ${e instanceof Error ? e.message : String(e)}`],
      guardInstruction: '',
      reason: 'moderation-error-fallback',
      blacklistCount: 0,
    }
  }
}
contentModerationStep.maxRetries = 1

// ── Step 4: 更新 Supabase 報告狀態為 completed ──
export async function saveReportToSupabase(
  reportId: string, reportContent: string, aiModel: string,
  analyses: Array<{ system: string; score: number }>, pdfUrl: string | null,
  top5Timings?: unknown,
) {
  "use step";
  await emitProgress({ step: '儲存報告', progress: 90, message: '正在儲存報告...' })

  // 清除 ai_content 中殘留的 JSON 區塊（引擎注入的 top 結果被 AI 原樣複製）
  let cleanContent = reportContent
  cleanContent = cleanContent.replace(/\{[\s\S]*?"week"\s*:\s*\d[\s\S]*?\}/g, '')  // 移除 {"week":...} JSON
  cleanContent = cleanContent.replace(/```json[\s\S]*?```/g, '')  // 移除 ```json``` 區塊
  cleanContent = cleanContent.replace(/===TOP\d_JSON_START===[\s\S]*?===TOP\d_JSON_END===/g, '')  // 移除標記
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n')  // 清理多餘空行

  const reportResult: Record<string, unknown> = {
    report_id: reportId,
    systems_count: analyses.length,
    analyses_summary: analyses,
    ai_content: cleanContent,
    ai_model: aiModel,
    ai_tokens: cleanContent.length,
  }
  if (top5Timings) reportResult.top5_timings = top5Timings

  const supabase = getSupabase()

  // 原子操作：只有 generating 狀態才能寫入 completed
  // 防止 cron 已標記 failed 後被覆蓋，或已完成的報告被重複寫入
  // v5.3.32：加 45 秒 timeout 保護，避免 Supabase 回應卡住讓 workflow 停滯
  const savePromise = supabase.from('paid_reports').update({
    report_result: reportResult,
    pdf_url: pdfUrl,
    status: 'completed',
    error_message: null,
  })
    .eq('id', reportId)
    .in('status', ['generating', 'pending', 'failed']) // 允許所有非 completed 狀態
    .select('id')

  const saveTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Supabase 更新超時（45秒）')), 45000),
  )

  let saved: Array<{ id: string }> | null = null
  let error: { message: string } | null = null
  try {
    const result = await Promise.race([savePromise, saveTimeout])
    saved = (result as { data: Array<{ id: string }> | null }).data
    error = (result as { error: { message: string } | null }).error
  } catch (e) {
    // timeout → 作為 retryable 錯誤拋出，Workflow 會自動重試
    throw new RetryableError(`Supabase 更新超時或異常: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (error) {
    throw new RetryableError(`Supabase 更新失敗: ${error.message}`)
  }

  if (!saved?.length) {
    // 報告已經是 completed（被另一個 workflow 實例先完成了）
    console.log(`⏭️ 報告 ${reportId} 已被其他實例完成，跳過重複寫入`)
    return true
  }

  // v5.3.2：報告完成 → 寫 funnel report_generated（僅首次完成時）
  try {
    const { data: reportMeta } = await supabase
      .from('paid_reports')
      .select('stripe_session_id, plan_code, amount_usd')
      .eq('id', reportId)
      .maybeSingle()
    if (reportMeta?.stripe_session_id) {
      const { trackFunnelServer } = await import('@/lib/funnel-tracker')
      await trackFunnelServer({
        sessionId: reportMeta.stripe_session_id,
        step: 'report_generated',
        planCode: (reportMeta.plan_code || '').split(/\s/)[0],
        reportId,
        amountUsd: Number(reportMeta.amount_usd) || null,
      })
    }
  } catch { /* funnel 寫入失敗不影響主流程 */ }

  console.log(`✅ 報告 ${reportId} 已標記完成`)
  return true
}

// ── Email 亮點提取 ──
function getEmailHighlights(planCode: string, reportContent: string, isCN: boolean): string[] {
  const highlights: string[] = []
  const text = reportContent.replace(/[#*`]/g, '')

  if (planCode === 'C') {
    // 人生藍圖：提取命格角色名 + 年度關鍵詞
    const roleMatch = text.match(/命格角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/你的角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/角色名稱[：:]\s*(.{2,20})/)?.[1]
    if (roleMatch) {
      highlights.push(isCN ? `你的命格角色：${roleMatch.trim()}` : `你的命格角色：${roleMatch.trim()}`)
    }
    const keywordMatch = text.match(/年度關鍵[詞词][：:]\s*(.{2,30})/)?.[1]
      || text.match(/年度关键[詞词][：:]\s*(.{2,30})/)?.[1]
    if (keywordMatch) {
      highlights.push(isCN ? `年度关键词：${keywordMatch.trim()}` : `年度關鍵詞：${keywordMatch.trim()}`)
    }
    highlights.push(isCN ? '东西方命理系统已完成交叉验证' : '東西方命理系統已完成交叉驗證')
  } else if (planCode === 'D') {
    highlights.push(isCN ? '你的问题已从多个角度深度分析' : '你的問題已從多個角度深度分析')
    highlights.push(isCN ? '结合命理与心理学给出具体建议' : '結合命理與心理學給出具體建議')
  } else if (planCode === 'G15') {
    highlights.push(isCN ? '家族成员的互动模式已解析' : '家族成員的互動模式已解析')
    highlights.push(isCN ? '家族能量流动与角色定位已完成' : '家族能量流動與角色定位已完成')
  } else if (isChumenjiPlan(planCode)) {
    // 出門訣 E1/E2/E3：提取 Top1 吉時 + 方位
    const timeMatch = text.match(/(?:最佳|第一|Top\s*1)[吉時时]*[：:]\s*(.{2,20})/)?.[1]
    const dirMatch = text.match(/(?:最佳|建議|建议)方位[：:]\s*(.{2,10})/)?.[1]
    if (timeMatch) {
      highlights.push(isCN ? `最佳吉时：${timeMatch.trim()}` : `最佳吉時：${timeMatch.trim()}`)
    }
    if (dirMatch) {
      highlights.push(isCN ? `建议方位：${dirMatch.trim()}` : `建議方位：${dirMatch.trim()}`)
    }
    highlights.push(isCN ? '奇门遁甲 25+ 步精算完成' : '奇門遁甲 25+ 步精算完成')
  } else if (planCode === 'R') {
    highlights.push(isCN ? '双方命格已完成交叉比对' : '雙方命格已完成交叉比對')
    highlights.push(isCN ? '关系互动模式与建议已生成' : '關係互動模式與建議已生成')
  }

  // 保底：如果沒提取到任何亮點，至少給一條通用的
  if (highlights.length === 0) {
    highlights.push(isCN ? '你的专属命理报告已完成深度分析' : '你的專屬命理報告已完成深度分析')
  }

  return highlights
}

function getEmailCta(planCode: string, isCN: boolean): string {
  switch (planCode) {
    case 'C': return isCN ? '查看完整命格报告 →' : '查看完整命格報告 →'
    case 'D': return isCN ? '查看深度解答 →' : '查看深度解答 →'
    case 'G15': return isCN ? '查看家族分析报告 →' : '查看家族分析報告 →'
    case 'E1': case 'E2': case 'E3': case 'E4': return isCN ? '查看最佳吉时推荐 →' : '查看最佳吉時推薦 →'
    case 'R': return isCN ? '查看合盘分析报告 →' : '查看合盤分析報告 →'
    default: return isCN ? '查看完整报告 →' : '查看完整報告 →'
  }
}

// ── Step 5: 寄送 Email ──
export async function sendReportEmail(
  reportId: string, customerEmail: string, accessToken: string,
  birthData: BirthData, planCode: string, reportContent: string,
  analysesCount: number,
) {
  "use step";
  if (!customerEmail || !accessToken) {
    console.log('缺少 email 或 access_token，跳過寄信')
    return false
  }

  await emitProgress({ step: '寄送通知', progress: 95, message: '正在寄送報告通知郵件...' })

  // v5.7.13:改 PLAN_NAMES from lib/plan-names
  const planName = PLAN_NAMES[planCode] || '命理分析報告'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const reportUrl = `${siteUrl}/report/${accessToken}`
  const isCN = birthData.locale === 'zh-CN'
  const emailFont = isCN
    ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
    : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"
  const emailLang = isCN ? 'zh-CN' : 'zh-TW'

  const emailText = {
    brand: isCN ? '鉴 源' : '鑒 源',
    subtitle: isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台',
    notice: isCN ? '✦ 报告完成通知' : '✦ 報告完成通知',
    title: (() => {
      const displayName = birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports'
        ? ((birthData.member_names as string[] | undefined)?.filter(Boolean).join('、') || '')
        : birthData.plan_type === 'family'
        ? ((birthData.members as Array<{ name?: string }> | undefined)?.map(m => m.name).filter(Boolean).join('、') || '')
        : (birthData.name || '')
      return isCN ? `${displayName}，您的报告已完成` : `${displayName}，您的報告已完成`
    })(),
    systemCount: isChumenjiPlan(planCode)
      ? (isCN ? `${planName} · 奇门遁甲精算` : `${planName} · 奇門遁甲精算`)
      : planCode === 'G15'
      ? (isCN ? `${planName} · 家族互动分析` : `${planName} · 家族互動分析`)
      : planCode === 'C'
      ? (isCN ? `${planName} · 东西方命理系统深度分析` : `${planName} · 東西方命理系統深度分析`)
      : (isCN ? `${planName} · 精选相关命理系统分析` : `${planName} · 精選相關命理系統分析`),
    cta: getEmailCta(planCode, isCN),
    linkNote: isCN ? '此链接专属于您，无需登录即可查看' : '此連結專屬於您，無需登入即可查看',
    promoTitle: isCN ? '🧭 加强您的命理能量' : '🧭 加強您的命理能量',
    promoBody: isCN
      ? '报告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出门诀</strong>能帮您在最佳时机、最佳方位行动，将命理洞察转化为日常决策的参考依据。'
      : '報告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出門訣</strong>能幫您在最佳時機、最佳方位行動，將命理洞察轉化為日常決策的參考依據。',
    promoLink: isCN ? '了解出门诀方案 →' : '了解出門訣方案 →',
    footer: isCN ? '如有任何问题，请联系' : '如有任何問題，請聯繫',
    copyright: isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life',
    subject: (() => {
      const subjectName = birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports'
        ? ((birthData.member_names as string[] | undefined)?.filter(Boolean).join('、') || '')
        : birthData.plan_type === 'family'
        ? ((birthData.members as Array<{ name?: string }> | undefined)?.map(m => m.name).filter(Boolean).join('、') || '')
        : (birthData.name || '')
      return isCN
        ? `${subjectName}，您的${planName}已完成`
        : `${subjectName}，您的${planName}已完成`
    })(),
    from: isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>',
  }

  const emailHighlights = getEmailHighlights(planCode, reportContent, isCN)
  const highlightsHtml = emailHighlights.map(h =>
    `<div style="color:#d1d5db;font-size:14px;line-height:1.8;margin:0 0 8px 0;"><span style="color:#c9a84c;margin-right:6px;">✦</span>${h}</div>`
  ).join('')
  const resend = new Resend(process.env.RESEND_API_KEY || '')

  // List-Unsubscribe header（Gmail/Yahoo 2024 大宗寄件人硬要求）
  // https://support.google.com/mail/answer/81126
  const unsubscribeUrl = getUnsubscribeUrl(customerEmail)
  const listUnsubscribeHeaders = {
    'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@jianyuan.life?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }

  let sendResult: { id?: string } | null = null
  let sendErr: unknown = null
  // v5.3.32：Resend API 加 30 秒 timeout，避免 Email API hang 拖垮整個 workflow
  const emailTimeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Resend API 超時（30秒）')), 30000),
  )
  try {
    const resendSendPromise = resend.emails.send({
    from: emailText.from,
    to: customerEmail,
    subject: emailText.subject,
    headers: listUnsubscribeHeaders,
    html: `<!DOCTYPE html>
<html lang="${emailLang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${emailText.brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${emailText.subtitle}</div>
    </div>
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;letter-spacing:2px;margin-bottom:8px;">${emailText.notice}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 8px 0;">${emailText.title}</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px 0;">${emailText.systemCount}</p>
      <div style="background:rgba(255,255,255,0.05);border-left:3px solid #c9a84c;border-radius:4px;padding:16px;margin-bottom:24px;">
        ${highlightsHtml}
      </div>
      <div style="text-align:center;">
        <a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:1px;">${emailText.cta}</a>
        <p style="color:#6b7280;font-size:12px;margin:12px 0 0 0;">${emailText.linkNote}</p>
      </div>
    </div>
    ${!isChumenjiPlan(planCode) ? `
    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;font-weight:600;margin-bottom:8px;">${emailText.promoTitle}</div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.7;margin:0 0 16px 0;">${emailText.promoBody}</p>
      <a href="https://jianyuan.life/pricing" style="color:#c9a84c;font-size:13px;text-decoration:none;">${emailText.promoLink}</a>
    </div>` : ''}
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${emailText.footer} <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a></p>
      <p style="margin-top:8px;">${emailText.copyright}</p>
      ${getUnsubscribeHtml(customerEmail)}
    </div>
  </div>
</body>
</html>`,
    })
    const resendRaw = await Promise.race([resendSendPromise, emailTimeoutPromise])
    // Resend v2 回傳 { data, error } 結構，需要 unwrap
    const unwrapped = resendRaw as unknown as { data: { id?: string } | null; error: unknown }
    if (unwrapped.error) {
      sendErr = unwrapped.error
    } else if (unwrapped.data) {
      sendResult = { id: unwrapped.data.id }
    }
  } catch (err) {
    sendErr = err
  }

  // 寫入 email_send_log（不論成功失敗都記）
  await recordEmailSend({
    resendId: (sendResult && 'data' in sendResult
      ? (sendResult as unknown as { data?: { id?: string } }).data?.id
      : sendResult?.id) || null,
    toEmail: customerEmail,
    fromEmail: emailText.from,
    emailType: 'report_ready',
    subject: emailText.subject,
    reportId,
    status: sendErr ? 'failed' : 'sent',
    errorMessage: sendErr ? (sendErr instanceof Error ? sendErr.message : String(sendErr)).slice(0, 400) : null,
    metadata: { plan: planCode, analyses: analysesCount },
  })

  if (sendErr) {
    // Telegram 告警 + 拋錯讓 workflow 重試
    try {
      await notifyEmailFailed(reportId, customerEmail,
        sendErr instanceof Error ? sendErr.message : String(sendErr))
    } catch { /* 告警失敗不阻塞 */ }
    console.error('Resend 寄信失敗:', sendErr)
    throw sendErr
  }

  // 更新 email_sent_at
  const supabase = getSupabase()
  await supabase.from('paid_reports')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', reportId)

  console.log(`✅ Email 已寄送至 ${customerEmail}`)
  return true
}
sendReportEmail.maxRetries = 2

// ── Step 6: 標記失敗 + 發送告警 Email + 客戶致歉信 ──
// L4 P0 升級：達最終失敗（retry_count >= 3）時自動寄客戶致歉信，承諾 24 小時人工接手協助補開新單（依電子商品慣例不支援退款，v5.7.8 升級）
export async function markReportFailed(reportId: string, errorMessage: string) {
  "use step";
  const supabase = getSupabase()

  // 先查報告資料（供致歉信使用 + 判斷是否達最終失敗）
  const { data: reportData } = await supabase
    .from('paid_reports')
    .select('customer_email, plan_code, retry_count, birth_data, apology_sent_at')
    .eq('id', reportId)
    .maybeSingle()

  await supabase.from('paid_reports').update({
    status: 'failed',
    error_message: errorMessage,
  }).eq('id', reportId)
  console.error(`報告 ${reportId} 標記為失敗: ${errorMessage}`)

  // Telegram 即時告警給老闆
  try {
    const { notifyFailed, notifyWorkflowFailed } = await import('@/lib/ai/observability/telegram')
    await notifyFailed(reportId, errorMessage)
    // 如果已達 3 次重試仍失敗，再發一次 workflow 崩潰告警（需立刻人工介入）
    if ((reportData?.retry_count ?? 0) >= 3) {
      await notifyWorkflowFailed(reportId, errorMessage, 'final_failure_after_3_retries')
    }
  } catch (e) {
    console.warn('Telegram 告警失敗（不阻塞）:', e)
  }

  const resend = new Resend(process.env.RESEND_API_KEY || '')

  // 發送告警 Email 通知管理員
  try {
    const alertSubj = `⚠️ 報告生成失敗：${reportId.slice(0, 8)}`
    const alertRes = await resend.emails.send({
      from: '鑒源系統告警 <reports@jianyuan.life>',
      to: 'support@jianyuan.life',
      subject: alertSubj,
      html: `
        <h2>報告生成失敗告警</h2>
        <p><strong>報告 ID：</strong>${reportId}</p>
        <p><strong>錯誤訊息：</strong>${errorMessage}</p>
        <p><strong>客戶 Email：</strong>${reportData?.customer_email || '（未知）'}</p>
        <p><strong>方案：</strong>${reportData?.plan_code || '（未知）'}</p>
        <p><strong>重試次數：</strong>${reportData?.retry_count ?? 0}</p>
        <p><strong>時間：</strong>${new Date().toISOString()}</p>
        <hr />
        <p>請前往 <a href="https://jianyuan.life/jamie/orders">管理後台</a> 查看並處理。</p>
      `,
    })
    await recordEmailSend({
      resendId: (alertRes as unknown as { data?: { id?: string } })?.data?.id || null,
      toEmail: 'support@jianyuan.life',
      fromEmail: '鑒源系統告警 <reports@jianyuan.life>',
      emailType: 'admin_alert',
      subject: alertSubj,
      reportId,
      status: 'sent',
      metadata: { errorMessage },
    })
    console.log(`📧 告警 Email 已發送（報告 ${reportId}）`)
  } catch (emailErr) {
    // 告警 Email 失敗不影響主流程
    console.error('告警 Email 發送失敗:', emailErr)
    await recordEmailSend({
      toEmail: 'support@jianyuan.life',
      emailType: 'admin_alert',
      subject: `⚠️ 報告生成失敗：${reportId.slice(0, 8)}`,
      reportId,
      status: 'failed',
      errorMessage: emailErr instanceof Error ? emailErr.message : String(emailErr),
    })
  }

  // 客戶致歉信：僅在達最終失敗（retry_count >= 3）且尚未寄過時發送
  const retryCount = (reportData?.retry_count as number | undefined) ?? 0
  const customerEmailFailed = reportData?.customer_email as string | undefined
  const alreadySent = !!reportData?.apology_sent_at

  if (customerEmailFailed && retryCount >= 3 && !alreadySent) {
    try {
      const planCode = (reportData?.plan_code as string | undefined) || ''
      // v5.7.13:改 PLAN_NAMES from lib/plan-names
      const planName = PLAN_NAMES[planCode] || '命理報告'

      const birthDataObj = (reportData?.birth_data || {}) as Record<string, unknown>
      const rawLocale = typeof birthDataObj['locale'] === 'string'
        ? String(birthDataObj['locale'])
        : 'zh-TW'
      const isCN = rawLocale === 'zh-CN'
      const emailFont = isCN
        ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
        : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"
      const emailLang = isCN ? 'zh-CN' : 'zh-TW'

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
      // v5.7.6:鑒源依電子商品慣例不支援退款、移除 refund link、改強化客服路徑
      const supportEmail = 'support@jianyuan.life'
      const supportMailtoSubject = encodeURIComponent((isCN ? '报告处理协助 ' : '報告處理協助 ') + reportId.slice(0, 8))
      const supportMailtoUrl = `mailto:${supportEmail}?subject=${supportMailtoSubject}&body=${encodeURIComponent('您好、我的報告生成失敗、煩請協助補開新單。報告編號:' + reportId.slice(0, 8))}`
      const subject = isCN
        ? `关于您的${planName}报告 — 我们正在处理`
        : `關於您的${planName}報告 — 我們正在處理`
      const from = isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>'

      const apologyHtml = isCN ? `
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">您好，</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">很抱歉通知您，您的<strong style="color:#c9a84c;">${planName}</strong>报告在生成过程中遇到技术问题，系统经多次自动重试仍未能完成。</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">我们的团队已收到告警并介入处理：</p>
      <ul style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 20px 0;padding-left:20px;">
        <li><strong style="color:#c9a84c;">24 小时内</strong>客服将协助您补开新单（不会多扣款）</li>
        <li>报告已进入优先处理队列、由人工接手生成</li>
        <li>请留意您的邮箱、若有任何疑问随时联系客服</li>
      </ul>
      ` : `
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">您好，</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">很抱歉通知您，您的<strong style="color:#c9a84c;">${planName}</strong>報告在生成過程中遇到技術問題，系統經多次自動重試仍未能完成。</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">我們的團隊已收到告警並介入處理：</p>
      <ul style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 20px 0;padding-left:20px;">
        <li><strong style="color:#c9a84c;">24 小時內</strong>客服將協助您補開新單(不會多扣款)</li>
        <li>報告已進入優先處理佇列、由人工接手生成</li>
        <li>請留意您的信箱、若有任何疑問隨時聯繫客服</li>
      </ul>
      `

      // v5.7.8:不退款、改「聯繫客服補開」單一 CTA(原變數名 ctaRefund 改 ctaSupport 對齊政策)
      const ctaSupport = isCN ? '联系客服补开' : '聯繫客服補開'
      const ctaContact = isCN ? '联系客服' : '聯繫客服'
      const refIdLabel = isCN ? '报告编号' : '報告編號'
      const brand = isCN ? '鉴 源' : '鑒 源'
      const subtitle = isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台'
      const notice = isCN ? '✦ 报告处理通知' : '✦ 報告處理通知'
      const titleText = isCN ? '您的报告正在人工处理中' : '您的報告正在人工處理中'
      const copyright = isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life'
      const footer = isCN ? '如有任何疑问，请联系' : '如有任何疑問，請聯繫'

      const unsubscribeUrlApology = getUnsubscribeUrl(customerEmailFailed)

      let apologyResId: string | null = null
      let apologyErr: unknown = null
      try {
        const apologyRaw = await resend.emails.send({
        from,
        to: customerEmailFailed,
        subject,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrlApology}>, <mailto:unsubscribe@jianyuan.life?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: `<!DOCTYPE html>
<html lang="${emailLang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${subtitle}</div>
    </div>
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;letter-spacing:2px;margin-bottom:8px;">${notice}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 16px 0;">${titleText}</h1>
      ${apologyHtml}
      <div style="margin-top:24px;">
        <a href="${supportMailtoUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;letter-spacing:1px;margin:4px 8px 4px 0;">${ctaSupport}</a>
        <a href="mailto:${supportEmail}?subject=${encodeURIComponent((isCN ? '报告处理询问 ' : '報告處理詢問 ') + reportId.slice(0, 8))}" style="display:inline-block;background:transparent;color:#c9a84c;border:1px solid #c9a84c;font-weight:700;font-size:14px;padding:11px 24px;border-radius:8px;text-decoration:none;letter-spacing:1px;margin:4px 0;">${ctaContact}</a>
      </div>
      <p style="color:#6b7280;font-size:12px;margin:20px 0 0 0;">${refIdLabel}：${reportId.slice(0, 8)}</p>
    </div>
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${footer} <a href="mailto:${supportEmail}" style="color:#c9a84c;">${supportEmail}</a></p>
      <p style="margin-top:8px;">${copyright}</p>
      ${getUnsubscribeHtml(customerEmailFailed)}
    </div>
  </div>
</body>
</html>`,
      })
        const apologyUnwrapped = apologyRaw as unknown as { data?: { id?: string } | null; error?: unknown }
        if (apologyUnwrapped?.error) apologyErr = apologyUnwrapped.error
        else apologyResId = apologyUnwrapped?.data?.id || null
      } catch (err) {
        apologyErr = err
      }

      // 不論成敗都記 log
      await recordEmailSend({
        resendId: apologyResId,
        toEmail: customerEmailFailed,
        fromEmail: from,
        emailType: 'report_failed_apology',
        subject,
        reportId,
        status: apologyErr ? 'failed' : 'sent',
        errorMessage: apologyErr
          ? (apologyErr instanceof Error ? apologyErr.message : String(apologyErr)).slice(0, 400)
          : null,
        metadata: { plan: planCode, retryCount },
      })

      if (apologyErr) {
        try { await notifyEmailFailed(reportId, customerEmailFailed,
          apologyErr instanceof Error ? apologyErr.message : String(apologyErr))
        } catch { /* ignore */ }
        console.error('客戶致歉信發送失敗:', apologyErr)
      } else {
        // 紀錄已寄（防重複）；若欄位尚未建立僅 warn，不中斷流程
        try {
          await supabase.from('paid_reports')
            .update({ apology_sent_at: new Date().toISOString() })
            .eq('id', reportId)
        } catch (updErr) {
          console.warn('apology_sent_at 更新失敗（可能欄位尚未建立）:', updErr)
        }
        console.log(`📧 客戶致歉信已寄至 ${customerEmailFailed}（報告 ${reportId.slice(0, 8)}）`)
      }
    } catch (apologyErr) {
      // 致歉信失敗不影響 failed 標記
      console.error('客戶致歉信發送失敗:', apologyErr)
    }
  }
}

// ── Step: 關閉進度串流 ──
export async function closeProgressStream() {
  "use step";
  const writable = getWritable<ProgressUpdate>()
  await writable.close()
}

// ── Step 6b: 標記為 needs_human_review（5 LLM QA 連續失敗用）──
// Post-Gen 5 LLM QA Pipeline (2026-04-18)：
//   5 LLM 評分連續 3 次 < 門檻 → 不交付、不 failed，改為 needs_human_review
//   老闆到 /jamie/quality-reports 手動審理（放行 / 重生成 / 退款）
export async function markReportNeedsHumanReview(
  reportId: string,
  reason: string,
  fiveLLMSnapshot?: {
    scores: Record<string, number>
    avg: number
    min: number
    max: number
    severity: string
    criticalErrors: string[]
  },
  reportContent?: string,
  aiModel?: string,
): Promise<void> {
  "use step";
  const supabase = getSupabase()

  const updatePayload: Record<string, unknown> = {
    status: 'needs_human_review',
    error_message: `[需人工審核] ${reason}`.slice(0, 500),
  }

  // v5.3.18：把 Claude 寫的內容也存起來，避免 /jamie/quality-reports 查不到原文
  //   老闆反映三份失敗 C 方案 report_result 都 0 bytes，無法手動 review
  //   根因：失敗後 workflow 直接 return，從不呼叫 saveReportToSupabase
  //   修：失敗時也存 ai_content，人工可一鍵放行（不用重跑再燒 Claude）
  if (reportContent && reportContent.length > 0) {
    updatePayload.report_result = {
      ai_content: reportContent,
      systems_count: 0,
      analyses_summary: [],
      generated_at: new Date().toISOString(),
      flagged_for_human_review: true,
      ai_model: aiModel || 'claude-opus-4-6',
    }
  }

  // 若有 5 LLM snapshot，寫入 qa_snapshot 欄位（需 schema 支援）
  if (fiveLLMSnapshot) {
    updatePayload.qa_snapshot = {
      ts: new Date().toISOString(),
      scores: fiveLLMSnapshot.scores,
      avg: fiveLLMSnapshot.avg,
      min: fiveLLMSnapshot.min,
      max: fiveLLMSnapshot.max,
      severity: fiveLLMSnapshot.severity,
      critical_errors: fiveLLMSnapshot.criticalErrors,
    }
  }

  const { error } = await supabase.from('paid_reports')
    .update(updatePayload)
    .eq('id', reportId)

  if (error) {
    // qa_snapshot 欄位不存在 → fallback 不帶該欄位再試一次
    console.warn('markReportNeedsHumanReview 含 qa_snapshot 失敗，fallback:', error.message)
    const fallbackPayload: Record<string, unknown> = {
      status: 'needs_human_review',
      error_message: `[需人工審核] ${reason}`.slice(0, 500),
    }
    if (reportContent && reportContent.length > 0) {
      fallbackPayload.report_result = { ai_content: reportContent }
    }
    await supabase.from('paid_reports').update(fallbackPayload).eq('id', reportId)
  }

  console.error(`報告 ${reportId} 標記為 needs_human_review: ${reason}（含 ${reportContent?.length ?? 0} 字 AI 內容）`)
}

// ── 匯出輔助常數（供 workflow 使用） ──
export { PLAN_SYSTEM_PROMPT } from './plan-prompts'
// 從 c_plan_v2 re-export 附錄生成函式（供 index.ts 使用）
export { buildAppendix } from '@/prompts/c_plan_v2'
