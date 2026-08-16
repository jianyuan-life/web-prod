import {
  CONSULTATION_REPORT_PROJECTION,
  loadConsultationReport,
  queryConsultationReportRow,
} from '../lib/consultation/load-report.ts'
import {
  REQUIRED_AUDITS,
  REQUIRED_TOPICS,
  createParagraphFingerprint,
} from '../lib/consultation/report-contract.ts'
import { buildAgeContext } from '../lib/consultation/age-context.ts'
import { makeNaturalConsultationParagraph } from './fixtures/natural-consultation-text.mjs'

let passed = 0
let failed = 0

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `期望 ${JSON.stringify(expected)}，得到 ${JSON.stringify(actual)}`)
  }
}

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('\n--- C/G15 consultation report loader ---')

const ACCESS_PARTS = ['Z2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9u']
const OTHER_ACCESS_PARTS = ['Q2hPc3B6eHh2Y2x0', 'RjA4R0t5aW9z']
const ACCESS_TOKEN = ACCESS_PARTS.join('')
const OTHER_ACCESS_TOKEN = OTHER_ACCESS_PARTS.join('')

function makeCompleteContract(plan = 'C') {
  const topics = REQUIRED_TOPICS[plan]
  const chapterIds = topics.map((topic) => `chapter:${topic}`)
  const factIds = topics.map((topic) => `fact:${topic}:a`)
  const secondaryFactIds = topics.map((topic) => `fact:${topic}:b`)
  const claimIds = topics.map((topic) => `claim:${topic}`)
  const paragraphIds = topics.map((topic) => `paragraph:${topic}:part-1`)
  const evidenceIds = topics.map((topic) => `evidence:${topic}`)
  const paragraphCount = plan === 'G15' ? 8 : 6
  const paragraphCjk = plan === 'G15' ? 1_260 : 850
  const paragraphKinds = ['claim', 'scene', 'evidence', 'action', 'reflection', 'timing']
  const people = plan === 'G15'
    ? [
        { personId: 'person:one', displayName: '成員一', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
        { personId: 'person:two', displayName: '成員二', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
      ]
    : [{ personId: 'person:one', displayName: '受談者', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } }]
  const ageContexts = people.map((person, index) => {
    const birthDate = index === 0 ? '1990-01-01' : '2010-06-15'
    return {
      personId: person.personId,
      birthDate,
      ...buildAgeContext({ birthDate, asOfDate: '2026-08-09' }),
    }
  })
  const paragraphs = topics.flatMap((topic, index) =>
    Array.from({ length: paragraphCount }, (_, paragraphIndex) => {
      const paragraphId = `paragraph:${topic}:part-${paragraphIndex + 1}`
      const kind = paragraphKinds[paragraphIndex % paragraphKinds.length]
      const text = makeNaturalConsultationParagraph(
        index * paragraphCount + paragraphIndex + (plan === 'G15' ? 8_000 : 7_000),
        paragraphCjk,
        topic,
        { minorSafe: plan === 'G15' },
      )
      return {
        paragraphId,
        chapterId: chapterIds[index],
        kind,
        text,
        newInformationIds: [paragraphIndex === 0 ? claimIds[index] : `${kind}:${topic}:${paragraphIndex + 1}`],
        claimIds: [claimIds[index]],
        factIds: [factIds[index], secondaryFactIds[index]],
        subjectPersonIds: people.map((person) => person.personId),
        ageTopicsByPerson: Object.fromEntries(ageContexts.map((context) => [context.personId, [context.allowedTopics[0]]])),
        fingerprint: createParagraphFingerprint(text),
      }
    }),
  )

  return {
    schemaVersion: 'consultation-report/v1',
    reportId: `report:${plan.toLowerCase()}-reader-contract`,
    reportVersion: 1,
    plan,
    locale: 'zh-TW',
    asOfDate: '2026-08-09',
    contextHash: `sha256:${'a'.repeat(64)}`,
    people,
    ageContexts,
    sourceManifest: [{
      sourceId: 'source:calculator',
      kind: 'calculator',
      title: '排盤原始輸出',
      version: '1.0.0',
      inputHash: `sha256:${'b'.repeat(64)}`,
      outputHash: `sha256:${'c'.repeat(64)}`,
    }],
    factLedger: {
      status: 'complete',
      partialFailures: [],
      entries: topics.flatMap((topic, index) => ['a', 'b'].map((suffix) => ({
        factId: suffix === 'a' ? factIds[index] : secondaryFactIds[index],
        personIds: people.map((person) => person.personId),
        kind: 'calculator_direct',
        sourceId: 'source:calculator',
        sourcePath: `analyses[system=loader-${index}-${suffix}]`,
        value: `fixture-${topic}-${suffix}`,
        asOfDate: '2026-08-09',
        evidenceClass: 'traditional_interpretation',
        limitations: ['僅呈現已保存資料'],
      }))),
    },
    claimLedger: {
      status: 'complete',
      entries: topics.map((topic, index) => ({
        claimId: claimIds[index],
        chapterId: chapterIds[index],
        canonicalParagraphId: paragraphIds[index],
        subjectPersonIds: people.map((person) => person.personId),
        ageTopicByPerson: Object.fromEntries(ageContexts.map((context) => [context.personId, context.allowedTopics[0]])),
        supportingFactIds: [factIds[index], secondaryFactIds[index]],
        opposingFactIds: [],
        supportingSystemIds: [`loader-${index}-a`, `loader-${index}-b`],
        opposingSystemIds: [],
        evidenceStatus: 'convergent',
        evidenceIds: [evidenceIds[index]],
        applicability: '能在日常情境中核對時適用',
        invalidation: '與實際經驗不符時不採用',
        conflictsWithClaimIds: [],
        status: 'approved',
      })),
    },
    chapters: topics.map((topic, index) => ({
      chapterId: chapterIds[index],
      topicIds: [topic],
      title: `章節 ${index + 1}`,
      conclusionSubtitle: `原報告結論 ${index + 1}`,
      firstReadParagraphId: paragraphIds[index],
      paragraphIds: paragraphs
        .filter((paragraph) => paragraph.chapterId === chapterIds[index])
        .map((paragraph) => paragraph.paragraphId),
      claimIds: [claimIds[index]],
      status: 'complete',
    })),
    paragraphs,
    readingLayers: {
      quick_30s: {
        items: claimIds.slice(0, 3).map((claimId, index) => ({
          claimId,
          conclusion: `核心結論 ${index + 1}`,
          selfCheck: `生活核對 ${index + 1}`,
        })),
      },
      route_3m: {
        chapters: chapterIds.map((chapterId, index) => ({
          chapterId,
          conclusionSubtitle: `原報告結論 ${index + 1}`,
          firstReadParagraphId: paragraphIds[index],
          readingLoad: 'deep',
        })),
      },
      deep_read: { chapterIds },
      evidence_appendix: {
        entries: evidenceIds.map((evidenceId, index) => ({
          evidenceId,
          label: `依據 ${index + 1}`,
          type: 'traditional_interpretation',
          factIds: [factIds[index], secondaryFactIds[index]],
          claimIds: [claimIds[index]],
          sourceIds: ['source:calculator'],
          limitations: ['以當事人的實際經驗為準'],
        })),
      },
    },
    systemCoverage: {
      availableTraditionalSystemIds: topics.flatMap((_, index) => [`loader-${index}-a`, `loader-${index}-b`]).sort(),
      usedSystemIds: topics.flatMap((_, index) => [`loader-${index}-a`, `loader-${index}-b`]).sort(),
      omittedSystems: [],
    },
    chapterJobs: chapterIds.map((chapterId, index) => ({
      jobId: `job:${topics[index]}`,
      chapterId,
      idempotencyKey: `reader:${plan}:${topics[index]}`,
      status: 'succeeded',
      attempt: 1,
      promptVersionHash: `sha256:${'d'.repeat(64)}`,
      inputHash: `sha256:${'e'.repeat(64)}`,
      outputHash: `sha256:${'f'.repeat(64)}`,
    })),
    audits: REQUIRED_AUDITS.map((kind, index) => ({
      kind,
      status: 'passed',
      artifactHash: `sha256:${String(index).padStart(64, '0')}`,
    })),
    completeness: {
      status: 'complete',
      requiredChapterIds: chapterIds,
      requiredClaimIds: claimIds,
      requiredFactIds: [...factIds, ...secondaryFactIds],
      missingData: [],
      partialFailures: [],
    },
  }
}

await test('invalid access tokens are rejected before the report query runs', async () => {
  const invalidTokens = [
    '',
    '   ',
    'has space',
    'expected-token',
    'validish.withdot',
    'line\nbreak',
    '\ud800',
    'a'.repeat(32),
    'x'.repeat(129),
    'x'.repeat(513),
  ]

  for (const token of invalidTokens) {
    let queryCount = 0
    const result = await loadConsultationReport(token, async () => {
      queryCount += 1
      return { data: null, error: null }
    })

    assert(!result.ok, '無效 token 必須 fail closed')
    assertEqual(result.code, 'invalid_token')
    assertEqual(queryCount, 0, '無效 token 不得查資料庫')
  }
})

await test('database query uses an explicit projection and C/G15 completed-only filters', async () => {
  const calls = []
  const terminal = { data: { plan_code: 'C' }, error: null }
  const builder = {
    select(value) {
      calls.push(['select', value])
      return this
    },
    eq(field, value) {
      calls.push(['eq', field, value])
      return this
    },
    in(field, value) {
      calls.push(['in', field, value])
      return this
    },
    is(field, value) {
      calls.push(['is', field, value])
      return this
    },
    maybeSingle() {
      calls.push(['maybeSingle'])
      return Promise.resolve(terminal)
    },
  }
  const client = {
    from(table) {
      calls.push(['from', table])
      return builder
    },
  }

  const result = await queryConsultationReportRow(client, ACCESS_TOKEN)

  assert(result === terminal, '查詢結果應原樣交給 loader')
  assertEqual(JSON.stringify(calls), JSON.stringify([
    ['from', 'paid_reports'],
    ['select', CONSULTATION_REPORT_PROJECTION],
    ['eq', 'access_token', ACCESS_TOKEN],
    ['eq', 'status', 'completed'],
    ['in', 'plan_code', ['C', 'G15']],
    ['is', 'deleted_at', null],
    ['maybeSingle'],
  ]))
})

await test('a complete consultation_report is returned without consulting legacy prose', async () => {
  const report = makeCompleteContract('C')
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'C',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      ai_content: '舊版正文不得蓋過新契約',
      full_charts: null,
      narrative_summary: null,
      pdf_url: 'https://files.example.test/structured.pdf?signature=fixture',
      report_result: {
        consultation_report: report,
        ai_content: '另一份舊版正文',
      },
    },
    error: null,
  }))

  assert(result.ok, '完整新契約應可載入')
  assertEqual(result.mode, 'structured')
  assertEqual(result.plan, 'C')
  assert(result.report === report, '不得重寫已完成的結構化報告')
  assertEqual(result.pdfUrl, 'https://files.example.test/structured.pdf?signature=fixture')
  assert(!('content' in result), '新契約不得混入舊版正文')
})

