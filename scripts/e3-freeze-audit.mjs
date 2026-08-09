#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { createServer as createNetServer } from 'node:net'
import { arch, platform, release } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyE3ConsoleErrors,
  compareE3Snapshots,
  classifyE3ProtectedSourceDifferences,
  computeE3BaselineCorpusSha256,
  createE3PerceptualFingerprintFromPng,
  finalizeE3ReleaseDifferences,
  getE3ProtectedSurfaceManifest,
  getE3SurfaceCases,
  hashCanonicalSourceContent,
  hashCanonicalSourceFile,
  replaceE3BaselineBundleAtomically,
  validateE3BaselineBundle,
  validateE3BaselineProvenance,
  validateE3ProtectedSurfaceManifest,
  validateE3RecordGitContext,
  validateE3VerifyRoots,
} from './lib/e3-freeze-core.mjs'
import { createE3FixtureServer } from './lib/e3-fixture-server.mjs'
import { partitionFirstPartyRequestFailures } from './lib/e3-production-csp-core.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const fixtureDir = join(projectRoot, '__tests__', 'fixtures', 'e3-freeze')
const fixturePath = join(fixtureDir, 'runtime-fixtures.json')
const mode = process.argv.includes('--record') ? 'record' : 'verify'
const publicOnly = process.argv.includes('--public-only')
const selectedCaseIds = new Set(
  process.argv
    .filter((argument) => argument.startsWith('--case='))
    .map((argument) => argument.slice('--case='.length))
    .filter(Boolean),
)
const keepCandidate = process.argv.includes('--keep')
const sourceRootArgument = process.argv.find((argument) => argument.startsWith('--source-root='))?.slice('--source-root='.length)
const runtimeRootArgument = process.argv.find((argument) => argument.startsWith('--runtime-root='))?.slice('--runtime-root='.length)
const baseRefArgument = process.argv.find((argument) => argument.startsWith('--base-ref='))?.slice('--base-ref='.length)
const baselineRootArgument = process.argv.find((argument) => argument.startsWith('--baseline-root='))?.slice('--baseline-root='.length)
const releaseSessionArgument = process.argv.find((argument) => argument.startsWith('--release-session-id='))?.slice('--release-session-id='.length)
const trustedBaselineCorpusArgument = process.argv
  .find((argument) => argument.startsWith('--trusted-baseline-corpus-sha256='))
  ?.slice('--trusted-baseline-corpus-sha256='.length)
const candidateOutputDirArgument = process.argv
  .find((argument) => argument.startsWith('--candidate-output-dir='))
  ?.slice('--candidate-output-dir='.length)
const runnerOwnershipTokenArgument = process.argv
  .find((argument) => argument.startsWith('--runner-ownership-token='))
  ?.slice('--runner-ownership-token='.length)
const sourceRoot = sourceRootArgument ? resolve(sourceRootArgument) : projectRoot
const runtimeRoot = runtimeRootArgument ? resolve(runtimeRootArgument) : sourceRoot
const baselineRoot = baselineRootArgument ? resolve(baselineRootArgument) : fixtureDir
const baselinePath = join(baselineRoot, 'baseline.json')
const baselineScreenshotDir = join(baselineRoot, 'screenshots')
const runId = randomUUID()
const capturedAt = new Date().toISOString()
const AUDIT_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const FONT_SETTLE_TIMEOUT_MS = 4_000
const AUDIT_SUPPORT_PATHS = Object.freeze({
  script: fileURLToPath(import.meta.url),
  releaseRunner: join(scriptDir, 'e3-freeze-release-audit.mjs'),
  core: join(scriptDir, 'lib', 'e3-freeze-core.mjs'),
  fixtureServer: join(scriptDir, 'lib', 'e3-fixture-server.mjs'),
  cspCore: join(scriptDir, 'lib', 'e3-production-csp-core.mjs'),
  preload: join(scriptDir, 'lib', 'e3-production-fetch-preload.cjs'),
  fixture: fixturePath,
})
const PRODUCTION_PUBLIC_SUPABASE_ORIGIN = 'https://e3-freeze.supabase.co'
const RUNTIME_GENERATED_FILES = Object.freeze([
  'next-env.d.ts',
  'tsconfig.json',
  'tsconfig.tsbuildinfo',
])
const HOST_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA',
  'COMSPEC',
  'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
])

function normalizedPath(path) {
  return resolve(path).replace(/[\\/]+$/, '').toLowerCase()
}

function assertSafeTransientDirectory(path, prefix, { mustNotExist = false } = {}) {
  const resolvedPath = resolve(path)
  if (
    normalizedPath(dirname(resolvedPath)) !== normalizedPath(baselineRoot)
    || !basename(resolvedPath).startsWith(prefix)
    || normalizedPath(realpathSync(dirname(resolvedPath))) !== normalizedPath(realpathSync(baselineRoot))
  ) throw new Error('E3 transient directory 必須是本次 baseline root 的直接子目錄')
  if (mustNotExist && existsSync(resolvedPath)) throw new Error('E3 transient directory 已存在，拒絕覆寫')
  if (existsSync(resolvedPath) && lstatSync(resolvedPath).isSymbolicLink()) {
    throw new Error('E3 transient directory 禁止 symbolic link／junction')
  }
}

function removeSafeTransientDirectory(path, prefix) {
  if (!existsSync(path)) return
  assertSafeTransientDirectory(path, prefix)
  rmSync(path, { recursive: true, force: true })
}

function assertRunnerOwnedBaselineRoot() {
  const ownerPath = join(baselineRoot, '.e3-release-owner.json')
  const lockPath = join(baselineRoot, '.active.lock')
  if (!existsSync(ownerPath) || !existsSync(lockPath) || !runnerOwnershipTokenArgument) {
    throw new Error('E3 baseline root 缺少 runner ownership token／active lock')
  }
  const owner = JSON.parse(readFileSync(ownerPath, 'utf8'))
  if (
    owner?.schema !== 'e3-release-owner/v1'
    || owner?.sessionId !== releaseSessionArgument
    || owner?.tokenSha256 !== sha256(runnerOwnershipTokenArgument)
    || owner?.runnerSha256 !== sha256(readFileSync(AUDIT_SUPPORT_PATHS.releaseRunner))
  ) throw new Error('E3 baseline root runner ownership 驗證失敗')
  if (mode === 'record' && (existsSync(baselinePath) || existsSync(baselineScreenshotDir))) {
    throw new Error('E3 record 只接受 runner 新建且沒有既有 baseline/screenshots 的 session')
  }
}

function assertNoRuntimeEnvironmentFiles(root) {
  const loadedEnvironmentNames = new Set(['.env', '.env.local', '.env.production', '.env.production.local'])
  const environmentFiles = readdirSync(root, { withFileTypes: true })
    .filter((entry) => loadedEnvironmentNames.has(entry.name.toLowerCase()))
    .map((entry) => entry.name)
    .sort()
  if (environmentFiles.length > 0) {
    throw new Error(`E3 runtime 禁止載入未納入契約的 env files：${environmentFiles.join(', ')}`)
  }
}

function pickHostEnvironment() {
  const result = {}
  for (const requestedKey of HOST_ENVIRONMENT_KEYS) {
    const actualKey = Object.keys(process.env).find((key) => key.toUpperCase() === requestedKey)
    if (actualKey && process.env[actualKey] != null) result[actualKey] = process.env[actualKey]
  }
  return result
}

function redactSensitiveOutput(value) {
  let redacted = String(value ?? '')
  for (const [key, secret] of Object.entries(process.env)) {
    if (!/(SECRET|TOKEN|PASSWORD|API[_-]?KEY|AUTH|COOKIE|PRIVATE)/i.test(key) || !secret || secret.length < 6) continue
    redacted = redacted.split(secret).join(`[REDACTED:${sha256(secret).slice(0, 12)}]`)
  }
  return redacted
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|secret|token|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
}

