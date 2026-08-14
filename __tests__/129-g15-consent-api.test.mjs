import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const root = new URL('../', import.meta.url)
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
    export async function getAuthUser(){return globalThis.__g15ConsentApi.authUser}
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient(){return globalThis.__g15ConsentApi.supabase}
  `)],
  ['@/lib/resend-helper', dataModule(`
    export async function sendEmailWithRetry(input){
      globalThis.__g15ConsentApi.emails.push(input)
      return globalThis.__g15ConsentApi.emailResult ?? {success:true,attempts:1}
    }
  `)],
  ['@/lib/checkout/prepare-checkout-birth-data', dataModule(`
    export const G15_SELECTION_COLUMNS='id,client_name'
  `)],
  ['@/lib/checkout/validate-g15-selection', dataModule(`
    export async function validateG15Selection(input){
      globalThis.__g15ConsentApi.validationInput=input
      return globalThis.__g15ConsentApi.validation
    }
  `)],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      const relativePath = specifier.slice(2)
      const resolvedPath = /\.[cm]?[jt]sx?$/u.test(relativePath)
        ? relativePath
        : `${relativePath}.ts`
      return nextResolve(new URL(resolvedPath, root).href, context)
    }
    return nextResolve(specifier, context)
  },
})

process.env.G15_CONSENT_EMAIL_HMAC_SECRET = 'synthetic-hmac-secret-that-is-at-least-32-bytes'
process.env.NEXT_PUBLIC_SITE_URL = 'https://jianyuan.life'

const REPORT_A = '11111111-1111-4111-8111-111111111111'
const REPORT_B = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBJECT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SUBJECT_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const REQUEST_KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TOKEN_A = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url')
const TOKEN_B = Buffer.from(Array.from({ length: 32 }, (_, index) => 255 - index)).toString('base64url')

function request(body) {
  return new Request('https://jianyuan.life/api/g15-consents', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${'x'.repeat(40)}` },
    body: JSON.stringify(body),
  })
}

function baseState(rpcResult) {
  const state = {
    authUser: { userId: OWNER_ID, email: 'owner@example.test', source: 'admin-verified' },
    validation: {
      ok: true,
      reportIds: [REPORT_A, REPORT_B],
      memberNames: ['甲成員', '乙成員'],
      personFingerprints: ['sha256:a', 'sha256:b'],
      subjectUserIds: [SUBJECT_A, SUBJECT_B],
    },
    emails: [],
    rpcCalls: [],
    rpcResult,
  }
  state.supabase = {
    auth: {
      admin: {
        async getUserById(userId) {
          const index = userId === SUBJECT_A ? 0 : userId === SUBJECT_B ? 1 : -1
          if (index < 0) return { data: { user: null }, error: null }
          return {
            data: { user: {
              id: userId,
              email: index === 0 ? 'canonical-a@example.test' : 'canonical-b@example.test',
              email_confirmed_at: '2026-08-01T00:00:00.000Z',
            } },
            error: null,
          }
        },
      },
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args })
      return state.rpcResult
    },
    from(table) {
      const chain = {
        token: '',
        select() { return chain },
        in() { return chain },
        eq(column, value) { if (column === 'access_token') chain.token = value; return chain },
        async maybeSingle() {
          if (table !== 'paid_reports') return { data: null, error: null }
          const reportId = chain.token === TOKEN_A ? REPORT_A : chain.token === TOKEN_B ? REPORT_B : ''
          if (!reportId) return { data: null, error: null }
          return {
            data: {
              id: reportId,
              client_name: reportId === REPORT_A ? '甲成員' : '乙成員',
              user_id: reportId === REPORT_A ? SUBJECT_A : SUBJECT_B,
            },
            error: null,
          }
        },
      }
      return chain
    },
  }
  return state
}

const { POST } = await import('../app/api/g15-consents/route.ts')
const { POST: actionPost } = await import('../app/api/g15-consents/action/route.ts')

