import { suite, test, assert, assertEqual, done } from './harness.mjs'
import { makeNaturalConsultationParagraph } from './fixtures/natural-consultation-text.mjs'

let contract
let ageContract
let loadError
try {
  contract = await import('../lib/consultation/report-contract.ts')
  ageContract = await import('../lib/consultation/age-context.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 超長諮詢報告純資料契約')

function makeCompleteCReport() {
  const primaryAgeTopic = ageContract.buildAgeContext({
    birthDate: '1990-01-01',
    asOfDate: '2026-08-09',
  }).allowedTopics[0]
  const topics = contract.REQUIRED_TOPICS.C
  const chapterIds = topics.map((topic) => `chapter:${topic}`)
  const factIds = topics.map((topic) => `fact:${topic}`)
  const secondaryFactIds = topics.map((topic) => `fact:${topic}:secondary`)
  const claimIds = topics.map((topic) => `claim:${topic}`)
  const paragraphIds = topics.map((topic) => `paragraph:${topic}:part-1`)
  const evidenceIds = topics.map((topic) => `evidence:${topic}`)
  const kinds = ['claim', 'scene', 'evidence', 'action', 'reflection', 'timing']
  const paragraphs = topics.flatMap((topic, chapterIndex) =>
    kinds.map((kind, paragraphIndex) => {
      const paragraphId = `paragraph:${topic}:part-${paragraphIndex + 1}`
      const text = makeNaturalConsultationParagraph(
        chapterIndex * kinds.length + paragraphIndex,
        850,
        topic,
      )
      return {
        paragraphId,
        chapterId: chapterIds[chapterIndex],
        kind,
        text,
        newInformationIds: [paragraphIndex === 0 ? claimIds[chapterIndex] : `${kind}:${topic}:part-${paragraphIndex + 1}`],
        claimIds: [claimIds[chapterIndex]],
        factIds: [factIds[chapterIndex], secondaryFactIds[chapterIndex]],
        subjectPersonIds: ['person:one'],
        ageTopicsByPerson: { 'person:one': [primaryAgeTopic] },
        fingerprint: contract.createParagraphFingerprint(text),
      }
    }),
  )

  return {
    schemaVersion: 'consultation-report/v1',
    reportId: 'report:synthetic-c',
    reportVersion: 1,
    plan: 'C',
    locale: 'zh-TW',
    asOfDate: '2026-08-09',
    contextHash: `sha256:${'a'.repeat(64)}`,
    people: [
      { personId: 'person:one', displayName: '合成樣本', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
    ],
    ageContexts: [{
      personId: 'person:one',
      birthDate: '1990-01-01',
      ...ageContract.buildAgeContext({ birthDate: '1990-01-01', asOfDate: '2026-08-09' }),
    }],
    sourceManifest: [
      {
        sourceId: 'source:calculator',
        kind: 'calculator',
        title: '合成排盤輸出',
        version: '1.0.0',
        inputHash: `sha256:${'b'.repeat(64)}`,
        outputHash: `sha256:${'c'.repeat(64)}`,
      },
    ],
    factLedger: {
      status: 'complete',
      partialFailures: [],
      entries: topics.flatMap((topic, index) => [
        {
          factId: factIds[index],
          personIds: ['person:one'],
          kind: 'calculator_direct',
          sourceId: 'source:calculator',
          sourcePath: `analyses[system=synthetic-${index}-a]`,
          value: `synthetic-${topic}-a`,
          asOfDate: '2026-08-09',
          evidenceClass: 'traditional_interpretation',
          limitations: ['僅用於契約測試'],
        },
        {
          factId: secondaryFactIds[index],
          personIds: ['person:one'],
          kind: 'calculator_direct',
          sourceId: 'source:calculator',
          sourcePath: `analyses[system=synthetic-${index}-b]`,
          value: `synthetic-${topic}-b`,
          asOfDate: '2026-08-09',
          evidenceClass: 'traditional_interpretation',
          limitations: ['僅用於契約測試'],
        },
      ]),
    },
    claimLedger: {
      status: 'complete',
      entries: topics.map((topic, index) => ({
        claimId: claimIds[index],
        chapterId: chapterIds[index],
        canonicalParagraphId: paragraphIds[index],
        subjectPersonIds: ['person:one'],
        ageTopicByPerson: { 'person:one': primaryAgeTopic },
        supportingFactIds: [factIds[index], secondaryFactIds[index]],
        opposingFactIds: [],
        supportingSystemIds: [`synthetic-${index}-a`, `synthetic-${index}-b`],
        opposingSystemIds: [],
        evidenceStatus: 'convergent',
        evidenceIds: [evidenceIds[index]],
        applicability: '讀者能在生活中核對時適用',
        invalidation: '核對不成立時跳過',
        conflictsWithClaimIds: [],
        status: 'approved',
      })),
    },
    chapters: topics.map((topic, index) => ({
      chapterId: chapterIds[index],
      topicIds: [topic],
      title: `章節 ${index + 1}`,
      conclusionSubtitle: `可核對結論 ${index + 1}`,
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
          selfCheck: `自我核對 ${index + 1}`,
        })),
      },
      route_3m: {
        chapters: topics.map((topic, index) => ({
          chapterId: chapterIds[index],
          conclusionSubtitle: `可核對結論 ${index + 1}`,
          firstReadParagraphId: paragraphIds[index],
          readingLoad: 'deep',
        })),
      },
      deep_read: { chapterIds },
      evidence_appendix: {
        entries: topics.map((topic, index) => ({
          evidenceId: evidenceIds[index],
          label: `白話依據 ${index + 1}`,
          type: 'calculator_direct',
          factIds: [factIds[index], secondaryFactIds[index]],
          claimIds: [claimIds[index]],
          sourceIds: ['source:calculator'],
          limitations: ['僅用於契約測試'],
        })),
      },
    },
    systemCoverage: {
      availableTraditionalSystemIds: topics.flatMap((_, index) => [`synthetic-${index}-a`, `synthetic-${index}-b`]).sort(),
      usedSystemIds: topics.flatMap((_, index) => [`synthetic-${index}-a`, `synthetic-${index}-b`]).sort(),
      omittedSystems: [],
    },
    chapterJobs: topics.map((topic, index) => ({
      jobId: `job:${topic}`,
      chapterId: chapterIds[index],
      idempotencyKey: `report:synthetic-c:v1:${topic}`,
      status: 'succeeded',
      attempt: 1,
      promptVersionHash: `sha256:${'d'.repeat(64)}`,
      inputHash: `sha256:${'e'.repeat(64)}`,
      outputHash: `sha256:${'f'.repeat(64)}`,
    })),
    audits: contract.REQUIRED_AUDITS.map((kind, index) => ({
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

function makeCompleteG15Report() {
  const report = makeCompleteCReport()
  const people = [
    ...report.people,
    { personId: 'person:two', displayName: '合成樣本二', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
    { personId: 'person:three', displayName: '合成樣本三', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
  ]
  report.reportId = 'report:synthetic-g15'
  report.plan = 'G15'
  report.people = people
  for (const [personId, birthDate] of [
    ['person:two', '1988-10-10'],
    ['person:three', '2012-06-15'],
  ]) {
    report.ageContexts.push({
      personId,
      birthDate,
      ...ageContract.buildAgeContext({ birthDate, asOfDate: report.asOfDate }),
    })
  }
  report.chapters.forEach((chapter, index) => {
    chapter.topicIds = [contract.REQUIRED_TOPICS.G15[index]]
  })
  report.factLedger.entries.forEach((fact) => {
    fact.kind = 'calculator_direct'
    fact.personIds = people.map((person) => person.personId)
  })
  const requiredSubjects = [
    ['person:one'],
    ['person:two'],
    ['person:three'],
    ['person:one', 'person:two'],
    ['person:one', 'person:three'],
    ['person:two', 'person:three'],
  ]
  report.claimLedger.entries.forEach((claim, index) => {
    claim.subjectPersonIds = requiredSubjects[index] ?? people.map((person) => person.personId)
    claim.ageTopicByPerson = Object.fromEntries(claim.subjectPersonIds.map((personId) => [
      personId,
      report.ageContexts.find((context) => context.personId === personId).allowedTopics[0],
    ]))
    report.paragraphs
      .filter((entry) => entry.claimIds.includes(claim.claimId))
      .forEach((paragraph) => {
        paragraph.subjectPersonIds = [...claim.subjectPersonIds]
        paragraph.ageTopicsByPerson = Object.fromEntries(claim.subjectPersonIds.map((personId) => [
          personId,
          [claim.ageTopicByPerson[personId]],
        ]))
      })
  })
  report.chapters.forEach((chapter, chapterIndex) => {
    const existing = report.paragraphs.filter((paragraph) => paragraph.chapterId === chapter.chapterId)
    existing.forEach((paragraph, paragraphIndex) => {
      paragraph.text = makeNaturalConsultationParagraph(
        100 + chapterIndex * 8 + paragraphIndex,
        1_270,
        chapter.topicIds[0],
        { minorSafe: true },
      )
      paragraph.fingerprint = contract.createParagraphFingerprint(paragraph.text)
    })
    for (let paragraphIndex = existing.length; paragraphIndex < 8; paragraphIndex += 1) {
      const claim = report.claimLedger.entries.find((entry) => entry.chapterId === chapter.chapterId)
      const kind = paragraphIndex % 2 === 0 ? 'claim' : 'scene'
      const text = makeNaturalConsultationParagraph(
        100 + chapterIndex * 8 + paragraphIndex,
        1_270,
        chapter.topicIds[0],
        { minorSafe: true },
      )
      const paragraphId = `paragraph:${chapter.topicIds[0]}:part-${paragraphIndex + 1}`
      report.paragraphs.push({
        paragraphId,
        chapterId: chapter.chapterId,
        kind,
        text,
        newInformationIds: [`${kind}:${chapter.topicIds[0]}:part-${paragraphIndex + 1}`],
        claimIds: [claim.claimId],
        factIds: [...claim.supportingFactIds],
        subjectPersonIds: [...claim.subjectPersonIds],
        ageTopicsByPerson: Object.fromEntries(claim.subjectPersonIds.map((personId) => [
          personId,
          [claim.ageTopicByPerson[personId]],
        ])),
        fingerprint: contract.createParagraphFingerprint(text),
      })
      chapter.paragraphIds.push(paragraphId)
    }
  })
  report.chapterJobs.forEach((job) => {
    job.idempotencyKey = job.idempotencyKey.replace('synthetic-c', 'synthetic-g15')
  })
  return report
}

test('四層閱讀的順序與完整字數目標是單一來源', () => {
  assert(contract, `契約模組無法載入: ${loadError?.message || 'unknown error'}`)
  assertEqual(
    JSON.stringify(contract.READING_LAYER_ORDER),
    JSON.stringify(['quick_30s', 'route_3m', 'deep_read', 'evidence_appendix']),
  )
  assertEqual(contract.MIN_EFFECTIVE_CJK.C, 50_000)
  assertEqual(contract.MIN_EFFECTIVE_CJK.G15, 100_000)
})

test('去重指紋會正規化全形字與排版空白，但保留內容差異', () => {
  const formatted = contract.createParagraphFingerprint('ＡＢ　測試\n內容')
  const normalized = contract.createParagraphFingerprint('ab 測試 內容')
  const markdownOnly = contract.createParagraphFingerprint('**ＡＢ**　測試\n內容')
  const different = contract.createParagraphFingerprint('ab 測試 其他內容')

  assertEqual(formatted, normalized)
  assertEqual(markdownOnly, normalized)
  assert(formatted !== different, '內容不同的段落不得被視為相同指紋')
})

test('完整 C 報告必須同時提供四層閱讀、facts、claims、年齡脈絡與可追溯章節', () => {
  const result = contract.validateConsultationReportContract(makeCompleteCReport())

  assertEqual(result.ok, true, JSON.stringify(result.issues))
  assert(result.metrics.effectiveCjkCharacters >= 50_000)
  assertEqual(result.metrics.chapterCount, contract.REQUIRED_TOPICS.C.length)
  assertEqual(result.metrics.claimCount, contract.REQUIRED_TOPICS.C.length)
})

test('final contract 不接受用單字重複偽造五萬／十萬字完整度', () => {
  for (const plan of ['C', 'G15']) {
    const candidate = structuredClone(plan === 'C' ? makeCompleteCReport() : makeCompleteG15Report())
    candidate.paragraphs[0].text = '甲'.repeat(plan === 'C' ? 900 : 1_270)
    candidate.paragraphs[0].fingerprint = contract.createParagraphFingerprint(candidate.paragraphs[0].text)
    const validation = contract.validateConsultationReportContract(candidate)
    assertEqual(validation.ok, false)
    assert(validation.issues.some((issue) => issue.code === 'paragraph.character_run'))
  }
})

test('AgeContext 與 facts 的 as_of 必須和報告基準日完全一致', () => {
  const candidate = makeCompleteCReport()
  candidate.ageContexts[0].asOfDate = '2026-08-10'
  candidate.factLedger.entries[0].asOfDate = '2026-08-08'

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'as_of.age_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'as_of.fact_mismatch'))
})

test('AgeContext 必須由完整出生日重算實足年齡，並對齊生命階段與讀者', () => {
  const candidate = makeCompleteCReport()
  candidate.ageContexts[0].birthDate = '1990-12-31'
  candidate.ageContexts[0].ageYears = 36
  candidate.ageContexts[0].stage = 'young_adult'
  candidate.ageContexts[0].readerMode = 'guardian'
  candidate.ageContexts[0].timeHorizonEndAge = 999
  candidate.ageContexts[0].allowedTopics = ['unsafe_override']
  candidate.ageContexts[0].prohibitedTopics = []

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'age.age_years_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'age.stage_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'age.reader_mode_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'age.time_horizon_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'age.allowed_topics_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'age.prohibited_topics_mismatch'))
})

test('每段必須貢獻新資訊 ID，且正規化後相同內容不得重複上稿', () => {
  const candidate = makeCompleteCReport()
  candidate.paragraphs[0].newInformationIds = []
  candidate.paragraphs[1].newInformationIds = [candidate.paragraphs[2].newInformationIds[0]]
  candidate.paragraphs[1].text = `  ${candidate.paragraphs[2].text}\n`
  candidate.paragraphs[1].fingerprint = contract.createParagraphFingerprint(candidate.paragraphs[1].text)

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'paragraph.no_new_information'))
  assert(result.issues.some((issue) => issue.code === 'information_id.reused'))
  assert(result.issues.some((issue) => issue.code === 'paragraph.duplicate_fingerprint'))
})

test('facts ledger 有 partial failure 或 claim 無法反查依據與 canonical 段落時必須停止', () => {
  const candidate = makeCompleteCReport()
  candidate.factLedger.partialFailures.push('synthetic-timeout')
  candidate.claimLedger.entries[0].supportingFactIds = ['fact:missing']
  candidate.claimLedger.entries[0].canonicalParagraphId = candidate.paragraphs[6].paragraphId

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'facts.partial_failure'))
  assert(result.issues.some((issue) => issue.code === 'claim.supporting_fact_missing'))
  assert(result.issues.some((issue) => issue.code === 'claim.canonical_paragraph_mismatch'))
})

test('僅供反思的系統不能單獨支撐客戶結論', () => {
  const candidate = makeCompleteCReport()
  const supportingFactIds = new Set(candidate.claimLedger.entries[0].supportingFactIds)
  candidate.factLedger.entries
    .filter((fact) => supportingFactIds.has(fact.factId))
    .forEach((fact) => { fact.evidenceClass = 'reflection_only' })

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'claim.reflection_only_support'))
})

test('單一系統主張可如實保留，但未採用系統必須逐項列明而不得假造共識', () => {
  const candidate = makeCompleteCReport()
  candidate.claimLedger.entries.forEach((claim) => {
    claim.supportingFactIds = claim.supportingFactIds.slice(0, 1)
    claim.supportingSystemIds = claim.supportingSystemIds.slice(0, 1)
    claim.evidenceStatus = 'single_system'
  })
  candidate.systemCoverage.usedSystemIds = candidate.claimLedger.entries
    .flatMap((claim) => claim.supportingSystemIds)
    .sort()
  candidate.systemCoverage.omittedSystems = candidate.systemCoverage.availableTraditionalSystemIds
    .filter((systemId) => !candidate.systemCoverage.usedSystemIds.includes(systemId))
    .map((systemId) => ({ systemId, reason: 'insufficient_direct_relevance' }))

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, true)
  assertEqual(candidate.systemCoverage.omittedSystems.length, contract.REQUIRED_TOPICS.C.length)
})

