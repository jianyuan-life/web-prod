// ============================================================
// 內容守門員 — 主入口
// ============================================================
// 提供統一的 moderateContent() 與 logModerationWarning()
// 供 workflow / API / 渲染層呼叫
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  scanBlacklist,
  summarizeHits,
  type BlacklistHit,
  type ModerationCategory,
} from './blacklist'
import { moderateWithAI, type AiModerationResult } from './ai-moderator'

export type ModerationAction =
  | 'pass'               // 全過
  | 'warn'               // 有警告但放行
  | 'retry_with_guard'   // 必須 retry，prompt 加警語
  | 'hard_block'         // 強制擋下（不能交付客戶）

export interface ModerationReport {
  action: ModerationAction
  blocked: boolean
  warnings: string[]
  /** Layer 1 命中清單 */
  blacklistHits: BlacklistHit[]
  /** Layer 1 聚合 */
  blacklistSummary: {
    blocked: boolean
    blockCount: number
    warnCount: number
    byCategory: Record<ModerationCategory, { block: number; warn: number }>
  }
  /** Layer 2 AI 審查 */
  ai: AiModerationResult | null
  /** 給 AI prompt 的警語（若 action=retry_with_guard） */
  guardInstruction?: string
  /** 主要觸發原因（給 log 看） */
  reason: string
}

export interface ModerateOptions {
  /** 是否跳過 AI Layer（例如測試環境、AI 已壞） */
  skipAi?: boolean
  /** 是否對隱私洩漏（其他客戶名字）做檢查 */
  customerName?: string
  otherClientNames?: string[]
}

/**
 * 主審查函式：兩層過濾
 *
 * @param content 待審查的報告內容
 * @param options
 * @returns ModerationReport
 */
export async function moderateContent(
  content: string,
  options: ModerateOptions = {},
): Promise<ModerationReport> {
  // ── Layer 1：關鍵詞黑名單 ──
  const blacklistHits = scanBlacklist(content)

  // 隱私檢查（可選）：其他客戶名字不能出現在本報告
  if (options.otherClientNames?.length) {
    for (const otherName of options.otherClientNames) {
      if (otherName && otherName.length >= 2 && otherName !== options.customerName) {
        if (content.includes(otherName)) {
          blacklistHits.push({
            category: 'privacy',
            severity: 'block',
            reason: `疑似洩漏其他客戶姓名：${otherName}`,
            pattern: otherName,
            matchedText: otherName,
            snippet: extractContext(content, otherName),
          })
        }
      }
    }
  }

  const blacklistSummary = summarizeHits(blacklistHits)

  // ── Layer 2：AI 審查（可被選項跳過） ──
  let ai: AiModerationResult | null = null
  if (!options.skipAi) {
    try {
      ai = await moderateWithAI(content)
    } catch (err) {
      console.error('[moderateContent] AI 審查例外（不阻塞）:', err)
    }
  }

  // ── 判定最終 action ──
  const aiBlocked = ai?.blocked === true
  const aiWarnings = ai?.warnings || []

  const warnings: string[] = []
  for (const h of blacklistHits) {
    if (h.severity === 'warn') {
      warnings.push(`[${h.category}] ${h.reason}: "${h.matchedText}"`)
    }
  }
  for (const w of aiWarnings) {
    warnings.push(`[AI] ${w}`)
  }

  const blocked = blacklistSummary.blocked || aiBlocked

  let action: ModerationAction = 'pass'
  let reason = '全部通過'
  if (blocked) {
    // 只要命中任何 block 類別，都需要擋
    action = 'retry_with_guard'
    const reasons: string[] = []
    if (blacklistSummary.blockCount > 0) {
      const topHit = blacklistHits.find(h => h.severity === 'block')
      if (topHit) reasons.push(`黑名單[${topHit.category}]: ${topHit.matchedText}`)
    }
    if (aiBlocked && ai) {
      const topCat = Object.entries(ai.scores)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0]
      if (topCat) reasons.push(`AI[${topCat[0]}]: ${topCat[1]?.toFixed(2)}`)
    }
    reason = reasons.join('; ')
  } else if (warnings.length > 0) {
    action = 'warn'
    reason = `${warnings.length} 項警告`
  }

  return {
    action,
    blocked,
    warnings,
    blacklistHits,
    blacklistSummary,
    ai,
    reason,
    guardInstruction: blocked ? buildGuardInstruction(blacklistHits, aiWarnings, ai) : undefined,
  }
}

/**
 * 產生 prompt 警語（當 action=retry_with_guard 時附到 AI prompt 最後）
 */