function getAuditClientIp(caseIndex) {
  return `198.18.${Math.floor(caseIndex / 250)}.${(caseIndex % 250) + 1}`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sha384Base64File(path) {
  return createHash('sha384').update(readFileSync(path)).digest('base64')
}

function getDependencyTreeContract(root) {
  const relativePaths = [
    'package.json',
    'package-lock.json',
    'node_modules/next/package.json',
    'node_modules/next/dist/bin/next',
    'node_modules/next/dist/server/next.js',
    'node_modules/react/package.json',
    'node_modules/react/cjs/react.production.js',
    'node_modules/react-dom/package.json',
    'node_modules/react-dom/cjs/react-dom-client.production.js',
    'node_modules/next/dist/compiled/webpack/package.json',
    'node_modules/next/dist/compiled/webpack/webpack.js',
  ]
  const records = relativePaths.map((relativePath) => {
    const path = join(root, relativePath)
    if (!existsSync(path)) throw new Error(`E3 dependency contract 缺少：${relativePath}`)
    return { path: relativePath, sha256: sha256(readFileSync(path)) }
  })
  return {
    schema: 'e3-dependency-tree/v1',
    records,
    sha256: sha256(stableJson(records)),
  }
}

function syntheticSecret(label) {
  return `e3f_${sha256(`jianyuan-production-parity:${label}`)}`
}

function getProductionEnvironmentContract(environment) {
  const effectiveEnvironment = Object.fromEntries(
    Object.entries(environment || {}).sort(([left], [right]) => left.localeCompare(right)),
  )
  if (effectiveEnvironment.E3_FREEZE_FIXTURE_ORIGIN) {
    effectiveEnvironment.E3_FREEZE_FIXTURE_ORIGIN = 'http://127.0.0.1:{ephemeral-port}'
  }
  return {
    schema: 'e3-production-parity-environment/v1',
    nodeEnv: 'production',
    bundler: 'webpack',
    siteUrl: 'https://jianyuan.life',
    apiUrl: 'https://fortune-reports-api.fly.dev',
    publicSupabaseOrigin: PRODUCTION_PUBLIC_SUPABASE_ORIGIN,
    fixtureOrigin: 'http://127.0.0.1:{ephemeral-port}',
    visiblePlanCodes: ['C', 'G15', 'E3'],
    secrets: 'deterministic-synthetic-sha256/v1',
    nodePreload: 'scripts/lib/e3-production-fetch-preload.cjs',
    effectiveEnvironmentKeys: Object.keys(effectiveEnvironment),
    effectiveEnvironmentSha256: sha256(stableJson(effectiveEnvironment)),
  }
}

function createProductionParityEnvironment(fixtureOrigin) {
  return {
    ...pickHostEnvironment(),
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SITE_URL: 'https://jianyuan.life',
    NEXT_PUBLIC_API_URL: 'https://fortune-reports-api.fly.dev',
    E3_FREEZE_FIXTURE_ORIGIN: fixtureOrigin,
    E3_FREEZE_PUBLIC_SUPABASE_ORIGIN: PRODUCTION_PUBLIC_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_PUBLIC_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: syntheticSecret('supabase-anon'),
    SUPABASE_SERVICE_ROLE_KEY: syntheticSecret('supabase-service-role'),
    NEXT_PUBLIC_VISIBLE_PLAN_CODES: 'C,G15,E3',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: syntheticSecret('stripe-publishable'),
    STRIPE_SECRET_KEY: syntheticSecret('stripe-secret'),
    STRIPE_WEBHOOK_SECRET: syntheticSecret('stripe-webhook'),
    CLAUDE_API_KEY: syntheticSecret('claude-api'),
    REPORT_COOKIE_SECRET: syntheticSecret('report-cookie'),
    CALCULATOR_ATTESTATION_SECRET: syntheticSecret('calculator-attestation'),
    CONSULTATION_SESSION_SECRET: syntheticSecret('consultation-session'),
    NODE_OPTIONS: `--require=${AUDIT_SUPPORT_PATHS.preload}`,
  }
}

function captureRuntimeFileState(root) {
  return RUNTIME_GENERATED_FILES.map((relativePath) => {
    const path = join(root, relativePath)
    return {
      path,
      relativePath,
      existed: existsSync(path),
      bytes: existsSync(path) ? readFileSync(path) : null,
    }
  })
}

function restoreRuntimeFileState(records) {
  const errors = []
  for (const record of records) {
    try {
      if (record.existed) writeFileSync(record.path, record.bytes)
      else rmSync(record.path, { force: true })
    } catch (error) {
      errors.push(`${record.path}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'E3 runtime files 還原不完整')
}

function materializeDeploymentScriptBytes(root) {
  const path = join(root, 'public', 'scripts', 'devtools-warning.js')
  const originalBytes = readFileSync(path)
  const deploymentBytes = Buffer.from(originalBytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
  const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8')
  const configuredIntegrity = layout.match(/integrity="(sha384-[^"]+)"/)?.[1]
  const computedIntegrity = `sha384-${createHash('sha384').update(deploymentBytes).digest('base64')}`
  if (!configuredIntegrity || configuredIntegrity !== computedIntegrity) {
    throw new Error(`devtools warning deployment bytes 與 layout SRI 不一致：configured=${configuredIntegrity || 'missing'} computed=${computedIntegrity}`)
  }
  if (!originalBytes.equals(deploymentBytes)) writeFileSync(path, deploymentBytes)
  return { path, originalBytes, deploymentBytes, computedIntegrity }
}

function restoreDeploymentScriptBytes(record) {
  if (record) writeFileSync(record.path, record.originalBytes)
}

function clearRuntimeBuildOutput(root) {
  const outputPath = resolve(root, '.next')
  if (outputPath === resolve(root) || dirname(outputPath).toLowerCase() !== resolve(root).toLowerCase()) {
    throw new Error(`拒絕清除未驗證的 Next build 目錄：${outputPath}`)
  }
  rmSync(outputPath, { recursive: true, force: true })
}

async function buildProductionBundle(nextCli, environment, nextLogs) {
  clearRuntimeBuildOutput(runtimeRoot)
  const child = spawn(process.execPath, [nextCli, 'build', '--webpack'], {
    cwd: runtimeRoot,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      nextLogs.push(String(chunk))
      if (nextLogs.length > 160) nextLogs.shift()
    })
  }
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', (code) => resolveExit(code))
  })
  if (exitCode !== 0) {
    const tail = nextLogs.join('').split(/\r?\n/).filter(Boolean).slice(-35).join('\n')
    throw new Error(`E3 production parity build 失敗，exit=${exitCode}\n${tail}`)
  }
}

function sha256File(path) {
  return sha256(readFileSync(path))
}

function getAuditSupportHashes() {
  return Object.fromEntries(
    Object.entries(AUDIT_SUPPORT_PATHS).map(([key, path]) => [key, sha256File(path)]),
  )
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失敗：${String(result.stderr || result.stdout).trim()}`)
  }
  return String(result.stdout).trim()
}

function inspectGitContext(root, baseRef = 'origin/main') {
  return {
    baseRef,
    baseCommit: runGit(['rev-parse', '--verify', `${baseRef}^{commit}`], root),
    head: runGit(['rev-parse', 'HEAD'], root),
    clean: runGit(['status', '--porcelain=v1', '--untracked-files=all'], root) === '',
  }
}

function assertRecordPreflight() {
  if (!sourceRootArgument) throw new Error('--record 必須明確提供 --source-root=<乾淨 base worktree>')
  if (!runtimeRootArgument) throw new Error('--record 必須明確提供 --runtime-root=<另一個乾淨 base worktree>')
  if (sourceRoot.toLowerCase() === runtimeRoot.toLowerCase()) {
    throw new Error('--record 的 source-root 與 runtime-root 必須分離，避免 Next 產物污染證據來源')
  }
  if (!baseRefArgument) throw new Error('--record 必須明確提供 --base-ref=origin/main')
  const manifest = getE3ProtectedSurfaceManifest()
  const manifestResult = validateE3ProtectedSurfaceManifest(manifest)
  if (!manifestResult.ok) throw new Error(`E3 protected manifest 不完整：${manifestResult.errors.join(', ')}`)
  const requiredManifest = manifest.filter((item) => item.baseOptional !== true)
  const missingFiles = requiredManifest
    .map((item) => item.path)
    .filter((relativePath) => !existsSync(join(sourceRoot, relativePath)))
  if (missingFiles.length > 0) throw new Error(`base worktree 缺少 E3 protected surface：${missingFiles.join(', ')}`)
  const git = inspectGitContext(sourceRoot, baseRefArgument)
  const gitResult = validateE3RecordGitContext(git)
  if (!gitResult.ok) throw new Error(`E3 baseline 禁止從候選或髒工作樹錄製：${gitResult.errors.join(', ')}`)
  const runtimeGit = inspectGitContext(runtimeRoot, baseRefArgument)
  const runtimeGitResult = validateE3RecordGitContext(runtimeGit)
  if (!runtimeGitResult.ok || runtimeGit.baseCommit !== git.baseCommit) {
    throw new Error(`E3 runtime 必須是同一 base commit 的另一個乾淨 worktree：${[
      ...runtimeGitResult.errors,
      ...(runtimeGit.baseCommit === git.baseCommit ? [] : ['git.base_commit_mismatch']),
    ].join(', ')}`)
  }
  const runtimeMissingFiles = requiredManifest
    .map((item) => item.path)
    .filter((relativePath) => !existsSync(join(runtimeRoot, relativePath)))
  if (runtimeMissingFiles.length > 0) throw new Error(`runtime worktree 缺少 E3 protected surface：${runtimeMissingFiles.join(', ')}`)
  const runtimeDrift = requiredManifest.map((item) => item.path).filter((relativePath) => (
    hashCanonicalSourceFile(join(sourceRoot, relativePath)) !== hashCanonicalSourceFile(join(runtimeRoot, relativePath))
  ))
  if (runtimeDrift.length > 0) throw new Error(`runtime worktree 與 source base 不同：${runtimeDrift.join(', ')}`)
  return { git, runtimeGit }
}

function createFontProvenance(records) {
  const normalizedRecords = records
    .map((record) => stableObject(record))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
  const families = [...new Set(normalizedRecords.flatMap((record) => record.families || []))].sort()
  return {
    families,
    records: normalizedRecords,
    fingerprintSha256: sha256(stableJson(normalizedRecords)),
  }
}

async function captureFontRecord(page, scope) {
  return scope.evaluate((root) => {
    const computedFamilies = [...new Set([root, ...root.querySelectorAll('*')]
      .map((element) => getComputedStyle(element).fontFamily)
      .filter(Boolean))]
    const families = [...new Set([
      ...computedFamilies.flatMap((family) => family.split(',').map((item) => item.trim().replace(/^['\"]|['\"]$/g, ''))),
    ].filter(Boolean))].sort()
    const probe = (root.textContent || '月度精選').replace(/\s+/g, '').slice(0, 128) || '月度精選'
    const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy'])
    const availability = families.map((family) => {
      const familySpec = genericFamilies.has(family)
        ? family
        : `"${family.replace(/"/g, '\\"')}"`
      let available = false
      try {
        available = document.fonts ? document.fonts.check(`16px ${familySpec}`, probe) : false
      } catch {}
      return { family, available }
    })
    return { computedFamilies, families, availability }
  })
}

function buildProvenance({ git, runtimeGit, browserVersion, browserToolchain, fontRecords, auditHashes, runtime }) {
  return {
    schema: 'e3-freeze-provenance/v2',
    git,
    runtimeGit,
    tool: {
      name: 'e3-freeze-audit',
      version: '5',
      scriptSha256: auditHashes.script,
      releaseRunnerSha256: auditHashes.releaseRunner,
      coreSha256: auditHashes.core,
      fixtureServerSha256: auditHashes.fixtureServer,
      cspCoreSha256: auditHashes.cspCore,
      fixtureSha256: auditHashes.fixture,
      preloadSha256: auditHashes.preload,
    },
    node: { version: process.version },
    browser: {
      engine: 'chromium',
      version: browserVersion,
      userAgent: AUDIT_BROWSER_USER_AGENT,
      cspMode: 'bypassed-production-parity',
      toolchain: browserToolchain,
    },
    runtime,
    fonts: createFontProvenance(fontRecords),
    os: { platform: platform(), release: release(), arch: arch() },
  }
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableObject(child)]),
    )
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableObject(value))
}

function getProtectedSourceHashes(root, manifest) {
  return Object.fromEntries(manifest.map((item) => [
    item.path,
    {
      algorithm: 'sha256-lf/v1',
      digest: existsSync(join(root, item.path)) ? hashCanonicalSourceFile(join(root, item.path)) : null,
      present: existsSync(join(root, item.path)),
      scope: item.scope,
      surfaces: item.surfaces,
    },
  ]))
}

function getProtectedCommitHashes(root, commit, manifest) {
  return Object.fromEntries(manifest.map((item) => {
    const result = spawnSync('git', ['show', `${commit}:${item.path}`], {
      cwd: root,
      encoding: null,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })
    const present = result.status === 0
    if (!present && item.baseOptional !== true) {
      throw new Error(`可信 base commit 缺少 E3 protected surface：${item.path}`)
    }
    return [
      item.path,
      {
        algorithm: 'sha256-lf/v1',
        digest: present ? hashCanonicalSourceContent(result.stdout) : null,
        present,
        scope: item.scope,
        surfaces: item.surfaces,
      },
    ]
  }))
}

async function waitForTwoFrames(page) {
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
  }))
}

