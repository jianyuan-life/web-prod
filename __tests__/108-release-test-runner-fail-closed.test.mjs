import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const runnerSource = readFileSync(new URL('./run-tests.mjs', import.meta.url), 'utf8')
const ciSource = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

test('release test mode treats every skipped test as a hard failure', () => {
  assert.match(runnerSource, /process\.argv\.includes\(['"]--release['"]\)/)
  assert.match(runnerSource, /releaseMode\s*&&\s*totalSkipped\s*>\s*0/)
  assert.match(runnerSource, /process\.exit\([^\n]*releaseMode[^\n]*totalSkipped/s)
})

test('checkout alias wire test is mandatory in the direct release command', () => {
  assert.match(runnerSource, /['"]41-consultation-checkout-aliases\.test\.mjs['"]/) 
  assert.match(runnerSource, /const releaseMode = process\.argv\.includes\(['"]--release['"]\)/)
})

test('CI invokes the fail-closed release runner rather than the permissive local command', () => {
  assert.match(ciSource, /node\s+__tests__\/run-tests\.mjs\s+--release/u)
  assert.doesNotMatch(ciSource, /name:\s*Run tests\s*\r?\n\s*run:\s*npm test/u)
})

test('release CI cannot downgrade PostgreSQL 17 refund scenarios to static SQL matching', () => {
  assert.match(runnerSource, /['"]122-referral-refund-points-atomic-contract\.test\.mjs['"]/u)
  assert.match(runnerSource, /JIANYUAN_RELEASE_TEST:\s*releaseMode\s*\?\s*['"]1['"]\s*:\s*['"]0['"]/u)
  assert.match(runnerSource, /REFUND_MIGRATION_PG_RUNTIME:\s*releaseMode\s*\?\s*['"]1['"]/u)
  assert.match(ciSource, /REFUND_MIGRATION_PG_RUNTIME:\s*['"]1['"]/u)
})

test('release CI requires all G15 consent tests and forces the real PostgreSQL 17 runtime', () => {
  for (let number = 126; number <= 131; number += 1) {
    assert.match(runnerSource, new RegExp(`['"]${number}-g15-[^'"]+\\.test\\.mjs['"]`, 'u'))
  }
  assert.match(runnerSource, /G15_CONSENT_PG_RUNTIME:\s*releaseMode\s*\?\s*['"]1['"]/u)
  assert.match(ciSource, /G15_CONSENT_PG_RUNTIME:\s*['"]1['"]/u)
})
