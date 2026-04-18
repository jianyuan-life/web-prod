// AI 成本追蹤（v5.3.5 — 全面擴充 Provider 覆蓋 2026-04-18）
//
// 用途：每次呼叫 Claude / DeepSeek / Kimi / Moonshot / OpenAI / Qwen / Gemini / Voyage 等 AI API 後，
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
//
// v5.3.5 變更：
//   - 支援 8 個 provider（原 5 → 8：+ qwen + gemini + voyage）
//   - 定價表統一到 lib/ai/pricing.ts（單一真相源）
//   - 單筆呼叫 > $5 自動觸發 Telegram 告警

import { createClient } from '@supabase/supabase-js'
import { calcCostUsd, canonicalProvider, type ProviderTag } from './ai/pricing'

// ============================================================
// Provider 型別（v5.3.5 擴充到 8 家）
// ============================================================
export type AIProvider =
  | 'anthropic'   // Claude（建議統一用這個）
  | 'claude'      // 舊欄位別名（DB 歷史資料保留）
  | 'openai'
  | 'deepseek'
  | 'moonshot'
  | 'kimi'        // 舊欄位別名
  | 'qwen'
  | 'gemini'
  | 'voyage'
  | 'other'

export type AIUsage = {
  provider: AIProvider
  model: string
  promptTokens: number
  completionTokens: number
  reportId?: string | null
  planCode?: string | null
  callStage?: string | null  // analysis / review / qa_5llm / moderation / free_tool / fallback / embed
  latencyMs?: number
  status?: 'success' | 'error' | 'timeout' | 'retry' | 'incomplete'
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
  return calcCostUsd(model, promptTokens, completionTokens)
}

// 單筆呼叫超過此金額（USD）觸發即時 Telegram 告警
const EXPENSIVE_SINGLE_CALL_USD = 5.0

// v5.3.10：寫入失敗告警 rate-limit（避免洪水）
//   在 serverless runtime 裡 module-level 變數可能跨 invocation 保留，也可能 reset
//   這是 best-effort，重點是不要一秒發 100 則告警
let lastInsertFailAlertAt = 0
const INSERT_FAIL_ALERT_COOLDOWN_MS = 60 * 1000  // 1 分鐘內最多 1 則告警
let cumulativeInsertFailCount = 0                // 從 process 啟動到現在失敗總數

/**
 * 寫入一筆 AI 呼叫紀錄。
 * 失敗不拋錯（避免阻擋業務流程），但會 console.error。
 * 單筆 > $5 會觸發 Telegram 告警（不阻塞）。
 */
export async function recordAIUsage(usage: AIUsage): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      // v5.3.10：之前這邊 return 讓老闆裸奔 1 個月沒人知道
      console.error('[ai-cost-tracker] 缺 Supabase env，無法記錄 AI 成本', {
        hasUrl: Boolean(url), hasKey: Boolean(serviceKey),
      })
      return
    }

    const supabase = createClient(url, serviceKey)
    const cost = estimateCostUsd(usage.model, usage.promptTokens, usage.completionTokens)

    // 正規化 provider（把 alibaba/google/claude 等別名統一）
    const providerTag: ProviderTag = canonicalProvider(usage.provider)

    // v5.3.10：用 .select() 強制取回結果，這樣 Supabase insert 的真實錯誤才會浮出來
    //   以前 await supabase.from().insert() 吞掉 error（因為 postgrest-js 回 { error } 而不 throw），
    //   導致寫入失敗 recordAIUsage 外層 try/catch 看不到 → 06:01 後全部靜默失敗。
    const { error: insertError, data: insertedRow } = await supabase
      .from('ai_cost_log')
      .insert({
        report_id: usage.reportId || null,
        plan_code: usage.planCode || null,
        provider: providerTag,
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
      .select('id')
      .single()

    if (insertError) {
      cumulativeInsertFailCount += 1
      // 真實 Supabase 錯誤（含 code/hint/details）一定要看到
      console.error('[ai-cost-tracker] Supabase insert 失敗:', {
        code: (insertError as { code?: string }).code,
        message: (insertError as { message?: string }).message,
        hint: (insertError as { hint?: string }).hint,
        details: (insertError as { details?: string }).details,
        usage_preview: {
          provider: providerTag, model: usage.model,
          reportId: usage.reportId, planCode: usage.planCode,
          callStage: usage.callStage, status: usage.status,
        },
        cumulative_fail_count: cumulativeInsertFailCount,
      })
      // Telegram 告警（rate-limit 1 分鐘一則，避免洪水）
      const now = Date.now()
      if (now - lastInsertFailAlertAt > INSERT_FAIL_ALERT_COOLDOWN_MS) {
        lastInsertFailAlertAt = now
        try {
          const telegramMod = await import('./ai/observability/telegram') as {
            notify?: (title: string, body: string) => Promise<boolean>
          }
          if (typeof telegramMod.notify === 'function') {
            await telegramMod.notify(
              '🚨 AI 成本記帳寫入失敗（裸奔燒錢警告）',
              `provider=${providerTag} model=${usage.model}\n` +
              `error: ${(insertError as { code?: string }).code ?? '?'} — ${(insertError as { message?: string }).message ?? 'unknown'}\n` +
              `累計失敗 ${cumulativeInsertFailCount} 筆（以後 AI call 都不會被記錄）`,
            )
          }
        } catch (telErr) {
          console.error('[ai-cost-tracker] Telegram 告警也失敗:', telErr)
        }
      }
      return  // 寫入失敗，後面的告警 / 單筆超貴偵測都跳過
    }
    // 成功寫入：log 出 id 便於追蹤
    console.log(`[ai-cost-tracker] 寫入成功 id=${insertedRow?.id} ${providerTag}/${usage.model} $${cost.toFixed(4)}`)

    // 高金額單筆告警（不阻塞主流程）
    // notifyAICostSingleCallExpensive 由 AI 成本 agent v5.3.5 後補 export，
    // 尚未存在時 fallback 到通用的 notifyAbnormalCost
    if (cost > EXPENSIVE_SINGLE_CALL_USD) {
      try {
        const mod = (await import('./ai/observability/telegram')) as unknown as {
          notifyAICostSingleCallExpensive?: (
            model: string, cost: number, reportId: string | null, callStage: string | null,
          ) => Promise<boolean | void>
        }
        if (typeof mod.notifyAICostSingleCallExpensive === 'function') {
          await mod.notifyAICostSingleCallExpensive(
            usage.model,
            cost,
            usage.reportId || null,
            usage.callStage || null,
          )
        }
      } catch {
        // telegram 失敗不影響 log
      }
    }
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