async function waitForStylesheetsAndScopedFonts(page, scope) {
  await page.evaluate(async (timeoutMs) => {
    const stylesheetLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
    await Promise.all(stylesheetLinks.map((link) => {
      if (link.sheet) return Promise.resolve()
      return new Promise((resolveLoad) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolveLoad()
        }
        const timer = setTimeout(finish, timeoutMs)
        link.addEventListener('load', finish, { once: true })
        link.addEventListener('error', finish, { once: true })
      })
    }))
  }, FONT_SETTLE_TIMEOUT_MS)

  const fontRequests = await scope.evaluate((root) => {
    const requests = new Map()
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const text = (element.textContent || '').replace(/\s+/g, '').slice(0, 64)
      if (!text) continue
      const computed = getComputedStyle(element)
      const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
      if (!requests.has(font)) requests.set(font, { font, text })
    }
    return [...requests.values()].slice(0, 64)
  })

  await page.evaluate(async ({ requests, timeoutMs }) => {
    if (!document.fonts) return
    const boundedDelay = () => new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs))
    const loadAll = Promise.allSettled(requests.map(async ({ font, text }) => {
      try {
        await document.fonts.load(font, text)
      } catch {
        // Invalid or unavailable fallback faces must not abort the audit. The
        // browser will use the same resolved fallback in baseline and candidate.
      }
    }))
    await Promise.race([loadAll, boundedDelay()])
    await Promise.race([document.fonts.ready, boundedDelay()])
  }, { requests: fontRequests, timeoutMs: FONT_SETTLE_TIMEOUT_MS })
  await waitForTwoFrames(page)
}

async function prepareStablePaint(page, scope) {
  await scope.evaluate((root) => root.setAttribute('data-e3-freeze-screenshot-scope', ''))
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        content-visibility: visible !important;
        transition: none !important;
      }
      svg { shape-rendering: crispEdges !important; }
      [data-e3-freeze-screenshot-scope],
      [data-e3-freeze-screenshot-scope] *,
      .jy-navbar,
      .jy-navbar * {
        font-family: "Microsoft JhengHei", "Segoe UI Emoji", sans-serif !important;
      }
    `,
  })
  const freezeFontText = await scope.evaluate((root) => {
    const normalized = (root.textContent || '').replace(/\s+/g, ' ').trim()
    return [...new Set(normalized)].join('').slice(0, 2_048) || '鑒源月度精選 USD 89'
  })
  await page.evaluate(async ({ text, timeoutMs }) => {
    if (document.fonts) {
      await Promise.race([
        document.fonts.load('16px "Microsoft JhengHei"', text),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
      ])
    }

    // Loading a face is not sufficient on cold Chromium runs: glyph raster can
    // still lag behind DOM/style readiness and omit entire text layers. Draw the
    // exact scoped glyph set once off-screen before the evidence screenshot.
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.min(8_192, text.length * 20))
    canvas.height = 48
    const context = canvas.getContext('2d')
    if (context) {
      context.font = '16px "Microsoft JhengHei"'
      context.fillText(text, 0, 24)
    }
  }, { text: freezeFontText, timeoutMs: FONT_SETTLE_TIMEOUT_MS })
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    for (const animation of document.getAnimations({ subtree: true })) animation.cancel()
    for (const media of document.querySelectorAll('video, audio')) media.pause()
  })
  await scope.evaluate(async (element) => {
    const originalY = window.scrollY
    const rect = element.getBoundingClientRect()
    const top = rect.top + originalY
    const bottom = top + rect.height
    const step = Math.max(200, Math.floor(window.innerHeight * 0.75))
    for (let y = top; y < bottom; y += step) {
      window.scrollTo(0, Math.max(0, y))
      await new Promise((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
      })
    }
    window.scrollTo(0, Math.max(0, top))
  })
  await waitForTwoFrames(page)
  const browserNow = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(browserNow + 1_000)
}

async function prepareIntegerAlignedRaster(page, scope) {
  await scope.scrollIntoViewIfNeeded()
  await waitForTwoFrames(page)
  const box = await scope.boundingBox()
  if (!box) throw new Error('E3 screenshot scope 沒有可用 bounding box')
  const adjustment = { x: Math.round(box.x) - box.x, y: Math.round(box.y) - box.y }
  const original = await scope.evaluate((root, nextAdjustment) => {
    const computedTranslate = getComputedStyle(root).translate
    if (computedTranslate && computedTranslate !== 'none') {
      throw new Error(`E3 screenshot scope 已有 translate，拒絕覆寫：${computedTranslate}`)
    }
    const previous = {
      value: root.style.getPropertyValue('translate'),
      priority: root.style.getPropertyPriority('translate'),
    }
    root.style.setProperty('translate', `${nextAdjustment.x}px ${nextAdjustment.y}px`, 'important')
    return previous
  }, adjustment)
  await waitForTwoFrames(page)
  const aligned = await scope.boundingBox()
  if (
    !aligned
    || Math.abs(aligned.x - Math.round(aligned.x)) > 0.001
    || Math.abs(aligned.y - Math.round(aligned.y)) > 0.001
  ) throw new Error('E3 screenshot scope 無法對齊整數 CSS pixel')
  return async () => {
    await scope.evaluate((root, previous) => {
      if (previous.value) root.style.setProperty('translate', previous.value, previous.priority)
      else root.style.removeProperty('translate')
    }, original)
    await waitForTwoFrames(page)
  }
}

async function captureStableScreenshot(page, scope, auditCase) {
  const restoreRasterAlignment = await prepareIntegerAlignedRaster(page, scope)
  let previousHash = ''
  let previousBuffer = null
  const attemptHashes = []
  const attemptBuffers = []
  try {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const buffer = await scope.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      })
      const hash = sha256(buffer)
      attemptHashes.push(hash)
      attemptBuffers.push(buffer)
      if (hash === previousHash) {
        return {
          buffer,
          stability: { mode: 'fixed', cycleSha256: [hash] },
        }
      }
      previousHash = hash
      previousBuffer = buffer
      await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    const stableTwoPhase = attemptHashes[0] === attemptHashes[2]
      && attemptHashes[2] === attemptHashes[4]
      && attemptHashes[1] === attemptHashes[3]
      && attemptHashes[3] === attemptHashes[5]
      && attemptHashes[0] !== attemptHashes[1]
    if (stableTwoPhase) {
      return {
        buffer: attemptBuffers[0],
        stability: {
          mode: 'periodic-2',
          cycleSha256: [attemptHashes[0], attemptHashes[1]],
        },
      }
    }
    throw new Error(`E3 screenshot 未能穩定到連續兩張相同：${auditCase.id}；attempts=${attemptHashes.join(',')};last=${sha256(previousBuffer)}`)
  } finally {
    await restoreRasterAlignment()
  }
}

function hashBoundedRegularTree(root, label) {
  const records = []
  let totalBytes = 0
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) throw new Error(`${label} 禁止 symbolic link：${current}`)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current).sort().reverse()) pending.push(join(current, entry))
      continue
    }
    if (!stat.isFile()) throw new Error(`${label} 含非 regular file：${current}`)
    totalBytes += stat.size
    if (records.length >= 20_000 || totalBytes > 256 * 1024 * 1024) {
      throw new Error(`${label} 超過 toolchain hash 上限`)
    }
    records.push({
      path: relative(root, current).replace(/\\/g, '/'),
      size: stat.size,
      sha256: sha256(readFileSync(current)),
    })
  }
  records.sort((left, right) => left.path.localeCompare(right.path))
  return { root: realpathSync(root), files: records.length, bytes: totalBytes, sha256: sha256(stableJson(records)) }
}

function resolveBrowserToolchain(root) {
  const requireRoots = [
    join(root, 'node_modules'),
    'D:/npm-global/node_modules',
    '/usr/lib/node_modules',
  ]
  for (const moduleRoot of requireRoots) {
    try {
      const requireFromRoot = createRequire(join(moduleRoot, '__e3-verifier__.cjs'))
      const playwrightPackagePath = requireFromRoot.resolve('playwright/package.json')
      const playwrightCorePackagePath = requireFromRoot.resolve('playwright-core/package.json')
      const playwrightRoot = dirname(playwrightPackagePath)
      const playwrightCoreRoot = dirname(playwrightCorePackagePath)
      const playwrightPackage = JSON.parse(readFileSync(playwrightPackagePath, 'utf8'))
      const playwright = requireFromRoot('playwright')
      const chromePath = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ].find((path) => path && existsSync(path))
      if (!chromePath) throw new Error('找不到受檢 Chrome/Edge executable')
      const chromeStat = statSync(chromePath)
      return {
        chromium: playwright.chromium,
        provenance: {
          schema: 'e3-browser-toolchain/v1',
          playwrightVersion: playwrightPackage.version,
          playwright: hashBoundedRegularTree(playwrightRoot, 'Playwright'),
          playwrightCore: hashBoundedRegularTree(playwrightCoreRoot, 'Playwright Core'),
          browserExecutable: {
            path: realpathSync(chromePath),
            size: chromeStat.size,
            sha256: sha256(readFileSync(chromePath)),
          },
        },
      }
    } catch {}
  }
  throw new Error('找不到可完整雜湊的 Playwright／Chrome toolchain；E3 freeze audit 不可降級')
}

async function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('無法取得本機 port'))
        return
      }
      const port = address.port
      server.close((error) => error ? rejectPort(error) : resolvePort(port))
    })
  })
}

async function waitForPage(url, child, timeoutMs = 120_000) {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode != null) {
      throw new Error(`next start 提前結束，exit=${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.status < 500) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  throw new Error(`等待 next start 超時：${lastError}`)
}

async function stopChild(child) {
  const hasExited = () => child.exitCode != null || child.signalCode != null
  if (!child || hasExited()) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ])
  if (!hasExited()) {
    child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
    ])
  }
  if (!hasExited()) throw new Error('next process 在 SIGKILL 後仍未退出')
}

