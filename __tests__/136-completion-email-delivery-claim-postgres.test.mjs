import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL(
  '../supabase/migrations/20260813051100_report_completion_email_delivery_claim.sql',
  import.meta.url,
), 'utf8')
const completionEmailSource = readFileSync(new URL(
  '../lib/report/completion-fallback-email.ts',
  import.meta.url,
), 'utf8')
const completionDeliverySource = readFileSync(new URL(
  '../lib/report/completion-email-delivery.ts',
  import.meta.url,
), 'utf8')
const workflowSource = readFileSync(new URL(
  '../workflows/generate-report/steps.ts',
  import.meta.url,
), 'utf8')
const fallbackApiSource = readFileSync(new URL(
  '../app/api/generate-report/route.ts',
  import.meta.url,
), 'utf8')

const ids = {
  concurrent: '11111111-1111-4111-8111-111111111111',
  providerFailure: '22222222-2222-4222-8222-222222222222',
  refunded: '33333333-3333-4333-8333-333333333333',
  deleted: '44444444-4444-4444-8444-444444444444',
  pending: '55555555-5555-4555-8555-555555555555',
  officialRace: '66666666-6666-4666-8666-666666666666',
  payloadRace: '77777777-7777-4777-8777-777777777777',
}

const payloadHash = `sha256:${'a'.repeat(64)}`
const eventType = 'report_completed'
const providerKey = (id) => `report-completed/${id}`

const bootstrap = String.raw`
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE TABLE public.paid_reports (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  deleted_at timestamptz,
  email_sent_at timestamptz
);
ALTER TABLE public.paid_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_reports FORCE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.paid_reports TO service_role;
INSERT INTO public.paid_reports(id,status) VALUES
  ('${ids.concurrent}','completed'),
  ('${ids.providerFailure}','completed'),
  ('${ids.refunded}','completed'),
  ('${ids.deleted}','completed'),
  ('${ids.pending}','pending'),
  ('${ids.officialRace}','completed'),
  ('${ids.payloadRace}','completed');
`

function psql(container, input) {
  return spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-At', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8' },
  )
}

function psqlAsync(container, input) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-i', container, 'psql', '-At', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('exit', (status) => resolve({ status, stdout, stderr }))
    child.on('error', (error) => resolve({ status: 1, stdout, stderr: error.message }))
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
    consecutiveReady = psql(container, 'SELECT 1;').status === 0 ? consecutiveReady + 1 : 0
    if (consecutiveReady >= 2) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail('PostgreSQL 17 did not become ready')
}

function claimSql(id, hash = payloadHash, key = providerKey(id)) {
  return String.raw`
SET ROLE service_role;
SELECT outcome || '|' || coalesce(claim_status, 'null')
FROM public.claim_report_completion_email('${id}'::uuid,'${eventType}','${hash}','${key}');
RESET ROLE;
`
}

