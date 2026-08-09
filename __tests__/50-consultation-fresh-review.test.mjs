import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildConsultationFreshReviewRequest,
  createRendererInputBindingAttestation,
  parseConsultationFreshReviewResponse,
} from '../lib/consultation/fresh-review.ts'

const HASH_A = `sha256:${'a'.repeat(64)}`
const HASH_B = `sha256:${'b'.repeat(64)}`

function reviewInput() {
  return {
    plan: 'C',
    reportId: 'report:test',
    contextHash: HASH_A,
    asOfDate: '2026-08-08',
    people: [{ personId: 'person:p1', displayName: '測試者', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } }],
    ageContexts: [{
      personId: 'person:p1', birthDate: '1990-01-01', asOfDate: '2026-08-08',
      ageYears: 36, stage: 'early_mid', readerMode: 'self', timeHorizonEndAge: 60,
      allowedTopics: ['major_choices'], prohibitedTopics: ['medical_diagnosis'],
    }],
    facts: [{
      factId: 'fact:test', personIds: ['person:p1'], kind: 'calculator_direct',
      sourceId: 'source:test', sourcePath: 'x', value: { x: 1 }, asOfDate: '2026-08-08',
      evidenceClass: 'calculation', limitations: [],
    }],
    drafts: [],
  }
}

test('fresh review request 綁定 facts/drafts/policy，held facts fail closed', () => {
  const request = buildConsultationFreshReviewRequest(reviewInput(), HASH_B)
  assert.match(request.requestHash, /^sha256:[0-9a-f]{64}$/u)
  assert.match(request.user, /fact:test/u)
  assert.match(request.user, /early_mid/u)
  assert.match(request.user, /2026-08-08/u)
  assert.match(request.system, /找出錯誤/u)
  assert.throws(() => buildConsultationFreshReviewRequest({
    ...reviewInput(),
    facts: [{ ...reviewInput().facts[0], evidenceClass: 'held' }],
  }, HASH_B), /held facts/u)
})

test('審查只有零 finding 才可核准，矛盾或 malformed 回應不得通過', () => {
  const approved = parseConsultationFreshReviewResponse({
    rawResponse: '{"approved":true,"findings":[]}',
    reviewerModel: 'gemini-test', requestHash: HASH_A, releasePolicyReceipt: HASH_B,
  })
  assert.equal(approved.approved, true)
  assert.match(approved.artifactHash, /^sha256:[0-9a-f]{64}$/u)

  const rejected = parseConsultationFreshReviewResponse({
    rawResponse: '{"approved":true,"findings":[{"severity":"P1","code":"fact.unsupported","message":"沒有依據"}]}',
    reviewerModel: 'gemini-test', requestHash: HASH_A, releasePolicyReceipt: HASH_B,
  })
  assert.equal(rejected.approved, false)
  assert.equal(rejected.issues.length, 2)
  assert.throws(() => parseConsultationFreshReviewResponse({
    rawResponse: '```json\n{}\n```', reviewerModel: 'x', requestHash: HASH_A, releasePolicyReceipt: HASH_B,
  }), /單一 JSON/u)
})

test('renderer input binding 收據同時綁定 release receipt 與本報告 paragraph hashes', () => {
  const base = {
    releaseInputBindingReceipt: HASH_A,
    plan: 'G15',
    reportId: 'report:family',
    contextHash: HASH_B,
    chapterIds: ['chapter:a'],
    paragraphHashes: [HASH_A],
  }
  const left = createRendererInputBindingAttestation(base)
  const right = createRendererInputBindingAttestation({ ...base, paragraphHashes: [HASH_B] })
  assert.equal(left.passed, true)
  assert.notEqual(left.artifactHash, right.artifactHash)
  assert.throws(() => createRendererInputBindingAttestation({ ...base, paragraphHashes: [] }), /空內容/u)
})