async function cleanupProductionParityResources({
  browser,
  nextProcess,
  fixtureServer,
  deploymentScriptState,
  runtimeFileState,
}) {
  const errors = []
  const completed = {
    browser: !browser,
    nextProcess: !nextProcess,
    fixtureServer: !fixtureServer,
    deploymentScriptState: !deploymentScriptState,
    runtimeFileState: !runtimeFileState,
  }
  const attempt = async (name, action) => {
    try {
      await action()
      completed[name] = true
    } catch (error) {
      errors.push(`${name}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (browser) await attempt('browser', () => browser.close())
  if (nextProcess) await attempt('nextProcess', () => stopChild(nextProcess))
  if (fixtureServer) await attempt('fixtureServer', () => fixtureServer.close())
  if (deploymentScriptState) {
    await attempt('deploymentScriptState', () => restoreDeploymentScriptBytes(deploymentScriptState))
  }
  if (runtimeFileState) {
    await attempt('runtimeFileState', () => restoreRuntimeFileState(runtimeFileState))
  }
  return { errors, completed }
}

function createSession(fixture) {
  return {
    ...fixture.auth.session,
    user: fixture.auth.user,
  }
}

function normalizeTelemetryValue(value, origin) {
  if (Array.isArray(value)) return value.map((item) => normalizeTelemetryValue(item, origin))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      normalizeTelemetryValue(child, origin),
    ]))
  }
  return typeof value === 'string' ? value.replaceAll(origin, '{origin}') : value
}

function captureTelemetryRequest(request, origin) {
  const url = new URL(request.url())
  const rawBody = request.postData()
  let body = rawBody
  if (rawBody) {
    try {
      body = JSON.parse(rawBody)
    } catch {}
  }
  return stableObject({
    endpoint: url.pathname,
    method: request.method(),
    query: Object.fromEntries([...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right))),
    body: normalizeTelemetryValue(body, origin),
  })
}

function stableTelemetryRequests(requests) {
  return requests.map((item) => stableObject(item)).sort((left, right) => (
    stableJson(left).localeCompare(stableJson(right))
  ))
}

async function prepareContext(context, fixture, origin) {
  await context.addInitScript(({ session }) => {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      localStorage.setItem('sb-jianyuan-auth', JSON.stringify(session))
      localStorage.setItem('jianyuan_email', session.user.email)
      localStorage.setItem('currency', 'USD')
      sessionStorage.setItem('jy_session', 'e3-freeze-session')
      localStorage.setItem('jy_cookie_consent_v1', JSON.stringify({
        necessary: true,
        analytics: false,
        marketing: false,
        decided_at: '2026-08-01T00:00:00.000Z',
      }))
    }
  }, { session: createSession(fixture) })

  const telemetryCapture = { requests: [], errors: [] }
  const fulfillTelemetry = async (route) => {
    try {
      telemetryCapture.requests.push(captureTelemetryRequest(route.request(), origin))
    } catch (error) {
      telemetryCapture.errors.push(error instanceof Error ? error.message : String(error))
    }
    const isScript = route.request().resourceType() === 'script'
    await route.fulfill(isScript
      ? { status: 200, contentType: 'application/javascript', body: 'void 0;' }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  }
  await context.route('**/api/track**', fulfillTelemetry)
  await context.route('**/api/track/funnel**', fulfillTelemetry)
  await context.route('**/api/error-report**', fulfillTelemetry)
  await context.route('**/api/report-view**', fulfillTelemetry)
  await context.route('**/api/web-vitals**', fulfillTelemetry)
  await context.route('**/api/ab-events**', fulfillTelemetry)
  await context.route('**/api/funnel-track**', fulfillTelemetry)
  await context.route('**/_vercel/insights/**', fulfillTelemetry)
  await context.route('**/_vercel/speed-insights/**', fulfillTelemetry)
  await context.route('**/auth/v1/user', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.auth.user),
  }))
  await context.route('**/api/feedback?report_id=*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ feedback: null }),
  }))
  await context.route('**/api/family-members**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ members: [] }),
  }))
  await context.route('**/api/points/balance**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ balance: 0 }),
  }))
  await context.route('**/api/referral/my-code**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.referral),
  }))
  await context.route('**/api/reports?email=*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reports: [fixture.report] }),
  }))
  return telemetryCapture
}

async function selectCheckoutFixture(page) {
  await page.locator('#checkout-name').fill('E3 凍結測試人')
  await page.locator('#checkout-birth-year').fill('1990')
  await page.locator('#checkout-birth-city').fill('台灣')
  const taiwanOption = page.getByRole('option', { name: /^台灣/ }).first()
  await waitForVisibleFromNode(taiwanOption, { timeout: 30_000, label: '台灣出生地選項' })
  await taiwanOption.click()

  for (const label of ['事業運，未選', '財運，未選', '家庭，未選']) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }

  const timingFieldset = page.locator('fieldset').filter({ hasText: '可配合出行的時辰' })
  const timeCheckboxes = timingFieldset.locator('input[type="checkbox"]')
  for (const index of [0, 1, 2]) await timeCheckboxes.nth(index).check()

  await waitForVisibleFromNode(
    page.getByRole('button', { name: '檢查資料並付款 — USD 89', exact: true }),
    { timeout: 30_000, label: 'E3 checkout 送出按鈕' },
  )
}

async function capturePayload(page) {
  let payload
  await page.route('**/api/checkout', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'E3 freeze fixture: payment disabled' }),
    })
  })
  await page.getByRole('button', { name: '確認無誤，前往 Stripe', exact: true }).click()
  await waitForTextFromNode(page, 'E3 freeze fixture: payment disabled', 30_000)
  if (!payload) throw new Error('未攔截到 E3 checkout payload')
  return payload
}

async function waitForVisibleFromNode(locator, { timeout, label }) {
  const deadline = Date.now() + timeout
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      if (await locator.isVisible()) return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`${label} 在 ${timeout}ms 內未變為可見${lastError ? `：${lastError}` : ''}`)
}

async function waitForTextFromNode(page, text, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await page.locator('body').textContent().then((value) => value?.includes(text)).catch(() => false)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`頁面在 ${timeout}ms 內未出現文字：${text}`)
}

async function waitForAttributeFromNode(locator, name, expected, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const actual = await locator.getAttribute(name).catch(() => null)
    if (actual === expected) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`${name} 在 ${timeout}ms 內未變為 ${expected}`)
}

async function waitForHiddenFromNode(locator, { timeout, label }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const count = await locator.count().catch(() => 0)
    if (count === 0 || !await locator.isVisible().catch(() => false)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`${label} 在 ${timeout}ms 內未關閉`)
}

async function waitForEnabledFromNode(locator, { timeout, label }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`${label} 在 ${timeout}ms 內未啟用`)
}

async function exerciseE3PricingNotice(page) {
  const card = page.locator('#plan-e3')
  const cta = card.getByRole('button', { name: '開始月度密集補運', exact: true })
  await waitForVisibleFromNode(cta, { timeout: 30_000, label: 'E3 定價 CTA' })
  await cta.click()

  const dialog = page.locator('[role="dialog"][aria-modal="true"]')
  await waitForVisibleFromNode(dialog, { timeout: 30_000, label: 'E3 購買須知視窗' })
  await waitForVisibleFromNode(
    dialog.getByRole('heading', { name: /月度精選須知/ }),
    { timeout: 30_000, label: 'E3 購買須知標題' },
  )
  const dialogText = await dialog.innerText()
  for (const requiredText of ['32 凶硬剔除', '主題用神 60% 權重', '個人年命宮交叉驗證']) {
    if (!dialogText.includes(requiredText)) throw new Error(`E3 購買須知缺少：${requiredText}`)
  }

  await dialog.locator('input[type="checkbox"]').check()
  await waitForEnabledFromNode(
    dialog.getByRole('button', { name: '前往付款', exact: true }),
    { timeout: 30_000, label: 'E3 購買須知確認按鈕' },
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await waitForHiddenFromNode(dialog, { timeout: 30_000, label: 'E3 購買須知視窗' })
}

async function assertE3CalendarLinks(page, expectedCount) {
  const links = page.getByRole('link', { name: '加入 Google 行事曆', exact: true })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && await links.count() !== expectedCount) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  const actualCount = await links.count()
  if (actualCount !== expectedCount) {
    throw new Error(`E3 行事曆連結數量錯誤：expected=${expectedCount};actual=${actualCount}`)
  }
  const contracts = await links.evaluateAll((elements) => elements.map((element) => ({
    href: element.getAttribute('href') || '',
    target: element.getAttribute('target') || '',
    rel: element.getAttribute('rel') || '',
  })))
  for (const [index, contract] of contracts.entries()) {
    const url = new URL(contract.href)
    if (url.origin !== 'https://calendar.google.com' || url.pathname !== '/calendar/render') {
      throw new Error(`E3 行事曆連結 ${index + 1} 不是 Google Calendar`)
    }
    if (url.searchParams.get('action') !== 'TEMPLATE' || url.searchParams.get('ctz') !== 'Asia/Taipei') {
      throw new Error(`E3 行事曆連結 ${index + 1} 缺少 action/ctz 契約`)
    }
    if (!url.searchParams.get('text') || !/^\d{8}T\d{6}\/\d{8}T\d{6}$/.test(url.searchParams.get('dates') || '')) {
      throw new Error(`E3 行事曆連結 ${index + 1} 缺少標題或有效日期區間`)
    }
    if (contract.target !== '_blank' || !contract.rel.split(/\s+/).includes('noopener')) {
      throw new Error(`E3 行事曆連結 ${index + 1} 缺少安全的新分頁契約`)
    }
  }
}

async function assertClientHydrated(page, auditCase) {
  if (auditCase.surface === 'report') return
  const menuButton = page.locator('button[aria-controls="mobile-menu"]').first()
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && await menuButton.count() === 0) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  if (await menuButton.count() === 0) throw new Error(`缺少 hydration sentinel：${auditCase.id}`)
  await toggleHydrationSentinel(menuButton, 'true', auditCase.id)
  await toggleHydrationSentinel(menuButton, 'false', auditCase.id)
}

async function toggleHydrationSentinel(menuButton, expected, caseId) {
  const deadline = Date.now() + 90_000
  let lastValue = null
  while (Date.now() < deadline) {
    lastValue = await menuButton.getAttribute('aria-expanded').catch(() => null)
    if (lastValue === expected) return
    await menuButton.evaluate((element) => element.click()).catch(() => {})
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`hydration sentinel 未切換：${caseId}；expected=${expected}；actual=${lastValue}`)
}

async function prepareState(page, auditCase, fixture, baseUrl) {
  if (auditCase.surface === 'dashboard') {
    const dashboardState = auditCase.state.replace('dashboard-', '')
    await page.route('**/api/reports?session_id=e3-freeze-*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reports: [fixture.dashboard[dashboardState]] }),
    }))
  }

  await page.goto(`${baseUrl}${auditCase.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await assertClientHydrated(page, auditCase)

  if (auditCase.surface === 'pricing') {
    await exerciseE3PricingNotice(page)
  }

  if (auditCase.surface !== 'report' && auditCase.viewport.width > 820) {
    await waitForVisibleFromNode(page.locator('.jy-navbar__user a[href="/dashboard"]').first(), {
      timeout: 90_000,
      label: '登入後的我的報告導覽連結',
    })
  }

  if (auditCase.surface === 'checkout') {
    await waitForVisibleFromNode(page.locator('.checkout-main'), { timeout: 30_000, label: 'E3 checkout 主區域' })
    await waitForVisibleFromNode(page.getByRole('button', { name: /快速填入歷史資料/ }), { timeout: 30_000, label: 'E3 歷史資料按鈕' })
    if (auditCase.state !== 'checkout-initial') {
      await selectCheckoutFixture(page)
    }
    if (auditCase.state === 'checkout-confirmation') {
      await page.getByRole('button', { name: '檢查資料並付款 — USD 89', exact: true }).click()
      await waitForVisibleFromNode(page.locator('[role="dialog"][aria-modal="true"]'), { timeout: 30_000, label: 'E3 結帳確認視窗' })
    }
  }

  if (auditCase.surface === 'report') {
    await waitForVisibleFromNode(
      page.getByRole('heading', { name: '您的反饋對我們很重要', exact: true }),
      { timeout: 30_000, label: 'E3 報告回饋表單' },
    )
    if (auditCase.state === 'report-timings') {
      await assertE3CalendarLinks(page, fixture.report.report_result.top5_timings.length)
    }
  }

  const scope = page.locator(auditCase.selector).first()
  try {
    await scope.waitFor({ state: 'visible', timeout: 45_000 })
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      body: document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 600) || '',
      articles: document.querySelectorAll('article').length,
      links: [...document.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')).filter(Boolean).slice(0, 30),
    }))
    throw new Error(`E3 selector 找不到：${auditCase.selector}；diagnostic=${JSON.stringify(diagnostic)}；cause=${error instanceof Error ? error.message : String(error)}`)
  }
  await waitForStylesheetsAndScopedFonts(page, scope)

  return { scope }
}

async function captureSemanticSurface(scope) {
  const dom = await scope.evaluate((element) => {
    const clone = element.cloneNode(true)
    const commentWalker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT)
    const comments = []
    while (commentWalker.nextNode()) comments.push(commentWalker.currentNode)
    for (const comment of comments) comment.remove()
    const styledElements = [clone, ...clone.querySelectorAll('[style]')]
    for (const styledElement of styledElements) {
      if (styledElement instanceof HTMLElement || styledElement instanceof SVGElement) {
        const cssText = styledElement.style.cssText
        if (cssText) styledElement.setAttribute('style', cssText)
      }
    }
    const allElements = [clone, ...clone.querySelectorAll('*')]
    for (const currentElement of allElements) {
      if (!(currentElement instanceof Element)) continue
      const attributes = [...currentElement.attributes]
        .map((attribute) => [attribute.name, attribute.value])
        .sort(([left], [right]) => left.localeCompare(right))
      for (const attribute of [...currentElement.attributes]) {
        currentElement.removeAttribute(attribute.name)
      }
      for (const [name, value] of attributes) currentElement.setAttribute(name, value)
    }
    return clone.outerHTML.replace(/\s+/g, ' ').trim()
  })
  const text = await scope.innerText()
  const aria = typeof scope.ariaSnapshot === 'function'
    ? await scope.ariaSnapshot()
    : await scope.evaluate((element) => ({
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        text: element.textContent,
      }))
  const criticalStyles = await scope.evaluate((root) => {
    const targets = [root, ...root.querySelectorAll('a,button,input,select,textarea,summary,svg,path,[role="button"],[role="dialog"]')]
    const fields = [
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'background-color', 'border-top-color', 'border-top-width',
      'background-image', 'filter', 'backdrop-filter', 'clip-path', 'mask-image',
      'border-radius', 'box-shadow', 'padding-top', 'padding-right',
      'padding-bottom', 'padding-left', 'margin-top', 'margin-right',
      'margin-bottom', 'margin-left', 'display', 'grid-template-columns',
      'width', 'height', 'opacity', 'transform', 'position', 'fill', 'stroke',
      'stroke-width',
    ]
    return targets.map((element, index) => {
      const computed = getComputedStyle(element)
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        role: element.getAttribute('role') || '',
        name: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || '',
        styles: Object.fromEntries(fields.map((field) => [field, computed.getPropertyValue(field)])),
      }
    })
  })

  const layoutContract = await scope.evaluate((root) => {
    const round = (value) => Math.round(value * 100) / 100
    const box = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        documentX: round(rect.x + window.scrollX),
        documentY: round(rect.y + window.scrollY),
      }
    }
    const shellStyleFields = [
      'display', 'visibility', 'opacity', 'position', 'z-index', 'overflow-x',
      'overflow-y', 'transform', 'font-size', 'line-height', 'color',
      'background-color', 'background-image', 'border-top-width',
      'border-top-color', 'box-shadow',
    ]
    const shellElement = (element, index) => {
      const computed = getComputedStyle(element)
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        classes: typeof element.className === 'string' ? element.className : element.getAttribute('class') || '',
        box: box(element),
        styles: Object.fromEntries(shellStyleFields.map((field) => [field, computed.getPropertyValue(field)])),
      }
    }
    const shellElements = [
      document.documentElement,
      document.body,
      ...[...document.body.querySelectorAll('*')]
        .filter((element) => !element.matches('script,style,link,meta,template')),
    ]
    const bodyClone = document.body.cloneNode(true)
    for (const implementationNode of bodyClone.querySelectorAll('script,style,link,meta,template')) {
      implementationNode.remove()
    }
    const commentWalker = document.createTreeWalker(bodyClone, NodeFilter.SHOW_COMMENT)
    const comments = []
    while (commentWalker.nextNode()) comments.push(commentWalker.currentNode)
    for (const comment of comments) comment.remove()
    const viewportContract = {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      scrollX: round(window.scrollX),
      scrollY: round(window.scrollY),
      visualViewport: window.visualViewport ? {
        width: round(window.visualViewport.width),
        height: round(window.visualViewport.height),
        offsetLeft: round(window.visualViewport.offsetLeft),
        offsetTop: round(window.visualViewport.offsetTop),
        scale: round(window.visualViewport.scale),
      } : null,
    }
    return {
      scopeBox: box(root),
      viewportContract,
      fullShell: {
        bodyDom: bodyClone.outerHTML.trim(),
        documentSize: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
        },
        landmarks: {
          navbar: box(document.querySelector('.jy-navbar')),
          footer: box(document.querySelector('.jy-footer')),
          main: box(document.querySelector('main')),
        },
        renderTree: shellElements.map(shellElement),
      },
    }
  })

  const renderTree = await scope.evaluate((root) => {
    const fields = [
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'background-color', 'border-top-color', 'border-top-width',
      'background-image', 'filter', 'backdrop-filter', 'clip-path', 'mask-image',
      'border-radius', 'box-shadow', 'padding-top', 'padding-right',
      'padding-bottom', 'padding-left', 'margin-top', 'margin-right',
      'margin-bottom', 'margin-left', 'display', 'visibility', 'opacity',
      'grid-template-columns', 'transform', 'position', 'fill', 'stroke',
      'stroke-width',
    ]
    const pseudoFields = [
      'content', 'display', 'visibility', 'opacity', 'position', 'inset',
      'width', 'height', 'color', 'background-color', 'background-image',
      'border-radius', 'box-shadow', 'filter', 'transform', 'clip-path',
      'mask-image',
    ]
    const pseudoSnapshot = (element, pseudo) => {
      const computed = getComputedStyle(element, pseudo)
      return Object.fromEntries(pseudoFields.map((field) => [field, computed.getPropertyValue(field)]))
    }
    return [root, ...root.querySelectorAll('*')].map((element, index) => {
      const computed = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        classes: typeof element.className === 'string' ? element.className : element.getAttribute('class') || '',
        box: {
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        },
        styles: Object.fromEntries(fields.map((field) => [field, computed.getPropertyValue(field)])),
        pseudo: {
          before: pseudoSnapshot(element, '::before'),
          after: pseudoSnapshot(element, '::after'),
        },
      }
    })
  })

  return {
    text,
    dom,
    aria,
    criticalStyles,
    scopeBox: layoutContract.scopeBox,
    viewportContract: layoutContract.viewportContract,
    fullShellSha256: sha256(stableJson(layoutContract.fullShell)),
    renderTreeSha256: sha256(stableJson(renderTree)),
  }
}

