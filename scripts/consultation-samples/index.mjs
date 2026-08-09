import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  buildCalculatorRequestPayload,
  hashCalculatorRequest,
} from '../../lib/consultation/calculator-request.ts'

export const SAMPLE_AS_OF_DATE = '2026-08-08'
export const SAMPLE_TARGET_YEAR = 2026
export const DEFAULT_CALCULATOR_API = 'https://fortune-reports-api.fly.dev'
export const SAMPLE_BUNDLE_VERSION = 'jianyuan-consultation-sample-replay/v1'

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..')
const execFileAsync = promisify(execFile)

export const AUTHORIZED_SAMPLE_PEOPLE = Object.freeze([
  Object.freeze({
    personId: 'he-xuanyi',
    displayName: '何宣逸',
    birth: Object.freeze({
      year: 1990, month: 10, day: 12, hour: 20, minute: 0, gender: 'M',
      city: '嘉義', latitude: 23.69, longitude: 120.96, timezoneOffset: 8,
    }),
  }),
  Object.freeze({
    personId: 'he-jinan',
    displayName: '何紀萳',
    birth: Object.freeze({
      year: 1994, month: 10, day: 4, hour: 8, minute: 0, gender: 'F',
      city: '香港', latitude: 22.33, longitude: 114.19, timezoneOffset: 8,
    }),
  }),
  Object.freeze({
    personId: 'he-youchun',
    displayName: '何宥諄',
    birth: Object.freeze({
      year: 2023, month: 5, day: 8, hour: 10, minute: 0, gender: 'M',
      city: '香港', latitude: 22.33, longitude: 114.19, timezoneOffset: 8,
    }),
  }),
])

function assertPlans(requestedPlans) {
  if (!Array.isArray(requestedPlans) || requestedPlans.length === 0) {
    throw new Error('至少指定 C 或 G15')
  }
  const invalid = requestedPlans.filter((plan) => plan !== 'C' && plan !== 'G15')
  if (invalid.length > 0) {
    throw new Error(`樣本 harness 只允許 C/G15；拒絕方案: ${invalid.join(', ')}`)
  }
  const unique = new Set(requestedPlans)
  if (unique.size !== 2 || !unique.has('C') || !unique.has('G15')) {
    throw new Error('授權樣本必須同時建立 3 份 C 與 1 份 G15，不接受部分輸出')
  }
}

