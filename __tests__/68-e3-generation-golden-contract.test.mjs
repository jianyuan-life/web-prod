import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test, { after } from 'node:test'
import {
  CALCULATOR_ATTESTATION_NONCE_HEADER,
  CALCULATOR_REQUEST_AUTH_HEADERS,
  createCalculatorRequestAuthenticationHeaders,
} from '../lib/consultation/calculator-attestation.ts'
import {
  importE3FallbackRouteWithBoundaries,
  importE3GenerationSteps,
  importE3WorkflowIndexWithLedger,
  installFixedDate,
  materializeGitCommit,
} from './support/e3-generation-module-hooks.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const goldenUrl = new URL('./fixtures/e3-generation/golden-v1.json', import.meta.url)
const goldenBytes = readFileSync(goldenUrl)
const golden = JSON.parse(goldenBytes.toString('utf8'))
const baseReceipt = JSON.parse(readFileSync(
  new URL('./fixtures/e3-generation/base-record-receipt-v1.json', import.meta.url),
  'utf8',
))

const E3_TRANSPORT_SECRET = 'e3-generation-contract-attestation-secret-32-bytes'
const E3_TRANSPORT_KEY_ID = 'e3-generation-contract-key'

Object.assign(process.env, {
  CLAUDE_API_KEY: 'e3-generation-contract-dummy',
  DEEPSEEK_API_KEY: '',
  NEXT_PUBLIC_API_URL: 'https://e3-contract.invalid',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e3-generation-contract-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'e3-generation-contract-service',
  FF_AI_PROMPT_CACHE: 'false',
  PROMPT_CACHE_CANARY_REPORT_IDS: '',
  CRON_SECRET: 'e3-generation-contract-cron-secret',
  CALCULATOR_ATTESTATION_SECRET: E3_TRANSPORT_SECRET,
  CALCULATOR_ATTESTATION_KEY_ID: E3_TRANSPORT_KEY_ID,
})

const originalFetch = globalThis.fetch
const denyUnexpectedNetwork = async (url) => {
  throw new Error(`E3 golden contract blocked unexpected network I/O: ${String(url)}`)
}
globalThis.fetch = denyUnexpectedNetwork

const materializedBase = materializeGitCommit(golden.baselineCommit, projectRoot)
after(() => {
  globalThis.fetch = originalFetch
  materializedBase.cleanup()
})

const steps = await importE3GenerationSteps()
const baseSteps = await importE3GenerationSteps(materializedBase.root)

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sha256LfNormalized(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
  return sha256(text.replace(/\r\n/g, '\n'))
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding,
    windowsHide: true,
  })
}

async function withFetchMock(mock, callback) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mock
  try {
    return await callback()
  } finally {
    globalThis.fetch = originalFetch
  }
}

function snapshotRequest(url, init = {}) {
  const additional = {}
  for (const key of Object.keys(init).sort()) {
    if (['method', 'headers', 'body', 'signal'].includes(key)) continue
    try {
      additional[key] = structuredClone(init[key])
    } catch {
      additional[key] = String(init[key])
    }
  }
  return {
    url: String(url),
    method: init.method ?? null,
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: init.body === undefined ? null : String(init.body),
    signal: Object.prototype.hasOwnProperty.call(init, 'signal')
      ? { present: true, aborted: init.signal?.aborted === true }
      : { present: false, aborted: false },
    additional,
  }
}

const requestAuthHeaderNames = [
  CALCULATOR_ATTESTATION_NONCE_HEADER,
  ...Object.values(CALCULATOR_REQUEST_AUTH_HEADERS),
].map((name) => name.toLowerCase())

function withoutRequestAuthentication(value) {
  const clone = structuredClone(value)
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.headers && typeof node.headers === 'object') {
      for (const name of requestAuthHeaderNames) delete node.headers[name]
    }
    for (const child of Object.values(node)) visit(child)
  }
  visit(clone)
  return clone
}

// Security exception to the historical byte freeze: operational telemetry must
// not retain a raw paid-report identifier. This upgrades only the usage receipt;
// response bytes, prompts, requests and every other call remain byte-frozen.
function withPrivacySafeUsageIdentity(value) {
  const clone = structuredClone(value)
  for (const entry of clone.calls ?? []) {
    if (entry.name !== 'recordAIUsage') continue
    for (const payload of entry.args ?? []) {
      if (payload && typeof payload === 'object') payload.reportId = null
    }
  }
  return clone
}

