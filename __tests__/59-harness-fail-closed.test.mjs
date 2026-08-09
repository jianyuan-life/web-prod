import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('自製 harness 必須等待 async 斷言，失敗時 JSON 與 process exit 同時紅燈', () => {
  const harnessUrl = new URL('./harness.mjs', import.meta.url).href
  const script = [
    `import { suite, test, done } from ${JSON.stringify(harnessUrl)}`,
    `suite('async fail calibration')`,
    `test('late failure', async () => { await Promise.resolve(); throw new Error('CALIBRATION_FAILURE') })`,
    `await done()`,
  ].join(';')
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
  })

  assert.notEqual(child.status, 0, child.stdout + child.stderr)
  const lines = child.stdout.trim().split(/\r?\n/)
  const stats = JSON.parse(lines.at(-1))
  assert.equal(stats.failed, 1)
  assert.equal(stats.passed, 0)
  assert.match(child.stdout, /CALIBRATION_FAILURE/)
})
