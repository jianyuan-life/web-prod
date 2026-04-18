// ============================================================
// Alibaba Qwen Provider — Qwen Max 命理官（國際版 DashScope）
// ============================================================
// API: https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
// 預設模型：qwen-max
// 備援：qwen-plus、qwen-turbo
// 使用 OpenAI 相容格式

import type { LLMProvider, LLMRequest, LLMResponse } from '../types'

const API_KEY = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || ''
const BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
const TIMEOUT_MS = 180_000

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'qwen-max': { input: 1.6, output: 6.4 },
  'qwen-plus': { input: 0.4, output: 1.2 },
  'qwen-turbo': { input: 0.05, output: 0.2 },
}

export const qwenProvider: LLMProvider = {
  name: 'alibaba',
  defaultModel: 'qwen-max',
  supportedModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'alibaba',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'QWEN_API_KEY (or DASHSCOPE_API_KEY) not set',
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
          provider: 'alibaba',
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
        provider: 'alibaba',
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
        provider: 'alibaba',
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
      model: 'qwen-turbo',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    // 有些版本會是 qwen-max-latest、qwen-plus-2025-xx-xx 這種後綴
    let key = m
    if (!PRICING[key]) {
      if (m.startsWith('qwen-max')) key = 'qwen-max'
      else if (m.startsWith('qwen-plus')) key = 'qwen-plus'
      else if (m.startsWith('qwen-turbo')) key = 'qwen-turbo'
    }
    const p = PRICING[key] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
