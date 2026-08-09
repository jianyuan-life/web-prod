// 真實呼叫端送出的欄位集合，必須正好是嚴格端點宣告的那一組。
//
// 這條測試存在的原因：跨語言 fixture 是用手寫的 SYNTHETIC_PAYLOAD 產的，
// 不是 buildCalculatorRequestPayload() 的實際輸出，所以 Python 的
// extra='forbid' 從來沒有看過真正會送過來的東西。實際上 builder 只要有座標
// 就一定寫 timezone_offset，而 strict model 沒宣告它 —— production 的每一個
// C/G15 請求都會 422、重試三次、然後把已付款的報告標成失敗。
//
// 兩邊各有一份清單，任何一邊漂移都會在這裡紅。
// Python 側：api_server/consultation_v1/request.py 的 ConsultationCalculateRequest

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCalculatorRequestPayload } from '../lib/consultation/calculator-request.ts'

// 對應 ConsultationCalculateRequest.model_fields
const STRICT_MODEL_FIELDS = new Set([
  'name', 'year', 'month', 'day', 'hour', 'minute', 'gender',
  'latitude', 'longitude', 'timezone', 'timezone_offset',
  'birth_city', 'birth_country',
  'calendar_type', 'lunar_leap', 'time_unknown', 'time_mode',
  'as_of', 'bazi_school', 'ayanamsa_type', 'fold', 'target_year',
])

// strict model 標為必填的欄位（minute 只在 time_mode='exact' 時必填）
const STRICT_REQUIRED = [
  'name', 'year', 'month', 'day', 'hour', 'gender',
  'latitude', 'longitude', 'timezone',
  'calendar_type', 'lunar_leap', 'time_unknown', 'time_mode',
  'as_of', 'bazi_school', 'ayanamsa_type', 'fold', 'target_year',
]

function consultationBirthData(overrides = {}) {
  return {
    name: '虛構案例甲',
    year: 1990, month: 6, day: 15, hour: 10, minute: 30,
    gender: 'M',
    calendar_type: 'solar',
    lunar_leap: false,
    time_unknown: false,
    time_mode: 'exact',
    latitude: 25.033, longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_city: 'Taipei', birth_country: 'TW',
    target_year: 2026,
    as_of: '2026-08-09',
    ...overrides,
  }
}

test('consultationMode 送出的每個欄位,嚴格端點都宣告了', () => {
  const payload = buildCalculatorRequestPayload(consultationBirthData(), { consultationMode: true })
  const undeclared = Object.keys(payload).filter((key) => !STRICT_MODEL_FIELDS.has(key))
  assert.deepEqual(undeclared, [], `這些欄位會被 extra='forbid' 擋成 422: ${undeclared}`)
})

test('嚴格端點的必填欄位,builder 全部有送', () => {
  const payload = buildCalculatorRequestPayload(consultationBirthData(), { consultationMode: true })
  const missing = STRICT_REQUIRED.filter((key) => payload[key] === undefined)
  assert.deepEqual(missing, [], `缺這些必填欄位會 422: ${missing}`)
})

test('checkout 沒收集流派時,builder 仍必須明確送出預設值', () => {
  // 這是原本的漏洞形狀:欄位是條件式寫入,沒收集到就整個不送。
  const bare = consultationBirthData()
  delete bare.bazi_school
  delete bare.ayanamsa_type
  delete bare.fold
  const payload = buildCalculatorRequestPayload(bare, { consultationMode: true })
  assert.equal(payload.bazi_school, 'china_mainland')
  assert.equal(payload.ayanamsa_type, 'lahiri')
  assert.equal(payload.fold, 0)
})

test('有座標就一定送 timezone_offset —— 這正是當初被擋掉的欄位', () => {
  const payload = buildCalculatorRequestPayload(consultationBirthData(), { consultationMode: true })
  assert.equal(typeof payload.timezone_offset, 'number')
  assert.ok(STRICT_MODEL_FIELDS.has('timezone_offset'), 'Python 側必須宣告它,不是忽略它')
})

test('offset 為 0 不得被當成缺值丟掉', () => {
  const payload = buildCalculatorRequestPayload(
    consultationBirthData({ timezone: 'Europe/London', timezone_offset: 0, latitude: 51.5, longitude: -0.12 }),
    { consultationMode: true },
  )
  assert.equal(payload.timezone_offset, 0)
})

test('不支援的流派/ayanamsa 仍然要擋,放寬不等於什麼都收', () => {
  assert.throws(
    () => buildCalculatorRequestPayload(
      consultationBirthData({ bazi_school: 'taiwan' }), { consultationMode: true }),
    RangeError,
  )
  assert.throws(
    () => buildCalculatorRequestPayload(
      consultationBirthData({ ayanamsa_type: 'sidereal' }), { consultationMode: true }),
    RangeError,
  )
})

test('legacy 模式不得被 consultation 的預設值污染', () => {
  const payload = buildCalculatorRequestPayload(consultationBirthData(), {})
  assert.equal(payload.bazi_school, undefined)
  assert.equal(payload.ayanamsa_type, undefined)
  assert.equal(payload.fold, undefined)
  assert.equal(payload.as_of, undefined)
})
