import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const adminMigration = readFileSync(
  new URL('../supabase/migrations/20260813050100_lock_admin_rpc_execute.sql', import.meta.url),
  'utf8',
)
const storageMigration = readFileSync(
  new URL('../supabase/migrations/20260813050300_lock_reports_storage_writes.sql', import.meta.url),
  'utf8',
)

const roleBootstrap = String.raw`
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
`

const adminBootstrap = String.raw`
${roleBootstrap}
CREATE OR REPLACE FUNCTION public.admin_dashboard_snapshot(
  start_today timestamp with time zone,
  start_yesterday timestamp with time zone,
  end_ts timestamp with time zone DEFAULT now()
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_funnel_analysis(
  since_ts timestamp with time zone,
  end_ts timestamp with time zone DEFAULT now()
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_visitor_stats(
  start_date timestamp with time zone,
  end_date timestamp with time zone DEFAULT now()
) RETURNS TABLE(bucket text, key text, sessions bigint, pageviews bigint, is_bot boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT NULL::text, NULL::text, 0::bigint, 0::bigint, false WHERE false $$;
`

const storageBootstrap = String.raw`
${roleBootstrap}
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO service_role, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON storage.objects TO service_role;
`

function dockerPsql(container, database, input) {
  return spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8' },
  )
}

function createDatabase(container, database) {
  const result = dockerPsql(container, 'postgres', `CREATE DATABASE ${database};`)
  assert.equal(result.status, 0, result.stderr)
}

function assertSqlOk(container, database, input) {
  const result = dockerPsql(container, database, input)
  assert.equal(result.status, 0, result.stderr)
  return result
}

function assertSqlFails(container, database, input, pattern) {
  const result = dockerPsql(container, database, input)
  assert.notEqual(result.status, 0, 'SQL unexpectedly succeeded')
  assert.match(result.stderr, pattern)
  return result
}

async function waitForPostgres(container) {
  let consecutiveReady = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = dockerPsql(container, 'postgres', 'SELECT 1;')
    consecutiveReady = probe.status === 0 ? consecutiveReady + 1 : 0
    if (consecutiveReady >= 2) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail('PostgreSQL container did not become ready')
}

test('security migrations prove clean replay and reject catalog drift on PostgreSQL 17', async () => {
  if (process.env.SECURITY_MIGRATION_PG_RUNTIME !== '1') {
    assert.match(adminMigration, /admin RPC security attributes drifted/u)
    assert.match(storageMigration, /storage\.objects service_role table privileges are missing/u)
    return
  }

  const container = `jianyuan-security-migrations-${process.pid}`
  const started = spawnSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=synthetic-test-only', 'postgres:17',
  ], { encoding: 'utf8' })
  assert.equal(started.status, 0, started.stderr)

  try {
    await waitForPostgres(container)

    createDatabase(container, 'admin_clean')
    assertSqlOk(container, 'admin_clean', `${adminBootstrap}\n${adminMigration}`)
    assertSqlOk(container, 'admin_clean', adminMigration)
    const adminReceipt = assertSqlOk(container, 'admin_clean', String.raw`
      DO $verify$ DECLARE target oid; BEGIN
        FOREACH target IN ARRAY ARRAY[
          'public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone)'::regprocedure::oid,
          'public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone)'::regprocedure::oid,
          'public.admin_visitor_stats(timestamp with time zone,timestamp with time zone)'::regprocedure::oid
        ] LOOP
          IF NOT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE oid = target AND proowner = current_user::regrole AND prosecdef
              AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[]
          ) OR has_function_privilege('anon', target, 'EXECUTE')
             OR has_function_privilege('authenticated', target, 'EXECUTE')
             OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
            RAISE EXCEPTION 'admin RPC runtime contract mismatch';
          END IF;
        END LOOP;
      END $verify$;
      SELECT 'ADMIN_MIGRATION_PG_OK';
    `)
    assert.match(adminReceipt.stdout, /ADMIN_MIGRATION_PG_OK/u)

    for (const [database, driftSql] of [
      ['admin_invoker', 'ALTER FUNCTION public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone) SECURITY INVOKER;'],
      ['admin_path', "ALTER FUNCTION public.admin_visitor_stats(timestamp with time zone,timestamp with time zone) SET search_path = public, pg_temp;"],
      ['admin_owner', "CREATE ROLE drift_owner NOLOGIN; ALTER FUNCTION public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone) OWNER TO drift_owner;"],
    ]) {
      createDatabase(container, database)
      assertSqlOk(container, database, `${adminBootstrap}\n${driftSql}`)
      assertSqlFails(container, database, adminMigration, /admin RPC security attributes drifted/u)
      const rollback = assertSqlOk(container, database, String.raw`
        SELECT count(*) AS public_execute_count
        FROM pg_proc AS routine
        CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS acl
        WHERE routine.proname LIKE 'admin_%'
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE';
      `)
      assert.match(rollback.stdout, /\n\s*3\s*\n/u, `${database} did not roll back before ACL mutation`)
    }

    createDatabase(container, 'storage_clean')
    assertSqlOk(container, 'storage_clean', `${storageBootstrap}\n${storageMigration}`)
    assertSqlOk(container, 'storage_clean', storageMigration)
    const storageReceipt = assertSqlOk(container, 'storage_clean', String.raw`
      DO $verify$ BEGIN
        IF NOT has_table_privilege('service_role', 'storage.objects', 'SELECT')
          OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
          OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE')
          OR NOT EXISTS (
            SELECT 1 FROM storage.buckets
            WHERE id = 'private-reports' AND NOT public
              AND file_size_limit = 5 * 1024 * 1024
              AND allowed_mime_types = ARRAY['application/pdf']::text[]
          ) THEN
          RAISE EXCEPTION 'storage runtime contract mismatch';
        END IF;
      END $verify$;
      SELECT 'STORAGE_MIGRATION_PG_OK';
    `)
    assert.match(storageReceipt.stdout, /STORAGE_MIGRATION_PG_OK/u)

    createDatabase(container, 'storage_acl_drift')
    assertSqlOk(container, 'storage_acl_drift', `${storageBootstrap}\nREVOKE UPDATE ON storage.objects FROM service_role;`)
    assertSqlFails(container, 'storage_acl_drift', storageMigration, /storage\.objects service_role table privileges are missing/u)
    const noMutation = assertSqlOk(container, 'storage_acl_drift', String.raw`
      SELECT count(*) FROM storage.buckets WHERE id = 'private-reports';
      SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
    `)
    assert.match(noMutation.stdout, /\n\s*0\s*\n[\s\S]*\n\s*0\s*\n/u)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
