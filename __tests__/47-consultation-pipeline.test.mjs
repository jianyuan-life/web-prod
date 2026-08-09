import test from 'node:test'
import assert from 'node:assert/strict'
import { makeNaturalConsultationParagraph } from './fixtures/natural-consultation-text.mjs'

let pipeline
let normalizer
let freshReview
let calculatorRequest
let reportContract
let loadError
try {
  pipeline = await import('../lib/consultation/pipeline.ts')
  normalizer = await import('../lib/consultation/calculator-facts.ts')
  freshReview = await import('../lib/consultation/fresh-review.ts')
  calculatorRequest = await import('../lib/consultation/calculator-request.ts')
  reportContract = await import('../lib/consultation/report-contract.ts')
} catch (error) {
  loadError = error
}

function makeCalculatorFacts(personId, marker = '一', birthDate = '1990-01-01') {
  const [year, month, day] = birthDate.split('-').map(Number)
  const requestPayload = calculatorRequest.buildCalculatorRequestPayload({
    name: `合成人物${marker}`, year, month, day, hour: 12, minute: 0,
    gender: 'female', target_year: 2026, as_of: '2026-08-09',
    bazi_school: 'china_mainland', ayanamsa_type: 'lahiri',
  }, { consultationMode: true })
  const requestHash = calculatorRequest.hashCalculatorRequest(requestPayload)
  return normalizer.normalizeCalculatorFacts({
    personId,
    asOfDate: '2026-08-09',
    targetYear: 2026,
    calculatorBundleVersion: 'git:synthetic-calculator',
    responseAttestation: {
      version: 'jianyuan.fly.response.v1',
      releaseId: 'git:synthetic-calculator',
      calculatorCodeSha256: 'd'.repeat(64), keyId: 'test', issuedAt: 1786200000,
      requestHash,
      responseHash: `sha256:${'b'.repeat(64)}`,
      signatureHash: `sha256:${'c'.repeat(64)}`,
    },
    requestPayload,
    requestHash,
    response: {
      systems_count: normalizer.EXPECTED_CALCULATOR_SYSTEMS.length,
      client_data: {
        name: `合成人物${marker}`, birth_date: `${birthDate} 12:00`, gender: '女',
        bazi: `甲子乙丑丙寅丁卯${marker}`, yongshen: `合成喜用木火${marker}`, dayun: `合成大運${marker}`,
        five_elements: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
        five_elements_simple: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
      },
      analyses: normalizer.EXPECTED_CALCULATOR_SYSTEMS.map((system, index) => ({
        system,
        detail: [
          `${normalizer.CALCULATOR_SYSTEM_MARKERS[system].flatMap((term) => [`${term}來源`, `${term}盤面`, `${term}位置`, `${term}界線`, `${term}變化`]).join('、')}。`,
          `${system} 合成結果 ${marker}${index}，保留盤面位置、計算步驟、固定年度與可重新核對欄位。`,
          '盤面依序記錄天干地支、宮位星曜、五行強弱、生剋制化、年月日時、方向節奏、關係資源、壓力反應、學習工作、決策界線與行動觀察。',
          '核對時比較原始輸入、轉換規則、中間盤面、最終摘要、支持線索、反面訊號、適用條件、失效情境、資料缺口與後續日期。',
          '本段只作版本化測試，不作保證、診斷、投資指令、法律判斷或家庭角色推定。',
          '這些測試欄位涵蓋方位、宮位、星曜、五行強弱、生剋制化、年月日時、週期關係、資源界線、壓力轉折、學習步驟、工作節點、決策方法與可觀察的後續訊號。',
        ].join(''),
        good_points: [`可核對線索 ${marker}${index}`],
        improvements: [`改善方向 ${marker}${index}`],
        score: 60 + index,
        sub_summary: `${system} 合成摘要 ${marker}`,
      })),
    },
  })
}

