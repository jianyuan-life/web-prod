// ============================================================
// 鑑源 AI 團隊 — 主筆起草（Author）
// ============================================================
// Claude Opus 4.6 為主力，自動 failover 到 GPT / Qwen
// 整合：排盤 JSON + RAG 檢索規則 + 起承轉合 Prompt

import { generateWithFailover } from '../provider-registry'
import { AUTHOR } from './roles'
import type { RetrievedRule } from '../types'

export interface DraftResult {
  content: string
  model: string
  provider: string
  latencyMs: number
  costUsd: number
  usedRulesCount: number
}

/**
 * 產出第一版草稿
 */
export async function generateDraft(args: {
  planCode: string
  planPrompt: string              // 方案專屬的章節結構 prompt
  birthData: Record<string, unknown>
  chartDataJson: string
  retrievedRules: RetrievedRule[]
  customerNote?: string            // 客戶問題（D 方案）或備註
  maxTokens?: number
  reportId?: string                // v5.3.5：傳入以便 ai_cost_log 關聯
}): Promise<DraftResult> {
  const {
    planCode, planPrompt, birthData, chartDataJson,
    retrievedRules, customerNote, maxTokens = 8000,  // 8000 以內各 provider 都支援
    reportId,
  } = args

  // ── 組合 system prompt：主筆角色 + 方案專屬結構 ──
  const systemPrompt = `${AUTHOR.systemPrompt}

${planPrompt}`

  // ── 組合 user prompt：命盤 + 規則 + 客戶問題 ──
  const rulesText = retrievedRules.length > 0
    ? `## 檢索到的相關命理規則（請優先引用這些有出處的規則）

${retrievedRules.map((r, i) => `### 規則 ${i + 1}：${r.source}
${r.text}`).join('\n\n')}

---
`
    : ''

  const noteText = customerNote
    ? `## 客戶備註/問題
${customerNote}

---
`
    : ''

  const userPrompt = `## 方案
${planCode}

## 客戶資料
${JSON.stringify(birthData, null, 2)}

## 排盤 JSON（唯一真相來源，每項論述必須基於此）
\`\`\`json
${chartDataJson.slice(0, 20000)}
\`\`\`

${rulesText}${noteText}---

請依照系統指示的方案專屬章節結構撰寫完整報告。
繁體中文、禁簡體/markdown/emoji/評分/過度承諾。`

  const t0 = Date.now()
  const res = await generateWithFailover(
    { system: systemPrompt, user: userPrompt, maxTokens, temperature: 0.5 },
    AUTHOR.providers,
    { reportId: reportId ?? null, planCode, callStage: 'team_author' },
  )

  return {
    content: res.content,
    model: res.model,
    provider: res.provider,
    latencyMs: Date.now() - t0,
    costUsd: res.costUsd,
    usedRulesCount: retrievedRules.length,
  }
}