async function captureBehavioralSurface(page, scope, auditCase) {
  const styleFields = [
    'color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color', 'outline-style',
    'outline-width', 'outline-offset', 'box-shadow', 'opacity', 'transform',
    'text-decoration-line', 'text-decoration-color', 'cursor',
  ]
  const motionFields = [
    'animation-name', 'animation-duration', 'animation-delay',
    'animation-timing-function', 'animation-iteration-count',
    'animation-direction', 'animation-fill-mode', 'animation-play-state',
    'transition-property', 'transition-duration', 'transition-delay',
    'transition-timing-function', 'scroll-behavior',
  ]
  const cssKeyframesContract = await page.evaluate(() => {
    const rules = []
    const inaccessibleStylesheets = []
    const normalizeCssText = (cssText) => cssText.replace(/\s+/g, ' ').trim()
    const walk = (ruleList, conditions = [], parentRulePath = []) => {
      for (const [ruleIndex, rule] of [...ruleList].entries()) {
        const rulePath = [...parentRulePath, ruleIndex]
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          rules.push({
            name: rule.name || '',
            conditions,
            rulePath,
            cssText: normalizeCssText(rule.cssText),
          })
          continue
        }
        if (!('cssRules' in rule)) continue
        let nested
        try {
          nested = rule.cssRules
        } catch {
          continue
        }
        const condition = typeof rule.conditionText === 'string'
          ? `${rule.constructor?.name || 'group'}:${normalizeCssText(rule.conditionText)}`
          : rule.constructor?.name || 'group'
        walk(nested, [...conditions, condition], rulePath)
      }
    }
    for (const [stylesheetIndex, stylesheet] of [...document.styleSheets].entries()) {
      try {
        walk(stylesheet.cssRules, [], [stylesheetIndex])
      } catch {
        let href = 'inline'
        try {
          href = stylesheet.href ? new URL(stylesheet.href, document.baseURI).pathname : 'inline'
        } catch {}
        inaccessibleStylesheets.push({ stylesheetIndex, href })
      }
    }
    return { rules, inaccessibleStylesheets }
  })
  if (cssKeyframesContract.inaccessibleStylesheets.length > 0) {
    throw new Error(`CSSOM keyframes 存在無法讀取的 stylesheet：${cssKeyframesContract.inaccessibleStylesheets.length}`)
  }
  const keyframesSha256 = sha256(stableJson(cssKeyframesContract))
  const modes = []

  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ colorScheme: auditCase.theme, reducedMotion })
    await waitForTwoFrames(page)
    const motionContract = await scope.evaluate((root, fields) => (
      [root, ...root.querySelectorAll('*')].map((element, index) => {
        const computed = getComputedStyle(element)
        return {
          index,
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          classes: typeof element.className === 'string' ? element.className : element.getAttribute('class') || '',
          styles: Object.fromEntries(fields.map((field) => [field, computed.getPropertyValue(field)])),
          pseudo: Object.fromEntries(['::before', '::after'].map((pseudo) => {
            const pseudoStyle = getComputedStyle(element, pseudo)
            return [pseudo, Object.fromEntries(fields.map((field) => [field, pseudoStyle.getPropertyValue(field)]))]
          })),
        }
      })
    ), motionFields)

    const interactionContract = []
    for (const [region, rootLocator] of [
      ['scope', scope],
      ['navbar', page.locator('.jy-navbar').first()],
      ['footer', page.locator('.jy-footer').first()],
      ['main', page.locator('main').first()],
    ]) {
      const present = await rootLocator.count() > 0
      const regionContract = { region, present, controls: [] }
      if (!present) {
        interactionContract.push(regionContract)
        continue
      }
      const interactive = rootLocator.locator(
        'a[href],button,input,select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])',
      )
      const count = await interactive.count()
      for (let index = 0; index < count; index += 1) {
        const target = interactive.nth(index)
        if (!await target.isVisible().catch(() => false)) continue
        const describe = () => target.evaluate((element, fields) => {
          const computed = getComputedStyle(element)
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || '',
            role: element.getAttribute('role') || '',
            name: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || '',
            focus: element.matches(':focus'),
            focusVisible: element.matches(':focus-visible'),
            hover: element.matches(':hover'),
            styles: Object.fromEntries(fields.map((field) => [field, computed.getPropertyValue(field)])),
          }
        }, styleFields)
        const base = await describe()
        let hover = { unavailable: true }
        try {
          await target.hover({ timeout: 2_000 })
          hover = await describe()
        } catch {}
        await page.mouse.move(0, 0)
        let focus = { unavailable: true }
        try {
          await target.focus()
          focus = await describe()
        } catch {}
        await target.evaluate((element) => {
          if (element instanceof HTMLElement) element.blur()
        }).catch(() => {})
        regionContract.controls.push({ index, base, hover, focus })
      }
      interactionContract.push(regionContract)
    }

    const shellContract = await page.evaluate((fields) => {
      const snapshot = (selector) => {
        const element = document.querySelector(selector)
        if (!element) return null
        const computed = getComputedStyle(element)
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          classes: typeof element.className === 'string' ? element.className : element.getAttribute('class') || '',
          text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
          ariaLabel: element.getAttribute('aria-label') || '',
          styles: Object.fromEntries(fields.map((field) => [field, computed.getPropertyValue(field)])),
        }
      }
      return {
        htmlClasses: document.documentElement.className,
        bodyClasses: document.body.className,
        navbar: snapshot('.jy-navbar'),
        footer: snapshot('.jy-footer'),
        main: snapshot('main'),
      }
    }, [...styleFields, ...motionFields])

    modes.push({ reducedMotion, motionContract, interactionContract, shellContract })
  }
  await page.emulateMedia({ colorScheme: auditCase.theme, reducedMotion: 'reduce' })
  await waitForTwoFrames(page)
  return {
    keyframeRules: cssKeyframesContract.rules,
    inaccessibleKeyframeStylesheets: cssKeyframesContract.inaccessibleStylesheets,
    keyframesSha256,
    modes,
  }
}

