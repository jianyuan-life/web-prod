import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260813050900_g15_independent_member_consent.sql',
  import.meta.url,
)
const migration = readFileSync(migrationUrl, 'utf8')

const bootstrap = String.raw`
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE TABLE public.paid_reports (
  id uuid PRIMARY KEY,
  plan_code text,
  status text,
  deleted_at timestamptz,
  user_id uuid,
  customer_email text,
  birth_data jsonb
);
`

function dockerPsql(container, database, input) {
  return spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8' },
  )
}

function sqlOk(container, database, input) {
  const result = dockerPsql(container, database, input)
  assert.equal(result.status, 0, result.stderr)
  return result
}

function sqlFails(container, database, input, pattern) {
  const result = dockerPsql(container, database, input)
  assert.notEqual(result.status, 0, 'SQL unexpectedly succeeded')
  assert.match(result.stderr, pattern)
  return result
}

function createDatabase(container, database) {
  sqlOk(container, 'postgres', `CREATE DATABASE ${database};`)
}

async function waitForPostgres(container) {
  let consecutiveReady = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (dockerPsql(container, 'postgres', 'SELECT 1;').status === 0) {
      consecutiveReady += 1
      if (consecutiveReady >= 2) return
    } else {
      consecutiveReady = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail('PostgreSQL 17 did not become ready')
}

const adultReports = String.raw`
INSERT INTO public.paid_reports(id,plan_code,status,deleted_at,user_id,customer_email,birth_data) VALUES
('11111111-1111-4111-8111-111111111111','C','completed',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test','{"year":1990,"month":1,"day":1}'::jsonb),
('22222222-2222-4222-8222-222222222222','C','completed',NULL,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member-b@example.test','{"year":1991,"month":2,"day":2}'::jsonb),
('33333333-3333-4333-8333-333333333333','C','completed',NULL,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','minor@example.test',jsonb_build_object('year', extract(year from current_date)::int - 10,'month',1,'day',1)),
('44444444-4444-4444-8444-444444444444','C','completed',NULL,NULL,'legacy@example.test','{"year":1988,"month":4,"day":4}'::jsonb),
('55555555-5555-4555-8555-555555555555','C','completed',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test','{"year":1985,"month":5,"day":5}'::jsonb);
`

function createSelectionSql({
  selectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requestKey = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  payloadHash = `sha256:${'9'.repeat(64)}`,
  reportIds = "ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]",
  receipts = null,
} = {}) {
  const receiptJson = JSON.stringify(receipts ?? [
    {
      report_id: '11111111-1111-4111-8111-111111111111',
      subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email_hmac: `hmac-sha256:${'1'.repeat(64)}`,
      accept_token_hash: `sha256:${'a'.repeat(64)}`,
      revoke_token_hash: `sha256:${'b'.repeat(64)}`,
    },
    {
      report_id: '22222222-2222-4222-8222-222222222222',
      subject_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email_hmac: `hmac-sha256:${'2'.repeat(64)}`,
      accept_token_hash: `sha256:${'c'.repeat(64)}`,
      revoke_token_hash: `sha256:${'d'.repeat(64)}`,
    },
  ]).replaceAll("'", "''")
  return String.raw`
SET ROLE service_role;
SELECT * FROM public.create_or_replace_g15_consent_selection(
  '${selectionId}'::uuid,
  '${requestKey}'::uuid,
  '${payloadHash}',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  ${reportIds},
  'sha256:${'8'.repeat(64)}',
  'g15-family-member-consent/v4.0.0',
  'prepare_and_generate_g15_family_blueprint',
  'purchaser_and_selected_adult_members_summary_only',
  now() + interval '6 days',
  '${receiptJson}'::jsonb
);
RESET ROLE;
`
}

test('migration exposes only hash-bound service-role state transitions and fail-closed postconditions', () => {
  assert.match(migration, /^\s*BEGIN\s*;/iu)
  assert.match(migration, /COMMIT\s*;\s*$/iu)
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.g15_consent_selections/iu)
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.g15_consent_receipts/iu)
  assert.doesNotMatch(migration, /\b(?:accept|revoke)_token\s+text\b/iu)
  assert.match(migration, /accept_token_hash\s+text/iu)
  assert.match(migration, /revoke_token_hash\s+text/iu)
  assert.match(migration, /subject_email_hmac\s+text/iu)
  assert.match(migration, /subject_user_id\s+uuid\s+NOT\s+NULL/iu)
  assert.match(migration, /consumed_stripe_session_id\s+text/iu)
  assert.match(migration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.consume_g15_consent_for_order/iu)
  assert.match(migration, /transition_g15_consent\(\s*p_action\s+text,\s*p_token_hash\s+text,\s*p_subject_user_id\s+uuid/iu)
  assert.match(migration, /SECURITY\s+DEFINER/iu)
  assert.match(migration, /pg_advisory_xact_lock/iu)
  assert.match(migration, /FOR\s+UPDATE/iu)
  assert.match(migration, /status\s*=\s*'accepted'[\s\S]*?accept_token_hash\s*=\s*NULL/iu)
  assert.match(migration, /status\s*=\s*'revoked'[\s\S]*?revoke_token_hash\s*=\s*NULL/iu)
  for (const table of ['g15_consent_selections', 'g15_consent_receipts']) {
    assert.match(migration, new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu'))
    assert.match(migration, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+PUBLIC`, 'iu'))
  }
  assert.match(migration, /g15 consent postcondition failed/iu)
})

test('PostgreSQL 17 replays cleanly, binds authenticated owners, and atomically consumes consent against revoke', async () => {
  if (process.env.G15_CONSENT_PG_RUNTIME !== '1') {
    assert.notEqual(
      process.env.JIANYUAN_RELEASE_TEST,
      '1',
      'release mode must set G15_CONSENT_PG_RUNTIME=1; a skipped PostgreSQL scenario is not a pass',
    )
    return
  }

  const container = `jianyuan-g15-consent-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)
    sqlOk(container, 'postgres', `${bootstrap}\n${migration}\n${migration}\n${adultReports}`)

    const created = sqlOk(container, 'postgres', createSelectionSql())
    assert.match(created.stdout, /created/u)

    const replay = sqlOk(container, 'postgres', createSelectionSql({
      receipts: [
        {
          report_id: '11111111-1111-4111-8111-111111111111',
          subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email_hmac: `hmac-sha256:${'1'.repeat(64)}`,
          accept_token_hash: `sha256:${'e'.repeat(64)}`,
          revoke_token_hash: `sha256:${'f'.repeat(64)}`,
        },
        {
          report_id: '22222222-2222-4222-8222-222222222222',
          subject_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          email_hmac: `hmac-sha256:${'2'.repeat(64)}`,
          accept_token_hash: `sha256:${'3'.repeat(64)}`,
          revoke_token_hash: `sha256:${'4'.repeat(64)}`,
        },
      ],
    }))
    assert.match(replay.stdout, /rotated/u)
    const count = sqlOk(container, 'postgres', 'SELECT count(*) FROM public.g15_consent_selections; SELECT count(*) FROM public.g15_consent_receipts;')
    assert.match(count.stdout, /\n\s*1\s*\n[\s\S]*?\n\s*2\s*\n/u)

    const accepted = sqlOk(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.transition_g15_consent('accept','sha256:${'e'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
      RESET ROLE;
    `)
    assert.match(accepted.stdout, /accepted/u)
    sqlFails(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.transition_g15_consent('accept','sha256:${'e'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
    `, /g15 consent token not found/u)
    sqlFails(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.transition_g15_consent('accept','sha256:${'3'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
    `, /g15 consent token not found/u)
    const acceptedB = sqlOk(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.transition_g15_consent('accept','sha256:${'3'.repeat(64)}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
      RESET ROLE;
    `)
    assert.match(acceptedB.stdout, /accepted/u)

    const consumed = sqlOk(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_g15_consent_for_order(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_synthetic_session_1234567890',
        '99999999-9999-4999-8999-999999999999'::uuid
      );
      RESET ROLE;
    `)
    assert.match(consumed.stdout, /consumed/u)
    const revokeAfterConsume = sqlOk(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT outcome,receipt_status,consumed_at IS NOT NULL AS bound
      FROM public.transition_g15_consent('revoke','sha256:${'f'.repeat(64)}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
      RESET ROLE;
    `)
    assert.match(revokeAfterConsume.stdout, /consumed\s+\|\s+accepted\s+\|\s+t/u)
    const replayConsume = sqlOk(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT outcome FROM public.consume_g15_consent_for_order(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_synthetic_session_1234567890',
        '99999999-9999-4999-8999-999999999999'::uuid
      );
      RESET ROLE;
    `)
    assert.match(replayConsume.stdout, /already_consumed/u)
    sqlFails(container, 'postgres', String.raw`
      SET ROLE service_role;
      SELECT * FROM public.consume_g15_consent_for_order(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'cs_test_another_session_0987654321',
        '88888888-8888-4888-8888-888888888888'::uuid
      );
    `, /already consumed by another order/u)

    sqlFails(container, 'postgres', createSelectionSql({
      selectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      requestKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      reportIds: "ARRAY['11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333']::uuid[]",
      payloadHash: `sha256:${'7'.repeat(64)}`,
      receipts: [
        { report_id: '11111111-1111-4111-8111-111111111111', subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email_hmac: `hmac-sha256:${'5'.repeat(64)}`, accept_token_hash: `sha256:${'5'.repeat(64)}`, revoke_token_hash: `sha256:${'6'.repeat(64)}` },
        { report_id: '33333333-3333-4333-8333-333333333333', subject_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email_hmac: `hmac-sha256:${'6'.repeat(64)}`, accept_token_hash: `sha256:${'7'.repeat(64)}`, revoke_token_hash: `sha256:${'8'.repeat(64)}` },
      ],
    }), /selected reports are not eligible adults/u)

    sqlFails(container, 'postgres', createSelectionSql({
      selectionId: '66666666-6666-4666-8666-666666666666',
      requestKey: '77777777-7777-4777-8777-777777777777',
      reportIds: "ARRAY['11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555']::uuid[]",
      payloadHash: `sha256:${'6'.repeat(64)}`,
      receipts: [
        { report_id: '11111111-1111-4111-8111-111111111111', subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email_hmac: `hmac-sha256:${'9'.repeat(64)}`, accept_token_hash: `sha256:${'9'.repeat(64)}`, revoke_token_hash: `sha256:${'0'.repeat(64)}` },
        { report_id: '55555555-5555-4555-8555-555555555555', subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email_hmac: `hmac-sha256:${'0'.repeat(64)}`, accept_token_hash: `sha256:${'1'.repeat(64)}`, revoke_token_hash: `sha256:${'2'.repeat(64)}` },
      ],
    }), /distinct authenticated adults/u)

    sqlFails(container, 'postgres', createSelectionSql({
      selectionId: '12121212-1212-4121-8121-121212121212',
      requestKey: '13131313-1313-4131-8131-131313131313',
      reportIds: "ARRAY['11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444']::uuid[]",
      payloadHash: `sha256:${'4'.repeat(64)}`,
      receipts: [
        { report_id: '11111111-1111-4111-8111-111111111111', subject_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email_hmac: `hmac-sha256:${'3'.repeat(64)}`, accept_token_hash: `sha256:${'5'.repeat(64)}`, revoke_token_hash: `sha256:${'6'.repeat(64)}` },
        { report_id: '44444444-4444-4444-8444-444444444444', subject_user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email_hmac: `hmac-sha256:${'4'.repeat(64)}`, accept_token_hash: `sha256:${'7'.repeat(64)}`, revoke_token_hash: `sha256:${'8'.repeat(64)}` },
      ],
    }), /bound to authenticated owners/u)

    createDatabase(container, 'g15_acl_drift')
    sqlOk(container, 'g15_acl_drift', `${bootstrap}\n${migration}`)
    sqlOk(container, 'g15_acl_drift', 'GRANT SELECT ON public.g15_consent_receipts TO authenticated;')
    sqlFails(container, 'g15_acl_drift', migration, /table ACL drifted/u)
    const aclRollback = sqlOk(
      container,
      'g15_acl_drift',
      "SELECT has_table_privilege('authenticated','public.g15_consent_receipts','SELECT');",
    )
    assert.match(aclRollback.stdout, /\n\s*t\s*\n/u, 'preflight failure must roll back before mutating drift evidence')

    createDatabase(container, 'g15_function_drift')
    sqlOk(container, 'g15_function_drift', `${bootstrap}\n${migration}`)
    sqlOk(container, 'g15_function_drift', String.raw`
      ALTER FUNCTION public.transition_g15_consent(text,text,uuid) SECURITY INVOKER;
    `)
    sqlFails(container, 'g15_function_drift', migration, /function security attributes drifted/u)

    createDatabase(container, 'g15_schema_drift')
    sqlOk(container, 'g15_schema_drift', `${bootstrap}\n${migration}`)
    sqlOk(container, 'g15_schema_drift', 'ALTER TABLE public.g15_consent_receipts ADD COLUMN unexpected text;')
    sqlFails(container, 'g15_schema_drift', migration, /table schema drifted/u)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
