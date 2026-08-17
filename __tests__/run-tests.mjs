#!/usr/bin/env node
// 純 Node.js 測試執行器 — 不依賴任何第三方套件
// 用法：node __tests__/run-tests.mjs

import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { fork } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.mjs'))
  .sort()

const requiredReleaseTests = [
  '35-e3-freeze-contract.test.mjs',
  '36-e3-fixture-server.test.mjs',
  '49-calculator-request.test.mjs',
  '66-e3-production-csp-smoke-contract.test.mjs',
  '66-e3-server-checkout-contract.test.mjs',
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

console.log(`\n${'='.repeat(60)}`)
console.log(`  鑑源自動化測試套件`)
console.log(`  發現 ${testFiles.length} 個測試檔案`)
console.log(`${'='.repeat(60)}\n`)

for (const file of testFiles) {
  const filePath = join(__dirname, file)
  const result = await new Promise((resolve) => {
    // v5.10.492:alias hook 讓測試能直接載入用 '@/' 別名與無副檔名相對匯入的
    //   production 模組(prompts/*)。純解析映射、不改來源碼;對既有測試無影響。
    const child = fork(filePath, [], {
      stdio: 'pipe',
      // Windows:必須傳 file:// URL,裸路徑的磁碟機字母會被當成 URL scheme(ERR_UNSUPPORTED_ESM_URL_SCHEME)
      execArgv: ['--experimental-strip-types', '--import', pathToFileURL(join(__dirname, 'helpers', 'alias-hooks.mjs')).href],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
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
    if (result.code !== 0 && !(stats.failed > 0)) {
      totalFailed++
      console.error(`  ${file} 非零退出碼 ${result.code}，但統計未回報失敗`)
    }
  } catch {
    // node:test 會輸出 TAP/spec summary 而不是自製 harness JSON；
    // 非零退出永遠算失敗，零退出則盡量把摘要納入統計，不把格式差異誤判為紅燈。
    if (result.code !== 0) {
      totalFailed++
    } else {
      const passMatch = result.stdout.match(/(?:^|\n)(?:#\s*|ℹ\s*)pass\s+(\d+)/u)
      const skipMatch = result.stdout.match(/(?:^|\n)(?:#\s*|ℹ\s*)skipped\s+(\d+)/u)
      totalPassed += passMatch ? Number(passMatch[1]) : 0
      totalSkipped += skipMatch ? Number(skipMatch[1]) : 0
    }
    if (result.stderr) console.error(`  stderr: ${result.stderr.slice(0, 200)}`)
  }
  console.log('')
}

console.log(`${'='.repeat(60)}`)
console.log(`  總結: ${totalPassed} 通過 / ${totalFailed} 失敗 / ${totalSkipped} 跳過`)
console.log(`${'='.repeat(60)}\n`)

process.exit(totalFailed > 0 ? 1 : 0)