function makeAuthor() {
  return async ({ job, people, facts, ageContexts }) => {
    const index = Array.from(job.topicId).reduce(
      (hash, character) => Math.imul(hash ^ character.codePointAt(0), 16_777_619) >>> 0,
      2_166_136_261,
    )
    const subjectGroups = job.requiredSubjectPersonIds.length > 0
      ? job.requiredSubjectPersonIds
      : [people.map((person) => person.personId)]
    const claimIds = subjectGroups.map((_, claimIndex) => `claim-${claimIndex + 1}`)
    const supportingFacts = subjectGroups.map((subjects) => [...new Set(subjects.flatMap((personId) => {
      const subjectFacts = facts.filter((entry) =>
        entry.personIds.includes(personId) &&
        entry.kind !== 'family_structure' &&
        entry.evidenceClass === 'traditional_interpretation',
      )
      if (subjectFacts.length < 2) throw new Error(`missing independent system anchors for ${personId}`)
      return subjectFacts.map((fact) => fact.factId)
    }))])
    const paragraphFactIds = [...new Set(supportingFacts.flat())]
    const local = job.topicId.replace(/_/gu, '-').slice(0, 50)
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
        newInformation: [{ kind, localId: `${local}-${paragraphIndex + 1}` }],
        claimLocalIds: claimIds,
        factIds: paragraphFactIds,
      }
    })
    return {
      model: 'claude-opus-4-6',
      usage: {
        model: 'claude-opus-4-6',
        promptTokens: 1_000,
        completionTokens: Math.min(job.maxOutputTokens, job.plan === 'G15' ? 12_000 : 7_000),
        reportedCostUsd: 0,
      },
      rawDraft: {
        title: `${job.topicId} 深度章節`,
        conclusionSubtitle: `${job.topicId} 的可核對結論`,
        quickConclusion: `${job.topicId} 先從一件能核對的事情開始`,
        selfCheck: `請核對 ${job.topicId} 是否符合目前生活`,
        paragraphs,
        claims: subjectGroups.map((subjectPersonIds, claimIndex) => ({
          localId: claimIds[claimIndex],
          canonicalParagraphLocalId: 'part-1',
          subjectPersonIds,
          ageTopicByPerson: Object.fromEntries(subjectPersonIds.map((personId) => [
            personId,
            ageContexts.find((context) => context.personId === personId).allowedTopics[0],
          ])),
          supportingFactIds: supportingFacts[claimIndex],
          opposingFactIds: [],
          evidenceLocalIds: ['main'],
          applicability: '當事人能在實際生活中核對時才適用',
          invalidation: '生活經驗不符合時應捨棄本段詮釋',
          conflictsWithClaimLocalIds: [],
        })),
        evidence: [{
          localId: 'main',
          label: `${job.topicId} 的白話依據`,
          type: 'traditional_interpretation',
          factIds: paragraphFactIds,
          claimLocalIds: claimIds,
          limitations: ['命理詮釋只作反思線索'],
        }],
      },
    }
  }
}

function makeMemoryCostStore() {
  let ledger = null
  let version = 0
  return {
    async load() {
      return { ledger: ledger ? structuredClone(ledger) : null, version }
    },
    async save(input) {
      if (input.expectedVersion !== version) throw new Error('synthetic CAS conflict')
      ledger = structuredClone(input.ledger)
      version += 1
      return { version }
    },
  }
}

function makeMemoryChapterStore() {
  const drafts = new Map()
  return {
    async load() {
      return [...drafts.values()].map((draft) => structuredClone(draft))
    },
    async save(_reportId, draft) {
      const key = draft.receipt.idempotencyKey
      const existing = drafts.get(key)
      if (existing && JSON.stringify(existing) !== JSON.stringify(draft)) {
        throw new Error('synthetic chapter idempotency conflict')
      }
      drafts.set(key, structuredClone(draft))
    },
  }
}

function makeDependencies(overrides = {}) {
  return {
    costLedgerStore: makeMemoryCostStore(),
    chapterDraftStore: makeMemoryChapterStore(),
    authorChapter: makeAuthor(),
    freshContextReview: async () => ({
      approved: true,
      artifactHash: `sha256:${'a'.repeat(64)}`,
      issues: [],
      usage: { model: 'gemini-3.1-pro-preview', promptTokens: 1_000, completionTokens: 100, reportedCostUsd: 0 },
    }),
    rendererInputBindingAttestation: async (input) => freshReview.createRendererInputBindingAttestation({
      releaseInputBindingReceipt: `sha256:${'b'.repeat(64)}`,
      ...input,
    }),
    ...overrides,
  }
}