test('authenticated purchaser creates invitations; DB failure sends nothing and never returns bearer tokens', async () => {
  globalThis.__g15ConsentApi = baseState({ data: null, error: { code: 'synthetic-db-down' } })
  const failed = await POST(request({
    requestKey: REQUEST_KEY,
    members: [
      { reportAccessToken: TOKEN_A, email: 'attacker-chosen@example.test' },
      { reportAccessToken: TOKEN_B, email: 'another-attacker-choice@example.test' },
    ],
  }))
  assert.equal(failed.status, 503)
  assert.equal(globalThis.__g15ConsentApi.emails.length, 0)

  globalThis.__g15ConsentApi = baseState({
    data: [
      { outcome: 'created', selection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', receipt_status: 'pending', subject_report_id: REPORT_A, selection_expires_at: '2026-08-20T00:00:00.000Z' },
      { outcome: 'created', selection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', receipt_status: 'pending', subject_report_id: REPORT_B, selection_expires_at: '2026-08-20T00:00:00.000Z' },
    ],
    error: null,
  })
  globalThis.__g15ConsentApi.authUser = {
    userId: SUBJECT_A,
    email: 'canonical-a@example.test',
    source: 'admin-verified',
  }
  const created = await POST(request({
    requestKey: REQUEST_KEY,
    members: [
      { reportAccessToken: TOKEN_A, email: 'attacker-chosen@example.test' },
      { reportAccessToken: TOKEN_B, email: 'another-attacker-choice@example.test' },
    ],
  }))
  assert.equal(created.status, 200)
  const body = await created.json()
  assert.equal(body.selectionId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  assert.equal(globalThis.__g15ConsentApi.emails.length, 2)
  assert.deepEqual(
    globalThis.__g15ConsentApi.emails.map((email) => email.to),
    ['canonical-a@example.test', 'canonical-b@example.test'],
  )
  assert.equal(JSON.stringify(body).includes('acceptToken'), false)
  assert.equal(JSON.stringify(body).includes('revokeToken'), false)
  assert.equal(JSON.stringify(body).includes('#accept='), false)
  const rpcArgs = JSON.stringify(globalThis.__g15ConsentApi.rpcCalls[0].args)
  assert.equal(rpcArgs.includes('attacker-chosen@example.test'), false)
  assert.equal(rpcArgs.includes('another-attacker-choice@example.test'), false)
  assert.equal(rpcArgs.includes(SUBJECT_A), true)
  assert.equal(rpcArgs.includes(SUBJECT_B), true)
  assert.equal(JSON.stringify(body).includes(REPORT_A), false, 'pending response must not disclose report identity')
  assert.equal(JSON.stringify(body).includes('甲成員'), false, 'pending response must not disclose report content')
})

test('already accepted members are not re-emailed when pending invitations rotate', async () => {
  const persistedExpiry = '2026-08-18T04:05:06.000Z'
  globalThis.__g15ConsentApi = baseState({
    data: [
      { outcome: 'already', selection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', receipt_status: 'accepted', subject_report_id: REPORT_A, selection_expires_at: persistedExpiry },
      { outcome: 'rotated', selection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', receipt_status: 'pending', subject_report_id: REPORT_B, selection_expires_at: persistedExpiry },
    ],
    error: null,
  })
  const response = await POST(request({
    requestKey: REQUEST_KEY,
    members: [
      { reportAccessToken: TOKEN_A },
      { reportAccessToken: TOKEN_B },
    ],
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.clone().json()).expiresAt, persistedExpiry)
  assert.equal(globalThis.__g15ConsentApi.emails.length, 1)
  assert.equal(globalThis.__g15ConsentApi.emails[0].to, 'canonical-b@example.test')
  assert.match(globalThis.__g15ConsentApi.emails[0].text, /2026-08-18T04:05:06\.000Z/u)
})

test('bearer action hashes the token before RPC and returns only scoped status', async () => {
  const token = Buffer.alloc(32, 7).toString('base64url')
  globalThis.__g15ConsentApi = baseState({
    data: [{
      outcome: 'accepted',
      selection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      receipt_status: 'accepted',
      subject_report_id: REPORT_A,
      policy_version: 'g15-family-member-consent/v4.0.0',
      purpose: 'prepare_and_generate_g15_family_blueprint',
      sharing_scope: 'purchaser_and_selected_adult_members_summary_only',
      expires_at: '2026-08-20T00:00:00.000Z',
    }],
    error: null,
  })
  globalThis.__g15ConsentApi.authUser = {
    userId: SUBJECT_A,
    email: 'canonical-a@example.test',
    source: 'admin-verified',
  }
  const response = await actionPost(new Request('https://jianyuan.life/api/g15-consents/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'accept', token }),
  }))
  assert.equal(response.status, 200)
  assert.equal(globalThis.__g15ConsentApi.rpcCalls[0].name, 'transition_g15_consent')
  assert.equal(globalThis.__g15ConsentApi.rpcCalls[0].args.p_subject_user_id, SUBJECT_A)
  assert.notEqual(globalThis.__g15ConsentApi.rpcCalls[0].args.p_token_hash, token)
  assert.match(globalThis.__g15ConsentApi.rpcCalls[0].args.p_token_hash, /^sha256:[0-9a-f]{64}$/u)
  assert.equal(JSON.stringify(await response.json()).includes(token), false)
})

test('API source exposes purchaser status polling and never sends tokens in query parameters', () => {
  const inviteSource = readFileSync(new URL('../app/api/g15-consents/route.ts', import.meta.url), 'utf8')
  const actionSource = readFileSync(new URL('../app/api/g15-consents/action/route.ts', import.meta.url), 'utf8')
  assert.match(inviteSource, /export\s+async\s+function\s+GET/u)
  assert.match(inviteSource, /purchaser_user_id/u)
  assert.match(inviteSource, /g15_consent_receipts/u)
  assert.doesNotMatch(inviteSource + actionSource, /searchParams\.get\(['"](?:token|accept|revoke)/u)
})
