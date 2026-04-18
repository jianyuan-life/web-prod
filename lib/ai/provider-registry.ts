// ============================================================
// 鑑源 AI 團隊 — Provider Registry + Circuit Breaker + Cost Log
// ============================================================
// 統一管理所有 LLM provider
// 內建熔斷器：連續失敗自動停用、失敗自動降級
// 這是「任一供應商掛掉仍可出貨」的核心
//
// v5.3.5：所有經過 registry 的呼叫自動寫入 ai_cost_log
//   - generateWithFailover / generateParallel 都會 log 每個 attempt
//   - 透過 TrackingContext 傳入 reportId / planCode / callStage
//   - log 失敗不影響主流程

import type { LLMProvider, LLMRequest, LLMResponse, ProviderName, CircuitBreakerState } from './types'
import { recordAIUsage, type AIProvider } from '../ai-cost-tracker'
import { canonicalProvider } from './pricing'

// 熔斷器參數
const CB_FAILURE_THRESHOLD = 5             // 連續失敗次數
const CB_OPEN_DURATION_MS = 30 * 60 * 1000 // 停用 30 分鐘

const breakers = new Map<ProviderName, CircuitBreakerState>()
const providers = new Map<ProviderName, LLMProvider>()

export function registerProvider(p: LLMProvider) {
  providers.set(p.name, p)
  if (!breakers.has(p.name)) {
    breakers.set(p.name, {
      provider: p.name,
      failures: 0,
      lastFailAt: null,
      openedAt: null,
      status: 'closed',
    })
  }
}

export function getProvider(name: ProviderName): LLMProvider | null {
  return providers.get(name) ?? null
}

export function listProviders(): ProviderName[] {
  return Array.from(providers.keys())
}

export function getBreakerState(name: ProviderName): CircuitBreakerState | null {
  return breakers.get(name) ?? null
}

// 熔斷器：決定這個 provider 是否可用
function isAvailable(name: ProviderName): boolean {
  const s = breakers.get(name)
  if (!s) return true
  if (s.status === 'closed') return true
  if (s.status === 'open' && s.openedAt) {
    if (Date.now() - s.openedAt > CB_OPEN_DURATION_MS) {
      // 進半開狀態，允許一次嘗試
      s.status = 'half-open'
      return true
    }
    return false
  }
  return s.status === 'half-open'
}

function recordSuccess(name: ProviderName) {
  const s = breakers.get(name)
  if (!s) return
  s.failures = 0
  s.status = 'closed'
  s.openedAt = null
}

function recordFailure(name: ProviderName) {
  const s = breakers.get(name)
  if (!s) return
  s.failures += 1
  s.lastFailAt = Date.now()
  if (s.failures >= CB_FAILURE_THRESHOLD) {
    s.status = 'open'
    s.openedAt = Date.now()
    console.warn(`🚨 熔斷器開啟：${name}（連續 ${s.failures} 次失敗，停用 30 分鐘）`)
  }
}

// ============================================================
// Tracking Context（v5.3.5）
// 傳入此物件，registry 會自動把每次呼叫寫入 ai_cost_log
// ============================================================
export interface TrackingContext {
  reportId?: string | null
  planCode?: string | null
  callStage?: string | null     // 例：team_author / team_peer_review / team_revision / qa_5llm / moderation
  metadata?: Record<string, unknown>
}

function logRegistryCall(
  providerName: ProviderName,
  res: LLMResponse | { error: string; provider: ProviderName; latencyMs?: number },
  ctx?: TrackingContext,
): void {
  // fire-and-forget：永遠不 await，不讓 log 阻塞主流程
  void recordAIUsage({
    provider: canonicalProvider(providerName) as AIProvider,
    model: 'model' in res ? (res.model || 'unknown') : 'unknown',
    promptTokens: 'usage' in res ? (res.usage?.promptTokens || 0) : 0,
    completionTokens: 'usage' in res ? (res.usage?.completionTokens || 0) : 0,
    reportId: ctx?.reportId ?? null,
    planCode: ctx?.planCode ?? null,
    callStage: ctx?.callStage ?? 'team_pipeline',
    latencyMs: 'latencyMs' in res && typeof res.latencyMs === 'number' ? res.latencyMs : undefined,
    status: 'error' in res
      ? 'error'
      : (res.content ? 'success' : 'incomplete'),
    errorMessage: 'error' in res ? (typeof res.error === 'string' ? res.error.slice(0, 500) : undefined) : undefined,
    metadata: ctx?.metadata,
  })
}

// ============================================================
// 核心：帶降級的生成
// ============================================================
/**
 * 依照 order 順序嘗試 provider，第一個可用且成功的回傳。
 * 全部失敗才 throw。
 *
 * v5.3.5：第三個參數傳 TrackingContext，每個 attempt（含失敗）都會寫入 ai_cost_log
 */
export async function generateWithFailover(
  req: LLMRequest,
  order: Array<{ provider: ProviderName; model?: string }>,
  tracking?: TrackingContext,
): Promise<LLMResponse> {
  const errors: string[] = []
  for (const { provider: name, model } of order) {
    if (!isAvailable(name)) {
      errors.push(`${name}: circuit breaker open`)
      // 熔斷器開啟也記一筆（讓後台知道為什麼沒呼叫）
      logRegistryCall(name, { provider: name, error: 'circuit_breaker_open' }, tracking)
      continue
    }
    const p = providers.get(name)
    if (!p) {
      errors.push(`${name}: not registered`)
      continue
    }
    try {
      const res = await p.generate({ ...req, model })
      // 不管 error 或成功都記 log（失敗情況也要看到 latency/原因）
      logRegistryCall(name, res, tracking)
      if (res.error) {
        recordFailure(name)
        errors.push(`${name}: ${res.error}`)
        continue
      }
      recordSuccess(name)
      return res
    } catch (e) {
      recordFailure(name)
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${name}: ${msg.slice(0, 100)}`)
      logRegistryCall(name, { provider: name, error: msg }, tracking)
    }
  }
  throw new Error(`All providers failed: ${errors.join(' | ')}`)
}

// ============================================================
// 並行生成（用於 Peer Review，同時問多個 provider）
// ============================================================
export async function generateParallel(
  jobs: Array<{
    provider: ProviderName
    model?: string
    req: LLMRequest
  }>,
  tracking?: TrackingContext,
): Promise<Array<LLMResponse | { error: string; provider: ProviderName }>> {
  return Promise.all(jobs.map(async ({ provider: name, model, req }) => {
    if (!isAvailable(name)) {
      const result = { error: 'circuit breaker open', provider: name }
      logRegistryCall(name, result, tracking)
      return result
    }
    const p = providers.get(name)
    if (!p) return { error: 'not registered', provider: name }
    try {
      const res = await p.generate({ ...req, model })
      logRegistryCall(name, res, tracking)
      if (res.error) {
        recordFailure(name)
        return { error: res.error, provider: name }
      }
      recordSuccess(name)
      return res
    } catch (e) {
      recordFailure(name)
      const msg = e instanceof Error ? e.message : String(e)
      logRegistryCall(name, { provider: name, error: msg }, tracking)
      return { error: msg, provider: name }
    }
  }))
}

// ============================================================
// 定期健康檢查（手動觸發或 cron 排程）
// ============================================================
export async function healthCheckAll(): Promise<Record<ProviderName, boolean>> {
  const results = {} as Record<ProviderName, boolean>
  await Promise.all(
    Array.from(providers.entries()).map(async ([name, p]) => {
      try {
        results[name] = await p.healthCheck()
      } catch {
        results[name] = false
      }
    }),
  )
  return results
}
