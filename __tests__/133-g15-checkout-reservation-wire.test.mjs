import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const checkout = readFileSync(new URL('../app/api/checkout/route.ts', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../app/api/webhook/stripe/route.ts', import.meta.url), 'utf8')

test('G15 reserves consent before creating one idempotent Stripe session and binds it before returning', () => {
  const reserveAt = checkout.indexOf("reserve_g15_consent_for_checkout")
  const persistedExpiryAt = checkout.indexOf('reservation?.reservation_expires_at')
  const overrideExpiryAt = checkout.indexOf("params.set('expires_at', String(g15ReservationExpiresEpochSeconds))")
  const stripeAt = checkout.indexOf(
    "fetch('https://api.stripe.com/v1/checkout/sessions'",
    overrideExpiryAt,
  )
  const bindAt = checkout.indexOf("bind_g15_checkout_consent_session")
  const returnAt = checkout.lastIndexOf('return NextResponse.json({ url: data.url })')

  assert.ok(reserveAt >= 0)
  assert.ok(persistedExpiryAt > reserveAt)
  assert.ok(overrideExpiryAt > persistedExpiryAt)
  assert.ok(stripeAt > overrideExpiryAt)
  assert.ok(stripeAt > reserveAt)
  assert.ok(bindAt > stripeAt)
  assert.ok(returnAt > bindAt)
  assert.match(checkout, /`jianyuan-g15-\$\{g15ReservationId\}`/u)
  assert.match(checkout, /metadata\[g15_consent_reservation_id\]/u)
  assert.match(checkout, /metadata\[g15_report_id\]/u)
  assert.match(checkout, /Number\.isInteger\(g15ReservationExpiresEpochSeconds\)/u)
  assert.match(checkout, /locale:\s*planCode\s*===\s*'G15'\s*\?\s*normalizedG15Locale\s*:\s*locale/u)
  assert.match(checkout, /siteUrl,\s*\n\s*planName:\s*plan\.name,\s*\n\s*promotionName:\s*promoName/u)
  assert.match(checkout, /G15_CHECKOUT_RESERVATION_CONFLICT/u)
})

test('paid G15 webhook consumes its bound reservation before any points side effect', () => {
  const consumeAt = webhook.indexOf("consume_g15_checkout_consent_for_order")
  const pointsAt = webhook.indexOf("'deduct_checkout_points_once'")
  assert.ok(consumeAt >= 0)
  assert.ok(pointsAt > consumeAt)
  assert.match(webhook, /g15_consent_reservation_id/u)
  assert.doesNotMatch(webhook, /\.rpc\('consume_g15_consent_for_order'/u)
})

test('provider-declared terminal checkout failure releases an unconsumed bound reservation', () => {
  const failureBranch = webhook.indexOf("event.type === 'checkout.session.async_payment_failed'")
  const releaseAt = webhook.indexOf("release_g15_checkout_consent_reservation", failureBranch)
  assert.ok(failureBranch >= 0)
  assert.ok(releaseAt > failureBranch)
})