test('章節 job、必要 audit 與資料缺口未清零時不得標記完成', () => {
  const candidate = makeCompleteCReport()
  candidate.chapterJobs[0].status = 'failed'
  candidate.audits = candidate.audits.filter((audit) => audit.kind !== 'human_language')
  candidate.completeness.status = 'incomplete'
  candidate.completeness.missingData.push('client-question')

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'chapter_job.incomplete'))
  assert(result.issues.some((issue) => issue.code === 'audit.missing'))
  assert(result.issues.some((issue) => issue.code === 'completeness.status'))
  assert(result.issues.some((issue) => issue.code === 'completeness.missing_data'))
})

test('四層閱讀必須自足且完整覆蓋章節與依據來回連結', () => {
  const candidate = makeCompleteCReport()
  delete candidate.readingLayers.quick_30s
  candidate.readingLayers.route_3m.chapters.pop()
  candidate.readingLayers.deep_read.chapterIds.pop()
  candidate.readingLayers.evidence_appendix.entries.pop()

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'reading_layer.missing'))
  assert(result.issues.some((issue) => issue.code === 'route.chapter_missing'))
  assert(result.issues.some((issue) => issue.code === 'deep_read.chapter_missing'))
  assert(result.issues.some((issue) => issue.code === 'evidence.missing'))
})

