import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const registeredSourceRoots = new Set([projectRoot])
const materializedRoots = new Map()
let workflowImportNonce = 0
let fallbackImportNonce = 0

const workflowStepsModule = `
  const state = () => globalThis.__E3_WORKFLOW_LEDGER_STATE__
  const record = (name, args) => state().calls.push({ name, args })
  const forbidden = (name, args) => {
    record(name, args)
    throw new Error('E3 workflow entered forbidden step: ' + name)
  }

  export const PLAN_SYSTEM_PROMPT = { E3: 'E3_WORKFLOW_SYSTEM_PROMPT_GOLDEN' }
  export function setCurrentReportId(...args) { record('setCurrentReportId', args) }
  export async function loadReportRecord(...args) { record('loadReportRecord', args); return state().record }
  export async function callPythonCalculate(...args) { record('callPythonCalculate', args); return state().calcResult }
  export async function callPythonCalculateAttested(...args) { return forbidden('callPythonCalculateAttested', args) }
  export async function callChumenjiTop(...args) { record('callChumenjiTop', args); return state().chumenjiTop }
  export async function aiGenerateGeneric(...args) {
    record('aiGenerateGeneric', args)
    return { content: state().reportContent, model: 'claude-opus-4-6' }
  }
  export function validateReportAgainstData(...args) { record('validateReportAgainstData', args); return args[0] }
  export async function qualityGate(...args) {
    record('qualityGate', args)
    return { passed: true, warnings: [], hardFailures: [], softWarnings: [] }
  }
  export async function contentModerationStep(...args) {
    record('contentModerationStep', args)
    return state().moderationResult
  }
  export async function saveReportToSupabase(...args) { record('saveReportToSupabase', args) }
  export async function sendReportEmail(...args) { record('sendReportEmail', args) }
  export async function closeProgressStream(...args) { record('closeProgressStream', args) }
  export async function markReportFailed(...args) { record('markReportFailed', args) }
  export async function markReportNeedsHumanReview(...args) { record('markReportNeedsHumanReview', args) }
  export async function generatePDF(...args) { return forbidden('generatePDF', args) }
  export async function aiExtractNarrative(...args) { return forbidden('aiExtractNarrative', args) }
  export async function aiGenerateCall1(...args) { return forbidden('aiGenerateCall1', args) }
  export async function aiGenerateCall2(...args) { return forbidden('aiGenerateCall2', args) }
  export async function aiGenerateCall3(...args) { return forbidden('aiGenerateCall3', args) }
  export async function loadFamilyReports(...args) { return forbidden('loadFamilyReports', args) }
  export async function loadFamilyReportsByIds(...args) { return forbidden('loadFamilyReportsByIds', args) }
  export async function aiGenerateG15(...args) { return forbidden('aiGenerateG15', args) }
  export async function aiGenerateR(...args) { return forbidden('aiGenerateR', args) }
  export function cleanFinalReport(...args) { return forbidden('cleanFinalReport', args) }
  export async function aiReviewReport(...args) { return forbidden('aiReviewReport', args) }
  export function buildAppendix(...args) { return forbidden('buildAppendix', args) }
`

const workflowConsultationModule = `
  const forbidden = (name, args) => {
    globalThis.__E3_WORKFLOW_LEDGER_STATE__.calls.push({ name, args })
    throw new Error('E3 workflow entered consultation path: ' + name)
  }
  export function buildStructuredCReport(...args) { return forbidden('buildStructuredCReport', args) }
  export function buildStructuredG15Report(...args) { return forbidden('buildStructuredG15Report', args) }
  export function buildConsultationCalculatorBirthData(...args) { return forbidden('buildConsultationCalculatorBirthData', args) }
`

