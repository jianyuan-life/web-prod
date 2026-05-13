// v5.10.246 Sprint 2.x:life-blueprint markdown parser(minimal、Top-1 ROI:bazi)
//
// 來源:Codex L3 + Gemini L4 共識(tasks/sprint_2_x_markdown_parser_plan.md)
// 推薦長期方案:LLM Extraction migration + 新訂單 Structured Outputs
// 本檔屬「過渡期 hybrid」:對既有 35 個 C 方案 row、用 regex 擷取最高 ROI fields(card5.bazi 起步)
//
// 設計原則(對應 Gemini「絕對嚴禁 Mock 物件 Spread」+ Codex「render 優先序」):
//   - 解析成功 → 用真資料
//   - 解析失敗 → return null、由 caller fallback(目前是 mock spread、Sprint 2.x 改 raw markdown)
//   - 不靜默吞錯、log warn 方便 debug
//
// 限制:
//   - 嚴格 markdown table format 依賴(LLM prompt 改版、表結構變化 → break)
//   - 換行符差異(\n vs \r\n)需處理
//   - 全形/半形空白都要兼容

import 'server-only'
import type { BaziPillars } from '@/types/report-schemas'

/**
 * 從 LifeBlueprintReport ai_content markdown 抽 4 柱八字
 *
 * 預期 markdown 結構(基於 v5.10.245 sample row、35 C row 抽樣)範例:
 * ```
 * **1. 四柱八字**
 *
 * | 柱 | 天干地支 | 納音 |
 * | 年柱 | 癸卯 | 金箔金 |
 * | 月柱 | 丁巳 | 沙中土 |
 * | 日柱 | 丙寅 | 爐中火 |
 * | 時柱 | 癸巳 | 長流水 |
 * ```
 *
 * dayMaster:從「日柱」干支的第一字提取(如「丙寅」→ 「丙」)
 *
 * @returns BaziPillars(全 5 fields 都成功才回)、否則 null
 */
export function extractBaziFromMarkdown(content: string): BaziPillars | null {
  if (!content || typeof content !== 'string') return null

  try {
    const year = matchPillar(content, '年柱')
    const month = matchPillar(content, '月柱')
    const day = matchPillar(content, '日柱')
    const hour = matchPillar(content, '時柱')

    if (!year || !month || !day || !hour) {
      console.warn('[md-parser] bazi pillars incomplete:', { year, month, day, hour })
      return null
    }

    // dayMaster = 日柱的第一字(天干)
    const dayMaster = day.charAt(0)
    if (!isValidHeavenlyStem(dayMaster)) {
      console.warn('[md-parser] dayMaster invalid:', dayMaster)
      return null
    }

    return { year, month, day, hour, dayMaster }
  } catch (err) {
    console.error('[md-parser] extractBaziFromMarkdown error:', err)
    return null
  }
}

/**
 * v5.10.247:統一 entry point、嘗試 table 與 inline 兩種 format
 *
 * 推薦 caller 直接 call 本函式、自動 fallback inline → null
 * 對應 Sprint 2.x 真實 sample 分佈:32 C row 中 8 table + 2 inline + 22 prose-only
 */
export function extractBaziAuto(content: string): { bazi: BaziPillars; format: 'table' | 'inline' } | null {
  const tableBazi = extractBaziFromMarkdown(content)
  if (tableBazi) return { bazi: tableBazi, format: 'table' }

  const inlineBazi = extractBaziInlineFromMarkdown(content)
  if (inlineBazi) return { bazi: inlineBazi, format: 'inline' }

  return null
}

/**
 * 從 ai_content 抽單一 pillar 的天干地支
 *
 * Pattern:`| <pillarName> | <ganZhi> | <納音> |`
 * 兼容(v5.10.247 加強、對應 Codex P1 finding):
 *   - 全/半形空白(U+3000)
 *   - 加粗 `**` 在 label 跟 value 兩側(`| 年柱 | **癸卯** |`)
 *   - emoji / 裝飾字符在 label 前(`| 🔥 年柱 |`)
 *   - 嚴格 value 白名單:`[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]`(防其他漢字誤抓)
 */
function matchPillar(content: string, pillarName: '年柱' | '月柱' | '日柱' | '時柱'): string | null {
  // 嚴格 char class:天干 10 字 + 地支 12 字、不抓其他漢字
  // label 前後允許:空白 / 全形空白 / `*` 加粗 / 任何非 `|` 的裝飾字符(emoji)
  // value 前後允許:空白 / 全形空白 / `*` 加粗
  const escapedName = pillarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `\\|[^|]*?${escapedName}[\\s\\u3000\\*]*\\|[\\s\\u3000\\*]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\\s\\u3000\\*]*\\|`,
    'm',
  )

  const match = content.match(pattern)
  if (!match || !match[1]) return null

  // White-list char class 已保證 length=2 + heavenly stem + earthly branch
  // 仍保留 redundant 驗證(double check、防 regex bug)
  const ganZhi = match[1]
  if (ganZhi.length !== 2) return null
  if (!isValidHeavenlyStem(ganZhi.charAt(0))) return null
  if (!isValidEarthlyBranch(ganZhi.charAt(1))) return null

  return ganZhi
}

/**
 * v5.10.247 新增:解析 inline format(對應實測 32 row 中 2 row 用此格式)
 *
 * Pattern 1:`四柱八字**：庚午 丙戌 庚戌 丙戌`
 * Pattern 2:`四柱八字: 庚午 丙戌 庚戌 丙戌`
 *
 * @returns BaziPillars(若 4 個 pillar 都抓到 + dayMaster 有效)、否則 null
 */
export function extractBaziInlineFromMarkdown(content: string): BaziPillars | null {
  if (!content || typeof content !== 'string') return null

  try {
    const pattern = /四柱八字[\s\*　]*[：:][\s　]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/

    const match = content.match(pattern)
    if (!match) return null

    const [, year, month, day, hour] = match
    if (!year || !month || !day || !hour) return null

    const dayMaster = day.charAt(0)
    if (!isValidHeavenlyStem(dayMaster)) return null

    return { year, month, day, hour, dayMaster }
  } catch (err) {
    console.error('[md-parser] extractBaziInlineFromMarkdown error:', err)
    return null
  }
}

const HEAVENLY_STEMS = new Set(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'])
const EARTHLY_BRANCHES = new Set(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'])

function isValidHeavenlyStem(c: string): boolean {
  return HEAVENLY_STEMS.has(c)
}

function isValidEarthlyBranch(c: string): boolean {
  return EARTHLY_BRANCHES.has(c)
}

/**
 * 從 ai_content 抽「一句話定義」(oneLiner candidate)
 *
 * Pattern 1:`> **一句話定義你**:xxxxx`
 * Pattern 2:`> **一句話定義**:xxxxx`
 * Pattern 3(兒童專版):`> **xxx**:您的孩子是...`
 *
 * 回 trim 後的文字、或 null
 */
export function extractOneLinerFromMarkdown(content: string): string | null {
  if (!content || typeof content !== 'string') return null

  try {
    // 嘗試 3 個 pattern、由具體到通用
    const patterns = [
      /^>\s*\*\*一句話定義你\*\*[::]\s*(.+)$/m,
      /^>\s*\*\*一句話定義\*\*[::]\s*(.+)$/m,
      /^>\s*\*\*[^*]*定義[^*]*\*\*[::]\s*(.+)$/m,
    ]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        const text = match[1].trim()
        if (text.length >= 10 && text.length <= 300) return text
      }
    }

    return null
  } catch (err) {
    console.error('[md-parser] extractOneLinerFromMarkdown error:', err)
    return null
  }
}
