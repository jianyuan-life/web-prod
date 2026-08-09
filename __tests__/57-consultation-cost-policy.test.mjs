import { readFileSync } from 'node:fs'
import { suite, test, assert, assertEqual, done } from './harness.mjs'

let costPolicy
let loadError
try {
  costPolicy = await import('../lib/consultation/cost-policy.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 生成成本硬預算')

test('C 與 G15 的整份硬預算不超過售價 35%，且單章不再允許 128000 tokens', () => {
  assert(costPolicy, `成本政策無法載入: ${loadError?.message || 'unknown error'}`)
  const c = costPolicy.getConsultationCostPolicy('C')
  const g15 = costPolicy.getConsultationCostPolicy('G15')
  assert(c.budgetUsd > 0 && c.budgetUsd <= c.priceUsd * 0.35)
  assert(g15.budgetUsd > 0 && g15.budgetUsd <= g15.priceUsd * 0.35)
  assert(c.authorMaxOutputTokens >= 8_000 && c.authorMaxOutputTokens < 128_000)
  assert(g15.authorMaxOutputTokens >= 12_000 && g15.authorMaxOutputTokens < 128_000)
  assertEqual(c.authorModel, 'claude-opus-4-6')
  assertEqual(g15.reviewerModel, 'gemini-3.1-pro-preview')
})

test('呼叫前以 UTF-8 bytes 作 input token 上界；預算不足或 prompt 過大時 fail closed', () => {
  const ledger = costPolicy.createConsultationCostLedger('C')
  const reservation = costPolicy.reserveConsultationCall({
    ledger,
    stage: 'author',
    scopeKey: 'job:cost-test-1',
    prompt: '繁體中文封閉資料'.repeat(100),
  })
  assert(reservation.maximumCostUsd > 0)
  assertEqual(reservation.maxOutputTokens, costPolicy.getConsultationCostPolicy('C').authorMaxOutputTokens)

  ledger.actualUsd = costPolicy.getConsultationCostPolicy('C').budgetUsd - 0.001
  let error
  try {
    costPolicy.reserveConsultationCall({ ledger, stage: 'author', scopeKey: 'job:cost-test-2', prompt: '仍需付費的章節' })
  } catch (caught) { error = caught }
  assert(error)
  assertEqual(error.code, 'cost.budget_exceeded')

  const huge = costPolicy.createConsultationCostLedger('C')
  error = undefined
  try {
    costPolicy.reserveConsultationCall({
      ledger: huge,
      stage: 'author',
      scopeKey: 'job:cost-test-huge',
      prompt: '甲'.repeat(costPolicy.getConsultationCostPolicy('C').authorInputByteCeiling + 1),
    })
  } catch (caught) { error = caught }
  assert(error)
  assertEqual(error.code, 'cost.input_ceiling')
})

test('實際用量由 canonical pricing 重算，模型、token 上限或偽造 cost 都不能混入收據', () => {
  const ledger = costPolicy.createConsultationCostLedger('G15')
  const reservation = costPolicy.reserveConsultationCall({
    ledger,
    stage: 'author',
    scopeKey: 'job:g15-author',
    prompt: '家庭章節封閉資料'.repeat(500),
  })
  costPolicy.commitConsultationUsage({
    ledger,
    reservation,
    usage: {
      model: 'claude-opus-4-6',
      promptTokens: 2_000,
      completionTokens: 12_000,
      reportedCostUsd: 0,
    },
  })
  assert(ledger.actualUsd > 0)
  assert(ledger.calls[0].costUsd > 0)

  const reviewer = costPolicy.reserveConsultationCall({
    ledger,
    stage: 'review',
    scopeKey: 'review:g15',
    prompt: '審查整份報告',
  })
  let error
  try {
    costPolicy.commitConsultationUsage({
      ledger,
      reservation: reviewer,
      usage: {
        model: 'gemini-2.5-flash',
        promptTokens: 100,
        completionTokens: 100,
        reportedCostUsd: 0,
      },
    })
  } catch (caught) { error = caught }
  assert(error)
  assertEqual(error.code, 'cost.model_mismatch')
  costPolicy.failConsultationReservation({ ledger, reservation: reviewer })

  const receipt = costPolicy.finalizeConsultationCostLedger(ledger)
  assert(/^sha256:[0-9a-f]{64}$/u.test(receipt.artifactHash))
  assert(receipt.actualUsd <= receipt.budgetUsd)
})

test('已預留的短回應或例外不得歸零；連續失敗會耗用同一份硬預算', () => {
  const ledger = costPolicy.createConsultationCostLedger('C')
  const first = costPolicy.reserveConsultationCall({
    ledger,
    stage: 'author',
    scopeKey: 'job:failed-1',
    prompt: '短回應前已送出的付費 prompt'.repeat(2_000),
  })
  assert(ledger.reservedUsd === first.maximumCostUsd)
  const charged = costPolicy.failConsultationReservation({ ledger, reservation: first })
  assertEqual(charged.billingBasis, 'failed_reservation')
  assertEqual(ledger.reservedUsd, 0)
  assertEqual(ledger.actualUsd, first.maximumCostUsd)

  let failures = 1
  while (true) {
    try {
      const reservation = costPolicy.reserveConsultationCall({
        ledger,
        stage: 'author',
        scopeKey: `job:failed-${failures + 1}`,
        prompt: '重試仍需先預留最壞成本'.repeat(2_000),
      })
      costPolicy.failConsultationReservation({ ledger, reservation })
      failures += 1
    } catch (error) {
      assertEqual(error.code, 'cost.budget_exceeded')
      break
    }
  }
  assert(failures > 1)
  assert(ledger.actualUsd <= ledger.budgetUsd)
})

test('reserve／provider response／usage commit 三個 crash 邊界都能保守重播', () => {
  const afterReserve = costPolicy.createConsultationCostLedger('C')
  costPolicy.reserveConsultationCall({
    ledger: afterReserve,
    stage: 'author',
    scopeKey: 'job:crash-after-reserve',
    prompt: '已送出前先持久化的內容',
  })
  const restoredPending = costPolicy.validateConsultationCostLedger(structuredClone(afterReserve), 'C')
  const recovered = costPolicy.reconcilePendingConsultationReservations(restoredPending)
  assertEqual(recovered.length, 1)
  assertEqual(recovered[0].billingBasis, 'failed_reservation')
  assertEqual(restoredPending.reservedUsd, 0)
  assert(restoredPending.actualUsd > 0)

  const afterCommit = costPolicy.createConsultationCostLedger('C')
  const reservation = costPolicy.reserveConsultationCall({
    ledger: afterCommit,
    stage: 'author',
    scopeKey: 'job:crash-after-usage',
    prompt: '已有可信 provider usage 的內容',
  })
  costPolicy.commitConsultationUsage({
    ledger: afterCommit,
    reservation,
    usage: { model: 'claude-opus-4-6', promptTokens: 10, completionTokens: 10, reportedCostUsd: 0 },
  })
  const restoredCommitted = costPolicy.validateConsultationCostLedger(structuredClone(afterCommit), 'C')
  assertEqual(costPolicy.reconcilePendingConsultationReservations(restoredCommitted).length, 0)
  assertEqual(restoredCommitted.actualUsd, afterCommit.actualUsd)
})

test('workflow 的 C/G15 新路徑使用 job token 上限，且不再疊加隱藏 step retry', () => {
  const steps = readFileSync(new URL('../workflows/generate-report/steps.ts', import.meta.url), 'utf8')
  assert(/aiGenerateConsultationChapter\([\s\S]*maxOutputTokens/u.test(steps))
  assert(/aiGenerateConsultationChapter\.maxRetries\s*=\s*0/u.test(steps))
  assert(/aiReviewConsultationDrafts\.maxRetries\s*=\s*0/u.test(steps))
})

done()
