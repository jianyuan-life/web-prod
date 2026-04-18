// ============================================================
// Google Gemini Provider — 2.5 Pro 結構官
// ============================================================
// API: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}
// 預設模型：gemini-2.5-pro
// 備援：gemini-2.5-flash、gemini-2.0-flash
// 注意：safetySettings 全部設為 BLOCK_NONE（命理報告可能觸發安全過濾器）

import type { LLMProvider, LLMRequest, LLMResponse } from '../types'

const API_KEY = process.env.GEMINI_API_KEY || ''
const BASE_HOST = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 180_000

// 成本表（USD / 1M tokens）
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
]

export const geminiProvider: LLMProvider = {
  name: 'google',
  defaultModel: 'gemini-2.5-pro',
  supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],

  async generate(req) {
    const t0 = Date.now()
    const model = req.model || this.defaultModel
    try {
      if (!API_KEY) {
        return {
          content: '',
          model,
          provider: 'google',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: 'GEMINI_API_KEY not set',
        }
      }

      const url = `${BASE_HOST}/${encodeURIComponent(model)}:generateContent?key=${API_KEY}`

      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: Math.min(req.maxTokens ?? 4096, 32768),
      }
      if (typeof req.temperature === 'number') generationConfig.temperature = req.temperature
      if (req.jsonMode) generationConfig.responseMimeType = 'application/json'

      const body = {
        system_instruction: {
          parts: [{ text: req.system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: req.user }],
          },
        ],
        safetySettings: SAFETY_SETTINGS,
        generationConfig,
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text()
        return {
          content: '',
          model,
          provider: 'google',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - t0,
          costUsd: 0,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        }
      }

      const data = await res.json()
      const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts || []
      const content: string = parts.map((p) => p.text || '').join('')
      const promptTokens: number = data?.usageMetadata?.promptTokenCount || 0
      const completionTokens: number = data?.usageMetadata?.candidatesTokenCount || 0

      // 被安全過濾器擋掉時候 candidates 會有 finishReason='SAFETY' 而 content 為空
      const finishReason: string | undefined = data?.candidates?.[0]?.finishReason
      if (!content && finishReason && finishReason !== 'STOP') {
        return {
          content: '',
          model,
          provider: 'google',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          latencyMs: Date.now() - t0,
          costUsd: this.estimateCost(promptTokens, completionTokens, model),
          error: `Gemini finishReason=${finishReason}`,
        }
      }

      return {
        content,
        model,
        provider: 'google',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs: Date.now() - t0,
        costUsd: this.estimateCost(promptTokens, completionTokens, model),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: '',
        model,
        provider: 'google',
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
      model: 'gemini-2.5-flash',
    })
    return !r.error && r.content.length > 0
  },

  estimateCost(promptTokens, completionTokens, model) {
    const m = model || this.defaultModel
    const p = PRICING[m] || { input: 0, output: 0 }
    return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
  },
}
