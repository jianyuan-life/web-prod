import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { suite, test, assert, assertEqual, done } from './harness.mjs'

let pricing
let loadError
try {
  pricing = await import('../lib/ai/pricing.ts')
} catch (error) {
  loadError = error
}

suite('官方模型定價與快取成本契約（2026-08-08）')

test('Claude Opus 4.6 使用官方 global $5/$25，而非舊 $15/$75', () => {
  assert(pricing, `pricing 無法載入: ${loadError?.message || 'unknown error'}`)
  assertEqual(pricing.MODEL_PRICING['claude-opus-4-6'].input, 5)
  assertEqual(pricing.MODEL_PRICING['claude-opus-4-6'].output, 25)
  assertEqual(pricing.calcCostUsd('claude-opus-4-6', 1_000_000, 1_000_000), 30)

  const provider = readFileSync(join(process.cwd(), 'lib', 'ai', 'providers', 'claude.ts'), 'utf8')
  assert(provider.includes("'claude-opus-4-6': { input: 5, output: 25 }"), 'provider 層不得保留舊價')
})

test('Gemini 3.1 Pro Preview 在 200k 邊界使用官方兩段價', () => {
  assertEqual(pricing.calcCostUsd('gemini-3.1-pro-preview', 200_000, 10_000), 0.52)
  assertEqual(pricing.calcCostUsd('gemini-3.1-pro-preview', 200_001, 10_000), 0.980004)
})

test('詳細成本可區分未快取、5m/1h 寫入、命中與儲存 token-hours', () => {
  const opus = pricing.calcDetailedCostUsd('claude-opus-4-6', {
    totalPromptTokensForTier: 190_000,
    uncachedInputTokens: 100_000,
    cacheWrite5mTokens: 20_000,
    cacheWrite1hTokens: 30_000,
    cacheReadTokens: 40_000,
    outputTokens: 10_000,
  })
  assertEqual(opus, 1.195)

  const gemini = pricing.calcDetailedCostUsd('gemini-3.1-pro-preview', {
    totalPromptTokensForTier: 150_000,
    uncachedInputTokens: 100_000,
    cacheReadTokens: 50_000,
    cacheStorageTokenHours: 50_000,
    outputTokens: 10_000,
  })
  assertEqual(gemini, 0.555)
})

done()
