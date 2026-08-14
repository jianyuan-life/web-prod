import assert from 'node:assert/strict'
import test from 'node:test'

import {
  G15_CONSENT_IDENTITY_LIMITATION,
  buildG15ConsentInvitationBatch,
} from '../lib/checkout/g15-consent-invitations.ts'
import { hashG15ConsentToken } from '../lib/checkout/g15-independent-consent.ts'

const REPORT_A = '11111111-1111-4111-8111-111111111111'
const REPORT_B = '22222222-2222-4222-8222-222222222222'
const PURCHASER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBJECT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SUBJECT_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const REQUEST_KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = Date.parse('2026-08-14T08:00:00.000Z')

function deterministicTokenFactory() {
  let value = 0
  return () => Buffer.alloc(32, ++value).toString('base64url')
}

test('invitation batch stores only irreversible token hashes and email HMACs while bearer tokens stay in fragment-only outbound links', () => {
  const batch = buildG15ConsentInvitationBatch({
    members: [
      { reportId: REPORT_A, subjectUserId: SUBJECT_A, name: '甲成員', canonicalEmail: ' Alpha@example.test ' },
      { reportId: REPORT_B, subjectUserId: SUBJECT_B, name: '乙成員', canonicalEmail: 'beta@example.test' },
    ],
    purchaserUserId: PURCHASER_ID,
    requestKey: REQUEST_KEY,
    siteUrl: 'https://jianyuan.life',
    emailHmacSecret: 'synthetic-hmac-secret-that-is-at-least-32-bytes',
    nowMs: NOW,
    generateToken: deterministicTokenFactory(),
    generateSelectionId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  })

  assert.equal(batch.receipts.length, 2)
  assert.equal(batch.deliveries.length, 2)
  assert.equal(JSON.stringify(batch.rpcArgs).includes('alpha@example.test'), false)
  assert.equal(JSON.stringify(batch.rpcArgs).includes('beta@example.test'), false)
  assert.match(batch.receipts[0].email_hmac, /^hmac-sha256:[0-9a-f]{64}$/u)
  assert.equal(batch.receipts[0].subject_user_id, SUBJECT_A)
  assert.equal(batch.receipts[0].accept_token_hash, hashG15ConsentToken(batch.deliveries[0].acceptToken))
  assert.equal(batch.receipts[0].revoke_token_hash, hashG15ConsentToken(batch.deliveries[0].revokeToken))
  assert.match(batch.deliveries[0].actionUrl, /^https:\/\/jianyuan\.life\/g15-consent#accept=/u)
  assert.doesNotMatch(batch.deliveries[0].actionUrl, /\?[^#]*(?:accept|revoke)=/u)
  assert.equal(batch.rpcArgs.p_request_key, REQUEST_KEY)
  assert.equal(batch.rpcArgs.p_purchaser_user_id, PURCHASER_ID)
  assert.equal(batch.rpcArgs.p_receipts[1].subject_user_id, SUBJECT_B)
})

test('invitation batch rejects missing members, duplicate authenticated owners, duplicate canonical mailboxes, invalid request identity and missing secret', () => {
  const base = {
    members: [
      { reportId: REPORT_A, subjectUserId: SUBJECT_A, name: '甲成員', canonicalEmail: 'same@example.test' },
      { reportId: REPORT_B, subjectUserId: SUBJECT_B, name: '乙成員', canonicalEmail: 'same@example.test' },
    ],
    purchaserUserId: PURCHASER_ID,
    requestKey: REQUEST_KEY,
    siteUrl: 'https://jianyuan.life',
    emailHmacSecret: 'synthetic-hmac-secret-that-is-at-least-32-bytes',
    nowMs: NOW,
    generateToken: deterministicTokenFactory(),
    generateSelectionId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  }
  assert.throws(() => buildG15ConsentInvitationBatch(base), /不同.*Supabase.*Email/u)
  assert.throws(() => buildG15ConsentInvitationBatch({
    ...base,
    members: [
      { ...base.members[0], canonicalEmail: 'alpha@example.test' },
      { ...base.members[1], subjectUserId: SUBJECT_A, canonicalEmail: 'beta@example.test' },
    ],
  }), /不同.*帳號/u)
  assert.throws(() => buildG15ConsentInvitationBatch({ ...base, members: base.members.slice(0, 1) }), /2 至 8/u)
  assert.throws(() => buildG15ConsentInvitationBatch({ ...base, requestKey: 'not-a-uuid' }), /識別碼/u)
  assert.throws(() => buildG15ConsentInvitationBatch({ ...base, emailHmacSecret: '' }), /HMAC/u)
})

test('acceptance is explicitly bound to the authenticated owner account while remaining non-KYC', () => {
  assert.match(G15_CONSENT_IDENTITY_LIMITATION, /Supabase.*帳號/u)
  assert.match(G15_CONSENT_IDENTITY_LIMITATION, /報告.*user_id/u)
  assert.match(G15_CONSENT_IDENTITY_LIMITATION, /不等於.*KYC/u)
})