await test('an invalid consultation_report holds the whole row instead of falling back to ai_content', async () => {
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'G15',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      ai_content: '這段文字即使存在也不得當作替代品',
      full_charts: null,
      narrative_summary: null,
      report_result: {
        consultation_report: {
          schemaVersion: 'consultation-report/v1',
          plan: 'G15',
        },
        ai_content: '巢狀舊版文字也不得掩蓋契約錯誤',
      },
    },
    error: null,
  }))

  assert(!result.ok, '不完整契約必須 HOLD')
  assertEqual(result.code, 'invalid_contract')
  assert(!('content' in result), 'HOLD 結果不得暴露舊版正文')
  assert(!('report' in result), 'HOLD 結果不得暴露半成品契約')
})

await test('the projection only names real paid_reports columns', () => {
  // v5.10.483 P0 回歸鎖:paid_reports 沒有 top-level ai_content/full_charts/
  // narrative_summary。原投影選了不存在欄位 → PostgREST 42703 → 所有 C/G15
  // 報告開啟一律 503(2026-08-17 production 實測、老闆報告打不開)。
  // 三者一律取 report_result 巢狀值;要改這條字串必先有 migration 證據。
  assertEqual(
    CONSULTATION_REPORT_PROJECTION,
    'plan_code,status,access_token,report_result,pdf_url',
  )
  for (const phantom of ['ai_content', 'full_charts', 'narrative_summary']) {
    assert(
      !CONSULTATION_REPORT_PROJECTION.split(',').includes(phantom),
      `投影不得選不存在的 top-level 欄位 ${phantom}`,
    )
  }
})

