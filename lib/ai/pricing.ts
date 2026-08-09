// ============================================================
// 鑒源 AI 定價表（單一真相源）
// ============================================================
// 所有 AI 呼叫點的成本計算都應該 import 這裡，不要各自寫 PRICING。
// 最近核對：2026-08-08（USD / 1M tokens）
// Anthropic：https://platform.claude.com/docs/en/about-claude/pricing
// Google：https://ai.google.dev/gemini-api/docs/pricing
//
// 重要：moonshot 原生定價是 CNY，這裡統一換算成 USD（¥7.2 = $1）
//
// 變更時請同步更新：
//   - lib/ai-cost-tracker.ts MODEL_PRICING（向下相容舊欄位名）
//   - supabase/migrations/ 若有新增 provider 欄位
// ============================================================

export type ProviderTag =
  | 'anthropic'
  | 'claude'      // 舊欄位別名（DB 有歷史資料）
  | 'openai'
  | 'deepseek'
  | 'moonshot'
  | 'kimi'        // 舊欄位別名
  | 'qwen'
  | 'alibaba'     // qwen 的 registry 別名
  | 'gemini'
  | 'google'      // gemini 的 registry 別名
  | 'voyage'
  | 'other'

export interface PriceSpec {
  input: number          // USD per 1M input tokens
  output: number         // USD per 1M output tokens
  provider: ProviderTag  // 歸屬 provider（寫 log 用）
  cache?: {
    read: number
    write5m?: number
    write1h?: number
    storagePerMillionTokenHour?: number
  }
  longContext?: {
    aboveInputTokens: number
    input: number
    output: number
    cacheRead?: number
  }
}

export interface DetailedTokenUsage {
  /** 完整 prompt context，用來判定 provider 的長 context 價格帶。 */
  totalPromptTokensForTier: number
  uncachedInputTokens: number
  outputTokens: number
  cacheWrite5mTokens?: number
  cacheWrite1hTokens?: number
  cacheReadTokens?: number
  /** Gemini explicit cache 的 token 數 × 儲存小時。 */
  cacheStorageTokenHours?: number
}

// CNY → USD
const CNY_PER_USD = 7.2
const cnyToUsd = (cny: number) => Math.round((cny / CNY_PER_USD) * 1000) / 1000

// ============================================================
// 定價表（2026-08-08 現行價格）
// 所有 model ID 統一用「小寫 + 連字號」做 key
// ============================================================
export const MODEL_PRICING: Record<string, PriceSpec> = {
  // ── Anthropic Claude ──
  'claude-opus-4-7':          { input: 15,   output: 75,  provider: 'anthropic' },
  'claude-opus-4-6':          {
    input: 5,
    output: 25,
    provider: 'anthropic',
    cache: { read: 0.5, write5m: 6.25, write1h: 10 },
  },
  'claude-opus-4-5':          { input: 15,   output: 75,  provider: 'anthropic' },
  'claude-opus-4':            { input: 15,   output: 75,  provider: 'anthropic' },
  'claude-sonnet-4-6':        { input: 3,    output: 15,  provider: 'anthropic' },
  'claude-sonnet-4-5':        { input: 3,    output: 15,  provider: 'anthropic' },
  'claude-sonnet-4':          { input: 3,    output: 15,  provider: 'anthropic' },
  'claude-haiku-4-5':         { input: 1,    output: 5,   provider: 'anthropic' },
  'claude-haiku-4-5-20251001':{ input: 1,    output: 5,   provider: 'anthropic' },

  // ── OpenAI ──
  'gpt-4o':                   { input: 2.5,  output: 10,  provider: 'openai' },
  'gpt-4o-mini':              { input: 0.15, output: 0.6, provider: 'openai' },
  'omni-moderation-latest':   { input: 0,    output: 0,   provider: 'openai' }, // 官方免費

  // ── DeepSeek ──
  'deepseek-chat':            { input: 0.27, output: 1.10, provider: 'deepseek' },
  'deepseek-v3':              { input: 0.27, output: 1.10, provider: 'deepseek' },
  'deepseek-reasoner':        { input: 0.55, output: 2.19, provider: 'deepseek' },

  // ── Moonshot / Kimi（原生 CNY ¥60/¥30 per 1M，換算成 USD）──
  'moonshot-v1-auto':         { input: cnyToUsd(3),  output: cnyToUsd(6),  provider: 'moonshot' },   // ~$0.42/$0.83
  'moonshot-v1-8k':           { input: cnyToUsd(1.5),output: cnyToUsd(2),  provider: 'moonshot' },
  'moonshot-v1-32k':          { input: cnyToUsd(3),  output: cnyToUsd(6),  provider: 'moonshot' },
  'moonshot-v1-128k':         { input: cnyToUsd(60), output: cnyToUsd(60), provider: 'moonshot' },   // ¥60/1M 統一 → ~$8.33
  'kimi-k2.5':                { input: cnyToUsd(30), output: cnyToUsd(30), provider: 'moonshot' },   // ¥30/1M → ~$4.17
  'kimi-k2-thinking':         { input: cnyToUsd(30), output: cnyToUsd(30), provider: 'moonshot' },

  // ── Qwen (DashScope) ──
  'qwen-max':                 { input: 1.4,  output: 5.6, provider: 'qwen' },
  'qwen-plus':                { input: 0.4,  output: 1.2, provider: 'qwen' },
  'qwen-turbo':               { input: 0.04, output: 0.2, provider: 'qwen' },

  // ── Gemini (Google) ──
  'gemini-3.1-pro-preview':   {
    input: 2,
    output: 12,
    provider: 'gemini',
    cache: { read: 0.2, storagePerMillionTokenHour: 4.5 },
    longContext: { aboveInputTokens: 200_000, input: 4, output: 18, cacheRead: 0.4 },
  },
  'gemini-2.5-flash':         { input: 0.3,  output: 2.5, provider: 'gemini' },
  'gemini-2.5-pro':           { input: 1.25, output: 10,  provider: 'gemini' },
  'gemini-1.5-flash':         { input: 0.075,output: 0.3, provider: 'gemini' },

  // ── Voyage (embedding only，沒有 output) ──
  'voyage-3':                 { input: 0.06, output: 0,   provider: 'voyage' },
  'voyage-3-large':           { input: 0.18, output: 0,   provider: 'voyage' },
}

