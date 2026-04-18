// ============================================================
// 鑑源 AI 團隊 — 生成 Pipeline 主入口
// ============================================================
// 9 階段：排盤 → RAG → 主筆 → Truth Gate → Peer Review → 修訂 → 格式化 → 交付 → 反饋
//
// 使用方式（從 workflows/generate-report/index.ts 呼叫）：
//   import { runTeamPipeline } from '@/lib/ai/pipeline'
//   const result = await runTeamPipeline(ctx)

import { generateDraft } from '../team/author'
import { peerReview } from '../team/peer-review'
import { checkTruthGate, buildTruthGateFeedback } from '../team/truth-gate'
import { reviseDraft, MAX_REVISION_ROUNDS } from '../team/revision'
import type { PipelineContext, RetrievedRule } from '../types'

// 確保 providers 已註冊（import 觸發 registerProvider）
import '../providers'

export interface PipelineOutcome {
  success: boolean
  finalContent?: string
  uiSummary?: string
  errorReason?: string
  metrics: {
    totalLatencyMs: number
    totalCostUsd: number
    revisionRounds: number
    finalPeerReviewScore: number
    truthGateViolations: number
  }
  needsHumanReview: boolean
}

/**
 * 執行完整的團隊生成 Pipeline
 */
export async function runTeamPipeline(args: {
  reportId: string
  planCode: 'C' | 'D' | 'G15' | 'R' | 'E1' | 'E2'
  planPrompt: string                       // 方案專屬 prompt（從 plan-prompts.ts 傳入）
  birthData: Record<string, unknown>
  chartData: Record<string, unknown>       // Python 排盤結果
  retrievedRules: RetrievedRule[]          // RAG 檢索結果（可空陣列，degrade 不報錯）
  customerNote?: string
  maxRevisionRounds?: number               // 預設 MAX_REVISION_ROUNDS = 3
}): Promise<PipelineOutcome> {
  const startedAt = Date.now()
  let totalCost = 0
  let revisionRounds = 0
  let finalPeerReviewScore = 0
  let truthGateViolations = 0

  const ctx: PipelineContext = {
    reportId: args.reportId,
    planCode: args.planCode,
    birthData: args.birthData,
    chartData: args.chartData,
    retrievedRules: args.retrievedRules,
    draft: '',
    reviews: [],
    retryCount: 0,
    status: 'drafting',
  }

  const chartDataJson = JSON.stringify(args.chartData)
  const maxRounds = args.maxRevisionRounds ?? MAX_REVISION_ROUNDS

  try {
    // ── STAGE 3: 主筆起草 ──
    console.log(`[Pipeline ${args.reportId}] Stage 3: 主筆起草`)
    const draft = await generateDraft({
      planCode: args.planCode,
      planPrompt: args.planPrompt,
      birthData: args.birthData,
      chartDataJson,
      retrievedRules: args.retrievedRules,
      customerNote: args.customerNote,
      reportId: args.reportId,
    })
    ctx.draft = draft.content
    totalCost += draft.costUsd
    console.log(`  → ${draft.provider}/${draft.model}, ${draft.content.length} 字, ${draft.latencyMs}ms, $${draft.costUsd.toFixed(4)}`)

    if (!ctx.draft) {
      return failOutcome('主筆起草返回空內容', startedAt, totalCost, revisionRounds)
    }

    // ── STAGE 4-6: 迴圈直到通過或用光重試次數 ──
    for (let round = 0; round <= maxRounds; round++) {
      // STAGE 4: Truth Gate（機械比對）
      console.log(`[Pipeline ${args.reportId}] Stage 4: Truth Gate (round ${round})`)
      const truthResult = checkTruthGate(ctx.draft, args.chartData)
      truthGateViolations = truthResult.violations.length
      const truthFeedback = buildTruthGateFeedback(truthResult)
      if (!truthResult.passed) {
        console.warn(`  → Truth Gate 失敗：${truthGateViolations} 項違規`)
      } else if (truthGateViolations > 0) {
        console.log(`  → Truth Gate 通過（${truthGateViolations} 項警告）`)
      } else {
        console.log(`  → Truth Gate 完美通過`)
      }

      // STAGE 5: Peer Review（3 方並行）
      console.log(`[Pipeline ${args.reportId}] Stage 5: Peer Review (round ${round})`)
      const peerResult = await peerReview(ctx.draft, chartDataJson, args.planCode, args.reportId)
      ctx.reviews = peerResult.reviews
      totalCost += peerResult.totalCostUsd
      finalPeerReviewScore = peerResult.overallScore
      console.log(
        `  → 平均分 ${peerResult.overallScore}/100 (最低 ${peerResult.weakestScore}), ` +
        `$${peerResult.totalCostUsd.toFixed(4)}`,
      )
      ctx.reviews.forEach(r => {
        console.log(`    ${r.reviewer}: ${r.score}/100`)
      })

      // ── 通過條件：Truth Gate 通過 且 Peer Review 過 96 ──
      if (truthResult.passed && peerResult.passed) {
        console.log(`[Pipeline ${args.reportId}] ✅ 通過 (round ${round})`)
        ctx.finalReport = ctx.draft
        ctx.status = 'finalized'
        return {
          success: true,
          finalContent: ctx.finalReport,
          metrics: {
            totalLatencyMs: Date.now() - startedAt,
            totalCostUsd: totalCost,
            revisionRounds,
            finalPeerReviewScore,
            truthGateViolations,
          },
          needsHumanReview: false,
        }
      }

      // ── 用光重試次數 → 交人工審 ──
      if (round >= maxRounds) {
        console.error(`[Pipeline ${args.reportId}] ❌ ${maxRounds} 輪仍未通過`)
        break
      }

      // STAGE 6: 主筆修訂
      revisionRounds = round + 1
      console.log(`[Pipeline ${args.reportId}] Stage 6: 修訂 round ${revisionRounds}`)
      const combinedFeedback = [truthFeedback, peerResult.combinedFeedback]
        .filter(Boolean)
        .join('\n\n')
      const revised = await reviseDraft(
        ctx.draft,
        combinedFeedback,
        chartDataJson,
        args.planCode,
        revisionRounds,
        args.reportId,
      )
      totalCost += revised.costUsd
      ctx.draft = revised.revisedContent
      console.log(
        `  → 修訂完成 ${revised.provider}/${revised.model}, ` +
        `${revised.revisedContent.length} 字, $${revised.costUsd.toFixed(4)}`,
      )
    }

    // ── 3 輪仍失敗 → 交人工審 ──
    return {
      success: false,
      finalContent: ctx.draft,  // 仍輸出最後一版（人工審用）
      errorReason: `品質閘門 ${maxRounds} 輪仍失敗（最低 Peer ${finalPeerReviewScore}/100, Truth ${truthGateViolations} 違規）`,
      metrics: {
        totalLatencyMs: Date.now() - startedAt,
        totalCostUsd: totalCost,
        revisionRounds,
        finalPeerReviewScore,
        truthGateViolations,
      },
      needsHumanReview: true,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[Pipeline ${args.reportId}] ❌ 異常：${msg}`)
    return failOutcome(msg, startedAt, totalCost, revisionRounds)
  }
}

function failOutcome(
  reason: string,
  startedAt: number,
  totalCost: number,
  revisionRounds: number,
): PipelineOutcome {
  return {
    success: false,
    errorReason: reason,
    metrics: {
      totalLatencyMs: Date.now() - startedAt,
      totalCostUsd: totalCost,
      revisionRounds,
      finalPeerReviewScore: 0,
      truthGateViolations: 0,
    },
    needsHumanReview: false,
  }
}

// 匯出 type-check 需要
export type { PipelineContext } from '../types'
