import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260813050400_lock_privacy_event_tables.sql',
)

const expectedTables = [
  'user_analytics',
  'email_unsubscribes',
  'free_tool_usage',
  'visitor_events',
].sort()

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/--[^\r\n]*/gu, '')
}

function maskSingleQuotedSqlStrings(source) {
  let masked = ''
  let inString = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === "'") {
      masked += ' '
      if (inString && source[index + 1] === "'") {
        masked += ' '
        index += 1
      } else {
        inString = !inString
      }
    } else if (inString) {
      masked += character === '\n' || character === '\r' ? character : ' '
    } else {
      masked += character
    }
  }

  assert.equal(inString, false, 'migration contains an unterminated SQL string')
  return masked
}

test('privacy event lock names the complete four-table boundary', () => {
  assert.ok(existsSync(migrationPath), 'missing privacy-event lock migration')

  const source = readFileSync(migrationPath, 'utf8')
  const declaration = source.match(
    /target_tables\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]::text\[\]/iu,
  )
  assert.ok(declaration, 'migration must declare one canonical target table array')

  const actualTables = [...declaration[1].matchAll(/'([^']+)'/gu)]
    .map((match) => match[1])
    .sort()
  assert.deepEqual(actualTables, expectedTables)
})

test('privacy event lock is transactional and removes every policy behind non-forced RLS', () => {
  const executable = stripSqlComments(readFileSync(migrationPath, 'utf8')).trim()

  assert.match(executable, /^BEGIN\s*;/iu)
  assert.match(executable, /COMMIT\s*;$/iu)
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.match(
      executable,
      new RegExp(`(?:pg_catalog\\.)?to_regrole\\(\\s*'${role}'\\s*\\)`, 'iu'),
      `preflight must require ${role}`,
    )
  }

  assert.match(executable, /FOREACH\s+target_table\s+IN\s+ARRAY\s+target_tables/iu)
  assert.match(
    executable,
    /ALTER\s+TABLE\s+public\.%I\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu,
  )
  assert.match(
    executable,
    /ALTER\s+TABLE\s+public\.%I\s+NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/iu,
  )
  assert.equal(
    (executable.match(/(?<!NO\s)FORCE\s+ROW\s+LEVEL\s+SECURITY/giu) ?? []).length,
    0,
    'the tables must never be put into FORCE ROW LEVEL SECURITY mode',
  )

  assert.match(executable, /FROM\s+pg_catalog\.pg_policy/iu)
  assert.match(executable, /polrelid\s*=\s*relation_oid/iu)
  assert.match(
    executable,
    /DROP\s+POLICY\s+%I\s+ON\s+public\.%I/iu,
    'policy names must be discovered from pg_policy, not hard-coded',
  )
  assert.doesNotMatch(executable, /\b(?:CREATE|ALTER)\s+POLICY\b/iu)
})

