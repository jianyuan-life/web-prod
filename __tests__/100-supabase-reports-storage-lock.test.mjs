import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260813050300_lock_reports_storage_writes.sql', import.meta.url),
  'utf8',
)

test('migration creates an idempotent private C/G15 bucket without touching frozen reports', () => {
  assert.match(migration, /^BEGIN;/mu)
  assert.match(migration, /INSERT\s+INTO\s+storage\.buckets/iu)
  assert.match(migration, /'private-reports'/u)
  assert.doesNotMatch(migration, /ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+UPDATE/iu)
  assert.match(migration, /WHERE\s+NOT\s+EXISTS\s*\([\s\S]*?storage\.buckets[\s\S]*?private-reports/iu)
  assert.match(migration, /private-reports bucket already exists with a conflicting contract/iu)
  assert.match(migration, /false,\s*5\s*\*\s*1024\s*\*\s*1024/iu)
  assert.match(migration, /ARRAY\s*\[\s*'application\/pdf'\s*\]/iu)
  assert.doesNotMatch(migration, /UPDATE\s+storage\.buckets[\s\S]{0,500}WHERE\s+id\s*=\s*'reports'/iu)
  assert.doesNotMatch(migration, /DROP\s+POLICY[^;]*Public read access for reports/iu)
  assert.doesNotMatch(migration, /bucket_id\s*=\s*'reports'/iu)
  assert.match(migration, /COMMIT;\s*$/u)
})

test('only service_role may insert or update private-reports and client roles receive a restrictive hard deny', () => {
  for (const [name, command] of [
    ['Service role upload for private reports', 'INSERT'],
    ['Service role update for private reports', 'UPDATE'],
  ]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "${name}"[\\s\\S]*?FOR ${command}[\\s\\S]*?TO service_role[\\s\\S]*?bucket_id = 'private-reports'::text`,
        'iu',
      ),
    )
  }
  assert.match(
    migration,
    /CREATE\s+POLICY\s+"Deny client access to private reports"[\s\S]*?AS\s+RESTRICTIVE[\s\S]*?FOR\s+ALL[\s\S]*?TO\s+anon\s*,\s*authenticated[\s\S]*?bucket_id\s*<>\s*'private-reports'::text/iu,
  )
})

test('transaction postcheck verifies the restrictive catalog bit and still rejects explicit permissive client access', () => {
  assert.match(migration, /DO\s+\$private_reports_storage_postcondition\$/iu)
  assert.match(migration, /bucket\.public\s+IS\s+NOT\s+DISTINCT\s+FROM\s+false/iu)
  assert.match(
    migration,
    /roles::text\[\]\s*&&\s*ARRAY\s*\[\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*\]/iu,
  )
  assert.match(migration, /COALESCE\s*\(\s*policy\.qual\s*,\s*'true'\s*\)/iu)
  assert.match(migration, /COALESCE\s*\(\s*policy\.with_check\s*,\s*'true'\s*\)/iu)
  assert.match(migration, /!~\s*'bucket_id'/iu)
  assert.match(migration, /policy\.permissive\s*=\s*'PERMISSIVE'/iu)
  assert.match(migration, /policy\.permissive\s*=\s*'RESTRICTIVE'/iu)
  assert.match(migration, /catalog_policy\.polpermissive\s+IS\s+NOT\s+DISTINCT\s+FROM\s+false/iu)
  assert.match(migration, /cardinality\s*\(\s*policy\.roles::text\[\]\s*\)\s*=\s*2/iu)
  assert.ok((migration.match(/RAISE\s+EXCEPTION/giu) ?? []).length >= 5)
})

test('migration fails closed unless service_role has the storage.objects table privileges used at runtime', () => {
  assert.match(migration, /DO\s+\$private_reports_storage_acl_preflight\$/iu)
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
    const pattern = new RegExp(
      `has_table_privilege\\(\\s*'service_role'\\s*,\\s*'storage\\.objects'\\s*,\\s*'${privilege}'\\s*\\)`,
      'giu',
    )
    assert.equal((migration.match(pattern) ?? []).length, 2)
  }
  assert.match(migration, /storage\.objects service_role table privileges are missing/iu)
})
