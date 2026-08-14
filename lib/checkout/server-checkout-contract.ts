export function getCheckoutPaymentPath(input: {
  finalAmount: number
  verifiedCouponCode?: string
  verifiedPointsToUse?: number
}): 'free' | 'stripe' {
  return input.finalAmount === 0
    && (Boolean(input.verifiedCouponCode) || Number(input.verifiedPointsToUse) > 0)
    ? 'free'
    : 'stripe'
}

export function buildStripeCheckoutSessionParams(input: {
  siteUrl: string
  planCode: string
  planName: string
  finalAmount: number
  customerEmail?: string
  verifiedUserId?: string
  verifiedCouponCode?: string
  promotionName?: string
  verifiedPointsToUse?: number
  pointsUserId?: string
  locale?: string
  draftId?: string
  nowEpochSeconds?: number
}): URLSearchParams {
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', `${input.siteUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`)
  params.set('cancel_url', `${input.siteUrl}/pricing`)
  if (input.planCode === 'C' || input.planCode === 'G15') {
    const nowEpochSeconds = Math.floor(input.nowEpochSeconds ?? Date.now() / 1000)
    params.set('expires_at', String(nowEpochSeconds + 35 * 60))
  }
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][product_data][name]', `鑒源命理 - ${input.planName}`)
  params.set('line_items[0][price_data][unit_amount]', input.finalAmount.toString())
  params.set('line_items[0][quantity]', '1')
  if (input.customerEmail) {
    params.set('customer_email', input.customerEmail)
    params.set('payment_intent_data[receipt_email]', input.customerEmail)
  }
  params.set('metadata[plan_code]', input.planCode)
  if (input.customerEmail) params.set('metadata[login_email]', input.customerEmail)
  if (input.verifiedUserId) params.set('metadata[login_user_id]', input.verifiedUserId)
  if (input.verifiedCouponCode) params.set('metadata[coupon_code]', input.verifiedCouponCode)
  if (input.promotionName) params.set('metadata[promotion]', input.promotionName)
  if (input.verifiedPointsToUse && input.verifiedPointsToUse > 0) {
    params.set('metadata[points_used]', input.verifiedPointsToUse.toString())
    if (input.pointsUserId) params.set('metadata[points_user_id]', input.pointsUserId)
  }
  if (input.locale) params.set('metadata[locale]', input.locale)
  if (input.draftId) params.set('metadata[draft_id]', input.draftId)
  return params
}