test('G15 完整度目標為十萬有效字，家庭 claim 須有跨成員或家庭結構支持', () => {
  const complete = contract.validateConsultationReportContract(makeCompleteG15Report())
  assertEqual(complete.ok, true, JSON.stringify(complete.issues))
  assert(complete.metrics.effectiveCjkCharacters >= 100_000)

  const unsupported = makeCompleteG15Report()
  const firstClaimFactIds = new Set(unsupported.claimLedger.entries[0].supportingFactIds)
  unsupported.factLedger.entries
    .filter((fact) => firstClaimFactIds.has(fact.factId))
    .forEach((fact) => { fact.personIds = ['person:two'] })
  const rejected = contract.validateConsultationReportContract(unsupported)
  assertEqual(rejected.ok, false)
  assert(rejected.issues.some((issue) => issue.code === 'g15.subject_fact_coverage'))
})

test('chapter、claim、fact 與 paragraph ID 必須各自唯一', () => {
  const candidate = makeCompleteCReport()
  candidate.chapters[1].chapterId = candidate.chapters[0].chapterId
  candidate.claimLedger.entries[1].claimId = candidate.claimLedger.entries[0].claimId
  candidate.factLedger.entries[1].factId = candidate.factLedger.entries[0].factId
  candidate.paragraphs[1].paragraphId = candidate.paragraphs[0].paragraphId

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'chapter.id_duplicate'))
  assert(result.issues.some((issue) => issue.code === 'claim.id_duplicate'))
  assert(result.issues.some((issue) => issue.code === 'fact.id_duplicate'))
  assert(result.issues.some((issue) => issue.code === 'paragraph.id_duplicate'))
})

