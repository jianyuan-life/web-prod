// ============================================================
// 報告生成 Workflow — Step Functions（完整 Node.js 存取）
// 每個 step 自動重試、結果持久化
// ============================================================

import { getWritable } from 'workflow'
import { FatalError, RetryableError } from 'workflow'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import {
  getAgeGroup,
  buildCall1Prompt, buildCall2Prompt, buildCall3Prompt,
  buildUserPrompt, buildAppendix,
  extractCall1Summary, extractCall1And2Summary,
  SYSTEM_GROUPS,
} from '@/prompts/c_plan_v2'

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
  cleaned = cleaned.replace(/^.*(?:第一幕|第二幕|第三幕|壓軸|收尾|完整分析請繼續閱讀).*$/gm, '')

  // 3. AI 批次標記
  cleaned = cleaned.replace(/（第[一二三四]批）/g, '')

  // 4. 改名建議段落刪除（包含關鍵詞的整段）
  cleaned = cleaned.replace(/^.*(?:建議改名|改名建議|建議名字改為).*$(\n(?!#).*$)*/gm, '')

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

  // 9. 連續空行
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

  // 2. 合併重複章節（如「五、感情與人際」出現兩次，保留後者——品質重跑版本通常更好）
  const sections = cleaned.split(/(?=^## )/m)
  const sectionMap = new Map<string, { index: number; content: string; length: number }>()
  const duplicateIndices = new Set<number>()

  // 標題正規化：移除編號、空白、括號內字數提示，只留核心關鍵字
  function normalizeSectionTitle(raw: string): string {
    return raw
      .replace(/[（(][^）)]*[字词詞][）)]/g, '') // 移除「（~3,500字）」
      .replace(/[（(]\s*~?\s*[\d,]+\s*[字词詞]?\s*[）)]/g, '') // 移除「(3500字)」
      .replace(/^[\s\d.、：:一二三四五六七八九十百千]+/g, '') // 移除開頭編號
      .replace(/[\s\d.、：:]+$/g, '') // 移除結尾編號
      .trim()
  }

  // 兩個標題是否足夠相似（>80% 重疊）
  function titlesAreSimilar(a: string, b: string): boolean {
    if (a === b) return true
    if (!a || !b) return false
    // 取較短的為基準，檢查較長的是否包含它
    const shorter = a.length <= b.length ? a : b
    const longer = a.length > b.length ? a : b
    if (longer.includes(shorter)) return true
    // 逐字比較相似度
    let matches = 0
    const chars = shorter.split('')
    for (const ch of chars) {
      if (longer.includes(ch)) matches++
    }
    return matches / shorter.length > 0.8
  }

  sections.forEach((sec, idx) => {
    const titleMatch = sec.match(/^## (.+?)[\n\r]/)
    if (!titleMatch) return
    const normalizedTitle = normalizeSectionTitle(titleMatch[1])
    if (!normalizedTitle) return

    // 檢查是否與已知標題相似
    let matchedKey: string | null = null
    for (const [key] of sectionMap) {
      if (titlesAreSimilar(key, normalizedTitle)) {
        matchedKey = key
        break
      }
    }

    if (matchedKey) {
      const existing = sectionMap.get(matchedKey)!
      // 保留後者（品質重跑的版本通常更完整）
      duplicateIndices.add(existing.index)
      sectionMap.set(matchedKey, { index: idx, content: sec, length: sec.length })
      console.log(`[cleanFinalReport] 合併重複章節: "${matchedKey}"（保留後者）`)
    } else {
      sectionMap.set(normalizedTitle, { index: idx, content: sec, length: sec.length })
    }
  })

  if (duplicateIndices.size > 0) {
    cleaned = sections.filter((_, idx) => !duplicateIndices.has(idx)).join('')
  }

  // 3. 刪除空章節（## 標題後到下一個 ## 之間不到 50 字）
  cleaned = cleaned.replace(/^## .+\n([\s\S]*?)(?=^## |$)/gm, (match, body) => {
    const bodyText = body.replace(/\s/g, '')
    if (bodyText.length < 50) {
      console.log(`[cleanFinalReport] 刪除空章節: ${match.split('\n')[0]}`)
      return ''
    }
    return match
  })

  // 4. 連續空行收攏
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

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
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { count: generatingCount } = await supabase
    .from('paid_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'generating')
    .gt('updated_at', thirtyMinAgo)

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
    await supabase
      .from('paid_reports')
      .update({
        generation_progress: {
          ...existing,
          [callLabel]: content,
          [`${callLabel}_updated`]: new Date().toISOString(),
        },
      })
      .eq('id', reportId)
  } catch (e) {
    // 存檔失敗不阻塞串流
    console.warn(`串流存檔失敗（${callLabel}）:`, e)
  }
}

// ── Claude 串流呼叫（內部輔助，非 step）——含 600s 超時 + 串流存檔 ──
async function claudeStreamingCall(
  systemPrompt: string, userPrompt: string, maxTokens: number,
  reportId?: string, callLabel?: string,
): Promise<string> {
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
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'user', content: actualUserPrompt }],
        system: systemPrompt,
        temperature: 0.7,
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

  return finalResult
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
  additionalPeople?: Array<{ name: string; gender: string; year: number; month: number; day: number; hour: string | number; time_unknown?: boolean }>,
): string {
  // G15 家族方案（舊版 family 模式）安全防護：多人 birthData 不能走單人 prompt
  if (birthData.plan_type === 'family' && Array.isArray(birthData.members)) {
    let memberPrompts = '家庭成員資料：\n'
    for (const m of birthData.members as Array<{ name?: string; gender?: string; year?: number; month?: number; day?: number; hour?: number }>) {
      memberPrompts += `\n【${m.name || ''}】${m.gender === 'M' ? '男' : '女'}，${m.year}年${m.month}月${m.day}日${m.hour}時\n`
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

  let userPrompt = `${birthData.name || ''}，${birthData.gender === 'M' ? '男' : '女'}，${birthData.year}年${birthData.month}月${birthData.day}日${birthData.hour}時
八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}
農曆：${cd.lunar_date || ''} | 納音：${cd.nayin || ''} | 命宮：${cd.ming_gong || ''}
${analyses.length}套系統排盤完整數據：
`
  for (const a of analyses.slice(0, 15)) {
    userPrompt += `\n【${a.system}】評分：${a.score}分`
    if (a.summary) userPrompt += `\n摘要：${a.summary}`
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
  userPrompt += `\n【報告生成日期】${generationDate}\nTop5 吉時只能推薦此日期之後（含當天）的日期，不可推薦已經過去的日期。\n`

  // 出門訣時間限制：客戶選的可配合時段
  if (birthData.available_time_slots && Array.isArray(birthData.available_time_slots) && birthData.available_time_slots.length > 0) {
    const slotsDesc = birthData.available_time_slots.map((s: { start?: string; end?: string }) => `${s.start || ''}~${s.end || ''}`).join('、')
    userPrompt += `\n【重要】客戶只有以下時段有空出門：${slotsDesc}\nTop5 吉時必須只推薦在這些時段內的時機，不可推薦客戶無法出門的時段。\n`
  }

  // E1 事件時間範圍
  if (birthData.event_start_date) {
    userPrompt += `\n事件時間範圍：${birthData.event_start_date} 至 ${birthData.event_end_date || birthData.event_start_date}\n`
  }

  if (topic) userPrompt += `\n分析方向：${topic}\n`
  if (question) userPrompt += `客戶問題描述：${question}\n`
  if (additionalPeople?.length) {
    userPrompt += `\n其他人資料：\n`
    for (const p of additionalPeople) {
      userPrompt += `- ${p.name}，${p.gender === 'M' ? '男' : '女'}，${p.year}年${p.month}月${p.day}日${p.hour === 'unknown' || p.time_unknown ? '（時辰不確定）' : ` ${p.hour}時`}\n`
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
async function callClaudeOnly(
  systemPrompt: string, userPrompt: string, maxTokens: number, label: string,
  reportId?: string,
): Promise<{ content: string; model: string }> {
  if (getClaudeApiKeys().length === 0) {
    throw new FatalError(`${label}: 缺少 CLAUDE_API_KEY，付費報告必須使用 Claude Opus。請到 console.anthropic.com 充值。`)
  }
  const content = await claudeStreamingCall(systemPrompt, userPrompt, maxTokens, reportId, label)
  console.log(`${label} 完成 (claude-opus-4-6): ${content.length} 字`)
  return { content, model: 'claude-opus-4-6' }
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
  const systemPrompt = buildCall1Prompt(ageGroup, clientNeed, birthData.locale)

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
  const systemPrompt = buildCall2Prompt(ageGroup, call1Summary, birthData.locale)

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
  const systemPrompt = buildCall3Prompt(ageGroup, birthData.name, call1and2Summary, birthData.locale)

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
) {
  "use step";
  const userPrompt = buildGenericUserPrompt(birthData, calcResult.client_data, calcResult.analyses, topic, question)
  const localizedPrompt = localizePrompt(systemPrompt, birthData.locale)

  // 付費報告只用 Claude Opus，不降級
  if (getClaudeApiKeys().length === 0) {
    throw new FatalError(`方案 ${planCode}: 缺少 CLAUDE_API_KEY，付費報告必須使用 Claude Opus。請到 console.anthropic.com 充值。`)
  }
  const content = await claudeStreamingCall(localizedPrompt, userPrompt, 128000, reportId, `${planCode}_main`)
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
export async function aiGenerateG15(
  familyReports: FamilyMemberReport[], planCode: string, systemPrompt: string, reportId?: string,
) {
  "use step";
  await emitProgress({ step: 'AI分析', progress: 30, message: '正在分析家族成員互動關係...' })

  // 從報告中提取關鍵互動數據，不餵原始報告全文（避免 AI 重複個人分析）
  let userPrompt = `家族藍圖分析 — 共 ${familyReports.length} 位成員\n\n`

  for (let i = 0; i < familyReports.length; i++) {
    const member = familyReports[i]
    const bd = member.birthData
    userPrompt += `=== 成員${i + 1}：${member.name} ===\n`
    userPrompt += `性別：${bd.gender === 'M' ? '男' : '女'}，出生：${bd.year}年${bd.month}月${bd.day}日${bd.hour}時\n`

    // 從報告中提取各系統關鍵數據摘要（每人約 200-300 字）
    const keyData = extractKeyDataForFamily(member.reportContent, bd)
    userPrompt += `命理關鍵數據：\n${keyData}\n\n`
  }

  userPrompt += `\n請根據以上所有成員的命理關鍵數據，撰寫完整的家族互動分析報告。
重要提醒：
1. 你收到的是每位成員的關鍵命理數據摘要，不是完整報告。不要試圖重寫個人命格分析。
2. 所有分析必須是成員之間的互動比較，不是個人特質描述。例如：「A的日主甲木與B的日主庚金形成甲庚沖」，而不是「A是甲木，性格正直」。
3. 著重分析成員之間的能量互補或衝突、相處模式、溝通建議。
4. 每個論點都必須引用具體的命理數據來支撐（如日柱、命宮主星、生肖關係等）。`

  const localizedPrompt = localizePrompt(systemPrompt, familyReports[0]?.birthData?.locale)

  if (getClaudeApiKeys().length === 0) {
    throw new FatalError('G15 家族藍圖：缺少 CLAUDE_API_KEY，付費報告必須使用 Claude Opus。')
  }
  const content = await claudeStreamingCall(localizedPrompt, userPrompt, 128000, reportId, 'G15_main')
  const cleaned = trimToLastCompleteSentence(cleanAIResponse(content))
  console.log(`G15 家族藍圖 AI 完成: ${cleaned.length} 字`)
  return { content: cleaned, model: 'claude-opus-4-6' }
}
aiGenerateG15.maxRetries = 2

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

    const analyses = calc.analyses || []
    userPrompt += `${analyses.length} 套系統排盤數據：\n`
    for (const a of analyses.slice(0, 15)) {
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
2. 每個分析論點都必須引用至少一個系統的具體合盤結果。
3. 禁止任何評分或分數——關係不該有分數，用文字描述而非數字。
4. 現在是2026年丙午年。
5. 好的地方和需要注意的地方都必須涉及雙方互動，不是個人特質描述。
6. 先給明確結論（合/不合/合但有致命雷區），再展開分析。`

  const localizedPrompt = localizePrompt(systemPrompt, birthData.locale)

  if (getClaudeApiKeys().length === 0) {
    throw new FatalError('R 方案合否：缺少 CLAUDE_API_KEY，付費報告必須使用 Claude Opus。')
  }
  const content = await claudeStreamingCall(localizedPrompt, userPrompt, 128000, reportId, 'R_main')
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

  const planNames: Record<string, string> = {
    C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
    R: '合否？', E1: '事件出門訣', E2: '月盤出門訣', Y: '年度運勢',
  }
  const planName = planNames[planCode] || '命理分析報告'

  // PDF 專用預處理：清除殘留橫線 + 轉換 Markdown 格式為 PDF 友好格式
  const pdfContent = reportContent
    .replace(/^---+$/gm, '')           // 標準 markdown 橫線
    .replace(/^___+$/gm, '')           // 底線型橫線
    .replace(/^\*\*\*+$/gm, '')        // 星號型橫線
    .replace(/^[\s]*[-─—═]+[\s]*$/gm, '') // 全形橫線/裝飾線
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
  const supabase = getSupabase()
  const pdfBytes = Buffer.from(pdfData.pdf_base64, 'base64')
  const storagePath = `${reportId}/report.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('reports')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('Supabase Storage 上傳失敗:', uploadErr)
    return null
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
) {
  "use step";
  await emitProgress({ step: '品質檢查', progress: 70, message: '正在執行品質閘門檢查...' })

  const warnings: string[] = []

  // 1. 系統數量檢查（C 方案需 15 套）
  if (planCode === 'C' && systemsCount < 15) {
    warnings.push(`排盤系統不足: 期望 15 套，實際 ${systemsCount} 套`)
  }

  // 2. C 方案必要章節檢查
  if (planCode === 'C') {
    const requiredSections = [
      { pattern: /命格名片|命格總覽|人生速覽/, name: '命格名片/人生速覽' },
      { pattern: /好的地方|天賦優勢|天賦.*Top|🟢/, name: '好的地方' },
      { pattern: /需要注意|課題|🟡/, name: '需要注意的地方' },
      { pattern: /改善建議|改善方案|改善|🔵/, name: '改善建議' },
      { pattern: /刻意練習/, name: '刻意練習' },
      { pattern: /寫給.*的話/, name: '寫給你的話' },
    ]
    for (const sec of requiredSections) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`缺少必要章節: ${sec.name}`)
      }
    }

    // 2b. 每個命理系統章節必須包含「好的地方」「需要注意」「改善建議」
    // regex 需涵蓋 AI 常見的各種用詞變體，避免誤報
    const systemNames = [
      '八字', '紫微', '奇門', '風水', '姓名學', '西洋占星', '吠陀占星',
      '易經', '人類圖', '塔羅', '數字能量', '古典占星', '生肖', '生物節律', '南洋術數',
    ]
    // 按 ## 切分章節
    const chapters = reportContent.split(/^## /m).slice(1)
    let missingSubsectionCount = 0
    for (const sysName of systemNames) {
      const sysChapter = chapters.find(ch => ch.startsWith(sysName) || ch.includes(sysName))
      if (!sysChapter) continue
      const hasPositive = /好的地方|好的方面|優勢|優點|天賦|強項|亮點|有利|正面|長處|閃光點|值得肯定/.test(sysChapter)
      const hasCaution = /需要注意|需注意|注意的地方|風險|挑戰|課題|考驗|提醒|留意|警示|弱點|不足|待改善|需要留意/.test(sysChapter)
      const hasImprovement = /改善方案|改善建議|改善|建議|行動指南|行動方案|實踐|練習|調整|具體做法|操作建議|成長方向/.test(sysChapter)
      if (!hasPositive) missingSubsectionCount++
      if (!hasCaution) missingSubsectionCount++
      if (!hasImprovement) missingSubsectionCount++
    }
    // 只在大量缺失時才警告（允許少數系統用詞不同）
    if (missingSubsectionCount > 6) {
      warnings.push(`${missingSubsectionCount} 個系統子章節缺少標準結構（好的地方/需要注意/改善建議）`)
    }
  }

  // 2c. E1/E2 出門訣必要章節檢查
  if (planCode === 'E1' || planCode === 'E2') {
    const e1e2Required = [
      { pattern: /事件吉凶|事件命理|本月運勢|本月命理|你的事件|本月出行能量/, name: planCode === 'E1' ? '事件吉凶分析' : '本月運勢概覽' },
      { pattern: /好的地方|優勢|有利/, name: '好的地方' },
      { pattern: /需要注意|注意|風險/, name: '需要注意的地方' },
      { pattern: /改善|建議|行動/, name: '改善建議' },
      { pattern: /補運|操作指南/, name: '補運操作指南' },
      { pattern: /忌方|忌日|注意事項/, name: '忌方忌日' },
    ]
    for (const sec of e1e2Required) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`出門訣缺少必要章節: ${sec.name}`)
      }
    }
    // Top5 JSON 檢查
    if (!/===TOP5_JSON_START===/.test(reportContent)) {
      warnings.push('出門訣缺少 Top5 吉時 JSON 區塊')
    }
    // 內容長度檢查
    if (reportContent.length < 3000) {
      warnings.push(`出門訣內容偏短: ${reportContent.length} 字（期望 > 3,000 字）`)
    }
  }

  // 2d. R 方案「合否？」必要章節檢查
  if (planCode === 'R') {
    const rRequired = [
      { pattern: /你們的問題|關係描述/, name: '你們的問題' },
      { pattern: /你們的答案|合否結論/, name: '你們的答案' },
      { pattern: /化學反應|合盤分析/, name: '化學反應' },
      { pattern: /好的地方|最好的/, name: '好的地方' },
      { pattern: /需要注意|最該注意/, name: '需要注意的地方' },
      { pattern: /改善建議|關係處方/, name: '改善建議' },
      { pattern: /刻意練習/, name: '刻意練習' },
      { pattern: /流年|2026|2027/, name: '關係流年' },
      { pattern: /寫給.*的話/, name: '寫給你們的話' },
    ]
    for (const sec of rRequired) {
      if (!sec.pattern.test(reportContent)) {
        warnings.push(`合否缺少必要章節: ${sec.name}`)
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
    if (reportContent.length < 8000) {
      warnings.push(`心之所惑內容偏短: ${reportContent.length} 字（期望 > 8,000 字）`)
    }
  }

  // 2f. G15 家族藍圖必要章節檢查
  if (planCode === 'G15') {
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
    // 內容長度檢查（依家庭人數，對齊 Prompt 字數要求）
    const memberCount = systemsCount || 2
    const minG15Length = memberCount <= 2 ? 8000 : memberCount <= 3 ? 10000 : 12000
    if (reportContent.length < minG15Length) {
      warnings.push(`家族藍圖內容偏短: ${reportContent.length} 字（期望 > ${minG15Length} 字）`)
    }
  }

  // 2f. C 方案字數下限（預期 30,000+ 字）
  if (planCode === 'C' && reportContent.length < 20000) {
    warnings.push(`人生藍圖內容偏短: ${reportContent.length} 字（期望 > 20,000 字）`)
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
  const passed = criticalWarnings.length === 0
  console.log(`品質閘門: ${passed ? '通過' : '警告'} (${warnings.length} 項, 嚴重 ${criticalWarnings.length} 項)`)
  return { passed, warnings }
}

// ── Step 3.5: AI 自我審核（全文審查，用客戶視角評分）──
export async function aiReviewReport(reportContent: string, planCode: string): Promise<{ score: number; issues: string[] }> {
  "use step";
  if (!['C', 'D', 'R', 'E1', 'E2', 'G15'].includes(planCode)) return { score: 85, issues: [] }

  await emitProgress({ step: 'AI審核', progress: 72, message: '正在進行全文品質審核...' })

  // 用 Claude Opus 自己審核自己寫的報告（看完全文，不截斷）
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
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `你是一個花了真金白銀買命理報告的客戶。你剛讀完整份報告。請從客戶角度評分。

評分標準（每項 20 分，總分 100）：
1. **一���見血**（20分）：讀第一段就有「靠，這也太準了」的衝擊感嗎？每章開頭的結論夠犀利嗎？
2. **重點清晰**（20分）：只看粗體就能抓到 80% 重點嗎？三段式���結（好的/注意/改善）齊全嗎？
3. **具體可行**（20分）：改善建議夠具體嗎？有「做什麼、什麼時候做」嗎？不是泛泛的「注意健康」？
4. **命理依據**（20分）：每個結論都有標明來自哪個系統嗎？多系統交叉驗證有做到嗎？
5. **物超所值**（20分）：整體讀完覺得物超所值嗎？會推薦給朋友嗎？

只回 JSON：{"score":85,"issues":["具體問題1","具體問題2"],"highlights":["做得好的1","做得好的2"]}

報告全文（${reportContent.length} 字）：
${reportContent}`
        }],
        temperature: 0.3,
      })
    })

    if (!res.ok) return { score: 80, issues: ['AI審核API失敗'] }
    const data = await res.json()
    const text = data.content?.[0]?.text || ''

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
    return { score: 80, issues: [] }
  }
}