// ============================================================
// Registry provider name → canonical tag 映射
// lib/ai/types.ts 定義的 ProviderName 跟這裡的 ProviderTag 不完全一致
// （alibaba ↔ qwen, google ↔ gemini, anthropic ↔ claude）
// ============================================================
export function canonicalProvider(raw: string): ProviderTag {
  const r = (raw || '').toLowerCase()
  if (r === 'anthropic' || r === 'claude') return 'anthropic'
  if (r === 'openai' || r === 'gpt') return 'openai'
  if (r === 'deepseek') return 'deepseek'
  if (r === 'moonshot' || r === 'kimi') return 'moonshot'
  if (r === 'qwen' || r === 'alibaba' || r === 'dashscope') return 'qwen'
  if (r === 'gemini' || r === 'google') return 'gemini'
  if (r === 'voyage' || r === 'voyageai') return 'voyage'
  return 'other'
}

// ============================================================
// 模糊 model ID 匹配（處理衍生/日期後綴）
// ============================================================
function normalizeModel(model: string): string {
  const m = (model || '').toLowerCase().trim()
  if (MODEL_PRICING[m]) return m

  // 常見後綴 fallback
  if (m.startsWith('gpt-4o-mini')) return 'gpt-4o-mini'
  if (m.startsWith('gpt-4o')) return 'gpt-4o'
  if (m.startsWith('claude-opus-4-7')) return 'claude-opus-4-7'
  if (m.startsWith('claude-opus-4-6')) return 'claude-opus-4-6'
  if (m.startsWith('claude-opus-4-5')) return 'claude-opus-4-5'
  if (m.startsWith('claude-opus-4')) return 'claude-opus-4'
  if (m.startsWith('claude-sonnet-4-6')) return 'claude-sonnet-4-6'
  if (m.startsWith('claude-sonnet-4-5')) return 'claude-sonnet-4-5'
  if (m.startsWith('claude-sonnet-4')) return 'claude-sonnet-4'
  if (m.startsWith('claude-haiku-4-5')) return 'claude-haiku-4-5'
  if (m.startsWith('qwen-max')) return 'qwen-max'
  if (m.startsWith('qwen-plus')) return 'qwen-plus'
  if (m.startsWith('qwen-turbo')) return 'qwen-turbo'
  if (m.startsWith('gemini-3.1-pro-preview')) return 'gemini-3.1-pro-preview'
  if (m.startsWith('gemini-2.5-flash')) return 'gemini-2.5-flash'
  if (m.startsWith('gemini-2.5-pro')) return 'gemini-2.5-pro'
  if (m.startsWith('gemini-1.5-flash')) return 'gemini-1.5-flash'
  if (m.startsWith('voyage-3-large')) return 'voyage-3-large'
  if (m.startsWith('voyage-3')) return 'voyage-3'
  if (m.startsWith('deepseek-reasoner')) return 'deepseek-reasoner'
  if (m.startsWith('deepseek')) return 'deepseek-chat'
  if (m.startsWith('kimi-k2-thinking')) return 'kimi-k2-thinking'
  if (m.startsWith('kimi-k2')) return 'kimi-k2.5'
  if (m.startsWith('moonshot-v1-128k')) return 'moonshot-v1-128k'
  if (m.startsWith('moonshot-v1-32k')) return 'moonshot-v1-32k'
  if (m.startsWith('moonshot-v1-8k')) return 'moonshot-v1-8k'
  if (m.startsWith('moonshot-v1-auto')) return 'moonshot-v1-auto'
  if (m.startsWith('moonshot')) return 'moonshot-v1-auto'
  return m
}