test('completeness 必須窮舉全部已組裝章節、claims 與 facts，不得縮小必要範圍', () => {
  const candidate = makeCompleteCReport()
  candidate.completeness.requiredChapterIds.pop()
  candidate.completeness.requiredClaimIds.pop()
  candidate.completeness.requiredFactIds.pop()

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'completeness.required_chapter_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'completeness.required_claim_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'completeness.required_fact_mismatch'))
})

test('畸形或空 payload 必須回傳可辨識的 HOLD，不得在驗證器內拋錯', () => {
  const empty = contract.validateConsultationReportContract(null)
  const malformed = contract.validateConsultationReportContract({
    schemaVersion: 'consultation-report/v1',
    plan: 'C',
    paragraphs: [{}],
  })
  const malformedNested = makeCompleteCReport()
  malformedNested.factLedger.entries[0] = {}
  const nestedResult = contract.validateConsultationReportContract(malformedNested)

  assertEqual(empty.ok, false)
  assertEqual(malformed.ok, false)
  assert(malformed.issues.some((issue) => issue.code === 'paragraph.shape_invalid'))
  assertEqual(nestedResult.ok, false)
  assert(nestedResult.issues.some((issue) => issue.code === 'contract.shape_invalid'))
})

test('immutable context 必須有 hash 綁定，人物授權、AgeContext 與 fact source 缺一即停止', () => {
  const candidate = makeCompleteCReport()
  candidate.contextHash = 'pending'
  candidate.people[0].authorization = 'missing'
  candidate.ageContexts = []
  candidate.factLedger.entries[0].sourceId = 'source:missing'

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'context.hash_invalid'))
  assert(result.issues.some((issue) => issue.code === 'person.authorization_missing'))
  assert(result.issues.some((issue) => issue.code === 'person.age_context_missing'))
  assert(result.issues.some((issue) => issue.code === 'fact.source_missing'))
})

