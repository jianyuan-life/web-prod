import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const points = readFileSync(join(root, 'components', 'checkout', 'PointsRedeem.tsx'), 'utf8')
const checkout = readFileSync(join(root, 'app', 'checkout', 'page.tsx'), 'utf8')

test('C/G15 coupon and points controls enforce mutual exclusion for mouse and keyboard', () => {
  assert.match(points, /enforceMutualExclusion\?: boolean/u)
  assert.match(points, /if \(enforceMutualExclusion && hasCoupon\)/u)
  assert.match(points, /disabled=\{enforceMutualExclusion && hasCoupon\}/u)
  assert.match(points, /validating \|\| !pointsInput\.trim\(\) \|\| !isReady \|\| \(enforceMutualExclusion && hasCoupon\)/u)
  assert.match(checkout, /enforceMutualExclusion=\{consultationCheckout\}/u)
})

test('legacy plans keep the prior default behavior unless the consultation prop is explicitly enabled', () => {
  assert.match(points, /enforceMutualExclusion = false/u)
})
