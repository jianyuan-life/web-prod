import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const consentMigration = readFileSync(new URL(
  '../supabase/migrations/20260813050900_g15_independent_member_consent.sql',
  import.meta.url,
), 'utf8')
const reservationMigration = readFileSync(new URL(
  '../supabase/migrations/20260813051000_g15_checkout_consent_reservation.sql',
  import.meta.url,
), 'utf8')

const bootstrap = String.raw`
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE TABLE public.paid_reports (
  id uuid PRIMARY KEY, plan_code text, status text, deleted_at timestamptz,
  user_id uuid, customer_email text, birth_data jsonb
);
CREATE TABLE public.checkout_drafts (
  id uuid PRIMARY KEY, plan_code text, birth_data jsonb, locale text, used_at timestamptz
);
INSERT INTO public.paid_reports VALUES
('11111111-1111-4111-8111-111111111111','C','completed',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test','{"year":1990,"month":1,"day":1}'::jsonb),
('22222222-2222-4222-8222-222222222222','C','completed',NULL,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member@example.test','{"year":1991,"month":2,"day":2}'::jsonb);
`

const createAndAccept = String.raw`
SET ROLE service_role;
SELECT * FROM public.create_or_replace_g15_consent_selection(
  '33333333-3333-4333-8333-333333333333'::uuid,
  '44444444-4444-4444-8444-444444444444'::uuid,
  'sha256:${'9'.repeat(64)}',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
  'sha256:${'8'.repeat(64)}',
  'g15-family-member-consent/v4.0.0',
  'prepare_and_generate_g15_family_blueprint',
  'purchaser_and_selected_adult_members_summary_only',
  now() + interval '6 days',
  '[{"report_id":"11111111-1111-4111-8111-111111111111","subject_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email_hmac":"hmac-sha256:${'1'.repeat(64)}","accept_token_hash":"sha256:${'a'.repeat(64)}","revoke_token_hash":"sha256:${'b'.repeat(64)}"},{"report_id":"22222222-2222-4222-8222-222222222222","subject_user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email_hmac":"hmac-sha256:${'2'.repeat(64)}","accept_token_hash":"sha256:${'c'.repeat(64)}","revoke_token_hash":"sha256:${'d'.repeat(64)}"}]'::jsonb
);
SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'a'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'c'.repeat(64)}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
RESET ROLE;
`

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

function reserveSql(reservationId, selectionId = '33333333-3333-4333-8333-333333333333') {
  return String.raw`
SET ROLE service_role;
SELECT outcome,reservation_id,checkout_draft_id,report_id
FROM public.reserve_g15_consent_for_checkout(
  '${selectionId}'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '${reservationId}'::uuid,
  'sha256:${'7'.repeat(64)}',
  '{"plan_type":"family_reports","report_ids":["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"],"consent_selection_id":"${selectionId}","stated_relationships":["Adult A and Adult B are siblings."],"consultation_goals":["Improve family communication."]}'::jsonb,
  'zh-TW',
  now() + interval '35 minutes'
);
RESET ROLE;
`
}

test('reservation migration is replay-safe and exposes only service-role atomic RPCs', () => {
  assert.match(reservationMigration, /^\s*BEGIN\s*;/iu)
  assert.match(reservationMigration, /COMMIT\s*;\s*$/iu)
  assert.match(reservationMigration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.g15_checkout_consent_reservations/iu)
  assert.match(reservationMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reserve_g15_consent_for_checkout/iu)
  assert.match(reservationMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bind_g15_checkout_consent_session/iu)
  assert.match(reservationMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.consume_g15_checkout_consent_for_order/iu)
  assert.match(reservationMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.prepare_g15_consent_revocation/iu)
  assert.match(reservationMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.finalize_g15_consent_revocation/iu)
  assert.match(reservationMigration, /CREATE\s+TRIGGER\s+fence_g15_reserved_selection_supersede/iu)
  assert.match(reservationMigration, /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.consume_g15_consent_for_order/iu)
  assert.match(reservationMigration, /FOR\s+UPDATE/iu)
  assert.match(reservationMigration, /g15_checkout_consent_active_selection_unique/iu)
  assert.match(reservationMigration, /REVOKE\s+ALL[\s\S]+FROM\s+authenticated/iu)
})

