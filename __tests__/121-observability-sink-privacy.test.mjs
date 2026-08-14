import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const dataModule = source => `data:text/javascript,${encodeURIComponent(source)}`

globalThis.__langfusePrivacyPayloads = []

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'langfuse') {
      return {
        url: dataModule(`
          const record = (kind, payload) => globalThis.__langfusePrivacyPayloads.push({ kind, payload })
          export class Langfuse {
            constructor(config) {
              record('client', { baseUrl: config.baseUrl })
            }
            trace(payload) {
              record('trace', payload)
              return {
                id: 'synthetic-trace-id',
                generation(generationPayload) {
                  record('generation', generationPayload)
                  return { end: endPayload => record('generation.end', endPayload) }
                },
                update(updatePayload) { record('trace.update', updatePayload) },
              }
            }
            async flushAsync() { record('flush', { called: true }) }
          }
        `),
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

test('Langfuse receives operational metrics and fingerprints, never raw LLM or customer content', async () => {
  const previousEnv = {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_HOST: process.env.LANGFUSE_HOST,
    TELEMETRY_FINGERPRINT_SECRET: process.env.TELEMETRY_FINGERPRINT_SECRET,
    TELEMETRY_FINGERPRINT_KEY_ID: process.env.TELEMETRY_FINGERPRINT_KEY_ID,
  }
  const originalLog = console.log
  const originalWarn = console.warn
  const consolePayloads = []
  console.log = (...args) => consolePayloads.push(args)
  console.warn = (...args) => consolePayloads.push(args)
  process.env.LANGFUSE_PUBLIC_KEY = 'synthetic-public-key'
  process.env.LANGFUSE_SECRET_KEY = 'synthetic-secret-key'
  process.env.LANGFUSE_HOST = 'https://langfuse.example.invalid'
  process.env.TELEMETRY_FINGERPRINT_SECRET = 'l'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'lf-test'

  try {
    const langfuse = await import(`../lib/ai/observability/langfuse.ts?privacy=${Date.now()}`)
    const telemetry = await import('../lib/security/operational-telemetry.ts')
    const privateName = 'private-customer-name@example.invalid'
    const privateModel = 'private-model-sk_live_sensitive'
    const privateUserId = 'user_private_123'
    const privateSessionId = 'report_private_456'
    const privateTag = 'born-in-private-city-1990-01-02'
    const privateInput = 'Prompt: birth 1990-01-02 03:04 Private City'
    const privateOutput = 'Reading for Private Customer: deeply private conclusion'
    const privateMetadata = 'metadata-private-email@example.invalid'
    const privateError = 'provider response: sk_live_private_error'
    const meta = {
      name: privateName,
      model: privateModel,
      userId: privateUserId,
      sessionId: privateSessionId,
      tags: [privateTag],
      metadata: { privateMetadata, nested: { privateInput } },
    }

    const returned = await langfuse.traceLLMCall(
      meta,
      { input: { prompt: privateInput } },
      async () => ({
        output: { content: privateOutput },
        usage: { promptTokens: 123, completionTokens: 45, totalTokens: 168, costUsd: 1.25 },
      }),
    )
    assert.deepEqual(returned, { content: privateOutput })

    const handle = await langfuse.createTrace(meta)
    await langfuse.endTrace(handle, {
      output: privateOutput,
      usage: { promptTokens: 10, completionTokens: 20 },
      error: new TypeError(privateError),
    })

    await assert.rejects(
      () => langfuse.traceLLMCall(meta, { input: privateInput }, async () => {
        throw new TypeError(privateError)
      }),
      new RegExp(privateError, 'u'),
    )

    const transmitted = JSON.stringify(globalThis.__langfusePrivacyPayloads)
    const consoleText = JSON.stringify(consolePayloads)
    for (const privateValue of [
      privateName,
      privateModel,
      privateUserId,
      privateSessionId,
      privateTag,
      privateInput,
      privateOutput,
      privateMetadata,
      privateError,
    ]) {
      assert.doesNotMatch(transmitted, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
      assert.doesNotMatch(consoleText, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    }

    assert.match(transmitted, new RegExp(telemetry.operationalFingerprint(privateName), 'u'))
    assert.match(transmitted, new RegExp(telemetry.operationalFingerprint(privateUserId), 'u'))
    assert.match(transmitted, /"promptTokens":123/u)
    assert.match(transmitted, /"completionTokens":45/u)
    assert.match(transmitted, /"latencyMs":\d+/u)
    assert.match(transmitted, /TypeError/u)
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    globalThis.__langfusePrivacyPayloads.length = 0
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Langfuse omits unknown labels and customer identifiers when fingerprinting is unavailable', async () => {
  const previousEnv = {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    TELEMETRY_FINGERPRINT_SECRET: process.env.TELEMETRY_FINGERPRINT_SECRET,
    TELEMETRY_FINGERPRINT_KEY_ID: process.env.TELEMETRY_FINGERPRINT_KEY_ID,
  }
  process.env.LANGFUSE_PUBLIC_KEY = 'synthetic-public-key'
  process.env.LANGFUSE_SECRET_KEY = 'synthetic-secret-key'
  delete process.env.TELEMETRY_FINGERPRINT_SECRET
  delete process.env.TELEMETRY_FINGERPRINT_KEY_ID
  globalThis.__langfusePrivacyPayloads.length = 0

  try {
    const langfuse = await import(`../lib/ai/observability/langfuse.ts?no-fingerprint=${Date.now()}`)
    await langfuse.traceLLMCall(
      {
        name: 'private-name-without-key',
        model: 'private-model-without-key',
        userId: 'private-user-without-key',
        sessionId: 'private-session-without-key',
        tags: ['private-tag-without-key'],
        metadata: { private: 'private-metadata-without-key' },
      },
      { input: 'private-input-without-key' },
      async () => ({ output: 'private-output-without-key', usage: { totalTokens: 3 } }),
    )

    const transmitted = JSON.stringify(globalThis.__langfusePrivacyPayloads)
    assert.doesNotMatch(transmitted, /private-(?:name|model|user|session|tag|metadata|input|output)-without-key/u)
    assert.doesNotMatch(transmitted, /fingerprint:unavailable/u)
    assert.doesNotMatch(transmitted, /"userId"|"sessionId"|"tags"/u)
    assert.match(transmitted, /"totalTokens":3/u)
  } finally {
    globalThis.__langfusePrivacyPayloads.length = 0
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Langfuse console fallback excludes raw content while preserving safe metrics', async () => {
  const previousPublicKey = process.env.LANGFUSE_PUBLIC_KEY
  const previousSecretKey = process.env.LANGFUSE_SECRET_KEY
  const previousFingerprintSecret = process.env.TELEMETRY_FINGERPRINT_SECRET
  const previousFingerprintKeyId = process.env.TELEMETRY_FINGERPRINT_KEY_ID
  const originalLog = console.log
  const originalWarn = console.warn
  const consolePayloads = []
  const privateName = 'fallback-private-name@example.invalid'
  const privateModel = 'fallback-private-model'
  const privateUser = 'fallback-private-user'
  const privateSession = 'fallback-private-session'
  const privateInput = 'fallback private birth input 1990-01-02'
  const privateOutput = 'fallback private fortune output'
  const privateError = 'fallback provider body sk_live_private'

  delete process.env.LANGFUSE_PUBLIC_KEY
  delete process.env.LANGFUSE_SECRET_KEY
  process.env.TELEMETRY_FINGERPRINT_SECRET = 'f'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'fallback'
  console.log = (...args) => consolePayloads.push(args.map(String).join(' '))
  console.warn = (...args) => consolePayloads.push(args.map(String).join(' '))

  try {
    const langfuse = await import(`../lib/ai/observability/langfuse.ts?fallback=${Date.now()}`)
    const meta = {
      name: privateName,
      model: privateModel,
      userId: privateUser,
      sessionId: privateSession,
      metadata: { privateInput },
    }
    assert.equal(
      await langfuse.traceLLMCall(meta, { input: privateInput }, async () => ({
        output: privateOutput,
        usage: { promptTokens: 7, completionTokens: 11 },
      })),
      privateOutput,
    )
    await assert.rejects(
      () => langfuse.traceLLMCall(meta, { input: privateInput }, async () => {
        throw new TypeError(privateError)
      }),
      new RegExp(privateError, 'u'),
    )

    const consoleText = consolePayloads.join('\n')
    for (const privateValue of [privateName, privateModel, privateUser, privateSession, privateInput, privateOutput, privateError]) {
      assert.doesNotMatch(consoleText, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    }
    assert.match(consoleText, /"promptTokens":7/u)
    assert.match(consoleText, /"completionTokens":11/u)
    assert.match(consoleText, /"errorClass":"TypeError"/u)
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    if (previousPublicKey === undefined) delete process.env.LANGFUSE_PUBLIC_KEY
    else process.env.LANGFUSE_PUBLIC_KEY = previousPublicKey
    if (previousSecretKey === undefined) delete process.env.LANGFUSE_SECRET_KEY
    else process.env.LANGFUSE_SECRET_KEY = previousSecretKey
    if (previousFingerprintSecret === undefined) delete process.env.TELEMETRY_FINGERPRINT_SECRET
    else process.env.TELEMETRY_FINGERPRINT_SECRET = previousFingerprintSecret
    if (previousFingerprintKeyId === undefined) delete process.env.TELEMETRY_FINGERPRINT_KEY_ID
    else process.env.TELEMETRY_FINGERPRINT_KEY_ID = previousFingerprintKeyId
  }
})

test('Upstash failures expose only command, status, and error class in console', async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalWarn = console.warn
  const consolePayloads = []
  let requestCount = 0
  const privateResponse = 'provider body: private-birth-1990-01-02@example.invalid'
  const privateException = 'network failure carried sk_live_private_token'
  const privateKey = 'cache:private-customer@example.invalid'
  const privateValue = 'private-reading-content'

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.invalid'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'synthetic-upstash-token'
  console.warn = (...args) => {
    consolePayloads.push(args.map((value) => {
      if (value instanceof Error) return `${value.name}:${value.message}:${value.stack ?? ''}`
      return String(value)
    }).join(' '))
  }
  globalThis.fetch = async () => {
    requestCount += 1
    if (requestCount === 1) return new Response(privateResponse, { status: 502 })
    throw new TypeError(privateException)
  }

  try {
    const upstash = await import(`../lib/ai/observability/upstash.ts?privacy=${Date.now()}`)
    assert.equal(await upstash.getCache(privateKey), null)
    assert.equal(await upstash.setCache(privateKey, privateValue, 60), false)

    const consoleText = consolePayloads.join('\n')
    assert.doesNotMatch(consoleText, /private-birth-1990-01-02@example\.invalid/u)
    assert.doesNotMatch(consoleText, /sk_live_private_token/u)
    assert.doesNotMatch(consoleText, /private-customer@example\.invalid/u)
    assert.doesNotMatch(consoleText, /private-reading-content/u)
    assert.match(consoleText, /GET 502/u)
    assert.match(consoleText, /SET TypeError/u)
  } finally {
    console.warn = originalWarn
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken
  }
})

test('Upstash privacy logging does not change successful cache values', async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const privateValue = {
    report: 'business-cache-value-must-remain-byte-equivalent',
    systems: ['bazi', 'ziwei'],
    score: 88,
  }
  const requestBodies = []
  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.invalid'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'synthetic-upstash-token'
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/GET/')) {
      return new Response(JSON.stringify({ result: JSON.stringify(privateValue) }), { status: 200 })
    }
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
  }

  try {
    const upstash = await import(`../lib/ai/observability/upstash.ts?values=${Date.now()}`)
    assert.deepEqual(await upstash.getCache('cache-value-regression'), privateValue)
    assert.equal(await upstash.setCache('cache-value-regression', privateValue, 60), true)
    assert.deepEqual(requestBodies, [JSON.stringify(privateValue)])
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken
  }
})
