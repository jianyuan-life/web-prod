import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildConsultationRelationshipPrompt,
  getConsultationRelationshipContext,
} from '../lib/consultation/relationship-context.ts'

const root = process.cwd()
const v2 = readFileSync(join(root, 'prompts', 'c_plan_v2.ts'), 'utf8')
const v6 = readFileSync(join(root, 'prompts', 'c_plan_v6.ts'), 'utf8')
const workflow = readFileSync(join(root, 'workflows', 'generate-report', 'steps.ts'), 'utf8')
const fallback = readFileSync(join(root, 'app', 'api', 'generate-report', 'route.ts'), 'utf8')

const expected = {
  single: '單身',
  partnered: '穩定交往或有伴侶',
  married: '已婚',
  separated: '分居',
  divorced: '離婚',
  widowed: '喪偶',
  not_applicable: '不適用',
  prefer_not_to_say: '不願回答',
}

test('all eight C relationship states have distinct human labels and safe instructions', () => {
  const instructions = new Set()
  for (const [status, label] of Object.entries(expected)) {
    const context = getConsultationRelationshipContext(status)
    assert.ok(context, `${status} must resolve`)
    assert.equal(context.status, status)
    assert.equal(context.label, label)
    assert.match(context.promptInstruction, new RegExp(label, 'u'))
    instructions.add(context.promptInstruction)
  }
  assert.equal(instructions.size, 8, 'every state must carry its own interpretation boundary')
})

test('legacy unmarried is single and can never become married by substring matching', () => {
  assert.equal(getConsultationRelationshipContext('unmarried')?.status, 'single')
  assert.doesNotMatch(buildConsultationRelationshipPrompt('unmarried'), /目前關係狀態：已婚/u)
  assert.match(buildConsultationRelationshipPrompt('unmarried'), /目前關係狀態：單身/u)
})

test('unknown relationship input degrades to an explicit neutral instruction', () => {
  const prompt = buildConsultationRelationshipPrompt('unexpected-state')
  assert.match(prompt, /未提供有效狀態/u)
  assert.match(prompt, /不得假設/u)
})

test('C workflow and fallback prompts consume the shared relationship context', () => {
  assert.match(v2, /buildConsultationRelationshipPrompt\(birthData\.marital_status\)/u)
  assert.doesNotMatch(v2, /birthData\.marital_status === 'unmarried' \? '未婚'/u)
  assert.match(v6, /buildConsultationRelationshipPrompt\(maritalStatus\)/u)
  assert.doesNotMatch(v6, /includes\('marri'\)/u)
  assert.match(workflow, /buildConsultationRelationshipPrompt\(birthData\.marital_status\)/u)
  assert.match(fallback, /buildConsultationRelationshipPrompt\(birthData\.marital_status\)/u)
})
