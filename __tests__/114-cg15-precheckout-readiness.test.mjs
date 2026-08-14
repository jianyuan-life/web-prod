import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import {
  assertConsultationCalculatorReady,
} from '../lib/consultation/calculator-readiness.server.ts'
import {
  CALCULATOR_SYSTEM_EVIDENCE_CLASS,
  CALCULATOR_SYSTEM_MARKERS,
  EXPECTED_CALCULATOR_SYSTEMS,
} from '../lib/consultation/calculator-facts.ts'
import { attachSyntheticConsultationProvenance } from './fixtures/synthetic-consultation-provenance.mjs'

const secret = 'test-only-attestation-secret-32-bytes-minimum'
const releaseId = `calculator-bundle/v2|app=fortune-reports-api|digest=sha256:${'c'.repeat(64)}|git=${'d'.repeat(40)}|manifest=sha256:${'e'.repeat(64)}`
const codeSha256 = 'f'.repeat(64)
const keyId = 'primary'
const nowSeconds = 1_786_200_000

const validEnvironment = {
  NEXT_PUBLIC_API_URL: 'https://calculator.example.invalid/',
  CALCULATOR_BUNDLE_VERSION: releaseId,
  CALCULATOR_ATTESTATION_CODE_SHA256: codeSha256,
  CALCULATOR_ATTESTATION_KEY_ID: keyId,
  CALCULATOR_ATTESTATION_SECRET: secret,
  TELEMETRY_FINGERPRINT_SECRET: 'independent-telemetry-secret-material-32-bytes-minimum',
  TELEMETRY_FINGERPRINT_KEY_ID: 'telemetry-v1',
  CONSULTATION_SESSION_SECRET: 'independent-session-secret-material-32-bytes-minimum',
  REPORT_COOKIE_SECRET: 'independent-cookie-secret-material-32-bytes-minimum',
  CONSULTATION_V1_FRESH_REVIEW_SHA256: `sha256:${'a'.repeat(64)}`,
  CONSULTATION_V1_RENDERER_INPUT_BINDING_SHA256: `sha256:${'b'.repeat(64)}`,
}

const signingFields = [
  'version', 'algorithm', 'key_id', 'issued_at', 'nonce', 'method', 'path',
  'release_id', 'calculator_code_sha256', 'request_hash', 'response_hash',
  'status_code',
]

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function signAttestedResponse({
  requestBody,
  nonce,
  responseBody,
  status = 422,
  responseReleaseId = releaseId,
  responseCodeSha256 = codeSha256,
}) {
  const fields = {
    version: 'jianyuan.fly.response.v1',
    algorithm: 'HMAC-SHA256',
    key_id: keyId,
    issued_at: String(nowSeconds),
    nonce,
    method: 'POST',
    path: '/api/consultation/v1/calculate',
    release_id: responseReleaseId,
    calculator_code_sha256: responseCodeSha256,
    request_hash: sha256(requestBody),
    response_hash: sha256(responseBody),
    status_code: String(status),
  }
  const message = signingFields
    .map((name) => `${name}=${Buffer.byteLength(fields[name])}:${fields[name]}\n`)
    .join('')
  const signature = createHmac('sha256', secret).update(message).digest('hex')
  return new Response(responseBody, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'X-Jianyuan-Attestation-Version': fields.version,
      'X-Jianyuan-Attestation-Algorithm': fields.algorithm,
      'X-Jianyuan-Attestation-Key-Id': fields.key_id,
      'X-Jianyuan-Attestation-Issued-At': fields.issued_at,
      'X-Jianyuan-Attestation-Nonce': fields.nonce,
      'X-Jianyuan-Attestation-Method': fields.method,
      'X-Jianyuan-Attestation-Path': fields.path,
      'X-Jianyuan-Attestation-Release-Id': fields.release_id,
      'X-Jianyuan-Calculator-Code-SHA256': fields.calculator_code_sha256,
      'X-Jianyuan-Attestation-Request-SHA256': fields.request_hash,
      'X-Jianyuan-Attestation-Response-SHA256': fields.response_hash,
      'X-Jianyuan-Attestation-Status': fields.status_code,
      'X-Jianyuan-Attestation-Signature': signature,
    },
  })
}

