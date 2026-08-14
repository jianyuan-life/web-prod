import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStripeCheckoutSessionParams } from '../lib/checkout/server-checkout-contract.ts'

const nowEpochSeconds = 1_786_200_000

function paramsFor(planCode) {
  return buildStripeCheckoutSessionParams({
    siteUrl: 'https://jianyuan.life',
    planCode,
    planName: `synthetic-${planCode}`,
    finalAmount: 5900,
    nowEpochSeconds,
  })
}

test('C／G15 Stripe Checkout Session 保留 35 分鐘安全窗，E3 不新增 expires_at', () => {
  const expectedLifetimeSeconds = 35 * 60
  const cExpiresAt = Number(paramsFor('C').get('expires_at'))
  const g15ExpiresAt = Number(paramsFor('G15').get('expires_at'))

  assert.equal(cExpiresAt, nowEpochSeconds + expectedLifetimeSeconds)
  assert.equal(g15ExpiresAt, nowEpochSeconds + expectedLifetimeSeconds)
  assert.ok(cExpiresAt - nowEpochSeconds >= 30 * 60)
  assert.ok(g15ExpiresAt - nowEpochSeconds >= 30 * 60)
  assert.equal(paramsFor('E3').has('expires_at'), false)
})
