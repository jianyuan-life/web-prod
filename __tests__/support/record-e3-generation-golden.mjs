import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  importE3GenerationSteps,
  installFixedDate,
} from './e3-generation-module-hooks.mjs'

const supportDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(supportDir, '..', '..')
const fixturePath = resolve(projectRoot, '__tests__', 'fixtures', 'e3-generation', 'golden-v1.json')
const loaderPath = resolve(supportDir, 'e3-generation-module-hooks.mjs')
const recorderPath = fileURLToPath(import.meta.url)
const goldenBytes = readFileSync(fixturePath)
const golden = JSON.parse(goldenBytes.toString('utf8'))
const sourceRootArgument = process.argv.find((argument) => argument.startsWith('--source-root='))
const sourceRoot = sourceRootArgument
  ? resolve(sourceRootArgument.slice('--source-root='.length))
  : null

if (!sourceRoot) {
  throw new Error('usage: node record-e3-generation-golden.mjs --source-root=<clean d9bf worktree>')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sha256LfNormalized(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
  return sha256(text.replace(/\r\n/g, '\n'))
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', ['-C', sourceRoot, ...args], {
    encoding,
    windowsHide: true,
  })
}

const head = git(['rev-parse', 'HEAD']).trim()
const status = git(['status', '--porcelain=v1', '--untracked-files=all'])
if (head !== golden.baselineCommit) {
  throw new Error(`golden recorder requires ${golden.baselineCommit}; observed ${head}`)
}
if (status !== '') {
  throw new Error('golden recorder requires a clean base worktree')
}

Object.assign(process.env, {
  CLAUDE_API_KEY: 'e3-generation-contract-dummy',
  DEEPSEEK_API_KEY: '',
  NEXT_PUBLIC_API_URL: 'https://e3-contract.invalid',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e3-generation-contract-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'e3-generation-contract-service',
  FF_AI_PROMPT_CACHE: 'false',
  PROMPT_CACHE_CANARY_REPORT_IDS: '',
})

const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  throw new Error(`E3 golden recorder blocked unexpected network I/O: ${String(url)}`)
}

const steps = await importE3GenerationSteps(sourceRoot)

function calculatorInput(spec) {
  const input = structuredClone(golden.birthData)
  Object.assign(input, structuredClone(spec.patch))
  for (const key of spec.remove) delete input[key]
  return input
}

function makeChumenjiResponse() {
  const doors = ['開門', '休門', '生門', '景門', '杜門', '傷門', '驚門', '死門']
  const stars = ['天心', '天輔', '天任', '天英', '天沖', '天柱', '天蓬', '天芮']
  const spirits = ['九天', '九地', '太陰', '六合', '值符', '螣蛇', '白虎', '玄武']
  const directions = ['東', '西', '南', '北', '東南', '西南', '東北', '西北']
  const hours = ['辰', '巳', '午', '未', '申', '酉', '戌', '亥']
  const timeRanges = [
    '07:00-09:00', '09:00-11:00', '11:00-13:00', '13:00-15:00',
    '15:00-17:00', '17:00-19:00', '19:00-21:00', '21:00-23:00',
  ]
  const palaces = ['坎', '坤', '震', '巽', '中', '乾', '兌', '艮']
  return {
    plan_code: 'E3',
    results: Array.from({ length: 8 }, (_, index) => ({
      rank: index + 1,
      date: `2026-08-${String(10 + index).padStart(2, '0')}`,
      solar_date: `2026-08-${String(10 + index).padStart(2, '0')}`,
      shichen: hours[index],
      time_range: timeRanges[index],
      direction: directions[index],
      door: doors[index],
      star: stars[index],
      shen: spirits[index],
      score: 100 - index,
      reason: `fixture engine reason ${index + 1}`,
      confidence: { source: 'fixture' },
      ju: `陽${index + 1}局`,
      gong: palaces[index],
      nianming_gong: `命宮-${index + 1}`,
      kongwang: index % 2 === 1,
      shensha_warning: `warning-${index + 1}`,
      week_number: Math.floor(index / 2) + 1,
      week_label: `week-${Math.floor(index / 2) + 1}`,
      week_range: '2026-08',
    })),
  }
}

