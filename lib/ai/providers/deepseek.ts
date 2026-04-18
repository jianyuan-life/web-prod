// ============================================================
// DeepSeek Provider — 推理官 / 低成本備援
// ============================================================
// API: https://api.deepseek.com/v1/chat/completions
// 預設模型：deepseek-chat（V3）
// 備援：deepseek-reasoner（R1 推理模型）
// 使用 OpenAI 相容格式

import type { LLMProvider, LLMRequest, LLMResponse } from '../types'

const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BASE_URL = 'https://api.deepseek.com/v1/chat/completions'
const TIMEOUT_MS = 180_000

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}

export const deepseekProvider: LLMProvider = {
  name: 'deepseek',
  defaultModel: 'deepseek-chat',
  supportedModels: ['deepseek-chat', 'deepseek-reasoner'],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'deepseek',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'DEEPSEEK_API_KEY not set',
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
      // deepseek-reasoner 不支援 temperature / top_p / presence_penalty / frequency_penalty
      if (model !== 'deepseek-reasoner') {
        if (typeof req.temperature === 'number') body.temperature = req.temperature
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
          provider: 'deepseek',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        }
      }

      const data = await res.json()
      // reasoner 會有 reasoning_content（思考過程），我們只取 content（最終答案）
      const content: string = data?.choices?.[0]?.message?.content || ''
      const promptTokens: number = data?.usage?.prompt_tokens || 0
      const completionTokens: number = data?.usage?.completion_tokens || 0
      const returnedModel: string = data?.model || model

      return {
        content,
        model: returnedModel,
        provider: 'deepseek',
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
        provider: 'deepseek',
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
      model: 'deepseek-chat',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    const p = PRICING[m] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
