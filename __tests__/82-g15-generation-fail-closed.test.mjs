import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('G15 legacy email selection is quarantined and the owned family context reaches generation', () => {
  const workflow = read('workflows/generate-report/index.ts')

  assert.match(
    workflow,
    /birthData\.plan_type === 'family_email'[\s\S]{0,900}markReportNeedsHumanReview[\s\S]{0,500}return \{ success: false/u,
  )
  assert.doesNotMatch(workflow, /familyReports = await loadFamilyReports\(memberEmails, memberNames\)/u)
  assert.match(
    workflow,
    /aiGenerateG15\(familyReports, planCode, systemPrompt, birthData, createdAt, reportId\)/u,
  )
})

test('G15 generation revalidates consent, explicit relationships, exact adult ages and the immutable report period', () => {
  const steps = read('workflows/generate-report/steps.ts')

  assert.match(steps, /validateG15ConsultationContext\(familyContext\)/u)
  assert.match(steps, /validateG15PersistedConsentAuthority\([\s\S]{0,500}consent_selection_id/u)
  assert.match(steps, /buildAgeContext\([\s\S]{0,500}ageYears < 18/u)
  assert.match(steps, /createdAt[\s\S]{0,800}Asia\/Hong_Kong[\s\S]{0,800}targetYear/u)
  assert.match(steps, /statedRelationships[\s\S]{0,800}consultationGoals/u)
  assert.match(steps, /不得推定[\s\S]{0,200}(?:父母|夫妻|親子|角色)/u)
})

test('G15 unknown-time members never expose noon placeholders or time-dependent legacy excerpts', () => {
  const steps = read('workflows/generate-report/steps.ts')

  assert.match(steps, /BIRTH_TIME_DEPENDENT_SYSTEMS/u)
  assert.match(steps, /出生時間未提供/u)
  assert.match(steps, /不得.{0,30}12:00/u)
  assert.match(steps, /timeUnknown[\s\S]{0,900}BIRTH_TIME_DEPENDENT_SYSTEMS\.has/u)
  assert.doesNotMatch(steps, /出生：\$\{bd\.year\}年\$\{bd\.month\}月\$\{bd\.day\}日\$\{bd\.hour[^\n]+時/u)
})

test('G15 hard quality failures and incomplete independent review stop before PDF, completion and email', () => {
  const workflow = read('workflows/generate-report/index.ts')
  const start = workflow.indexOf("if (planCode === 'G15'")
  const end = workflow.indexOf('// ── R 方案', start)
  const g15 = workflow.slice(start, end)
  const legacy = g15.slice(g15.indexOf('const result = await aiGenerateG15'))

  const assertFailsClosedAfterReviewMarker = (marker, errorText) => {
    const markerIndex = legacy.indexOf(marker)
    const reviewIndex = legacy.lastIndexOf('markReportNeedsHumanReview', markerIndex)
    const returnIndex = legacy.indexOf(errorText, markerIndex)

    assert.ok(markerIndex >= 0, `missing failure marker: ${marker}`)
    assert.ok(reviewIndex >= 0 && reviewIndex < markerIndex, `${marker} must be recorded for human review`)
    assert.ok(returnIndex > markerIndex, `${marker} must return a fail-closed result`)
  }

  assert.match(g15, /qResult\.hardFailures\.length > 0[\s\S]{0,900}markReportNeedsHumanReview[\s\S]{0,500}return \{ success: false/u)
  assertFailsClosedAfterReviewMarker('G15 品質閘門執行失敗', "return { success: false, error: 'G15 品質審查未完整完成' }")
  assert.match(g15, /!review\.fiveLLM[\s\S]{0,300}review\.fiveLLM\.severity === 'red'[\s\S]{0,900}markReportNeedsHumanReview/u)
  assertFailsClosedAfterReviewMarker('G15 獨立審查執行失敗', "return { success: false, error: 'G15 獨立審查執行失敗' }")
  assert.ok(legacy.indexOf('qualityGate(') < legacy.indexOf('generatePDF('))
  assert.ok(legacy.indexOf('aiReviewReport(') < legacy.indexOf('saveReportToSupabase('))
  assert.ok(legacy.indexOf('aiReviewReport(') < legacy.indexOf('sendReportEmail('))
})

test('G15 prompts use the report target year and distinguish 15 calculator records from 14 customer-claimable systems', () => {
  const v2 = read('prompts/g15_plan_v2.ts')
  const v4 = read('prompts/g15_plan_v4.ts')

  assert.match(v2, /完整性台帳[\s\S]{0,80}15[\s\S]{0,180}對客戶[\s\S]{0,50}14/u)
  assert.match(v2, /九星氣學.{0,100}(?:held|保留|不得支撐)/u)
  assert.doesNotMatch(v2, /九星\s*≥\s*3\s*次/u)
  assert.match(v2, /target_year\s*起連續五年/u)
  assert.match(v4, /target_year\s*起連續五年/u)
  assert.doesNotMatch(v2, /家族流年運勢\(2026-2030/u)
  assert.doesNotMatch(v4, /家族流年（2026-2030/u)
  assert.doesNotMatch(v2, /2026 年是丙午年/u)
})
