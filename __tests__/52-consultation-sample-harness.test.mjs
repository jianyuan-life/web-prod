import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let samples
let cli
let loadError
try {
  samples = await import('../scripts/consultation-samples/index.mjs')
  cli = await import('../scripts/consultation-samples/cli.mjs')
} catch (error) {
  loadError = error
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
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://fortune-reports-api.fly.dev/api/calculate')
        assert.equal(init.method, 'POST')
        assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })
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
    await samples.runSampleHarness({ dryRun: false, outputRoot, fetchImpl: fakeFetch })
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
