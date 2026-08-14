import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

const routeUrl = new URL('../app/api/checkout/route.ts', import.meta.url)
const hookUrl = new URL('../hooks/useCheckoutForm.ts', import.meta.url)
const migrationUrl = new URL(
  '../supabase/migrations/20260813050800_create_free_checkout_atomic_rpc.sql',
  import.meta.url,
)
const releaseRunnerUrl = new URL('./run-tests.mjs', import.meta.url)
const ciUrl = new URL('../.github/workflows/ci.yml', import.meta.url)

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
  ['@/lib/supabase', dataModule('export function createServiceClient(){return globalThis.__freeCheckoutSupabase}')],
  ['@/lib/resend-helper', dataModule(`
    export async function sendEmailWithRetry(input){
      globalThis.__freeCheckoutState.events.push({kind:'email', input})
      return {success:true, attempts:1}
    }
  `)],
  ['@/lib/unsubscribe', dataModule('export function getUnsubscribeHtml(){return ""}')],
  ['@/lib/funnel-tracker', dataModule('export async function trackFunnelServer(){}')],
  ['@/lib/plan-names', dataModule(`
    export const PLAN_NAMES={C:'Life',G15:'Family',E3:'Monthly'}
    export const PRICE_MAP={C:{name:'Life',amount:8900},G15:{name:'Family',amount:5900},E3:{name:'Monthly',amount:8900}}
    export function isVisiblePlan(code){return ['C','G15','E3'].includes(code)}
  `)],
  ['@/lib/checkout/prepare-checkout-birth-data', dataModule(`
    export const G15_SELECTION_COLUMNS='id'
    export function getG15ValidationHttpStatus(){return 400}
    export async function prepareCheckoutBirthData({birthData}){return {ok:true,birthData}}
  `)],
  ['@/lib/checkout/g15-independent-consent', dataModule(`
    export const G15_CONSENT_SELECTION_COLUMNS='id'
    export const G15_CONSENT_RECEIPT_COLUMNS='id'
  `)],
  ['@/lib/checkout/server-checkout-contract', dataModule(`
    export function getCheckoutPaymentPath({finalAmount}){return finalAmount===0?'free':'stripe'}
    export function buildStripeCheckoutSessionParams(){return new URLSearchParams()}
  `)],
  ['@/lib/consultation/calculator-readiness.server', dataModule('export async function assertConsultationCalculatorReady(){}')],
  ['@/lib/consultation/runtime-config', dataModule(`
    export function shouldUseConsultationReportV1() {
      return globalThis.__consultationReleaseFlag === true
    }
    export function bindConsultationOrderReleaseContract(planCode, birthData) {
      return {
        ...birthData,
        consultation_release_contract: {
          schema: 'consultation-report/v1',
          plan_code: planCode,
        },
      }
    }
  `)],
  ['@/lib/security/operational-telemetry', dataModule(`
    export function operationalErrorClass(){return 'synthetic-error'}
    export function operationalFingerprint(){return 'synthetic-fingerprint'}
  `)],
  ['@/lib/capacity-monitor', dataModule('export async function checkCapacity(){return {allowed:true,mode:"normal"}}')],
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

