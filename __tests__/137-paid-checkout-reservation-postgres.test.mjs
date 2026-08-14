import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260813051200_paid_checkout_coupon_reservation.sql',
  import.meta.url,
)

test('paid checkout value holds expose one fail-closed reserve/freeze/bind/consume/release contract', () => {
  assert.equal(existsSync(migrationUrl), true, 'paid checkout reservation migration is missing')
  const migration = readFileSync(migrationUrl, 'utf8')
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.paid_checkout_reservations/iu)
  for (const rpc of [
    'reserve_paid_checkout_value',
    'freeze_paid_checkout_session',
    'bind_paid_checkout_session',
    'get_paid_checkout_order_authority',
    'consume_paid_checkout_for_order',
    'release_paid_checkout_reservation',
    'abandon_paid_checkout_before_provider',
  ]) {
    assert.match(migration, new RegExp(`CREATE\\s+FUNCTION\\s+public\\.${rpc}`, 'iu'))
  }
  assert.match(migration, /enforce_paid_coupon_reservation_capacity/iu)
  assert.match(migration, /enforce_paid_point_reservation_capacity/iu)
  assert.match(migration, /REVOKE\s+ALL[\s\S]+FROM\s+authenticated/iu)
})

function psql(container, input) {
  return spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8' },
  )
}

function psqlAsync(container, input) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(input)
  })
}

