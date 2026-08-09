import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = 'scripts/consultation-preview-visual-audit.mjs'

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  })
}

test('visual audit adversarial contract rejects every modeled false pass', () => {
  const result = run(['--contract-self-test'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.pass, true)
  assert.deepEqual(receipt.outcomes.map((entry) => entry.name), [
    'clean',
    'loading-failed',
    'console-error',
    'focus-cycle',
    'focus-style',
    'contrast',
    'clipping',
    'overlap',
    'dimensions',
    'theme-forced',
  ])
  assert.equal(receipt.identityOutcomes.find((entry) => entry.name === 'mutable-alias-rejected')?.pass, true)
})

test('release run fails closed without exact Git SHA and deployment ID', () => {
  const result = run(['https://web-abc-owner.vercel.app', 'visual-evidence'])
  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /expected-git-sha/)
})

test('plan exposes the complete viewport, theme, motion and zoom matrix', () => {
  const result = run(['--plan'])
  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(result.stdout)
  assert.equal(plan.standardCaseCount, 80)
  assert.equal(plan.zoom400CaseCount, 16)
  assert.equal(plan.totalCaseCount, 96)
  assert.equal(plan.standardViewports.length, 5)
  assert.deepEqual(plan.themes, ['light', 'dark'])
  assert.deepEqual(plan.motionPreferences, ['no-preference', 'reduce'])
})