test('PostgreSQL serializes duplicate checkout and revoke against one consent reservation', async () => {
  if (process.env.G15_CONSENT_PG_RUNTIME !== '1') {
    assert.notEqual(process.env.JIANYUAN_RELEASE_TEST, '1')
    return
  }

  const container = `jianyuan-g15-reservation-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)
    sqlOk(container, `${bootstrap}\n${consentMigration}\n${reservationMigration}\n${reservationMigration}\n${createAndAccept}`)

    const concurrentReservations = await Promise.all([
      psqlAsync(container, reserveSql('55555555-5555-4555-8555-555555555555')),
      psqlAsync(container, reserveSql('55555555-5555-4555-8555-555555555555')),
    ])
    for (const result of concurrentReservations) assert.equal(result.status, 0, result.stderr)
    const concurrentOutcomes = concurrentReservations.map((result) => result.stdout).join('\n')
    assert.match(concurrentOutcomes, /reserved/u)
    assert.match(concurrentOutcomes, /already_reserved/u)
    const deterministicIds = sqlOk(container, String.raw`
      SELECT checkout_draft_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' AS draft_is_rfc_v4,
             report_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' AS report_is_rfc_v4
      FROM public.g15_checkout_consent_reservations
      WHERE id = '55555555-5555-4555-8555-555555555555'::uuid;
    `)
    assert.match(deterministicIds, /t\s+\|\s+t/u)
    const replay = sqlOk(container, reserveSql('55555555-5555-4555-8555-555555555555'))
    assert.match(replay, /already_reserved/u)
    sqlFails(
      container,
      reserveSql('66666666-6666-4666-8666-666666666666'),
      /already has an active checkout reservation/u,
    )

    const revokeAfterReserve = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status FROM public.transition_g15_consent(
        'revoke','sha256:${'b'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      );
      RESET ROLE;
    `)
    assert.match(revokeAfterReserve, /reserved\s+\|\s+accepted/u)

    const bound = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.bind_g15_checkout_consent_session(
        '55555555-5555-4555-8555-555555555555'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_synthetic_reserved_session_1234567890'
      );
      RESET ROLE;
    `)
    assert.match(bound, /bound/u)

    // A reload/second tab may request a fresh selection after the Stripe
    // Session is already payable. It must not supersede the consent authority
    // bound to that Session or make a paid order permanently unfulfillable.
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.create_or_replace_g15_consent_selection(
        '77777777-7777-4777-8777-777777777777'::uuid,
        '88888888-8888-4888-8888-888888888888'::uuid,
        'sha256:${'6'.repeat(64)}',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        'sha256:${'8'.repeat(64)}',
        'g15-family-member-consent/v4.0.0',
        'prepare_and_generate_g15_family_blueprint',
        'purchaser_and_selected_adult_members_summary_only',
        now() + interval '6 days',
        '[{"report_id":"11111111-1111-4111-8111-111111111111","subject_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email_hmac":"hmac-sha256:${'3'.repeat(64)}","accept_token_hash":"sha256:${'4'.repeat(64)}","revoke_token_hash":"sha256:${'5'.repeat(64)}"},{"report_id":"22222222-2222-4222-8222-222222222222","subject_user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email_hmac":"hmac-sha256:${'6'.repeat(64)}","accept_token_hash":"sha256:${'7'.repeat(64)}","revoke_token_hash":"sha256:${'8'.repeat(64)}"}]'::jsonb
      );
    `, /active checkout reservation/u)
    const authorityAfterReload = sqlOk(container, String.raw`
      SELECT selection.superseded_at IS NULL,
             count(*) FILTER (WHERE receipt.status = 'accepted')
      FROM public.g15_consent_selections AS selection
      JOIN public.g15_consent_receipts AS receipt ON receipt.selection_id = selection.id
      WHERE selection.id = '33333333-3333-4333-8333-333333333333'::uuid
      GROUP BY selection.superseded_at;
    `)
    assert.match(authorityAfterReload, /t\s+\|\s+2/u)

    const preparedBoundRevoke = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status,checkout_reservation_id,checkout_stripe_session_id
      FROM public.prepare_g15_consent_revocation(
        'sha256:${'b'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      );
      RESET ROLE;
    `)
    assert.match(
      preparedBoundRevoke,
      /provider_expire_required\s+\|\s+accepted\s+\|\s+55555555-5555-4555-8555-555555555555\s+\|\s+cs_test_synthetic_reserved_session_1234567890/u,
    )

    const consumed = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,stripe_session_id,report_id FROM public.consume_g15_checkout_consent_for_order(
        '55555555-5555-4555-8555-555555555555'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_synthetic_reserved_session_1234567890'
      );
      RESET ROLE;
    `)
    assert.match(consumed, /consumed\s+\|\s+cs_test_synthetic_reserved_session_1234567890/u)
    const state = sqlOk(container, String.raw`
      SELECT count(*) FILTER (WHERE status = 'consumed') AS consumed_reservations,
             count(DISTINCT checkout_draft_id) AS drafts,
             count(DISTINCT report_id) AS reports
      FROM public.g15_checkout_consent_reservations;
    `)
    assert.match(state, /1\s+\|\s+1\s+\|\s+1/u)

    const releaseConsumed = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.release_g15_checkout_consent_reservation(
        '55555555-5555-4555-8555-555555555555'::uuid,
        'cs_test_synthetic_reserved_session_1234567890'
      );
      RESET ROLE;
    `)
    assert.match(releaseConsumed, /already_consumed/u)

    sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.create_or_replace_g15_consent_selection(
        '88888888-8888-4888-8888-888888888888'::uuid,
        '99999999-9999-4999-8999-999999999999'::uuid,
        'sha256:${'6'.repeat(64)}',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        'sha256:${'8'.repeat(64)}',
        'g15-family-member-consent/v4.0.0',
        'prepare_and_generate_g15_family_blueprint',
        'purchaser_and_selected_adult_members_summary_only',
        now() + interval '6 days',
        '[{"report_id":"11111111-1111-4111-8111-111111111111","subject_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email_hmac":"hmac-sha256:${'5'.repeat(64)}","accept_token_hash":"sha256:${'e'.repeat(64)}","revoke_token_hash":"sha256:${'f'.repeat(64)}"},{"report_id":"22222222-2222-4222-8222-222222222222","subject_user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email_hmac":"hmac-sha256:${'6'.repeat(64)}","accept_token_hash":"sha256:${'3'.repeat(64)}","revoke_token_hash":"sha256:${'4'.repeat(64)}"}]'::jsonb
      );
      SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'e'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
      SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'3'.repeat(64)}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
      RESET ROLE;
    `)
    const secondReserved = sqlOk(
      container,
      reserveSql('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888'),
    )
    assert.match(secondReserved, /reserved/u)
    const revokedReserved = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status FROM public.prepare_g15_consent_revocation(
        'sha256:${'f'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      );
      RESET ROLE;
      SELECT reservation.status, receipt.status
      FROM public.g15_checkout_consent_reservations AS reservation
      JOIN public.g15_consent_receipts AS receipt ON receipt.selection_id = reservation.selection_id
      WHERE reservation.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
        AND receipt.subject_report_id = '11111111-1111-4111-8111-111111111111'::uuid;
    `)
    assert.match(revokedReserved, /revoked\s+\|\s+revoked/u)
    assert.match(revokedReserved, /released\s+\|\s+revoked/u)
    sqlFails(
      container,
      String.raw`
        SET ROLE service_role;
        SELECT outcome FROM public.bind_g15_checkout_consent_session(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
          'cs_test_released_session_1234567890'
        );
      `,
      /cannot bind this session/u,
    )

    sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT * FROM public.create_or_replace_g15_consent_selection(
        '12121212-1212-4121-8121-121212121212'::uuid,
        '13131313-1313-4131-8131-131313131313'::uuid,
        'sha256:${'5'.repeat(64)}',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        'sha256:${'8'.repeat(64)}',
        'g15-family-member-consent/v4.0.0',
        'prepare_and_generate_g15_family_blueprint',
        'purchaser_and_selected_adult_members_summary_only',
        now() + interval '6 days',
        '[{"report_id":"11111111-1111-4111-8111-111111111111","subject_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email_hmac":"hmac-sha256:${'7'.repeat(64)}","accept_token_hash":"sha256:${'0'.repeat(64)}","revoke_token_hash":"sha256:${'1'.repeat(64)}"},{"report_id":"22222222-2222-4222-8222-222222222222","subject_user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email_hmac":"hmac-sha256:${'8'.repeat(64)}","accept_token_hash":"sha256:${'2'.repeat(64)}","revoke_token_hash":"sha256:${'5'.repeat(64)}"}]'::jsonb
      );
      SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'0'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
      SELECT outcome FROM public.transition_g15_consent('accept','sha256:${'2'.repeat(64)}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
      RESET ROLE;
    `)
    sqlOk(
      container,
      reserveSql('14141414-1414-4141-8141-141414141414', '12121212-1212-4121-8121-121212121212'),
    )
    sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.bind_g15_checkout_consent_session(
        '14141414-1414-4141-8141-141414141414'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_provider_expired_session_1234567890'
      );
      RESET ROLE;
    `)
    const needsProviderExpiry = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status FROM public.prepare_g15_consent_revocation(
        'sha256:${'1'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      );
      RESET ROLE;
    `)
    assert.match(needsProviderExpiry, /provider_expire_required\s+\|\s+accepted/u)
    const finalizedBoundRevoke = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status FROM public.finalize_g15_consent_revocation(
        'sha256:${'1'.repeat(64)}',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        '14141414-1414-4141-8141-141414141414'::uuid,
        'cs_test_provider_expired_session_1234567890'
      );
      RESET ROLE;
      SELECT reservation.status, receipt.status
      FROM public.g15_checkout_consent_reservations AS reservation
      JOIN public.g15_consent_receipts AS receipt ON receipt.selection_id = reservation.selection_id
      WHERE reservation.id = '14141414-1414-4141-8141-141414141414'::uuid
        AND receipt.subject_report_id = '11111111-1111-4111-8111-111111111111'::uuid;
    `)
    assert.match(finalizedBoundRevoke, /revoked\s+\|\s+revoked/u)
    assert.match(finalizedBoundRevoke, /released\s+\|\s+revoked/u)
    sqlFails(container, String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.consume_g15_checkout_consent_for_order(
        '14141414-1414-4141-8141-141414141414'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_provider_expired_session_1234567890'
      );
    `, /not bound to this paid session/u)

    sqlOk(container, String.raw`
      ALTER TABLE public.g15_checkout_consent_reservations
        DROP CONSTRAINT g15_checkout_consent_reservations_request_payload_hash_check;
      ALTER TABLE public.g15_checkout_consent_reservations
        ADD CONSTRAINT g15_checkout_consent_reservations_request_payload_hash_check
        CHECK (request_payload_hash <> '');
    `)
    sqlFails(container, reservationMigration, /constraint definitions drifted/u)
    sqlOk(container, String.raw`
      ALTER TABLE public.g15_checkout_consent_reservations
        DROP CONSTRAINT g15_checkout_consent_reservations_request_payload_hash_check;
      ALTER TABLE public.g15_checkout_consent_reservations
        ADD CONSTRAINT g15_checkout_consent_reservations_request_payload_hash_check
        CHECK (request_payload_hash ~ '^sha256:[0-9a-f]{64}$');
    `)

    sqlOk(container, String.raw`
      DROP INDEX public.g15_checkout_consent_active_selection_unique;
      CREATE UNIQUE INDEX g15_checkout_consent_active_selection_unique
        ON public.g15_checkout_consent_reservations(purchaser_user_id)
        WHERE status IN ('reserved', 'bound', 'consumed');
    `)
    sqlFails(container, reservationMigration, /index definitions drifted/u)
    sqlOk(container, String.raw`
      DROP INDEX public.g15_checkout_consent_active_selection_unique;
      CREATE UNIQUE INDEX g15_checkout_consent_active_selection_unique
        ON public.g15_checkout_consent_reservations(selection_id)
        WHERE status IN ('reserved', 'bound', 'consumed');
    `)

    sqlOk(container, 'ALTER TABLE public.g15_checkout_consent_reservations ADD COLUMN unexpected text;')
    sqlFails(container, reservationMigration, /table schema drifted/u)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
