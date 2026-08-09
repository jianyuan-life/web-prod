import { suite, test, assert, assertEqual, done } from './harness.mjs'
import { makeNaturalConsultationParagraph } from './fixtures/natural-consultation-text.mjs'

let assembly
let planner
let age
let contract
let loadError
try {
  assembly = await import('../lib/consultation/chapter-assembly.ts')
  planner = await import('../lib/consultation/generation-plan.ts')
  age = await import('../lib/consultation/age-context.ts')
  contract = await import('../lib/consultation/report-contract.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 章節輸出正規化與完整組裝')

const cjkSeeds = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']

function makeContext(plan = 'C') {
  const topics = contract.REQUIRED_TOPICS[plan]
  const people = plan === 'C'
    ? [{ personId: 'person:one', displayName: '授權樣本', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } }]
    : [
        { personId: 'person:one', displayName: '授權樣本一', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
        { personId: 'person:two', displayName: '授權樣本二', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
      ]
  const dates = plan === 'C' ? ['1990-01-01'] : ['1990-01-01', '2012-06-15']
  const ageContexts = dates.map((birthDate, index) => ({
    personId: people[index].personId,
    birthDate,
    ...age.buildAgeContext({ birthDate, asOfDate: '2026-08-09' }),
  }))
  const sourceManifest = [{
    sourceId: 'source:calculator',
    kind: 'calculator',
    title: '合成排盤輸出',
    version: 'git:synthetic',
    inputHash: `sha256:${'a'.repeat(64)}`,
    outputHash: `sha256:${'b'.repeat(64)}`,
  }]
  const facts = topics.flatMap((topic, index) => ['a', 'b'].map((suffix) => ({
    factId: `fact:${topic}:${suffix}`,
    personIds: people.map((person) => person.personId),
    kind: 'calculator_direct',
    sourceId: 'source:calculator',
    sourcePath: `analyses[system=synthetic-${index}-${suffix}]`,
    value: `合成 ${topic} ${suffix}`,
    asOfDate: '2026-08-09',
    evidenceClass: 'traditional_interpretation',
    limitations: ['只用於契約測試'],
  })))
  const base = {
    reportId: `report:assembly-${plan.toLowerCase()}`,
    reportVersion: 1,
    plan,
    locale: 'zh-TW',
    asOfDate: '2026-08-09',
    contextHash: `sha256:${'c'.repeat(64)}`,
    promptVersion: 'consultation-chapter/v1',
    people,
    ageContexts,
    sourceManifest,
    factLedger: { status: 'complete', partialFailures: [], entries: facts },
    topicFactIds: Object.fromEntries(topics.map((topic) => [topic, [`fact:${topic}:a`, `fact:${topic}:b`]])),
  }
  return { base, plan: planner.createConsultationGenerationPlan(base) }
}

function allowedAgeTopicsByPerson(ageContexts) {
  return Object.fromEntries(ageContexts.map((context) => [context.personId, context.allowedTopics]))
}

function rawDraft(job, index, people, ageContexts) {
  const subjectGroups = job.requiredSubjectPersonIds.length > 0
    ? job.requiredSubjectPersonIds
    : [people.map((person) => person.personId)]
  const claimIds = subjectGroups.map((_, subjectIndex) => `claim-${subjectIndex + 1}`)
  const kinds = ['claim', 'scene', 'evidence', 'action', 'reflection', 'timing']
  const charactersPerParagraph = Math.ceil(job.minimumEffectiveCjk / job.minimumParagraphs) + 12
  const paragraphs = Array.from({ length: job.minimumParagraphs }, (_, paragraphIndex) => {
    const localId = `part-${paragraphIndex + 1}`
    const kind = kinds[paragraphIndex % kinds.length]
    return {
      localId,
      kind,
      text: makeNaturalConsultationParagraph(
        index * job.minimumParagraphs + paragraphIndex,
        charactersPerParagraph,
        job.topicId,
        { minorSafe: job.plan === 'G15' },
      ),
      newInformation: [{ kind, localId }],
      claimLocalIds: claimIds,
      factIds: [...job.factIds],
    }
  })
  return {
    title: `章節 ${index + 1}`,
    conclusionSubtitle: `先核對第 ${index + 1} 個生活模式`,
    quickConclusion: `核心結論 ${index + 1}`,
    selfCheck: `最近三次是否出現情境 ${index + 1}`,
    paragraphs,
    claims: subjectGroups.map((subjectPersonIds, subjectIndex) => ({
      localId: claimIds[subjectIndex],
      canonicalParagraphLocalId: 'part-1',
      subjectPersonIds,
      ageTopicByPerson: Object.fromEntries(subjectPersonIds.map((personId) => [
        personId,
        ageContexts.find((context) => context.personId === personId).allowedTopics[0],
      ])),
      supportingFactIds: [...job.factIds],
      opposingFactIds: [],
      evidenceLocalIds: ['main'],
      applicability: '生活經驗能核對時使用',
      invalidation: '連續三次核對不成立就不採用',
      conflictsWithClaimLocalIds: [],
    })),
    evidence: [{
      localId: 'main',
      label: `第 ${index + 1} 章白話依據`,
      type: 'calculator_direct',
      factIds: [...job.factIds],
      claimLocalIds: claimIds,
      limitations: ['只用於契約測試'],
    }],
  }
}

function normalizeAll(context) {
  const sourceByFactId = Object.fromEntries(
    context.base.factLedger.entries.map((fact) => [fact.factId, fact.sourceId]),
  )
  const personIdsByFactId = Object.fromEntries(
    context.base.factLedger.entries.map((fact) => [fact.factId, fact.personIds]),
  )
  const systemByFactId = Object.fromEntries(context.base.factLedger.entries.map((fact) => [
    fact.factId,
    /^analyses\[system=(.+)\]$/u.exec(fact.sourcePath)?.[1] ?? null,
  ]))
  return context.plan.jobs.map((job, index) => assembly.normalizeChapterDraft({
    job,
    rawDraft: rawDraft(job, index, context.base.people, context.base.ageContexts),
    allowedPersonIds: context.base.people.map((person) => person.personId),
    allowedAgeTopicsByPerson: allowedAgeTopicsByPerson(context.base.ageContexts),
    sourceByFactId,
    personIdsByFactId,
    systemByFactId,
    attempt: 1,
  }))
}

const externalAudits = {
  renderer_input_binding: `sha256:${'d'.repeat(64)}`,
  fresh_context: `sha256:${'e'.repeat(64)}`,
  cost_budget: `sha256:${'f'.repeat(64)}`,
}

test('模型章節 ID 全由伺服器命名，且字數、facts、人物與引用都通過才正規化', () => {
  assert(assembly, `組裝模組無法載入: ${loadError?.message || 'unknown error'}`)
  const context = makeContext('C')
  const job = context.plan.jobs[0]
  const normalized = assembly.normalizeChapterDraft({
    job,
    rawDraft: rawDraft(job, 0, context.base.people, context.base.ageContexts),
    allowedPersonIds: ['person:one'],
    allowedAgeTopicsByPerson: allowedAgeTopicsByPerson(context.base.ageContexts),
    sourceByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, 'source:calculator'])),
    personIdsByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, ['person:one']])),
    systemByFactId: Object.fromEntries(job.factIds.map((factId, index) => [factId, `synthetic-0-${index === 0 ? 'a' : 'b'}`])),
    attempt: 1,
  })

  assertEqual(normalized.chapter.chapterId, job.chapterId)
  assertEqual(normalized.paragraphs[0].paragraphId, `paragraph:${job.topicId}:part-1`)
  assertEqual(normalized.claims[0].claimId, `claim:${job.topicId}:claim-1`)
  assertEqual(normalized.evidence[0].evidenceId, `evidence:${job.topicId}:main`)
  assertEqual(normalized.paragraphs[0].fingerprint, contract.createParagraphFingerprint(normalized.paragraphs[0].text))
  assert(/^sha256:[0-9a-f]{64}$/u.test(normalized.receipt.outputHash))
})