test('free checkout has one atomic database boundary and a stable client request key', () => {
  const route = readFileSync(routeUrl, 'utf8')
  const hook = readFileSync(hookUrl, 'utf8')

  assert.match(hook, /checkoutRequestKey/iu)
  assert.match(hook, /jyco_/u)
  assert.match(hook, /checkoutRequestKey\s*:/u)
  assert.match(route, /rpc\s*\(\s*['"]create_free_checkout_once['"]/iu)

  const freeStart = route.indexOf("if (paymentPath === 'free')")
  const paidStart = route.indexOf('// Stripe session', freeStart)
  assert.ok(freeStart >= 0 && paidStart > freeStart)
  const freeBlock = route.slice(freeStart, paidStart)
  for (const table of [
    'checkout_drafts',
    'orders',
    'paid_reports',
    'coupons',
    'coupon_uses',
    'user_points',
    'point_transactions',
  ]) {
    assert.doesNotMatch(
      freeBlock,
      new RegExp(`from\\(['"]${table}['"]\\)[\\s\\S]{0,180}?\\.(?:insert|update|delete)\\(`, 'iu'),
      `${table} must be mutated only inside the transaction RPC`,
    )
  }

  assert.equal(existsSync(migrationUrl), true)
})

test('the RPC serializes replay, rejects payload drift, and rolls every value-bearing table together', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.match(sql, /^\s*BEGIN\s*;/iu)
  assert.match(sql, /COMMIT\s*;\s*$/iu)
  assert.match(sql, /CREATE\s+FUNCTION\s+public\.create_free_checkout_once/iu)
  assert.match(sql, /SECURITY\s+DEFINER/iu)
  assert.match(sql, /pg_advisory_xact_lock\s*\(/iu)
  assert.match(sql, /payload_hash\s*<>\s*p_payload_hash/iu)
  assert.match(sql, /ERRCODE\s*=\s*'22023'[\s\S]*?payload conflict/iu)
  for (const table of [
    'checkout_drafts',
    'orders',
    'paid_reports',
    'coupons',
    'coupon_uses',
    'user_points',
    'point_transactions',
    'birth_profiles',
    'free_checkout_idempotency',
  ]) {
    assert.match(sql, new RegExp(`(?:INSERT\\s+INTO|UPDATE)\\s+public\\.${table}\\b`, 'iu'), table)
  }
  assert.match(sql, /FROM\s+public\.coupons[\s\S]*?FOR\s+UPDATE/iu)
  assert.match(sql, /FROM\s+public\.user_points[\s\S]*?FOR\s+UPDATE/iu)
  assert.match(sql, /JOIN\s+public\.paid_reports\s+AS\s+source_report[\s\S]*?source_report\.status\s*=\s*'completed'[\s\S]*?FOR\s+SHARE\s+OF\s+source_report/iu)
  assert.match(sql, /jsonb_array_elements_text\s*\(\s*p_birth_data\s*->\s*'report_ids'\s*\)\s+WITH\s+ORDINALITY/iu)
  assert.match(sql, /GET\s+DIAGNOSTICS\s+v_source_report_count\s*=\s*ROW_COUNT/iu)
  assert.match(sql, /INSERT\s+INTO\s+public\.birth_profiles/iu)
})

test('free E3 and ambiguous workflow starts fail closed without legacy generation fallback', () => {
  const route = readFileSync(routeUrl, 'utf8')
  const freeStart = route.indexOf("if (paymentPath === 'free')")
  const paidStart = route.indexOf('// Stripe session', freeStart)
  const freeBlock = route.slice(freeStart, paidStart)
  assert.match(freeBlock, /planCode\s*!==\s*'C'\s*&&\s*planCode\s*!==\s*'G15'/u)
  assert.match(freeBlock, /FREE_CHECKOUT_UNAVAILABLE/u)
  assert.match(freeBlock, /wfBody\?\.success\s*===\s*true/u)
  assert.match(freeBlock, /FREE_WORKFLOW_RETRY/u)
  assert.doesNotMatch(freeBlock, /\/api\/generate-report/u)
})

test('idempotency ledger and RPC are inaccessible outside service_role', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.match(sql, /ALTER\s+TABLE\s+public\.free_checkout_idempotency\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu)
  assert.match(sql, /ALTER\s+TABLE\s+public\.free_checkout_idempotency\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/iu)
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    assert.match(sql, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.free_checkout_idempotency\\s+FROM\\s+${role}`, 'iu'))
  }
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    assert.match(sql, new RegExp(`REVOKE\\s+ALL[\\s\\S]*?create_free_checkout_once[\\s\\S]*?FROM\\s+${role}`, 'iu'))
  }
  assert.match(sql, /GRANT\s+EXECUTE[\s\S]*?create_free_checkout_once[\s\S]*?TO\s+service_role/iu)
  assert.match(sql, /free checkout ACL postcondition failed/iu)
})

test('release runner and CI require the real PostgreSQL free-checkout runtime instead of a static fallback', () => {
  const runner = readFileSync(releaseRunnerUrl, 'utf8')
  const ci = readFileSync(ciUrl, 'utf8')
  assert.match(runner, /['"]123-free-checkout-atomic\.test\.mjs['"]/u)
  assert.match(runner, /requiredReleaseRuntimeFlags[\s\S]*?FREE_CHECKOUT_PG_RUNTIME/u)
  assert.match(runner, /releaseMode[\s\S]*?missingReleaseRuntimeFlags[\s\S]*?process\.exit\(1\)/u)
  assert.match(runner, /FREE_CHECKOUT_PG_RUNTIME:\s*releaseMode\s*\?\s*['"]1['"]/u)
  assert.match(ci, /FREE_CHECKOUT_PG_RUNTIME:\s*['"]1['"]/u)
})

function freeCheckoutSupabase({ rpcResults }) {
  const state = globalThis.__freeCheckoutState
  const execute = async (table) => {
    if (table === 'promotions') return { data: state.promo ?? null, error: state.promoError ?? null }
    if (table === 'coupons') return { data: state.coupon, error: state.couponError ?? null }
    if (table === 'user_points') return { data: { balance: 89 }, error: state.pointsError ?? null }
    return { data: null, error: null }
  }
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.invalid' } } }
      },
    },
    from(table) {
      const chain = {
        select() { return chain }, eq() { return chain }, lte() { return chain }, gte() { return chain },
        order() { return chain }, limit() { return chain }, in() { return chain },
        async single() { return execute(table) },
        async maybeSingle() { return execute(table) },
      }
      return chain
    },
    async rpc(name, args) {
      state.events.push({ kind: 'rpc', name, args })
      return rpcResults.shift() ?? { data: null, error: { code: 'synthetic-empty' } }
    },
  }
}

function checkoutRequest({ planCode = 'C', key = 'jyco_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', coupon = null, points = 89 } = {}) {
  return new Request('https://local.invalid/api/checkout', {
    method: 'POST',
    headers: { authorization: `Bearer ${'x'.repeat(40)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      planCode,
      birthData: planCode === 'G15'
        ? { plan_type: 'family_reports', report_ids: ['99999999-9999-4999-8999-999999999999'], member_names: ['Synthetic'] }
        : { name: 'Synthetic', year: 1990, month: 1, day: 2 },
      userEmail: 'owner@example.invalid',
      pointsToUse: coupon ? undefined : points,
      couponCode: coupon ?? undefined,
      checkoutRequestKey: key,
    }),
  })
}

process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'
process.env.CRON_SECRET = 'synthetic-cron-secret'
globalThis.__consultationReleaseFlag = true

const { POST: checkoutPost } = await import('../app/api/checkout/route.ts')

test('C/G15 checkout is disabled before database or Stripe access unless consultation release is explicitly enabled', async () => {
  for (const flag of [undefined, false]) {
    globalThis.__consultationReleaseFlag = flag
    globalThis.__freeCheckoutState = { events: [], coupon: null }
    globalThis.__freeCheckoutSupabase = new Proxy({}, {
      get() {
        assert.fail('disabled consultation checkout must not access the database')
      },
    })
    globalThis.fetch = async () => assert.fail('disabled consultation checkout must not access Stripe or workflow services')

    const response = await checkoutPost(checkoutRequest())
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'CONSULTATION_RELEASE_DISABLED')
    assert.deepEqual(globalThis.__freeCheckoutState.events, [])
  }

  globalThis.__consultationReleaseFlag = true
})

