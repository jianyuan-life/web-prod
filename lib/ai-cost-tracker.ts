// AI 成本追蹤（L7+ 2026-04-17）
//
// 用途：每次呼叫 Claude / DeepSeek / Kimi / Moonshot 等 AI API 後，
//       把 prompt/completion tokens 與成本寫入 ai_cost_log。
//
// 對應 migration：supabase/migrations/create_ai_cost_log.sql
//
// 呼叫範例（報告生成時）：
//
//   import { recordAIUsage } from '@/lib/ai-cost-tracker'
//
//   const result = await callClaude(...)
//   await recordAIUsage({
//     provider: 'claude',
//     model: 'claude-opus-4-6',
//     promptTokens: result.usage.input_tokens,
//     completionTokens: result.usage.output_tokens,
//     reportId: report.id,
//     planCode: 'C',
//     callStage: 'analysis',
//     latencyMs: Date.now() - start,
//     status: 'success',
//   })

import { createClient } from '@supabase/supabase-js'

// ============================================================
// 定價表（USD per 1M tokens）
// 參考：2026-04 最新公告
// ============================================================
type PriceSpec = { input: number; output: number }

const MODEL_PRICING: Record<string, PriceSpec> = {
  // Claude（Anthropic）
  'claude-opus-4-6':       { input: 15, output: 75 },
  'claude-opus-4-5':       { input: 15, output: 75 },
  'claude-opus-4':         { input: 15, output: 75 },
  'claude-sonnet-4-5':     { input: 3,  output: 15 },
  'claude-sonnet-4':       { input: 3,  output: 15 },
  'claude-haiku-4-5':      { input: 1,  output: 5 },

  // DeepSeek
  'deepseek-chat':         { input: 0.27, output: 1.10 },
  'deepseek-reasoner':     { input: 0.55, output: 2.19 },
  'deepseek-v3':           { input: 0.27, output: 1.10 },

  // Moonshot / Kimi
  'kimi-k2.5':             { input: 0.6,  output: 2.5 },
  'kimi-k2-thinking':      { input: 0.6,  output: 2.5 },
  'moonshot-v1-auto':      { input: 0.4,  output: 1.2 },
  'moonshot-v1-128k':      { input: 2.0,  output: 5.0 },
  'moonshot-v1-32k':       { input: 0.5,  output: 1.5 },
  'moonshot-v1-8k':        { input: 0.2,  output: 0.8 },
}

export type AIProvider = 'claude' | 'deepseek' | 'kimi' | 'moonshot' | 'openai' | 'other'

export type AIUsage = {
  provider: AIProvider
  model: string
  promptTokens: number
  completionTokens: number
  reportId?: string | null
  planCode?: string | null
  callStage?: string | null  // analysis / review / compatibility / chumenji / personality
  latencyMs?: number
  status?: 'success' | 'error' | 'timeout' | 'retry'
  errorMessage?: string
  metadata?: Record<string, unknown>
}

/**
 * 根據 model 計算本次呼叫花費（USD）
 * 找不到 model 時回退到 0（但仍會記 log 以便排查）
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const spec = MODEL_PRICING[model.toLowerCase()] || MODEL_PRICING[model]
  if (!spec) return 0
  const inputCost = (promptTokens / 1_000_000) * spec.input
  const outputCost = (completionTokens / 1_000_000) * spec.output
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

/**
 * 寫入一筆 AI 呼叫紀錄。
 * 失敗不拋錯（避免阻擋業務流程），但會 console.error。
 */
export async function recordAIUsage(usage: AIUsage): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return

    const supabase = createClient(url, serviceKey)
    const cost = estimateCostUsd(usage.model, usage.promptTokens, usage.completionTokens)

    await supabase.from('ai_cost_log').insert({
      report_id: usage.reportId || null,
      plan_code: usage.planCode || null,
      provider: usage.provider,
      model: usage.model,
      call_stage: usage.callStage || null,
      prompt_tokens: Math.max(0, Math.round(usage.promptTokens || 0)),
      completion_tokens: Math.max(0, Math.round(usage.completionTokens || 0)),
      cost_usd: cost,
      latency_ms: typeof usage.latencyMs === 'number' ? Math.round(usage.latencyMs) : null,
      status: usage.status || 'success',
      error_message: usage.errorMessage || null,
      metadata: usage.metadata || {},
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai-cost-tracker] 寫入失敗:', err)
  }
}

/**
 * 批次查詢每月 AI 總花費（直接 SQL 用 dashboard 專用，這裡提供型別）
 */
export type AICostSummary = {
  month: string           // YYYY-MM
  provider: string
  total_cost_usd: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_calls: number
  failed_calls: number
}

export type AICostByModel = {
  model: string
  provider: string
  calls: number
  total_cost_usd: number
  avg_cost_usd: number
}
