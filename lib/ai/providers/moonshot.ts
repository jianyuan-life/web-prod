// ============================================================
// Moonshot Provider — Kimi K2 系列（OpenAI 相容格式）
// ============================================================
// API: https://api.moonshot.cn/v1/chat/completions
// 預設模型：moonshot-v1-auto
// 備援：moonshot-v1-32k、moonshot-v1-128k
// 用途：5 LLM QA 評分的第 5 位審查員（Kimi 角色）

import type { LLMProvider } from '../types'

const API_KEY = process.env.MOONSHOT_API_KEY || ''
const BASE_URL = process.env.MOONSHOT_API_BASE || 'https://api.moonshot.cn/v1/chat/completions'
const TIMEOUT_MS = 180_000

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'moonshot-v1-auto': { input: 0.4, output: 1.2 },
  'moonshot-v1-8k':   { input: 0.2, output: 0.8 },
  'moonshot-v1-32k':  { input: 0.5, output: 1.5 },
  'moonshot-v1-128k': { input: 2.0, output: 5.0 },
  'kimi-k2.5':        { input: 0.6, output: 2.5 },
  'kimi-k2-thinking': { input: 0.6, output: 2.5 },
}

export const moonshotProvider: LLMProvider = {
  name: 'moonshot',
  defaultModel: 'moonshot-v1-auto',
  supportedModels: [
    'moonshot-v1-auto', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k',
    'kimi-k2.5', 'kimi-k2-thinking',
  ],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'moonshot',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'MOONSHOT_API_KEY not set',
        }
      }

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_tokens: Math.min(req.maxTokens ?? 4096, 8192),
      }
      // Kimi K2.5 是思考模型，temperature 只能 1；其他模型可自訂
      if (model === 'kimi-k2.5' || model === 'kimi-k2-thinking') {
        body.temperature = 1
      } else if (typeof req.temperature === 'number') {
        body.temperature = req.temperature
      }
      if (req.jsonMode) body.response_format = { type: 'json_object' }

      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text()
        return {
          content: '',
          model,
          provider: 'moonshot',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        }
      }

      const data = await res.json()
      const content: string = data?.choices?.[0]?.message?.content || ''
      const promptTokens: number = data?.usage?.prompt_tokens || 0
      const completionTokens: number = data?.usage?.completion_tokens || 0
      const returnedModel: string = data?.model || model

      return {
        content,
        model: returnedModel,
        provider: 'moonshot',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs: Date.now() - t0,
        costUsd: this.estimateCost(promptTokens, completionTokens, returnedModel),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: '',
        model,
        provider: 'moonshot',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: Date.now() - t0,
        costUsd: 0,
        error: msg,
      }
    }
  },

  async healthCheck() {
    if (!API_KEY) return false
    const r = await this.generate({
      system: 'ping',
      user: 'say hi',
      maxTokens: 10,
      model: 'moonshot-v1-auto',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    const p = PRICING[m] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
