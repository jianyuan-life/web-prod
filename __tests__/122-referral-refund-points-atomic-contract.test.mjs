import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260813050600_reconcile_stripe_refund_events.sql',
  import.meta.url,
)
const adminRouteUrl = new URL('../app/api/admin/refund/route.ts', import.meta.url)
const webhookRouteUrl = new URL('../app/api/webhook/stripe/route.ts', import.meta.url)

function dockerPsql(container, database, input) {
  return spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
}

async function waitForPostgres(container) {
  let consecutiveReady = 0
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = dockerPsql(container, 'postgres', 'SELECT 1;')
    consecutiveReady = probe.status === 0 ? consecutiveReady + 1 : 0
    if (consecutiveReady >= 2) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.fail('PostgreSQL 17 refund test container did not become ready')
}

test('one transaction owns report, revenue, expense, referral points, and event idempotency', () => {
  assert.equal(existsSync(migrationUrl), true)
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.match(sql, /^\s*BEGIN\s*;/iu)
  assert.match(sql, /COMMIT\s*;\s*$/iu)
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.stripe_refund_event_ledger/iu)
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.stripe_refund_accounting_state/iu)
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.referral_refund_point_ledger/iu)
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.admin_refund_point_hold/iu)
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.stripe_refund_reversal_ledger/iu)
  assert.match(sql, /report_id\s+uuid\s+PRIMARY\s+KEY/iu)
  assert.match(sql, /source_point_transaction_id\s+uuid\s+UNIQUE/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.reconcile_stripe_refund_event/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.reverse_stripe_refund_event/iu)
  assert.match(sql, /DO\s+\$refund_reconciliation_replay_preflight\$/iu)
  assert.match(sql, /DO\s+\$refund_reconciliation_postcondition\$/iu)
  assert.doesNotMatch(sql, /CREATE\s+FUNCTION\s+public\.clawback_referral_points_for_refund/iu)
})

test('admin refunds reserve a durable immutable intent before provider mutation', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.match(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.admin_refund_intent/iu)
  assert.match(sql, /PRIMARY\s+KEY\s*\(\s*report_id\s*,\s*request_id\s*\)/iu)
  assert.match(sql, /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?admin_refund_intent_one_active_per_report[\s\S]*?WHERE\s+state\s+IN\s*\(\s*'reserved'\s*,\s*'provider_pending'\s*,\s*'provider_applied'\s*\)/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.reserve_admin_refund_intent/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.start_admin_refund_provider_attempt/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.bind_admin_refund_intent_provider_result/iu)
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.complete_admin_refund_intent/iu)
  assert.match(sql, /FROM\s+public\.paid_reports\s+AS\s+report[\s\S]*?FOR\s+UPDATE\s+OF\s+report/iu)
  assert.match(sql, /payload_sha256\s+IS\s+DISTINCT\s+FROM\s+p_payload_sha256/iu)
  assert.match(sql, /state\s*=\s*'provider_pending'[\s\S]*?stripe_refund_id\s*=\s*p_refund_id[\s\S]*?state\s*=\s*'provider_applied'/iu)
  assert.match(sql, /state\s*=\s*'reconciled'/iu)
})

test('unified RPC uses cumulative Stripe truth and mutates every ledger under row locks', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  const start = sql.indexOf('FUNCTION public.reconcile_stripe_refund_event')
  const end = sql.indexOf('REVOKE ALL ON FUNCTION', start)
  assert.ok(start >= 0 && end > start)
  const fn = sql.slice(start, end)

  assert.match(fn, /FROM\s+public\.paid_reports\s+AS\s+report[\s\S]*FOR\s+UPDATE\s+OF\s+report/iu)
  assert.match(fn, /FROM\s+public\.revenue_log\s+AS\s+revenue[\s\S]*FOR\s+UPDATE\s+OF\s+revenue/iu)
  assert.match(fn, /FROM\s+public\.stripe_refund_accounting_state\s+AS\s+accounting[\s\S]*FOR\s+UPDATE\s+OF\s+accounting/iu)
  assert.match(fn, /UPDATE\s+public\.paid_reports/iu)
  assert.match(fn, /UPDATE\s+public\.revenue_log/iu)
  assert.match(fn, /INSERT\s+INTO\s+public\.expense_log/iu)
  assert.match(fn, /UPDATE\s+public\.expense_log/iu)
  assert.match(fn, /p_refunded_amount_cents\s*>=\s*round\s*\(\s*v_report_amount_usd\s*\*\s*100\s*\)::bigint/iu)
  assert.match(fn, /IF\s+v_is_full_refund\s+THEN[\s\S]*FROM\s+public\.referrals/iu)
  assert.match(fn, /FROM\s+public\.point_transactions\s+AS\s+source_tx[\s\S]*source_tx\.type\s*=\s*'earn_referral'/iu)
  assert.match(fn, /FROM\s+public\.user_points\s+AS\s+up[\s\S]*FOR\s+UPDATE\s+OF\s+up/iu)
  assert.match(fn, /UPDATE\s+public\.user_points/iu)
  assert.match(fn, /INSERT\s+INTO\s+public\.point_transactions/iu)
  assert.match(fn, /UPDATE\s+public\.referrals/iu)
  assert.match(fn, /INSERT\s+INTO\s+public\.referral_refund_point_ledger/iu)
  assert.match(fn, /UPDATE\s+public\.stripe_refund_event_ledger/iu)
})

