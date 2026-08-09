import { suite, test, assert, assertEqual, assertIncludes, done } from './harness.mjs'
import { buildAgeContext, serializeAgeContext } from '../lib/consultation/age-context.ts'

function assertThrowsWithMessage(fn, pattern) {
  let thrown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  assert(thrown instanceof Error, '預期函式拋出錯誤')
  assert(pattern.test(thrown.message), `錯誤訊息不符合 ${pattern}: ${thrown.message}`)
}

suite('AgeContext 精確年齡契約')

test('當年生日未到時不得提前加歲', () => {
  const context = buildAgeContext({
    birthDate: '2000-08-10',
    asOfDate: '2026-08-09',
  })

  assertEqual(context.ageYears, 25)
})

test('報告基準日由呼叫端固定，相同輸入重跑不漂移', () => {
  const input = { birthDate: '2000-08-10', asOfDate: '2026-08-09' }
  const first = buildAgeContext(input)
  const rerun = buildAgeContext(input)

  assertEqual(first.asOfDate, '2026-08-09')
  assertEqual(JSON.stringify(rerun), JSON.stringify(first))
})

test('缺少固定 asOfDate 時 fail closed，不得偷取系統現在時間', () => {
  assertThrowsWithMessage(
    () => buildAgeContext({ birthDate: '2000-08-10' }),
    /asOfDate.*YYYY-MM-DD/,
  )
})

test('不可能的出生日期必須 fail closed', () => {
  assertThrowsWithMessage(
    () => buildAgeContext({ birthDate: '2023-02-29', asOfDate: '2026-08-09' }),
    /birthDate.*valid Gregorian calendar date/,
  )
})

test('出生日晚於報告基準日時 fail closed，不輸出負年齡', () => {
  assertThrowsWithMessage(
    () => buildAgeContext({ birthDate: '2026-08-10', asOfDate: '2026-08-09' }),
    /birthDate.*after asOfDate/,
  )
})

test('0–6 歲幼兒由照顧者閱讀，只開放發展主題並禁止定型', () => {
  const context = buildAgeContext({ birthDate: '2022-08-09', asOfDate: '2026-08-09' })

  assertEqual(context.stage, 'toddler')
  assertEqual(context.readerMode, 'guardian')
  assertEqual(context.timeHorizonEndAge, 12)
  assertIncludes(context.allowedTopics, 'attachment_and_care_environment')
  assertIncludes(context.prohibitedTopics, 'deterministic_labeling')
  assertIncludes(context.prohibitedTopics, 'parental_surveillance')
})

test('八個生命階段在 6→7、12→13、17→18、30→31、40→41、50→51、60→61 邊界正確切換', () => {
  const cases = [
    ['2020-08-09', 'toddler'],
    ['2019-08-09', 'child'],
    ['2014-08-09', 'child'],
    ['2013-08-09', 'teen'],
    ['2009-08-09', 'teen'],
    ['2008-08-09', 'young_adult'],
    ['1996-08-09', 'young_adult'],
    ['1995-08-09', 'early_mid'],
    ['1986-08-09', 'early_mid'],
    ['1985-08-09', 'mid'],
    ['1976-08-09', 'mid'],
    ['1975-08-09', 'pre_senior'],
    ['1966-08-09', 'pre_senior'],
    ['1965-08-09', 'elder'],
  ]

  for (const [birthDate, expectedStage] of cases) {
    const actual = buildAgeContext({ birthDate, asOfDate: '2026-08-09' }).stage
    assertEqual(actual, expectedStage, `${birthDate} 應是 ${expectedStage}`)
  }
})

test('每個階段都同時控制讀者、主題、時間視野與硬禁區', () => {
  const cases = [
    ['2016-08-09', 'guardian', 25, 'learning_style', 'adult_workplace'],
    ['2011-08-09', 'co-read', 30, 'identity', 'marriage_matching'],
    ['2001-08-09', 'self', 45, 'professional_foundation', 'pressure_to_marry'],
    ['1991-08-09', 'self', 60, 'resource_allocation', 'assume_marriage_children_or_mortgage'],
    ['1981-08-09', 'self', 70, 'intergenerational_care', 'midlife_crisis_fear'],
    ['1971-08-09', 'self', 75, 'work_and_retirement_options', 'retirement_as_inevitable'],
    ['1961-08-09', 'self', 75, 'legacy', 'lifespan_prediction'],
  ]

  for (const [birthDate, readerMode, horizon, allowedTopic, prohibitedTopic] of cases) {
    const context = buildAgeContext({ birthDate, asOfDate: '2026-08-09' })
    assertEqual(context.readerMode, readerMode, `${context.stage} readerMode`)
    assertEqual(context.timeHorizonEndAge, horizon, `${context.stage} time horizon`)
    assertIncludes(context.allowedTopics, allowedTopic, `${context.stage} allowed topic`)
    assertIncludes(context.prohibitedTopics, prohibitedTopic, `${context.stage} prohibited topic`)
  }
})