test('C 10% promotion plus 81 points fails closed instead of stacking against a discounted price', async () => {
  globalThis.__consultationReleaseFlag = true
  globalThis.__freeCheckoutState = {
    events: [],
    coupon: null,
    promo: {
      name: 'Synthetic ten percent',
      discount_percent: 10,
      applicable_plans: ['C'],
    },
  }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('promotion and points conflict must stop before external calls')

  const response = await checkoutPost(checkoutRequest({ points: 81 }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'PROMOTION_POINTS_STACKING_UNAVAILABLE')
  assert.equal(globalThis.__freeCheckoutState.events.some((event) => event.kind === 'rpc'), false)
})

test('an unreadable promotion state fails closed before points or checkout mutation', async () => {
  globalThis.__consultationReleaseFlag = true
  globalThis.__freeCheckoutState = {
    events: [],
    coupon: null,
    promo: null,
    promoError: { code: 'synthetic-promotion-read-failure' },
  }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('unknown promotion state must stop before external calls')

  const response = await checkoutPost(checkoutRequest({ points: 89 }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'PROMOTION_STATE_UNAVAILABLE')
  assert.equal(globalThis.__freeCheckoutState.events.some((event) => event.kind === 'rpc'), false)
})

test('an unreadable coupon state fails closed before Stripe or checkout mutation', async () => {
  globalThis.__consultationReleaseFlag = true
  globalThis.__freeCheckoutState = {
    events: [],
    coupon: null,
    couponError: { code: 'synthetic-coupon-read-failure' },
  }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('unknown coupon state must stop before external calls')

  const response = await checkoutPost(checkoutRequest({ coupon: 'UNKNOWN' }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'COUPON_STATE_UNAVAILABLE')
  assert.equal(globalThis.__freeCheckoutState.events.some((event) => event.kind === 'rpc'), false)
})

test('an unreadable points balance fails closed before Stripe or checkout mutation', async () => {
  globalThis.__consultationReleaseFlag = true
  globalThis.__freeCheckoutState = {
    events: [],
    coupon: null,
    pointsError: { code: 'synthetic-points-read-failure' },
  }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('unknown points state must stop before external calls')

  const response = await checkoutPost(checkoutRequest({ points: 10 }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'POINTS_STATE_UNAVAILABLE')
  assert.equal(globalThis.__freeCheckoutState.events.some((event) => event.kind === 'rpc'), false)
})

test('an explicitly enabled consultation release proceeds to checkout validation and still rejects an invalid free key before RPC', async () => {
  globalThis.__consultationReleaseFlag = true
  globalThis.__freeCheckoutState = { events: [], coupon: null }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('invalid key must stop before workflow')
  const response = await checkoutPost(checkoutRequest({ key: 'jyco_not-a-uuid' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'INVALID_CHECKOUT_REQUEST_KEY')
  assert.equal(globalThis.__freeCheckoutState.events.length, 0)
})

test('RPC errors and ambiguous workflow responses never email, fallback, or return success', async () => {
  globalThis.__freeCheckoutState = { events: [], coupon: null }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({
    rpcResults: [{ data: null, error: { code: '55P03' } }],
  })
  globalThis.fetch = async () => assert.fail('RPC failure must stop before workflow')
  let response = await checkoutPost(checkoutRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'FREE_CHECKOUT_RETRY')
  assert.deepEqual(globalThis.__freeCheckoutState.events.map((event) => event.kind), ['rpc'])

  globalThis.__freeCheckoutState = { events: [], coupon: null }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({
    rpcResults: [
      { data: [{ outcome: 'applied', report_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', session_id: 'free_cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], error: null },
      { data: [{ outcome: 'already', report_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', session_id: 'free_cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], error: null },
    ],
  })
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  response = await checkoutPost(checkoutRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'FREE_WORKFLOW_RETRY')
  assert.deepEqual(urls, ['https://site.example.invalid/api/workflows/generate-report'])
  assert.deepEqual(globalThis.__freeCheckoutState.events.map((event) => event.kind), ['rpc', 'rpc'])
  assert.equal(globalThis.__freeCheckoutState.events.some((event) => event.kind === 'email'), false)
})

test('explicit durable workflow acceptance is the only successful free checkout boundary', async () => {
  globalThis.__freeCheckoutState = { events: [], coupon: null }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({
    rpcResults: [{ data: [{ outcome: 'applied', report_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', session_id: 'free_cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], error: null }],
  })
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: true, runId: 'run-synthetic' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
  const response = await checkoutPost(checkoutRequest())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.match(body.url, /session_id=free_cccccccc-cccc-4ccc-8ccc-cccccccccccc/u)
  assert.deepEqual(globalThis.__freeCheckoutState.events.map((event) => event.kind), ['rpc', 'email'])
})

test('free E3 fails closed before RPC and workflow while its paid path remains untouched', async () => {
  globalThis.__freeCheckoutState = {
    events: [],
    coupon: {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', code: 'FREEE3',
      discount_type: 'free', discount_value: 100, used_count: 0, max_uses: 10,
      is_active: true, valid_until: null, applicable_products: ['E3'],
    },
  }
  globalThis.__freeCheckoutSupabase = freeCheckoutSupabase({ rpcResults: [] })
  globalThis.fetch = async () => assert.fail('free E3 must stop before external calls')
  const response = await checkoutPost(checkoutRequest({ planCode: 'E3', coupon: 'FREEE3' }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'FREE_CHECKOUT_UNAVAILABLE')
  assert.equal(globalThis.__freeCheckoutState.events.length, 0)
})

const pgBootstrap = String.raw`
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.checkout_drafts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_code text NOT NULL,
  birth_data jsonb NOT NULL, locale text, created_at timestamptz DEFAULT now(), used_at timestamptz
);
CREATE TABLE public.products(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.birth_profiles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  full_name text NOT NULL, birth_date date NOT NULL, birth_time time,
  birth_time_known boolean, gender text, birth_city text, birth_country text,
  birth_timezone text, birth_longitude numeric, birth_latitude numeric,
  metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  birth_profile_id uuid NOT NULL REFERENCES public.birth_profiles(id),
  stripe_checkout_session_id text, stripe_payment_intent_id text,
  amount_usd numeric, currency text, payment_method text, coupon_id uuid, status text,
  language text, additional_options jsonb, paid_at timestamptz, completed_at timestamptz,
  refunded_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.paid_reports(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text, plan_code text,
  amount_usd numeric, stripe_session_id text UNIQUE, birth_data jsonb, status text,
  access_token text, customer_email text, user_id uuid, error_message text
);
CREATE TABLE public.coupons(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, discount_type text,
  discount_value numeric, max_uses integer, used_count integer DEFAULT 0,
  valid_from timestamptz, valid_until timestamptz, applicable_products text[],
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), note text
);
CREATE TABLE public.coupon_uses(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id uuid, coupon_code text,
  order_id text, customer_email text, plan_code text, original_amount numeric,
  discount_applied numeric, used_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_points(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, balance integer,
  total_earned integer DEFAULT 0, total_used integer DEFAULT 0,
  total_expired integer DEFAULT 0, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.point_transactions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, type text, amount integer,
  balance_after integer, description text, reference_id text,
  expires_at timestamptz, created_at timestamptz DEFAULT now()
);
`

const pgScenarios = String.raw`
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.products(code, is_active) VALUES ('C', true), ('G15', true);
INSERT INTO public.user_points(user_id, balance) VALUES ('11111111-1111-4111-8111-111111111111', 89);
INSERT INTO public.coupons(code, discount_type, discount_value, max_uses, used_count, applicable_products, is_active)
VALUES ('FREEC', 'free', 100, 10, 0, ARRAY['C'], true);

CREATE TEMP TABLE first_result AS
SELECT * FROM public.create_free_checkout_once(
  'jyco_11111111-1111-4111-8111-111111111111', repeat('a',64), 'C',
  '{"name":"Synthetic","year":1990,"month":1,"day":2,"hour":3,"minute":4,"time_unknown":false,"gender":"F","birth_city":"Hong Kong","birth_country":"HK","timezone":"Asia/Hong_Kong","longitude":114.1,"latitude":22.3}'::jsonb,
  'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
  'FREEC', 0, 8900, 'Synthetic', false
);
DO $$ BEGIN
  IF (SELECT outcome FROM first_result) <> 'applied' THEN RAISE EXCEPTION 'first create failed'; END IF;
  IF (SELECT count(*) FROM public.paid_reports) <> 1 OR (SELECT used_count FROM public.coupons WHERE code='FREEC') <> 1 THEN
    RAISE EXCEPTION 'first create did not mutate exactly once';
  END IF;
  IF (SELECT count(*) FROM public.orders WHERE status='paid' AND payment_method='coupon' AND paid_at IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'free coupon order was not normalized as paid';
  END IF;
END $$;

DO $$
DECLARE
  rejected boolean := false;
  before_reports bigint := (SELECT count(*) FROM public.paid_reports);
  before_orders bigint := (SELECT count(*) FROM public.orders);
  before_transactions bigint := (SELECT count(*) FROM public.point_transactions);
BEGIN
  BEGIN
    PERFORM * FROM public.create_free_checkout_once(
      'jyco_81818181-8181-4181-8181-818181818181', repeat('8',64), 'C',
      '{"name":"No promo stacking","year":1991,"month":2,"day":3,"hour":12,"minute":0,"time_unknown":false}'::jsonb,
      'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
      NULL, 81, 8900, 'No promo stacking', false
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := true;
  END;

  IF NOT rejected
     OR EXISTS (SELECT 1 FROM public.free_checkout_idempotency WHERE request_key='jyco_81818181-8181-4181-8181-818181818181')
     OR (SELECT count(*) FROM public.paid_reports) <> before_reports
     OR (SELECT count(*) FROM public.orders) <> before_orders
     OR (SELECT count(*) FROM public.point_transactions) <> before_transactions
     OR (SELECT balance FROM public.user_points WHERE user_id='11111111-1111-4111-8111-111111111111') <> 89 THEN
    RAISE EXCEPTION 'C 10 percent plus 81 points was not rejected atomically';
  END IF;
END $$;

DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.create_free_checkout_once(
    'jyco_11111111-1111-4111-8111-111111111111', repeat('a',64), 'C',
    '{"name":"Synthetic","year":1990,"month":1,"day":2,"hour":3,"minute":4,"time_unknown":false,"gender":"F","birth_city":"Hong Kong","birth_country":"HK","timezone":"Asia/Hong_Kong","longitude":114.1,"latitude":22.3}'::jsonb,
    'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
    'FREEC', 0, 8900, 'Synthetic', false
  );
  IF r.outcome <> 'already' OR r.report_id <> (SELECT report_id FROM public.free_checkout_idempotency WHERE request_key='jyco_11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'same-key replay changed identity';
  END IF;
  IF (SELECT count(*) FROM public.paid_reports) <> 1 OR (SELECT used_count FROM public.coupons WHERE code='FREEC') <> 1 THEN
    RAISE EXCEPTION 'same-key replay duplicated value';
  END IF;
END $$;

CREATE FUNCTION pg_temp.reject_late_free_checkout() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.request_key = 'jyco_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'synthetic late transaction failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_late_free_checkout
BEFORE INSERT ON public.free_checkout_idempotency
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_late_free_checkout();
DO $$
DECLARE
  before_reports bigint := (SELECT count(*) FROM public.paid_reports);
  before_orders bigint := (SELECT count(*) FROM public.orders);
  before_profiles bigint := (SELECT count(*) FROM public.birth_profiles);
  before_drafts bigint := (SELECT count(*) FROM public.checkout_drafts);
  before_coupon_uses bigint := (SELECT count(*) FROM public.coupon_uses);
  before_coupon_count integer := (SELECT used_count FROM public.coupons WHERE code='FREEC');
BEGIN
  BEGIN
    PERFORM * FROM public.create_free_checkout_once(
      'jyco_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('1',64), 'C',
      '{"name":"Late failure","year":1990,"month":1,"day":2}'::jsonb,
      'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
      'FREEC', 0, 8900, 'Late failure', false
    );
    RAISE EXCEPTION 'late failure trigger did not execute';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic late transaction failure' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.paid_reports) <> before_reports
     OR (SELECT count(*) FROM public.orders) <> before_orders
     OR (SELECT count(*) FROM public.birth_profiles) <> before_profiles
     OR (SELECT count(*) FROM public.checkout_drafts) <> before_drafts
     OR (SELECT count(*) FROM public.coupon_uses) <> before_coupon_uses
     OR (SELECT used_count FROM public.coupons WHERE code='FREEC') <> before_coupon_count THEN
    RAISE EXCEPTION 'late RPC failure did not roll back the full transaction';
  END IF;
END $$;
DROP TRIGGER reject_late_free_checkout ON public.free_checkout_idempotency;

UPDATE public.paid_reports
SET status='completed'
WHERE id=(SELECT report_id FROM public.free_checkout_idempotency WHERE request_key='jyco_11111111-1111-4111-8111-111111111111');
INSERT INTO public.paid_reports(
  id, client_name, plan_code, amount_usd, stripe_session_id, birth_data,
  status, access_token, customer_email, user_id
) VALUES (
  '55555555-5555-4555-8555-555555555555', 'Second source', 'C', 89,
  'source_second',
  '{"name":"Second source","year":1992,"month":5,"day":6,"hour":7,"minute":8,"time_unknown":false}'::jsonb,
  'completed', 'source-second-token', 'owner@example.invalid',
  '11111111-1111-4111-8111-111111111111'
);
INSERT INTO public.coupons(code, discount_type, discount_value, max_uses, used_count, applicable_products, is_active)
VALUES ('FREEG', 'free', 100, 10, 0, ARRAY['G15'], true);
DO $$ DECLARE r record; source_id uuid; BEGIN
  SELECT report_id INTO source_id FROM public.free_checkout_idempotency
  WHERE request_key='jyco_11111111-1111-4111-8111-111111111111';
  SELECT * INTO r FROM public.create_free_checkout_once(
    'jyco_44444444-4444-4444-8444-444444444444', repeat('e',64), 'G15',
    jsonb_build_object(
      'plan_type','family_reports',
      'report_ids',jsonb_build_array(source_id, '55555555-5555-4555-8555-555555555555'::uuid),
      'member_names',jsonb_build_array('Synthetic','Second source')
    ),
    'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
    'FREEG', 0, 5900, 'Synthetic Family', false
  );
  IF r.outcome <> 'applied'
     OR (SELECT count(*) FROM public.paid_reports) <> 3
     OR (SELECT count(*) FROM public.orders) <> 2
     OR (SELECT count(*) FROM public.birth_profiles) <> 2
     OR (SELECT count(*) FROM public.birth_profiles WHERE full_name='Synthetic' AND metadata->>'source_plan'='G15' AND metadata->>'source_report_count'='2') <> 1 THEN
    RAISE EXCEPTION 'G15 did not lock every source or derive its normalized order profile';
  END IF;
END $$;

DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.create_free_checkout_once(
    'jyco_99999999-9999-4999-8999-999999999999', repeat('9',64), 'C',
    '{"name":"Points success","year":1991,"month":2,"day":3,"hour":12,"minute":0,"time_unknown":false}'::jsonb,
    'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
    NULL, 89, 8900, 'Points success', false
  );
  IF r.outcome <> 'applied'
     OR (SELECT balance FROM public.user_points WHERE user_id='11111111-1111-4111-8111-111111111111') <> 0
     OR (SELECT total_used FROM public.user_points WHERE user_id='11111111-1111-4111-8111-111111111111') <> 89
     OR (SELECT count(*) FROM public.point_transactions WHERE reference_id=r.session_id AND amount=-89 AND balance_after=0) <> 1
     OR (SELECT count(*) FROM public.orders WHERE stripe_checkout_session_id=r.session_id AND status='paid' AND payment_method='points' AND paid_at IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'points checkout did not atomically post its paid order and ledger';
  END IF;
END $$;

INSERT INTO auth.users VALUES ('66666666-6666-4666-8666-666666666666');
INSERT INTO public.paid_reports(
  id, client_name, plan_code, amount_usd, stripe_session_id, birth_data,
  status, access_token, customer_email, user_id
) VALUES (
  '77777777-7777-4777-8777-777777777777', 'Wrong owner', 'C', 89,
  'source_wrong_owner',
  '{"name":"Wrong owner","year":1994,"month":7,"day":8}'::jsonb,
  'completed', 'source-wrong-token', 'other@example.invalid',
  '66666666-6666-4666-8666-666666666666'
);
DO $$
DECLARE
  source_id uuid;
  before_reports bigint := (SELECT count(*) FROM public.paid_reports);
  before_orders bigint := (SELECT count(*) FROM public.orders);
  before_profiles bigint := (SELECT count(*) FROM public.birth_profiles);
  before_drafts bigint := (SELECT count(*) FROM public.checkout_drafts);
  before_coupon_uses bigint := (SELECT count(*) FROM public.coupon_uses);
  before_coupon_count integer := (SELECT used_count FROM public.coupons WHERE code='FREEG');
BEGIN
  SELECT report_id INTO source_id FROM public.free_checkout_idempotency
  WHERE request_key='jyco_11111111-1111-4111-8111-111111111111';
  BEGIN
    PERFORM * FROM public.create_free_checkout_once(
      'jyco_88888888-8888-4888-8888-888888888888', repeat('f',64), 'G15',
      jsonb_build_object(
        'plan_type','family_reports',
        'report_ids',jsonb_build_array(source_id, '77777777-7777-4777-8777-777777777777'::uuid),
        'member_names',jsonb_build_array('Synthetic','Wrong owner')
      ),
      'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
      'FREEG', 0, 5900, 'Invalid family', false
    );
    RAISE EXCEPTION 'mixed-authority G15 sources were accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;

  IF EXISTS (SELECT 1 FROM public.free_checkout_idempotency WHERE request_key='jyco_88888888-8888-4888-8888-888888888888')
     OR (SELECT count(*) FROM public.paid_reports) <> before_reports
     OR (SELECT count(*) FROM public.orders) <> before_orders
     OR (SELECT count(*) FROM public.birth_profiles) <> before_profiles
     OR (SELECT count(*) FROM public.checkout_drafts) <> before_drafts
     OR (SELECT count(*) FROM public.coupon_uses) <> before_coupon_uses
     OR (SELECT used_count FROM public.coupons WHERE code='FREEG') <> before_coupon_count THEN
    RAISE EXCEPTION 'mixed-authority G15 failure did not roll back every mutation';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.create_free_checkout_once(
      'jyco_11111111-1111-4111-8111-111111111111', repeat('b',64), 'C',
      '{"name":"Drift","year":1990,"month":1,"day":2}'::jsonb,
      'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
      'FREEC', 0, 8900, 'Synthetic', false
    );
    RAISE EXCEPTION 'payload conflict was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.create_free_checkout_once(
      'jyco_22222222-2222-4222-8222-222222222222', repeat('c',64), 'C',
      '{"name":"Insufficient","year":1990,"month":1,"day":2}'::jsonb, 'zh-TW', 'owner@example.invalid',
      '11111111-1111-4111-8111-111111111111', NULL, 90, 9000, 'Synthetic', false
    );
    RAISE EXCEPTION 'insufficient points were accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.free_checkout_idempotency WHERE request_key='jyco_22222222-2222-4222-8222-222222222222')
     OR (SELECT count(*) FROM public.paid_reports) <> 5 OR (SELECT balance FROM public.user_points WHERE user_id='11111111-1111-4111-8111-111111111111') <> 0 THEN
    RAISE EXCEPTION 'failed checkout did not roll back';
  END IF;
END $$;

DO $$ BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.create_free_checkout_once(text,text,text,jsonb,text,text,uuid,text,integer,integer,text,boolean)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.create_free_checkout_once(text,text,text,jsonb,text,text,uuid,text,integer,integer,text,boolean)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.create_free_checkout_once(text,text,text,jsonb,text,text,uuid,text,integer,integer,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC ACL mismatch';
  END IF;
END $$;
SELECT 'FREE_CHECKOUT_PG_SEQUENTIAL_OK';
`

function dockerPsql(container, input) {
  return spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input,
    encoding: 'utf8',
  })
}

function concurrentPsql(container, input) {
  return new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'])
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(input)
  })
}

test('PostgreSQL 17 proves replay, conflict, rollback, concurrency, and migration replay', async () => {
  if (process.env.FREE_CHECKOUT_PG_RUNTIME !== '1') {
    assert.match(pgScenarios, /failed checkout did not roll back/u)
    return
  }

  const container = `jianyuan-free-checkout-pgtest-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    let ready = false
    let consecutiveReady = 0
    for (let i = 0; i < 30; i += 1) {
      const probe = dockerPsql(container, 'SELECT 1;')
      consecutiveReady = probe.status === 0 ? consecutiveReady + 1 : 0
      if (consecutiveReady >= 2) { ready = true; break }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.equal(ready, true, 'PostgreSQL container did not become ready')

    const migration = readFileSync(migrationUrl, 'utf8')
    const applied = dockerPsql(container, `${pgBootstrap}\n${migration}`)
    assert.equal(applied.status, 0, applied.stderr)
    const sequential = dockerPsql(container, pgScenarios)
    assert.equal(sequential.status, 0, sequential.stderr)
    assert.match(sequential.stdout, /FREE_CHECKOUT_PG_SEQUENTIAL_OK/u)

    const concurrentCall = String.raw`SELECT * FROM public.create_free_checkout_once(
      'jyco_33333333-3333-4333-8333-333333333333', repeat('d',64), 'C',
      '{"name":"Concurrent","year":1990,"month":1,"day":2,"hour":12,"minute":0,"time_unknown":false}'::jsonb,
      'zh-TW', 'owner@example.invalid', '11111111-1111-4111-8111-111111111111',
      'FREEC', 0, 8900, 'Synthetic', false
    );`
    const [left, right] = await Promise.all([
      concurrentPsql(container, concurrentCall),
      concurrentPsql(container, concurrentCall),
    ])
    assert.equal(left.code, 0, left.stderr)
    assert.equal(right.code, 0, right.stderr)

    const verified = dockerPsql(container, String.raw`
      DO $$ BEGIN
        IF (SELECT count(*) FROM public.free_checkout_idempotency WHERE request_key='jyco_33333333-3333-4333-8333-333333333333') <> 1
           OR (SELECT count(*) FROM public.paid_reports) <> 6
           OR (SELECT used_count FROM public.coupons WHERE code='FREEC') <> 2 THEN
          RAISE EXCEPTION 'concurrent same-key checkout duplicated value';
        END IF;
      END $$;
      SELECT 'FREE_CHECKOUT_PG_CONCURRENCY_OK';
    `)
    assert.equal(verified.status, 0, verified.stderr)
    assert.match(verified.stdout, /FREE_CHECKOUT_PG_CONCURRENCY_OK/u)

    const replayMigration = dockerPsql(container, migration)
    assert.equal(replayMigration.status, 0, replayMigration.stderr)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
