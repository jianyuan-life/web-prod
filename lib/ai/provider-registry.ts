// ============================================================
// 鑑源 AI 團隊 — Provider Registry + Circuit Breaker
// ============================================================
// 統一管理所有 LLM provider
// 內建熔斷器：連續失敗自動停用、失敗自動降級
// 這是「任一供應商掛掉仍可出貨」的核心

import type { LLMProvider, LLMRequest, LLMResponse, ProviderName, CircuitBreakerState } from './types'

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
// 核心：帶降級的生成
// ============================================================
/**
 * 依照 order 順序嘗試 provider，第一個可用且成功的回傳。
 * 全部失敗才 throw。
 */
export async function generateWithFailover(
  req: LLMRequest,
  order: Array<{ provider: ProviderName; model?: string }>,
): Promise<LLMResponse> {
  const errors: string[] = []
  for (const { provider: name, model } of order) {
    if (!isAvailable(name)) {
      errors.push(`${name}: circuit breaker open`)
      continue
    }
    const p = providers.get(name)
    if (!p) {
      errors.push(`${name}: not registered`)
      continue
    }
    try {
      const res = await p.generate({ ...req, model })
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
): Promise<Array<LLMResponse | { error: string; provider: ProviderName }>> {
  return Promise.all(jobs.map(async ({ provider: name, model, req }) => {
    if (!isAvailable(name)) {
      return { error: 'circuit breaker open', provider: name }
    }
    const p = providers.get(name)
    if (!p) return { error: 'not registered', provider: name }
    try {
      const res = await p.generate({ ...req, model })
      if (res.error) {
        recordFailure(name)
        return { error: res.error, provider: name }
      }
      recordSuccess(name)
      return res
    } catch (e) {
      recordFailure(name)
      const msg = e instanceof Error ? e.message : String(e)
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