function sqlOk(container, input) {
  const result = psql(container, input)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function sqlFails(container, input, pattern) {
  const result = psql(container, input)
  assert.notEqual(result.status, 0, 'SQL unexpectedly succeeded')
  assert.match(result.stderr, pattern)
}

async function waitForPostgres(container) {
  let consecutiveReady = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (psql(container, 'SELECT 1;').status === 0) {
      consecutiveReady += 1
      if (consecutiveReady >= 2) return
    } else {
      consecutiveReady = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail('PostgreSQL 17 did not become ready')
}

const bootstrap = String.raw`
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE TABLE public.checkout_drafts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_code text, birth_data jsonb,
  locale text, used_at timestamptz
);
CREATE TABLE public.coupons(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, discount_type text,
  discount_value numeric, max_uses integer, used_count integer DEFAULT 0,
  applicable_products text[], is_active boolean, valid_until timestamptz
);
CREATE TABLE public.coupon_uses(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id uuid, coupon_code text,
  order_id text, customer_email text, plan_code text, original_amount numeric,
  discount_applied numeric
);
CREATE TABLE public.user_points(
  user_id uuid PRIMARY KEY, balance integer, total_used integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.point_transactions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, type text, amount integer,
  balance_after integer, description text, reference_id text
);
INSERT INTO public.coupons(code,discount_type,discount_value,max_uses,used_count,applicable_products,is_active,valid_until)
VALUES
  ('ONE20','percentage',20,1,0,ARRAY['C'],true,now()+interval '2 days'),
  ('RELEASE10','percentage',10,1,0,ARRAY['C'],true,now()+interval '2 days'),
  ('EXPIRE10','percentage',10,1,0,ARRAY['C'],true,now()+interval '2 days'),
  ('LATE10','percentage',10,1,0,ARRAY['C'],true,now()+interval '2 days'),
  ('PRICE20','percentage',20,NULL,0,ARRAY['C'],true,now()+interval '2 days'),
  ('ABANDON10','percentage',10,1,0,ARRAY['C'],true,now()+interval '2 days');
INSERT INTO public.user_points(user_id,balance,total_used)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,0);
`

function reserveSql({
  key,
  hash,
  coupon = null,
  points = 0,
  base = 8900,
  final = 7900,
  promotion = (coupon || points > 0) ? base : final,
  createDraft = true,
} = {}) {
  const pointsUser = points > 0 ? `'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid` : 'NULL::uuid'
  const couponSql = coupon ? `'${coupon}'::text` : 'NULL::text'
  return String.raw`
SET ROLE service_role;
SELECT outcome,request_key,resource_kind,checkout_draft_id,reservation_expires_at
FROM public.reserve_paid_checkout_value(
  '${key}', 'sha256:${hash}', 'C', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  ${couponSql}, ${pointsUser}, ${points},
  '{"name":"Synthetic","consultation_release_contract":{"schema":"consultation-report/v1","plan_code":"C"}}'::jsonb,
  'zh-TW', ${base}, ${promotion}, ${final}, ${createDraft}, now()+interval '35 minutes'
);
RESET ROLE;
`
}

function freezeBindSql(key, hash, sessionId, draftId) {
  return String.raw`
SET ROLE service_role;
  SELECT outcome FROM public.freeze_paid_checkout_session(
  '${key}','sha256:${hash}','${draftId}'::uuid,
  'mode=payment&expires_at=synthetic&metadata%5Bpaid_checkout_request_key%5D=${encodeURIComponent(key)}'
);
SELECT outcome FROM public.bind_paid_checkout_session('${key}','sha256:${hash}','${sessionId}');
RESET ROLE;
`
}

test('PostgreSQL 17 serializes paid coupon and points holds through exact Session consumption and release', async () => {
  if (process.env.SECURITY_MIGRATION_PG_RUNTIME !== '1') {
    assert.notEqual(process.env.JIANYUAN_RELEASE_TEST, '1')
    return
  }
  const migration = readFileSync(migrationUrl, 'utf8')
  const container = `jianyuan-paid-holds-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)
    sqlOk(container, bootstrap)
    sqlOk(container, String.raw`
      ALTER TABLE public.coupons DROP CONSTRAINT coupons_code_key;
      CREATE UNIQUE INDEX coupons_active_code_only
        ON public.coupons(code) WHERE is_active;
    `)
    sqlFails(
      container,
      migration,
      /coupon code requires one valid ready non-partial UNIQUE index/u,
    )
    sqlOk(container, String.raw`
      DROP INDEX public.coupons_active_code_only;
      ALTER TABLE public.coupons ADD CONSTRAINT coupons_code_key UNIQUE(code);
    `)
    sqlOk(container, `${migration}\n${migration}`)

    const lateCouponKey = 'jyco_aaaaaaaa-1111-4111-8111-111111111111'
    const lateCouponHash = 'a1'.repeat(32)
    sqlOk(container, reserveSql({ key: lateCouponKey, hash: lateCouponHash, coupon: 'LATE10', final: 8010 }))
    const lateCouponDraftId = sqlOk(container, `SELECT checkout_draft_id FROM public.paid_checkout_reservations WHERE request_key='${lateCouponKey}';`)
      .match(/[0-9a-f]{8}-[0-9a-f-]{27}/u)?.[0]
    assert.ok(lateCouponDraftId)
    sqlOk(container, freezeBindSql(lateCouponKey, lateCouponHash, 'cs_test_late_coupon_session_1234567890', lateCouponDraftId))
    sqlOk(container, `UPDATE public.paid_checkout_reservations SET expires_at=now()-interval '1 minute' WHERE request_key='${lateCouponKey}';`)
    sqlFails(container, reserveSql({
      key: 'jyco_bbbbbbbb-1111-4111-8111-111111111111',
      hash: 'b1'.repeat(32),
      coupon: 'LATE10',
      final: 8010,
    }), /capacity is exhausted/u)
    const lateCouponConsumed = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind,coupon_code FROM public.consume_paid_checkout_for_order(
        '${lateCouponKey}','cs_test_late_coupon_session_1234567890','C','${lateCouponDraftId}'::uuid,8010,'usd'
      );
      RESET ROLE;
      SELECT used_count FROM public.coupons WHERE code='LATE10';
    `)
    assert.match(lateCouponConsumed, /consumed\s+\|\s+coupon\s+\|\s+LATE10/u)
    assert.match(lateCouponConsumed, /\b1\b/u)

    const latePointsKey = 'jyco_cccccccc-1111-4111-8111-111111111111'
    const latePointsHash = 'c1'.repeat(32)
    sqlOk(container, reserveSql({ key: latePointsKey, hash: latePointsHash, points: 7, final: 8200 }))
    const latePointsDraftId = sqlOk(container, `SELECT checkout_draft_id FROM public.paid_checkout_reservations WHERE request_key='${latePointsKey}';`)
      .match(/[0-9a-f]{8}-[0-9a-f-]{27}/u)?.[0]
    assert.ok(latePointsDraftId)
    sqlOk(container, freezeBindSql(latePointsKey, latePointsHash, 'cs_test_late_points_session_1234567890', latePointsDraftId))
    sqlOk(container, `UPDATE public.paid_checkout_reservations SET expires_at=now()-interval '1 minute' WHERE request_key='${latePointsKey}';`)
    sqlFails(container, reserveSql({
      key: 'jyco_dddddddd-1111-4111-8111-111111111111',
      hash: 'd1'.repeat(32),
      points: 7,
      final: 8200,
    }), /already reserved/u)
    const latePointsConsumed = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind,points_amount FROM public.consume_paid_checkout_for_order(
        '${latePointsKey}','cs_test_late_points_session_1234567890','C','${latePointsDraftId}'::uuid,8200,'usd'
      );
      RESET ROLE;
      SELECT balance FROM public.user_points WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    `)
    assert.match(latePointsConsumed, /consumed\s+\|\s+points\s+\|\s+7/u)
    assert.match(latePointsConsumed, /\b3\b/u)
    sqlOk(container, String.raw`
      DELETE FROM public.point_transactions WHERE reference_id='cs_test_late_points_session_1234567890';
      UPDATE public.user_points SET balance=10,total_used=0 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    `)

    const wrongAmountKey = 'jyco_99999999-9999-4999-8999-999999999999'
    sqlFails(container, reserveSql({
      key: wrongAmountKey,
      hash: '9'.repeat(64),
      coupon: 'PRICE20',
      final: 7000,
    }), /final amount does not match locked discount authority/u)
    assert.match(
      sqlOk(container, `SELECT count(*) FROM public.paid_checkout_reservations WHERE request_key='${wrongAmountKey}';`),
      /\b0\b/u,
    )

    const couponRaces = await Promise.all([
      psqlAsync(container, reserveSql({
        key: 'jyco_11111111-1111-4111-8111-111111111111', hash: '1'.repeat(64), coupon: 'ONE20', final: 7120,
      })),
      psqlAsync(container, reserveSql({
        key: 'jyco_22222222-2222-4222-8222-222222222222', hash: '2'.repeat(64), coupon: 'ONE20', final: 7120,
      })),
    ])
    assert.equal(couponRaces.filter(({ status }) => status === 0).length, 1, JSON.stringify(couponRaces))
    assert.match(couponRaces.find(({ status }) => status !== 0).stderr, /capacity is exhausted/u)
    const couponIdentity = sqlOk(container, "SELECT request_key,checkout_draft_id FROM public.paid_checkout_reservations WHERE coupon_code='ONE20';")
      .match(/(jyco_[0-9a-f-]{36})\s+\|\s+([0-9a-f-]{36})/u)
    assert.ok(couponIdentity)
    const [, couponKey, couponDraftId] = couponIdentity
    const couponHash = couponKey.includes('11111111') ? '1'.repeat(64) : '2'.repeat(64)
    assert.match(sqlOk(container, reserveSql({ key: couponKey, hash: couponHash, coupon: 'ONE20', final: 7120 })), /already_reserved/u)
    sqlFails(container, reserveSql({ key: couponKey, hash: 'f'.repeat(64), coupon: 'ONE20', final: 7120 }), /payload conflict/u)
    sqlFails(container, "UPDATE public.coupons SET used_count=1 WHERE code='ONE20';", /reserved capacity/u)
    sqlOk(container, freezeBindSql(couponKey, couponHash, 'cs_test_coupon_exact_session_1234567890', couponDraftId))
    assert.match(sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.freeze_paid_checkout_session(
        '${couponKey}','sha256:${couponHash}','${couponDraftId}'::uuid,
        'mode=payment&expires_at=synthetic&metadata%5Bpaid_checkout_request_key%5D=${encodeURIComponent(couponKey)}'
      );
      RESET ROLE;
    `), /already_prepared/u)
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.freeze_paid_checkout_session(
        '${couponKey}','sha256:${couponHash}','${couponDraftId}'::uuid,
        'mode=payment&expires_at=changed&metadata%5Bpaid_checkout_request_key%5D=${encodeURIComponent(couponKey)}'
      );
    `, /provider body conflicts/u)
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_paid_checkout_for_order(
        '${couponKey}','cs_test_coupon_wrong_session_1234567890','C',
        '${couponDraftId}'::uuid,7120,'usd'
      );
    `, /identity does not match/u)
    assert.match(sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT request_key,plan_code,checkout_draft_id,final_amount_cents,currency,status
      FROM public.get_paid_checkout_order_authority('cs_test_coupon_exact_session_1234567890');
      RESET ROLE;
    `), new RegExp(`${couponKey}\\s+\\|\\s+C\\s+\\|\\s+${couponDraftId}\\s+\\|\\s+7120\\s+\\|\\s+usd\\s+\\|\\s+bound`, 'u'))
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_paid_checkout_for_order(
        '${couponKey}','cs_test_coupon_exact_session_1234567890','C',
        '${couponDraftId}'::uuid,50,'usd'
      );
    `, /identity does not match/u)
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_paid_checkout_for_order(
        '${couponKey}','cs_test_coupon_exact_session_1234567890','C',
        '${couponDraftId}'::uuid,7120,'hkd'
      );
    `, /identity does not match/u)
    assert.match(sqlOk(container, `SELECT status,(SELECT used_count FROM public.coupons WHERE code='ONE20') FROM public.paid_checkout_reservations WHERE request_key='${couponKey}';`), /bound\s+\|\s+0/u)
    const consumedCoupon = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind,coupon_code FROM public.consume_paid_checkout_for_order(
        '${couponKey}','cs_test_coupon_exact_session_1234567890','C',
        '${couponDraftId}'::uuid,7120,'usd'
      );
      SELECT outcome FROM public.consume_paid_checkout_for_order(
        '${couponKey}','cs_test_coupon_exact_session_1234567890','C',
        '${couponDraftId}'::uuid,7120,'usd'
      );
      RESET ROLE;
      SELECT used_count,(SELECT count(*) FROM public.coupon_uses WHERE order_id='cs_test_coupon_exact_session_1234567890')
      FROM public.coupons WHERE code='ONE20';
    `)
    assert.match(consumedCoupon, /consumed\s+\|\s+coupon\s+\|\s+ONE20/u)
    assert.match(consumedCoupon, /already_consumed/u)
    assert.match(consumedCoupon, /1\s+\|\s+1/u)

    const pointRaces = await Promise.all([
      psqlAsync(container, reserveSql({
        key: 'jyco_33333333-3333-4333-8333-333333333333', hash: '3'.repeat(64), points: 7, final: 8200,
      })),
      psqlAsync(container, reserveSql({
        key: 'jyco_44444444-4444-4444-8444-444444444444', hash: '4'.repeat(64), points: 7, final: 8200,
      })),
    ])
    assert.equal(pointRaces.filter(({ status }) => status === 0).length, 1, JSON.stringify(pointRaces))
    assert.match(pointRaces.find(({ status }) => status !== 0).stderr, /already reserved/u)
    const pointsIdentity = sqlOk(container, String.raw`
      SELECT request_key,checkout_draft_id
      FROM public.paid_checkout_reservations
      WHERE request_key IN (
        'jyco_33333333-3333-4333-8333-333333333333',
        'jyco_44444444-4444-4444-8444-444444444444'
      );
    `)
      .match(/(jyco_[0-9a-f-]{36})\s+\|\s+([0-9a-f-]{36})/u)
    assert.ok(pointsIdentity)
    const [, pointsKey, pointsDraftId] = pointsIdentity
    const pointsHash = pointsKey.includes('33333333') ? '3'.repeat(64) : '4'.repeat(64)
    assert.match(sqlOk(container, reserveSql({ key: pointsKey, hash: pointsHash, points: 7, final: 8200 })), /already_reserved/u)
    sqlFails(container, reserveSql({ key: pointsKey, hash: 'e'.repeat(64), points: 7, final: 8200 }), /payload conflict/u)
    sqlFails(container, "UPDATE public.user_points SET balance=3 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';", /reserved capacity/u)
    sqlOk(container, freezeBindSql(pointsKey, pointsHash, 'cs_test_points_exact_session_1234567890', pointsDraftId))
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_paid_checkout_for_order(
        '${pointsKey}','cs_test_points_wrong_session_1234567890','C',
        '${pointsDraftId}'::uuid,8200,'usd'
      );
    `, /identity does not match/u)
    const consumedPoints = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind,points_amount FROM public.consume_paid_checkout_for_order(
        '${pointsKey}','cs_test_points_exact_session_1234567890','C',
        '${pointsDraftId}'::uuid,8200,'usd'
      );
      SELECT outcome FROM public.consume_paid_checkout_for_order(
        '${pointsKey}','cs_test_points_exact_session_1234567890','C',
        '${pointsDraftId}'::uuid,8200,'usd'
      );
      RESET ROLE;
      SELECT balance,total_used,(SELECT count(*) FROM public.point_transactions WHERE reference_id='cs_test_points_exact_session_1234567890')
      FROM public.user_points WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    `)
    assert.match(consumedPoints, /consumed\s+\|\s+points\s+\|\s+7/u)
    assert.match(consumedPoints, /already_consumed/u)
    assert.match(consumedPoints, /3\s+\|\s+7\s+\|\s+1/u)

    const pointReleaseKey = 'jyco_66666666-6666-4666-8666-666666666666'
    const pointReleaseHash = '6'.repeat(64)
    sqlOk(container, reserveSql({ key: pointReleaseKey, hash: pointReleaseHash, points: 3, final: 8600 }))
    const pointReleaseDraftId = sqlOk(container, `SELECT checkout_draft_id FROM public.paid_checkout_reservations WHERE request_key='${pointReleaseKey}';`)
      .match(/[0-9a-f]{8}-[0-9a-f-]{27}/u)?.[0]
    assert.ok(pointReleaseDraftId)
    sqlFails(container, "UPDATE public.user_points SET balance=0 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';", /reserved capacity/u)
    sqlOk(container, freezeBindSql(pointReleaseKey, pointReleaseHash, 'cs_test_points_release_session_1234567890', pointReleaseDraftId))
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.release_paid_checkout_reservation(
        '${pointReleaseKey}','cs_test_points_release_wrong_1234567890'
      );
    `, /failure identity does not match/u)
    const releasedPoints = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind FROM public.release_paid_checkout_reservation(
        '${pointReleaseKey}','cs_test_points_release_session_1234567890'
      );
      SELECT outcome FROM public.release_paid_checkout_reservation(
        '${pointReleaseKey}','cs_test_points_release_session_1234567890'
      );
      RESET ROLE;
      UPDATE public.user_points SET balance=0 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      SELECT status,(SELECT balance FROM public.user_points WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      FROM public.paid_checkout_reservations WHERE request_key='${pointReleaseKey}';
    `)
    assert.match(releasedPoints, /released\s+\|\s+points/u)
    assert.match(releasedPoints, /already_released/u)
    assert.match(releasedPoints, /released\s+\|\s+0/u)

    const releaseKey = 'jyco_55555555-5555-4555-8555-555555555555'
    const releaseHash = '5'.repeat(64)
    sqlOk(container, reserveSql({ key: releaseKey, hash: releaseHash, coupon: 'RELEASE10', final: 8010 }))
    const releaseDraftId = sqlOk(container, `SELECT checkout_draft_id FROM public.paid_checkout_reservations WHERE request_key='${releaseKey}';`)
      .match(/[0-9a-f]{8}-[0-9a-f-]{27}/u)?.[0]
    assert.ok(releaseDraftId)
    sqlOk(container, freezeBindSql(releaseKey, releaseHash, 'cs_test_released_session_1234567890', releaseDraftId))
    const released = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind FROM public.release_paid_checkout_reservation(
        '${releaseKey}','cs_test_released_session_1234567890'
      );
      SELECT outcome FROM public.release_paid_checkout_reservation(
        '${releaseKey}','cs_test_released_session_1234567890'
      );
      RESET ROLE;
      UPDATE public.coupons SET used_count=1 WHERE code='RELEASE10';
      SELECT status,(SELECT used_count FROM public.coupons WHERE code='RELEASE10')
      FROM public.paid_checkout_reservations WHERE request_key='${releaseKey}';
    `)
    assert.match(released, /released\s+\|\s+coupon/u)
    assert.match(released, /already_released/u)
    assert.match(released, /released\s+\|\s+1/u)

    const abandonKey = 'jyco_adadadad-adad-4dad-8dad-adadadadadad'
    const abandonHash = 'a'.repeat(64)
    sqlOk(container, reserveSql({ key: abandonKey, hash: abandonHash, coupon: 'ABANDON10', final: 8010 }))
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.abandon_paid_checkout_before_provider(
        '${abandonKey}','sha256:${'b'.repeat(64)}'
      );
    `, /abandonment identity does not match/u)
    const abandoned = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,resource_kind FROM public.abandon_paid_checkout_before_provider(
        '${abandonKey}','sha256:${abandonHash}'
      );
      SELECT outcome FROM public.abandon_paid_checkout_before_provider(
        '${abandonKey}','sha256:${abandonHash}'
      );
      RESET ROLE;
      UPDATE public.coupons SET used_count=1 WHERE code='ABANDON10';
      SELECT status,(SELECT used_count FROM public.coupons WHERE code='ABANDON10')
      FROM public.paid_checkout_reservations WHERE request_key='${abandonKey}';
    `)
    assert.match(abandoned, /abandoned\s+\|\s+coupon/u)
    assert.match(abandoned, /already_released/u)
    assert.match(abandoned, /released\s+\|\s+1/u)

    const expiredKey = 'jyco_77777777-7777-4777-8777-777777777777'
    const expiredHash = '7'.repeat(64)
    sqlOk(container, reserveSql({ key: expiredKey, hash: expiredHash, coupon: 'EXPIRE10', final: 8010 }))
    sqlOk(container, `UPDATE public.paid_checkout_reservations SET expires_at=now()-interval '1 minute' WHERE request_key='${expiredKey}';`)
    const expiredReplay = sqlOk(container, String.raw`
      ${reserveSql({ key: expiredKey, hash: expiredHash, coupon: 'EXPIRE10', final: 8010 })}
      SELECT status,released_at IS NOT NULL FROM public.paid_checkout_reservations WHERE request_key='${expiredKey}';
    `)
    assert.match(expiredReplay, /expired/u)
    assert.match(expiredReplay, /released\s+\|\s+t/u)

    const expiredBindKey = 'jyco_88888888-8888-4888-8888-888888888888'
    const expiredBindHash = '8'.repeat(64)
    sqlOk(container, reserveSql({ key: expiredBindKey, hash: expiredBindHash }))
    const expiredBindDraftId = sqlOk(container, `SELECT checkout_draft_id FROM public.paid_checkout_reservations WHERE request_key='${expiredBindKey}';`)
      .match(/[0-9a-f]{8}-[0-9a-f-]{27}/u)?.[0]
    assert.ok(expiredBindDraftId)
    sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.freeze_paid_checkout_session(
        '${expiredBindKey}','sha256:${expiredBindHash}','${expiredBindDraftId}'::uuid,'mode=payment'
      );
      RESET ROLE;
      UPDATE public.paid_checkout_reservations SET expires_at=now()-interval '1 minute' WHERE request_key='${expiredBindKey}';
    `)
    const expiredBind = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.bind_paid_checkout_session(
        '${expiredBindKey}','sha256:${expiredBindHash}','cs_test_expired_bind_session_1234567890'
      );
      RESET ROLE;
      SELECT status,released_at IS NOT NULL,stripe_session_id IS NULL
      FROM public.paid_checkout_reservations WHERE request_key='${expiredBindKey}';
    `)
    assert.match(expiredBind, /expired/u)
    assert.match(expiredBind, /released\s+\|\s+t\s+\|\s+t/u)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