test('完成閥門會放行完整報告，並對任一未完整 payload fail closed', () => {
  const complete = makeCompleteCReport()
  contract.assertCompleteConsultationReportContract(complete)

  const incomplete = makeCompleteCReport()
  incomplete.paragraphs[0].text = ''
  incomplete.paragraphs[0].fingerprint = contract.createParagraphFingerprint('')
  let rejected
  try {
    contract.assertCompleteConsultationReportContract(incomplete)
  } catch (error) {
    rejected = error
  }

  assert(rejected, '未完整報告必須被拒絕')
  assertEqual(rejected.name, 'ConsultationReportContractError')
  assert(rejected.issues.some((issue) => issue.code === 'paragraph.reading_length_invalid'))
})

test('自填 passed audit 收據不能掩蓋年份干支與決定論內容', () => {
  const candidate = makeCompleteCReport()
  candidate.paragraphs[0].text = `2028 年丙午流年顯示你注定失敗。${'甲'.repeat(5_000)}`
  candidate.paragraphs[0].fingerprint = contract.createParagraphFingerprint(candidate.paragraphs[0].text)

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'temporal.ganzhi_mismatch'))
  assert(result.issues.some((issue) => issue.code === 'safety.deterministic_claim'))
})

test('摘要、自我核對、依據限制與 claim 邊界都屬交付面，高風險句不能藏在正文外', () => {
  const mutations = [
    (candidate) => { candidate.readingLayers.quick_30s.items[0].selfCheck = '你的婚姻已沒有任何修復空間，分開是唯一結局。' },
    (candidate) => { candidate.readingLayers.evidence_appendix.entries[0].limitations[0] = '即刻停止醫師開立的處方，單靠命盤調整便可恢復。' },
    (candidate) => { candidate.claimLedger.entries[0].invalidation = '把全部資產集中投入這個標的，命盤顯示這是翻身的唯一道路。' },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(makeCompleteCReport())
    mutate(candidate)
    const validation = contract.validateConsultationReportContract(candidate)
    assertEqual(validation.ok, false)
    assert(validation.issues.some((issue) => issue.code.startsWith('safety.')))
  }
})