function substantiveAnalysis(system, index) {
  return {
    system,
    status: 'success',
    detail: [
      `${CALCULATOR_SYSTEM_MARKERS[system].flatMap((term) => [`${term}來源`, `${term}盤面`, `${term}位置`, `${term}界線`, `${term}變化`]).join('、')}。`,
      `${system} 合成結果 ${index}；這是只用於 readiness 契約測試的實質排盤內容，包含盤面位置、計算步驟、固定年度、已知限制與可重新核對的欄位。`,
      '盤面依序保留天干地支、宮位星曜、五行強弱、生剋制化、年月日時、方向節奏、關係資源、壓力反應、學習工作、決策界線與行動觀察。',
      '每個欄位均可回到同一合成出生輸入與目標年份重播，差異處需列明適用條件、失效情境、資料缺口、校準方法及後續核對日期。',
      '本段不作保證、診斷或角色推定，只示範具備多種可區分資訊的版本化測試資料。',
      '核對時依序比較原始輸入、轉換規則、中間盤面、最終摘要、支持線索、反面訊號與年度邊界；任一環節不一致就停止引用。',
    ].join(''),
    good_points: [`可核對線索 ${index}`],
    improvements: [`後續核對方向 ${index}`],
    sub_summary: `${system} 合成摘要`,
    score: 60 + index,
  }
}

function readyResponseBody(requestBody, calculatorReleaseId = releaseId) {
  const requestPayload = JSON.parse(requestBody)
  const analyses = EXPECTED_CALCULATOR_SYSTEMS.map((system, index) =>
    CALCULATOR_SYSTEM_EVIDENCE_CLASS[system] === 'held'
      ? { system, status: 'held', reason: 'authority_unverified', detail: null, score: null }
      : substantiveAnalysis(system, index),
  )
  const envelope = attachSyntheticConsultationProvenance({
    calculatorBundleVersion: calculatorReleaseId,
    requestPayload,
    response: {
      normalized_input: structuredClone(requestPayload),
      analysis_context: {
        mode: 'consultation_v1',
        as_of: requestPayload.as_of,
        target_year: requestPayload.target_year,
        birth_timezone: requestPayload.timezone,
        reference_timezone: 'Asia/Hong_Kong',
      },
      client_data: {
        name: requestPayload.name,
        birth_date: '1990-06-15 10:30',
        gender: '男',
        bazi: '庚午 壬午 辛亥 癸巳',
        yongshen: '合成喜用木火線索',
        dayun: '合成大運資料包含起運歲數、十年區間與固定基準年。',
        five_elements: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
        five_elements_simple: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
      },
      analyses,
      successful_systems: analyses.filter(({ status }) => status === 'success').map(({ system }) => system),
      held_systems: ['九星氣學'],
      failed_systems: [],
      systems_count: 15,
      expected_systems_count: 15,
    },
  })
  return JSON.stringify(envelope.response)
}

test('C／G15 付款前只接受 fixed synthetic full calculation 的 signed exact-byte 200', async () => {
  let observedRequest
  const result = await assertConsultationCalculatorReady({
    environment: validEnvironment,
    timeoutMs: 100,
    nowSeconds,
    fetchImpl: async (url, init) => {
      observedRequest = { url: String(url), init }
      const headers = new Headers(init.headers)
      const nonce = headers.get('X-Jianyuan-Attestation-Nonce')
      assert.match(nonce, /^[A-Za-z0-9_-]{22,128}$/u)
      const responseBody = readyResponseBody(String(init.body))
      return signAttestedResponse({
        requestBody: String(init.body),
        nonce,
        responseBody,
        status: 200,
      })
    },
  })

  assert.equal(observedRequest.url, 'https://calculator.example.invalid/api/consultation/v1/calculate')
  assert.equal(observedRequest.init.method, 'POST')
  const requestPayload = JSON.parse(observedRequest.init.body)
  assert.equal(requestPayload.name, '虛構案例甲')
  assert.equal(requestPayload.as_of, '2026-08-09')
  assert.equal(requestPayload.target_year, 2026)
  assert.equal(requestPayload.time_unknown, false)
  assert.equal(JSON.stringify(requestPayload).includes('customer'), false)
  const headers = new Headers(observedRequest.init.headers)
  assert.equal(headers.get('content-type'), 'application/json')
  assert.equal(headers.get('X-Jianyuan-Request-Key-Id'), keyId)
  assert.match(headers.get('X-Jianyuan-Request-Signature'), /^[0-9a-f]{64}$/u)
  assert.equal(result.statusCode, 200)
  assert.equal(result.receipt.releaseId, releaseId)
  assert.equal(result.receipt.calculatorCodeSha256, codeSha256)
  assert.equal(result.receipt.keyId, keyId)
})

