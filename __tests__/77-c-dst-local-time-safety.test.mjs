import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  classifyConsultationLocalTime,
  consultationTimezoneOffsetHoursAtEpoch,
  resolveConsultationUnknownTime,
} from '../lib/consultation/local-time-validity.ts'
import { prepareCheckoutBirthData } from '../lib/checkout/prepare-checkout-birth-data.ts'

const root = process.cwd()
const server = readFileSync(join(root, 'lib', 'checkout', 'prepare-checkout-birth-data.ts'), 'utf8')
const hook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')
const fields = readFileSync(join(root, 'components', 'checkout', 'BirthDataFields.tsx'), 'utf8')
const localTime = readFileSync(join(root, 'lib', 'consultation', 'local-time-validity.ts'), 'utf8')

test('New York DST overlap is ambiguous and spring-forward gap is nonexistent', () => {
  assert.equal(classifyConsultationLocalTime({
    year: 2021, month: 11, day: 7, hour: 1, minute: 30, timezone: 'America/New_York',
  }).status, 'ambiguous')
  assert.equal(classifyConsultationLocalTime({
    year: 2021, month: 3, day: 14, hour: 2, minute: 30, timezone: 'America/New_York',
  }).status, 'nonexistent')
})

test('ordinary local times remain unique', () => {
  assert.equal(classifyConsultationLocalTime({
    year: 2021, month: 3, day: 14, hour: 3, minute: 30, timezone: 'America/New_York',
  }).status, 'unique')
  assert.equal(classifyConsultationLocalTime({
    year: 1990, month: 1, day: 1, hour: 12, minute: 0, timezone: 'Asia/Taipei',
  }).status, 'unique')
})

test('unknown time requires the canonical local noon to exist', () => {
  assert.equal(resolveConsultationUnknownTime({
    year: 2011, month: 12, day: 30, timezone: 'Pacific/Apia',
  }).status, 'nonexistent')
  assert.equal(resolveConsultationUnknownTime({
    year: 1990, month: 1, day: 1, timezone: 'Asia/Taipei',
  }).status, 'unique')
  assert.equal(resolveConsultationUnknownTime({
    year: 2000, month: 1, day: 15, timezone: 'Africa/Khartoum',
  }).status, 'nonexistent')
})

test('effective offset comes from the birth instant rather than a city base offset', () => {
  const summer = classifyConsultationLocalTime({
    year: 1990, month: 7, day: 1, hour: 12, minute: 0, timezone: 'America/New_York',
  })
  const winter = classifyConsultationLocalTime({
    year: 1990, month: 1, day: 1, hour: 12, minute: 0, timezone: 'America/New_York',
  })
  assert.equal(consultationTimezoneOffsetHoursAtEpoch('America/New_York', summer.candidateEpochMs[0]), -4)
  assert.equal(consultationTimezoneOffsetHoursAtEpoch('America/New_York', winter.candidateEpochMs[0]), -5)
})

function cBirthData(overrides = {}) {
  return {
    name: '成年測試者',
    year: 1990,
    month: 7,
    day: 1,
    hour: 12,
    minute: 0,
    gender: 'F',
    marital_status: 'single',
    calendar_type: 'solar',
    time_unknown: false,
    time_mode: 'exact',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    timezone_offset: -5,
    birth_country: 'US',
    birth_city: 'New York（United States）',
    birth_location_precision: 'city',
    ...overrides,
  }
}

test('C server rejects a stale city base offset and an impossible unknown-time date', async () => {
  const staleOffset = await prepareCheckoutBirthData({
    planCode: 'C',
    birthData: cBirthData(),
    asOfDate: '2026-08-09',
    queryReports: async () => ({ data: [], error: null }),
  })
  assert.equal(staleOffset.ok, false)
  assert.match(staleOffset.message, /夏令時間/u)

  const correctedOffset = await prepareCheckoutBirthData({
    planCode: 'C',
    birthData: cBirthData({ timezone_offset: -4 }),
    asOfDate: '2026-08-09',
    queryReports: async () => ({ data: [], error: null }),
  })
  assert.equal(correctedOffset.ok, true)

  const skippedDate = await prepareCheckoutBirthData({
    planCode: 'C',
    birthData: cBirthData({
      year: 2011,
      month: 12,
      day: 30,
      time_unknown: true,
      time_mode: 'unknown',
      hour: 12,
      minute: 0,
      latitude: -13.8333,
      longitude: -171.75,
      timezone: 'Pacific/Apia',
      timezone_offset: -10,
      birth_city: 'Apia（Samoa）',
    }),
    asOfDate: '2026-08-09',
    queryReports: async () => ({ data: [], error: null }),
  })
  assert.equal(skippedDate.ok, false)
  assert.match(skippedDate.message, /當地時制.*不存在/u)

  const missingCanonicalNoon = await prepareCheckoutBirthData({
    planCode: 'C',
    birthData: cBirthData({
      year: 2000,
      month: 1,
      day: 15,
      time_unknown: true,
      time_mode: 'unknown',
      hour: 12,
      minute: 0,
      latitude: 15.5007,
      longitude: 32.5599,
      timezone: 'Africa/Khartoum',
      timezone_offset: 2,
      birth_city: 'Khartoum（Sudan）',
      birth_country: 'SD',
    }),
    asOfDate: '2026-08-09',
    queryReports: async () => ({ data: [], error: null }),
  })
  assert.equal(missingCanonicalNoon.ok, false)
  assert.match(missingCanonicalNoon.message, /不存在/u)
})

test('C blocks ambiguous/nonexistent local times at UI and server while explaining the limitation', () => {
  assert.match(server, /classifyConsultationLocalTime/u)
  assert.match(localTime, /夏令時間切換/u)
  assert.match(hook, /cLocalTimeValidity\.status !== 'unique'/u)
  assert.match(hook, /cEffectiveTimezoneOffset/u)
  assert.match(fields, /同一個時間出現兩次/u)
  assert.match(fields, /當地時鐘不存在/u)
})