test('partial refunds cannot reach referral mutation and duplicate events return stored results', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  const start = sql.indexOf('FUNCTION public.reconcile_stripe_refund_event')
  const end = sql.indexOf('REVOKE ALL ON FUNCTION', start)
  const fn = sql.slice(start, end)
  const fullGuard = fn.indexOf('IF v_is_full_refund THEN')
  const pointsUpdate = fn.indexOf('UPDATE public.user_points', fullGuard)
  assert.ok(fullGuard >= 0 && pointsUpdate > fullGuard)
  assert.match(fn, /ON\s+CONFLICT\s*\(\s*event_id\s*\)\s+DO\s+NOTHING/iu)
  assert.match(fn, /RETURN\s+QUERY\s+SELECT[\s\S]*'already'::text[\s\S]*v_existing_event\.points_clawed_back/iu)
  assert.match(fn, /IF\s+NOT\s+v_is_full_refund[\s\S]*v_points_clawed_back\s*<>\s*0/iu)
})

test('all dedicated ledgers and the single RPC are service-role-only', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  for (const table of [
    'stripe_refund_event_ledger',
    'stripe_refund_accounting_state',
    'referral_refund_point_ledger',
    'admin_refund_intent',
    'admin_refund_point_hold',
    'stripe_refund_reversal_ledger',
  ]) {
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu'))
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu'))
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      assert.match(sql, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+${role}`, 'iu'))
    }
  }
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    assert.match(
      sql,
      new RegExp(`REVOKE\\s+ALL[\\s\\S]*?reconcile_stripe_refund_event\\(\\s*text,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text,\\s*bigint,\\s*text\\s*\\)[\\s\\S]*?FROM\\s+${role}`, 'iu'),
    )
  }
  assert.match(sql, /GRANT\s+EXECUTE[\s\S]*?reconcile_stripe_refund_event[\s\S]*?TO\s+service_role/iu)
  for (const routine of [
    'reserve_admin_refund_intent',
    'start_admin_refund_provider_attempt',
    'bind_admin_refund_intent_provider_result',
    'complete_admin_refund_intent',
    'reverse_stripe_refund_event',
  ]) {
    assert.match(sql, new RegExp(`REVOKE\\s+ALL[\\s\\S]*?${routine}[\\s\\S]*?FROM\\s+PUBLIC`, 'iu'))
    assert.match(sql, new RegExp(`REVOKE\\s+ALL[\\s\\S]*?${routine}[\\s\\S]*?FROM\\s+anon`, 'iu'))
    assert.match(sql, new RegExp(`REVOKE\\s+ALL[\\s\\S]*?${routine}[\\s\\S]*?FROM\\s+authenticated`, 'iu'))
    assert.match(sql, new RegExp(`GRANT\\s+EXECUTE[\\s\\S]*?${routine}[\\s\\S]*?TO\\s+service_role`, 'iu'))
  }
})

test('admin and webhook routes use only the atomic forward and terminal reconciliation RPCs', () => {
  const adminRoute = readFileSync(adminRouteUrl, 'utf8')
  const webhookRoute = readFileSync(webhookRouteUrl, 'utf8')
  const refundStart = webhookRoute.indexOf("event.type === 'charge.refunded'")
  const refundEnd = webhookRoute.indexOf("event.type === 'charge.dispute.created'", refundStart)
  assert.ok(refundStart >= 0 && refundEnd > refundStart)
  const webhookRefundRoute = webhookRoute.slice(refundStart, refundEnd)
  assert.match(adminRoute, /rpc\s*\(\s*['"]reconcile_stripe_refund_event['"]/iu)
  assert.match(webhookRefundRoute, /rpc\s*\(\s*['"]reconcile_stripe_refund_event['"]/iu)
  assert.match(webhookRefundRoute, /rpc\s*\(\s*['"]reverse_stripe_refund_event['"]/iu)
  for (const route of [adminRoute, webhookRefundRoute]) {
    assert.doesNotMatch(route, /clawback_referral_points_for_refund/iu)
    assert.doesNotMatch(route, /from\('user_points'\)[\s\S]{0,300}?\.update\(/iu)
    assert.doesNotMatch(route, /from\('point_transactions'\)[\s\S]{0,300}?\.insert\(/iu)
    assert.doesNotMatch(route, /from\('revenue_log'\)[\s\S]{0,300}?\.update\(/iu)
    assert.doesNotMatch(route, /from\('expense_log'\)[\s\S]{0,300}?\.insert\(/iu)
  }
  assert.match(adminRoute, /typeof\s+requestId\s*!==\s*'string'/u)
  assert.match(adminRoute, /const\s+idempotencyKey\s*=\s*\[[\s\S]{0,160}?requestId[\s\S]{0,160}?\.join\(':+'\)/u)
  assert.match(adminRoute, /refunds\.create\(\s*refundParams\s*,\s*\{\s*idempotencyKey\s*,?\s*\}\s*\)/u)
  assert.match(adminRoute, /p_event_id:\s*`admin_refund:\$\{report\.id\}:\$\{requestId\}`/u)
})

test('PostgreSQL runtime corpus covers partial, full, retries, out-of-order, rollback, and external path parity', () => {
  const bootstrap = readFileSync(
    new URL('./fixtures/referral-refund-points-postgres-bootstrap.sql', import.meta.url),
    'utf8',
  )
  const scenarios = readFileSync(
    new URL('./fixtures/referral-refund-points-postgres-scenarios.sql', import.meta.url),
    'utf8',
  )
  assert.match(bootstrap, /CREATE\s+TABLE\s+public\.revenue_log/iu)
  assert.match(bootstrap, /CREATE\s+TABLE\s+public\.expense_log/iu)
  assert.match(scenarios, /partial refund changed referral point state/iu)
  assert.match(scenarios, /same-event retry was not idempotent/iu)
  assert.match(scenarios, /out-of-order refund lowered cumulative state/iu)
  assert.match(scenarios, /failed reconciliation did not roll back every table/iu)
  assert.match(scenarios, /failed terminal reversal did not roll back every table/iu)
  assert.match(scenarios, /terminal reversal retry after rollback did not apply exactly once/iu)
  assert.match(scenarios, /explicit new request did not reapply the full refund exactly once/iu)
  assert.match(scenarios, /external full refund parity failed/iu)
  assert.match(scenarios, /legacy refund clawback was not adopted exactly once/iu)
  assert.match(scenarios, /older refund event redelivery did not preserve its stored result/iu)
  assert.match(scenarios, /SET\s+ROLE\s+service_role[\s\S]*service_role_rpc_ok[\s\S]*RESET\s+ROLE/iu)
  assert.match(scenarios, /UNIFIED_REFUND_SQL_RUNTIME_OK/iu)
})

test('PostgreSQL 17 executes fresh refund migration, durable replay, spent-credit HOLD, and rollback scenarios', async () => {
  const releaseMode = process.env.JIANYUAN_RELEASE_TEST === '1'
  const runtimeEnabled = process.env.REFUND_MIGRATION_PG_RUNTIME === '1'
  if (!runtimeEnabled) {
    assert.equal(releaseMode, false, 'release gate requires REFUND_MIGRATION_PG_RUNTIME=1')
    return
  }

  const bootstrap = readFileSync(
    new URL('./fixtures/referral-refund-points-postgres-bootstrap.sql', import.meta.url),
    'utf8',
  )
  const migration = readFileSync(migrationUrl, 'utf8')
  const scenarios = readFileSync(
    new URL('./fixtures/referral-refund-points-postgres-scenarios.sql', import.meta.url),
    'utf8',
  )
  const container = `jianyuan-refund-pg17-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)
    const version = dockerPsql(container, 'postgres', 'SHOW server_version;')
    assert.equal(version.status, 0, version.stderr)
    assert.match(version.stdout, /\n\s*17\./u)

    const createDb = dockerPsql(container, 'postgres', 'CREATE DATABASE refund_runtime;')
    assert.equal(createDb.status, 0, createDb.stderr)
    const result = dockerPsql(
      container,
      'refund_runtime',
      `${bootstrap}\n${migration}\n${scenarios}`,
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /UNIFIED_REFUND_SQL_RUNTIME_OK/u)

    const receiptQuery = String.raw`
      SELECT state, count(*)
      FROM public.admin_refund_intent
      GROUP BY state
      ORDER BY state;
      SELECT count(*) AS spent_intent_count
      FROM public.admin_refund_intent
      WHERE report_id = '80000000-0000-4000-8000-000000000003';
      SELECT count(*) AS rollback_event_count
      FROM public.stripe_refund_event_ledger
      WHERE event_id = 'evt_rollback_full';
    `
    const receipt = dockerPsql(container, 'refund_runtime', receiptQuery)
    assert.equal(receipt.status, 0, receipt.stderr)
    assert.match(receipt.stdout, /reserved\s*\|\s*1/u)
    assert.match(receipt.stdout, /provider_failed\s*\|\s*1/u)
    assert.match(receipt.stdout, /reconciled\s*\|\s*2/u)
    assert.match(receipt.stdout, /spent_intent_count[\s\S]*?\n\s*0\s*\n/u)
    assert.match(receipt.stdout, /rollback_event_count[\s\S]*?\n\s*1\s*\n/u)

    const replay = dockerPsql(container, 'refund_runtime', migration)
    assert.equal(replay.status, 0, replay.stderr)
    const replayReceipt = dockerPsql(container, 'refund_runtime', receiptQuery)
    assert.equal(replayReceipt.status, 0, replayReceipt.stderr)
    assert.equal(replayReceipt.stdout, receipt.stdout, 'migration replay must preserve runtime ledger state')

    const reconcileSignature = 'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)'
    const expectReplayRejection = (mutation, expectedError, repair) => {
      const mutate = dockerPsql(container, 'refund_runtime', mutation)
      assert.equal(mutate.status, 0, mutate.stderr)
      const rejected = dockerPsql(container, 'refund_runtime', migration)
      assert.notEqual(rejected.status, 0, 'migration replay accepted adversarial schema drift')
      assert.match(rejected.stderr, expectedError)
      const repaired = dockerPsql(container, 'refund_runtime', repair)
      assert.equal(repaired.status, 0, repaired.stderr)
    }

    expectReplayRejection(
      `CREATE ROLE refund_drift_owner NOLOGIN;
       ALTER FUNCTION ${reconcileSignature} OWNER TO refund_drift_owner;`,
      /refund reconciliation function replay preflight failed/u,
      `ALTER FUNCTION ${reconcileSignature} OWNER TO postgres;
       DROP ROLE refund_drift_owner;`,
    )
    expectReplayRejection(
      `ALTER FUNCTION ${reconcileSignature} SECURITY INVOKER;`,
      /refund reconciliation function replay preflight failed/u,
      `ALTER FUNCTION ${reconcileSignature} SECURITY DEFINER;`,
    )
    expectReplayRejection(
      `ALTER FUNCTION ${reconcileSignature} SET search_path = public, pg_catalog;`,
      /refund reconciliation function replay preflight failed/u,
      `ALTER FUNCTION ${reconcileSignature} SET search_path = pg_catalog;`,
    )
    expectReplayRejection(
      `CREATE FUNCTION public.reconcile_stripe_refund_event(text)
       RETURNS void LANGUAGE sql AS 'SELECT';`,
      /refund reconciliation function cohort is partial/u,
      'DROP FUNCTION public.reconcile_stripe_refund_event(text);',
    )
    expectReplayRejection(
      'ALTER TABLE public.stripe_refund_reversal_ledger NO FORCE ROW LEVEL SECURITY;',
      /refund reconciliation table replay preflight failed/u,
      'ALTER TABLE public.stripe_refund_reversal_ledger FORCE ROW LEVEL SECURITY;',
    )
    expectReplayRejection(
      'GRANT SELECT ON TABLE public.stripe_refund_reversal_ledger TO service_role;',
      /refund reconciliation table privilege replay preflight failed/u,
      'REVOKE ALL ON TABLE public.stripe_refund_reversal_ledger FROM service_role;',
    )
    expectReplayRejection(
      `ALTER TABLE public.stripe_refund_reversal_ledger
       DROP CONSTRAINT stripe_refund_reversal_ledger_status_check;`,
      /refund reconciliation schema postcondition failed/u,
      `ALTER TABLE public.stripe_refund_reversal_ledger
       ADD CONSTRAINT stripe_refund_reversal_ledger_status_check
       CHECK (refund_status IN ('failed', 'canceled'));`,
    )

    const finalReplay = dockerPsql(container, 'refund_runtime', migration)
    assert.equal(finalReplay.status, 0, finalReplay.stderr)
    const finalReceipt = dockerPsql(container, 'refund_runtime', receiptQuery)
    assert.equal(finalReceipt.status, 0, finalReceipt.stderr)
    assert.equal(finalReceipt.stdout, receipt.stdout, 'drift rejection and repair changed durable state')
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