const fallbackVirtualModules = new Map([
  [
    '@/lib/resend-helper',
    `
      export async function sendEmailWithRetry(...args) {
        globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'sendEmailWithRetry', args })
        throw new Error('E3 dry-run fallback attempted to send email')
      }
    `,
  ],
  [
    '@/lib/unsubscribe',
    `export function getUnsubscribeHtml() { throw new Error('E3 dry-run fallback entered unsubscribe/email rendering') }`,
  ],
  [
    '@/workflows/generate-report/steps',
    `
      export function validateReportAgainstData(...args) {
        globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'validateReportAgainstData', args })
        return args[0]
      }
    `,
  ],
  [
    '@/workflows/generate-report/extract-full-charts',
    `export function extractFullCharts(...args) {
      globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'extractFullCharts', args })
      throw new Error('E3 dry-run fallback entered full-chart persistence path')
    }`,
  ],
  [
    '@/lib/report/extract-narrative',
    `export async function extractNarrativeFromContent(...args) {
      globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'extractNarrativeFromContent', args })
      throw new Error('E3 dry-run fallback entered narrative path')
    }`,
  ],
  [
    '@/lib/consultation/routes',
    `export function buildAbsoluteReportUrl(...args) {
      globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'buildAbsoluteReportUrl', args })
      throw new Error('E3 dry-run fallback entered report-delivery path')
    }`,
  ],
  [
    '@/lib/ai-cost-tracker',
    `export async function recordAIUsage(...args) {
      globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'recordAIUsage', args })
    }`,
  ],
  [
    '@/lib/ai/observability/telegram',
    `export async function notifyModelDowngrade(...args) {
      globalThis.__E3_FALLBACK_GOLDEN_STATE__.calls.push({ name: 'notifyModelDowngrade', args })
      throw new Error('E3 dry-run fallback attempted to notify externally')
    }`,
  ],
  [
    '@/lib/supabase',
    `
      const state = () => globalThis.__E3_FALLBACK_GOLDEN_STATE__
      const record = (name, args) => state().calls.push({ name, args })
      const forbidden = (name, args) => {
        record(name, args)
        throw new Error('E3 dry-run fallback attempted database mutation: ' + name)
      }
      function readChain() {
        const chain = {
          select(...args) { record('supabase.select', args); return chain },
          eq(...args) { record('supabase.eq', args); return chain },
          in(...args) { record('supabase.in', args); return chain },
          async single(...args) {
            record('supabase.single', args)
            return { data: state().existingReport, error: null }
          },
          update(...args) { return forbidden('supabase.update', args) },
          insert(...args) { return forbidden('supabase.insert', args) },
          upsert(...args) { return forbidden('supabase.upsert', args) },
          delete(...args) { return forbidden('supabase.delete', args) },
        }
        return chain
      }
      export function createServiceClient(...args) {
        record('createServiceClient', args)
        return {
          from(...fromArgs) {
            record('supabase.from', fromArgs)
            return readChain()
          },
        }
      }
    `,
  ],
])

const virtualModules = new Map([
  [
    'workflow',
    `
      export class FatalError extends Error {}
      export class RetryableError extends Error {
        constructor(message, options) {
          super(message)
          this.options = options
        }
      }
      export function getWritable() {
        return {
          getWriter() {
            return {
              async write() {},
              releaseLock() {},
            }
          },
        }
      }
    `,
  ],
  [
    '@/lib/ai-cost-tracker',
    `
      export function estimateCostUsd() { return 0 }
      export async function recordAIUsage() {}
    `,
  ],
])

function virtualModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`
}

function materializeBaseFile(path) {
  const absolutePath = resolve(path)
  const entry = [...materializedRoots.entries()]
    .find(([root]) => absolutePath.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`))
  if (!entry) return false

  const [root, { commit, repositoryRoot }] = entry
  const gitPath = relative(root, absolutePath).split(sep).join('/')
  try {
    const objectType = execFileSync('git', ['cat-file', '-t', `${commit}:${gitPath}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (objectType !== 'blob') return false
    const bytes = execFileSync('git', ['show', `${commit}:${gitPath}`], {
      cwd: repositoryRoot,
      encoding: null,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, bytes)
    return true
  } catch {
    return false
  }
}

function findModuleFile(candidate) {
  for (const path of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.mjs`,
    resolve(candidate, 'index.ts'),
    resolve(candidate, 'index.tsx'),
    resolve(candidate, 'index.js'),
  ]) {
    if (!existsSync(path)) materializeBaseFile(path)
    if (existsSync(path) && statSync(path).isFile()) return path
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const workflowLedgerParent = context.parentURL?.includes('e3-workflow-ledger=')
    if (workflowLedgerParent && specifier === './steps') {
      return { url: virtualModuleUrl(workflowStepsModule), shortCircuit: true }
    }
    if (workflowLedgerParent && specifier === './consultation-v1') {
      return { url: virtualModuleUrl(workflowConsultationModule), shortCircuit: true }
    }

    const fallbackGoldenParent = context.parentURL?.includes('e3-fallback-golden=')
    if (fallbackGoldenParent) {
      if (specifier === 'next/server') {
        return {
          url: pathToFileURL(resolve(projectRoot, 'node_modules', 'next', 'server.js')).href,
          shortCircuit: true,
        }
      }
      const fallbackVirtualSource = fallbackVirtualModules.get(specifier)
      if (fallbackVirtualSource) {
        return { url: virtualModuleUrl(fallbackVirtualSource), shortCircuit: true }
      }
    }

    const virtualSource = virtualModules.get(specifier)
    if (virtualSource) {
      return { url: virtualModuleUrl(virtualSource), shortCircuit: true }
    }

    let candidate = null
    if (specifier.startsWith('@/')) {
      const parentPath = context.parentURL?.startsWith('file:')
        ? fileURLToPath(context.parentURL).split('?')[0]
        : ''
      const owningRoot = [...registeredSourceRoots]
        .sort((left, right) => right.length - left.length)
        .find((root) => parentPath.toLowerCase().startsWith(root.toLowerCase()))
        || projectRoot
      candidate = resolve(owningRoot, specifier.slice(2))
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL?.startsWith('file:')
    ) {
      candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier)
    }

    if (candidate) {
      const path = findModuleFile(candidate)
      if (path) return { url: pathToFileURL(path).href, shortCircuit: true }
    }

    return nextResolve(specifier, context)
  },
})

