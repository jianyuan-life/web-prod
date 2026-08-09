import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { suite, test, assert, assertEqual, done } from './harness.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const mockModuleUrls = new Map([
  ['@/lib/supabase', dataModule('export function createServiceClient(){return globalThis.__e3CheckoutSupabase}')],
  ['@/lib/resend-helper', dataModule('export async function sendEmailWithRetry(){throw new Error("paid path must not send email")}')],
  ['@/lib/unsubscribe', dataModule('export function getUnsubscribeHtml(){return ""}')],
  ['@/lib/funnel-tracker', dataModule('export async function trackFunnelServer(input){globalThis.__e3CheckoutFunnel.push(input)}')],
  ['@/lib/capacity-monitor', dataModule('export async function checkCapacity(){return {allowed:true,mode:"open",message:""}}')],
  ['@/lib/disposable-email-domains', dataModule('export function isDisposableEmail(){return false}')],
  ['@/lib/ai/observability/telegram', dataModule('export async function notifyStripeFailed(){globalThis.__e3StripeFailureNotified=true}')],
])

function resolveLocalModule(fullPath) {
  for (const candidate of [
    `${fullPath}.ts`,
    `${fullPath}.tsx`,
    `${fullPath}.mjs`,
    path.join(fullPath, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mockUrl = mockModuleUrls.get(specifier)
    if (mockUrl) return { url: mockUrl, shortCircuit: true }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier.startsWith('@/')) {
      const localUrl = resolveLocalModule(path.join(root, specifier.slice(2)))
      if (localUrl) return { url: localUrl, shortCircuit: true }
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL
      && !context.parentURL.startsWith('data:')
    ) {
      const fullPath = fileURLToPath(new URL(specifier, context.parentURL))
      if (!path.extname(fullPath)) {
        const localUrl = resolveLocalModule(fullPath)
        if (localUrl) return { url: localUrl, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/e3-freeze/runtime-fixtures.json', import.meta.url), 'utf8'),
)
const expectedPayload = fixture.checkout.expectedPayload
const draftId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const observedTables = []
const observedInserts = []
let stripeMode = 'success'
let stripeRequest = null

globalThis.__e3CheckoutFunnel = []
globalThis.__e3StripeFailureNotified = false
globalThis.__e3CheckoutSupabase = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from(table) {
    observedTables.push(table)
    const chain = {
      select() { return chain },
      eq() { return chain },
      lte() { return chain },
      gte() { return chain },
      order() { return chain },
      limit() { return chain },
      maybeSingle: async () => ({ data: null, error: null }),
      insert(payload) {
        observedInserts.push({ table, payload })
        return chain
      },
      single: async () => ({
        data: table === 'checkout_drafts' ? { id: draftId } : null,
        error: null,
      }),
    }
    return chain
  },
}

process.env.STRIPE_SECRET_KEY = 'contract-test-key'
process.env.NEXT_PUBLIC_SITE_URL = 'https://jianyuan.life'
delete process.env.NEXT_PUBLIC_VISIBLE_PLAN_CODES

globalThis.fetch = async (url, init) => {
  if (String(url) !== 'https://api.stripe.com/v1/checkout/sessions') {
    throw new Error(`integration test 阻擋未預期網路請求:${String(url)}`)
  }
  stripeRequest = {
    url: String(url),
    method: init?.method,
    authorization: new Headers(init?.headers).get('authorization'),
    params: new URLSearchParams(String(init?.body || '')),
  }
  if (stripeMode === 'error') {
    return new Response(JSON.stringify({ error: { message: 'synthetic Stripe rejection', param: 'line_items' } }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({
    id: 'cs_test_e3_contract',
    url: 'https://checkout.stripe.test/session/e3',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const { POST } = await import('../app/api/checkout/route.ts')

function request() {
  return new Request('https://local.invalid/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(expectedPayload),
  })
}

suite('E3 checkout route offline integration')

test('真 POST handler 將 E3 payload 原樣存 draft 並建立 USD 89 Stripe session', async () => {
  const birthDataBefore = JSON.stringify(expectedPayload.birthData)
  const response = await POST(request())
  const json = await response.json()

  assertEqual(response.status, 200)
  assertEqual(json.url, 'https://checkout.stripe.test/session/e3')
  assertEqual(JSON.stringify(expectedPayload.birthData), birthDataBefore, 'route 不得改寫 E3 fixture')
  assertEqual(JSON.stringify(observedTables), JSON.stringify(['promotions', 'checkout_drafts']))
  assertEqual(observedInserts.length, 1)
  assertEqual(observedInserts[0].table, 'checkout_drafts')
  assertEqual(JSON.stringify(observedInserts[0].payload.birth_data), birthDataBefore, 'draft 必須 byte-equivalent 透傳 E3 birthData')
  assertEqual(observedInserts[0].payload.plan_code, 'E3')
  assertEqual(observedInserts[0].payload.locale, 'zh-TW')

  assert(stripeRequest, 'route 必須執行合成 Stripe request')
  assertEqual(stripeRequest.method, 'POST')
  assertEqual(stripeRequest.authorization, 'Bearer contract-test-key')
  assertEqual(stripeRequest.params.get('mode'), 'payment')
  assertEqual(stripeRequest.params.get('line_items[0][price_data][currency]'), 'usd')
  assertEqual(stripeRequest.params.get('line_items[0][price_data][unit_amount]'), '8900')
  assertEqual(stripeRequest.params.get('metadata[plan_code]'), 'E3')
  assertEqual(stripeRequest.params.get('metadata[draft_id]'), draftId)
  assertEqual(stripeRequest.params.get('customer_email'), expectedPayload.userEmail)
  assert(!stripeRequest.params.toString().includes('birth_data'), 'Stripe metadata 不得含出生資料')
  assertEqual(globalThis.__e3CheckoutFunnel.length, 1)
  assertEqual(globalThis.__e3CheckoutFunnel[0].planCode, 'E3')
})

test('真 POST handler 對 Stripe 非 2xx 回應 fail closed 且不回傳 checkout URL', async () => {
  stripeMode = 'error'
  const response = await POST(request())
  const json = await response.json()

  assertEqual(response.status, 500)
  assertEqual(json.error, 'synthetic Stripe rejection (param: line_items)')
  assertEqual(typeof json.url, 'undefined')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assertEqual(globalThis.__e3StripeFailureNotified, true)
})

await done()
