// ============================================================
// Anthropic Claude Provider — Opus 4.6 主筆
// ============================================================
// API: https://api.anthropic.com/v1/messages
// 預設模型：claude-opus-4-7（最高品質，主要用於報告主筆）
// 備援：claude-sonnet-4-6、claude-haiku-4-5-20251001

import type { LLMProvider, LLMRequest, LLMResponse } from '../types'

const API_KEY = process.env.CLAUDE_API_KEY || ''
const BASE_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const TIMEOUT_MS = 180_000 // 3 分鐘

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
}

export const claudeProvider: LLMProvider = {
  name: 'anthropic',
  defaultModel: 'claude-opus-4-7',
  supportedModels: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'anthropic',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'CLAUDE_API_KEY not set',
        }
      }

      const body: Record<string, unknown> = {
        model,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        max_tokens: Math.min(req.maxTokens ?? 4096, 8192),
      }
      // v5.3.8 hotfix：Claude Opus 4.7 及更新 reasoning 模型不再接受 temperature 參數
      //   API 會回 400: "`temperature` is deprecated for this model."
      //   只對舊模型（opus-4-6 及以前）傳 temperature
      const isModernOpus = typeof model === 'string' && /claude-opus-4-[7-9]/.test(model)
      if (typeof req.temperature === 'number' && !isModernOpus) {
        body.temperature = req.temperature
      }

      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': API_VERSION,
          'x-api-key': API_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text()
        return {
          content: '',
          model,
          provider: 'anthropic',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        }
      }

      const data = await res.json()
      // Anthropic 回傳 content 為陣列，取第一個 text block
      const content: string = Array.isArray(data?.content)
        ? data.content.find((c: { type?: string }) => c?.type === 'text')?.text || ''
        : ''
      const promptTokens: number = data?.usage?.input_tokens || 0
      const completionTokens: number = data?.usage?.output_tokens || 0
      const returnedModel: string = data?.model || model

      return {
        content,
        model: returnedModel,
        provider: 'anthropic',
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
        provider: 'anthropic',
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
      model: 'claude-haiku-4-5-20251001',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    const p = PRICING[m] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