function plannedArtifacts(requestedPlans) {
  const artifacts = []
  if (requestedPlans.includes('C')) {
    for (const person of AUTHORIZED_SAMPLE_PEOPLE) {
      artifacts.push({ artifactId: `sample-c-${person.personId}`, plan: 'C', personIds: [person.personId] })
    }
  }
  if (requestedPlans.includes('G15')) {
    artifacts.push({
      artifactId: 'sample-g15-he-family',
      plan: 'G15',
      personIds: AUTHORIZED_SAMPLE_PEOPLE.map((person) => person.personId),
    })
  }
  return artifacts
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function sha256(value) {
  const content = typeof value === 'string' ? value : stableJson(value)
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function privateDirectory(target) {
  await mkdir(target, { recursive: true, mode: 0o700 })
  await chmod(target, 0o700).catch(() => {})
}

async function hardenPrivateRoot(target, environment = process.env) {
  if (process.platform !== 'win32') return
  const username = environment.USERNAME
  const domain = environment.USERDOMAIN
  if (!username || !domain || /[\r\n]/u.test(`${domain}\\${username}`)) {
    throw new Error('無法判定目前 Windows 帳戶，拒絕建立含個資的 private bundles')
  }
  await execFileAsync('icacls.exe', [
    target,
    '/inheritance:r',
    '/grant:r',
    'NT AUTHORITY\\SYSTEM:(OI)(CI)F',
    'BUILTIN\\Administrators:(OI)(CI)F',
    `${domain}\\${username}:(OI)(CI)F`,
  ], { windowsHide: true, timeout: 15_000 })
}

async function atomicPrivateWrite(target, content) {
  await privateDirectory(path.dirname(target))
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await chmod(temporary, 0o600).catch(() => {})
  await rename(temporary, target)
  await chmod(target, 0o600).catch(() => {})
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function validateApiUrl(apiBaseUrl) {
  const parsed = new URL(apiBaseUrl)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'fortune-reports-api.fly.dev') {
    throw new Error('calculator API 僅允許 public https://fortune-reports-api.fly.dev')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('calculator API URL 不得包含憑證、query 或 fragment')
  }
  return parsed.origin
}

function calculatorPayload(person) {
  const hongKong = person.birth.city === '香港'
  return buildCalculatorRequestPayload({
    name: person.displayName,
    year: person.birth.year,
    month: person.birth.month,
    day: person.birth.day,
    hour: person.birth.hour,
    minute: person.birth.minute,
    gender: person.birth.gender,
    calendar_type: 'solar',
    lunar_leap: false,
    time_unknown: false,
    time_mode: 'exact',
    latitude: person.birth.latitude,
    longitude: person.birth.longitude,
    timezone_offset: person.birth.timezoneOffset,
    timezone: hongKong ? 'Asia/Hong_Kong' : 'Asia/Taipei',
    birth_city: person.birth.city,
    birth_country: hongKong ? 'HK' : 'TW',
    target_year: SAMPLE_TARGET_YEAR,
    as_of: SAMPLE_AS_OF_DATE,
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
    fold: 0,
  }, { consultationMode: true })
}

function validateCalculatorResponse(response) {
  if (!response || typeof response !== 'object') throw new Error('Fly 回應不是 JSON object')
  if (!Array.isArray(response.analyses) || response.analyses.length !== 15) {
    throw new Error(`Fly 回應必須含 15 套 analyses，實際 ${response.analyses?.length ?? 0}`)
  }
  if (response.systems_count !== undefined && response.systems_count !== 15) {
    throw new Error(`Fly systems_count 必須為 15，實際 ${response.systems_count}`)
  }
  const systems = response.analyses.map((analysis) => (
    typeof analysis?.system === 'string' ? analysis.system.trim() : ''
  ))
  if (systems.some((system) => !system) || new Set(systems).size !== 15) {
    throw new Error('Fly 回應必須含 15 個不重複系統')
  }
  const partialFailure = response.analyses.some((analysis) => (
    Boolean(analysis?.error) ||
    analysis?.success === false ||
    analysis?.partial_failure === true ||
    ['failed', 'error', 'partial_failure'].includes(String(analysis?.status ?? '').toLowerCase())
  )) || (Array.isArray(response.partial_failures) && response.partial_failures.length > 0)
  if (partialFailure) throw new Error('Fly 回應含 partial failure，禁止建立 replay')
  if (!response.client_data || typeof response.client_data !== 'object') {
    throw new Error('Fly 回應缺少 client_data')
  }
}

async function fetchCalculator({ apiBaseUrl, fetchImpl, payload, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${apiBaseUrl}/api/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response?.ok) throw new Error(`Fly calculator HTTP ${response?.status ?? 'unknown'}`)
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > 12 * 1024 * 1024) {
      throw new Error('Fly calculator 回應超過 12 MiB 安全上限')
    }
    const parsed = JSON.parse(text)
    validateCalculatorResponse(parsed)
    return parsed
  } finally {
    clearTimeout(timeout)
  }
}

function calculatorPaths(outputRoot, personId) {
  const directory = path.join(outputRoot, 'calculators', personId)
  return {
    request: path.join(directory, 'request.json'),
    response: path.join(directory, 'response.json'),
  }
}