function assertValidRequestAuthentication(request) {
  const headers = request.headers
  const nonce = headers[CALCULATOR_ATTESTATION_NONCE_HEADER.toLowerCase()]
  const issuedAt = Number(headers[CALCULATOR_REQUEST_AUTH_HEADERS.issuedAt.toLowerCase()])
  const path = new URL(request.url).pathname
  const expected = createCalculatorRequestAuthenticationHeaders({
    requestBody: request.body,
    method: 'POST',
    path,
    nonce,
    secret: E3_TRANSPORT_SECRET,
    keyId: E3_TRANSPORT_KEY_ID,
    issuedAt,
  })
  assert.equal(headers[CALCULATOR_REQUEST_AUTH_HEADERS.version.toLowerCase()], expected[CALCULATOR_REQUEST_AUTH_HEADERS.version])
  assert.equal(headers[CALCULATOR_REQUEST_AUTH_HEADERS.keyId.toLowerCase()], expected[CALCULATOR_REQUEST_AUTH_HEADERS.keyId])
  assert.equal(headers[CALCULATOR_REQUEST_AUTH_HEADERS.signature.toLowerCase()], expected[CALCULATOR_REQUEST_AUTH_HEADERS.signature])
}

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

function makeFallbackCards() {
  return makeChumenjiResponse().results.map((item) => ({
    rank: item.rank,
    date: item.date,
    time_start: item.time_range.split('-')[0],
    time_end: item.time_range.split('-')[1],
    direction: item.direction,
    door: item.door,
    star: item.star,
    shen: item.shen,
    gong: item.gong,
    reason: item.reason,
    kongwang: item.kongwang,
    shensha_warning: item.shensha_warning,
  }))
}

function makeFallbackClaudeResponse() {
  return makeFallbackCards().map((card, index) => [
    `## 第 ${Math.floor(index / 2) + 1} 週 TOP ${(index % 2) + 1}｜E3 fallback synthetic card ${index + 1}`,
    `本卡唯一識別：E3-FALLBACK-CARD-${index + 1}`,
    '===TOP1_JSON_START===',
    JSON.stringify(card),
    '===TOP1_JSON_END===',
  ].join('\n')).join('\n\n')
}

function makeFallbackState() {
  return {
    calls: [],
    existingReport: {
      retry_count: 0,
      status: 'completed',
      birth_data: null,
      plan_code: 'E3',
      access_token: 'e3-fallback-access-token',
      customer_email: 'e3-fallback@example.invalid',
    },
  }
}