await test('legacy mode reads report_result nested fields exactly as production stores them', async () => {
  // fixture 形狀 = production saveReport 實際寫入(全部巢狀在 report_result)
  // + 修正後投影實際回傳的欄位,無任何 top-level ai_content/full_charts。
  const storedCharts = { source: 'calculator-output' }
  const storedNarrative = { source: 'saved-summary' }
  const originalText = '# 第一章\n\n這是資料庫保存的原文。'
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'G15',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      pdf_url: 'https://files.example.test/legacy.pdf?signature=fixture',
      report_result: {
        report_id: 'fixture-report-id',
        systems_count: 15,
        ai_model: 'fixture-model',
        ai_tokens: 42,
        ai_content: originalText,
        asOfDate: '2026-08-09',
        full_charts: storedCharts,
        narrative_summary: storedNarrative,
      },
    },
    error: null,
  }))

  assert(result.ok, '有明確 report_result.ai_content 的舊報告應可讀')
  assertEqual(result.mode, 'legacy_full_text')
  assertEqual(result.plan, 'G15')
  assertEqual(result.content, originalText)
  assert(result.fullCharts === storedCharts, '命盤資料取自 report_result.full_charts 巢狀值')
  assert(result.narrativeSummary === storedNarrative, '摘要資料取自 report_result.narrative_summary 巢狀值')
  assertEqual(result.pdfUrl, 'https://files.example.test/legacy.pdf?signature=fixture')
  assertEqual(result.provenance.contentField, 'report_result.ai_content')
  // L4 Gemini 反例 783bef2b:asOfDate 必須透傳給 normalize、不得默默退化 unknown
  assertEqual(result.asOf.status, 'known')
  assertEqual(result.asOf.value, '2026-08-09')
  assert(!('facts' in result), 'loader 不得替舊版正文建立事實')
  assert(!('accessToken' in result), '閱讀模型不得回傳 access token')
})