async function captureWithDeterministicLocalFont(page, scope, auditCase) {
  return captureStableScreenshot(page, scope, auditCase)
}

async function captureSnapshot({ page, scope, auditCase, fixtureHash, browserVersion, screenshotDir, actualPayload, fontRecord, runtimeNotices, telemetryRequests }) {
  const behavior = await captureBehavioralSurface(page, scope, auditCase)
  await prepareStablePaint(page, scope)
  let semanticBefore
  let screenshotCapture
  let changedFields = []
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    semanticBefore = await captureSemanticSurface(scope)
    screenshotCapture = await captureWithDeterministicLocalFont(page, scope, auditCase)
    const semanticAfter = await captureSemanticSurface(scope)
    changedFields = Object.keys(semanticBefore).filter((field) => (
      stableJson(semanticBefore[field]) !== stableJson(semanticAfter[field])
    ))
    if (changedFields.length === 0) break
    await new Promise((resolveHydration) => setTimeout(resolveHydration, 100))
  }
  if (!semanticBefore || !screenshotCapture || changedFields.length > 0) {
    throw new Error(`E3 surface 在語意快照與截圖間發生變動：${auditCase.id}；fields=${changedFields.join(',') || 'unknown'}`)
  }

  mkdirSync(screenshotDir, { recursive: true })
  const screenshotName = `${auditCase.id}.png`
  const screenshotPath = join(screenshotDir, screenshotName)
  const screenshotBuffer = screenshotCapture.buffer
  const screenshotPerceptual = createE3PerceptualFingerprintFromPng(screenshotBuffer)
  writeFileSync(screenshotPath, screenshotBuffer)

  const payload = actualPayload || null

  return {
    schema: 'e3-surface/v3',
    id: auditCase.id,
    surface: auditCase.surface,
    state: auditCase.state,
    viewport: auditCase.viewport,
    theme: auditCase.theme,
    path: auditCase.path,
    selector: auditCase.selector,
    ...semanticBefore,
    behavior,
    screenshot: screenshotName,
    screenshotSha256: sha256(screenshotBuffer),
    screenshotStability: screenshotCapture.stability,
    screenshotPerceptual,
    payload,
    payloadSha256: payload ? sha256(stableJson(payload)) : null,
    fixtureSha256: fixtureHash,
    browserVersion,
    fontRecord,
    runtimeNotices,
    telemetryRequests,
    capturedAt,
    runId,
  }
}

function diffSnapshots(baseline, candidate, {
  baselineScreenshotDir: baselineImages,
  candidateScreenshotDir: candidateImages,
}) {
  const baselineById = new Map(baseline.snapshots.map((item) => [item.id, item]))
  const candidateById = new Map(candidate.snapshots.map((item) => [item.id, item]))
  const differences = []
  const toleratedVisualDifferences = []
  for (const id of [...new Set([...baselineById.keys(), ...candidateById.keys()])].sort()) {
    if (!baselineById.has(id) || !candidateById.has(id)) {
      differences.push({ id, fields: ['missing-case'] })
      continue
    }
    const baselineSnapshot = baselineById.get(id)
    const candidateSnapshot = candidateById.get(id)
    const result = compareE3Snapshots(baselineSnapshot, candidateSnapshot, {
      baselineScreenshotBuffer: readFileSync(join(baselineImages, baselineSnapshot.screenshot)),
      candidateScreenshotBuffer: readFileSync(join(candidateImages, candidateSnapshot.screenshot)),
    })
    if (!result.ok) differences.push({ id, fields: result.differences.map((item) => item.field) })
    if (result.ok && result.visualComparison?.mode === 'perceptual') {
      toleratedVisualDifferences.push({ id, visualComparison: result.visualComparison })
    }
  }
  return { differences, toleratedVisualDifferences }
}