function buildGuardInstruction(
  hits: BlacklistHit[],
  aiWarnings: string[],
  ai: AiModerationResult | null,
): string {
  const parts: string[] = ['\n\n【內容安全守則 — 重要】\n以下是本次報告必須避免的內容：']

  // 從命中分類反推要提醒 AI 的守則
  const hitCats = new Set(hits.map(h => h.category))
  if (hitCats.has('politics')) {
    parts.push('- 不得提及任何政治人物、政黨、主權爭議、政治事件')
  }
  if (hitCats.has('medical')) {
    parts.push('- 不得對疾病/治療做出任何「保證」「一定」「能治癒」的承諾；不得勸阻就醫或停藥')
  }
  if (hitCats.has('investment')) {
    parts.push('- 不得保證任何投資報酬、具體標的漲跌；用「傾向」「可能」而非「一定」')
  }
  if (hitCats.has('extreme_fortune')) {
    parts.push('- 不得使用「注定」「一定會」「不可改變」等絕對用語；不得預言死亡時間、婚姻必然離異、必得絕症；改用「命盤傾向」「可能性較高」「需要留意」等留有餘地的說法')
  }
  if (hitCats.has('discrimination')) {
    parts.push('- 不得出現任何性別、地域、種族、宗教、性傾向、年齡、階級的歧視或仇恨語言')
  }
  if (hitCats.has('sexual')) {
    parts.push('- 不得出現露骨性描寫或性貶抑用語')
  }
  if (hitCats.has('violence')) {
    parts.push('- 不得鼓動、教唆、合理化任何暴力行為')
  }
  if (hitCats.has('privacy')) {
    parts.push('- 報告中絕對不可出現其他客戶的姓名（隱私合規）')
  }

  // AI 審查警告
  if (ai?.blocked && aiWarnings.length === 0) {
    parts.push('- AI 安全審查發現高風險內容，請以更保守、中立的語氣重寫')
  }

  parts.push('\n請在維持命理專業性與深度的前提下，用溫和、留有餘地的語言重新生成這份報告。')
  return parts.join('\n')
}

function extractContext(content: string, needle: string): string {
  const idx = content.indexOf(needle)
  if (idx === -1) return ''
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + needle.length + 40)
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
}

// ────────────────────────────────────────────────────────────
// 寫入 moderation_log（Supabase）
// 交給 workflow / API 呼叫
// ────────────────────────────────────────────────────────────

export interface ModerationLogInput {
  reportId: string
  planCode: string
  action: ModerationAction
  blocked: boolean
  reason: string
  hits: BlacklistHit[]
  aiScores: Partial<Record<string, number>>
  /** 對應報告內容的前 500 字（給 admin 快速判斷） */
  contentPreview: string
  /** retry 次數（第幾次被擋） */
  retryAttempt?: number
  /** Layer 識別（例：content_moderation / pre_delivery / retry_guard），預設 content_moderation */
  layer?: string
  /** 嚴重度（block=red, warn=yellow, pass=info），預設由 blocked 自動決定 */
  severity?: 'red' | 'yellow' | 'info' | string
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )
}

/**
 * 記錄一筆 moderation 事件到 Supabase
 * 失敗不拋錯，避免阻塞業務
 */
export async function logModerationEvent(input: ModerationLogInput): Promise<void> {
  try {
    const supabase = getSupabase()

    // v5.3.32：schema drift 修復
    //   實際 schema：layer(NOT NULL), severity(NOT NULL), content_sample, categories(jsonb),
    //               ai_scores(jsonb), action_taken, notes
    //   原傳入欄位 plan_code/blocked/reason/retry_attempt/status 對應不到 schema，
    //   全部塞進 notes 或廢棄；hits → categories JSON；content_preview → content_sample
    const severity = input.severity || (input.blocked ? 'red' : (input.action === 'warn' ? 'yellow' : 'info'))
    const categories = input.hits.map(h => ({
      category: h.category,
      severity: h.severity,
      reason: h.reason,
      pattern: String(h.pattern).slice(0, 100),
      matched_text: h.matchedText.slice(0, 100),
      snippet: h.snippet.slice(0, 400),
    }))
    const notesPayload = {
      plan_code: input.planCode,
      blocked: input.blocked,
      reason: input.reason.slice(0, 500),
      retry_attempt: input.retryAttempt ?? 0,
      status: input.blocked ? 'flagged' : 'passed',
    }

    await supabase.from('moderation_log').insert({
      report_id: input.reportId,
      layer: input.layer || 'content_moderation',
      severity,
      content_sample: input.contentPreview.slice(0, 500),
      categories,
      ai_scores: input.aiScores,
      action_taken: input.action,
      notes: JSON.stringify(notesPayload).slice(0, 2000),
    })
  } catch (err) {
    console.error('[moderation_log] 寫入失敗:', err)
  }
}

/**
 * 只記錄警告（非 block）給 admin 觀察
 */
export async function logModerationWarning(
  reportId: string,
  planCode: string,
  warnings: string[],
  contentPreview: string,
): Promise<void> {
  if (warnings.length === 0) return
  await logModerationEvent({
    reportId,
    planCode,
    action: 'warn',
    blocked: false,
    reason: warnings.slice(0, 5).join('; '),
    hits: [],
    aiScores: {},
    contentPreview,
  })
}

// ────────────────────────────────────────────────────────────
// 輸出子模組，方便測試
// ────────────────────────────────────────────────────────────
export {
  scanBlacklist,
  summarizeHits,
  MODERATION_BLACKLIST,
  FALSE_POSITIVE_WHITELIST,
  stripWhitelistedFragments,
} from './blacklist'
export { moderateWithAI } from './ai-moderator'
export type { BlacklistHit, ModerationCategory, ModerationSeverity } from './blacklist'
export type { AiModerationResult } from './ai-moderator'