test('短章、外來 fact、未知人物與斷裂引用都在組裝前停止', () => {
  const context = makeContext('C')
  const job = context.plan.jobs[0]
  const candidates = []
  const short = rawDraft(job, 0, context.base.people, context.base.ageContexts); short.paragraphs[0].text = '太短'; candidates.push(short)
  const foreignFact = rawDraft(job, 0, context.base.people, context.base.ageContexts); foreignFact.paragraphs[0].factIds = ['fact:foreign']; candidates.push(foreignFact)
  const unknownPerson = rawDraft(job, 0, context.base.people, context.base.ageContexts); unknownPerson.claims[0].subjectPersonIds = ['person:unknown']; candidates.push(unknownPerson)
  const broken = rawDraft(job, 0, context.base.people, context.base.ageContexts); broken.paragraphs[0].claimLocalIds = ['missing']; candidates.push(broken)

  for (const candidate of candidates) {
    let error
    try {
      assembly.normalizeChapterDraft({
        job,
        rawDraft: candidate,
        allowedPersonIds: ['person:one'],
        allowedAgeTopicsByPerson: allowedAgeTopicsByPerson(context.base.ageContexts),
        sourceByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, 'source:calculator'])),
        personIdsByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, ['person:one']])),
        systemByFactId: Object.fromEntries(job.factIds.map((factId, index) => [factId, `synthetic-0-${index === 0 ? 'a' : 'b'}`])),
        attempt: 1,
      })
    } catch (caught) { error = caught }
    assert(error)
    assertEqual(error.name, 'ConsultationChapterDraftError')
  }
})

