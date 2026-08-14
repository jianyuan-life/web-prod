import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260813050100_lock_admin_rpc_execute.sql',
)

const rpcTargets = [
  {
    oidVariable: 'dashboard_snapshot_oid',
    signature: 'public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone)',
  },
  {
    oidVariable: 'funnel_analysis_oid',
    signature: 'public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone)',
  },
  {
    oidVariable: 'visitor_stats_oid',
    signature: 'public.admin_visitor_stats(timestamp with time zone,timestamp with time zone)',
  },
]

const sorted = (values) => [...values].sort()
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const rpcNames = rpcTargets.map(({ signature }) => signature.match(/\.([^(]+)/u)[1])
const rpcNamePattern = rpcNames.map(escapeRegExp).join('|')
const runtimeExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.py',
  '.ts',
  '.tsx',
])
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.swc',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'node_modules',
])

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

function canonicalSignature(signature) {
  return signature
    .replaceAll('"', '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*\(\s*/gu, '(')
    .replace(/\s*,\s*/gu, ',')
    .replace(/\s*\)\s*/gu, ')')
    .trim()
    .toLowerCase()
}

function parseAclStatement(statement) {
  const compact = statement.replace(/\s+/gu, ' ').trim()
  const match = compact.match(
    /^(REVOKE|GRANT)\s+EXECUTE\s+ON\s+FUNCTION\s+(.+?)\s+(FROM|TO)\s+(.+)$/iu,
  )
  if (!match) return null

  return {
    action: match[1].toUpperCase(),
    signature: canonicalSignature(match[2]),
    direction: match[3].toUpperCase(),
    roles: sorted(match[4].split(',').map((role) => role.trim().toLowerCase())),
  }
}

function listRuntimeSources(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...listRuntimeSources(path.join(directory, entry.name)))
      }
      continue
    }

    if (entry.isFile() && runtimeExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(directory, entry.name))
    }
  }
  return files
}

function findDirectRpcCalls(source) {
  const calls = []
  const jsClientCall = new RegExp(
    "\\b([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\.\\s*rpc\\s*\\(\\s*(['\"`])(" + rpcNamePattern + ')\\2',
    'gu',
  )
  const postgrestCall = new RegExp(
    "(?:/rest/v1)?/rpc/(" + rpcNamePattern + ")(?=[?/'\"`\\s)]|$)",
    'gu',
  )

  for (const match of source.matchAll(jsClientCall)) {
    calls.push({
      kind: 'supabase-js',
      receiver: match[1],
      name: match[3],
      index: match.index,
    })
  }
  for (const match of source.matchAll(postgrestCall)) {
    calls.push({
      kind: 'postgrest-url',
      receiver: null,
      name: match[1],
      index: match.index,
    })
  }
  return calls
}

function lineAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length
}

