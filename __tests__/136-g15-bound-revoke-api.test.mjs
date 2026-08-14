import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { after, afterEach } from 'node:test'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const virtualModules = new Map([
  ['next/server', dataModule(`
    export class NextRequest extends Request {}
    export class NextResponse extends Response {
      static json(body, init = {}) {
        const headers = new Headers(init.headers)
        headers.set('content-type', 'application/json')
        return new NextResponse(JSON.stringify(body), { ...init, headers })
      }
    }
  `)],
  ['@/lib/auth-helper', dataModule(`
    export async function getAuthUser(){return {userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient(){return globalThis.__g15BoundRevokeApi.supabase}
  `)],
  ['@/lib/checkout/g15-consent-invitations', dataModule(`
    export const G15_CONSENT_IDENTITY_LIMITATION='synthetic identity limitation'
  `)],
  ['@/lib/checkout/g15-independent-consent', dataModule(`
    export const G15_CONSENT_PURPOSE='prepare_and_generate_g15_family_blueprint'
    export const G15_CONSENT_SHARING_SCOPE='purchaser_and_selected_adult_members_summary_only'
    export const G15_INDEPENDENT_CONSENT_POLICY_VERSION='g15-family-member-consent/v4.0.0'
    export function hashG15ConsentToken(token){
      if(typeof token !== 'string' || token.length < 43) throw new TypeError('bad token')
      return 'sha256:' + 'a'.repeat(64)
    }
  `)],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const RESERVATION_ID = '55555555-5555-4555-8555-555555555555'
const SESSION_ID = 'cs_test_bound_revoke_session_1234567890'
const TOKEN = 'x'.repeat(43)
const originalStripeKey = process.env.STRIPE_SECRET_KEY
process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'

const baseRow = {
  selection_id: '33333333-3333-4333-8333-333333333333',
  receipt_status: 'accepted',
  subject_report_id: '11111111-1111-4111-8111-111111111111',
  policy_version: 'g15-family-member-consent/v4.0.0',
  purpose: 'prepare_and_generate_g15_family_blueprint',
  sharing_scope: 'purchaser_and_selected_adult_members_summary_only',
  expires_at: '2026-08-20T00:00:00.000Z',
  consumed_at: null,
  checkout_reservation_id: RESERVATION_ID,
  checkout_stripe_session_id: SESSION_ID,
}

function request() {
  return new Request('https://jianyuan.life/api/g15-consents/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'revoke', token: TOKEN }),
  })
}

function installState({ prepareOutcome = 'provider_expire_required', stripeStatus = 'expired' } = {}) {
  const state = { rpcCalls: [], fetchCalls: [], prepareOutcome, stripeStatus }
  state.supabase = {
    async rpc(name, args) {
      state.rpcCalls.push({ name, args })
      if (name === 'prepare_g15_consent_revocation') {
        return {
          data: [{
            ...baseRow,
            outcome: state.prepareOutcome,
            receipt_status: state.prepareOutcome === 'revoked' ? 'revoked' : 'accepted',
            checkout_reservation_id: state.prepareOutcome === 'provider_expire_required' ? RESERVATION_ID : null,
            checkout_stripe_session_id: state.prepareOutcome === 'provider_expire_required' ? SESSION_ID : null,
          }],
          error: null,
        }
      }
      if (name === 'finalize_g15_consent_revocation') {
        return { data: [{ ...baseRow, outcome: 'revoked', receipt_status: 'revoked' }], error: null }
      }
      return { data: null, error: { code: 'unexpected-rpc' } }
    },
  }
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    state.fetchCalls.push({ target, init })
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ id: SESSION_ID, status: 'expired', payment_status: 'unpaid' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ id: SESSION_ID, status: state.stripeStatus, payment_status: 'unpaid' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  globalThis.__g15BoundRevokeApi = state
  return state
}

const { POST } = await import('../app/api/g15-consents/action/route.ts')

afterEach(() => {
  delete globalThis.__g15BoundRevokeApi
})

test('an unbound reservation revokes atomically without contacting Stripe', async () => {
  const state = installState({ prepareOutcome: 'revoked' })
  const response = await POST(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'revoked')
  assert.deepEqual(state.rpcCalls.map(({ name }) => name), ['prepare_g15_consent_revocation'])
  assert.equal(state.fetchCalls.length, 0)
})

test('an expired bound Stripe Session is reconciled before DB revocation finalizes', async () => {
  const state = installState({ stripeStatus: 'expired' })
  const response = await POST(request())
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
  const body = await response.json()
  assert.equal(body.status, 'revoked')
  assert.deepEqual(
    state.rpcCalls.map(({ name }) => name),
    ['prepare_g15_consent_revocation', 'finalize_g15_consent_revocation'],
  )
  assert.equal(state.fetchCalls.length, 1)
  assert.equal(state.fetchCalls[0].init.method, 'GET')
  assert.equal(JSON.stringify(body).includes(SESSION_ID), false)
})

test('an open Session is expired first; a complete Session fails closed as accepted', async () => {
  const openState = installState({ stripeStatus: 'open' })
  const revoked = await POST(request())
  assert.equal(revoked.status, 200)
  assert.equal((await revoked.json()).status, 'revoked')
  assert.deepEqual(openState.fetchCalls.map(({ init }) => init.method), ['GET', 'POST'])
  assert.equal(
    new Headers(openState.fetchCalls[1].init.headers).get('idempotency-key'),
    `jianyuan-g15-revoke-${RESERVATION_ID}`,
  )

  const completeState = installState({ stripeStatus: 'complete' })
  const held = await POST(request())
  assert.equal(held.status, 409)
  const heldBody = await held.json()
  assert.equal(heldBody.status, 'accepted')
  assert.notEqual(heldBody.outcome, 'revoked')
  assert.deepEqual(completeState.rpcCalls.map(({ name }) => name), ['prepare_g15_consent_revocation'])
})

after(() => {
  if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalStripeKey
})