await test('a report_result without asOfDate stays honestly unknown', async () => {
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'C',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      pdf_url: null,
      report_result: { ai_content: '# 章\n\n正文。' },
    },
    error: null,
  }))
  assert(result.ok, '無 asOfDate 的正常舊報告應可讀')
  assertEqual(result.asOf.status, 'unknown')
  assertEqual(result.asOf.value, null)
})

await test('a malformed asOfDate holds the row instead of being silently dropped', async () => {
  // L4 Gemini 反例 783bef2b:原本重組物件把 asOfDate 丟掉,invalid_as_of 防線是死碼
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'C',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      pdf_url: null,
      report_result: { ai_content: '# 章\n\n正文。', asOfDate: '2026-13-99' },
    },
    error: null,
  }))
  assert(!result.ok, '非法 asOfDate 必須 HOLD、不得默默當 unknown 放行')
  assertEqual(result.code, 'legacy_hold')
})

await test('a string report_result still resolves through the normalize string fallback', async () => {
  const result = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'C',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      pdf_url: null,
      report_result: '整段以字串保存的舊版報告全文。',
    },
    error: null,
  }))
  assert(result.ok, '字串形式的 report_result 應走 normalize 字串備援')
  assertEqual(result.mode, 'legacy_full_text')
  assertEqual(result.content, '整段以字串保存的舊版報告全文。')
  assertEqual(result.provenance.contentField, 'report_result')
})

await test('query failures, token mismatches, unsupported plans, and plan mismatches all fail closed', async () => {
  const queryFailure = await loadConsultationReport(ACCESS_TOKEN, async () => {
    throw new Error('connection detail that must not escape')
  })
  assert(!queryFailure.ok, '資料庫例外不得離開 loader')
  assertEqual(queryFailure.code, 'database_error')

  const mismatchedToken = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'C',
      status: 'completed',
      access_token: OTHER_ACCESS_TOKEN,
      report_result: { ai_content: 'private content' },
    },
    error: null,
  }))
  assert(!mismatchedToken.ok, 'row token 不一致不得載入')
  assertEqual(mismatchedToken.code, 'invalid_row')

  const unsupportedPlan = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'E3',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      report_result: { ai_content: 'private E3 content' },
    },
    error: null,
  }))
  assert(!unsupportedPlan.ok, '非 C/G15 不得進入 consultation loader')
  assertEqual(unsupportedPlan.code, 'invalid_row')
  assert(!('content' in unsupportedPlan), '拒絕結果不得暴露 E3 正文')

  const report = makeCompleteContract('C')
  const mismatchedPlan = await loadConsultationReport(ACCESS_TOKEN, async () => ({
    data: {
      plan_code: 'G15',
      status: 'completed',
      access_token: ACCESS_TOKEN,
      report_result: { consultation_report: report, ai_content: 'legacy fallback' },
    },
    error: null,
  }))
  assert(!mismatchedPlan.ok, 'row 與契約方案不一致必須 HOLD')
  assertEqual(mismatchedPlan.code, 'plan_mismatch')
  assert(!('content' in mismatchedPlan), '方案衝突不得 fallback')
})

console.log(JSON.stringify({ suite: 'C/G15 consultation report loader', passed, failed, skipped: 0 }))
if (failed > 0) process.exitCode = 1
