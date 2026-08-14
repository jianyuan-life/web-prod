import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildCPromptPeriodInstruction,
  buildUnknownBirthTimeInstruction,
  calculateAgeAsOf,
  cLifeStageForAge,
  resolveCPromptPeriod,
} from '../prompts/c_plan_contract.ts'

const root = process.cwd()
const v2Source = readFileSync(join(root, 'prompts', 'c_plan_v2.ts'), 'utf8')
const v4Source = readFileSync(join(root, 'prompts', 'c_plan_v4.ts'), 'utf8')

test('unknown birth time is explicit and time-dependent or held evidence never reaches the C prompt', () => {
  const instruction = buildUnknownBirthTimeInstruction(true)
  assert.match(instruction, /出生時間未提供/u)
  assert.match(instruction, /12:00.*內部占位/u)
  assert.match(instruction, /不得把占位時間寫成事實/u)
  assert.match(v2Source, /BIRTH_TIME_DEPENDENT_SYSTEMS\.has\(a\.system\)/u)
  assert.match(v2Source, /evidenceClasses\[a\.system\] === 'held'/u)
  assert.match(v2Source, /buildUnknownBirthTimeInstruction/u)
})

test('prompt period is bound to immutable as_of and target_year instead of a fixed 2026', () => {
  const period = resolveCPromptPeriod({ asOf: '2030-11-20', targetYear: 2031 })
  const instruction = buildCPromptPeriodInstruction(period)
  assert.equal(period.fiveYearRange, '2031-2035')
  assert.match(instruction, /資料基準日：2030-11-20/u)
  assert.match(instruction, /分析目標年：2031（辛亥年）/u)
  assert.match(v2Source, /buildCPromptPeriodInstruction/u)
  assert.doesNotMatch(v2Source, /流年：2026年是丙午年/u)
  assert.match(v2Source, /15 套.*完整性/u)
  assert.match(v2Source, /14 套.*可對客/u)
})

test('exact age grouping honours the as_of date rather than subtracting years only', () => {
  assert.equal(cLifeStageForAge(calculateAgeAsOf(2007, 12, 31, '2026-08-09')), 'teen')
  assert.equal(cLifeStageForAge(calculateAgeAsOf(2007, 1, 1, '2026-08-09')), 'young_adult')
  assert.match(v2Source, /calculateAgeAsOf/u)
})

test('v4 consumes age and client need and keeps the relationship chapter neutral', () => {
  assert.match(v4Source, /buildV4AgeInstruction\(ageGroup\)/u)
  assert.match(v4Source, /客戶最關心的問題.*clientNeed/us)
  assert.match(v4Source, /關係與人際互動/u)
  const call2Block = v4Source.slice(v4Source.indexOf('export function buildCall2Prompt'), v4Source.indexOf('export function buildCall3Prompt'))
  assert.doesNotMatch(call2Block, /最適合的伴侶|下一個桃花|感情宿命/u)
  assert.doesNotMatch(v4Source, /void ageGroup|void clientNeed/u)
})

test('v4 five-year horizon follows target_year in both multi-call and single-call prompts', () => {
  assert.match(v4Source, /period\.fiveYearRange/u)
  assert.match(v4Source, /buildCPromptPeriodInstruction\(period\)/u)
  assert.doesNotMatch(v4Source, /● 2026 年：|● 2027-2030/u)
})

test('age instructions are plain-language stage guidance, not academic-framework labels', () => {
  const ageBlock = v2Source.slice(v2Source.indexOf('const AGE_INSTRUCTIONS'), v2Source.indexOf('// ── 多語禁詞集'))
  assert.doesNotMatch(ageBlock, /Jung|Levinson|Saturn|Arnett|Quarter-life|Gerotranscendence/u)
  assert.match(ageBlock, /父母/u)
  assert.match(ageBlock, /尊重/u)
})
