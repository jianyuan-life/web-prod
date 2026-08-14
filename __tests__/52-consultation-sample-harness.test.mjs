import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let samples
let cli
let teamPipeline
let loadError
try {
  samples = await import('../scripts/consultation-samples/index.mjs')
  cli = await import('../scripts/consultation-samples/cli.mjs')
  teamPipeline = await import('../scripts/test_team_pipeline.ts')
} catch (error) {
  loadError = error
}

const AUTH_ENVIRONMENT = Object.freeze({
  CALCULATOR_ATTESTATION_SECRET: 'test-only-legacy-caller-secret-material-32-bytes',
  CALCULATOR_ATTESTATION_KEY_ID: 'test-primary',
})

// Windows 用 py launcher 鎖 3.12；Linux/macOS runner 沒有 py，改走 python3。
const PYTHON_COMMAND = process.platform === 'win32' ? 'py' : 'python3'
const PYTHON_PREFIX_ARGS = process.platform === 'win32' ? ['-3.12'] : []

function expectedRequestSignature({ body, path, headers }) {
  const fields = {
    version: 'jianyuan.fly.request.v1',
    key_id: headers['X-Jianyuan-Request-Key-Id'],
    issued_at: headers['X-Jianyuan-Request-Issued-At'],
    nonce: headers['X-Jianyuan-Attestation-Nonce'],
    method: 'POST',
    path,
    request_hash: createHash('sha256').update(body, 'utf8').digest('hex'),
  }
  const framed = [
    'version', 'key_id', 'issued_at', 'nonce', 'method', 'path', 'request_hash',
  ].map((name) => {
    const value = fields[name]
    return `${name}=${Buffer.byteLength(value, 'utf8')}:${value}\n`
  }).join('')
  const requestKey = createHmac('sha256', AUTH_ENVIRONMENT.CALCULATOR_ATTESTATION_SECRET)
    .update('jianyuan.fly.request.v1')
    .digest()
  return createHmac('sha256', requestKey).update(framed, 'utf8').digest('hex')
}

