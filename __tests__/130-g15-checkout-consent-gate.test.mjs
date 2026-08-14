import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareCheckoutBirthData } from '../lib/checkout/prepare-checkout-birth-data.ts'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
} from '../lib/checkout/g15-independent-consent.ts'

const REPORT_A = '11111111-1111-4111-8111-111111111111'
const REPORT_B = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBJECT_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SELECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-08-14T08:00:00.000Z')
const EXPIRES_AT = new Date(NOW + 24 * 60 * 60 * 1000).toISOString()

function validBirthData(name, day) {
  return {
    name,
    year: 1990,
    month: 1,
    day,
    hour: 12,
    minute: 0,
    gender: 'F',
    marital_status: 'single',
    time_unknown: false,
    time_mode: 'exact',
    calendar_type: 'solar',
    lunar_leap: false,
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_country: 'TW',
    birth_city: 'Taipei',
    birth_location_precision: 'city',
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
  }
}

function reportRows() {
  return [
    { id: REPORT_A, client_name: 'Adult A', plan_code: 'C', status: 'completed', deleted_at: null, user_id: OWNER_ID, customer_email: 'owner@example.test', birth_data: validBirthData('Adult A', 1) },
    { id: REPORT_B, client_name: 'Adult B', plan_code: 'C', status: 'completed', deleted_at: null, user_id: SUBJECT_B_ID, customer_email: 'member-b@example.test', birth_data: validBirthData('Adult B', 2) },
  ]
}

function consentRows(status = 'accepted') {
  return {
    selection: {
      id: SELECTION_ID,
      purchaser_user_id: OWNER_ID,
      selected_report_ids: [REPORT_A, REPORT_B],
      selected_report_ids_hash: hashG15ConsentReportIds([REPORT_A, REPORT_B]),
      policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharing_scope: G15_CONSENT_SHARING_SCOPE,
      expires_at: EXPIRES_AT,
      superseded_at: null,
      consumed_at: null,
      consumed_stripe_session_id: null,
      consumed_report_id: null,
    },
    receipts: [REPORT_A, REPORT_B].map((reportId, index) => ({
      selection_id: SELECTION_ID,
      subject_report_id: reportId,
      subject_user_id: index === 0 ? OWNER_ID : SUBJECT_B_ID,
      subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
      status,
      accepted_at: status === 'accepted' ? new Date(NOW - 1_000).toISOString() : null,
      revoked_at: status === 'revoked' ? new Date(NOW - 500).toISOString() : null,
      expires_at: EXPIRES_AT,
      accept_token_hash: status === 'accepted' ? null : `sha256:${String(index + 3).repeat(64)}`,
      revoke_token_hash: status === 'revoked' ? null : `sha256:${String(index + 5).repeat(64)}`,
    })),
    error: null,
  }
}

function input(overrides = {}) {
  return {
    planCode: 'G15',
    asOfDate: '2026-08-14',
    nowMs: NOW,
    auth: { userId: OWNER_ID, email: 'owner@example.test' },
    birthData: {
      plan_type: 'family_reports',
      report_ids: [REPORT_A, REPORT_B],
      consent_selection_id: SELECTION_ID,
      stated_relationships: ['Adult A and Adult B are siblings.'],
      consultation_goals: ['Improve family communication.'],
      // Legacy purchaser self-attestation is deliberately untrusted and ignored.
      consent_attestation: { accepted: true },
    },
    queryReports: async () => ({ data: reportRows(), error: null }),
    queryConsent: async () => consentRows(),
    ...overrides,
  }
}

test('checkout trusts only complete server-side independent receipts and persists bounded authority', async () => {
  const result = await prepareCheckoutBirthData(input())
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(result.birthData.consent_authority, {
    selection_id: SELECTION_ID,
    policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    purpose: G15_CONSENT_PURPOSE,
    sharing_scope: G15_CONSENT_SHARING_SCOPE,
    expires_at: EXPIRES_AT,
    accepted_at_by_report: {
      [REPORT_A]: new Date(NOW - 1_000).toISOString(),
      [REPORT_B]: new Date(NOW - 1_000).toISOString(),
    },
    subject_user_ids_by_report: {
      [REPORT_A]: OWNER_ID,
      [REPORT_B]: SUBJECT_B_ID,
    },
  })
  assert.equal('consent_attestation' in result.birthData, false)
})

test('missing locator, pending or revoked receipt, query failure and purchaser drift fail closed', async () => {
  const cases = [
    {
      expected: 'CONSENT_REQUIRED',
      mutate: { birthData: { ...input().birthData, consent_selection_id: undefined } },
    },
    {
      expected: 'CONSENT_REQUIRED',
      mutate: { queryConsent: async () => consentRows('pending') },
    },
    {
      expected: 'CONSENT_REQUIRED',
      mutate: { queryConsent: async () => consentRows('revoked') },
    },
    {
      expected: 'CONSENT_QUERY_FAILED',
      mutate: { queryConsent: async () => ({ selection: null, receipts: null, error: new Error('db down') }) },
    },
    {
      expected: 'CONSENT_REQUIRED',
      mutate: {
        queryConsent: async () => {
          const rows = consentRows()
          rows.selection.purchaser_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
          return rows
        },
      },
    },
  ]

  for (const { expected, mutate } of cases) {
    const result = await prepareCheckoutBirthData(input(mutate))
    assert.equal(result.ok, false)
    assert.equal(result.code, expected)
  }
})

test('a consumed selection cannot authorize another checkout', async () => {
  for (const consumedField of [
    { consumed_at: new Date(NOW - 500).toISOString() },
    { consumed_stripe_session_id: 'cs_test_previous_order_1234567890' },
    { consumed_report_id: '99999999-9999-4999-8999-999999999999' },
  ]) {
    const rows = consentRows()
    Object.assign(rows.selection, consumedField)
    const result = await prepareCheckoutBirthData(input({
      queryConsent: async () => rows,
    }))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'CONSENT_REQUIRED')
  }
})

test('same-owner and legacy-null owner report sets fail closed even when receipts claim acceptance', async () => {
  for (const invalidOwner of [OWNER_ID, null]) {
    const rows = reportRows()
    rows[1].user_id = invalidOwner
    const result = await prepareCheckoutBirthData(input({
      queryReports: async () => ({ data: rows, error: null }),
    }))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SELECTION')
  }
})