test('same release 並發 readiness 只發出一次合成請求', async () => {
  let fetchCalls = 0
  let releaseFetch
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve
  })
  const fetchImpl = async (_url, init) => {
    fetchCalls += 1
    await fetchGate
    const requestBody = String(init.body)
    const responseBody = readyResponseBody(requestBody)
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody,
      status: 200,
    })
  }

  const first = assertConsultationCalculatorReady({
    environment: validEnvironment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_000,
    nowSeconds,
  })
  const second = assertConsultationCalculatorReady({
    environment: validEnvironment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_000,
    nowSeconds,
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(fetchCalls, 1)
  releaseFetch()
  const [firstReceipt, secondReceipt] = await Promise.all([first, second])
  assert.deepEqual(secondReceipt, firstReceipt)
})

test('same release 成功 readiness 在 60 秒 TTL 內重用，到期後重新驗證', async () => {
  let fetchCalls = 0
  const environment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://ttl-cache.example.invalid',
  }
  const fetchImpl = async (_url, init) => {
    fetchCalls += 1
    const requestBody = String(init.body)
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody: readyResponseBody(requestBody),
      status: 200,
    })
  }

  await assertConsultationCalculatorReady({ environment, fetchImpl, cacheTtlMs: 60_000, cacheNowMs: 10_000, nowSeconds })
  await assertConsultationCalculatorReady({ environment, fetchImpl, cacheTtlMs: 60_000, cacheNowMs: 69_999, nowSeconds })
  assert.equal(fetchCalls, 1)
  await assertConsultationCalculatorReady({ environment, fetchImpl, cacheTtlMs: 60_000, cacheNowMs: 70_000, nowSeconds })
  assert.equal(fetchCalls, 2)
})

test('顯式 fetchImpl 預設不跨呼叫快取', async () => {
  let fetchCalls = 0
  const environment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://explicit-fetch.example.invalid',
  }
  const fetchImpl = async (_url, init) => {
    fetchCalls += 1
    const requestBody = String(init.body)
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody: readyResponseBody(requestBody),
      status: 200,
    })
  }

  await assertConsultationCalculatorReady({ environment, fetchImpl, nowSeconds })
  await assertConsultationCalculatorReady({ environment, fetchImpl, nowSeconds })
  assert.equal(fetchCalls, 2)
})

test('readiness 失敗不進成功快取，下次必須重試', async () => {
  let fetchCalls = 0
  const environment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://failure-retry.example.invalid',
  }
  const fetchImpl = async (_url, init) => {
    fetchCalls += 1
    const requestBody = String(init.body)
    const status = fetchCalls === 1 ? 500 : 200
    const responseBody = status === 200
      ? readyResponseBody(requestBody)
      : JSON.stringify({ detail: 'synthetic transient failure' })
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody,
      status,
    })
  }

  await assert.rejects(assertConsultationCalculatorReady({
    environment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_000,
    nowSeconds,
  }))
  const recovered = await assertConsultationCalculatorReady({
    environment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_001,
    nowSeconds,
  })
  assert.equal(fetchCalls, 2)
  assert.equal(recovered.statusCode, 200)
})

test('readiness 成功快取綁定 calculator release identity', async () => {
  const nextReleaseId = `calculator-bundle/v2|app=fortune-reports-api|digest=sha256:${'1'.repeat(64)}|git=${'2'.repeat(40)}|manifest=sha256:${'3'.repeat(64)}`
  let fetchCalls = 0
  const environment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://release-bound.example.invalid',
  }
  const fetchImpl = async (_url, init) => {
    fetchCalls += 1
    const responseReleaseId = fetchCalls === 1 ? releaseId : nextReleaseId
    const requestBody = String(init.body)
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody: readyResponseBody(requestBody, responseReleaseId),
      responseReleaseId,
      status: 200,
    })
  }

  await assertConsultationCalculatorReady({
    environment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_000,
    nowSeconds,
  })
  const nextRelease = await assertConsultationCalculatorReady({
    environment: { ...environment, CALCULATOR_BUNDLE_VERSION: nextReleaseId },
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_001,
    nowSeconds,
  })

  assert.equal(fetchCalls, 2)
  assert.equal(nextRelease.receipt.releaseId, nextReleaseId)
})

