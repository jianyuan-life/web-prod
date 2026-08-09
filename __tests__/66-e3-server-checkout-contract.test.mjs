import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { suite, test, assert, assertEqual, done } from './harness.mjs'
import {
  buildStripeCheckoutSessionParams,
  getCheckoutPaymentPath,
} from '../lib/checkout/server-checkout-contract.ts'
import { prepareCheckoutBirthData } from '../lib/checkout/prepare-checkout-birth-data.ts'
import { PRICE_MAP } from '../lib/plan-names.ts'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/e3-freeze/runtime-fixtures.json', import.meta.url), 'utf8'),
)

function validE3Request() {
  return structuredClone(fixture.checkout.expectedPayload)
}

suite('E3 server checkout contract')

test('E3 birthData 一律同一物件、同一序列化內容透傳且不新增資料庫查詢', async () => {
  const payloads = [
    validE3Request().birthData,
    { legacy_payload: true, topics: [], topic_rank: {}, available_time_slots: [] },
    null,
  ]

  for (const birthData of payloads) {
    let queryCalls = 0
    const before = JSON.stringify(birthData)
    const result = await prepareCheckoutBirthData({
      planCode: 'E3',
      birthData,
      auth: {},
      queryReports: async () => {
        queryCalls++
        return { data: [], error: null }
      },
    })

    assert(result.ok, 'E3 不得新增 runtime validation')
    assert(Object.is(result.birthData, birthData), 'E3 birthData 必須保留同一物件參考')
    assertEqual(JSON.stringify(result.birthData), before, 'E3 birthData 不得正規化、清洗或改寫')
    assertEqual(queryCalls, 0, 'E3 不得觸發 C/G15 的資料查詢或驗證')
  }
})

test('E3 Stripe session 契約固定為 USD 89 並完整攜帶伺服器驗證 metadata', () => {
  const e3Plan = PRICE_MAP.E3
  const params = buildStripeCheckoutSessionParams({
    siteUrl: 'https://jianyuan.life',
    planCode: 'E3',
    planName: e3Plan.name,
    finalAmount: e3Plan.amount,
    customerEmail: 'e3-owner@example.invalid',
    verifiedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    verifiedCouponCode: 'E3SAFE20',
    promotionName: 'August',
    verifiedPointsToUse: 2,
    pointsUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    locale: 'zh-TW',
    draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  })

  assertEqual(e3Plan.amount, 8900, 'E3 SSOT 金額必須是 USD 89')
  assertEqual(params.get('mode'), 'payment')
  assertEqual(params.get('line_items[0][price_data][currency]'), 'usd')
  assertEqual(params.get('line_items[0][price_data][unit_amount]'), '8900')
  assertEqual(params.get('line_items[0][price_data][product_data][name]'), '鑒源命理 - 月度精選')
  assertEqual(params.get('line_items[0][quantity]'), '1')
  assertEqual(params.get('customer_email'), 'e3-owner@example.invalid')
  assertEqual(params.get('payment_intent_data[receipt_email]'), 'e3-owner@example.invalid')
  assertEqual(params.get('metadata[plan_code]'), 'E3')
  assertEqual(params.get('metadata[login_email]'), 'e3-owner@example.invalid')
  assertEqual(params.get('metadata[login_user_id]'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assertEqual(params.get('metadata[coupon_code]'), 'E3SAFE20')
  assertEqual(params.get('metadata[promotion]'), 'August')
  assertEqual(params.get('metadata[points_used]'), '2')
  assertEqual(params.get('metadata[points_user_id]'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assertEqual(params.get('metadata[locale]'), 'zh-TW')
  assertEqual(params.get('metadata[draft_id]'), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  assertEqual(params.get('success_url'), 'https://jianyuan.life/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}')
  assertEqual(params.get('cancel_url'), 'https://jianyuan.life/pricing')
  assert(!params.toString().includes('birthData'), 'Stripe metadata 不得夾帶出生資料')
})

test('E3 全額優惠碼與全額積分折抵走免費訂單，正常金額才走 Stripe', () => {
  assertEqual(getCheckoutPaymentPath({ finalAmount: 8900 }), 'stripe')
  assertEqual(getCheckoutPaymentPath({ finalAmount: 0, verifiedCouponCode: 'E3FREE' }), 'free')
  assertEqual(getCheckoutPaymentPath({ finalAmount: 0, verifiedPointsToUse: 89 }), 'free')
  assertEqual(getCheckoutPaymentPath({ finalAmount: 6900, verifiedPointsToUse: 20 }), 'stripe')
  assertEqual(getCheckoutPaymentPath({ finalAmount: 0 }), 'stripe', '保留既有條件：零額但無已驗證折抵依據不進免費分支')
  assertEqual(getCheckoutPaymentPath({ finalAmount: 49 }), 'stripe', 'helper 不得新增既有 route 沒有的拒絕條件')
})

test('真 checkout route 共用既有 E3 透傳、付款分支與 Stripe builder 且保留 Stripe 錯誤閘', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const route = readFileSync(path.join(here, '..', 'app', 'api', 'checkout', 'route.ts'), 'utf8')
  const prepareIndex = route.indexOf('prepareCheckoutBirthData({')
  const stripeFetchIndex = route.indexOf("fetch('https://api.stripe.com/v1/checkout/sessions'")

  assert(route.includes("from '@/lib/checkout/server-checkout-contract'"), 'route 必須匯入可重跑 server contract')
  assert(prepareIndex > 0 && prepareIndex < stripeFetchIndex, 'E3 透傳 helper 必須位於 Stripe 前')
  assert(!route.includes('validateE3CheckoutPayload'), 'E3 凍結範圍不得新增 runtime validator')
  assert(route.includes('getCheckoutPaymentPath({'), '免費折抵與 Stripe 分流必須走純契約')
  assert(route.includes('buildStripeCheckoutSessionParams({'), 'Stripe 參數必須由已測試 builder 產生')
  assert(route.includes('if (!res.ok || !data.url)'), 'Stripe 非 2xx 或缺 URL 必須 fail closed')
  assert(route.includes("birth_data: trustedBirthData"), 'route 持久化必須使用 E3 原樣透傳結果')
})

await done()