function anthropicStream(content) {
  return [
    `data: ${JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: 10, output_tokens: 0 } },
    })}`,
    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: content } })}`,
    `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 20 } })}`,
    '',
  ].join('\n\n')
}

const restoreDate = installFixedDate(golden.fixedTime)
const calculatorRequestSha256 = {}
let chumenjiRequestBody = null
let claudeRequestBody = null
let aiResult = null

try {
  for (const spec of golden.calculator.cases) {
    let requestCount = 0
    globalThis.fetch = async (url, init) => {
      requestCount += 1
      if (String(url) !== 'https://e3-contract.invalid/api/calculate') {
        throw new Error(`unexpected calculator network target: ${url}`)
      }
      calculatorRequestSha256[spec.id] = sha256(String(init.body))
      return new Response(JSON.stringify(golden.calculator.response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    await steps.callPythonCalculate(calculatorInput(spec))
    if (requestCount !== 1) throw new Error(`calculator ${spec.id} emitted ${requestCount} requests`)
  }

  const chumenjiResponse = makeChumenjiResponse()
  let qimenRequestCount = 0
  globalThis.fetch = async (url, init) => {
    qimenRequestCount += 1
    if (String(url) !== 'https://e3-contract.invalid/api/chumenji-top') {
      throw new Error(`unexpected qimen network target: ${url}`)
    }
    chumenjiRequestBody = String(init.body)
    return new Response(JSON.stringify(chumenjiResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const qimenResult = await steps.callChumenjiTop('E3', structuredClone(golden.birthData))
  if (qimenRequestCount !== 1) throw new Error(`qimen emitted ${qimenRequestCount} requests`)

  let claudeRequestCount = 0
  globalThis.fetch = async (url, init) => {
    claudeRequestCount += 1
    if (String(url) !== 'https://api.anthropic.com/v1/messages') {
      throw new Error(`unexpected Claude network target: ${url}`)
    }
    claudeRequestBody = String(init.body)
    return new Response(anthropicStream(golden.claude.fakeResponse), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  aiResult = await steps.aiGenerateGeneric(
    structuredClone(golden.calculator.response),
    structuredClone(golden.birthData),
    'E3',
    steps.PLAN_SYSTEM_PROMPT.E3,
    undefined,
    undefined,
    undefined,
    qimenResult,
  )
  if (claudeRequestCount !== 1) throw new Error(`Claude emitted ${claudeRequestCount} requests`)
} finally {
  globalThis.fetch = originalFetch
  restoreDate()
}

const sourcePaths = [
  'workflows/generate-report/steps.ts',
  'workflows/generate-report/plan-prompts.ts',
  'workflows/generate-report/index.ts',
  'app/api/generate-report/route.ts',
]
const sourceBlobs = Object.fromEntries(sourcePaths.map((path) => {
  const bytes = git(['show', `${head}:${path}`], null)
  return [path, {
    gitBlob: git(['rev-parse', `${head}:${path}`]).trim(),
    sha256: sha256(bytes),
  }]
}))
const claudeRequest = JSON.parse(claudeRequestBody)

const receipt = {
  schema: 'e3-generation-base-record-receipt/v1',
  command: 'npm ci in <clean-d9bf-worktree>, then node __tests__/support/record-e3-generation-golden.mjs --source-root=<clean-d9bf-worktree>',
  git: {
    head,
    clean: true,
    statusPorcelainSha256: sha256(status),
  },
  support: {
    fixtureSha256: sha256LfNormalized(goldenBytes),
    loaderSha256: sha256LfNormalized(readFileSync(loaderPath)),
    recorderSha256: sha256LfNormalized(readFileSync(recorderPath)),
  },
  sourceBlobs,
  outputs: {
    calculatorRequestSha256,
    chumenjiRequestSha256: sha256(chumenjiRequestBody),
    systemPromptSha256: sha256(steps.PLAN_SYSTEM_PROMPT.E3),
    userPromptSha256: sha256(claudeRequest.messages[0].content),
    claudeRequestSha256: sha256(claudeRequestBody),
    outputSha256: sha256(aiResult.content),
    outputLength: aiResult.content.length,
  },
}

console.log('E3_GENERATION_BASE_RECEIPT_START')
console.log(JSON.stringify(receipt, null, 2))
console.log('E3_GENERATION_BASE_RECEIPT_END')