test('privacy event lock clears table and column grants before granting service_role all table rights', () => {
  const executable = stripSqlComments(readFileSync(migrationPath, 'utf8'))
  const compact = executable.replace(/\s+/gu, ' ')

  assert.match(compact, /FROM pg_catalog\.pg_attribute AS attribute/iu)
  assert.match(compact, /attribute\.attrelid\s*=\s*relation_oid/iu)
  assert.match(compact, /attribute\.attnum\s*>\s*0/iu)
  assert.match(compact, /NOT\s+attribute\.attisdropped/iu)
  assert.match(compact, /string_agg\s*\(/iu)

  const tableRevoke = compact.match(
    /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated/iu,
  )
  const columnRevoke = compact.match(
    /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.%I FROM PUBLIC, anon, authenticated/iu,
  )
  const serviceGrant = compact.match(
    /GRANT ALL PRIVILEGES ON TABLE public\.%I TO service_role/iu,
  )
  assert.ok(tableRevoke, 'missing complete table ACL revoke')
  assert.ok(columnRevoke, 'missing complete dynamic column ACL revoke')
  assert.ok(serviceGrant, 'missing service_role ALL table grant')
  assert.ok(tableRevoke.index < columnRevoke.index)
  assert.ok(columnRevoke.index < serviceGrant.index)

  assert.doesNotMatch(
    compact,
    /GRANT\s+[^;']*\s+TO\s+(?:PUBLIC|anon|authenticated)\b/iu,
    'privacy tables must never grant a client role any privilege',
  )
})

test('privacy event lock secures only discovered serial or identity backing sequences and tolerates none', () => {
  const executable = stripSqlComments(readFileSync(migrationPath, 'utf8'))
  const compact = executable.replace(/\s+/gu, ' ')

  assert.match(compact, /pg_catalog\.pg_get_serial_sequence\s*\(/iu)
  assert.match(compact, /relation\.relname\s*=\s*ANY\s*\(\s*target_tables\s*\)/iu)
  assert.match(compact, /sequence_relation\.relkind\s*=\s*'S'/iu)
  assert.match(compact, /FOR\s+backing_sequence\s+IN\s+SELECT\s+DISTINCT/iu)
  assert.match(
    compact,
    /REVOKE ALL PRIVILEGES ON SEQUENCE %I\.%I FROM PUBLIC, anon, authenticated/iu,
  )
  assert.match(
    compact,
    /GRANT USAGE, SELECT ON SEQUENCE %I\.%I TO service_role/iu,
  )
  assert.doesNotMatch(
    compact,
    /(?:nextval|setval)\s*\(/iu,
    'ACL migration must never advance or rewrite sequence state',
  )
  assert.doesNotMatch(
    compact,
    /backing_sequence[^;]*IS\s+NULL[^;]*RAISE/iu,
    'tables without an owned serial or identity sequence are valid',
  )
})

test('privacy event lock fails closed on every live table, column, policy, role, and sequence postcondition', () => {
  const executable = stripSqlComments(readFileSync(migrationPath, 'utf8'))
  const postcondition = executable.match(
    /DO\s+\$privacy_event_tables_postcondition\$([\s\S]+?)\$privacy_event_tables_postcondition\$\s*;/iu,
  )?.[1]
  assert.ok(postcondition, 'missing named fail-closed postcondition block')
  const compact = postcondition.replace(/\s+/gu, ' ')

  const targetDeclarations = [...executable.matchAll(
    /target_tables\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]::text\[\]/giu,
  )]
  assert.equal(targetDeclarations.length, 2, 'mutation and postcondition must each bind the exact target set')
  for (const declaration of targetDeclarations) {
    const tables = [...declaration[1].matchAll(/'([^']+)'/gu)]
      .map((match) => match[1])
      .sort()
    assert.deepEqual(tables, expectedTables)
  }

  assert.match(compact, /FROM pg_catalog\.pg_roles/iu)
  assert.match(compact, /rolbypassrls/iu)
  assert.match(
    compact,
    /IF\s+service_role_bypasses_rls\s+IS\s+DISTINCT\s+FROM\s+true\s+THEN\s+RAISE\s+EXCEPTION/iu,
    'service_role BYPASSRLS=false must roll the migration back',
  )

  assert.match(compact, /relation\.relrowsecurity/iu)
  assert.match(compact, /relation\.relforcerowsecurity/iu)
  assert.match(
    compact,
    /IF\s+NOT\s+rls_enabled\s+OR\s+rls_forced\s+THEN\s+RAISE\s+EXCEPTION/iu,
  )
  assert.match(
    compact,
    /IF\s+EXISTS\s*\([^)]*FROM\s+pg_catalog\.pg_policy[\s\S]*?polrelid\s*=\s*relation_oid[\s\S]*?\)\s+THEN\s+RAISE\s+EXCEPTION/iu,
    'any surviving policy must fail closed',
  )

  assert.match(compact, /pg_catalog\.aclexplode\s*\(/iu)
  for (const aclType of ['r', 'c', 's']) {
    assert.match(
      compact,
      new RegExp(`pg_catalog\\.acldefault\\(\\s*'${aclType}'`, 'iu'),
      `postcondition must inspect ${aclType} ACL defaults safely`,
    )
  }
  assert.match(compact, /acl\.grantee\s*=\s*0/iu, 'PUBLIC must be checked by ACL grantee OID 0')

  assert.match(compact, /pg_catalog\.has_table_privilege\s*\(/iu)
  assert.match(compact, /pg_catalog\.has_column_privilege\s*\(/iu)
  assert.match(compact, /pg_catalog\.has_sequence_privilege\s*\(/iu)
  assert.match(compact, /ARRAY\[\s*anon_oid\s*,\s*authenticated_oid\s*\]/iu)

  const clientColumnLoop = compact.match(
    /FOREACH\s+checked_privilege\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]::text\[\]\s+LOOP\s+IF\s+pg_catalog\.has_column_privilege/iu,
  )
  assert.ok(clientColumnLoop, 'client column postcondition must bind its complete privilege set')
  assert.deepEqual(
    [...clientColumnLoop[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]),
    ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
  )
  assert.match(
    compact,
    /pg_catalog\.has_column_privilege\s*\(\s*checked_role_oid\s*,\s*relation_oid\s*,\s*target_attribute\.attnum\s*,\s*checked_privilege\s*\)\s+THEN\s+RAISE\s+EXCEPTION/iu,
  )

  const clientSequenceLoop = compact.match(
    /FOREACH\s+checked_privilege\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]::text\[\]\s+LOOP\s+IF\s+pg_catalog\.has_sequence_privilege\s*\(\s*checked_role_oid/iu,
  )
  assert.ok(clientSequenceLoop, 'client sequence postcondition must bind its complete privilege set')
  assert.deepEqual(
    [...clientSequenceLoop[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]),
    ['USAGE', 'SELECT', 'UPDATE'],
  )
  assert.match(
    compact,
    /pg_catalog\.has_sequence_privilege\s*\(\s*checked_role_oid\s*,\s*backing_sequence\.sequence_oid\s*,\s*checked_privilege\s*\)\s+THEN\s+RAISE\s+EXCEPTION/iu,
  )

  assert.equal(
    (compact.match(/acl\.grantee\s*=\s*0/giu) ?? []).length,
    3,
    'PUBLIC must be denied independently on table, column, and sequence ACLs',
  )
  assert.match(
    compact,
    /pg_catalog\.acldefault\s*\(\s*'r'\s*,\s*relation_owner\s*\)[\s\S]*?AS\s+acl\s+WHERE\s+acl\.grantee\s*=\s*0[\s\S]*?PUBLIC retains a table privilege/iu,
  )
  assert.match(
    compact,
    /pg_catalog\.acldefault\s*\(\s*'c'\s*,\s*relation_owner\s*\)[\s\S]*?AS\s+acl\s+WHERE\s+acl\.grantee\s*=\s*0[\s\S]*?PUBLIC retains a column privilege/iu,
  )
  assert.match(
    compact,
    /pg_catalog\.acldefault\s*\(\s*'s'\s*,\s*backing_sequence\.sequence_owner\s*\)[\s\S]*?AS\s+acl\s+WHERE\s+acl\.grantee\s*=\s*0[\s\S]*?PUBLIC retains a privilege on sequence/iu,
  )
  assert.equal(
    (compact.match(
      /FOR\s+checked_privilege\s+IN\s+SELECT\s+DISTINCT\s+acl\.privilege_type\s+FROM\s+pg_catalog\.aclexplode\s*\(\s*pg_catalog\.acldefault\s*\(\s*'r'\s*,\s*relation_owner\s*\)\s*\)\s+AS\s+acl\s+WHERE\s+acl\.grantee\s*=\s*relation_owner/giu,
    ) ?? []).length,
    2,
    'client denial and service ALL checks must derive every server-supported table privilege from pg_catalog',
  )
  assert.match(
    compact,
    /FOREACH\s+checked_role_oid\s+IN\s+ARRAY\s+ARRAY\[\s*anon_oid\s*,\s*authenticated_oid\s*\][\s\S]*?FOR\s+checked_privilege\s+IN\s+SELECT\s+DISTINCT\s+acl\.privilege_type[\s\S]*?IF\s+pg_catalog\.has_table_privilege\s*\(\s*checked_role_oid\s*,\s*relation_oid\s*,\s*checked_privilege\s*\)\s+THEN\s+RAISE\s+EXCEPTION/iu,
    'client table checks must test each client role and every supported table privilege',
  )
  assert.match(
    compact,
    /IF\s+NOT\s+pg_catalog\.has_table_privilege\s*\(\s*service_role_oid/iu,
    'service_role must effectively hold every table privilege supported by the server',
  )
  assert.match(
    compact,
    /IF\s+NOT\s+pg_catalog\.has_sequence_privilege\s*\(\s*service_role_oid[\s\S]*?'USAGE'/iu,
  )
  assert.match(
    compact,
    /IF\s+NOT\s+pg_catalog\.has_sequence_privilege\s*\(\s*service_role_oid[\s\S]*?'SELECT'/iu,
  )
})

test('privacy event lock is repeatable and changes no rows, defaults, ownership, or schema-wide privileges', () => {
  const executable = stripSqlComments(readFileSync(migrationPath, 'utf8'))
  const outsideStrings = maskSingleQuotedSqlStrings(executable)

  assert.doesNotMatch(
    outsideStrings,
    /\b(?:INSERT\s+INTO|UPDATE(?:\s+ONLY)?\s+[A-Za-z_"]|DELETE\s+FROM|TRUNCATE)\b/iu,
    'the ACL lock must not mutate application rows',
  )
  const dynamicTemplates = [...executable.matchAll(
    /pg_catalog\.format\s*\(\s*'((?:''|[^'])*)'/giu,
  )].map((match) => match[1].replaceAll("''", "'").trim())
  assert.ok(dynamicTemplates.length > 0)
  for (const template of dynamicTemplates) {
    assert.doesNotMatch(
      template,
      /^(?:INSERT\s+INTO|UPDATE\b|DELETE\s+FROM|TRUNCATE\b)/iu,
      `dynamic SQL must not mutate application rows: ${template}`,
    )
  }
  assert.doesNotMatch(
    executable,
    /\b(?:CREATE|DROP)\s+(?:TABLE|SEQUENCE)\b/iu,
    'the ACL lock must preserve tables and backing sequences',
  )
  assert.doesNotMatch(executable, /\bALTER\s+DEFAULT\s+PRIVILEGES\b/iu)
  assert.doesNotMatch(executable, /\bOWNER\s+TO\b/iu)
  assert.doesNotMatch(executable, /\bSET\s+DEFAULT\b|\bDROP\s+DEFAULT\b/iu)
  assert.doesNotMatch(executable, /\bON\s+ALL\s+(?:TABLES|SEQUENCES)\s+IN\s+SCHEMA\b/iu)

  assert.match(
    executable,
    /FOR\s+existing_policy\s+IN\s+SELECT\s+policy\.polname[\s\S]*?WHERE\s+policy\.polrelid\s*=\s*relation_oid[\s\S]*?LOOP[\s\S]*?DROP\s+POLICY\s+%I\s+ON\s+public\.%I/iu,
    'a second run must never drop a policy that no longer exists',
  )
})