async function writeCalculatorBundle({ outputRoot, person, apiBaseUrl, response }) {
  const payload = calculatorPayload(person)
  const requestSha256 = hashCalculatorRequest(payload)
  const responseSha256 = sha256(response)
  const paths = calculatorPaths(outputRoot, person.personId)
  await atomicPrivateWrite(paths.request, prettyJson({
    schemaVersion: SAMPLE_BUNDLE_VERSION,
    personId: person.personId,
    authorization: 'user-authorized-synthetic-validation',
    asOfDate: SAMPLE_AS_OF_DATE,
    targetYear: SAMPLE_TARGET_YEAR,
    endpoint: `${apiBaseUrl}/api/calculate`,
    requestSha256,
    payload,
  }))
  await atomicPrivateWrite(paths.response, prettyJson({
    schemaVersion: SAMPLE_BUNDLE_VERSION,
    personId: person.personId,
    requestSha256,
    responseSha256,
    response,
  }))
  return {
    personId: person.personId,
    requestPath: path.relative(outputRoot, paths.request).replaceAll('\\', '/'),
    responsePath: path.relative(outputRoot, paths.response).replaceAll('\\', '/'),
    requestSha256,
    responseSha256,
  }
}

async function loadCalculatorBundle({ outputRoot, person, apiBaseUrl }) {
  const paths = calculatorPaths(outputRoot, person.personId)
  const requestExists = await exists(paths.request)
  const responseExists = await exists(paths.response)
  if (!requestExists && !responseExists) return undefined
  if (!requestExists || !responseExists) {
    throw new Error(`resume 驗證失敗: ${person.personId} request/response 不完整`)
  }
  let request
  let response
  try {
    request = await loadJson(paths.request)
    response = await loadJson(paths.response)
  } catch (error) {
    throw new Error(`resume 驗證失敗: ${person.personId} JSON 無法讀取: ${error.message}`)
  }
  const expectedPayload = calculatorPayload(person)
  const expectedRequestSha256 = hashCalculatorRequest(expectedPayload)
  const expectedEndpoint = `${apiBaseUrl}/api/calculate`
  if (
    request.personId !== person.personId ||
    request.endpoint !== expectedEndpoint ||
    request.requestSha256 !== expectedRequestSha256 ||
    hashCalculatorRequest(request.payload) !== expectedRequestSha256
  ) {
    throw new Error(`resume 驗證失敗: ${person.personId} request context/hash 不匹配`)
  }
  const actualResponseSha256 = sha256(response.response)
  if (
    response.personId !== person.personId ||
    response.requestSha256 !== expectedRequestSha256 ||
    response.responseSha256 !== actualResponseSha256
  ) {
    throw new Error(`resume 驗證失敗: ${person.personId} response binding/hash 不匹配`)
  }
  try {
    validateCalculatorResponse(response.response)
  } catch (error) {
    throw new Error(`resume 驗證失敗: ${person.personId} ${error.message}`)
  }
  return {
    personId: person.personId,
    requestPath: path.relative(outputRoot, paths.request).replaceAll('\\', '/'),
    responsePath: path.relative(outputRoot, paths.response).replaceAll('\\', '/'),
    requestSha256: expectedRequestSha256,
    responseSha256: actualResponseSha256,
  }
}