// ── Step 4: 更新 Supabase 報告狀態為 completed ──
export async function saveReportToSupabase(
  reportId: string, reportContent: string, aiModel: string,
  analyses: Array<{ system: string; score: number }>, pdfUrl: string | null,
  top5Timings?: unknown,
) {
  "use step";
  await emitProgress({ step: '儲存報告', progress: 90, message: '正在儲存報告...' })

  const reportResult: Record<string, unknown> = {
    report_id: reportId,
    systems_count: analyses.length,
    analyses_summary: analyses,
    ai_content: reportContent,
    ai_model: aiModel,
    ai_tokens: reportContent.length,
  }
  if (top5Timings) reportResult.top5_timings = top5Timings

  const supabase = getSupabase()

  // 原子操作：只有 generating 狀態才能寫入 completed
  // 防止 cron 已標記 failed 後被覆蓋，或已完成的報告被重複寫入
  const { data: saved, error } = await supabase.from('paid_reports').update({
    report_result: reportResult,
    pdf_url: pdfUrl,
    status: 'completed',
    error_message: null,
  })
    .eq('id', reportId)
    .in('status', ['generating', 'pending', 'failed']) // 允許所有非 completed 狀態
    .select('id')

  if (error) {
    throw new RetryableError(`Supabase 更新失敗: ${error.message}`)
  }

  if (!saved?.length) {
    // 報告已經是 completed（被另一個 workflow 實例先完成了）
    console.log(`⏭️ 報告 ${reportId} 已被其他實例完成，跳過重複寫入`)
    return true
  }

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
  } else if (planCode === 'E1' || planCode === 'E2') {
    // 出門訣：提取 Top1 吉時 + 方位
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
    case 'E1': case 'E2': return isCN ? '查看最佳吉时推荐 →' : '查看最佳吉時推薦 →'
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

  const planNames: Record<string, string> = {
    C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
    R: '合否？', E1: '事件出門訣', E2: '月盤出門訣', Y: '年度運勢',
  }
  const planName = planNames[planCode] || '命理分析報告'
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
    systemCount: ['E1', 'E2'].includes(planCode)
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

  await resend.emails.send({
    from: emailText.from,
    to: customerEmail,
    subject: emailText.subject,
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
    ${!['E1', 'E2'].includes(planCode) ? `
    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;font-weight:600;margin-bottom:8px;">${emailText.promoTitle}</div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.7;margin:0 0 16px 0;">${emailText.promoBody}</p>
      <a href="https://jianyuan.life/pricing" style="color:#c9a84c;font-size:13px;text-decoration:none;">${emailText.promoLink}</a>
    </div>` : ''}
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${emailText.footer} <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a></p>
      <p style="margin-top:8px;">${emailText.copyright}</p>
    </div>
  </div>
</body>
</html>`,
  })

  // 更新 email_sent_at
  const supabase = getSupabase()
  await supabase.from('paid_reports')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', reportId)

  console.log(`✅ Email 已寄送至 ${customerEmail}`)
  return true
}
sendReportEmail.maxRetries = 2

// ── Step 6: 標記失敗 + 發送告警 Email ──
export async function markReportFailed(reportId: string, errorMessage: string) {
  "use step";
  const supabase = getSupabase()
  await supabase.from('paid_reports').update({
    status: 'failed',
    error_message: errorMessage,
  }).eq('id', reportId)
  console.error(`報告 ${reportId} 標記為失敗: ${errorMessage}`)

  // 發送告警 Email 通知管理員
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || '')
    await resend.emails.send({
      from: '鑒源系統告警 <reports@jianyuan.life>',
      to: 'support@jianyuan.life',
      subject: `⚠️ 報告生成失敗：${reportId.slice(0, 8)}`,
      html: `
        <h2>報告生成失敗告警</h2>
        <p><strong>報告 ID：</strong>${reportId}</p>
        <p><strong>錯誤訊息：</strong>${errorMessage}</p>
        <p><strong>時間：</strong>${new Date().toISOString()}</p>
        <hr />
        <p>請前往 <a href="https://jianyuan.life/admin">管理後台</a> 查看並處理。</p>
      `,
    })
    console.log(`📧 告警 Email 已發送（報告 ${reportId}）`)
  } catch (emailErr) {
    // 告警 Email 失敗不影響主流程
    console.error('告警 Email 發送失敗:', emailErr)
  }
}

// ── Step: 關閉進度串流 ──
export async function closeProgressStream() {
  "use step";
  const writable = getWritable<ProgressUpdate>()
  await writable.close()
}

// ── 匯出輔助常數（供 workflow 使用） ──
export { PLAN_SYSTEM_PROMPT } from './plan-prompts'
// 從 c_plan_v2 re-export 附錄生成函式（供 index.ts 使用）
export { buildAppendix } from '@/prompts/c_plan_v2'