test('摘要與章首結論保留寬裕篇幅，但逐欄上限會阻止單一欄位吞掉整份報告', () => {
  const candidate = makeCompleteCReport()
  candidate.readingLayers.quick_30s.items[0].conclusion = '甲'.repeat(
    contract.MAX_QUICK_CONCLUSION_CHARACTERS + 1,
  )
  candidate.readingLayers.quick_30s.items[1].selfCheck = '乙'.repeat(
    contract.MAX_QUICK_SELF_CHECK_CHARACTERS + 1,
  )
  candidate.chapters[0].conclusionSubtitle = '丙'.repeat(
    contract.MAX_CONCLUSION_SUBTITLE_CHARACTERS + 1,
  )
  candidate.readingLayers.route_3m.chapters[0].conclusionSubtitle = (
    candidate.chapters[0].conclusionSubtitle
  )

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'quick_30s.conclusion_too_long'))
  assert(result.issues.some((issue) => issue.code === 'quick_30s.self_check_too_long'))
  assert(result.issues.some((issue) => issue.code === 'chapter.conclusion_subtitle_too_long'))
})

test('摘要欄位拒絕換行炸彈，3 分鐘路徑也必須逐字綁定完整章節', () => {
  const candidate = makeCompleteCReport()
  candidate.readingLayers.quick_30s.items[0].conclusion = `結論${'\n'.repeat(20)}尾端`
  candidate.readingLayers.quick_30s.items[1].selfCheck = `核對${'\u2028'.repeat(20)}尾端`
  candidate.chapters[0].conclusionSubtitle = `章首${'\n'.repeat(20)}尾端`
  candidate.readingLayers.route_3m.chapters[0].conclusionSubtitle = '與完整章節不一致'
  candidate.readingLayers.route_3m.chapters[0].firstReadParagraphId = candidate.chapters[1].firstReadParagraphId

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'quick_30s.conclusion_multiline'))
  assert(result.issues.some((issue) => issue.code === 'quick_30s.self_check_multiline'))
  assert(result.issues.some((issue) => issue.code === 'chapter.conclusion_subtitle_multiline'))
  assert(result.issues.some((issue) => issue.code === 'route.chapter_content_mismatch'))
})