async function writeReportArtifact({ outputRoot, planned, calculators }) {
  const required = planned.personIds.map((personId) => {
    const calculator = calculators.find((item) => item.personId === personId)
    if (!calculator) throw new Error(`缺少 ${personId} calculator bundle`)
    return {
      personId,
      requestSha256: calculator.requestSha256,
      responseSha256: calculator.responseSha256,
      requestPath: calculator.requestPath,
      responsePath: calculator.responsePath,
    }
  })
  const artifact = {
    schemaVersion: SAMPLE_BUNDLE_VERSION,
    artifactId: planned.artifactId,
    plan: planned.plan,
    asOfDate: SAMPLE_AS_OF_DATE,
    targetYear: SAMPLE_TARGET_YEAR,
    privacy: 'private-local-only',
    authorization: 'user-authorized-synthetic-validation',
    personIds: planned.personIds,
    familyStructure: planned.plan === 'G15' ? {
      memberPersonIds: planned.personIds,
      statedRelationships: [],
      note: '僅以使用者指定的三位成員組成家庭樣本；不推定性別角色、排行或權力關係。',
    } : undefined,
    calculators: required,
    immutableContextSha256: sha256({
      plan: planned.plan,
      asOfDate: SAMPLE_AS_OF_DATE,
      targetYear: SAMPLE_TARGET_YEAR,
      calculators: required,
    }),
    generation: {
      status: 'calculator-ready_llm-not-run',
      paidLlmExecutionAllowed: false,
      activationOwner: 'integration-owner',
    },
  }
  const target = path.join(outputRoot, 'report-jobs', `${planned.artifactId}.json`)
  await atomicPrivateWrite(target, prettyJson(artifact))
  return {
    artifactId: planned.artifactId,
    plan: planned.plan,
    path: path.relative(outputRoot, target).replaceAll('\\', '/'),
    artifactSha256: sha256(artifact),
    generationStatus: artifact.generation.status,
  }
}

async function loadJson(target) {
  return JSON.parse(await readFile(target, 'utf8'))
}

export async function runSampleHarness({
  dryRun = true,
  outputRoot,
  requestedPlans = ['C', 'G15'],
  fetchImpl = globalThis.fetch,
  apiBaseUrl = DEFAULT_CALCULATOR_API,
  timeoutMs = 60_000,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  resume = false,
} = {}) {
  assertPlans(requestedPlans)
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation 不可用')
  if (!outputRoot) throw new Error('outputRoot 不可為空')

  const resolvedOutputRoot = path.resolve(outputRoot)
  if (isInside(repositoryRoot, resolvedOutputRoot)) {
    throw new Error('private 樣本輸出不得位於 Git repository 內')
  }
  const calculatorApi = validateApiUrl(apiBaseUrl)
  const artifacts = plannedArtifacts(requestedPlans)

  if (dryRun) {
    return {
      mode: 'dry-run',
      asOfDate: SAMPLE_AS_OF_DATE,
      targetYear: SAMPLE_TARGET_YEAR,
      outputRoot: resolvedOutputRoot,
      people: AUTHORIZED_SAMPLE_PEOPLE,
      plannedArtifacts: artifacts,
      fetchCount: 0,
      reusedCount: 0,
    }
  }

  const manifestTarget = path.join(resolvedOutputRoot, 'manifest.json')
  await privateDirectory(resolvedOutputRoot)
  await hardenPrivateRoot(resolvedOutputRoot)
  if (await exists(manifestTarget)) {
    if (!resume) throw new Error('輸出已存在；請使用 --resume 驗證後續跑，禁止靜默覆寫')
    const verification = await verifyReplayDirectory(resolvedOutputRoot)
    if (!verification.valid) {
      throw new Error(`resume 驗證失敗；禁止覆寫或靜默重抓: ${verification.issues.join('; ')}`)
    }
    const existingManifest = await loadJson(manifestTarget)
    const existingIds = new Set(existingManifest.reportArtifacts.map((item) => item.artifactId))
    const missingIds = artifacts.map((item) => item.artifactId).filter((artifactId) => !existingIds.has(artifactId))
    if (missingIds.length > 0) throw new Error(`resume 缺少要求的 artifacts: ${missingIds.join(', ')}`)
    return {
      mode: 'resume',
      asOfDate: SAMPLE_AS_OF_DATE,
      targetYear: SAMPLE_TARGET_YEAR,
      outputRoot: resolvedOutputRoot,
      people: AUTHORIZED_SAMPLE_PEOPLE,
      plannedArtifacts: artifacts,
      fetchCount: 0,
      reusedCount: existingManifest.calculators.length,
      manifestPath: manifestTarget,
    }
  }
  if (!resume && (
    await exists(path.join(resolvedOutputRoot, 'calculators')) ||
    await exists(path.join(resolvedOutputRoot, 'report-jobs'))
  )) {
    throw new Error('發現未完成輸出；請使用 --resume，禁止靜默覆寫')
  }
  const calculators = []
  let fetchCount = 0
  let reusedCount = 0
  for (const person of AUTHORIZED_SAMPLE_PEOPLE) {
    const existing = resume
      ? await loadCalculatorBundle({ outputRoot: resolvedOutputRoot, person, apiBaseUrl: calculatorApi })
      : undefined
    if (existing) {
      calculators.push(existing)
      reusedCount += 1
      continue
    }
    const response = await fetchCalculator({
      apiBaseUrl: calculatorApi,
      fetchImpl,
      payload: calculatorPayload(person),
      timeoutMs,
    })
    calculators.push(await writeCalculatorBundle({
      outputRoot: resolvedOutputRoot,
      person,
      apiBaseUrl: calculatorApi,
      response,
    }))
    fetchCount += 1
  }
  const reportArtifacts = []
  for (const planned of artifacts) {
    reportArtifacts.push(await writeReportArtifact({
      outputRoot: resolvedOutputRoot,
      planned,
      calculators,
    }))
  }
  const manifest = {
    schemaVersion: SAMPLE_BUNDLE_VERSION,
    asOfDate: SAMPLE_AS_OF_DATE,
    targetYear: SAMPLE_TARGET_YEAR,
    privacy: 'private-local-only',
    calculatorApi,
    calculators,
    reportArtifacts,
    llmExecution: {
      status: 'not-run',
      paidExecutionAllowed: false,
      activationOwner: 'integration-owner',
    },
  }
  const manifestContent = prettyJson(manifest)
  await atomicPrivateWrite(manifestTarget, manifestContent)
  await atomicPrivateWrite(path.join(resolvedOutputRoot, 'manifest.sha256'), `${sha256(manifestContent)}  manifest.json\n`)

  return {
    mode: 'execute',
    asOfDate: SAMPLE_AS_OF_DATE,
    targetYear: SAMPLE_TARGET_YEAR,
    outputRoot: resolvedOutputRoot,
    people: AUTHORIZED_SAMPLE_PEOPLE,
    plannedArtifacts: artifacts,
    fetchCount,
    reusedCount,
    manifestPath: manifestTarget,
  }
}

