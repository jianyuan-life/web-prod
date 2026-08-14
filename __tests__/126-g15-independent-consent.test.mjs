import assert from 'node:assert/strict'
import test from 'node:test'

import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_RECEIPT_MAX_AGE_MS,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
  validateG15PersistedConsentAuthority,
  validateG15IndependentConsent,
} from '../lib/checkout/g15-independent-consent.ts'

const REPORT_A = '11111111-1111-4111-8111-111111111111'
const REPORT_B = '22222222-2222-4222-8222-222222222222'
const PURCHASER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBJECT_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SELECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-08-14T08:00:00.000Z')

function acceptedFixture() {
  const expiresAt = new Date(NOW + G15_CONSENT_RECEIPT_MAX_AGE_MS).toISOString()
  return {
    selection: {
      id: SELECTION_ID,
      purchaser_user_id: PURCHASER_ID,
      selected_report_ids: [REPORT_B, REPORT_A],
      selected_report_ids_hash: hashG15ConsentReportIds([REPORT_A, REPORT_B]),
      policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharing_scope: G15_CONSENT_SHARING_SCOPE,
      expires_at: expiresAt,
      superseded_at: null,
      consumed_at: null,
      consumed_stripe_session_id: null,
      consumed_report_id: null,
    },
    receipts: [REPORT_A, REPORT_B].map((reportId, index) => ({
      selection_id: SELECTION_ID,
      subject_report_id: reportId,
      subject_user_id: index === 0 ? PURCHASER_ID : SUBJECT_B_ID,
      subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
      status: 'accepted',
      accepted_at: new Date(NOW - (index + 1) * 1_000).toISOString(),
      revoked_at: null,
      expires_at: expiresAt,
      accept_token_hash: null,
      revoke_token_hash: `sha256:${String(index + 3).repeat(64)}`,
    })),
  }
}

test('server accepts only a complete DB-backed receipt set bound to purchaser, reports, policy, purpose and sharing scope', () => {
  const fixture = acceptedFixture()
  const result = validateG15IndependentConsent({
    ...fixture,
    purchaserUserId: PURCHASER_ID,
    reportIds: [REPORT_A, REPORT_B],
    subjectUserIds: [PURCHASER_ID, SUBJECT_B_ID],
    nowMs: NOW,
  })

  assert.equal(result.ok, true)
  assert.equal(result.authority.selectionId, SELECTION_ID)
  assert.deepEqual(Object.keys(result.authority.acceptedAtByReport).sort(), [REPORT_A, REPORT_B])
})

test('workflow accepts only checkout-persisted v3 authority bound to the exact selection and report set', () => {
  const fixture = acceptedFixture()
  const acceptedAtByReport = Object.fromEntries(
    fixture.receipts.map((receipt) => [receipt.subject_report_id, receipt.accepted_at]),
  )
  const authority = {
    selection_id: SELECTION_ID,
    policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    purpose: G15_CONSENT_PURPOSE,
    sharing_scope: G15_CONSENT_SHARING_SCOPE,
    expires_at: fixture.selection.expires_at,
    accepted_at_by_report: acceptedAtByReport,
    subject_user_ids_by_report: {
      [REPORT_A]: PURCHASER_ID,
      [REPORT_B]: SUBJECT_B_ID,
    },
  }
  assert.equal(validateG15PersistedConsentAuthority({
    authority,
    selectionId: SELECTION_ID,
    reportIds: [REPORT_B, REPORT_A],
  }).ok, true)
  assert.equal(validateG15PersistedConsentAuthority({
    authority: { ...authority, sharing_scope: 'public' },
    selectionId: SELECTION_ID,
    reportIds: [REPORT_B, REPORT_A],
  }).ok, false)
})

test('client locator is never authority: incomplete, revoked, expired, duplicate and unconsumed receipts fail closed', () => {
  const mutations = [
    (fixture) => { fixture.receipts.pop() },
    (fixture) => { fixture.receipts[0].status = 'revoked'; fixture.receipts[0].revoked_at = new Date(NOW).toISOString() },
    (fixture) => { fixture.selection.expires_at = new Date(NOW - 1).toISOString() },
    (fixture) => { fixture.receipts[1].subject_report_id = REPORT_A },
    (fixture) => { fixture.receipts[0].accept_token_hash = `sha256:${'f'.repeat(64)}` },
    (fixture) => { fixture.selection.purpose = 'generic-analytics' },
    (fixture) => { fixture.selection.sharing_scope = 'public' },
    (fixture) => { fixture.selection.purchaser_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  ]

  for (const mutate of mutations) {
    const fixture = acceptedFixture()
    mutate(fixture)
    const result = validateG15IndependentConsent({
      ...fixture,
      purchaserUserId: PURCHASER_ID,
      reportIds: [REPORT_A, REPORT_B],
      subjectUserIds: [PURCHASER_ID, SUBJECT_B_ID],
      nowMs: NOW,
    })
    assert.equal(result.ok, false)
  }
})