export function installFixedDate(isoTimestamp) {
  const OriginalDate = globalThis.Date
  const fixedMillis = new OriginalDate(isoTimestamp).valueOf()

  globalThis.Date = class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedMillis]))
    }

    static now() {
      return fixedMillis
    }
  }

  return () => {
    globalThis.Date = OriginalDate
  }
}

export async function importE3GenerationSteps(sourceRoot = projectRoot) {
  const root = resolve(sourceRoot)
  registeredSourceRoots.add(root)
  materializeBaseFile(resolve(root, 'workflows', 'generate-report', 'steps.ts'))
  return import(pathToFileURL(
    resolve(root, 'workflows', 'generate-report', 'steps.ts'),
  ).href)
}

export async function importE3WorkflowIndexWithLedger(state, sourceRoot = projectRoot) {
  globalThis.__E3_WORKFLOW_LEDGER_STATE__ = state
  const root = resolve(sourceRoot)
  registeredSourceRoots.add(root)
  materializeBaseFile(resolve(root, 'workflows', 'generate-report', 'index.ts'))
  workflowImportNonce += 1
  const url = new URL(pathToFileURL(
    resolve(root, 'workflows', 'generate-report', 'index.ts'),
  ).href)
  url.searchParams.set('e3-workflow-ledger', String(workflowImportNonce))
  return import(url.href)
}

export async function importE3FallbackRouteWithBoundaries(state, sourceRoot = projectRoot) {
  globalThis.__E3_FALLBACK_GOLDEN_STATE__ = state
  const root = resolve(sourceRoot)
  registeredSourceRoots.add(root)
  materializeBaseFile(resolve(root, 'app', 'api', 'generate-report', 'route.ts'))
  fallbackImportNonce += 1
  const url = new URL(pathToFileURL(
    resolve(root, 'app', 'api', 'generate-report', 'route.ts'),
  ).href)
  url.searchParams.set('e3-fallback-golden', String(fallbackImportNonce))
  return import(url.href)
}

export function materializeGitCommit(commit, repositoryRoot = projectRoot) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'e3-generation-base-'))
  const sourceRoot = tempRoot
  try {
    try {
      execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
        cwd: repositoryRoot,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (cause) {
      throw new Error(
        `immutable E3 baseline ${commit} is unavailable; CI must checkout with fetch-depth: 0 or fetch that exact commit`,
        { cause },
      )
    }

    // Keep the immutable source bytes from Git, but reuse the candidate's
    // lockfile-installed dependencies. A directory junction works on Windows
    // without developer-mode symlink privileges and is a normal symlink on CI.
    const dependencyRoot = resolve(repositoryRoot, 'node_modules')
    if (!existsSync(dependencyRoot)) {
      throw new Error(`node_modules missing at ${dependencyRoot}; install the lockfile before running E3 golden tests`)
    }
    symlinkSync(dependencyRoot, resolve(sourceRoot, 'node_modules'), 'junction')
    materializedRoots.set(sourceRoot, {
      commit,
      repositoryRoot: resolve(repositoryRoot),
    })
    return {
      root: sourceRoot,
      cleanup() {
        materializedRoots.delete(sourceRoot)
        rmSync(tempRoot, { recursive: true, force: true })
      },
    }
  } catch (error) {
    materializedRoots.delete(sourceRoot)
    rmSync(tempRoot, { recursive: true, force: true })
    throw error
  }
}