async function observeFallbackRoute(sourceRoot) {
  const state = makeFallbackState()
  const route = await importE3FallbackRouteWithBoundaries(state, sourceRoot)
  const requests = []
  const restoreDate = installFixedDate(golden.fixedTime)
  try {
    const response = await withFetchMock(async (url, init) => {
      const target = String(url)
      requests.push(snapshotRequest(url, init))
      if (target === 'https://e3-contract.invalid/api/calculate') {
        return new Response(JSON.stringify(golden.calculator.response), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (target === 'https://api.anthropic.com/v1/messages') {
        return new Response(anthropicStream(makeFallbackClaudeResponse()), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      throw new Error(`E3 fallback emitted forbidden network request: ${target}`)
    }, () => route.POST({
      headers: new Headers({
        'x-internal-secret': 'e3-generation-contract-cron-secret',
      }),
      async json() {
        return {
          reportId: 'e3-fallback-golden-report',
          accessToken: 'e3-fallback-access-token',
          customerEmail: 'e3-fallback@example.invalid',
          planCode: 'E3',
          birthData: structuredClone(golden.birthData),
          topic: 'career',
          question: 'E3 fallback synthetic question',
          dryRun: true,
        }
      },
    }))
    const rawBody = await response.text()
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      rawBody,
      body: JSON.parse(rawBody),
      requests,
      calls: structuredClone(state.calls),
    }
  } finally {
    restoreDate()
  }
}

async function observeGenerationSteps(subjectSteps) {
  const observation = {
    calculator: {},
    chumenji: null,
    claude: null,
  }
  const restoreDate = installFixedDate(golden.fixedTime)
  try {
    for (const spec of golden.calculator.cases) {
      let request = null
      const result = await withFetchMock(async (url, init) => {
        request = snapshotRequest(url, init)
        return new Response(JSON.stringify(golden.calculator.response), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }, () => subjectSteps.callPythonCalculate(calculatorInput(spec)))
      observation.calculator[spec.id] = { request, result }
    }

    const chumenjiResult = await withFetchMock(async (url, init) => {
      observation.chumenji = {
        request: snapshotRequest(url, init),
        result: null,
      }
      return new Response(JSON.stringify(makeChumenjiResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }, () => subjectSteps.callChumenjiTop('E3', structuredClone(golden.birthData)))
    observation.chumenji.result = chumenjiResult

    let claudeRequest = null
    const claudeResult = await withFetchMock(async (url, init) => {
      claudeRequest = snapshotRequest(url, init)
      return new Response(anthropicStream(golden.claude.fakeResponse), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }, () => subjectSteps.aiGenerateGeneric(
      structuredClone(golden.calculator.response),
      structuredClone(golden.birthData),
      'E3',
      subjectSteps.PLAN_SYSTEM_PROMPT.E3,
      undefined,
      undefined,
      undefined,
      makeChumenjiResponse(),
    ))
    observation.claude = { request: claudeRequest, result: claudeResult }
    return observation
  } finally {
    restoreDate()
  }
}

function makeQualityReport(cardCount = 8) {
  const topics = [
    { name: '事業運', rank: 1 },
    { name: '財運', rank: 2 },
    { name: '家庭', rank: 3 },
  ]
  const cards = []
  for (let index = 0; index < cardCount; index += 1) {
    const week = Math.floor(index / 2) + 1
    const top = (index % 2) + 1
    const topic = topics[index % topics.length]
    const payload = {
      rank: index + 1,
      date: `2026-08-${String(10 + index).padStart(2, '0')}`,
      time_start: '09:00',
      time_end: '11:00',
      direction: '東',
      plain_advantage: '天心、開門與九天的組合有利於把本週的行動順序講清楚，並且留出可以調整的空間。',
      plain_purpose: ['出門前寫下一個主要目標', '抵達後先完成最重要的一步'],
      door: '開門',
      star: '天心',
      shen: '九天',
    }
    const explanation = '這張卡以天心、開門、九天為依據，說明當天如何安排出門後的行動。'
    cards.push([
      `## 第 ${week} 週 TOP ${top}｜合成吉時`,
      `主題：${topic.name}（TOP ${topic.rank}）`,
      explanation.repeat(9),
      `===TOP${top}_JSON_START===`,
      JSON.stringify(payload),
      `===TOP${top}_JSON_END===`,
    ].join('\n'))
  }
  return `${cards.join('\n\n')}\n\n完整結束。`
}

test('golden 來自指定的乾淨 base commit，不得對候選輸出自我錄製', () => {
  assert.equal(golden.schema, 'e3-generation-golden/v1')
  assert.equal(golden.baselineCommit, 'd9bf5da09ff9a18f25d1d8b5d62ec3c88062cff5')
  assert.equal(baseReceipt.schema, 'e3-generation-base-record-receipt/v1')
  assert.equal(baseReceipt.git.head, golden.baselineCommit)
  assert.equal(baseReceipt.git.clean, true)
  assert.equal(baseReceipt.git.statusPorcelainSha256, sha256(''))
  assert.equal(baseReceipt.support.fixtureSha256, sha256LfNormalized(goldenBytes))
  assert.equal(
    baseReceipt.support.loaderSha256,
    sha256LfNormalized(readFileSync(new URL('./support/e3-generation-module-hooks.mjs', import.meta.url))),
  )
  assert.equal(
    baseReceipt.support.recorderSha256,
    sha256LfNormalized(readFileSync(new URL('./support/record-e3-generation-golden.mjs', import.meta.url))),
  )

  assert.equal(git(['rev-parse', `${golden.baselineCommit}^{commit}`]).trim(), golden.baselineCommit)
  for (const [path, source] of Object.entries(baseReceipt.sourceBlobs)) {
    assert.equal(git(['rev-parse', `${golden.baselineCommit}:${path}`]).trim(), source.gitBlob, path)
    assert.equal(sha256(git(['show', `${golden.baselineCommit}:${path}`], null)), source.sha256, path)
  }

  assert.deepEqual(
    Object.fromEntries(golden.calculator.cases.map((spec) => [spec.id, sha256(spec.requestBody)])),
    baseReceipt.outputs.calculatorRequestSha256,
  )
  assert.equal(sha256(golden.chumenji.requestBody), baseReceipt.outputs.chumenjiRequestSha256)
  assert.equal(golden.claude.systemPromptSha256, baseReceipt.outputs.systemPromptSha256)
  assert.equal(golden.claude.userPromptSha256, baseReceipt.outputs.userPromptSha256)
  assert.equal(golden.claude.requestBodySha256, baseReceipt.outputs.claudeRequestSha256)
  assert.equal(golden.claude.outputSha256, baseReceipt.outputs.outputSha256)
  assert.equal(golden.claude.outputLength, baseReceipt.outputs.outputLength)
})

test('每次測試都從 immutable d9bf source 真執行 steps，候選 E3 bytes 必須逐欄相同', async () => {
  const baseObservation = await observeGenerationSteps(baseSteps)
  const candidateObservation = await observeGenerationSteps(steps)

  assert.deepEqual(
    withoutRequestAuthentication(candidateObservation),
    baseObservation,
  )
  for (const item of Object.values(candidateObservation.calculator)) {
    assertValidRequestAuthentication(item.request)
  }
  assertValidRequestAuthentication(candidateObservation.chumenji.request)
  assert.equal(baseObservation.chumenji.request.body, golden.chumenji.requestBody)
  const baseClaudeRequest = JSON.parse(baseObservation.claude.request.body)
  assert.equal(baseClaudeRequest.model, 'claude-opus-4-6')
  assert.equal(baseClaudeRequest.max_tokens, 128000)
  assert.equal(baseClaudeRequest.stream, true)
  assert.equal(
    baseClaudeRequest.messages[0].content.includes('DECOY_BAZI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'),
    false,
  )
  assert.equal(
    baseClaudeRequest.messages[0].content.includes('DECOY_ZIWEI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'),
    false,
  )
  assert.equal(
    baseClaudeRequest.messages[0].content.includes('DECOY_ASTROLOGY_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'),
    false,
  )
})

test('E3 production validator 真執行 immutable base，四柱、流年、用神與生肖修正不可漂移', () => {
  const calcResult = {
    client_data: {
      bazi: '甲子 乙丑 丙寅 丁卯',
      yongshen: '木',
    },
    analyses: [],
  }
  const birthData = {
    ...structuredClone(golden.birthData),
    plan: 'E3',
  }
  const incorrect = [
    '年柱：庚申',
    '2026年：乙巳年',
    '用神：火',
    '生肖：鼠',
  ].join('\n')
  const restoreDate = installFixedDate(golden.fixedTime)
  try {
    const baseValidated = baseSteps.validateReportAgainstData(incorrect, calcResult, birthData)
    const candidateValidated = steps.validateReportAgainstData(incorrect, calcResult, birthData)
    assert.equal(candidateValidated, baseValidated)
    assert.equal(candidateValidated.includes('年柱：甲子'), true)
    assert.equal(candidateValidated.includes('2026年：丙午年'), true)
    assert.equal(candidateValidated.includes('用神：木'), true)
    assert.equal(candidateValidated.includes('生肖：馬'), true)
    assert.equal(candidateValidated.includes('庚申'), false)
    assert.equal(candidateValidated.includes('乙巳'), false)
  } finally {
    restoreDate()
  }
})

test('E3 production moderation 真執行 immutable base，封鎖命中與既有放行政策不可漂移', async () => {
  const reportContent = '本合成案例包含禁止句：你一定會離婚。'
  const observe = async (subjectSteps) => {
    const requests = []
    const result = await withFetchMock(async (url, init) => {
      requests.push(snapshotRequest(url, init))
      return new Response('[]', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }, () => subjectSteps.contentModerationStep(
      'e3-moderation-golden-report',
      reportContent,
      'E3',
      { skipAi: true, customerName: golden.birthData.name },
    ))
    return { result, requests }
  }

  const baseObservation = await observe(baseSteps)
  const candidateObservation = await observe(steps)
  assert.deepEqual(candidateObservation, baseObservation)
  assert.equal(baseObservation.result.action, 'retry_with_guard')
  assert.equal(baseObservation.result.blocked, true)
  assert.equal(baseObservation.result.blacklistCount, 1)
  assert.equal(baseObservation.result.reason.includes('extreme_fortune'), true)
  assert.equal(baseObservation.requests.length, 1)
  assert.equal(baseObservation.requests[0].url.startsWith('http://127.0.0.1:54321/rest/v1/moderation_log'), true)
  assert.equal(baseObservation.requests[0].method, 'POST')
})

test('E3 fallback POST 真執行 immutable base 與候選路由，鎖定 legacy dry-run 且禁止交付副作用', async () => {
  const baseObservation = await observeFallbackRoute(materializedBase.root)
  const candidateObservation = await observeFallbackRoute(projectRoot)

  assert.deepEqual(
    withoutRequestAuthentication(candidateObservation),
    withPrivacySafeUsageIdentity(baseObservation),
  )
  assertValidRequestAuthentication(candidateObservation.requests[0])
  assert.equal(candidateObservation.rawBody, baseObservation.rawBody)
  assert.deepEqual(candidateObservation.body, baseObservation.body)
  assert.deepEqual(
    withoutRequestAuthentication(candidateObservation.requests),
    baseObservation.requests,
  )
  const candidateUsage = candidateObservation.calls.find((entry) => entry.name === 'recordAIUsage')
  assert.equal(candidateUsage.args[0].reportId, null)
  assert.equal(JSON.stringify(candidateUsage).includes('e3-fallback-golden-report'), false)
  assert.equal(baseObservation.status, 200)
  assert.equal(baseObservation.headers['content-type'], 'application/json')
  assert.equal(baseObservation.rawBody, JSON.stringify(baseObservation.body))
  assert.deepEqual(baseObservation.requests.map((request) => request.url), [
    'https://e3-contract.invalid/api/calculate',
    'https://api.anthropic.com/v1/messages',
  ])

  const calculatorRequest = JSON.parse(baseObservation.requests[0].body)
  assert.equal(calculatorRequest.plan, undefined)
  assert.equal(calculatorRequest.target_year, undefined)
  assert.equal(calculatorRequest.as_of, undefined)
  const claudeRequest = JSON.parse(baseObservation.requests[1].body)
  assert.equal(claudeRequest.model, 'claude-opus-4-6')
  assert.equal(claudeRequest.max_tokens, 32768)
  assert.equal(claudeRequest.stream, true)
  assert.equal(claudeRequest.messages[0].content.includes('DECOY_BAZI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'), true)
  assert.equal(claudeRequest.messages[0].content.includes('DECOY_ZIWEI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'), true)
  assert.equal(claudeRequest.messages[0].content.includes('DECOY_ASTROLOGY_MUST_NOT_REACH_E3_WORKFLOW_PROMPT'), true)

  assert.equal(baseObservation.body.ok, true)
  assert.equal(baseObservation.body.dryRun, true)
  assert.equal(baseObservation.body.report_id, 'e3-fallback-golden-report')
  assert.equal(baseObservation.body.plan_code, 'E3')
  assert.equal(baseObservation.body.ai_model, 'claude-opus-4-6')
  assert.equal(baseObservation.body.path, 'fallback-generate-report')
  assert.deepEqual(baseObservation.body.top5_timings, makeFallbackCards())
  assert.equal(baseObservation.body.generated_content.includes('TOP1_JSON_START'), false)
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(baseObservation.body.generated_content.includes(`E3-FALLBACK-CARD-${index}`), true)
  }

  assert.deepEqual(baseObservation.calls.map((entry) => entry.name), [
    'createServiceClient',
    'supabase.from',
    'supabase.select',
    'supabase.eq',
    'supabase.single',
    'recordAIUsage',
    'validateReportAgainstData',
  ])
  const fallbackValidateCall = baseObservation.calls.find(
    (entry) => entry.name === 'validateReportAgainstData',
  )
  assert.deepEqual(fallbackValidateCall.args, [
    makeFallbackClaudeResponse(),
    golden.calculator.response,
    golden.birthData,
  ])
  const forbiddenCalls = new Set([
    'supabase.update',
    'supabase.insert',
    'supabase.upsert',
    'supabase.delete',
    'sendEmailWithRetry',
    'extractFullCharts',
    'extractNarrativeFromContent',
    'buildAbsoluteReportUrl',
    'notifyModelDowngrade',
    'callPythonCalculateAttested',
    'buildStructuredCReport',
    'buildStructuredG15Report',
    'generatePDF',
    'aiExtractNarrative',
    'qualityGate',
  ])
  assert.deepEqual(
    baseObservation.calls.map((entry) => entry.name).filter((name) => forbiddenCalls.has(name)),
    [],
  )
})

test('E3 Fly calculator 依舊序列化成 base 的相同 bytes', async () => {
  for (const spec of golden.calculator.cases) {
    let observedUrl = null
    let observedBody = null
    let observedMethod = null
    let observedContentType = null
    let requestCount = 0
    const result = await withFetchMock(async (url, init) => {
      requestCount += 1
      observedUrl = String(url)
      observedBody = String(init.body)
      observedMethod = init.method
      observedContentType = init.headers['Content-Type']
      return new Response(JSON.stringify(golden.calculator.response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }, () => steps.callPythonCalculate(calculatorInput(spec)))

    assert.equal(requestCount, 1, spec.id)
    assert.equal(observedUrl, 'https://e3-contract.invalid/api/calculate', spec.id)
    assert.equal(observedMethod, 'POST', spec.id)
    assert.equal(observedContentType, 'application/json', spec.id)
    assert.equal(observedBody, spec.requestBody, spec.id)
    assert.deepEqual(result, golden.calculator.response, spec.id)
  }
})

test('E3 奇門 Top 引擎依舊送出 4 週乘每週 2 個吉時的完整請求', async () => {
  const restoreDate = installFixedDate(golden.fixedTime)
  const expectedResponse = makeChumenjiResponse()
  let observedUrl = null
  let observedBody = null
  let observedMethod = null
  let observedContentType = null
  let requestCount = 0
  try {
    const result = await withFetchMock(async (url, init) => {
      requestCount += 1
      observedUrl = String(url)
      observedBody = String(init.body)
      observedMethod = init.method
      observedContentType = init.headers['Content-Type']
      return new Response(JSON.stringify(expectedResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }, () => steps.callChumenjiTop('E3', structuredClone(golden.birthData)))

    assert.equal(requestCount, 1)
    assert.equal(observedUrl, 'https://e3-contract.invalid/api/chumenji-top')
    assert.equal(observedMethod, 'POST')
    assert.equal(observedContentType, 'application/json')
    assert.equal(observedBody, golden.chumenji.requestBody)
    assert.deepEqual(result, expectedResponse)
  } finally {
    restoreDate()
  }
})

test('E3 Claude 呼叫鎖定 Opus 4.6、128k、system prompt 與完整 user prompt bytes', async () => {
  const restoreDate = installFixedDate(golden.fixedTime)
  let observedUrl = null
  let observedBody = null
  let observedMethod = null
  let observedHeaders = null
  let requestCount = 0
  try {
    const result = await withFetchMock(async (url, init) => {
      requestCount += 1
      observedUrl = String(url)
      observedBody = String(init.body)
      observedMethod = init.method
      observedHeaders = init.headers
      return new Response(anthropicStream(golden.claude.fakeResponse), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }, () => steps.aiGenerateGeneric(
      structuredClone(golden.calculator.response),
      structuredClone(golden.birthData),
      'E3',
      steps.PLAN_SYSTEM_PROMPT.E3,
      undefined,
      undefined,
      undefined,
      makeChumenjiResponse(),
    ))

    const request = JSON.parse(observedBody)
    assert.equal(requestCount, 1)
    assert.equal(observedUrl, 'https://api.anthropic.com/v1/messages')
    assert.equal(observedMethod, 'POST')
    assert.equal(observedHeaders['content-type'], 'application/json')
    assert.equal(observedHeaders['anthropic-version'], '2023-06-01')
    assert.equal(observedHeaders['x-api-key'], 'e3-generation-contract-dummy')
    assert.equal(observedHeaders['anthropic-beta'], undefined)
    assert.equal(request.model, golden.claude.model)
    assert.equal(request.max_tokens, golden.claude.maxTokens)
    assert.equal(request.stream, golden.claude.stream)
    assert.equal(sha256(request.system), golden.claude.systemPromptSha256)
    assert.equal(sha256(request.messages[0].content), golden.claude.userPromptSha256)
    assert.equal(sha256(observedBody), golden.claude.requestBodySha256)
    assert.equal(result.model, golden.claude.model)
    assert.equal(result.content.length, golden.claude.outputLength)
    assert.equal(sha256(result.content), golden.claude.outputSha256)
  } finally {
    restoreDate()
  }
})

async function executeWorkflowLedger(sourceRoot) {
  const reportId = 'e3-workflow-golden-report'
  const birthData = structuredClone(golden.birthData)
  const calcResult = structuredClone(golden.calculator.response)
  const chumenjiTop = makeChumenjiResponse()
  const reportContent = [
    'E3 synthetic workflow content remains on the existing delivery path.',
    '八字禁詞',
    '用神禁詞',
    '紫微禁詞',
    'E3 synthetic workflow closing sentinel.',
  ].join('\n')
  const state = {
    calls: [],
    record: {
      birthData,
      planCode: 'E3',
      accessToken: 'e3-synthetic-access-token',
      customerEmail: 'e3-generation@example.invalid',
      userId: 'e3-synthetic-user',
      retryCount: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    calcResult,
    chumenjiTop,
    reportContent,
    moderationResult: {
      action: 'retry_with_guard',
      blocked: true,
      warnings: ['E3 synthetic moderation finding'],
      guardInstruction: 'E3 synthetic guard',
      reason: 'E3 synthetic moderation reason',
      blacklistCount: 1,
    },
  }

  const workflow = await importE3WorkflowIndexWithLedger(state, sourceRoot)
  const result = await workflow.generateReportWorkflow(reportId)
  return { reportId, birthData, calcResult, chumenjiTop, reportContent, state, result }
}

test('E3 真 workflow 編排鎖定 legacy steps 順序，且不得進入 consultation、PDF 或 narrative', async () => {
  const baseRun = await executeWorkflowLedger(materializedBase.root)
  const candidateRun = await executeWorkflowLedger(projectRoot)
  assert.deepEqual(candidateRun, baseRun)

  const {
    reportId,
    birthData,
    calcResult,
    chumenjiTop,
    reportContent,
    state,
    result,
  } = candidateRun
  const callNames = state.calls.map((entry) => entry.name)

  assert.deepEqual(callNames, [
    'setCurrentReportId',
    'loadReportRecord',
    'callPythonCalculate',
    'callChumenjiTop',
    'aiGenerateGeneric',
    'validateReportAgainstData',
    'qualityGate',
    'contentModerationStep',
    'saveReportToSupabase',
    'sendReportEmail',
    'closeProgressStream',
  ])

  const genericCall = state.calls.find((entry) => entry.name === 'aiGenerateGeneric')
  assert.equal(genericCall.args[2], 'E3')
  assert.equal(genericCall.args[3], 'E3_WORKFLOW_SYSTEM_PROMPT_GOLDEN')
  assert.equal(genericCall.args[6], reportId)
  assert.deepEqual(genericCall.args[7], chumenjiTop)

  const calculateCall = state.calls.find((entry) => entry.name === 'callPythonCalculate')
  assert.deepEqual(calculateCall.args, [birthData])
  const chumenjiCall = state.calls.find((entry) => entry.name === 'callChumenjiTop')
  assert.deepEqual(chumenjiCall.args, ['E3', birthData])
  const validateCall = state.calls.find((entry) => entry.name === 'validateReportAgainstData')
  assert.deepEqual(validateCall.args, [reportContent, calcResult, birthData])
  const qualityCall = state.calls.find((entry) => entry.name === 'qualityGate')
  assert.deepEqual(qualityCall.args, [reportContent, 'E3', 4, chumenjiTop, birthData])
  const moderationCall = state.calls.find((entry) => entry.name === 'contentModerationStep')
  assert.deepEqual(moderationCall.args, [
    reportId,
    reportContent,
    'E3',
    { customerName: golden.birthData.name },
  ])
  const saveCall = state.calls.find((entry) => entry.name === 'saveReportToSupabase')
  assert.equal(saveCall.args[0], reportId)
  const cleanedReportContent = saveCall.args[1]
  assert.equal(cleanedReportContent.includes('八字'), false)
  assert.equal(cleanedReportContent.includes('用神'), false)
  assert.equal(cleanedReportContent.includes('紫微'), false)
  assert.equal(cleanedReportContent.includes('年命宮能量禁詞'), true)
  assert.equal(cleanedReportContent.includes('E3 synthetic workflow closing sentinel.'), true)
  assert.equal(saveCall.args[2], 'claude-opus-4-6')
  assert.deepEqual(saveCall.args[3], calcResult.analyses.map(({ system, score }) => ({ system, score })))
  assert.equal(saveCall.args[4], null)
  assert.equal(saveCall.args[5].length, 8)
  assert.deepEqual(
    saveCall.args[5].map((timing) => ({
      rank: timing.rank,
      date: timing.date,
      time_start: timing.time_start,
      time_end: timing.time_end,
      direction: timing.direction,
      door: timing.door,
      star: timing.star,
      shen: timing.shen,
      gong: timing.gong,
      nianming_gong: timing.nianming_gong,
      kongwang: timing.kongwang,
      shensha_warning: timing.shensha_warning,
    })),
    chumenjiTop.results.map((timing) => ({
      rank: timing.rank,
      date: timing.date,
      time_start: timing.time_range.split('-')[0],
      time_end: timing.time_range.split('-')[1],
      direction: timing.direction,
      door: timing.door,
      star: timing.star,
      shen: timing.shen,
      gong: timing.gong,
      nianming_gong: timing.nianming_gong,
      kongwang: timing.kongwang,
      shensha_warning: timing.shensha_warning,
    })),
  )
  assert.deepEqual(saveCall.args[6], {
    qimen: { ju: '', summary: 'fixture summary' },
    bazi: { summary: 'DECOY_BAZI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT' },
    ziwei: { summary: 'DECOY_ZIWEI_MUST_NOT_REACH_E3_WORKFLOW_PROMPT' },
    western: { summary: 'DECOY_ASTROLOGY_MUST_NOT_REACH_E3_WORKFLOW_PROMPT' },
  })
  assert.equal(saveCall.args[7], undefined)

  const emailCall = state.calls.find((entry) => entry.name === 'sendReportEmail')
  assert.deepEqual(emailCall.args, [
    reportId,
    'e3-generation@example.invalid',
    'e3-synthetic-access-token',
    birthData,
    'E3',
    cleanedReportContent,
    4,
  ])

  const forbiddenSteps = new Set([
    'callPythonCalculateAttested',
    'buildConsultationCalculatorBirthData',
    'buildStructuredCReport',
    'buildStructuredG15Report',
    'generatePDF',
    'aiExtractNarrative',
    'markReportFailed',
    'markReportNeedsHumanReview',
  ])
  assert.deepEqual(callNames.filter((name) => forbiddenSteps.has(name)), [])
  assert.deepEqual(result, {
    success: true,
    reportId,
    contentLength: cleanedReportContent.length,
    systemsCount: 4,
    aiModel: 'claude-opus-4-6',
  })
})

test('E3 quality gate 接受完整 8 卡，並精確擋下少卡、錯主題與門星神依據不足', async () => {
  const birthData = structuredClone(golden.birthData)
  const runGate = async (report) => {
    const baseResult = await baseSteps.qualityGate(report, 'E3', 1, null, birthData)
    const candidateResult = await steps.qualityGate(report, 'E3', 1, null, birthData)
    assert.deepEqual(candidateResult, baseResult)
    return candidateResult
  }

  const valid = await runGate(makeQualityReport())
  assert.equal(valid.passed, true)
  assert.deepEqual(valid.hardFailures, [])

  const sevenCards = await runGate(makeQualityReport(7))
  assert.deepEqual(sevenCards.hardFailures, [
    '月度精選 JSON 區塊不足: 找到 7 個（期望 8 個吉時卡片）',
  ])

  const wrongTopicReport = makeQualityReport().replace(
    '主題：事業運（TOP 1）',
    '主題：貴人（TOP 1）',
  )
  const wrongTopic = await runGate(wrongTopicReport)
  assert.deepEqual(wrongTopic.hardFailures, [
    'E3 主題不對題：AI 卡片寫了客戶沒選的主題 [貴人]、客戶實選 [事業運、財運、家庭] — 必須重寫',
  ])

  const noQimenEvidenceReport = makeQualityReport()
    .replaceAll('天心', 'fixture-star')
    .replaceAll('開門', 'fixture-door')
    .replaceAll('九天', 'fixture-shen')
  const noQimenEvidence = await runGate(noQimenEvidenceReport)
  assert.deepEqual(noQimenEvidence.hardFailures, [
    'E3 主用神引用不足：全文命中 0 次（期望 ≥ 16 = 8 卡 × 每卡 2 次）— AI 需具名引用九星／八門／八神',
  ])
})
