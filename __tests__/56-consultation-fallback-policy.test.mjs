import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { consultationFallbackDecision } from '../lib/consultation/fallback-policy.ts'

test('C consultation v1 開啟後，fallback 必須 workflow-only；關閉時保留既有路徑', () => {
  assert.deepEqual(
    consultationFallbackDecision('C', {}, { USE_CONSULTATION_REPORT_V1_C: 'true' }),
    {
      mode: 'workflow_only',
      plan: 'C',
      reason: 'C consultation v1 必須由 durable workflow 生成，不得降級成交付舊報告',
    },
  )
  assert.deepEqual(
    consultationFallbackDecision('C', {}, { USE_CONSULTATION_REPORT_V1_C: 'false' }),
    { mode: 'legacy_allowed' },
  )
})

test('G15 family 與 E3 的既有行為保持分離', () => {
  assert.equal(consultationFallbackDecision('G15', { plan_type: 'family_reports' }).mode, 'workflow_only')
  assert.deepEqual(
    consultationFallbackDecision('E3', { plan_type: 'family_reports' }, { USE_CONSULTATION_REPORT_V1_E3: 'true' }),
    { mode: 'legacy_allowed' },
  )
})

test('實際 generate-report route 在排盤與 AI 呼叫前執行 shared fallback policy', async () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const route = await fs.readFile(path.join(root, 'app', 'api', 'generate-report', 'route.ts'), 'utf8')
  const decision = route.indexOf('consultationFallbackDecision(planCode, birthData)')
  const calculate = route.indexOf('// Step 1: 呼叫 Python API 排盤')
  const legacyC = route.indexOf("if (planCode === 'C')", calculate)
  assert.ok(decision > 0 && decision < calculate && calculate < legacyC)
  assert.match(route.slice(decision, calculate), /status:\s*409/u)
})