function lastCallBefore(source, functionName, beforeIndex) {
  const pattern = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(`, 'gu')
  let lastIndex = -1
  for (const match of source.matchAll(pattern)) {
    if (match.index >= beforeIndex) break
    lastIndex = match.index
  }
  return lastIndex
}

test('admin SECURITY DEFINER RPCs are locked to service_role in one fail-closed transaction', () => {
  assert.ok(
    existsSync(migrationPath),
    'missing migration that removes public admin RPC execution',
  )

  const source = readFileSync(migrationPath, 'utf8')
  const executable = stripSqlComments(source)
  const statements = splitSqlStatements(executable)

  assert.equal(statements[0].toUpperCase(), 'BEGIN')
  assert.equal(statements.at(-1).toUpperCase(), 'COMMIT')
  assert.equal(
    statements.filter((statement) => statement.toUpperCase() === 'BEGIN').length,
    1,
    'migration must open exactly one transaction',
  )
  assert.equal(
    statements.filter((statement) => statement.toUpperCase() === 'COMMIT').length,
    1,
    'migration must commit exactly one transaction',
  )
  assert.doesNotMatch(executable, /\b(?:CREATE\s+OR\s+REPLACE|DROP|ALTER)\s+FUNCTION\b/iu)
  assert.doesNotMatch(executable, /\btimestamptz\b/iu, 'OID lookup must use canonical type names')

  const doBlocks = statements.filter((statement) => /^DO\s+\$/iu.test(statement))
  assert.equal(doBlocks.length, 2, 'expected explicit preflight and postcondition blocks')
  const [preflight, postcondition] = doBlocks

  for (const { oidVariable, signature } of rpcTargets) {
    const escapedSignature = escapeRegExp(signature)
    assert.match(
      preflight,
      new RegExp(
        `\\b${oidVariable}\\s+oid\\s*:=\\s*to_regprocedure\\s*\\(\\s*'${escapedSignature}'\\s*\\)\\s*::\\s*oid`,
        'iu',
      ),
      `${signature} must be resolved to an OID by its exact canonical signature`,
    )
    assert.match(
      preflight,
      new RegExp(
        `\\bIF\\s+${oidVariable}\\s+IS\\s+NULL\\s+THEN\\s+RAISE\\s+EXCEPTION\\b`,
        'iu',
      ),
      `${signature} must fail explicitly when it is absent`,
    )

    const lookupCount = (
      executable.match(
        new RegExp(
          `to_regprocedure\\s*\\(\\s*'${escapedSignature}'\\s*\\)\\s*::\\s*oid`,
          'giu',
        ),
      ) ?? []
    ).length
    assert.equal(lookupCount, 2, `${signature} must be resolved in both guard blocks`)
  }

  for (const rpcName of rpcNames) {
    assert.match(
      preflight,
      new RegExp(`'${escapeRegExp(rpcName)}'`, 'u'),
      `${rpcName} must participate in the overload-set preflight`,
    )
  }
  assert.match(preflight, /SELECT\s+count\s*\(\s*\*\s*\)[\s\S]*?FROM\s+pg_catalog\.pg_proc/iu)
  assert.match(preflight, /routine\.proname\s*=\s*target_name/iu)
  assert.match(preflight, /overload_count\s*<>\s*1/iu)
  assert.match(postcondition, /SELECT\s+count\s*\(\s*\*\s*\)[\s\S]*?FROM\s+pg_catalog\.pg_proc/iu)
  assert.match(postcondition, /overload_count\s*<>\s*1/iu)
  for (const block of [preflight, postcondition]) {
    assert.match(block, /\bpg_catalog\.pg_proc\b/iu)
    assert.match(block, /\bproowner\s*=\s*current_user::regrole\b/iu)
    assert.match(block, /\bprosecdef\b/iu)
    assert.match(
      block,
      /\bproconfig\s+IS\s+NOT\s+DISTINCT\s+FROM\s+ARRAY\s*\[\s*'search_path=public'\s*\]::text\[\]/iu,
    )
  }

  const aclStatements = statements.map(parseAclStatement).filter(Boolean)
  assert.equal(aclStatements.length, rpcTargets.length * 2)
  assert.deepEqual(
    aclStatements.map(({ action }) => action),
    ['REVOKE', 'REVOKE', 'REVOKE', 'GRANT', 'GRANT', 'GRANT'],
    'all public-role revocations must precede the service-role grants',
  )
  const firstAclIndex = statements.findIndex((statement) => parseAclStatement(statement))
  const lastAclIndex = statements.findLastIndex((statement) => parseAclStatement(statement))
  assert.ok(statements.indexOf(preflight) < firstAclIndex)
  assert.ok(statements.indexOf(postcondition) > lastAclIndex)

  for (const { signature } of rpcTargets) {
    const targetStatements = aclStatements.filter(
      (statement) => statement.signature === signature,
    )
    assert.equal(targetStatements.length, 2, `${signature} requires one REVOKE and one GRANT`)

    const revoke = targetStatements.find((statement) => statement.action === 'REVOKE')
    const grant = targetStatements.find((statement) => statement.action === 'GRANT')
    assert.ok(revoke, `missing EXECUTE revoke for ${signature}`)
    assert.ok(grant, `missing service_role EXECUTE grant for ${signature}`)
    assert.equal(revoke.direction, 'FROM')
    assert.deepEqual(revoke.roles, ['anon', 'authenticated', 'public'])
    assert.equal(grant.direction, 'TO')
    assert.deepEqual(grant.roles, ['service_role'])
  }

  assert.match(postcondition, /\bhas_function_privilege\s*\(/iu)
  assert.match(
    postcondition,
    /has_function_privilege\s*\(\s*checked_role\s*,\s*target_oid\s*,\s*'EXECUTE'\s*\)/iu,
  )
  assert.match(postcondition, /\bactual_execute\s+IS\s+DISTINCT\s+FROM\s+should_execute\b/iu)

  const actualRoleMatrix = new Map(
    [...postcondition.matchAll(
      /\(\s*'(anon|authenticated|service_role)'\s*,\s*(true|false)\s*\)/giu,
    )].map((match) => [match[1].toLowerCase(), match[2].toLowerCase()]),
  )
  assert.deepEqual(
    actualRoleMatrix,
    new Map([
      ['anon', 'false'],
      ['authenticated', 'false'],
      ['service_role', 'true'],
    ]),
    'postcondition must verify the effective privilege of every real role',
  )

  assert.match(postcondition, /\bpg_proc\b/iu)
  assert.match(postcondition, /\bproacl\b/iu)
  assert.match(postcondition, /\baclexplode\s*\(/iu)
  assert.match(postcondition, /\bacldefault\s*\(\s*'f'\s*,/iu)
  assert.match(postcondition, /\.grantee\s*=\s*0\b/iu)
  assert.match(postcondition, /\.privilege_type\s*=\s*'EXECUTE'/iu)
  assert.doesNotMatch(
    postcondition,
    /has_function_privilege\s*\(\s*'PUBLIC'/iu,
    'PUBLIC is a pseudo-role and must be checked through ACL grantee OID 0',
  )
  assert.match(postcondition, /\bRAISE\s+EXCEPTION\b/iu)
})

test('every repository caller stays behind admin-key auth and a service-role client', () => {
  const runtimeReferences = []

  for (const absolutePath of listRuntimeSources(root)) {
    const source = readFileSync(absolutePath, 'utf8')
    const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/')
    const directCalls = findDirectRpcCalls(source)

    for (const name of rpcNames) {
      const firstReference = source.indexOf(name)
      if (firstReference === -1) continue
      runtimeReferences.push({
        absolutePath,
        relativePath,
        source,
        name,
        firstReference,
        directCalls: directCalls.filter((call) => call.name === name),
      })
    }
  }

  assert.ok(runtimeReferences.length > 0, 'repository scan found no admin RPC references')

  const unresolvedReferences = runtimeReferences
    .filter(({ directCalls }) => directCalls.length === 0)
    .map(({ relativePath, name, source, firstReference }) => (
      `${relativePath}:${lineAt(source, firstReference)} (${name})`
    ))
  assert.deepEqual(
    unresolvedReferences,
    [],
    `admin RPC names must not be hidden behind unauditable indirection:\n${unresolvedReferences.join('\n')}`,
  )

  const callersByRpc = new Map(rpcNames.map((name) => [name, []]))

  for (const reference of runtimeReferences) {
    const {
      absolutePath,
      relativePath,
      source,
      name,
      directCalls,
    } = reference

    assert.match(
      relativePath,
      /^app\/api\/admin(?:\/.*)?\/route\.(?:[cm]?[jt]s)$/u,
      `${relativePath} calls ${name} outside a server-only admin API route`,
    )
    assert.doesNotMatch(
      source,
      /^\s*['"]use client['"]/mu,
      `${relativePath} must not be a browser module`,
    )
    assert.match(
      source,
      /import\s*\{[^}]*\bcreateServiceClient\b[^}]*\}\s*from\s*['"]@\/lib\/supabase['"]/su,
      `${relativePath} must import the service-role client`,
    )
    assert.match(
      source,
      /import\s*\{[^}]*\bcheckAdminAuth\b[^}]*\}\s*from\s*['"]@\/lib\/admin-auth['"]/su,
      `${relativePath} must import the admin-key guard`,
    )
    assert.doesNotMatch(source, /\bNEXT_PUBLIC_SUPABASE_ANON_KEY\b/u)
    assert.doesNotMatch(source, /\b(?:createBrowserClient|createAnonClient)\b/u)
    assert.doesNotMatch(source, /\bcreateClient\s*\(/u)
    assert.doesNotMatch(source, /from\s*['"]@supabase\/supabase-js['"]/u)

    for (const call of directCalls) {
      assert.equal(
        call.kind,
        'supabase-js',
        `${relativePath}:${lineAt(source, call.index)} calls ${name} through a direct PostgREST URL`,
      )

      const receiverAssignmentPattern = new RegExp(
        `\\bconst\\s+${escapeRegExp(call.receiver)}\\s*=\\s*(getSupabase|createServiceClient)\\s*\\(\\s*\\)`,
        'gu',
      )
      const receiverAssignments = [...source.matchAll(receiverAssignmentPattern)]
        .filter((match) => match.index < call.index)
      const receiverAssignment = receiverAssignments.at(-1)
      assert.ok(
        receiverAssignment,
        `${relativePath}:${lineAt(source, call.index)} does not bind ${call.receiver} to the service client`,
      )
      if (receiverAssignment[1] === 'getSupabase') {
        assert.match(
          source,
          /function\s+getSupabase\s*\(\s*\)\s*\{\s*return\s+createServiceClient\s*\(\s*\)\s*\}/su,
          `${relativePath} getSupabase() must return createServiceClient() directly`,
        )
      }

      const serviceClientIndex = lastCallBefore(source, 'createServiceClient', call.index)
      const adminAuthIndex = lastCallBefore(source, 'checkAdminAuth', call.index)
      assert.ok(
        serviceClientIndex >= 0,
        `${relativePath}:${lineAt(source, call.index)} calls ${name} without createServiceClient()`,
      )
      assert.ok(
        adminAuthIndex >= 0,
        `${relativePath}:${lineAt(source, call.index)} calls ${name} before checkAdminAuth()`,
      )
      assert.match(
        source.slice(adminAuthIndex, call.index),
        /\bif\s*\(\s*authFail\s*\)\s*return\s+authFail\b/su,
        `${relativePath}:${lineAt(source, call.index)} does not fail closed on admin auth`,
      )
      callersByRpc.get(name).push(`${relativePath}:${lineAt(source, call.index)}`)
    }

    assert.ok(existsSync(absolutePath))
  }

  for (const [name, callers] of callersByRpc) {
    assert.ok(callers.length > 0, `repository scan found no direct caller for ${name}`)
  }

  const serviceClientSource = readFileSync(path.join(root, 'lib', 'supabase.ts'), 'utf8')
  const serviceClientStart = serviceClientSource.indexOf('export function createServiceClient')
  const serviceClientEnd = serviceClientSource.indexOf('/**', serviceClientStart + 1)
  assert.ok(serviceClientStart >= 0, 'createServiceClient implementation is missing')
  const serviceClientImplementation = serviceClientSource.slice(
    serviceClientStart,
    serviceClientEnd === -1 ? undefined : serviceClientEnd,
  )
  assert.match(serviceClientImplementation, /\bSUPABASE_SERVICE_ROLE_KEY\b/u)
  assert.doesNotMatch(serviceClientImplementation, /\bNEXT_PUBLIC_SUPABASE_ANON_KEY\b/u)

  const adminAuthSource = readFileSync(path.join(root, 'lib', 'admin-auth.ts'), 'utf8')
  assert.match(adminAuthSource, /req\.headers\.get\(\s*['"]x-admin-key['"]\s*\)/u)
  assert.match(adminAuthSource, /process\.env\.ADMIN_KEY\b/u)
  assert.match(adminAuthSource, /\bsafeCompare\s*\(\s*provided\s*,\s*adminKey\s*\)/u)
})