test('單字灌水、短週期交替與重複句塊即使字數達標也必須拒絕', () => {
  const context = makeContext('C')
  const job = context.plan.jobs[0]
  const candidates = [
    '甲'.repeat(900),
    `${'甲乙丙丁'.repeat(225)}。`,
    '當你面對選擇時，可以先核對生活經驗，再決定下一步。'.repeat(45),
  ]
  for (const badText of candidates) {
    const candidate = rawDraft(job, 0, context.base.people, context.base.ageContexts)
    candidate.paragraphs[0].text = badText
    let error
    try {
      assembly.normalizeChapterDraft({
        job,
        rawDraft: candidate,
        allowedPersonIds: ['person:one'],
        allowedAgeTopicsByPerson: allowedAgeTopicsByPerson(context.base.ageContexts),
        sourceByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, 'source:calculator'])),
        personIdsByFactId: Object.fromEntries(job.factIds.map((factId) => [factId, ['person:one']])),
        systemByFactId: Object.fromEntries(job.factIds.map((factId, index) => [factId, `synthetic-0-${index}`])),
        attempt: 1,
      })
    } catch (caught) { error = caught }
    assert(error)
    assert(error.issues.some((issue) => [
      'paragraph.character_run',
      'paragraph.vocabulary_too_narrow',
      'paragraph.ngram_repetition',
      'paragraph.repeated_clause',
    ].includes(issue.code)))
  }
})

test('十章完成後組裝出五萬字、四層閱讀、claims、evidence、jobs 與九項 audits', () => {
  const context = makeContext('C')
  const report = assembly.assembleConsultationReport({
    ...context.base,
    generationPlan: context.plan,
    drafts: normalizeAll(context),
    externalAuditArtifacts: externalAudits,
  })
  const validation = contract.validateConsultationReportContract(report)

  assertEqual(validation.ok, true, JSON.stringify(validation.issues))
  assert(validation.metrics.effectiveCjkCharacters >= 50_000)
  assertEqual(report.readingLayers.quick_30s.items.length, 3)
  assertEqual(report.chapterJobs.length, 10)
  assertEqual(report.audits.length, contract.REQUIRED_AUDITS.length)
})

test('缺章、重複章或外部 web/pdf 與 fresh-context 收據缺失不得 complete', () => {
  const context = makeContext('C')
  const drafts = normalizeAll(context)
  const candidates = [
    { drafts: drafts.slice(1), audits: externalAudits },
    { drafts: [...drafts, drafts[0]], audits: externalAudits },
    { drafts, audits: { renderer_input_binding: externalAudits.renderer_input_binding } },
  ]

  for (const candidate of candidates) {
    let error
    try {
      assembly.assembleConsultationReport({
        ...context.base,
        generationPlan: context.plan,
        drafts: candidate.drafts,
        externalAuditArtifacts: candidate.audits,
      })
    } catch (caught) { error = caught }
    assert(error)
    assertEqual(error.name, 'ConsultationAssemblyError')
  }
})

test('跨章近似灌水即使每章字數達標也不能被 audit 收據掩蓋', () => {
  const context = makeContext('C')
  const drafts = normalizeAll(context)
  drafts[1].paragraphs[0].text = drafts[0].paragraphs[0].text
  drafts[1].paragraphs[0].fingerprint = contract.createParagraphFingerprint(drafts[1].paragraphs[0].text)
  let error
  try {
    assembly.assembleConsultationReport({
      ...context.base,
      generationPlan: context.plan,
      drafts,
      externalAuditArtifacts: externalAudits,
    })
  } catch (caught) { error = caught }

  assert(error)
  assert(error.issues.some((issue) => issue.code === 'content.near_duplicate' || issue.code === 'paragraph.duplicate_fingerprint'))
})

test('G15 能組裝十萬字，家庭 claim 必須實際跨成員或引用 family_structure fact', () => {
  const context = makeContext('G15')
  const report = assembly.assembleConsultationReport({
    ...context.base,
    generationPlan: context.plan,
    drafts: normalizeAll(context),
    externalAuditArtifacts: externalAudits,
  })
  const validation = contract.validateConsultationReportContract(report)
  assertEqual(validation.ok, true, JSON.stringify(validation.issues))
  assert(validation.metrics.effectiveCjkCharacters >= 100_000)
})

done()
