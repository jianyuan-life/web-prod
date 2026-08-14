#!/usr/bin/env node
// 純 Node.js 測試執行器 — 不依賴任何第三方套件
// 用法：node __tests__/run-tests.mjs

import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const releaseMode = process.argv.includes('--release')
const requiredReleaseRuntimeFlags = [
  'REFUND_MIGRATION_PG_RUNTIME',
  'SECURITY_MIGRATION_PG_RUNTIME',
  'G15_CONSENT_PG_RUNTIME',
  'FREE_CHECKOUT_PG_RUNTIME',
]
const missingReleaseRuntimeFlags = releaseMode
  ? requiredReleaseRuntimeFlags.filter(name => process.env[name] !== '1')
  : []
if (missingReleaseRuntimeFlags.length > 0) {
  console.error(`release gate 缺少真實 runtime flags: ${missingReleaseRuntimeFlags.join(', ')}`)
  process.exit(1)
}
const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.mjs'))
  .sort()

const requiredReleaseTests = [
  '35-e3-freeze-contract.test.mjs',
  '36-e3-fixture-server.test.mjs',
  '41-consultation-checkout-aliases.test.mjs',
  '49-calculator-request.test.mjs',
  '66-e3-production-csp-smoke-contract.test.mjs',
  '66-e3-server-checkout-contract.test.mjs',
  '107-cg15-checkout-webhook-producer-contract.test.mjs',
  '111-legacy-paid-calculator-request-auth.test.mjs',
  '113-consultation-provenance-contract.test.mjs',
  '114-cg15-precheckout-readiness.test.mjs',
  '122-referral-refund-points-atomic-contract.test.mjs',
  '122-workflow-log-privacy.test.mjs',
  '123-free-checkout-atomic.test.mjs',
  '124-private-pdf-recovery.test.mjs',
  '132-pdf-integrity-boundary.test.mjs',
  '134-completion-email-idempotency.test.mjs',
  '135-fallback-pdf-terminal-integrity.test.mjs',
  '136-completion-email-delivery-claim-postgres.test.mjs',
  '136-g15-bound-revoke-api.test.mjs',
  '136-pdf-generation-ownership.test.mjs',
  '137-paid-checkout-reservation-postgres.test.mjs',
  '126-g15-independent-consent.test.mjs',
  '127-g15-consent-postgres.test.mjs',
  '128-g15-consent-invitations.test.mjs',
  '129-g15-consent-api.test.mjs',
  '130-g15-checkout-consent-gate.test.mjs',
  '131-g15-consent-public-page.test.mjs',
  '132-g15-checkout-reservation-postgres.test.mjs',
  '133-g15-checkout-reservation-wire.test.mjs',
  '67-e3-checkout-route-integration.test.mjs',
  '68-e3-generation-golden-contract.test.mjs',
]
const missingReleaseTests = requiredReleaseTests.filter(file => !testFiles.includes(file))
if (missingReleaseTests.length > 0) {
  console.error(`缺少必要 release tests: ${missingReleaseTests.join(', ')}`)
  process.exit(1)
}

let totalPassed = 0
let totalFailed = 0
let totalSkipped = 0
const failedFiles = []
const skippedFiles = []

console.log(`\n${'='.repeat(60)}`)
console.log(`  鑑源自動化測試套件`)
console.log(`  發現 ${testFiles.length} 個測試檔案`)
console.log(`${'='.repeat(60)}\n`)

for (const file of testFiles) {
  const filePath = join(__dirname, file)
  const result = await new Promise((resolve) => {
    const child = fork(filePath, [], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        JIANYUAN_RELEASE_TEST: releaseMode ? '1' : '0',
        REFUND_MIGRATION_PG_RUNTIME: releaseMode ? '1' : (process.env.REFUND_MIGRATION_PG_RUNTIME || '0'),
        SECURITY_MIGRATION_PG_RUNTIME: releaseMode ? '1' : (process.env.SECURITY_MIGRATION_PG_RUNTIME || '0'),
        G15_CONSENT_PG_RUNTIME: releaseMode ? '1' : (process.env.G15_CONSENT_PG_RUNTIME || '0'),
        FREE_CHECKOUT_PG_RUNTIME: releaseMode ? '1' : (process.env.FREE_CHECKOUT_PG_RUNTIME || '0'),
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', d => { stdout += d; process.stdout.write(d) })
    child.stderr?.on('data', d => { stderr += d })
    child.on('exit', code => resolve({ code, stdout, stderr }))
    child.on('error', err => resolve({ code: 1, stdout, stderr: err.message }))
  })

  // 從 stdout 解析結果（每個測試檔最後一行會輸出 JSON 統計）
  const lines = result.stdout.trim().split('\n')
  const lastLine = lines[lines.length - 1]
  try {
    const stats = JSON.parse(lastLine)
    totalPassed += stats.passed || 0
    totalFailed += stats.failed || 0
    totalSkipped += stats.skipped || 0
    if ((stats.failed || 0) > 0 || result.code !== 0) failedFiles.push(file)
    if ((stats.skipped || 0) > 0) skippedFiles.push(`${file}:${stats.skipped}`)
    if (result.code !== 0 && !(stats.failed > 0)) {
      totalFailed++
      console.error(`  ${file} 非零退出碼 ${result.code}，但統計未回報失敗`)
    }
  } catch {
    // node:test 會輸出 TAP/spec summary 而不是自製 harness JSON；
    // 非零退出永遠算失敗，零退出則盡量把摘要納入統計，不把格式差異誤判為紅燈。
    if (result.code !== 0) {
      totalFailed++
      failedFiles.push(file)
    } else {
      const passMatch = result.stdout.match(/(?:^|\n)(?:#\s*|ℹ\s*)pass\s+(\d+)/u)
      const skipMatch = result.stdout.match(/(?:^|\n)(?:#\s*|ℹ\s*)skipped\s+(\d+)/u)
      totalPassed += passMatch ? Number(passMatch[1]) : 0
      totalSkipped += skipMatch ? Number(skipMatch[1]) : 0
      if (skipMatch && Number(skipMatch[1]) > 0) skippedFiles.push(`${file}:${skipMatch[1]}`)
    }
    if (result.stderr) console.error(`  stderr: ${result.stderr.slice(0, 200)}`)
  }
  console.log('')
}

console.log(`${'='.repeat(60)}`)
console.log(`  總結: ${totalPassed} 通過 / ${totalFailed} 失敗 / ${totalSkipped} 跳過`)
console.log(`${'='.repeat(60)}\n`)
if (failedFiles.length > 0) console.error(`失敗檔案: ${[...new Set(failedFiles)].join(', ')}`)
if (skippedFiles.length > 0) console.error(`跳過檔案: ${[...new Set(skippedFiles)].join(', ')}`)

if (releaseMode && totalSkipped > 0) {
  console.error(`release gate 禁止跳過測試：${totalSkipped} 個必要觀測未執行`)
}

process.exit(totalFailed > 0 || (releaseMode && totalSkipped > 0) ? 1 : 0)