// ============================================================
// 核心：依 model 計算 USD 花費
// ============================================================
export function calcCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const key = normalizeModel(model)
  const spec = MODEL_PRICING[key]
  if (!spec) return 0
  const effectiveSpec = spec.longContext && promptTokens > spec.longContext.aboveInputTokens
    ? { ...spec, input: spec.longContext.input, output: spec.longContext.output }
    : spec
  const inputCost = (Math.max(0, promptTokens) / 1_000_000) * effectiveSpec.input
  const outputCost = (Math.max(0, completionTokens) / 1_000_000) * effectiveSpec.output
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

function checkedTokenCount(value: number | undefined, field: string): number {
  const normalized = value ?? 0
  if (!Number.isFinite(normalized) || normalized < 0 || !Number.isInteger(normalized)) {
    throw new RangeError(`${field} 必須是非負整數`)
  }
  return normalized
}

/**
 * 計算含 prompt-cache 的實際 provider 成本。呼叫端必須分開傳入
 * provider usage 欄位，不能把 cache token 猜進一般 input tokens。
 */
export function calcDetailedCostUsd(model: string, usage: DetailedTokenUsage): number {
  const key = normalizeModel(model)
  const spec = MODEL_PRICING[key]
  if (!spec) return 0
  const totalPromptTokensForTier = checkedTokenCount(
    usage.totalPromptTokensForTier,
    'totalPromptTokensForTier',
  )
  const uncachedInputTokens = checkedTokenCount(usage.uncachedInputTokens, 'uncachedInputTokens')
  const outputTokens = checkedTokenCount(usage.outputTokens, 'outputTokens')
  const cacheWrite5mTokens = checkedTokenCount(usage.cacheWrite5mTokens, 'cacheWrite5mTokens')
  const cacheWrite1hTokens = checkedTokenCount(usage.cacheWrite1hTokens, 'cacheWrite1hTokens')
  const cacheReadTokens = checkedTokenCount(usage.cacheReadTokens, 'cacheReadTokens')
  const cacheStorageTokenHours = checkedTokenCount(
    usage.cacheStorageTokenHours,
    'cacheStorageTokenHours',
  )
  const longTier = Boolean(
    spec.longContext && totalPromptTokensForTier > spec.longContext.aboveInputTokens,
  )
  const inputRate = longTier ? spec.longContext!.input : spec.input
  const outputRate = longTier ? spec.longContext!.output : spec.output
  const cacheReadRate = longTier && spec.longContext?.cacheRead !== undefined
    ? spec.longContext.cacheRead
    : spec.cache?.read

  if (cacheReadTokens > 0 && cacheReadRate === undefined) {
    throw new RangeError(`${key} 未定義 cache read 定價`)
  }
  if (cacheWrite5mTokens > 0 && spec.cache?.write5m === undefined) {
    throw new RangeError(`${key} 未定義 5m cache write 定價`)
  }
  if (cacheWrite1hTokens > 0 && spec.cache?.write1h === undefined) {
    throw new RangeError(`${key} 未定義 1h cache write 定價`)
  }
  if (cacheStorageTokenHours > 0 && spec.cache?.storagePerMillionTokenHour === undefined) {
    throw new RangeError(`${key} 未定義 cache storage 定價`)
  }

  const cost = (
    uncachedInputTokens * inputRate +
    outputTokens * outputRate +
    cacheReadTokens * (cacheReadRate ?? 0) +
    cacheWrite5mTokens * (spec.cache?.write5m ?? 0) +
    cacheWrite1hTokens * (spec.cache?.write1h ?? 0) +
    cacheStorageTokenHours * (spec.cache?.storagePerMillionTokenHour ?? 0)
  ) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * 從 model 字串猜 provider（無法確定時回 'other'）
 */
export function providerFromModel(model: string): ProviderTag {
  const key = normalizeModel(model)
  return MODEL_PRICING[key]?.provider ?? 'other'
}
