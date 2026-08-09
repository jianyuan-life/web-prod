import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const script = 'scripts/consultation-preview-visual-audit.mjs'
const scriptSource = readFileSync(script, 'utf8')
const globalCss = readFileSync('app/globals.css', 'utf8')

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
    'viewport-mobile-rounding',
    'viewport-real-drift',
    'canceled-prefetch',
    'canceled-script',
    'fetch-response-error',
  ])
  assert.equal(receipt.identityOutcomes.find((entry) => entry.name === 'mutable-alias-rejected')?.pass, true)
})

test('visual audit distinguishes blocked telemetry and browser rounding from real defects', () => {
  assert.match(scriptSource, /\*\/api\/error-report\*/)
  assert.match(scriptSource, /behavior:\s*'instant'/)
  assert.match(scriptSource, /baselineByPath\.has\(record\.path\)[\s\S]*record\.focusVisible\s*&&\s*record\.hasVisibleIndicator/)
  assert.match(scriptSource, /Math\.abs\(result\.page\.viewport\.innerWidth\s*-\s*result\.requestedViewport\.width\)\s*>\s*3/)
  assert.match(scriptSource, /details:not\(\[open\]\)/)
})

test('global skip link becomes fully visible immediately when keyboard focused', () => {
  const skipRule = globalCss.match(/\.skip-link\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body || ''
  assert.match(skipRule, /transition:\s*none/)
  assert.doesNotMatch(skipRule, /transition:\s*top/)
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