test('章節、段落、claim 與 fact 之間的雙向引用必須全部可反查', () => {
  const candidate = makeCompleteCReport()
  candidate.chapters[0].paragraphIds = ['paragraph:missing']
  candidate.chapters[0].claimIds = ['claim:missing']
  candidate.paragraphs[0].chapterId = 'chapter:missing'
  candidate.paragraphs[0].claimIds = ['claim:missing']
  candidate.paragraphs[0].factIds = ['fact:missing']

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'chapter.paragraph_missing'))
  assert(result.issues.some((issue) => issue.code === 'chapter.claim_missing'))
  assert(result.issues.some((issue) => issue.code === 'paragraph.chapter_missing'))
  assert(result.issues.some((issue) => issue.code === 'paragraph.claim_missing'))
  assert(result.issues.some((issue) => issue.code === 'paragraph.fact_missing'))
})

test('章節 jobs 與 audits 必須有唯一冪等鍵、有效 attempt 與 hash 綁定', () => {
  const candidate = makeCompleteCReport()
  candidate.chapterJobs[1].idempotencyKey = candidate.chapterJobs[0].idempotencyKey
  candidate.chapterJobs[0].attempt = 0
  candidate.chapterJobs[0].outputHash = 'pending'
  candidate.audits[0].artifactHash = 'pending'

  const result = contract.validateConsultationReportContract(candidate)
  assertEqual(result.ok, false)
  assert(result.issues.some((issue) => issue.code === 'chapter_job.idempotency_duplicate'))
  assert(result.issues.some((issue) => issue.code === 'chapter_job.attempt_invalid'))
  assert(result.issues.some((issue) => issue.code === 'chapter_job.hash_invalid'))
  assert(result.issues.some((issue) => issue.code === 'audit.hash_invalid'))
})

done()
