import {
  suite,
  test,
  assert,
  assertEqual,
  done,
} from './harness.mjs'
import { prepareCheckoutBirthData } from '../lib/checkout/prepare-checkout-birth-data.ts'

function validCInput(overrides = {}) {
  return {
    name: '成年測試者',
    year: 1990,
    month: 1,
    day: 1,
    gender: 'F',
    calendar_type: 'solar',
    lunar_leap: false,
    time_unknown: true,
    time_mode: 'unknown',
    hour: 12,
    minute: 0,
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_country: 'TW',
    birth_city: '台北（台灣）',
    birth_location_precision: 'city',
    marital_status: 'single',
    ...overrides,
  }
}

async function prepareC(birthData, asOfDate = '2026-08-09') {
  return prepareCheckoutBirthData({
    planCode: 'C',
    birthData,
    asOfDate,
    queryReports: async () => ({ data: [], error: null }),
  })
}

suite('C server input fail-closed contract')

test('出生日晚於付款當日時拒絕下單', async () => {
  const result = await prepareC(validCInput({ year: 2026, month: 8, day: 10 }))

  assert(!result.ok, '未來出生日不得進入付款')
  assertEqual(result.code, 'INVALID_SELECTION')
  assert(result.message.includes('不能晚於今天'), '錯誤必須是可直接顯示的白話')
})

test('非法關係狀態在付款前被 server 拒絕', async () => {
  const result = await prepareC(validCInput({ marital_status: 'it-is-complicated' }))

  assert(!result.ok, '未知關係狀態不得原樣寫入訂單')
  assertEqual(result.code, 'INVALID_SELECTION')
  assert(result.message.includes('關係狀態'), '錯誤必須告訴使用者重新選擇關係狀態')
})

test('17 歲未成年人在專屬路徑完成前拒絕付款', async () => {
  const result = await prepareC(validCInput({
    name: '未成年測試者',
    year: 2008,
    month: 8,
    day: 10,
    marital_status: 'not_applicable',
  }))

  assert(!result.ok, '實足 17 歲不得進入 C 付款')
  assertEqual(result.code, 'INVALID_SELECTION')
  assert(result.message.includes('未滿 18 歲'))
  assert(result.message.includes('暫不接受'))
})

test('生日當天實足 18 歲可以進入成年 C 付款路徑', async () => {
  const result = await prepareC(validCInput({ year: 2008, month: 8, day: 9 }))

  assert(result.ok, '實足 18 歲不應被未成年門檻擋住')
})

test('歷史 unmarried 值只能明確正規化為 single', async () => {
  const result = await prepareC(validCInput({ marital_status: 'unmarried' }))

  assert(result.ok, '舊 C 資料的 unmarried 必須可向後相容')
  assertEqual(result.birthData.marital_status, 'single')
})

test('八種明確關係狀態保留原語意', async () => {
  const statuses = [
    'single',
    'partnered',
    'married',
    'separated',
    'divorced',
    'widowed',
    'not_applicable',
    'prefer_not_to_say',
  ]

  for (const status of statuses) {
    const result = await prepareC(validCInput({ marital_status: status }))
    assert(result.ok, `${status} 應是合法 C 關係狀態`)
    assertEqual(result.birthData.marital_status, status)
  }
})

test('含有 marri 字串但不是法定 token 的值不會被猜成已婚', async () => {
  for (const status of ['remarried', 'unmarriedness', 'marriage']) {
    const result = await prepareC(validCInput({ marital_status: status }))
    assert(!result.ok, `${status} 必須 fail closed`)
  }
})

test('前端監護人勾選不能繞過未成年付款阻斷', async () => {
  const result = await prepareC(validCInput({
    year: 2012,
    month: 1,
    day: 1,
    marital_status: 'not_applicable',
    guardian_attestation: {
      guardian_name: '監護人',
      relationship: 'mother',
      accepted: true,
      accepted_at: '2026-08-09T00:00:00.000Z',
    },
  }))

  assert(!result.ok, '監護人資料不是專屬報告路徑的替代品')
  assert(result.message.includes('暫不接受付款'))
})

await done()