async function main() {
  if (!existsSync(fixturePath)) throw new Error(`缺少 E3 fixture：${fixturePath}`)
  const startupAuditHashes = getAuditSupportHashes()
  if (mode === 'verify' && !existsSync(baselinePath)) throw new Error('缺少 E3 baseline；先執行 --record')
  if (mode === 'record' && selectedCaseIds.size > 0) {
    throw new Error('--case 只允許 verify 診斷；record 必須建立完整 80 案基準')
  }
  if (mode === 'record' && publicOnly) {
    throw new Error('--public-only 只允許 verify 診斷；canonical record 必須建立完整 80 案基準')
  }
  if (mode === 'verify') {
    const rootValidation = validateE3VerifyRoots(sourceRoot, runtimeRoot)
    if (!rootValidation.ok) {
      throw new Error(`verify 禁止 source/runtime 分離：${rootValidation.errors.join(', ')}`)
    }
  }
  if (!baselineRootArgument) {
    throw new Error('canonical E3 audit 必須由 release runner 提供 --baseline-root')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(releaseSessionArgument || '')) {
    throw new Error('canonical E3 audit 必須由 release runner 提供有效 --release-session-id')
  }
  assertRunnerOwnedBaselineRoot()
  assertNoRuntimeEnvironmentFiles(runtimeRoot)
  if (mode === 'verify' && !candidateOutputDirArgument) {
    throw new Error('canonical E3 verify 必須由 release runner 提供 --candidate-output-dir')
  }
  if (mode === 'record' && candidateOutputDirArgument) {
    throw new Error('E3 record 禁止指定 --candidate-output-dir')
  }

  const protectedSurfaceManifest = getE3ProtectedSurfaceManifest()
  const manifestResult = validateE3ProtectedSurfaceManifest(protectedSurfaceManifest)
  if (!manifestResult.ok) throw new Error(`E3 protected manifest 不完整：${manifestResult.errors.join(', ')}`)
  const missingProtectedFiles = protectedSurfaceManifest
    .filter((item) => item.baseOptional !== true)
    .map((item) => item.path)
    .filter((relativePath) => !existsSync(join(sourceRoot, relativePath)))
  if (missingProtectedFiles.length > 0) {
    throw new Error(`E3 protected surface 不存在，禁止繼續：${missingProtectedFiles.join(', ')}`)
  }

  const baseline = mode === 'verify' ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
  const trustedBaseRef = baseRefArgument || 'origin/main'
  if (trustedBaseRef !== 'origin/main') throw new Error('E3 parity 只接受 --base-ref=origin/main')
  const inspectedContexts = mode === 'record'
    ? assertRecordPreflight()
    : {
        git: inspectGitContext(sourceRoot, trustedBaseRef),
        runtimeGit: inspectGitContext(runtimeRoot, trustedBaseRef),
      }
  const trustedBaseCommit = inspectedContexts.git.baseCommit
  const trustedBaseHashes = getProtectedCommitHashes(
    sourceRoot,
    trustedBaseCommit,
    protectedSurfaceManifest,
  )
  const trustContext = {
    baseCommit: trustedBaseCommit,
    protectedSourceSha256: trustedBaseHashes,
    baselineCorpusSha256: trustedBaselineCorpusArgument,
  }
  if (mode === 'verify' && !/^[a-f0-9]{64}$/.test(trustedBaselineCorpusArgument || '')) {
    throw new Error('verify 必須由 release runner 提供 --trusted-baseline-corpus-sha256')
  }
  if (baseline) {
    const baselineValidation = validateE3BaselineBundle(
      baseline,
      baselineScreenshotDir,
      trustContext,
    )
    if (!baselineValidation.ok) {
      throw new Error(`E3 baseline 不可信，禁止以此驗證：${baselineValidation.errors.join(', ')}`)
    }
  }
  const preflightSourceHashes = getProtectedSourceHashes(sourceRoot, protectedSurfaceManifest)
  const preflightRuntimeHashes = getProtectedSourceHashes(runtimeRoot, protectedSurfaceManifest)
  if (mode === 'record' && stableJson(preflightSourceHashes) !== stableJson(trustedBaseHashes)) {
    throw new Error('E3 record source bytes 與可信 base commit 不一致')
  }
  if (mode === 'record' && stableJson(preflightSourceHashes) !== stableJson(preflightRuntimeHashes)) {
    throw new Error('E3 record source/runtime protected bytes 不一致')
  }
  let sharedSourceDifferences = []
  let sharedSourceCoverage = []
  if (mode === 'verify') {
    const sourceDifferences = classifyE3ProtectedSourceDifferences(
      baseline.protectedSourceSha256,
      preflightSourceHashes,
      protectedSurfaceManifest,
    )
    sharedSourceDifferences = sourceDifferences.shared.map((item) => item.path)
    sharedSourceCoverage = sourceDifferences.shared.map((item) => ({
      path: item.path,
      requiredGates: [...item.coverage],
    }))
    if (sourceDifferences.blocking.length > 0) {
      console.log(JSON.stringify({
        ok: false,
        mode,
        stage: 'protected-semantic-source-preflight',
        differences: [{
          id: 'protected-semantic-source',
          fields: sourceDifferences.blocking.map((item) => item.path),
        }],
        sharedSourceDifferences,
        sharedSourceCoverage,
        baselineCommit: baseline.provenance.git.baseCommit,
        candidateHead: inspectedContexts.git.head,
      }))
      process.exitCode = 1
      return
    }
  }

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const fixtureHash = startupAuditHashes.fixture
  const nextPort = await reservePort()
  const baseUrl = `http://127.0.0.1:${nextPort}`
  const sourceNextCli = resolve(runtimeRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  const nextCli = existsSync(sourceNextCli)
    ? sourceNextCli
    : resolve(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  const nextLogs = []

  let fixtureServer
  let nextProcess
  let browser
  let runtimeFileState
  let deploymentScriptState
  let productionEnvironment
  let buildId
  let nextVersion
  let browserVersion
  let browserToolchain
  let runtimeProcessTermination
  let dependencyTreeContract
  let verificationSucceeded = false
  let retainCandidateEvidence = false
  const stagedBaselinePath = join(baselineRoot, `.baseline-${runId}.json`)
  const candidateDir = mode === 'record'
    ? join(baselineRoot, `.screenshots-${runId}`)
    : resolve(candidateOutputDirArgument)
  assertSafeTransientDirectory(
    candidateDir,
    mode === 'record' ? '.screenshots-' : '.candidate-staging-',
    { mustNotExist: true },
  )

  try {
    fixtureServer = await createE3FixtureServer({ fixture, port: 0 })
    runtimeFileState = captureRuntimeFileState(runtimeRoot)
    dependencyTreeContract = getDependencyTreeContract(runtimeRoot)
    browserToolchain = resolveBrowserToolchain(runtimeRoot)
    deploymentScriptState = materializeDeploymentScriptBytes(runtimeRoot)
    const devtoolsWarningSha384 = sha384Base64File(deploymentScriptState.path)
    productionEnvironment = createProductionParityEnvironment(fixtureServer.origin)
    await buildProductionBundle(nextCli, productionEnvironment, nextLogs)
    const buildIdPath = join(runtimeRoot, '.next', 'BUILD_ID')
    if (!existsSync(buildIdPath)) throw new Error('E3 production parity build 缺少 .next/BUILD_ID')
    buildId = readFileSync(buildIdPath, 'utf8').trim()
    nextVersion = JSON.parse(readFileSync(join(runtimeRoot, 'node_modules', 'next', 'package.json'), 'utf8')).version
    nextProcess = spawn(process.execPath, [nextCli, 'start', '--port', String(nextPort), '--hostname', '127.0.0.1'], {
      cwd: runtimeRoot,
      env: productionEnvironment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    nextProcess.once('error', (error) => nextLogs.push(`next start spawn error: ${error.message}`))
    for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
      stream?.on('data', (chunk) => {
        nextLogs.push(String(chunk))
        if (nextLogs.length > 160) nextLogs.shift()
      })
    }
    await waitForPage(`${baseUrl}/`, nextProcess)
    browser = await browserToolchain.chromium.launch({
      headless: true,
      executablePath: browserToolchain.provenance.browserExecutable.path,
    })
    browserVersion = await browser.version()
    const fontRecords = []
    const allCases = getE3SurfaceCases()
    let cases = publicOnly
      ? allCases.filter((item) => item.surface === 'home' || item.surface === 'pricing')
      : allCases
    if (selectedCaseIds.size > 0) {
      cases = cases.filter((item) => selectedCaseIds.has(item.id))
      if (cases.length !== selectedCaseIds.size) {
        const foundIds = new Set(cases.map((item) => item.id))
        const missingIds = [...selectedCaseIds].filter((id) => !foundIds.has(id))
        throw new Error(`未知 E3 case：${missingIds.join(', ')}`)
      }
    }
    const snapshots = []

    mkdirSync(candidateDir, { recursive: false })

    for (const [index, auditCase] of cases.entries()) {
      const context = await browser.newContext({
        viewport: { width: auditCase.viewport.width, height: auditCase.viewport.height },
        screen: { width: auditCase.viewport.width, height: auditCase.viewport.height },
        userAgent: AUDIT_BROWSER_USER_AGENT,
        extraHTTPHeaders: {
          'x-vercel-forwarded-for': getAuditClientIp(index),
        },
        bypassCSP: true,
        locale: 'zh-TW',
        timezoneId: 'Asia/Hong_Kong',
        colorScheme: auditCase.theme,
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
        isMobile: auditCase.viewport.width <= 480,
        hasTouch: auditCase.viewport.width <= 480,
      })
      const telemetryCapture = await prepareContext(context, fixture, baseUrl)
      const page = await context.newPage()
      const pageErrors = []
      const browserExceptionDetails = []
      const consoleErrors = []
      const requestFailures = []
      const serverErrors = []
      page.on('pageerror', (error) => pageErrors.push(
        error instanceof Error ? (error.stack || error.message) : String(error),
      ))
      const cdpSession = await context.newCDPSession(page)
      cdpSession.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
        browserExceptionDetails.push({
          text: exceptionDetails?.text || '',
          description: exceptionDetails?.exception?.description || '',
          url: exceptionDetails?.url || '',
          lineNumber: exceptionDetails?.lineNumber,
          columnNumber: exceptionDetails?.columnNumber,
          callFrames: (exceptionDetails?.stackTrace?.callFrames || []).slice(0, 5).map((frame) => ({
            functionName: frame.functionName,
            url: frame.url,
            lineNumber: frame.lineNumber,
            columnNumber: frame.columnNumber,
          })),
        })
      })
      await cdpSession.send('Runtime.enable')
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('requestfailed', (request) => {
        if (request.url().startsWith(baseUrl) || request.url().startsWith(fixtureServer.origin)) {
          requestFailures.push({
            method: request.method(),
            url: request.url(),
            errorText: request.failure()?.errorText || 'failed',
            resourceType: request.resourceType(),
            headers: request.headers(),
          })
        }
      })
      page.on('response', (response) => {
        if (response.status() >= 500 && (response.url().startsWith(baseUrl) || response.url().startsWith(fixtureServer.origin))) {
          serverErrors.push(`${response.status()} ${response.url()}`)
        }
      })
      await page.clock.setFixedTime(new Date(fixture.fixed_time))

      try {
        const { scope } = await prepareState(page, auditCase, fixture, baseUrl)
        await new Promise((resolveTelemetry) => setTimeout(resolveTelemetry, 250))
        const initialTelemetryRequests = stableTelemetryRequests(telemetryCapture.requests)
        const initialConsole = classifyE3ConsoleErrors(consoleErrors, {
          origin: baseUrl,
          devtoolsWarningSha384,
        })
        const initialRequestFailures = partitionFirstPartyRequestFailures(requestFailures, baseUrl)
        if (pageErrors.length > 0 || initialConsole.fatal.length > 0 || initialRequestFailures.fatal.length > 0 || serverErrors.length > 0 || telemetryCapture.errors.length > 0) {
          throw new Error(`E3 browser runtime error：${auditCase.id}；page=${pageErrors.join(' | ') || 'none'}；exceptions=${JSON.stringify(browserExceptionDetails)}；console=${initialConsole.fatal.join(' | ') || 'none'}；request=${JSON.stringify(initialRequestFailures.fatal)}；server=${serverErrors.join(' | ') || 'none'}；telemetry=${telemetryCapture.errors.join(' | ') || 'none'}`)
        }
        const fontRecord = await captureFontRecord(page, scope)
        fontRecords.push({ caseId: auditCase.id, ...fontRecord })
        const snapshot = await captureSnapshot({
          page,
          scope,
          auditCase,
          fixtureHash,
          browserVersion,
          screenshotDir: candidateDir,
          actualPayload: null,
          fontRecord,
          runtimeNotices: initialConsole.known,
          telemetryRequests: initialTelemetryRequests,
        })
        if (auditCase.state === 'checkout-confirmation') {
          const actualPayload = await capturePayload(page)
          if (stableJson(actualPayload) !== stableJson(fixture.checkout.expectedPayload)) {
            throw new Error(`checkout payload 與 fixture 不一致：${auditCase.id}`)
          }
          snapshot.payload = actualPayload
          snapshot.payloadSha256 = sha256(stableJson(actualPayload))
        }
        snapshots.push(snapshot)
        const finalConsole = classifyE3ConsoleErrors(consoleErrors, {
          origin: baseUrl,
          devtoolsWarningSha384,
        })
        const finalTelemetryRequests = stableTelemetryRequests(telemetryCapture.requests)
        const finalRequestFailures = partitionFirstPartyRequestFailures(requestFailures, baseUrl)
        if (stableJson(initialTelemetryRequests) !== stableJson(finalTelemetryRequests)) {
          throw new Error(`E3 telemetry 狀態在截圖期間改變：${auditCase.id}`)
        }
        if (stableJson(initialConsole.known) !== stableJson(finalConsole.known)) {
          throw new Error(`E3 browser known-console 狀態在截圖期間改變：${auditCase.id}`)
        }
        if (pageErrors.length > 0 || finalConsole.fatal.length > 0 || finalRequestFailures.fatal.length > 0 || serverErrors.length > 0 || telemetryCapture.errors.length > 0) {
          throw new Error(`E3 browser runtime error：${auditCase.id}；page=${pageErrors.join(' | ') || 'none'}；exceptions=${JSON.stringify(browserExceptionDetails)}；console=${finalConsole.fatal.join(' | ') || 'none'}；request=${JSON.stringify(finalRequestFailures.fatal)}；server=${serverErrors.join(' | ') || 'none'}；telemetry=${telemetryCapture.errors.join(' | ') || 'none'}`)
        }
        console.log(`[${index + 1}/${cases.length}] PASS ${auditCase.id}`)
      } finally {
        await context.close()
      }
    }

    const cleanup = await cleanupProductionParityResources({
      browser,
      nextProcess,
      fixtureServer,
      deploymentScriptState,
      runtimeFileState,
    })
    runtimeProcessTermination = nextProcess
      ? { exitCode: nextProcess.exitCode, signalCode: nextProcess.signalCode }
      : null
    if (cleanup.completed.browser) browser = undefined
    if (cleanup.completed.nextProcess) nextProcess = undefined
    if (cleanup.completed.fixtureServer) fixtureServer = undefined
    if (cleanup.completed.deploymentScriptState) deploymentScriptState = undefined
    if (cleanup.completed.runtimeFileState) runtimeFileState = undefined
    if (cleanup.errors.length > 0) {
      throw new AggregateError(cleanup.errors, 'E3 production parity cleanup 不完整')
    }

    const postflightSourceHashes = getProtectedSourceHashes(sourceRoot, protectedSurfaceManifest)
    if (stableJson(preflightSourceHashes) !== stableJson(postflightSourceHashes)) {
      throw new Error('E3 protected source 在稽核執行期間發生變動')
    }
    const postflightRuntimeHashes = getProtectedSourceHashes(runtimeRoot, protectedSurfaceManifest)
    if (stableJson(preflightRuntimeHashes) !== stableJson(postflightRuntimeHashes)) {
      throw new Error('E3 runtime protected source 在稽核執行期間發生變動')
    }
    const postflightAuditHashes = getAuditSupportHashes()
    if (stableJson(startupAuditHashes) !== stableJson(postflightAuditHashes)) {
      throw new Error('E3 稽核器、core、fixture server 或 fixture 在執行期間發生變動')
    }
    const postflightBrowserToolchain = resolveBrowserToolchain(runtimeRoot)
    if (stableJson(browserToolchain.provenance) !== stableJson(postflightBrowserToolchain.provenance)) {
      throw new Error('E3 Playwright／browser toolchain 在稽核執行期間發生變動')
    }
    const sourceHashes = postflightSourceHashes
    const runtimeHashes = postflightRuntimeHashes
    const provenance = buildProvenance({
      git: inspectedContexts.git,
      runtimeGit: inspectedContexts.runtimeGit,
      browserVersion,
      browserToolchain: browserToolchain.provenance,
      fontRecords,
      auditHashes: startupAuditHashes,
      runtime: {
        mode: 'production-next-build-start',
        bundler: 'webpack',
        nextVersion,
        buildId,
        processTermination: runtimeProcessTermination,
        dependencyTreeSha256: dependencyTreeContract.sha256,
        environmentContractSha256: sha256(stableJson(getProductionEnvironmentContract(productionEnvironment))),
        sourceSeparated: sourceRoot.toLowerCase() !== runtimeRoot.toLowerCase(),
      },
    })
    const result = {
      schema: 'e3-freeze-baseline/v5',
      mode,
      releaseSessionId: releaseSessionArgument,
      publicOnly,
      capturedAt,
      runId,
      fixtureSha256: fixtureHash,
      protectedSurfaceManifest,
      protectedSourceSha256: sourceHashes,
      protectedRuntimeSha256: runtimeHashes,
      provenance,
      snapshots,
    }

    if (mode === 'record') {
      const provenanceResult = validateE3BaselineProvenance(provenance)
      if (!provenanceResult.ok) {
        throw new Error(`E3 baseline provenance 不完整：${provenanceResult.errors.join(', ')}`)
      }
      mkdirSync(baselineRoot, { recursive: true })
      writeFileSync(stagedBaselinePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
      const baselineCorpusSha256 = computeE3BaselineCorpusSha256(result, candidateDir)
      if (existsSync(baselinePath) || existsSync(baselineScreenshotDir)) {
        throw new Error('E3 runner-owned session 在 record 期間出現既有 baseline/screenshots，拒絕覆寫')
      }
      replaceE3BaselineBundleAtomically({
        baselinePath,
        screenshotDir: baselineScreenshotDir,
        candidateBaselinePath: stagedBaselinePath,
        candidateScreenshotDir: candidateDir,
        trustContext: {
          ...trustContext,
          baselineCorpusSha256,
        },
      })
      console.log(JSON.stringify({
        ok: true,
        mode,
        cases: snapshots.length,
        baselinePath,
        baselineCorpusSha256,
      }))
      return
    }

    writeFileSync(join(candidateDir, 'candidate.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    const comparisonBaseline = selectedCaseIds.size > 0
      ? {
          ...baseline,
          snapshots: baseline.snapshots.filter((item) => selectedCaseIds.has(item.id)),
        }
      : baseline
    const snapshotComparison = diffSnapshots(comparisonBaseline, result, {
      baselineScreenshotDir,
      candidateScreenshotDir: candidateDir,
    })
    let differences = snapshotComparison.differences
    const toleratedVisualDifferences = snapshotComparison.toleratedVisualDifferences
    const sourceDifferences = classifyE3ProtectedSourceDifferences(
      baseline.protectedSourceSha256,
      sourceHashes,
      protectedSurfaceManifest,
    )
    if (sourceDifferences.blocking.length > 0) {
      differences.push({
        id: 'protected-semantic-source',
        fields: sourceDifferences.blocking.map((item) => item.path),
      })
    }
    for (const key of ['tool', 'node', 'browser', 'fonts', 'os']) {
      if (selectedCaseIds.size > 0 && key === 'fonts') continue
      if (stableJson(baseline.provenance[key]) !== stableJson(provenance[key])) {
        differences.push({ id: 'provenance', fields: [key] })
      }
    }
    const baselineRuntimeContract = {
      mode: baseline.provenance.runtime?.mode,
      bundler: baseline.provenance.runtime?.bundler,
      nextVersion: baseline.provenance.runtime?.nextVersion,
      environmentContractSha256: baseline.provenance.runtime?.environmentContractSha256,
      dependencyTreeSha256: baseline.provenance.runtime?.dependencyTreeSha256,
    }
    const candidateRuntimeContract = {
      mode: provenance.runtime?.mode,
      bundler: provenance.runtime?.bundler,
      nextVersion: provenance.runtime?.nextVersion,
      environmentContractSha256: provenance.runtime?.environmentContractSha256,
      dependencyTreeSha256: provenance.runtime?.dependencyTreeSha256,
    }
    if (stableJson(baselineRuntimeContract) !== stableJson(candidateRuntimeContract)) {
      differences.push({ id: 'provenance', fields: ['runtime'] })
    }
    differences = finalizeE3ReleaseDifferences(differences, toleratedVisualDifferences)
    verificationSucceeded = differences.length === 0
    retainCandidateEvidence = toleratedVisualDifferences.length > 0
    const candidateCorpusSha256 = computeE3BaselineCorpusSha256(result, candidateDir)
    const comparisonReceipt = {
      schema: 'e3-comparison-receipt/v1',
      runId,
      releaseSessionId: releaseSessionArgument,
      capturedAt,
      ok: verificationSucceeded,
      cases: snapshots.length,
      baseline: {
        commit: trustedBaseCommit,
        corpusSha256: trustedBaselineCorpusArgument,
        documentSha256: sha256File(baselinePath),
      },
      candidate: {
        head: inspectedContexts.git.head,
        corpusSha256: candidateCorpusSha256,
        documentSha256: sha256File(join(candidateDir, 'candidate.json')),
      },
      differences,
      toleratedVisualDifferences,
      sharedSourceDifferences,
      sharedSourceCoverage,
    }
    let comparisonReceiptPath = join(candidateDir, 'comparison-receipt.json')
    writeFileSync(comparisonReceiptPath, `${JSON.stringify(comparisonReceipt, null, 2)}\n`, 'utf8')
    if (verificationSucceeded && !keepCandidate && !retainCandidateEvidence) {
      const durableReceiptDir = join(process.env.TEMP || process.cwd(), 'jianyuan-e3-freeze-receipts')
      mkdirSync(durableReceiptDir, { recursive: true })
      const durableReceiptPath = join(durableReceiptDir, `${runId}.json`)
      writeFileSync(durableReceiptPath, `${JSON.stringify(comparisonReceipt, null, 2)}\n`, 'utf8')
      comparisonReceiptPath = durableReceiptPath
    }
    const comparisonReceiptSha256 = sha256File(comparisonReceiptPath)
    console.log(JSON.stringify({
      ok: verificationSucceeded,
      mode,
      cases: snapshots.length,
      differences,
      toleratedVisualDifferences,
      sharedSourceDifferences,
      sharedSourceCoverage,
      candidateDir: verificationSucceeded && !keepCandidate && !retainCandidateEvidence ? null : candidateDir,
      comparisonReceiptPath,
      comparisonReceiptSha256,
    }))
    if (!verificationSucceeded) process.exitCode = 1
  } catch (error) {
    const logTail = nextLogs.join('').split(/\r?\n/).filter(Boolean).slice(-30)
    console.error(redactSensitiveOutput(error instanceof Error ? error.stack : String(error)))
    if (logTail.length) console.error(`Next log tail:\n${redactSensitiveOutput(logTail.join('\n'))}`)
    process.exitCode = 1
  } finally {
    const cleanup = await cleanupProductionParityResources({
      browser,
      nextProcess,
      fixtureServer,
      deploymentScriptState,
      runtimeFileState,
    })
    if (cleanup.errors.length > 0) {
      console.error(redactSensitiveOutput(`E3 production parity cleanup 不完整：${cleanup.errors.join(' | ')}`))
      process.exitCode = 1
    }
    try {
      if (mode === 'verify' && verificationSucceeded && !keepCandidate && !retainCandidateEvidence) {
        removeSafeTransientDirectory(candidateDir, '.candidate-staging-')
      }
    } catch (cleanupError) {
      console.error(redactSensitiveOutput(`E3 candidate cleanup 失敗：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`))
      process.exitCode = 1
    }
    try {
      if (mode === 'record') {
        rmSync(stagedBaselinePath, { force: true })
        removeSafeTransientDirectory(candidateDir, '.screenshots-')
      }
    } catch (cleanupError) {
      console.error(redactSensitiveOutput(`E3 record cleanup 失敗：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`))
      process.exitCode = 1
    }
  }
}

await main()
