import { suite, test, assert, assertEqual, done } from './harness.mjs'

let audits
let loadError
try {
  audits = await import('../lib/consultation/report-audits.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 諮詢報告可重跑硬稽核')

const paragraph = (paragraphId, text, claimIds = [], subjectPersonIds = []) => ({
  paragraphId,
  text,
  claimIds,
  subjectPersonIds,
})

test('年份干支使用公曆年換算，2026 至 2028 錨點不可漂移', () => {
  assert(audits, `稽核模組無法載入: ${loadError?.message || 'unknown error'}`)
  assertEqual(audits.getGanzhiYear(2026), '丙午')
  assertEqual(audits.getGanzhiYear(2027), '丁未')
  assertEqual(audits.getGanzhiYear(2028), '戊申')
})

test('同一句把 2028 寫成丙午必須 hard fail，正確戊申不誤報', () => {
  const issues = audits.auditTemporalClaims([
    paragraph('paragraph:wrong', '談到 2028 年流年丙午時，先觀察工作節奏。'),
    paragraph('paragraph:right', '談到 2028 年戊申流年時，先觀察工作節奏。'),
  ])

  assertEqual(issues.length, 1)
  assertEqual(issues[0].code, 'temporal.ganzhi_mismatch')
  assertEqual(issues[0].paragraphIds[0], 'paragraph:wrong')
  assert(issues[0].message.includes('戊申'))
})

test('目前年齡、基準日與未來討論範圍都由結構化 AgeContext 重算', () => {
  const ageContexts = [{
    personId: 'person:one',
    birthDate: '1990-08-10',
    asOfDate: '2026-08-09',
    ageYears: 35,
    timeHorizonEndAge: 60,
  }]
  const claimLedger = { entries: [{ claimId: 'claim:one', subjectPersonIds: ['person:one'] }] }
  const issues = audits.auditTemporalClaims([
    paragraph('paragraph:age', '你目前 36 歲，先整理眼前的責任。', ['claim:one']),
    paragraph('paragraph:asof', '截至 2026 年 8 月 8 日，先看已發生的生活經驗。', ['claim:one']),
    paragraph('paragraph:horizon-age', '到了 70 歲時，可以回頭檢查這個安排。', ['claim:one']),
    paragraph('paragraph:horizon-year', '2060 年將進入另一段需要重新分配資源的時期。', ['claim:one']),
    paragraph('paragraph:invalid-date', '2026 年 2 月 31 日可以安排回顧。', ['claim:one']),
  ], ageContexts, claimLedger)

  for (const code of [
    'temporal.current_age_mismatch',
    'temporal.as_of_mismatch',
    'temporal.age_horizon_exceeded',
    'temporal.year_horizon_exceeded',
    'temporal.date_invalid',
  ]) {
    assert(issues.some((entry) => entry.code === code), `缺少 ${code}`)
  }
})

test('正確年齡、基準日與範圍內年份不誤報', () => {
  const ageContexts = [{
    personId: 'person:one',
    birthDate: '1990-08-10',
    asOfDate: '2026-08-09',
    ageYears: 35,
    timeHorizonEndAge: 60,
  }]
  const claimLedger = { entries: [{ claimId: 'claim:one', subjectPersonIds: ['person:one'] }] }
  const issues = audits.auditTemporalClaims([
    paragraph('paragraph:right', '截至 2026 年 8 月 9 日，你目前 35 歲；到了 45 歲時仍可重新檢查，2035 年也可以視生活變化調整。', ['claim:one']),
  ], ageContexts, claimLedger)
  assertEqual(issues.length, 0, JSON.stringify(issues))
})

test('近似改寫的長段落仍視為灌水，真正不同內容可並存', () => {
  const shared = '遇到事情時，你通常會先把資料整理清楚，再決定要不要回應。這個習慣在資訊混亂時能保護判斷，但在需要即時協作時也可能讓旁人誤以為你沒有表態。'
  const issues = audits.auditNearDuplicates([
    paragraph('paragraph:one', shared.repeat(3)),
    paragraph('paragraph:two', `${shared.repeat(3)}請把觀察期限寫下來。`),
    paragraph('paragraph:three', '如果討論金錢，先約定誰能決定、金額上限和多久後重新檢查；這一段處理的是權責，不是人格。'.repeat(3)),
  ])

  assertEqual(issues.length, 1)
  assertEqual(issues[0].code, 'content.near_duplicate')
  assertEqual(issues[0].paragraphIds.join(','), 'paragraph:one,paragraph:two')
})

test('人讀報告不得出現流程詞、JSON、評分殘留、Markdown 或 emoji', () => {
  const issues = audits.auditHumanLanguage([
    paragraph('paragraph:machine', 'facts ledger 驗證通過，schema 已完成，以下是 **STEP 1** ✅'),
    paragraph('paragraph:human', '先看你現在最在意的問題，再決定哪一章值得深讀。'),
  ])

  assert(issues.some((issue) => issue.code === 'language.machine_process'))
  assert(issues.some((issue) => issue.code === 'language.markdown_residue'))
  assert(issues.some((issue) => issue.code === 'language.emoji'))
})

test('決定論、個人化投資比例、醫療定論與性別推定家庭角色都必須攔截', () => {
  const issues = audits.auditHighRiskLanguage([
    paragraph('paragraph:deterministic', '你注定無法維持長久關係。'),
    paragraph('paragraph:finance', '你必須把 70% 資產投入股票，並使用三倍槓桿。'),
    paragraph('paragraph:medical', '命盤證明你一定會罹患心臟病。'),
    paragraph('paragraph:role', '第二位女性就是家中的母親，因此她要負責照顧。'),
  ])

  assert(issues.some((issue) => issue.code === 'safety.deterministic_claim'))
  assert(issues.some((issue) => issue.code === 'safety.personal_financial_instruction'))
  assert(issues.some((issue) => issue.code === 'safety.medical_diagnosis'))
  assert(issues.some((issue) => issue.code === 'safety.inferred_family_role'))
})

test('具體買賣標的、命理疾病斷言與個案法律指令會攔截，風險提醒不誤報', () => {
  const issues = audits.auditHighRiskLanguage([
    paragraph('paragraph:trade', '你應該明天賣掉所有基金，改買比特幣。'),
    paragraph('paragraph:disease', '從八字可以看出你有糖尿病。'),
    paragraph('paragraph:legal', '這場官司你可以直接認罪，不用先找律師。'),
    paragraph('paragraph:safe', '不要因命理內容賣掉基金或改買比特幣；疾病請找醫師，官司請先找律師。'),
  ])

  assert(issues.some((issue) => issue.code === 'safety.personal_financial_instruction' && issue.paragraphIds[0] === 'paragraph:trade'))
  assert(issues.some((issue) => issue.code === 'safety.medical_diagnosis' && issue.paragraphIds[0] === 'paragraph:disease'))
  assert(issues.some((issue) => issue.code === 'safety.personal_legal_instruction' && issue.paragraphIds[0] === 'paragraph:legal'))
  assert(!issues.some((issue) => issue.paragraphIds[0] === 'paragraph:safe'))
})

test('未成年人的婚配、投資與承擔家庭修復內容會依 claim 對象停止交付', () => {
  const report = {
    ageContexts: [
      { personId: 'person:minor', ageYears: 12 },
      { personId: 'person:adult', ageYears: 36 },
    ],
    claimLedger: {
      entries: [
        { claimId: 'claim:minor', subjectPersonIds: ['person:minor'] },
        { claimId: 'claim:adult', subjectPersonIds: ['person:adult'] },
      ],
    },
    paragraphs: [
      paragraph('paragraph:minor', '他未來最適合早婚，現在也應學會承擔修復全家的責任。', ['claim:minor']),
      paragraph('paragraph:adult', '成年人可以自行決定是否談婚姻，也能先做低風險的溝通實驗。', ['claim:adult']),
    ],
  }

  const issues = audits.auditAgeSafety(report)
  assertEqual(issues.length, 1)
  assertEqual(issues[0].code, 'age.minor_adult_topic')
  assertEqual(issues[0].paragraphIds[0], 'paragraph:minor')
})

test('各生命階段的婚產投資、親人死亡與壽命禁區都由 subject claim 執行', () => {
  const report = {
    ageContexts: [
      { personId: 'person:child', ageYears: 12, stage: 'child', prohibitedTopics: ['marriage_matching', 'investment_instruction', 'deterministic_future'] },
      { personId: 'person:mid', ageYears: 48, stage: 'mid', prohibitedTopics: ['parental_death_prediction'] },
      { personId: 'person:elder', ageYears: 72, stage: 'elder', prohibitedTopics: ['lifespan_prediction'] },
    ],
    claimLedger: { entries: [
      { claimId: 'claim:child', subjectPersonIds: ['person:child'] },
      { claimId: 'claim:mid', subjectPersonIds: ['person:mid'] },
      { claimId: 'claim:elder', subjectPersonIds: ['person:elder'] },
    ] },
    paragraphs: [
      paragraph('paragraph:child-future', '到了二十五歲會結婚，成年後會持有兩間房產。', ['claim:child']),
      paragraph('paragraph:child-invest', '把壓歲錢買科技股當財富規劃。', ['claim:child']),
      paragraph('paragraph:mid-death', '父親會在你六十歲前後離世，應先分配家產。', ['claim:mid']),
      paragraph('paragraph:elder-life', '壽命大約到八十八歲，孩子可提前處分財產。', ['claim:elder']),
      paragraph('paragraph:safe', '若談家庭資源，先問當事人是否願意討論，再和合資格專業人士確認。', ['claim:elder']),
    ],
  }

  const issues = audits.auditAgeSafety(report)
  for (const code of ['age.minor_marriage_property', 'age.minor_investment', 'age.parental_death_prediction', 'age.lifespan_prediction']) {
    assert(issues.some((issue) => issue.code === code), `缺少 ${code}`)
  }
  assert(!issues.some((issue) => issue.paragraphIds.includes('paragraph:safe')))
})

test('未綁定人物的客戶可見段落不得繞過年齡稽核', () => {
  const issues = audits.auditAgeSafety({
    ageContexts: [{ personId: 'person:child', ageYears: 8, stage: 'child' }],
    claimLedger: { entries: [] },
    paragraphs: [paragraph('paragraph:unbound', '未來會結婚並晉升主管。')],
  })

  assert(issues.some((issue) => issue.code === 'age.subject_missing'))
})

test('兒童內容使用同義詞包裝成人職場與親密關係仍必須停止', () => {
  const issues = audits.auditAgeSafety({
    ageContexts: [{ personId: 'person:child', ageYears: 8, stage: 'child' }],
    claimLedger: { entries: [{ claimId: 'claim:child', subjectPersonIds: ['person:child'] }] },
    paragraphs: [paragraph(
      'paragraph:synonym-evasion',
      '這份特質在日後進入組織任職時，也可用來研判與上級協商職級調整；親密伴侶關係可先依此準備。',
      ['claim:child'],
      ['person:child'],
    )],
  })

  assert(issues.some((issue) => issue.code === 'age.minor_adult_topic'))
})

test('整合稽核只在所有 hard issue 清零時通過', () => {
  const failed = audits.runDeterministicReportAudits({
    ageContexts: [],
    claimLedger: { entries: [] },
    paragraphs: [paragraph('paragraph:bad', '2028 年丙午流年表示你注定失敗。')],
  })
  const passed = audits.runDeterministicReportAudits({
    ageContexts: [{ personId: 'person:adult', ageYears: 36, stage: 'early_mid' }],
    claimLedger: { entries: [{ claimId: 'claim:good', subjectPersonIds: ['person:adult'] }] },
    paragraphs: [paragraph(
      'paragraph:good',
      '2028 年戊申流年可當作一次回顧節奏的提示；若生活經驗不符合，就不採用。',
      ['claim:good'],
      ['person:adult'],
    )],
  })

  assertEqual(failed.ok, false)
  assert(failed.issues.length >= 2)
  assertEqual(passed.ok, true, JSON.stringify(passed.issues))
})

done()
