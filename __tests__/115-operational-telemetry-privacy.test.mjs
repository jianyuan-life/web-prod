import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('checkout never returns or logs raw provider errors', () => {
  const source = read('app/api/checkout/route.ts')
  assert.doesNotMatch(source, /JSON\.stringify\(data\)/u)
  assert.doesNotMatch(source, /data\.error\?\.message/u)
  assert.doesNotMatch(source, /stripe_error:\s*data\.error/u)
  assert.doesNotMatch(source, /err instanceof Error \? err\.message/u)
  assert.match(source, /CHECKOUT_PROVIDER_ERROR/u)
  assert.match(source, /CHECKOUT_INTERNAL_ERROR/u)
  assert.match(source, /operationalErrorClass/u)
})

test('webhook telemetry excludes customer email, full Stripe IDs and raw exceptions', () => {
  const source = read('app/api/webhook/stripe/route.ts')
  assert.doesNotMatch(source, /extra:\s*\{\s*customerEmail/u)
  assert.doesNotMatch(source, /metadata:\s*\{\s*email:\s*customerEmail/u)
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*customerEmail/u)
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*session\.id/u)
  assert.doesNotMatch(source, /captureException\(err/u)
  assert.doesNotMatch(source, /Stripe session \$\{session\.id/u)
  assert.match(source, /operationalFingerprint/u)
})

test('workflow logs and Telegram alerts exclude message content and email addresses', () => {
  const steps = read('workflows/generate-report/steps.ts')
  const telegram = read('lib/ai/observability/telegram.ts')
  assert.doesNotMatch(steps, /customerText\.substring/u)
  assert.doesNotMatch(steps, /Email 已寄送至 \$\{customerEmail\}/u)
  assert.doesNotMatch(steps, /客戶致歉信已寄至 \$\{customerEmailFailed\}/u)
  assert.doesNotMatch(telegram, /<b>收件人：<\/b>\$\{esc\(toEmail\)\}/u)
  assert.doesNotMatch(telegram, /<b>失敗原因：<\/b>\$\{esc\(reason\)/u)
  assert.match(telegram, /operationalFingerprint/u)
})

test('operational helpers escape email text, strip subject controls and emit bounded fingerprints', async () => {
  const helpers = await import('../lib/security/operational-telemetry.ts')
  const hashing = await import('../lib/consultation/sha256.ts')
  assert.equal(
    helpers.escapeHtmlText(`</p><a href="https://example.invalid">'&`),
    '&lt;/p&gt;&lt;a href=&quot;https://example.invalid&quot;&gt;&#39;&amp;',
  )
  assert.equal(
    helpers.sanitizeEmailSubject('Hello\r\nBcc: victim@example.invalid\u0000'),
    'Hello Bcc: victim@example.invalid',
  )
  const value = 'private@example.invalid'
  const keyA = { TELEMETRY_FINGERPRINT_SECRET: 'a'.repeat(32), TELEMETRY_FINGERPRINT_KEY_ID: 'k1' }
  const keyB = { TELEMETRY_FINGERPRINT_SECRET: 'b'.repeat(32), TELEMETRY_FINGERPRINT_KEY_ID: 'k2' }
  assert.equal(helpers.operationalFingerprint(value, {}), 'unavailable')
  assert.equal(helpers.operationalFingerprint(value, { TELEMETRY_FINGERPRINT_SECRET: 'too-short' }), 'unavailable')
  assert.match(helpers.operationalFingerprint(value, keyA), /^k1:[0-9a-f]{32}$/u)
  assert.equal(helpers.operationalFingerprint(value, keyA), helpers.operationalFingerprint(value, keyA))
  assert.notEqual(helpers.operationalFingerprint(value, keyA), helpers.operationalFingerprint(value, keyB))
  assert.equal(helpers.operationalErrorClass(new TypeError('private message')), 'TypeError')
  const customError = new Error('private message')
  customError.name = 'sk_live_sensitive_token'
  assert.equal(helpers.operationalErrorClass(customError), 'ExternalError')
  assert.equal(helpers.operationalErrorClass('sk_live_sensitive_token'), 'UnknownError')
  assert.equal(
    helpers.operationalFailureCode('LOAD_REPORT_RECORD_FAILED:TypeError'),
    'LOAD_REPORT_RECORD_FAILED',
  )
  assert.equal(
    helpers.operationalFailureCode('LOAD_REPORT_RECORD_FAILED:sk_live_sensitive_token'),
    'LOAD_REPORT_RECORD_FAILED',
  )
  assert.equal(helpers.operationalFailureCode('PDF_GENERATION_FAILED'), 'PDF_GENERATION_FAILED')
  assert.equal(helpers.operationalFailureCode('sk_live_sensitive_token:TypeError'), 'UnknownError')
  assert.equal(helpers.operationalFailureCode('UNLISTED_STAGE:TypeError'), 'UnknownError')
  assert.equal(
    hashing.hmacSha256HexSync('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  )
})

test('Telegram operational alerts never transmit raw identifiers, email or error text', async () => {
  const previousFetch = globalThis.fetch
  const previousToken = process.env.TELEGRAM_BOT_TOKEN
  const previousChatId = process.env.TELEGRAM_CHAT_ID
  const previousFingerprintSecret = process.env.TELEMETRY_FINGERPRINT_SECRET
  const previousFingerprintKeyId = process.env.TELEMETRY_FINGERPRINT_KEY_ID
  const payloads = []
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  process.env.TELEGRAM_CHAT_ID = 'test-chat'
  process.env.TELEMETRY_FINGERPRINT_SECRET = 't'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'test'
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body || '{}')))
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  try {
    const telegram = await import(`../lib/ai/observability/telegram.ts?privacy=${Date.now()}`)
    const helpers = await import('../lib/security/operational-telemetry.ts')
    const reportId = 'report-private-123'
    const email = 'private-person@example.invalid'
    const privateName = 'Private Customer Name'
    const privateReason = 'born 1990-01-02 at 03:04 in Private City'
    const privateBody = `${email}; ${privateReason}`
    const privateLabel = 'sk_live_sensitive_token'

    await telegram.notifyEmailFailed(reportId, email, privateReason)
    await telegram.notify(privateLabel, privateBody)
    await telegram.notifyFailed(reportId, privateReason)
    await telegram.notifyStripeFailed('cs_private_123', privateReason, 89)
    await telegram.notifyReportStuck(reportId, 25, privateName)
    await telegram.notifyModelDowngrade(reportId, privateLabel, privateLabel, privateLabel, privateReason)
    await telegram.notifyLowRating(reportId, 1, privateBody)
    await telegram.notifyWorkflowFailed(reportId, privateReason, privateLabel)
    await telegram.notifyFiveLLMWarning(reportId, privateLabel, 80, 70, { [privateLabel]: 80 }, [privateBody])
    await telegram.notifyFiveLLMCritical(reportId, privateLabel, 70, 60, { [privateLabel]: 70 }, [privateBody])
    await telegram.notifyNeedsHumanReview(reportId, privateLabel, 3, 70, [privateBody])
    await telegram.notifyAICostSingleCallExpensive(privateLabel, 6, reportId, privateLabel)
    await telegram.notifyLLMBalanceLow(privateLabel, 2, privateLabel)
    await telegram.notifyLLMBalanceCritical(privateLabel, 1, privateLabel)
    await telegram.notifyDaily({
      date: '2026-08-14',
      totalReports: 1,
      successReports: 0,
      failedReports: 1,
      totalCostUsd: 1,
      topPlans: [{ plan: privateLabel, count: 1 }],
      notes: privateBody,
    })

    const transmitted = payloads.map(payload => String(payload.text || '')).join('\n')
    assert.doesNotMatch(transmitted, new RegExp(reportId, 'u'))
    assert.doesNotMatch(transmitted, new RegExp(email, 'u'))
    assert.doesNotMatch(transmitted, /1990-01-02|03:04|Private City/u)
    assert.doesNotMatch(transmitted, new RegExp(privateName, 'u'))
    assert.doesNotMatch(transmitted, /cs_private_123/u)
    assert.doesNotMatch(transmitted, new RegExp(privateLabel, 'u'))
    assert.match(transmitted, new RegExp(helpers.operationalFingerprint(reportId), 'u'))
    assert.match(transmitted, new RegExp(helpers.operationalFingerprint(email), 'u'))
    assert.match(transmitted, new RegExp(helpers.operationalFingerprint(privateBody), 'u'))
  } finally {
    globalThis.fetch = previousFetch
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = previousToken
    if (previousChatId === undefined) delete process.env.TELEGRAM_CHAT_ID
    else process.env.TELEGRAM_CHAT_ID = previousChatId
    if (previousFingerprintSecret === undefined) delete process.env.TELEMETRY_FINGERPRINT_SECRET
    else process.env.TELEMETRY_FINGERPRINT_SECRET = previousFingerprintSecret
    if (previousFingerprintKeyId === undefined) delete process.env.TELEMETRY_FINGERPRINT_KEY_ID
    else process.env.TELEMETRY_FINGERPRINT_KEY_ID = previousFingerprintKeyId
  }
})

test('Sentry transport strips raw customer content from exception and context payloads', async () => {
  const previousFetch = globalThis.fetch
  const previousDsn = process.env.SENTRY_DSN
  const previousFingerprintSecret = process.env.TELEMETRY_FINGERPRINT_SECRET
  const previousFingerprintKeyId = process.env.TELEMETRY_FINGERPRINT_KEY_ID
  const payloads = []
  process.env.SENTRY_DSN = 'https://public-key@sentry.example.invalid/123'
  process.env.TELEMETRY_FINGERPRINT_SECRET = 's'.repeat(32)
  process.env.TELEMETRY_FINGERPRINT_KEY_ID = 'sentry-test'
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body || '{}')))
    return new Response('', { status: 200 })
  }

  try {
    const sentry = await import(`../lib/ai/observability/sentry-prod.ts?privacy=${Date.now()}`)
    const privateEmail = 'sentry-private@example.invalid'
    const privateSession = 'cs_private_sentry_123'
    const privateMessage = `born 1990-01-02 in Private City; ${privateEmail}`
    await sentry.captureException(new TypeError(privateMessage), {
      tags: { source: 'privacy-test', session: privateSession },
      extra: {
        customerEmail: privateEmail,
        rawMessage: privateMessage,
        detail: 'Private Customer Name',
        locations: ['Private City', '1990-01-02'],
        phone: '555-1234',
        'private-key@example.invalid': true,
        amount: 89,
      },
      user: { id: privateSession, email: privateEmail },
      request: { url: `https://jianyuan.life/report/private-token?email=${privateEmail}`, method: 'POST' },
      environment: 'Private Customer Environment',
      release: 'a'.repeat(40),
    })
    await sentry.captureMessage(privateMessage, 'error', {
      extra: { privateSession },
    })

    const transmitted = JSON.stringify(payloads)
    assert.doesNotMatch(transmitted, /sentry-private@example\.invalid|cs_private_sentry_123/u)
    assert.doesNotMatch(transmitted, /1990-01-02|Private City|Private Customer Name|555-1234|private-token/u)
    assert.doesNotMatch(transmitted, /private-key@example\.invalid|Private Customer Environment|Private Customer Release/u)
    assert.doesNotMatch(transmitted, /a{40}/u)
    assert.match(transmitted, /TypeError/u)
    assert.match(transmitted, /89/u)
    const helpers = await import('../lib/security/operational-telemetry.ts')
    assert.match(transmitted, new RegExp(helpers.operationalFingerprint(privateSession), 'u'))
    assert.doesNotMatch(transmitted, /unavailable/u)
  } finally {
    globalThis.fetch = previousFetch
    if (previousDsn === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = previousDsn
    if (previousFingerprintSecret === undefined) delete process.env.TELEMETRY_FINGERPRINT_SECRET
    else process.env.TELEMETRY_FINGERPRINT_SECRET = previousFingerprintSecret
    if (previousFingerprintKeyId === undefined) delete process.env.TELEMETRY_FINGERPRINT_KEY_ID
    else process.env.TELEMETRY_FINGERPRINT_KEY_ID = previousFingerprintKeyId
  }
})

test('privacy policy names operational error and alert processors without claiming raw PII is sent', () => {
  const source = read('app/privacy/page.tsx')
  assert.match(source, /Sentry/u)
  assert.match(source, /Telegram/u)
  assert.match(source, /不傳送完整出生資料、問題內容或 Email/u)
})