test('dry-run 固定三位授權樣本與 2026-08-08 context，且不呼叫 Fly、不落地', async () => {
  assert.ok(samples, `sample harness 無法載入: ${loadError?.message || 'unknown error'}`)
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-dry-'))
  let fetchCount = 0
  try {
    const result = await samples.runSampleHarness({
      dryRun: true,
      outputRoot,
      requestedPlans: ['C', 'G15'],
      fetchImpl: async () => {
        fetchCount += 1
        throw new Error('dry-run 不應觸發網路')
      },
    })

    assert.equal(fetchCount, 0)
    assert.equal(result.asOfDate, '2026-08-08')
    assert.deepEqual(result.people.map(({ displayName, birth }) => [
      displayName,
      birth.year,
      birth.month,
      birth.day,
      birth.hour,
      birth.minute,
      birth.gender,
      birth.latitude,
      birth.longitude,
      birth.timezoneOffset,
    ]), [
      ['何宣逸', 1990, 10, 12, 20, 0, 'M', 23.69, 120.96, 8],
      ['何紀萳', 1994, 10, 4, 8, 0, 'F', 22.33, 114.19, 8],
      ['何宥諄', 2023, 5, 8, 10, 0, 'M', 22.33, 114.19, 8],
    ])
    assert.deepEqual(result.plannedArtifacts.map((artifact) => artifact.plan), ['C', 'C', 'C', 'G15'])
    assert.equal((await readdir(outputRoot)).length, 0)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('policy gate 拒絕 E3、repo 內輸出與任何 LLM 付費啟動參數', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-policy-'))
  try {
    await assert.rejects(
      () => samples.runSampleHarness({ dryRun: true, outputRoot, requestedPlans: ['E3'] }),
      /只允許 C\/G15/u,
    )
    await assert.rejects(
      () => samples.runSampleHarness({ dryRun: true, outputRoot, requestedPlans: ['C'] }),
      /必須同時建立 3 份 C 與 1 份 G15/u,
    )
    await assert.rejects(
      () => samples.runSampleHarness({
        dryRun: false,
        outputRoot: path.join(process.cwd(), 'private-sample-output'),
        repositoryRoot: process.cwd(),
      }),
      /不得位於 Git repository/u,
    )
    assert.throws(
      () => cli.parseCliArguments(['--run-llm']),
      /付費 LLM.*integration owner/u,
    )
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('execute 只讀 Fly 三次並輸出 request/response hash 綁定的 3C+1G15 replay bundles', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-run-'))
  const seenPayloads = []
  try {
    const result = await samples.runSampleHarness({
      dryRun: false,
      outputRoot,
      requestedPlans: ['C', 'G15'],
      environment: AUTH_ENVIRONMENT,
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://fortune-reports-api.fly.dev/api/calculate')
        assert.equal(init.method, 'POST')
        assert.equal(init.headers['Content-Type'], 'application/json')
        assert.equal(init.headers['X-Jianyuan-Request-Version'], 'jianyuan.fly.request.v1')
        assert.equal(init.headers['X-Jianyuan-Request-Key-Id'], 'test-primary')
        assert.match(init.headers['X-Jianyuan-Request-Issued-At'], /^\d+$/u)
        assert.match(init.headers['X-Jianyuan-Attestation-Nonce'], /^[A-Za-z0-9_-]{22,128}$/u)
        assert.equal(
          init.headers['X-Jianyuan-Request-Signature'],
          expectedRequestSignature({ body: init.body, path: '/api/calculate', headers: init.headers }),
        )
        const payload = JSON.parse(init.body)
        seenPayloads.push(payload)
        return new Response(JSON.stringify({
          systems_count: 15,
          client_data: { name: payload.name },
          analyses: Array.from({ length: 15 }, (_, index) => ({
            system: `system-${index + 1}`,
            summary: `${payload.name}-summary-${index + 1}`,
          })),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })

    assert.equal(seenPayloads.length, 3)
    assert.deepEqual(seenPayloads.map((payload) => [
      payload.name, payload.as_of, payload.target_year,
      payload.latitude, payload.longitude, payload.timezone_offset,
    ]), [
      ['何宣逸', '2026-08-08', 2026, 23.69, 120.96, 8],
      ['何紀萳', '2026-08-08', 2026, 22.33, 114.19, 8],
      ['何宥諄', '2026-08-08', 2026, 22.33, 114.19, 8],
    ])
    assert.equal(result.fetchCount, 3)
    assert.equal(result.reusedCount, 0)

    const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'))
    const manifestBytes = await readFile(path.join(outputRoot, 'manifest.json'))
    const manifestFileSha256 = `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`
    assert.equal(
      (await readFile(path.join(outputRoot, 'manifest.sha256'), 'utf8')).trim(),
      `${manifestFileSha256}  manifest.json`,
    )
    assert.equal(manifest.privacy, 'private-local-only')
    assert.equal(manifest.llmExecution.status, 'not-run')
    assert.equal(manifest.calculators.length, 3)
    assert.equal(manifest.reportArtifacts.length, 4)
    for (const item of manifest.calculators) {
      assert.match(item.requestSha256, /^sha256:[0-9a-f]{64}$/u)
      assert.match(item.responseSha256, /^sha256:[0-9a-f]{64}$/u)
    }
    for (const artifact of manifest.reportArtifacts) {
      assert.match(artifact.artifactSha256, /^sha256:[0-9a-f]{64}$/u)
      assert.equal(artifact.generationStatus, 'calculator-ready_llm-not-run')
    }
    assert.equal((await samples.verifyReplayDirectory(outputRoot)).valid, true)
    const replay = await samples.loadVerifiedReplayJobs(outputRoot)
    assert.equal(replay.jobs.length, 4)
    assert.equal(replay.calculators.size, 3)
    assert.equal(replay.jobs.find((job) => job.plan === 'G15').calculators.length, 3)
    assert.equal(replay.calculators.get('he-xuanyi').response.analyses.length, 15)
    assert.equal((await readFile(path.join(outputRoot, 'report-jobs', 'sample-g15-he-family.json'), 'utf8')).includes('E3'), false)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('Team Pipeline calculator caller signs the one JSON body it sends', async () => {
  assert.ok(teamPipeline, `Team Pipeline harness 無法載入: ${loadError?.message || 'unknown error'}`)
  const birthData = {
    name: '合成樣本',
    year: 1990,
    month: 10,
    day: 12,
    hour: 20,
    minute: 0,
    gender: 'M',
  }
  let fetchCount = 0
  await teamPipeline.callPythonPaipan(birthData, {
    apiUrl: 'https://fortune-reports-api.fly.dev',
    environment: AUTH_ENVIRONMENT,
    fetchImpl: async (url, init) => {
      fetchCount += 1
      assert.equal(url, 'https://fortune-reports-api.fly.dev/api/calculate')
      assert.equal(init.body, JSON.stringify(birthData))
      assert.equal(init.headers['X-Jianyuan-Request-Version'], 'jianyuan.fly.request.v1')
      assert.equal(init.headers['X-Jianyuan-Request-Key-Id'], 'test-primary')
      assert.equal(
        init.headers['X-Jianyuan-Request-Signature'],
        expectedRequestSignature({ body: init.body, path: '/api/calculate', headers: init.headers }),
      )
      return new Response(JSON.stringify({ synthetic: true }), { status: 200 })
    },
  })
  assert.equal(fetchCount, 1)
})

test('Python legacy caller signs the exact compact UTF-8 JSON bytes without printing its secret', () => {
  const payload = { name: '合成樣本', nested: { value: 7 }, flag: true }
  const secret = AUTH_ENVIRONMENT.CALCULATOR_ATTESTATION_SECRET
  const probe = [
    'import json, sys',
    "sys.path.insert(0, 'scripts')",
    'from calculator_request_auth import create_signed_calculator_post',
    `payload = json.loads(${JSON.stringify(JSON.stringify(payload))})`,
    "signed = create_signed_calculator_post('/api/generate-pdf', payload, nonce='abcdefghijklmnopqrstuv', issued_at=1786200000)",
    "print(json.dumps({'body': signed.body, 'headers': signed.headers}, ensure_ascii=False, separators=(',', ':'))) ",
  ].join('\n')
  const result = spawnSync(PYTHON_COMMAND, [...PYTHON_PREFIX_ARGS, '-c', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...AUTH_ENVIRONMENT,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false)
  const signed = JSON.parse(result.stdout)
  assert.equal(signed.body, JSON.stringify(payload))
  assert.equal(signed.headers['X-Jianyuan-Request-Key-Id'], 'test-primary')
  assert.equal(
    signed.headers['X-Jianyuan-Request-Signature'],
    expectedRequestSignature({
      body: signed.body,
      path: '/api/generate-pdf',
      headers: signed.headers,
    }),
  )
})

test('P0 PDF repair sends the signed Python body without requests re-serialization', () => {
  const secret = AUTH_ENVIRONMENT.CALCULATOR_ATTESTATION_SECRET
  const probe = [
    'import json, sys',
    "sys.path.insert(0, 'scripts')",
    'import batch_fix_p0_reports as batch',
    'captured = {}',
    'class FakeResponse:',
    '    ok = True',
    '    status_code = 200',
    '    text = ""',
    '    def json(self):',
    "        return {'pdf_base64': 'QQ==', 'file_size_kb': 1}",
    'def fake_post(url, **kwargs):',
    "    captured.update({'url': url, **kwargs})",
    '    return FakeResponse()',
    'batch.requests.post = fake_post',
    'batch.upload_pdf_to_storage = lambda report_id, pdf_bytes: None',
    "report = {'id': 'synthetic-report', 'plan_code': 'E1', 'client_name': '合成樣本', 'pdf_url': None, 'report_result': {'ai_content': '甲' * 240, 'analyses_summary': []}, 'birth_data': {'locale': 'zh-TW'}}",
    'batch.fix_missing_pdfs([report], True)',
    "body = captured.get('data')",
    "if isinstance(body, bytes): body = body.decode('utf-8')",
    "print('PROBE=' + json.dumps({'body': body, 'headers': captured.get('headers'), 'used_json': 'json' in captured}, ensure_ascii=False, separators=(',', ':')))",
  ].join('\n')
  const result = spawnSync(PYTHON_COMMAND, [...PYTHON_PREFIX_ARGS, '-c', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...AUTH_ENVIRONMENT,
      SUPABASE_URL: 'https://synthetic.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false)
  const probeLine = result.stdout.split(/\r?\n/u).find((line) => line.startsWith('PROBE='))
  assert.ok(probeLine, result.stdout)
  const signed = JSON.parse(probeLine.slice('PROBE='.length))
  assert.equal(signed.used_json, false)
  assert.equal(typeof signed.body, 'string')
  assert.equal(signed.headers['X-Jianyuan-Request-Key-Id'], 'test-primary')
  assert.equal(
    signed.headers['X-Jianyuan-Request-Signature'],
    expectedRequestSignature({
      body: signed.body,
      path: '/api/generate-pdf',
      headers: signed.headers,
    }),
  )
})

test('all three ops callers fail closed before transport and never expose a configured secret', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-auth-fail-'))
  const secret = AUTH_ENVIRONMENT.CALCULATOR_ATTESTATION_SECRET
  const incompleteEnvironment = {
    CALCULATOR_ATTESTATION_SECRET: secret,
    CALCULATOR_ATTESTATION_KEY_ID: '',
  }
  let sampleFetchCount = 0
  let teamFetchCount = 0
  try {
    await assert.rejects(
      () => samples.runSampleHarness({
        dryRun: false,
        outputRoot,
        environment: incompleteEnvironment,
        fetchImpl: async () => {
          sampleFetchCount += 1
          throw new Error('sample transport must not run')
        },
      }),
      (error) => !error.message.includes(secret) && /key.?id|key_id/iu.test(error.message),
    )
    await assert.rejects(
      () => teamPipeline.callPythonPaipan({
        name: '合成樣本', year: 1990, month: 10, day: 12,
        hour: 20, minute: 0, gender: 'M',
      }, {
        environment: incompleteEnvironment,
        fetchImpl: async () => {
          teamFetchCount += 1
          throw new Error('team transport must not run')
        },
      }),
      (error) => !error.message.includes(secret) && /key.?id|key_id/iu.test(error.message),
    )
    assert.equal(sampleFetchCount, 0)
    assert.equal(teamFetchCount, 0)

    const childEnvironment = {
      ...process.env,
      SUPABASE_URL: 'https://synthetic.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
      CALCULATOR_ATTESTATION_SECRET: secret,
      CALCULATOR_ATTESTATION_KEY_ID: '',
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    }
    const python = spawnSync(
      PYTHON_COMMAND,
      [...PYTHON_PREFIX_ARGS, 'scripts/batch_fix_p0_reports.py', '--apply', '--only', 'pdf'],
      { cwd: process.cwd(), encoding: 'utf8', env: childEnvironment },
    )
    assert.notEqual(python.status, 0)
    assert.match(`${python.stdout}${python.stderr}`, /key id is missing or invalid/iu)
    assert.equal(`${python.stdout}${python.stderr}`.includes(secret), false)
    assert.doesNotMatch(python.stdout, /撈取所有 completed 報告/u)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('resume 僅重用完整且 hash 一致的 replay；被竄改時 fail closed 而不重新打 Fly', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-resume-'))
  let fetchCount = 0
  const fakeFetch = async (_url, init) => {
    fetchCount += 1
    const payload = JSON.parse(init.body)
    return new Response(JSON.stringify({
      systems_count: 15,
      client_data: { name: payload.name },
      analyses: Array.from({ length: 15 }, (_, index) => ({ system: `s${index}`, summary: `${payload.name}-${index}` })),
    }), { status: 200 })
  }
  try {
    await samples.runSampleHarness({
      dryRun: false,
      outputRoot,
      fetchImpl: fakeFetch,
      environment: AUTH_ENVIRONMENT,
    })
    assert.equal(fetchCount, 3)

    const resumed = await samples.runSampleHarness({
      dryRun: false,
      resume: true,
      outputRoot,
      fetchImpl: async () => {
        throw new Error('完整 resume 不應呼叫 Fly')
      },
    })
    assert.equal(resumed.fetchCount, 0)
    assert.equal(resumed.reusedCount, 3)

    const target = path.join(outputRoot, 'calculators', 'he-xuanyi', 'response.json')
    const tampered = JSON.parse(await readFile(target, 'utf8'))
    tampered.response.analyses[0].summary = 'tampered'
    await writeFile(target, JSON.stringify(tampered, null, 2), 'utf8')

    await assert.rejects(
      () => samples.runSampleHarness({
        dryRun: false,
        resume: true,
        outputRoot,
        fetchImpl: async () => {
          throw new Error('hash 失配時也不可靜默重抓')
        },
      }),
      /resume 驗證失敗/u,
    )
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('中斷後 resume 會重用已完成的人物，只抓缺少的兩人並完成四個工作包', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-partial-'))
  let firstRunCalls = 0
  const responseFor = (payload) => new Response(JSON.stringify({
    systems_count: 15,
    client_data: { name: payload.name },
    analyses: Array.from({ length: 15 }, (_, index) => ({ system: `s${index}`, summary: `${payload.name}-${index}` })),
  }), { status: 200 })
  try {
    await assert.rejects(
      () => samples.runSampleHarness({
        dryRun: false,
        outputRoot,
        environment: AUTH_ENVIRONMENT,
        fetchImpl: async (_url, init) => {
          firstRunCalls += 1
          if (firstRunCalls === 2) throw new Error('synthetic interruption')
          return responseFor(JSON.parse(init.body))
        },
      }),
      /synthetic interruption/u,
    )
    assert.equal(firstRunCalls, 2)

    let resumeCalls = 0
    const resumed = await samples.runSampleHarness({
      dryRun: false,
      resume: true,
      outputRoot,
      environment: AUTH_ENVIRONMENT,
      fetchImpl: async (_url, init) => {
        resumeCalls += 1
        return responseFor(JSON.parse(init.body))
      },
    })
    assert.equal(resumeCalls, 2)
    assert.equal(resumed.fetchCount, 2)
    assert.equal(resumed.reusedCount, 1)
    assert.equal((await samples.verifyReplayDirectory(outputRoot)).valid, true)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test('Fly 即使回 15 列，只要系統重複或含失敗列也不得建立 replay', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jianyuan-sample-partial-failure-'))
  try {
    await assert.rejects(
      () => samples.runSampleHarness({
        dryRun: false,
        outputRoot,
        environment: AUTH_ENVIRONMENT,
        fetchImpl: async () => new Response(JSON.stringify({
          systems_count: 15,
          client_data: { synthetic: true },
          analyses: Array.from({ length: 15 }, (_, index) => ({
            system: index === 14 ? 'system-13' : `system-${index}`,
            status: index === 14 ? 'failed' : 'complete',
          })),
        }), { status: 200 }),
      }),
      /15 個不重複系統|partial failure/u,
    )
    assert.equal((await readdir(outputRoot)).length, 0)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})
