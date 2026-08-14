#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeE3BaselineCorpusSha256 } from './lib/e3-freeze-core.mjs'
import { compareProductionCspReceipts } from './lib/e3-production-csp-core.mjs'

const TRUSTED_VERIFIER_FILES = Object.freeze([
  'scripts/e3-freeze-release-audit.mjs',
  'scripts/e3-freeze-audit.mjs',
  'scripts/e3-production-csp-smoke.mjs',
  'scripts/lib/e3-freeze-core.mjs',
  'scripts/lib/e3-fixture-server.mjs',
  'scripts/lib/e3-production-csp-core.mjs',
  'scripts/lib/e3-navigation-probe.mjs',
  'scripts/lib/e3-production-fetch-preload.cjs',
  '__tests__/harness.mjs',
  '__tests__/35-e3-freeze-contract.test.mjs',
  '__tests__/36-e3-fixture-server.test.mjs',
  '__tests__/38-consultation-routes.test.mjs',
  '__tests__/45-consultation-private-chrome.test.mjs',
  '__tests__/46-consultation-report-link-integration.test.mjs',
  '__tests__/49-calculator-request.test.mjs',
  '__tests__/54-consultation-telemetry-privacy.test.mjs',
  '__tests__/60-private-telemetry-loader.test.mjs',
  '__tests__/66-e3-production-csp-smoke-contract.test.mjs',
  '__tests__/66-e3-server-checkout-contract.test.mjs',
  '__tests__/67-e3-checkout-route-integration.test.mjs',
  '__tests__/68-e3-generation-golden-contract.test.mjs',
  '__tests__/69-e3-navigation-probe.test.mjs',
  '__tests__/support/e3-generation-module-hooks.mjs',
  '__tests__/fixtures/e3-generation/golden-v1.json',
  '__tests__/fixtures/e3-generation/base-record-receipt-v1.json',
  '__tests__/fixtures/e3-freeze/runtime-fixtures.json',
])

const PINNED_E3_CHECKS = Object.freeze([
  { id: 'freeze-contract', path: '__tests__/35-e3-freeze-contract.test.mjs', gates: [] },
  { id: 'fixture-server', path: '__tests__/36-e3-fixture-server.test.mjs', gates: [] },
  { id: 'route-contract', path: '__tests__/38-consultation-routes.test.mjs', gates: ['route-contract', 'email-route-contract'] },
  { id: 'route-chrome-contract', path: '__tests__/45-consultation-private-chrome.test.mjs', gates: ['route-chrome-contract'] },
  { id: 'email-route-contract', path: '__tests__/46-consultation-report-link-integration.test.mjs', gates: ['email-route-contract'] },
  { id: 'calculator-request', path: '__tests__/49-calculator-request.test.mjs', gates: ['generation-golden'] },
  { id: 'telemetry-privacy', path: '__tests__/54-consultation-telemetry-privacy.test.mjs', gates: ['telemetry-contract'] },
  { id: 'private-telemetry-loader', path: '__tests__/60-private-telemetry-loader.test.mjs', gates: ['telemetry-contract'] },
  { id: 'csp-contract', path: '__tests__/66-e3-production-csp-smoke-contract.test.mjs', gates: ['csp-contract'] },
  { id: 'server-checkout', path: '__tests__/66-e3-server-checkout-contract.test.mjs', gates: ['checkout-contract'] },
  { id: 'checkout-integration', path: '__tests__/67-e3-checkout-route-integration.test.mjs', gates: ['checkout-contract'] },
  { id: 'generation-golden', path: '__tests__/68-e3-generation-golden-contract.test.mjs', gates: ['generation-golden'] },
  { id: 'navigation-probe', path: '__tests__/69-e3-navigation-probe.test.mjs', gates: [] },
])

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sha256File(path) {
  return sha256(readFileSync(path))
}

function parseFinalJson(stdout, stage) {
  const lines = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index])
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }
  throw new Error(`${stage} 沒有輸出可驗證的 JSON 結果`)
}

const AUDIT_HOST_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA', 'COMSPEC', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS', 'OS', 'PATH', 'PATHEXT',
  'PROCESSOR_ARCHITECTURE', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR',
])

