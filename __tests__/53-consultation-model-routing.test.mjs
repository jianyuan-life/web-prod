import test from 'node:test'
import assert from 'node:assert/strict'

import { geminiProvider } from '../lib/ai/providers/gemini.ts'
import { calcCostUsd, providerFromModel } from '../lib/ai/pricing.ts'
import { CONSULTATION_REVIEW_DEFAULT_MODEL } from '../lib/consultation/fresh-review.ts'

test('C/G15 fresh review 使用目前官方建議的 Gemini 3.1 Pro Preview，provider 可實際路由', () => {
  assert.equal(CONSULTATION_REVIEW_DEFAULT_MODEL, 'gemini-3.1-pro-preview')
  assert.ok(geminiProvider.supportedModels.includes(CONSULTATION_REVIEW_DEFAULT_MODEL))
  assert.equal(providerFromModel(CONSULTATION_REVIEW_DEFAULT_MODEL), 'gemini')
})

test('Gemini 3.1 Pro Preview 成本依 200k input 邊界計算', () => {
  assert.equal(geminiProvider.estimateCost(100_000, 10_000, 'gemini-3.1-pro-preview'), 0.32)
  assert.equal(geminiProvider.estimateCost(250_000, 10_000, 'gemini-3.1-pro-preview'), 1.18)
  assert.equal(calcCostUsd('gemini-3.1-pro-preview', 100_000, 10_000), 0.32)
  assert.equal(calcCostUsd('gemini-3.1-pro-preview', 250_000, 10_000), 1.18)
})
