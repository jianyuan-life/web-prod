import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const automaticPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260813050500_lock_postgres_public_default_privileges.sql',
)
const privilegedPath = path.join(
  root,
  'supabase',
  'manual',
  '20260813_lock_supabase_admin_public_default_privileges.sql',
)

function normalizedSql(pathname) {
  return readFileSync(pathname, 'utf8')
    .replace(/--[^\r\n]*/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function assertRoleDefaultsLocked(source, role) {
  for (const objectKind of ['TABLES', 'SEQUENCES']) {
    assert.match(
      source,
      new RegExp(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public REVOKE ALL PRIVILEGES ON ${objectKind} FROM PUBLIC, anon, authenticated`,
        'iu',
      ),
    )
    assert.match(
      source,
      new RegExp(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public GRANT ALL PRIVILEGES ON ${objectKind} TO service_role`,
        'iu',
      ),
    )
  }

  // PostgreSQL's built-in function default grants EXECUTE to PUBLIC globally.
  // A schema-scoped REVOKE only subtracts schema additions and cannot remove
  // that hard-wired global grant, so the PUBLIC revoke must omit IN SCHEMA.
  assert.match(
    source,
    new RegExp(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${role} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`,
      'iu',
    ),
  )
  assert.match(
    source,
    new RegExp(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated`,
      'iu',
    ),
  )
  assert.match(
    source,
    new RegExp(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO service_role`,
      'iu',
    ),
  )
}

test('postgres-owned future public objects default to service-role-only access', () => {
  assert.ok(existsSync(automaticPath), 'missing deployable postgres default-ACL migration')
  const raw = readFileSync(automaticPath, 'utf8')
  const source = normalizedSql(automaticPath)

  assert.match(source, /^BEGIN\b/iu)
  assert.match(source, /\bCOMMIT;?$/iu)
  assertRoleDefaultsLocked(source, 'postgres')
  assert.match(source, /pg_has_role\s*\(\s*current_user\s*,\s*'postgres'\s*,\s*'MEMBER'\s*\)/iu)
  assert.match(source, /pg_default_acl/iu)
  assert.match(source, /aclexplode\s*\(/iu)
  assert.match(source, /defaclnamespace/iu)
  assert.match(source, /defaclrole/iu)
  assert.match(source, /defaclnamespace\s*=\s*0/iu)
  assert.match(source, /acl\.grantee\s*=\s*0/iu)
  assert.match(source, /anon_oid/iu)
  assert.match(source, /authenticated_oid/iu)
  assert.match(source, /service_role_oid/iu)
  assert.match(source, /RAISE EXCEPTION/iu)
  assert.match(raw, /supabase_admin[\s\S]*remaining[\s\S]*blocker/iu)
  assert.doesNotMatch(source, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/iu)
  assert.doesNotMatch(source, /\b(?:ALTER|GRANT)\s+ROLE\b/iu)
})

test('supabase_admin default-ACL repair is prepared but authority-gated outside automatic migrations', () => {
  assert.ok(existsSync(privilegedPath), 'missing authority-gated supabase_admin repair script')
  const source = normalizedSql(privilegedPath)

  assert.match(source, /^BEGIN\b/iu)
  assert.match(source, /\bCOMMIT;?$/iu)
  assertRoleDefaultsLocked(source, 'supabase_admin')
  assert.match(source, /pg_has_role\s*\(\s*current_user\s*,\s*'supabase_admin'\s*,\s*'MEMBER'\s*\)/iu)
  assert.match(source, /pg_default_acl/iu)
  assert.match(source, /aclexplode\s*\(/iu)
  assert.match(source, /RAISE EXCEPTION/iu)
  assert.doesNotMatch(source, /\b(?:ALTER|GRANT)\s+ROLE\b/iu)
})
