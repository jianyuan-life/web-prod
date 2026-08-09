import { suite, test, assert, assertEqual, done } from './harness.mjs'

let planner
let age
let contract
let loadError
try {
  planner = await import('../lib/consultation/generation-plan.ts')
  age = await import('../lib/consultation/age-context.ts')
  contract = await import('../lib/consultation/report-contract.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 分章生成與續跑計畫')

function makeInput(plan = 'C') {
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
  const facts = topics.map((topic, index) => ({
    factId: `fact:${topic}`,
    personIds: people.map((person) => person.personId),
    kind: plan === 'G15' ? 'family_structure' : 'calculator_direct',
    sourceId: 'source:calculator',
    sourcePath: `analyses.${topic}`,
    value: { observation: `只屬於 ${topic} 的可核對資料`, sequence: index },
    asOfDate: '2026-08-09',
    evidenceClass: plan === 'G15' ? 'client_supplied' : 'traditional_interpretation',
    limitations: ['只能作為反思線索'],
  }))

  return {
    reportId: `report:plan-${plan.toLowerCase()}`,
    reportVersion: 1,
    plan,
    locale: 'zh-TW',
    asOfDate: '2026-08-09',
    contextHash: `sha256:${'a'.repeat(64)}`,
    promptVersion: 'consultation-chapter/v1',
    people,
    ageContexts,
    factLedger: { status: 'complete', partialFailures: [], entries: facts },
    topicFactIds: Object.fromEntries(topics.map((topic) => [topic, [`fact:${topic}`]])),
  }
}

test('C 固定拆成必要主題工作且字數預算總和至少五萬', () => {
  assert(planner, `生成計畫模組無法載入: ${loadError?.message || 'unknown error'}`)
  const plan = planner.createConsultationGenerationPlan(makeInput('C'))

  assertEqual(plan.jobs.length, contract.REQUIRED_TOPICS.C.length)
  assertEqual(plan.totalMinimumEffectiveCjk, 50_000)
  assert(plan.jobs.every((job) => job.minimumEffectiveCjk === 5_000))
  assertEqual(plan.jobs.map((job) => job.topicId).join(','), contract.REQUIRED_TOPICS.C.join(','))
})

test('三人以上 G15 仍以十萬有效字為最低完整度，不用單次模型輸出硬撐', () => {
  const input = makeInput('G15')
  input.people.push({ personId: 'person:three', displayName: '授權樣本三', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } })
  const birthDate = '1988-10-10'
  input.ageContexts.push({
    personId: 'person:three',
    birthDate,
    ...age.buildAgeContext({ birthDate, asOfDate: input.asOfDate }),
  })
  input.factLedger.entries.forEach((fact) => fact.personIds.push('person:three'))

  const plan = planner.createConsultationGenerationPlan(input)
  assertEqual(plan.jobs.length, contract.REQUIRED_TOPICS.G15.length)
  assertEqual(plan.totalMinimumEffectiveCjk, 100_000)
  assert(plan.jobs.every((job) => job.minimumEffectiveCjk === 10_000))
})

test('每個章節 prompt 只拿該章綁定 facts，並帶固定基準日與年齡讀者契約', () => {
  const plan = planner.createConsultationGenerationPlan(makeInput('C'))
  const first = plan.jobs[0]

  assert(first.userPrompt.includes('2026-08-09'))
  assert(first.userPrompt.includes('analyses.core_pattern'))
  assert(!first.userPrompt.includes('analyses.money_resources'))
  assert(first.userPrompt.includes('early_mid'))
  assert(first.systemPrompt.includes('繁體中文'))
  assert(first.systemPrompt.includes('可核對'))
  for (const requiredKey of ['quickConclusion', 'selfCheck', 'paragraphs', 'claims', 'evidence', 'supportingFactIds']) {
    assert(first.systemPrompt.includes(requiredKey), `system prompt 缺結構化欄位 ${requiredKey}`)
  }
  assert(first.systemPrompt.includes('只輸出一個 JSON 物件'))
})

test('相同 immutable context 產生相同 job key 與 hash，基準日改變必全數失效', () => {
  const first = planner.createConsultationGenerationPlan(makeInput('C'))
  const second = planner.createConsultationGenerationPlan(makeInput('C'))
  const changedInput = makeInput('C')
  changedInput.asOfDate = '2026-08-10'
  changedInput.ageContexts = changedInput.ageContexts.map((context) => ({
    personId: context.personId,
    birthDate: context.birthDate,
    ...age.buildAgeContext({ birthDate: context.birthDate, asOfDate: '2026-08-10' }),
  }))
  changedInput.factLedger.entries.forEach((fact) => { fact.asOfDate = '2026-08-10' })
  const changed = planner.createConsultationGenerationPlan(changedInput)

  assertEqual(first.jobs[0].idempotencyKey, second.jobs[0].idempotencyKey)
  assertEqual(first.jobs[0].inputHash, second.jobs[0].inputHash)
  assert(first.jobs[0].inputHash !== changed.jobs[0].inputHash)
  assert(first.jobs[0].idempotencyKey !== changed.jobs[0].idempotencyKey)
})

test('缺 topic facts、foreign fact、partial failure 或未授權人物全部在花模型費前停止', () => {
  const missing = makeInput('C')
  delete missing.topicFactIds.core_pattern
  const foreign = makeInput('C')
  foreign.topicFactIds.core_pattern = ['fact:not-found']
  const partial = makeInput('C')
  partial.factLedger.partialFailures.push('calculator timeout')
  const unauthorized = makeInput('C')
  unauthorized.people[0].authorization = 'missing'

  for (const candidate of [missing, foreign, partial, unauthorized]) {
    let error
    try { planner.createConsultationGenerationPlan(candidate) } catch (caught) { error = caught }
    assert(error, '不完整輸入必須拋出計畫錯誤')
    assertEqual(error.name, 'ConsultationGenerationPlanError')
  }
})

test('E3 與其他方案不能進入 C／G15 新生成器', () => {
  const candidate = makeInput('C')
  candidate.plan = 'E3'
  let error
  try { planner.createConsultationGenerationPlan(candidate) } catch (caught) { error = caught }
  assert(error)
  assert(error.issues.some((item) => item.code === 'plan.unsupported'))
})

test('續跑只略過 key、prompt hash、input hash、output hash 都吻合的成功工作', () => {
  const plan = planner.createConsultationGenerationPlan(makeInput('C'))
  const completed = plan.jobs.slice(0, 2).map((job, index) => ({
    jobId: `job:done-${index}`,
    chapterId: job.chapterId,
    idempotencyKey: job.idempotencyKey,
    status: 'succeeded',
    attempt: 1,
    promptVersionHash: job.promptVersionHash,
    inputHash: job.inputHash,
    outputHash: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
  }))
  const stale = { ...completed[1], inputHash: `sha256:${'f'.repeat(64)}` }

  const pending = planner.selectPendingChapterJobs(plan, [completed[0], stale])
  assertEqual(pending.length, plan.jobs.length - 1)
  assert(!pending.some((job) => job.chapterId === completed[0].chapterId))
  assert(pending.some((job) => job.chapterId === completed[1].chapterId))
})

done()
