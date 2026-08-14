import { makeConsultationPdfReport } from './fixtures/consultation-pdf/make-report.mjs'

let responseModule
let loadError
try {
  responseModule = await import('../lib/consultation/pdf/response.ts')
} catch (error) {
  loadError = error
}

let passed = 0
let failed = 0

function assert(condition, message = '斷言失敗') {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `期望 ${JSON.stringify(expected)}，得到 ${JSON.stringify(actual)}`)
  }
}

async function test(name, run) {
  try {
    await run()
    passed += 1
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('\n--- C／G15 consultation PDF 下載回應 ---')

await test('只有 structured C／G15 會進入 renderer 並回傳私密 PDF', async () => {
  assert(responseModule, `PDF response 無法載入: ${loadError?.message || 'unknown error'}`)
  const { report } = makeConsultationPdfReport('G15')
  let renderCount = 0
  const response = await responseModule.createConsultationPdfResponse('safe-token', {
    load: async () => ({ ok: true, mode: 'structured', plan: 'G15', report }),
    render: async (input) => {
      renderCount += 1
      assert(/^G15-[A-F0-9]{10}$/u.test(input.reportNumber))
      assert(!input.reportNumber.includes(report.reportId))
      assertEqual(input.plan, report.plan)
      return Buffer.from('%PDF-1.7\nsynthetic')
    },
  })

  assertEqual(response.status, 200)
  assertEqual(renderCount, 1)
  assertEqual(response.headers.get('content-type'), 'application/pdf')
  assert(/private/iu.test(response.headers.get('cache-control') || ''))
  assert(/noindex/iu.test(response.headers.get('x-robots-tag') || ''))
  assert(/attachment/iu.test(response.headers.get('content-disposition') || ''))
  const body = Buffer.from(await response.arrayBuffer()).toString('ascii')
  assert(body.startsWith('%PDF-1.7'))
})

await test('沒有 PDF 的 legacy、invalid contract、找不到與 DB 失敗都 fail closed，且不呼叫 renderer', async () => {
  const candidates = [
    {
      loadResult: {
        ok: true,
        mode: 'legacy_full_text',
        plan: 'C',
        content: '舊版文字',
        fullCharts: null,
        narrativeSummary: null,
        provenance: { source: 'paid_reports', contentField: 'report_result.ai_content' },
        asOf: { status: 'unknown', value: null },
        pdfUrl: null,
      },
      status: 409,
    },
    { loadResult: { ok: false, code: 'invalid_contract' }, status: 409 },
    { loadResult: { ok: false, code: 'not_found' }, status: 404 },
    { loadResult: { ok: false, code: 'database_error' }, status: 503 },
  ]

  for (const candidate of candidates) {
    let renderCount = 0
    const response = await responseModule.createConsultationPdfResponse('safe-token', {
      load: async () => candidate.loadResult,
      render: async () => {
        renderCount += 1
        return Buffer.from('should-not-render')
      },
    })
    assertEqual(response.status, candidate.status)
    assertEqual(renderCount, 0)
    assert(/no-store/iu.test(response.headers.get('cache-control') || ''))
    assert(/noindex/iu.test(response.headers.get('x-robots-tag') || ''))
  }
})

await test('legacy C/G15 只經已驗證 token 的私有串流，不回傳儲存 URL', async () => {
  let downloadedToken = ''
  let renderCount = 0
  const response = await responseModule.createConsultationPdfResponse('safe-legacy-token', {
    load: async () => ({
      ok: true,
      mode: 'legacy_full_text',
      plan: 'C',
      content: 'legacy report',
      fullCharts: null,
      narrativeSummary: null,
      pdfUrl: 'https://storage.example.test/public/reports/id/report.pdf',
      provenance: { source: 'paid_reports', contentField: 'report_result.ai_content' },
      asOf: { status: 'unknown', value: null },
    }),
    downloadLegacy: async (token) => {
      downloadedToken = token
      return new Response('%PDF-1.7\nlegacy', {
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'private, no-store',
        },
      })
    },
    render: async () => {
      renderCount += 1
      return Buffer.from('must not render')
    },
  })
  assertEqual(response.status, 200)
  assertEqual(downloadedToken, 'safe-legacy-token')
  assertEqual(renderCount, 0)
  assertEqual(response.headers.get('location'), null)
})

await test('renderer 例外不暴露 token、內部路徑或原始錯誤', async () => {
  const { report } = makeConsultationPdfReport('C')
  const token = 'private-token-should-never-escape'
  const response = await responseModule.createConsultationPdfResponse(token, {
    load: async () => ({ ok: true, mode: 'structured', plan: 'C', report }),
    render: async () => {
      throw new Error(`C:\\secret\\font.ttf ${token}`)
    },
  })
  const body = await response.text()
  assertEqual(response.status, 503)
  assert(!body.includes(token))
  assert(!body.includes('font.ttf'))
  assert(/no-store/iu.test(response.headers.get('cache-control') || ''))
})

await test('loader 未預期拋錯仍回傳私密 503，且不暴露 token 或資料庫細節', async () => {
  const token = 'private-loader-token'
  const response = await responseModule.createConsultationPdfResponse(token, {
    load: async () => {
      throw new Error(`database connection failed for ${token}`)
    },
  })
  const body = await response.text()
  assertEqual(response.status, 503)
  assert(!body.includes(token))
  assert(!body.includes('database'))
  assert(/no-store/iu.test(response.headers.get('cache-control') || ''))
  assert(/noindex/iu.test(response.headers.get('x-robots-tag') || ''))
})

console.log(JSON.stringify({ suite: 'C／G15 consultation PDF 下載回應', passed, failed, skipped: 0 }))
if (failed > 0) process.exitCode = 1