test('C 會依固定十主題分章，完成五萬字、年齡契約、facts、claims 與外部收據', async () => {
  assert.ok(pipeline, `pipeline 模組無法載入: ${loadError?.message || 'unknown error'}`)
  const factsByTopic = new Map()
  let reviewInput
  const author = makeAuthor()
  const report = await pipeline.generateConsultationReport({
    reportId: 'report:synthetic-c-runtime',
    reportVersion: 1,
    plan: 'C',
    asOfDate: '2026-08-09',
    promptVersion: 'consultation-v1-test',
    people: [{
      personId: 'person:one',
      displayName: '合成人物一',
      birthDate: '1990-01-01',
      authorization: 'granted',
      calculatorFacts: makeCalculatorFacts('person:one', '一'),
    }],
  }, makeDependencies({
    authorChapter: async (input) => {
      factsByTopic.set(input.job.topicId, [...input.job.factIds])
      return author(input)
    },
    freshContextReview: async (input) => {
      reviewInput = input
      return {
        approved: true,
        artifactHash: `sha256:${'a'.repeat(64)}`,
        issues: [],
        usage: { model: 'gemini-3.1-pro-preview', promptTokens: 1_000, completionTokens: 100, reportedCostUsd: 0 },
      }
    },
  }))

  assert.equal(report.plan, 'C')
  assert.equal(report.chapters.length, 10)
  assert.ok(report.paragraphs.reduce((sum, paragraph) => sum + (paragraph.text.match(/[\u3400-\u9fff]/gu)?.length ?? 0), 0) >= 50_000)
  assert.equal(report.audits.find((audit) => audit.kind === 'fresh_context').artifactHash, `sha256:${'a'.repeat(64)}`)
  assert.equal(report.ageContexts[0].ageYears, 36)
  assert.equal(report.rendererBinding.contentHash.startsWith('sha256:'), true)
  assert.equal(
    report.audits.find((audit) => audit.kind === 'renderer_input_binding').artifactHash,
    report.rendererBinding.artifactHash,
  )
  const tampered = structuredClone(report)
  tampered.readingLayers.quick_30s.items[0].conclusion += '遭竄改'
  const tamperedValidation = reportContract.validateConsultationReportContract(tampered)
  assert.equal(tamperedValidation.ok, false)
  assert.ok(tamperedValidation.issues.some((issue) => issue.code === 'renderer.binding_mismatch'))
  assert.notDeepEqual(factsByTopic.get('core_pattern'), factsByTopic.get('money_resources'))
  assert.ok(factsByTopic.get('stress_response').some((factId) => factId.includes('塔羅牌')))
  assert.ok(factsByTopic.get('work_learning').every((factId) => !factId.includes('塔羅牌')))
  assert.equal(reviewInput.asOfDate, '2026-08-09')
  assert.equal(reviewInput.ageContexts[0].stage, 'early_mid')
})

test('G15 合併三人 facts 時 ID 不碰撞，並加入購買者授權聲明的家庭結構事實', async () => {
  const people = [
    ['person:one', '合成人物一', '1990-01-01', '一'],
    ['person:two', '合成人物二', '1988-10-10', '二'],
    ['person:three', '合成人物三', '2012-06-15', '三'],
  ].map(([personId, displayName, birthDate, marker]) => ({
    personId,
    displayName,
    birthDate,
    authorization: 'granted',
    calculatorFacts: makeCalculatorFacts(personId, marker, birthDate),
  }))
  const report = await pipeline.generateConsultationReport({
    reportId: 'report:synthetic-g15-runtime',
    reportVersion: 1,
    plan: 'G15',
    asOfDate: '2026-08-09',
    promptVersion: 'consultation-v1-test',
    people,
    familyStructure: {
      purchaserAttestedPersonIds: people.map((person) => person.personId),
      statedRelationships: ['購買者聲明已取得三位成員同意，共同檢視溝通與資源安排'],
      consultationGoals: ['建立可練習的家庭會議方式'],
    },
  }, makeDependencies({
    freshContextReview: async (input) => {
      for (const draft of input.drafts) {
        for (const claim of draft.claims) {
          assert.ok(claim.subjectPersonIds.every((personId) =>
            claim.supportingFactIds.some((factId) =>
              input.facts.find((fact) => fact.factId === factId)?.kind !== 'family_structure' &&
              input.facts.find((fact) => fact.factId === factId)?.personIds.includes(personId),
            ),
          ), `missing subject fact coverage: ${JSON.stringify(claim)}`)
        }
      }
      return {
        approved: true,
        artifactHash: `sha256:${'a'.repeat(64)}`,
        issues: [],
        usage: { model: 'gemini-3.1-pro-preview', promptTokens: 1_000, completionTokens: 100, reportedCostUsd: 0 },
      }
    },
  }))

  assert.equal(report.plan, 'G15')
  assert.ok(report.paragraphs.reduce((sum, paragraph) => sum + (paragraph.text.match(/[\u3400-\u9fff]/gu)?.length ?? 0), 0) >= 100_000)
  assert.equal(new Set(report.factLedger.entries.map((fact) => fact.factId)).size, report.factLedger.entries.length)
  const familyFact = report.factLedger.entries.find((fact) => fact.kind === 'family_structure')
  assert.ok(familyFact)
  assert.equal(familyFact.evidenceClass, 'client_supplied')
  assert.equal(new Set(familyFact.personIds).size, 3)
})

