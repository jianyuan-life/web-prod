// ============================================================
// OpenAI Provider — GPT-4o UX 官
// ============================================================
// API: https://api.openai.com/v1/chat/completions
// 預設模型：gpt-4o
// 備援：gpt-4o-mini

import type { LLMProvider, LLMRequest, LLMResponse } from '../types'

const API_KEY = process.env.OPENAI_API_KEY || ''
const BASE_URL = 'https://api.openai.com/v1/chat/completions'
const TIMEOUT_MS = 180_000

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

export const openaiProvider: LLMProvider = {
  name: 'openai',
  defaultModel: 'gpt-4o',
  supportedModels: ['gpt-4o', 'gpt-4o-mini'],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'openai',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'OPENAI_API_KEY not set',
        }
      }

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_tokens: Math.min(req.maxTokens ?? 4096, 16384),
      }
      if (typeof req.temperature === 'number') body.temperature = req.temperature
      if (typeof req.seed === 'number') body.seed = req.seed
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
          provider: 'openai',
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
        provider: 'openai',
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
        provider: 'openai',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: Date.now() - t0,
        costUsd: 0,
        error: msg,
      }
    }
  },

  async healthCheck() {
    const r = await this.generate({
      system: 'ping',
      user: 'say hi',
      maxTokens: 10,
      model: 'gpt-4o-mini',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    // 若是帶日期後綴的衍生 model（ex. gpt-4o-2024-08-06），fallback 到基底
    const key = PRICING[m] ? m : (m.startsWith('gpt-4o-mini') ? 'gpt-4o-mini' : m.startsWith('gpt-4o') ? 'gpt-4o' : m)
    const p = PRICING[key] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