export async function verifyReplayDirectory(outputRoot) {
  const resolvedOutputRoot = path.resolve(outputRoot)
  const issues = []
  let manifest
  let manifestContent
  try {
    manifestContent = await readFile(path.join(resolvedOutputRoot, 'manifest.json'), 'utf8')
    manifest = JSON.parse(manifestContent)
  } catch (error) {
    return { valid: false, issues: [`manifest 無法讀取: ${error.message}`] }
  }
  const sidecar = (await readFile(path.join(resolvedOutputRoot, 'manifest.sha256'), 'utf8').catch(() => '')).trim()
  if (sidecar !== `${sha256(manifestContent)}  manifest.json`) issues.push('manifest.sha256 不匹配')
  if (manifest.schemaVersion !== SAMPLE_BUNDLE_VERSION) issues.push('manifest schemaVersion 不符')
  if (manifest.asOfDate !== SAMPLE_AS_OF_DATE || manifest.targetYear !== SAMPLE_TARGET_YEAR) {
    issues.push('manifest immutable context 不符')
  }
  if (manifest.llmExecution?.status !== 'not-run' || manifest.llmExecution?.paidExecutionAllowed !== false) {
    issues.push('LLM 執行狀態不是 hard-block')
  }
  const expectedPersonIds = AUTHORIZED_SAMPLE_PEOPLE.map((person) => person.personId).sort()
  const actualPersonIds = (manifest.calculators ?? []).map((item) => item.personId).sort()
  if (stableJson(actualPersonIds) !== stableJson(expectedPersonIds)) {
    issues.push('calculator bundles 必須恰好對應三位授權樣本')
  }
  const expectedArtifactIds = plannedArtifacts(['C', 'G15']).map((item) => item.artifactId).sort()
  const actualArtifactIds = (manifest.reportArtifacts ?? []).map((item) => item.artifactId).sort()
  if (stableJson(actualArtifactIds) !== stableJson(expectedArtifactIds)) {
    issues.push('report artifacts 必須恰好為 3 份 C 與 1 份 G15')
  }
  for (const item of manifest.calculators ?? []) {
    try {
      const request = await loadJson(path.join(resolvedOutputRoot, item.requestPath))
      const response = await loadJson(path.join(resolvedOutputRoot, item.responsePath))
      if (hashCalculatorRequest(request.payload) !== item.requestSha256 || request.requestSha256 !== item.requestSha256) {
        issues.push(`${item.personId} request hash 不匹配`)
      }
      if (sha256(response.response) !== item.responseSha256 || response.responseSha256 !== item.responseSha256) {
        issues.push(`${item.personId} response hash 不匹配`)
      }
      if (response.requestSha256 !== item.requestSha256) issues.push(`${item.personId} request/response 未綁定`)
      validateCalculatorResponse(response.response)
    } catch (error) {
      issues.push(`${item.personId} calculator bundle 無法驗證: ${error.message}`)
    }
  }
  for (const item of manifest.reportArtifacts ?? []) {
    try {
      const artifact = await loadJson(path.join(resolvedOutputRoot, item.path))
      if (sha256(artifact) !== item.artifactSha256) issues.push(`${item.artifactId} artifact hash 不匹配`)
      if (artifact.plan !== 'C' && artifact.plan !== 'G15') issues.push(`${item.artifactId} 含禁止方案`)
      if (artifact.generation?.paidLlmExecutionAllowed !== false) issues.push(`${item.artifactId} 未封鎖 LLM`)
      for (const reference of artifact.calculators ?? []) {
        const calculator = manifest.calculators.find((candidate) => candidate.personId === reference.personId)
        if (!calculator || calculator.requestSha256 !== reference.requestSha256 || calculator.responseSha256 !== reference.responseSha256) {
          issues.push(`${item.artifactId} calculator reference 不匹配`)
        }
      }
    } catch (error) {
      issues.push(`${item.artifactId} report artifact 無法驗證: ${error.message}`)
    }
  }
  return { valid: issues.length === 0, issues }
}