test('生日前一天、生日當天、生日後一天的實足年齡只切換一次', () => {
  const birthDate = '2000-08-10'
  assertEqual(buildAgeContext({ birthDate, asOfDate: '2026-08-09' }).ageYears, 25)
  assertEqual(buildAgeContext({ birthDate, asOfDate: '2026-08-10' }).ageYears, 26)
  assertEqual(buildAgeContext({ birthDate, asOfDate: '2026-08-11' }).ageYears, 26)
})

test('2 月 29 日出生者在非閏年以 3 月 1 日為年齡切換點', () => {
  const birthDate = '2000-02-29'
  assertEqual(buildAgeContext({ birthDate, asOfDate: '2026-02-28' }).ageYears, 25)
  assertEqual(buildAgeContext({ birthDate, asOfDate: '2026-03-01' }).ageYears, 26)
})

test('只接受無時區的日曆日，拒絕時間戳在時區間跨日', () => {
  assertThrowsWithMessage(
    () => buildAgeContext({
      birthDate: '2000-08-10T23:30:00-12:00',
      asOfDate: '2026-08-09',
    }),
    /birthDate.*YYYY-MM-DD/,
  )
  assertThrowsWithMessage(
    () => buildAgeContext({
      birthDate: '2000-08-10',
      asOfDate: '2026-08-09T00:30:00\+14:00',
    }),
    /asOfDate.*YYYY-MM-DD/,
  )
})

test('三次 Call、fallback、Web 與 PDF 共用同一個欄位順序的年齡契約', () => {
  const input = { birthDate: '2011-08-09', asOfDate: '2026-08-09' }
  const surfaces = ['call-1', 'call-2', 'call-3', 'fallback', 'web', 'pdf']
  const serialized = surfaces.map(() => serializeAgeContext(buildAgeContext(input)))

  for (const value of serialized) assertEqual(value, serialized[0])
  assertEqual(
    Object.keys(JSON.parse(serialized[0])).join(','),
    'asOfDate,ageYears,stage,readerMode,timeHorizonEndAge,allowedTopics,prohibitedTopics',
  )
})

test('所有未成年階段都禁止監控、貼標籤、自我實現預言與把修復責任丟給孩子', () => {
  const minors = ['2022-08-09', '2016-08-09', '2011-08-09']
  const requiredProhibitions = [
    'parental_surveillance',
    'deterministic_labeling',
    'self_fulfilling_prediction',
    'deterministic_education_or_career_prediction',
    'minor_responsible_for_family_repair',
    'expose_minor_sensitive_assessment',
  ]

  for (const birthDate of minors) {
    const context = buildAgeContext({ birthDate, asOfDate: '2026-08-09' })
    for (const prohibition of requiredProhibitions) {
      assertIncludes(context.prohibitedTopics, prohibition, `${context.stage} 缺少 ${prohibition}`)
    }
  }
})

test('缺出生日或不可能的基準日同樣 fail closed', () => {
  assertThrowsWithMessage(
    () => buildAgeContext({ asOfDate: '2026-08-09' }),
    /birthDate.*YYYY-MM-DD/,
  )
  assertThrowsWithMessage(
    () => buildAgeContext({ birthDate: '2000-08-10', asOfDate: '2026-04-31' }),
    /asOfDate.*valid Gregorian calendar date/,
  )
})

test('每次建立都回傳獨立陣列，單一成員不會污染家庭其他成員', () => {
  const input = { birthDate: '2011-08-09', asOfDate: '2026-08-09' }
  const firstMember = buildAgeContext(input)
  firstMember.prohibitedTopics.push('injected_by_consumer')
  firstMember.allowedTopics.push('injected_by_consumer')

  const secondMember = buildAgeContext(input)
  assert(!secondMember.prohibitedTopics.includes('injected_by_consumer'))
  assert(!secondMember.allowedTopics.includes('injected_by_consumer'))
})

test('成年後改為本人閱讀，但不得臆測婚姻、性別角色、職業、財產或子女', () => {
  const context = buildAgeContext({ birthDate: '2008-08-09', asOfDate: '2026-08-09' })
  assertEqual(context.ageYears, 18)
  assertEqual(context.readerMode, 'self')
  for (const prohibition of [
    'assume_marriage',
    'assume_gender_role',
    'assume_career',
    'assume_property',
    'assume_children',
  ]) {
    assertIncludes(context.prohibitedTopics, prohibition)
  }
  assert(!context.prohibitedTopics.includes('parental_surveillance'))
})

done()