test('held 系統不進任何章節 prompt，fresh review 或 renderer input binding 未過都 fail closed', async () => {
  const input = {
    reportId: 'report:synthetic-hold',
    reportVersion: 1,
    plan: 'C',
    asOfDate: '2026-08-09',
    promptVersion: 'consultation-v1-test',
    people: [{
      personId: 'person:one', displayName: '合成人物一', birthDate: '1990-01-01',
      authorization: 'granted', calculatorFacts: makeCalculatorFacts('person:one', '一'),
    }],
  }
  let sawHeld = false
  const authorChapter = async (args) => {
    sawHeld ||= args.job.factIds.some((factId) => factId.includes('九星氣學'))
    return makeAuthor()(args)
  }
  await pipeline.generateConsultationReport(input, makeDependencies({ authorChapter }))
  assert.equal(sawHeld, false)

  for (const dependencies of [
    makeDependencies({ freshContextReview: async () => ({
      approved: false,
      artifactHash: `sha256:${'c'.repeat(64)}`,
      issues: ['矛盾'],
      usage: { model: 'gemini-3.1-pro-preview', promptTokens: 1_000, completionTokens: 100, reportedCostUsd: 0 },
    }) }),
    makeDependencies({ rendererInputBindingAttestation: async () => ({ passed: false, artifactHash: `sha256:${'d'.repeat(64)}` }) }),
  ]) {
    let error
    try { await pipeline.generateConsultationReport(input, dependencies) } catch (caught) { error = caught }
    assert.ok(error, '外部驗收未過時必須停止')
    assert.equal(error.name, 'ConsultationPipelineError')
  }
})

test('章節輸出未過硬閘會帶著具體問題重寫，最多三次且不接受半套內容', async () => {
  const attempts = []
  const priorIssuesSeen = []
  const authorChapter = async (args) => {
    attempts.push(`${args.job.topicId}:${args.attempt}`)
    priorIssuesSeen.push([...args.priorIssues])
    const valid = await makeAuthor()(args)
    if (args.job.topicId === 'core_pattern' && args.attempt === 1) {
      valid.rawDraft.paragraphs[0].text = '太短'
    }
    return valid
  }
  const report = await pipeline.generateConsultationReport({
    reportId: 'report:synthetic-repair', reportVersion: 1, plan: 'C',
    asOfDate: '2026-08-09', promptVersion: 'consultation-v1-test',
    people: [{
      personId: 'person:one', displayName: '合成人物一', birthDate: '1990-01-01',
      authorization: 'granted', calculatorFacts: makeCalculatorFacts('person:one', '一'),
    }],
  }, makeDependencies({ authorChapter }))

  assert.deepEqual(attempts.slice(0, 2), ['core_pattern:1', 'core_pattern:2'])
  assert.ok(priorIssuesSeen[1].some((issue) => /too_short|有效 CJK/u.test(issue)))
  assert.equal(report.chapterJobs.find((receipt) => receipt.chapterId === 'chapter:core_pattern').attempt, 2)
})

test('相同 reportId 重入會延續成本台帳並重用已驗證章節，不重燒十章費用', async () => {
  const costLedgerStore = makeMemoryCostStore()
  const chapterDraftStore = makeMemoryChapterStore()
  const input = {
    reportId: 'report:synthetic-resume-c',
    reportVersion: 1,
    plan: 'C',
    asOfDate: '2026-08-09',
    promptVersion: 'consultation-v1-test',
    people: [{
      personId: 'person:one', displayName: '合成人物一', birthDate: '1990-01-01',
      authorization: 'granted', calculatorFacts: makeCalculatorFacts('person:one', '一'),
    }],
  }
  let authorCalls = 0
  const author = makeAuthor()
  await pipeline.generateConsultationReport(input, makeDependencies({
    costLedgerStore,
    chapterDraftStore,
    authorChapter: async (args) => {
      authorCalls += 1
      return author(args)
    },
  }))
  const firstLedger = await costLedgerStore.load(input.reportId)
  assert.equal(authorCalls, 10)
  assert.ok(firstLedger.ledger.actualUsd > 0)

  await pipeline.generateConsultationReport(input, makeDependencies({
    costLedgerStore,
    chapterDraftStore,
    authorChapter: async () => {
      throw new Error('已持久化章節不應再次呼叫主筆')
    },
  }))
  const secondLedger = await costLedgerStore.load(input.reportId)
  assert.equal(authorCalls, 10)
  assert.ok(secondLedger.ledger.actualUsd > firstLedger.ledger.actualUsd)
  assert.equal((await chapterDraftStore.load(input.reportId)).length, 10)
})
