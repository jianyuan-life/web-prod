// ============================================================
// 鑑源 AI 團隊 — 主筆修訂（Revision）
// ============================================================
// Peer Review 或 Truth Gate 失敗時，收集反饋回主筆重寫
// 最多重試 3 次，仍失敗 → 標 needs_human_review

import { generateWithFailover } from '../provider-registry'
import { AUTHOR } from './roles'
import type { PipelineContext } from '../types'

export const MAX_REVISION_ROUNDS = 3

export interface RevisionResult {
  revisedContent: string
  model: string
  provider: string
  round: number
  latencyMs: number
  costUsd: number
}

/**
 * 根據反饋修訂草稿
 *
 * @param originalDraft 原始草稿
 * @param feedback 整合的反饋（來自 Peer Review + Truth Gate）
 * @param chartDataJson 排盤真相（確保修訂時仍基於正確資料）
 * @param round 當前修訂輪次（1-3）
 */
export async function reviseDraft(
  originalDraft: string,
  feedback: string,
  chartDataJson: string,
  planCode: string,
  round: number,
  reportId?: string,
): Promise<RevisionResult> {
  const systemPrompt = `${AUTHOR.systemPrompt}

【修訂任務】
這是第 ${round} 次修訂。請根據審查團隊的反饋修改原稿。

【修訂原則】
- 保留原稿中被讚賞的部分
- 修正被指出的問題
- 不要整份重寫（除非反饋明確要求）
- 所有論述仍必須基於命盤 JSON
- 若 Truth Gate 有違規，必須立刻改正數字/日主/命宮等客觀事實`

  const userPrompt = `## 方案代碼
${planCode}

## 排盤 JSON（真相來源，你只能基於這個寫）
\`\`\`json
${chartDataJson.slice(0, 15000)}
\`\`\`

## 原始草稿

${originalDraft}

## 審查團隊反饋（你要改的地方）

${feedback}

---

請輸出完整修訂後的報告（不是只輸出改動部分）。
長度、結構與原稿相同，只修正被指出的問題。
`

  const t0 = Date.now()
  const res = await generateWithFailover(
    { system: systemPrompt, user: userPrompt, maxTokens: 8000, temperature: 0.5 },
    AUTHOR.providers,
    {
      reportId: reportId ?? null,
      planCode,
      callStage: `team_revision_r${round}`,
    },
  )

  return {
    revisedContent: res.content,
    model: res.model,
    provider: res.provider,
    round,
    latencyMs: Date.now() - t0,
    costUsd: res.costUsd,
  }
}

/**
 * 紀錄修訂輪次到 PipelineContext（供 LangFuse 追蹤）
 */
export function recordRevisionToContext(
  ctx: PipelineContext,
  result: RevisionResult,
): void {
  ctx.draft = result.revisedContent
  ctx.retryCount = result.round
  ctx.status = 'revising'
}