export async function loadVerifiedReplayJobs(outputRoot) {
  const resolvedOutputRoot = path.resolve(outputRoot)
  const verification = await verifyReplayDirectory(resolvedOutputRoot)
  if (!verification.valid) {
    throw new Error(`replay 驗證失敗: ${verification.issues.join('; ')}`)
  }
  const manifest = await loadJson(path.join(resolvedOutputRoot, 'manifest.json'))
  const calculators = new Map()
  for (const item of manifest.calculators) {
    const requestEnvelope = await loadJson(path.join(resolvedOutputRoot, item.requestPath))
    const responseEnvelope = await loadJson(path.join(resolvedOutputRoot, item.responsePath))
    calculators.set(item.personId, {
      personId: item.personId,
      requestSha256: item.requestSha256,
      responseSha256: item.responseSha256,
      request: requestEnvelope.payload,
      response: responseEnvelope.response,
    })
  }
  const jobs = []
  for (const item of manifest.reportArtifacts) {
    jobs.push(await loadJson(path.join(resolvedOutputRoot, item.path)))
  }
  return {
    schemaVersion: manifest.schemaVersion,
    asOfDate: manifest.asOfDate,
    targetYear: manifest.targetYear,
    calculators,
    jobs,
    paidLlmExecutionAllowed: false,
  }
}

export function defaultPrivateOutputRoot(environment = process.env) {
  const perUserRoot = environment.LOCALAPPDATA || path.join(os.homedir(), '.jianyuan-private')
  return path.join(perUserRoot, 'Jianyuan', 'private', 'consultation-samples', '2026-08-08-authorized')
}
