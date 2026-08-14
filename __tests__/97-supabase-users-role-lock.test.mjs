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
  '20260813050000_lock_public_users_role_grants.sql',
)

const knownColumns = ['id', 'email', 'name', 'role', 'created_at']
const sorted = (values) => [...values].sort()

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/--[^\r\n]*/gu, '')
}

function splitSqlStatements(source) {
  const statements = []
  let current = ''
  let inSingleQuote = false
  let dollarTag = null

  for (let index = 0; index < source.length; index += 1) {
    const rest = source.slice(index)

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag
        index += dollarTag.length - 1
        dollarTag = null
      } else {
        current += source[index]
      }
      continue
    }

    if (!inSingleQuote && source[index] === '$') {
      const tag = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u)?.[0]
      if (tag) {
        dollarTag = tag
        current += tag
        index += tag.length - 1
        continue
      }
    }

    if (source[index] === "'") {
      current += source[index]
      if (inSingleQuote && source[index + 1] === "'") {
        current += source[index + 1]
        index += 1
      } else {
        inSingleQuote = !inSingleQuote
      }
      continue
    }

    if (!inSingleQuote && source[index] === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      continue
    }

    current += source[index]
  }

  if (current.trim()) statements.push(current.trim())
  return statements
}

function splitTopLevelCommaList(source) {
  const parts = []
  let depth = 0
  let current = ''

  for (const character of source) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function canonicalIdentifier(identifier) {
  return identifier.replaceAll('"', '').trim().toLowerCase()
}

function parsePrivilegeStatement(statement, index) {
  const compact = statement.replace(/\s+/gu, ' ').trim()
  const match = compact.match(
    /^(REVOKE|GRANT)\s+(.+?)\s+ON\s+(?:TABLE\s+)?([^\s]+)\s+(FROM|TO)\s+(.+)$/iu,
  )
  if (!match) return null

  const specs = splitTopLevelCommaList(match[2]).map((part) => {
    const spec = part.match(/^([A-Z]+)(?:\s*\(([^)]+)\))?$/iu)
    assert.ok(spec, `unparseable privilege spec: ${part}`)
    return {
      privilege: spec[1].toUpperCase(),
      columns: spec[2]
        ? sorted(spec[2].split(',').map(canonicalIdentifier))
        : null,
    }
  })

  return {
    index,
    action: match[1].toUpperCase(),
    specs,
    table: canonicalIdentifier(match[3]),
    direction: match[4].toUpperCase(),
    roles: sorted(match[5].split(',').map(canonicalIdentifier)),
  }
}

function privilegeMap(statement) {
  return Object.fromEntries(
    statement.specs.map(({ privilege, columns }) => [privilege, columns]),
  )
}

function normalizeOwnRowExpression(expression) {
  return expression?.toLowerCase().replace(/[\s()]/gu, '') ?? null
}

function policyAppliesToAuthenticated(policy) {
  return policy.roles.includes('public') || policy.roles.includes('authenticated')
}

function acceptsInsertPolicy(policy, allowedExpressions) {
  return ['a', '*'].includes(policy.command)
    && policyAppliesToAuthenticated(policy)
    && allowedExpressions.has(normalizeOwnRowExpression(policy.polwithcheck))
}

function acceptsUpdatePolicy(policy, allowedExpressions) {
  const effectiveWithCheck = policy.polwithcheck ?? policy.polqual
  return ['w', '*'].includes(policy.command)
    && policyAppliesToAuthenticated(policy)
    && allowedExpressions.has(normalizeOwnRowExpression(policy.polqual))
    && allowedExpressions.has(normalizeOwnRowExpression(effectiveWithCheck))
}