test('readiness 成功快取綁定 calculator API URL', async () => {
  let fetchCalls = 0
  const observedUrls = []
  const fetchImpl = async (url, init) => {
    fetchCalls += 1
    observedUrls.push(String(url))
    const requestBody = String(init.body)
    return signAttestedResponse({
      requestBody,
      nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      responseBody: readyResponseBody(requestBody),
      status: 200,
    })
  }
  const firstEnvironment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://calculator-primary.example.invalid',
  }
  const secondEnvironment = {
    ...validEnvironment,
    NEXT_PUBLIC_API_URL: 'https://calculator-secondary.example.invalid',
  }

  await assertConsultationCalculatorReady({
    environment: firstEnvironment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_000,
    nowSeconds,
  })
  await assertConsultationCalculatorReady({
    environment: secondEnvironment,
    fetchImpl,
    cacheTtlMs: 60_000,
    cacheNowMs: 10_001,
    nowSeconds,
  })

  assert.equal(fetchCalls, 2)
  assert.deepEqual(observedUrls, [
    'https://calculator-primary.example.invalid/api/consultation/v1/calculate',
    'https://calculator-secondary.example.invalid/api/consultation/v1/calculate',
  ])
})

test('runtime receipt 缺漏時在任何 Fly request 前 fail closed', async () => {
  let fetchCalls = 0
  await assert.rejects(
    assertConsultationCalculatorReady({
      environment: { ...validEnvironment, CALCULATOR_BUNDLE_VERSION: '' },
      fetchImpl: async () => {
        fetchCalls += 1
        throw new Error('must not fetch')
      },
    }),
    { name: 'ConsultationRuntimeConfigError' },
  )
  assert.equal(fetchCalls, 0)
})

test('8 秒上限涵蓋 response body，不能只限制收到 headers 的時間', async () => {
  const probe = assertConsultationCalculatorReady({
    environment: validEnvironment,
    timeoutMs: 10,
    fetchImpl: async () => ({
      status: 422,
      headers: new Headers(),
      arrayBuffer: () => new Promise(() => {}),
    }),
  })
  const outcome = await Promise.race([
    probe.then(() => 'resolved', () => 'rejected'),
    new Promise((resolve) => setTimeout(() => resolve('outer_timeout'), 80)),
  ])
  assert.equal(outcome, 'rejected', 'response body stall must be rejected by the readiness timeout')
})

test('signed 422、signed 500 或 incomplete 200 都不可放行付款', async () => {
  const validationBody = JSON.stringify({ detail: [{ type: 'missing', loc: ['body', 'name'] }] })
  const cases = [
    ({ requestBody, nonce }) => signAttestedResponse({
      requestBody,
      nonce,
      responseBody: validationBody,
      status: 422,
    }),
    ({ requestBody, nonce }) => signAttestedResponse({
      requestBody,
      nonce,
      responseBody: JSON.stringify({ detail: 'synthetic internal failure', code: 'calculator.partial_failure' }),
      status: 500,
    }),
    ({ requestBody, nonce }) => signAttestedResponse({
      requestBody,
      nonce,
      responseBody: JSON.stringify({ successful_systems: [], held_systems: [], failed_systems: [] }),
      status: 200,
    }),
  ]
  for (const makeResponse of cases) {
    await assert.rejects(assertConsultationCalculatorReady({
      environment: validEnvironment,
      timeoutMs: 100,
      nowSeconds,
      fetchImpl: async (_url, init) => makeResponse({
        requestBody: String(init.body),
        nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
      }),
    }))
  }
})

test('signed 200 的 ledger、coverage、registry 或 per-slot provenance 漂移仍 fail closed', async () => {
  const mutations = [
    (body) => { body.failed_systems = ['八字四柱'] },
    (body) => { body.coverage.successful_slots = 13 },
    (body) => { body.provenance_registry_sha256 = '0'.repeat(64) },
    (body) => { body.analyses[0].provenance.rule_id = 'JY-TAMPERED-RULE' },
    (body) => {
      const nineStar = body.analyses.find(({ system }) => system === '九星氣學')
      nineStar.reason = 'birth_time_unknown'
    },
  ]
  for (const mutate of mutations) {
    await assert.rejects(assertConsultationCalculatorReady({
      environment: validEnvironment,
      timeoutMs: 100,
      nowSeconds,
      fetchImpl: async (_url, init) => {
        const requestBody = String(init.body)
        const body = JSON.parse(readyResponseBody(requestBody))
        mutate(body)
        const responseBody = JSON.stringify(body)
        return signAttestedResponse({
          requestBody,
          nonce: new Headers(init.headers).get('X-Jianyuan-Attestation-Nonce'),
          responseBody,
          status: 200,
        })
      },
    }))
  }
})
