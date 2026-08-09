import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { projectG15SearchReports } from '../lib/checkout/g15-search-results.ts'
import { validateG15Selection } from '../lib/checkout/validate-g15-selection.ts'

const root = process.cwd()
const route = readFileSync(join(root, 'app', 'api', 'checkout', 'search-reports', 'route.ts'), 'utf8')

function row(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    client_name: '何宣逸',
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    created_at: '2026-08-09T00:00:00.000Z',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    customer_email: 'old@example.test',
    birth_data: {
      name: '何宣逸',
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      gender: 'M',
      calendar_type: 'solar',
      time_unknown: true,
      time_mode: 'unknown',
      latitude: 25.033,
      longitude: 121.5654,
      timezone: 'Asia/Taipei',
      timezone_offset: 8,
      birth_location_precision: 'city',
      bazi_school: 'china_mainland',
      ayanamsa_type: 'lahiri',
    },
    ...overrides,
  }
}

test('search route queries verified user id first and exact email as legacy fallback', () => {
  assert.match(route, /getAuthUser\(req\)/u)
  assert.match(route, /runOwnedQuery\('user_id', authUserId\)/u)
  assert.match(route, /runOwnedQuery\('customer_email', normalizedAuthEmail\)/u)
  assert.match(route, /baseQuery\.eq\('user_id', ownerValue\)/u)
  assert.match(route, /baseQuery\.eq\('customer_email', ownerValue\)/u)
  assert.match(route, /\.is\('user_id', null\)/u)
  assert.doesNotMatch(route, /getAuthEmail\(req\)/u)
})

test('matching email cannot take over a report already owned by another user id', async () => {
  const result = await validateG15Selection({
    selectedReportIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ],
    auth: {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'old@example.test',
    },
    queryReports: async () => ({
      error: null,
      data: [
        row(),
        row({
          id: '22222222-2222-4222-8222-222222222222',
          client_name: '何紀萳',
          birth_data: { ...row().birth_data, name: '何紀萳', day: 2 },
        }),
      ],
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'FORBIDDEN')
})

test('same person appears once as selectable and older duplicate is explained before checkout', () => {
  const result = projectG15SearchReports([
    row(),
    row({
      id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-07-01T00:00:00.000Z',
    }),
  ])

  assert.equal(result.reports.length, 1)
  assert.equal(result.reports[0].id, '11111111-1111-4111-8111-111111111111')
  assert.equal(result.unavailableReports.length, 1)
  assert.equal(result.unavailableReports[0].reasonCode, 'DUPLICATE_PERSON')
  assert.match(result.unavailableReports[0].reason, /較新/u)
})

test('same person stays duplicate after a corrected time or birthplace', () => {
  const result = projectG15SearchReports([
    row(),
    row({
      id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-07-01T00:00:00.000Z',
      birth_data: {
        ...row().birth_data,
        time_unknown: false,
        time_mode: 'exact',
        hour: 9,
        timezone: 'Asia/Hong_Kong',
        timezone_offset: 8,
        latitude: 22.3193,
        longitude: 114.1694,
      },
    }),
  ])

  assert.equal(result.reports.length, 1)
  assert.equal(result.unavailableReports.length, 1)
  assert.equal(result.unavailableReports[0].reasonCode, 'DUPLICATE_PERSON')
})