test('public.users exposes only the authenticated self-service write columns and proves the live guards', () => {
  assert.ok(
    existsSync(migrationPath),
    'missing least-privilege migration for public.users',
  )

  const source = readFileSync(migrationPath, 'utf8')
  const executable = stripSqlComments(source)
  const statements = splitSqlStatements(executable)
  const privilegeStatements = statements
    .map(parsePrivilegeStatement)
    .filter(Boolean)

  assert.equal(privilegeStatements.length, 4, 'expected two revokes and two grants only')
  assert.ok(privilegeStatements.every(({ table }) => table === 'public.users'))

  const revokes = privilegeStatements.filter(({ action }) => action === 'REVOKE')
  const grants = privilegeStatements.filter(({ action }) => action === 'GRANT')
  assert.equal(revokes.length, 2)
  assert.equal(grants.length, 2)

  const tableRevoke = revokes.find(({ specs }) => specs.every(({ columns }) => columns === null))
  const columnRevoke = revokes.find(({ specs }) => specs.every(({ columns }) => columns !== null))
  assert.ok(tableRevoke, 'table-level INSERT/UPDATE revoke is required')
  assert.ok(columnRevoke, 'column-level INSERT/UPDATE revoke is required')
  assert.deepEqual(privilegeMap(tableRevoke), { INSERT: null, UPDATE: null })
  assert.deepEqual(tableRevoke.roles, ['anon', 'authenticated', 'public'])
  assert.equal(tableRevoke.direction, 'FROM')
  assert.deepEqual(privilegeMap(columnRevoke), {
    INSERT: sorted(knownColumns),
    UPDATE: sorted(knownColumns),
  })
  assert.deepEqual(columnRevoke.roles, ['anon', 'authenticated', 'public'])
  assert.equal(columnRevoke.direction, 'FROM')

  const insertGrant = grants.find(({ specs }) => specs.some(({ privilege }) => privilege === 'INSERT'))
  const updateGrant = grants.find(({ specs }) => specs.some(({ privilege }) => privilege === 'UPDATE'))
  assert.ok(insertGrant)
  assert.ok(updateGrant)
  assert.deepEqual(privilegeMap(insertGrant), { INSERT: ['email', 'id', 'name'] })
  assert.deepEqual(privilegeMap(updateGrant), { UPDATE: ['email', 'name'] })
  for (const grant of grants) {
    assert.deepEqual(grant.roles, ['authenticated'])
    assert.equal(grant.direction, 'TO')
  }
  assert.ok(tableRevoke.index < columnRevoke.index, 'table grants must be revoked first')
  assert.ok(columnRevoke.index < Math.min(insertGrant.index, updateGrant.index), 'all drift must be cleared before granting')

  assert.doesNotMatch(executable, /\bALTER\s+TABLE\b/iu, 'must not change the users schema')
  assert.doesNotMatch(executable, /\b(?:SET|DROP)\s+DEFAULT\b/iu, 'must not change column defaults')
  assert.doesNotMatch(executable, /\b(?:CREATE|ALTER)\s+POLICY\b/iu, 'must preserve existing policy definitions')
  assert.equal(statements[0].toUpperCase(), 'BEGIN')
  assert.equal(statements.at(-1).toUpperCase(), 'COMMIT')

  const postcondition = statements.find((statement) => /^DO\s+\$/iu.test(statement))
  assert.ok(postcondition, 'missing fail-closed postcondition block')
  assert.match(postcondition, /\bhas_table_privilege\s*\(/iu)
  assert.match(postcondition, /\bhas_column_privilege\s*\(/iu)
  assert.match(postcondition, /\brelrowsecurity\b/iu)
  assert.match(postcondition, /\bpg_policy\b/iu)
  assert.match(postcondition, /\bpg_get_expr\s*\(/iu)
  assert.match(postcondition, /\bpolwithcheck\b/iu)
  assert.match(postcondition, /polcmd\s+IN\s*\(\s*'a'\s*,\s*'\*'\s*\)/iu)
  assert.match(postcondition, /polcmd\s+IN\s*\(\s*'w'\s*,\s*'\*'\s*\)/iu)
  assert.doesNotMatch(postcondition, /\b(?:polname|policyname)\b/iu, 'must not depend on policy names')

  const expressionDeclaration = postcondition.match(
    /own_row_expressions\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]::text\[\]/iu,
  )
  assert.ok(expressionDeclaration, 'missing exact own-row expression allowlist')
  const allowedOwnRowExpressions = new Set(
    [...expressionDeclaration[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]),
  )
  assert.deepEqual(
    sorted(allowedOwnRowExpressions),
    ['auth.uid=id', 'id=auth.uid'],
    'only the two commutative own-row equalities may pass',
  )

  const liveInsertPolicy = {
    command: 'a',
    roles: ['public'],
    polqual: null,
    polwithcheck: '(auth.uid() = id)',
  }
  const liveUpdatePolicy = {
    command: 'w',
    roles: ['authenticated'],
    polqual: '(auth.uid() = id)',
    polwithcheck: null,
  }
  assert.equal(acceptsInsertPolicy(liveInsertPolicy, allowedOwnRowExpressions), true)
  assert.equal(
    acceptsUpdatePolicy(liveUpdatePolicy, allowedOwnRowExpressions),
    true,
    'UPDATE must use polqual as the effective WITH CHECK when polwithcheck is null',
  )
  assert.equal(acceptsInsertPolicy({
    ...liveInsertPolicy,
    polwithcheck: '(id = auth.uid())',
  }, allowedOwnRowExpressions), true)

  const unsafePolicies = [
    {
      kind: 'insert OR bypass',
      accepted: acceptsInsertPolicy({
        ...liveInsertPolicy,
        polwithcheck: '(auth.uid() = id OR true)',
      }, allowedOwnRowExpressions),
    },
    {
      kind: 'UPDATE USING has an extra clause',
      accepted: acceptsUpdatePolicy({
        ...liveUpdatePolicy,
        polqual: "(auth.uid() = id OR role = 'advisor')",
      }, allowedOwnRowExpressions),
    },
    {
      kind: 'explicit UPDATE WITH CHECK has an extra clause',
      accepted: acceptsUpdatePolicy({
        ...liveUpdatePolicy,
        polwithcheck: "(auth.uid() = id AND role = 'advisor')",
      }, allowedOwnRowExpressions),
    },
    {
      kind: 'policy does not apply to authenticated',
      accepted: acceptsUpdatePolicy({
        ...liveUpdatePolicy,
        roles: ['anon'],
      }, allowedOwnRowExpressions),
    },
  ]
  for (const fixture of unsafePolicies) {
    assert.equal(fixture.accepted, false, fixture.kind)
  }

  assert.equal(
    (postcondition.match(/=\s*ANY\s*\(\s*own_row_expressions\s*\)/giu) ?? []).length,
    3,
    'INSERT CHECK, UPDATE USING, and effective UPDATE CHECK must each be exact',
  )
  assert.match(
    postcondition,
    /policy\.polcmd\s+IN\s*\(\s*'w'\s*,\s*'\*'\s*\)[\s\S]*?policy\.polqual\s+IS\s+NOT\s+NULL[\s\S]*?pg_get_expr\s*\(\s*policy\.polqual\s*,\s*policy\.polrelid\s*\)[\s\S]*?=\s*ANY\s*\(\s*own_row_expressions\s*\)[\s\S]*?COALESCE\s*\(\s*pg_get_expr\s*\(\s*policy\.polwithcheck\s*,\s*policy\.polrelid\s*\)\s*,\s*pg_get_expr\s*\(\s*policy\.polqual\s*,\s*policy\.polrelid\s*\)\s*\)[\s\S]*?=\s*ANY\s*\(\s*own_row_expressions\s*\)/iu,
    'UPDATE must independently verify USING and explicit-or-fallback WITH CHECK',
  )

  const expectedMatrix = new Map()
  for (const column of knownColumns) expectedMatrix.set(`anon.${column}`, 'false,false')
  expectedMatrix.set('authenticated.id', 'true,false')
  expectedMatrix.set('authenticated.email', 'true,true')
  expectedMatrix.set('authenticated.name', 'true,true')
  expectedMatrix.set('authenticated.role', 'false,false')
  expectedMatrix.set('authenticated.created_at', 'false,false')

  const actualMatrix = new Map(
    [...postcondition.matchAll(
      /\(\s*'(anon|authenticated)'\s*,\s*'(id|email|name|role|created_at)'\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/giu,
    )].map((match) => [`${match[1].toLowerCase()}.${match[2].toLowerCase()}`, `${match[3].toLowerCase()},${match[4].toLowerCase()}`]),
  )
  assert.deepEqual(actualMatrix, expectedMatrix, 'postcondition must verify the complete effective column matrix')

  // PUBLIC is PostgreSQL's pseudo-role, not a pg_roles row. Its table and
  // column ACLs therefore must be checked through catalog grantee OID 0.
  assert.match(postcondition, /\baclexplode\s*\(/iu)
  assert.match(postcondition, /\brelacl\b/iu)
  assert.match(postcondition, /\battacl\b/iu)
  assert.match(postcondition, /\.grantee\s*=\s*0\b/iu)
  assert.match(postcondition, /privilege_type\s+IN\s*\(\s*'INSERT'\s*,\s*'UPDATE'\s*\)/iu)
  assert.match(postcondition, /\bRAISE\s+EXCEPTION\b/iu)
})