function pickAuditHostEnvironment() {
  const environment = {}
  for (const requestedKey of AUDIT_HOST_ENVIRONMENT_KEYS) {
    const actualKey = Object.keys(process.env).find((key) => key.toUpperCase() === requestedKey)
    if (actualKey && process.env[actualKey] != null) environment[actualKey] = process.env[actualKey]
  }
  return environment
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

function runAudit(auditScript, candidateRoot, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [auditScript, ...args], {
      cwd: candidateRoot,
      env: pickAuditHostEnvironment(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const append = (current, chunk) => {
      const next = current + String(chunk)
      if (Buffer.byteLength(next, 'utf8') > 4 * 1024 * 1024) {
        throw new Error('E3 audit 輸出超過 4 MiB 安全上限')
      }
      return next
    }
    child.stdout.on('data', (chunk) => {
      try { stdout = append(stdout, chunk) } catch (error) { child.kill(); rejectRun(error) }
    })
    child.stderr.on('data', (chunk) => {
      try { stderr = append(stderr, chunk) } catch (error) { child.kill(); rejectRun(error) }
    })
    child.once('error', rejectRun)
    child.once('exit', (code) => resolveRun({ code, stdout, stderr }))
  })
}

function requireDirectory(path, label) {
  if (!path || !existsSync(path)) throw new Error(`缺少 ${label}：${path || '未提供'}`)
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失敗：${String(result.stderr || result.stdout).trim()}`)
  }
  return String(result.stdout).trim()
}

function canonicalRealPath(path) {
  return normalizedPath(realpathSync.native(path))
}

function gitIdentity(root) {
  const topLevel = runGit(['rev-parse', '--show-toplevel'], root)
  const rawGitDir = runGit(['rev-parse', '--git-dir'], root)
  const gitDir = resolve(topLevel, rawGitDir)
  return {
    topLevel: canonicalRealPath(topLevel),
    gitDir: canonicalRealPath(gitDir),
  }
}

function assertGitSnapshot({
  candidateRoot,
  candidateHead,
  trustedBaseCommit,
  baseSourceRoot,
  baseRuntimeRoot,
  candidateSnapshotRoot,
  baseSourceSnapshotRoot,
  baseRuntimeSnapshotRoot,
  runnerSha256,
}, stage) {
  const failures = []
  if (runGit(['status', '--porcelain=v1', '--untracked-files=all'], candidateRoot) !== '') failures.push('candidate_dirty')
  if (runGit(['rev-parse', 'HEAD'], candidateRoot) !== candidateHead) failures.push('candidate_head_changed')
  if (runGit(['rev-parse', '--verify', 'origin/main^{commit}'], candidateRoot) !== trustedBaseCommit) failures.push('origin_main_changed')
  if (runGit(['rev-parse', 'HEAD'], baseSourceRoot) !== trustedBaseCommit) failures.push('base_source_head_changed')
  if (runGit(['rev-parse', 'HEAD'], baseRuntimeRoot) !== trustedBaseCommit) failures.push('base_runtime_head_changed')
  if (runGit(['status', '--porcelain=v1', '--untracked-files=all'], baseSourceRoot) !== '') failures.push('base_source_dirty')
  if (runGit(['status', '--porcelain=v1', '--untracked-files=all'], baseRuntimeRoot) !== '') failures.push('base_runtime_dirty')
  for (const [label, root, expectedHead] of [
    ['candidate_snapshot', candidateSnapshotRoot, candidateHead],
    ['base_source_snapshot', baseSourceSnapshotRoot, trustedBaseCommit],
    ['base_runtime_snapshot', baseRuntimeSnapshotRoot, trustedBaseCommit],
  ]) {
    if (!root) continue
    if (runGit(['rev-parse', 'HEAD'], root) !== expectedHead) failures.push(`${label}_head_changed`)
    if (runGit(['status', '--porcelain=v1', '--untracked-files=all'], root) !== '') failures.push(`${label}_dirty`)
  }
  const executingRunnerPath = fileURLToPath(import.meta.url)
  if (sha256File(executingRunnerPath) !== runnerSha256) failures.push('executing_runner_changed')
  if (failures.length > 0) throw new Error(`E3 release ${stage} Git snapshot 改變：${failures.join(', ')}`)
}

function normalizedPath(path) {
  return resolve(path).replace(/[\\/]+$/, '').toLowerCase()
}

function assertNoReparsePoints(root) {
  const rootIdentity = canonicalRealPath(root)
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) throw new Error(`E3 evidence 禁止 symbolic link／junction：${current}`)
    const currentIdentity = canonicalRealPath(current)
    const relativeIdentity = relative(rootIdentity, currentIdentity)
    if (relativeIdentity === '..' || relativeIdentity.startsWith(`..${sep}`)) {
      throw new Error(`E3 path 逃逸 trusted root：${current}`)
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) pending.push(join(current, entry))
    } else if (!stat.isFile() || Number(stat.nlink) !== 1) {
      throw new Error(`E3 trusted file 必須是單一 hardlink 的 regular file：${current}`)
    }
  }
}

function assertPathComponentsNoReparse(path) {
  let current = resolve(path)
  const components = []
  while (true) {
    components.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  for (const component of components.reverse()) {
    if (!existsSync(component)) continue
    const stat = lstatSync(component)
    if (stat.isSymbolicLink()) throw new Error(`E3 path ancestor 禁止 reparse：${component}`)
  }
}

function isContainedPath(parent, child) {
  const relativePath = relative(canonicalRealPath(parent), canonicalRealPath(child))
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
}

function isLexicallyContainedPath(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child))
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
}

function assertOwnedStagingDirectory(actualPath, expectedPath, parentPath) {
  if (!actualPath || normalizedPath(actualPath) !== normalizedPath(expectedPath)) {
    throw new Error('E3 verify 回傳非 runner 持有的 candidate staging path')
  }
  if (!existsSync(expectedPath)) throw new Error('E3 verify 缺少 runner 持有的 candidate staging directory')
  const parentRealPath = normalizedPath(realpathSync(parentPath))
  const stagingRealPath = realpathSync(expectedPath)
  if (normalizedPath(dirname(stagingRealPath)) !== parentRealPath) {
    throw new Error('E3 candidate staging directory 逃逸 runner evidence session')
  }
  assertNoReparsePoints(expectedPath)
}

function persistRunEvidence(sessionDir, stage, run) {
  const stdout = redactSensitiveOutput(run?.stdout)
  const stderr = redactSensitiveOutput(run?.stderr)
  const stdoutPath = join(sessionDir, `${stage}.stdout.redacted.log`)
  const stderrPath = join(sessionDir, `${stage}.stderr.redacted.log`)
  writeFileSync(stdoutPath, stdout, 'utf8')
  writeFileSync(stderrPath, stderr, 'utf8')
  return {
    exitCode: run?.code ?? null,
    stdoutPath,
    stdoutSha256: sha256(stdout),
    stderrPath,
    stderrSha256: sha256(stderr),
    redaction: 'secret-values-and-key-patterns/v1',
  }
}

function safeParseFinalJson(stdout) {
  try { return parseFinalJson(stdout, 'subprocess') } catch { return null }
}

function assertDistinctGitWorktrees(entries) {
  const identities = entries.map(([label, root]) => ({ label, root, ...gitIdentity(root) }))
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      if (
        identities[left].topLevel === identities[right].topLevel
        || identities[left].gitDir === identities[right].gitDir
      ) throw new Error(`${identities[left].label} 與 ${identities[right].label} 指向同一 Git worktree identity`)
    }
  }
  return identities
}

function createDetachedWorktree(repositoryRoot, path, commit) {
  if (existsSync(path)) throw new Error(`runner-owned detached worktree 已存在：${path}`)
  runGit(['worktree', 'add', '--detach', path, commit], repositoryRoot)
  return path
}

function installPinnedDependencies(root) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npmCommand, ['ci', '--no-audit', '--no-fund'], {
    cwd: root,
    env: pickAuditHostEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1_000,
  })
  const stdout = redactSensitiveOutput(result.stdout)
  const stderr = redactSensitiveOutput(result.stderr)
  if (result.status !== 0) {
    throw new Error(`npm ci 失敗，exit=${result.status}\n${stderr.slice(-4000)}`)
  }
  return {
    exitCode: result.status,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
  }
}

function verifyCandidateVerifierFiles(candidateRoot, verifierRoot) {
  const records = []
  for (const relativePath of TRUSTED_VERIFIER_FILES) {
    const candidatePath = join(candidateRoot, relativePath)
    const verifierPath = join(verifierRoot, relativePath)
    if (!existsSync(candidatePath)) throw new Error(`candidate 缺少 pinned verifier/check file：${relativePath}`)
    const candidateSha256 = sha256File(candidatePath)
    const verifierSha256 = sha256File(verifierPath)
    if (candidateSha256 !== verifierSha256) {
      throw new Error(`candidate verifier/check file 不等於 trusted bundle：${relativePath}`)
    }
    records.push({ path: relativePath, sha256: candidateSha256 })
  }
  return records
}

function runPinnedE3Checks(candidateRoot) {
  const records = []
  const passedGates = new Set()
  for (const check of PINNED_E3_CHECKS) {
    const result = spawnSync(process.execPath, [check.path], {
      cwd: candidateRoot,
      env: pickAuditHostEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5 * 60 * 1_000,
      maxBuffer: 8 * 1024 * 1024,
    })
    const stdout = redactSensitiveOutput(result.stdout)
    const stderr = redactSensitiveOutput(result.stderr)
    if (result.error || result.status !== 0) {
      throw new Error(`pinned E3 check 失敗：${check.id}；exit=${result.status ?? 'spawn-error'}\n${stderr.slice(-4000)}\n${stdout.slice(-4000)}`)
    }
    for (const gate of check.gates) passedGates.add(gate)
    records.push({
      id: check.id,
      path: check.path,
      exitCode: result.status,
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
      gates: [...check.gates],
    })
  }
  return { records, passedGates }
}

function runTrustedCspSmoke(verifierRoot, projectRoot, label) {
  const scriptPath = join(verifierRoot, 'scripts', 'e3-production-csp-smoke.mjs')
  const fixturePath = join(verifierRoot, '__tests__', 'fixtures', 'e3-freeze', 'runtime-fixtures.json')
  const result = spawnSync(process.execPath, [
    scriptPath,
    `--project-root=${projectRoot}`,
    `--fixture-path=${fixturePath}`,
  ], {
    cwd: projectRoot,
    env: pickAuditHostEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 12 * 60 * 1_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = redactSensitiveOutput(result.stdout)
  const stderr = redactSensitiveOutput(result.stderr)
  if (result.error || result.status !== 0) {
    throw new Error(`${label} CSP smoke 失敗；exit=${result.status ?? 'spawn-error'}\n${stderr.slice(-5000)}\n${stdout.slice(-5000)}`)
  }
  const parsed = parseFinalJson(stdout, `${label} CSP smoke`)
  if (
    parsed.ok !== true
    || parsed.mode !== 'production-next-start-no-csp-bypass'
    || !Array.isArray(parsed.cases)
    || parsed.cases.length !== 10
    || parsed.cases.some((item) => item?.ok !== true)
  ) throw new Error(`${label} CSP smoke receipt 契約不成立`)
  return {
    label,
    exitCode: result.status,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    result: parsed,
  }
}

function assertSharedCoverage(sharedSourceCoverage, passedGates) {
  const failures = []
  for (const entry of Array.isArray(sharedSourceCoverage) ? sharedSourceCoverage : []) {
    if (!entry?.path || !Array.isArray(entry.requiredGates) || entry.requiredGates.length === 0) {
      failures.push(`${entry?.path || 'unknown'}:missing-coverage-map`)
      continue
    }
    const missing = entry.requiredGates.filter((gate) => !passedGates.has(gate))
    if (missing.length > 0) failures.push(`${entry.path}:${missing.join('+')}`)
  }
  if (failures.length > 0) throw new Error(`E3 shared source coverage 未完成：${failures.join(', ')}`)
}

function removeDetachedWorktree(repositoryRoot, path, expectedParent) {
  const parentIdentity = canonicalRealPath(expectedParent)
  const targetIdentity = gitIdentity(path)
  if (
    targetIdentity.topLevel !== canonicalRealPath(path)
    || normalizedPath(dirname(realpathSync.native(path))) !== parentIdentity
    || !/^\.e3-release-[0-9a-f-]+-(?:base-source|base-runtime|candidate-runtime)$/i.test(
      resolve(path).slice(resolve(expectedParent).length + 1),
    )
  ) throw new Error(`拒絕移除非 runner-owned detached worktree：${path}`)
  runGit(['worktree', 'remove', '--force', path], repositoryRoot)
}

function validateTrustedVerifierBundle(verifierRoot, manifestPath, trustedBaseCommit) {
  assertPathComponentsNoReparse(verifierRoot)
  assertNoReparsePoints(verifierRoot)
  if (canonicalRealPath(manifestPath) !== canonicalRealPath(join(verifierRoot, 'trusted-verifier-manifest.json'))) {
    throw new Error('trusted verifier manifest 必須位於 verifier root 的固定路徑')
  }
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (
    manifest?.schema !== 'e3-trusted-verifier/v1'
    || manifest?.trustedBaseCommit !== trustedBaseCommit
    || !manifest?.files
  ) throw new Error('trusted verifier manifest schema/base commit 不成立')
  const actualFiles = {}
  for (const relativePath of TRUSTED_VERIFIER_FILES) {
    const path = join(verifierRoot, relativePath)
    if (!existsSync(path)) throw new Error(`trusted verifier 缺少：${relativePath}`)
    if (!isContainedPath(verifierRoot, path)) throw new Error(`trusted verifier 檔案逃逸 root：${relativePath}`)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || Number(stat.nlink) !== 1) {
      throw new Error(`trusted verifier 必須是單一 hardlink regular file：${relativePath}`)
    }
    actualFiles[relativePath] = sha256File(path)
    if (manifest.files[relativePath] !== actualFiles[relativePath]) {
      throw new Error(`trusted verifier hash 不一致：${relativePath}`)
    }
  }
  if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...TRUSTED_VERIFIER_FILES].sort())) {
    throw new Error('trusted verifier manifest 檔案集合不精確')
  }
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256(manifestBytes),
    files: actualFiles,
  }
}

function durableCandidateSummary(directory) {
  const documentPath = join(directory, 'candidate.json')
  const receiptPath = join(directory, 'comparison-receipt.json')
  if (!existsSync(documentPath)) return { present: true, complete: false, reason: 'candidate.json missing' }
  const document = JSON.parse(readFileSync(documentPath, 'utf8'))
  return {
    present: true,
    complete: true,
    documentPath,
    documentSha256: sha256File(documentPath),
    corpusSha256: computeE3BaselineCorpusSha256(document, directory),
    comparisonReceiptPath: existsSync(receiptPath) ? receiptPath : null,
    comparisonReceiptSha256: existsSync(receiptPath) ? sha256File(receiptPath) : null,
  }
}

async function main() {
  const baseSourceArgument = argument('base-source-root')
  const baseRuntimeArgument = argument('base-runtime-root')
  const candidateRootArgument = argument('candidate-root')
  if (!baseSourceArgument) throw new Error('必須提供 --base-source-root=<乾淨 base worktree>')
  if (!baseRuntimeArgument) throw new Error('必須提供 --base-runtime-root=<另一個乾淨 base worktree>')
  if (!candidateRootArgument) throw new Error('必須提供 --candidate-root=<已 commit 的乾淨候選 worktree>')
  const baseSourceRoot = resolve(baseSourceArgument)
  const baseRuntimeRoot = resolve(baseRuntimeArgument)
  const candidateRoot = resolve(candidateRootArgument)
  const evidenceDirArgument = argument('evidence-dir')
  const trustedBaseCommitArgument = argument('trusted-base-commit')
  const trustedVerifierRootArgument = argument('trusted-verifier-root')
  const trustedVerifierManifestArgument = argument('trusted-verifier-manifest')
  const trustedVerifierManifestSha256Argument = argument('trusted-verifier-manifest-sha256')
  if (!evidenceDirArgument) throw new Error('必須提供 --evidence-dir=<現有或待建證據目錄>')
  if (!/^[a-f0-9]{40,64}$/.test(trustedBaseCommitArgument || '')) throw new Error('必須提供 repo 外固定的 --trusted-base-commit=<sha>')
  if (!trustedVerifierRootArgument) throw new Error('必須提供 --trusted-verifier-root=<repo 外 immutable verifier bundle>')
  if (!trustedVerifierManifestArgument) throw new Error('必須提供 --trusted-verifier-manifest=<repo 外 hash manifest>')
  if (!/^[a-f0-9]{64}$/.test(trustedVerifierManifestSha256Argument || '')) {
    throw new Error('必須提供預先登錄的 --trusted-verifier-manifest-sha256=<sha256>')
  }
  const evidenceDir = resolve(evidenceDirArgument)
  const trustedVerifierRoot = resolve(trustedVerifierRootArgument)
  const trustedVerifierManifest = resolve(trustedVerifierManifestArgument)
  requireDirectory(baseSourceRoot, 'base source worktree')
  requireDirectory(baseRuntimeRoot, 'base runtime worktree')
  requireDirectory(candidateRoot, 'candidate worktree')
  requireDirectory(trustedVerifierRoot, 'trusted verifier root')
  assertPathComponentsNoReparse(baseSourceRoot)
  assertPathComponentsNoReparse(baseRuntimeRoot)
  assertPathComponentsNoReparse(candidateRoot)
  assertDistinctGitWorktrees([
    ['base source', baseSourceRoot],
    ['base runtime', baseRuntimeRoot],
    ['candidate', candidateRoot],
  ])

  const executingRunnerPath = fileURLToPath(import.meta.url)
  const trustedRunnerPath = join(trustedVerifierRoot, 'scripts', 'e3-freeze-release-audit.mjs')
  if (canonicalRealPath(executingRunnerPath) !== canonicalRealPath(trustedRunnerPath)) {
    throw new Error('release runner 必須直接從 repo 外 trusted verifier bundle 執行')
  }
  const verifierRelativeToCandidate = relative(canonicalRealPath(candidateRoot), canonicalRealPath(trustedVerifierRoot))
  if (verifierRelativeToCandidate === '' || (!verifierRelativeToCandidate.startsWith(`..${sep}`) && verifierRelativeToCandidate !== '..')) {
    throw new Error('trusted verifier bundle 不得位於 candidate worktree 內')
  }
  const runnerSha256 = sha256File(executingRunnerPath)
  const verifierTrust = validateTrustedVerifierBundle(
    trustedVerifierRoot,
    trustedVerifierManifest,
    trustedBaseCommitArgument,
  )
  if (verifierTrust.manifestSha256 !== trustedVerifierManifestSha256Argument) {
    throw new Error('trusted verifier manifest 不等於預先登錄 digest')
  }
  if (verifierTrust.files['scripts/e3-freeze-release-audit.mjs'] !== runnerSha256) throw new Error('executing runner 不等於 trusted verifier manifest')

  const candidateStatus = runGit(['status', '--porcelain=v1', '--untracked-files=all'], candidateRoot)
  if (candidateStatus !== '') throw new Error('candidate worktree 必須先 commit 且保持乾淨，才能執行 release audit')
  const candidateHead = runGit(['rev-parse', 'HEAD'], candidateRoot)
  const trustedBaseCommit = runGit(['rev-parse', '--verify', 'origin/main^{commit}'], candidateRoot)
  if (trustedBaseCommit !== trustedBaseCommitArgument) {
    throw new Error('local origin/main 與 repo 外 trusted base commit 不一致')
  }
  for (const relativePath of ['package.json', 'package-lock.json']) {
    const baseBlob = runGit(['rev-parse', `${trustedBaseCommit}:${relativePath}`], candidateRoot)
    const candidateBlob = runGit(['rev-parse', `${candidateHead}:${relativePath}`], candidateRoot)
    if (baseBlob !== candidateBlob) throw new Error(`E3 release 禁止 dependency contract 改動：${relativePath}`)
  }
  const gitSnapshot = {
    candidateRoot,
    candidateHead,
    trustedBaseCommit,
    baseSourceRoot,
    baseRuntimeRoot,
    runnerSha256,
  }
  assertGitSnapshot(gitSnapshot, 'preflight')

  for (const protectedRoot of [baseSourceRoot, baseRuntimeRoot, candidateRoot, trustedVerifierRoot]) {
    if (isLexicallyContainedPath(protectedRoot, evidenceDir) || isLexicallyContainedPath(evidenceDir, protectedRoot)) {
      throw new Error('evidence directory 必須與 candidate/base/verifier 完全分離')
    }
  }
  if (existsSync(evidenceDir)) throw new Error('evidence directory 必須由本次 runner 全新建立')
  assertPathComponentsNoReparse(dirname(evidenceDir))
  mkdirSync(evidenceDir, { recursive: false })
  assertPathComponentsNoReparse(evidenceDir)
  assertNoReparsePoints(evidenceDir)
  const sessionId = randomUUID()
  const sessionDir = join(evidenceDir, `e3-release-${sessionId}`)
  mkdirSync(sessionDir, { recursive: false })
  const baselinePath = join(sessionDir, 'baseline.json')
  const screenshotDir = join(sessionDir, 'screenshots')
  const receiptPath = join(sessionDir, 'release-receipt.json')
  const failureReceiptPath = join(sessionDir, 'failure-receipt.json')
  const candidateStagingDir = join(sessionDir, `.candidate-staging-${randomUUID()}`)
  const snapshotParent = dirname(candidateRoot)
  const baseSourceSnapshotRoot = join(snapshotParent, `.e3-release-${sessionId}-base-source`)
  const baseRuntimeSnapshotRoot = join(snapshotParent, `.e3-release-${sessionId}-base-runtime`)
  const candidateSnapshotRoot = join(snapshotParent, `.e3-release-${sessionId}-candidate-runtime`)
  const lockPath = join(sessionDir, '.active.lock')
  const lock = openSync(lockPath, 'wx')
  const ownershipToken = `${randomUUID()}-${randomUUID()}`
  writeFileSync(lock, `${JSON.stringify({ sessionId, pid: process.pid })}\n`, 'utf8')
  writeFileSync(join(sessionDir, '.e3-release-owner.json'), `${JSON.stringify({
    schema: 'e3-release-owner/v1',
    sessionId,
    tokenSha256: sha256(ownershipToken),
    runnerSha256,
  }, null, 2)}\n`, 'utf8')

  const startedAt = new Date().toISOString()
  let recordRun
  let verifyRun
  let recordEvidence
  let verifyEvidence
  let recordResult
  let verifyResult
  let snapshotsCreated = false
  let dependencyEvidence
  let pinnedVerifierFiles
  let pinnedCheckEvidence
  let cspEvidence
  let passedCoverageGates
  try {
    createDetachedWorktree(candidateRoot, baseSourceSnapshotRoot, trustedBaseCommit)
    createDetachedWorktree(candidateRoot, baseRuntimeSnapshotRoot, trustedBaseCommit)
    createDetachedWorktree(candidateRoot, candidateSnapshotRoot, candidateHead)
    dependencyEvidence = {
      baseRuntime: installPinnedDependencies(baseRuntimeSnapshotRoot),
      candidateRuntime: installPinnedDependencies(candidateSnapshotRoot),
    }
    pinnedVerifierFiles = verifyCandidateVerifierFiles(candidateSnapshotRoot, trustedVerifierRoot)
    const pinnedChecks = runPinnedE3Checks(candidateSnapshotRoot)
    pinnedCheckEvidence = pinnedChecks.records
    passedCoverageGates = pinnedChecks.passedGates
    passedCoverageGates.add('dependency-contract')
    snapshotsCreated = true
    Object.assign(gitSnapshot, {
      baseSourceSnapshotRoot,
      baseRuntimeSnapshotRoot,
      candidateSnapshotRoot,
    })
    assertDistinctGitWorktrees([
      ['base source snapshot', baseSourceSnapshotRoot],
      ['base runtime snapshot', baseRuntimeSnapshotRoot],
      ['candidate snapshot', candidateSnapshotRoot],
    ])
    assertGitSnapshot(gitSnapshot, 'snapshot-created')

    const auditScript = join(trustedVerifierRoot, 'scripts', 'e3-freeze-audit.mjs')
    if (!existsSync(auditScript)) throw new Error(`缺少 E3 audit script：${auditScript}`)
    const sharedArgs = [
      `--baseline-root=${sessionDir}`,
      `--release-session-id=${sessionId}`,
      `--runner-ownership-token=${ownershipToken}`,
      '--base-ref=origin/main',
    ]
    recordRun = await runAudit(auditScript, candidateSnapshotRoot, [
      '--record',
      `--source-root=${baseSourceSnapshotRoot}`,
      `--runtime-root=${baseRuntimeSnapshotRoot}`,
      ...sharedArgs,
    ])
    recordEvidence = persistRunEvidence(sessionDir, 'record', recordRun)
    recordResult = safeParseFinalJson(recordRun.stdout)
    if (recordRun.code !== 0) {
      throw new Error(`E3 record 失敗，exit=${recordRun.code}\n${redactSensitiveOutput(recordRun.stderr).slice(-4000)}`)
    }
    if (!recordResult) throw new Error('E3 record 沒有輸出可驗證的 JSON 結果')
    if (recordResult.ok !== true || recordResult.mode !== 'record') throw new Error('E3 record 結果契約不成立')
    if (!/^[a-f0-9]{64}$/.test(recordResult.baselineCorpusSha256 || '')) {
      throw new Error('E3 record 未提供有效 baseline corpus hash')
    }
    const recordedCorpusSha256 = computeE3BaselineCorpusSha256(
      JSON.parse(readFileSync(baselinePath, 'utf8')),
      screenshotDir,
    )
    if (recordedCorpusSha256 !== recordResult.baselineCorpusSha256) {
      throw new Error('E3 record 完成後 corpus hash 立即不一致')
    }
    assertGitSnapshot(gitSnapshot, 'post-record')

    verifyRun = await runAudit(auditScript, candidateSnapshotRoot, [
      `--source-root=${candidateSnapshotRoot}`,
      `--runtime-root=${candidateSnapshotRoot}`,
      ...sharedArgs,
      `--trusted-baseline-corpus-sha256=${recordedCorpusSha256}`,
      `--candidate-output-dir=${candidateStagingDir}`,
      '--keep',
    ])
    verifyEvidence = persistRunEvidence(sessionDir, 'verify', verifyRun)
    verifyResult = safeParseFinalJson(verifyRun.stdout)
    if (verifyRun.code !== 0) {
      throw new Error(`E3 verify 失敗，exit=${verifyRun.code}\n${redactSensitiveOutput(verifyRun.stderr).slice(-4000)}`)
    }
    if (!verifyResult) throw new Error('E3 verify 沒有輸出可驗證的 JSON 結果')
    const finalCorpusSha256 = computeE3BaselineCorpusSha256(
      JSON.parse(readFileSync(baselinePath, 'utf8')),
      screenshotDir,
    )
    if (finalCorpusSha256 !== recordedCorpusSha256) {
      throw new Error('E3 baseline 在 record 與 verify 之間被改動')
    }
    if (verifyResult.ok !== true || verifyResult.mode !== 'verify') throw new Error('E3 verify 結果契約不成立')
    if ((verifyResult.toleratedVisualDifferences || []).length > 0) {
      throw new Error('E3 release 禁止感知容差：PNG bytes 必須逐案完全相同')
    }
    if (!existsSync(verifyResult.comparisonReceiptPath || '')) {
      throw new Error('E3 verify 缺少 comparison receipt')
    }
    const comparisonReceiptSha256 = sha256File(verifyResult.comparisonReceiptPath)
    if (comparisonReceiptSha256 !== verifyResult.comparisonReceiptSha256) {
      throw new Error('E3 comparison receipt hash 不一致')
    }
    const comparisonReceipt = JSON.parse(readFileSync(verifyResult.comparisonReceiptPath, 'utf8'))
    if (
      comparisonReceipt.ok !== true
      || comparisonReceipt.releaseSessionId !== sessionId
      || comparisonReceipt.baseline?.corpusSha256 !== recordedCorpusSha256
      || comparisonReceipt.baseline?.commit !== trustedBaseCommit
      || comparisonReceipt.candidate?.head !== candidateHead
      || JSON.stringify(comparisonReceipt.sharedSourceCoverage) !== JSON.stringify(verifyResult.sharedSourceCoverage)
    ) throw new Error('E3 comparison receipt 未綁定本次 release session')

    cspEvidence = {
      baseline: runTrustedCspSmoke(trustedVerifierRoot, baseRuntimeSnapshotRoot, 'baseline'),
      candidate: runTrustedCspSmoke(trustedVerifierRoot, candidateSnapshotRoot, 'candidate'),
    }
    const cspParity = compareProductionCspReceipts(
      cspEvidence.baseline.result,
      cspEvidence.candidate.result,
    )
    if (!cspParity.ok) {
      throw new Error(`E3 CSP policy parity 不成立：${cspParity.errors.join(', ')}`)
    }
    cspEvidence.parity = cspParity
    passedCoverageGates.add('csp-smoke')
    passedCoverageGates.add('ui-static-parity')
    passedCoverageGates.add('ui-behavior-parity')
    assertSharedCoverage(verifyResult.sharedSourceCoverage, passedCoverageGates)

    assertGitSnapshot(gitSnapshot, 'post-verify')
    const candidateEvidenceDir = join(sessionDir, 'candidate')
    assertOwnedStagingDirectory(verifyResult.candidateDir, candidateStagingDir, sessionDir)
    if (existsSync(candidateEvidenceDir)) throw new Error('E3 durable candidate evidence directory 已存在')
    renameSync(candidateStagingDir, candidateEvidenceDir)
    const durableComparisonReceiptPath = join(candidateEvidenceDir, 'comparison-receipt.json')
    const durableComparisonReceiptSha256 = sha256File(durableComparisonReceiptPath)
    if (durableComparisonReceiptSha256 !== comparisonReceiptSha256) {
      throw new Error('E3 comparison receipt 搬移後 hash 不一致')
    }
    const durableCandidateDocumentPath = join(candidateEvidenceDir, 'candidate.json')
    const durableCandidateDocument = JSON.parse(readFileSync(durableCandidateDocumentPath, 'utf8'))
    const durableCandidateDocumentSha256 = sha256File(durableCandidateDocumentPath)
    const durableCandidateCorpusSha256 = computeE3BaselineCorpusSha256(
      durableCandidateDocument,
      candidateEvidenceDir,
    )
    if (
      durableCandidateCorpusSha256 !== comparisonReceipt.candidate?.corpusSha256
      || durableCandidateDocumentSha256 !== comparisonReceipt.candidate?.documentSha256
    ) throw new Error('E3 durable candidate evidence 搬移後 corpus／document hash 不一致')
    const postflightVerifierTrust = validateTrustedVerifierBundle(
      trustedVerifierRoot,
      trustedVerifierManifest,
      trustedBaseCommitArgument,
    )
    if (
      postflightVerifierTrust.manifestSha256 !== verifierTrust.manifestSha256
      || postflightVerifierTrust.manifestSha256 !== trustedVerifierManifestSha256Argument
      || JSON.stringify(postflightVerifierTrust.files) !== JSON.stringify(verifierTrust.files)
    ) throw new Error('trusted verifier bundle 在 release audit 執行期間發生變動')

    removeDetachedWorktree(candidateRoot, candidateSnapshotRoot, snapshotParent)
    removeDetachedWorktree(candidateRoot, baseRuntimeSnapshotRoot, snapshotParent)
    removeDetachedWorktree(candidateRoot, baseSourceSnapshotRoot, snapshotParent)
    snapshotsCreated = false
    assertGitSnapshot({
      candidateRoot,
      candidateHead,
      trustedBaseCommit,
      baseSourceRoot,
      baseRuntimeRoot,
      runnerSha256,
    }, 'snapshot-removed')

    const releaseReceipt = {
      schema: 'e3-release-audit-receipt/v1',
      ok: true,
      sessionId,
      startedAt,
      completedAt: new Date().toISOString(),
      baseSourceRoot,
      baseRuntimeRoot,
      candidateRoot,
      git: {
        candidateHead,
        trustedBaseCommit,
        candidateCleanAtStart: true,
      },
      audit: {
        scriptSha256: verifierTrust.files['scripts/e3-freeze-audit.mjs'],
        runnerSha256,
        verifierManifestPath: verifierTrust.manifestPath,
        verifierManifestSha256: verifierTrust.manifestSha256,
        expectedVerifierManifestSha256: trustedVerifierManifestSha256Argument,
        verifierFiles: verifierTrust.files,
        pinnedCandidateFiles: pinnedVerifierFiles,
      },
      baseline: {
        corpusSha256: recordedCorpusSha256,
        documentSha256: sha256File(baselinePath),
        cases: recordResult.cases,
      },
      comparison: {
        receiptPath: durableComparisonReceiptPath,
        receiptSha256: durableComparisonReceiptSha256,
        candidateCorpusSha256: durableCandidateCorpusSha256,
        candidateDocumentSha256: durableCandidateDocumentSha256,
        cases: verifyResult.cases,
        toleratedVisualDifferences: verifyResult.toleratedVisualDifferences,
      },
      subprocesses: {
        record: recordEvidence,
        verify: verifyEvidence,
        dependencies: dependencyEvidence,
        pinnedChecks: pinnedCheckEvidence,
        csp: cspEvidence,
      },
      sharedSourceCoverage: {
        differences: verifyResult.sharedSourceCoverage,
        passedGates: [...passedCoverageGates].sort(),
      },
    }
    writeFileSync(receiptPath, `${JSON.stringify(releaseReceipt, null, 2)}\n`, 'utf8')
    const releaseReceiptSha256 = sha256File(receiptPath)
    const finalCandidateSummary = durableCandidateSummary(candidateEvidenceDir)
    if (
      finalCandidateSummary.complete !== true
      || finalCandidateSummary.documentSha256 !== durableCandidateDocumentSha256
      || finalCandidateSummary.corpusSha256 !== durableCandidateCorpusSha256
      || finalCandidateSummary.comparisonReceiptSha256 !== durableComparisonReceiptSha256
      || computeE3BaselineCorpusSha256(JSON.parse(readFileSync(baselinePath, 'utf8')), screenshotDir) !== recordedCorpusSha256
    ) throw new Error('E3 evidence 在 release receipt 寫入後發生變動')
    assertNoReparsePoints(sessionDir)
    const finalizationReceiptPath = join(sessionDir, 'finalization-receipt.json')
    const finalizationReceipt = {
      schema: 'e3-release-finalization/v1',
      sessionId,
      candidateHead,
      trustedBaseCommit,
      verifierManifestSha256: trustedVerifierManifestSha256Argument,
      releaseReceiptSha256,
      baselineCorpusSha256: recordedCorpusSha256,
      candidateCorpusSha256: durableCandidateCorpusSha256,
      candidateDocumentSha256: durableCandidateDocumentSha256,
      comparisonReceiptSha256: durableComparisonReceiptSha256,
    }
    writeFileSync(finalizationReceiptPath, `${JSON.stringify(finalizationReceipt, null, 2)}\n`, 'utf8')
    const finalizationReceiptSha256 = sha256File(finalizationReceiptPath)
    if (sha256File(receiptPath) !== releaseReceiptSha256) throw new Error('release receipt 在 finalization 期間發生變動')
    const result = {
      ok: true,
      sessionId,
      cases: verifyResult.cases,
      baselineCorpusSha256: recordedCorpusSha256,
      releaseReceiptPath: receiptPath,
      releaseReceiptSha256,
      comparisonReceiptPath: durableComparisonReceiptPath,
      comparisonReceiptSha256: durableComparisonReceiptSha256,
      finalizationReceiptPath,
      finalizationReceiptSha256,
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    let candidateFailureEvidence = { present: false }
    if (existsSync(candidateStagingDir)) {
      try {
        assertOwnedStagingDirectory(candidateStagingDir, candidateStagingDir, sessionDir)
        const failureCandidateDir = join(sessionDir, 'candidate-failure')
        renameSync(candidateStagingDir, failureCandidateDir)
        candidateFailureEvidence = durableCandidateSummary(failureCandidateDir)
      } catch (preservationError) {
        candidateFailureEvidence = {
          present: true,
          complete: false,
          preservationError: redactSensitiveOutput(
            preservationError instanceof Error ? preservationError.message : String(preservationError),
          ),
        }
      }
    }
    const snapshotCleanup = []
    for (const path of [candidateSnapshotRoot, baseRuntimeSnapshotRoot, baseSourceSnapshotRoot]) {
      if (!existsSync(path)) continue
      try {
        removeDetachedWorktree(candidateRoot, path, snapshotParent)
        snapshotCleanup.push({ path, removed: true })
      } catch (cleanupError) {
        snapshotCleanup.push({
          path,
          removed: false,
          error: redactSensitiveOutput(cleanupError instanceof Error ? cleanupError.message : String(cleanupError)),
        })
      }
    }
    snapshotsCreated = snapshotCleanup.some((item) => !item.removed)
    const failureReceipt = {
      schema: 'e3-release-audit-failure-receipt/v1',
      ok: false,
      sessionId,
      startedAt,
      failedAt: new Date().toISOString(),
      error: redactSensitiveOutput(error instanceof Error ? error.message : String(error)),
      git: { candidateHead, trustedBaseCommit },
      trust: {
        runnerSha256,
        trustedBaseCommit: trustedBaseCommitArgument,
        verifierManifestSha256: verifierTrust.manifestSha256,
        expectedVerifierManifestSha256: trustedVerifierManifestSha256Argument,
      },
      snapshots: snapshotsCreated ? {
        baseSourceSnapshotRoot,
        baseRuntimeSnapshotRoot,
        candidateSnapshotRoot,
      } : null,
      subprocesses: {
        record: recordEvidence || null,
        verify: verifyEvidence || null,
        pinnedChecks: pinnedCheckEvidence || null,
        csp: cspEvidence || null,
      },
      dependencies: dependencyEvidence || null,
      parsedResults: { record: recordResult || null, verify: verifyResult || null },
      candidateEvidence: candidateFailureEvidence,
      snapshotCleanup,
    }
    writeFileSync(failureReceiptPath, `${JSON.stringify(failureReceipt, null, 2)}\n`, 'utf8')
    throw new Error(`${failureReceipt.error}; failureReceipt=${failureReceiptPath}`)
  } finally {
    closeSync(lock)
    rmSync(lockPath, { force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${redactSensitiveOutput(error instanceof Error ? error.stack : String(error))}\n`)
  process.exitCode = 1
})