test('all completion-email producers are wired exclusively through one durable claim/finalize contract', () => {
  assert.match(completionDeliverySource, /rpc\(\s*['"]claim_report_completion_email['"]/u)
  assert.match(completionDeliverySource, /rpc\(\s*['"]finalize_report_completion_email['"]/u)
  assert.match(completionDeliverySource, /rpc\(\s*['"]mark_report_completion_email_needs_manual['"]/u)
  for (const producerSource of [completionEmailSource, workflowSource, fallbackApiSource]) {
    assert.match(producerSource, /deliverClaimedCompletionEmail/u)
    assert.doesNotMatch(producerSource, /\.update\(\{\s*email_sent_at/u)
  }

  assert.match(migration, /^\s*BEGIN\s*;/iu)
  assert.match(migration, /COMMIT\s*;\s*$/iu)
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.report_email_delivery_claims/iu)
  assert.match(migration, /PRIMARY\s+KEY\s*\(report_id,\s*event_type\)/iu)
  assert.match(migration, /ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu)
  assert.match(migration, /FORCE\s+ROW\s+LEVEL\s+SECURITY/iu)
  assert.match(migration, /FOR\s+UPDATE/iu)
  assert.match(migration, /REVOKE\s+ALL[\s\S]+FROM\s+authenticated/iu)
  assert.match(migration, /CREATE\s+TRIGGER\s+fence_report_completion_email_claims/iu)
})

test('PostgreSQL serializes claim, fences terminal races, and never automatically reopens an uncertain send', async () => {
  if (process.env.SECURITY_MIGRATION_PG_RUNTIME !== '1') {
    assert.notEqual(process.env.JIANYUAN_RELEASE_TEST, '1')
    return
  }

  const container = `jianyuan-completion-email-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)
    sqlOk(container, `${bootstrap}\n${migration}\n${migration}`)

    const firstWorker = psqlAsync(container, String.raw`
      SET ROLE service_role;
      BEGIN;
      SELECT id FROM public.paid_reports WHERE id='${ids.concurrent}'::uuid FOR UPDATE;
      SELECT pg_sleep(0.8);
      SELECT outcome || '|' || coalesce(claim_status, 'null')
      FROM public.claim_report_completion_email(
        '${ids.concurrent}'::uuid,'${eventType}','${payloadHash}','${providerKey(ids.concurrent)}'
      );
      COMMIT;
      RESET ROLE;
    `)
    await new Promise((resolve) => setTimeout(resolve, 150))
    const secondWorker = psqlAsync(container, claimSql(ids.concurrent))
    const concurrent = await Promise.all([firstWorker, secondWorker])
    for (const result of concurrent) assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(
      concurrent.map((result) => result.stdout).join('\n').match(/(?:claimed|already_claimed)\|claimed/gu)?.sort(),
      ['already_claimed|claimed', 'claimed|claimed'],
    )

    const finalized = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome || '|' || claim_status
      FROM public.finalize_report_completion_email(
        '${ids.concurrent}'::uuid,'${eventType}','${payloadHash}',
        '${providerKey(ids.concurrent)}','synthetic-provider-message-1'
      );
      RESET ROLE;
      SELECT status || '|' || (email_sent_at IS NOT NULL)::text
      FROM public.paid_reports WHERE id='${ids.concurrent}'::uuid;
    `)
    assert.match(finalized, /sent\|sent[\s\S]*completed\|true/u)
    assert.match(sqlOk(container, claimSql(ids.concurrent)), /already_sent\|sent/u)

    // A competing producer with a different template/hash loses closed but
    // cannot poison the first producer's authoritative claim.
    assert.match(sqlOk(container, claimSql(ids.payloadRace)), /claimed\|claimed/u)
    const competingHash = `sha256:${'b'.repeat(64)}`
    assert.match(
      sqlOk(container, claimSql(ids.payloadRace, competingHash)),
      /payload_conflict\|claimed/u,
    )
    const payloadRaceFinalized = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome || '|' || claim_status
      FROM public.finalize_report_completion_email(
        '${ids.payloadRace}'::uuid,'${eventType}','${payloadHash}',
        '${providerKey(ids.payloadRace)}','synthetic-provider-message-payload-race'
      );
      RESET ROLE;
    `)
    assert.match(payloadRaceFinalized, /sent\|sent/u)

    assert.match(sqlOk(container, claimSql(ids.providerFailure)), /claimed\|claimed/u)
    const manual = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome || '|' || claim_status
      FROM public.mark_report_completion_email_needs_manual(
        '${ids.providerFailure}'::uuid,'${eventType}','${payloadHash}',
        '${providerKey(ids.providerFailure)}','provider-result-not-success',NULL
      );
      RESET ROLE;
    `)
    assert.match(manual, /needs_manual\|needs_manual/u)
    assert.match(sqlOk(container, claimSql(ids.providerFailure)), /already_needs_manual\|needs_manual/u)

    assert.match(sqlOk(container, claimSql(ids.refunded)), /claimed\|claimed/u)
    sqlOk(container, `UPDATE public.paid_reports SET status='refunded' WHERE id='${ids.refunded}'::uuid;`)
    const refundFinalize = sqlOk(container, String.raw`
      SET ROLE service_role;
      SELECT outcome || '|' || claim_status
      FROM public.finalize_report_completion_email(
        '${ids.refunded}'::uuid,'${eventType}','${payloadHash}',
        '${providerKey(ids.refunded)}','synthetic-provider-message-refund'
      );
      RESET ROLE;
      SELECT status || '|' || (email_sent_at IS NULL)::text
      FROM public.paid_reports WHERE id='${ids.refunded}'::uuid;
    `)
    assert.match(refundFinalize, /terminal_state\|needs_manual[\s\S]*refunded\|true/u)

    assert.match(sqlOk(container, claimSql(ids.deleted)), /claimed\|claimed/u)
    sqlOk(container, `UPDATE public.paid_reports SET deleted_at=now() WHERE id='${ids.deleted}'::uuid;`)
    assert.match(sqlOk(container, claimSql(ids.deleted)), /terminal_state\|needs_manual/u)

    assert.match(sqlOk(container, claimSql(ids.pending)), /terminal_state\|null/u)
    assert.match(sqlOk(container, claimSql(ids.officialRace)), /claimed\|claimed/u)
    sqlOk(container, `UPDATE public.paid_reports SET email_sent_at=now() WHERE id='${ids.officialRace}'::uuid;`)
    assert.match(sqlOk(container, claimSql(ids.officialRace)), /already_sent\|needs_manual/u)

    const acl = sqlOk(container, String.raw`
      SELECT has_table_privilege('service_role','public.report_email_delivery_claims','SELECT')::text;
      SELECT has_table_privilege('anon','public.report_email_delivery_claims','SELECT')::text;
      SELECT has_function_privilege(
        'service_role',
        'public.claim_report_completion_email(uuid,text,text,text)',
        'EXECUTE'
      )::text;
    `)
    assert.match(acl, /^true\s+false\s+true\s*$/u)
    sqlFails(container, String.raw`
      SET ROLE authenticated;
      SELECT * FROM public.claim_report_completion_email(
        '${ids.pending}'::uuid,'${eventType}','${payloadHash}','${providerKey(ids.pending)}'
      );
    `, /permission denied/u)

    sqlOk(container, 'ALTER TABLE public.report_email_delivery_claims ADD COLUMN unexpected text;')
    sqlFails(container, migration, /completion email delivery claim schema drift/u)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
