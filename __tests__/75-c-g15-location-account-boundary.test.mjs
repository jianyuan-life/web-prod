import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { prepareCheckoutBirthData } from '../lib/checkout/prepare-checkout-birth-data.ts'

const root = process.cwd()
const searchRoute = readFileSync(join(root, 'app', 'api', 'checkout', 'search-reports', 'route.ts'), 'utf8')
const checkoutHook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')
const birthFields = readFileSync(join(root, 'components', 'checkout', 'BirthDataFields.tsx'), 'utf8')

function cBirthData(overrides = {}) {
  return {
    name: '成年測試者',
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0,
    gender: 'F',
    marital_status: 'single',
    calendar_type: 'solar',
    time_unknown: true,
    time_mode: 'unknown',
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_country: 'TW',
    birth_city: '台北（台灣）',
    birth_location_precision: 'city',
    ...overrides,
  }
}

async function prepareC(birthData) {
  return prepareCheckoutBirthData({
    planCode: 'C',
    birthData,
    asOfDate: '2026-08-09',
    queryReports: async () => ({ data: [], error: null }),
  })
}

test('G15 name search binds customer_email with equality, never ILIKE wildcards', () => {
  assert.match(searchRoute, /runOwnedQuery\('customer_email', normalizedAuthEmail\)/u)
  assert.match(searchRoute, /baseQuery\.eq\('customer_email', ownerValue\)/u)
  assert.match(searchRoute, /\.is\('user_id', null\)/u)
  assert.doesNotMatch(searchRoute, /\.ilike\('customer_email', authEmail\)/u)
})

test('C server rejects representative country coordinates and accepts an explicit city', async () => {
  const unsafe = await prepareC(cBirthData({
    birth_city: '中國',
    birth_country: 'CN',
    latitude: 39.91,
    longitude: 116.4,
    timezone: 'Asia/Shanghai',
    birth_location_precision: 'country_representative',
  }))
  assert.equal(unsafe.ok, false)
  assert.match(unsafe.message, /實際出生城市/u)

  const safe = await prepareC(cBirthData())
  assert.equal(safe.ok, true)
})

test('C country choice remains a search step and UI explains why the city is required', () => {
  assert.match(checkoutHook, /if \(planCode === 'C'\)/u)
  assert.match(checkoutHook, /else if \(isMultiTz\)/u)
  assert.match(checkoutHook, /birthLocationPrecision: 'city'/u)
  assert.match(checkoutHook, /birth_location_precision: planCode === 'C' \? form\.birthLocationPrecision/u)
  assert.match(birthFields, /請再選擇實際出生城市/u)
  assert.match(birthFields, /不能只用國家代表座標/u)
})
