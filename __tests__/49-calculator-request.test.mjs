import { suite, test, assert, assertEqual, done } from './harness.mjs'

let request
let loadError
try {
  request = await import('../lib/consultation/calculator-request.ts')
} catch (error) {
  loadError = error
}

suite('Fly calculator request 唯一序列化契約')

function buildPreConsultationPayload(birthData) {
  return {
    name: birthData.name,
    year: birthData.year,
    month: birthData.month,
    day: birthData.day,
    hour: birthData.hour,
    minute: birthData.minute || 0,
    gender: birthData.gender,
    calendar_type: birthData.calendar_type || birthData.calendarType || 'solar',
    lunar_leap: birthData.lunar_leap || birthData.lunarLeap || false,
    time_unknown: birthData.time_unknown || false,
    time_mode: birthData.time_mode || birthData.timeMode || 'shichen',
    ...((birthData.latitude || birthData.cityLat) && (birthData.longitude || birthData.cityLng) ? {
      latitude: birthData.latitude || birthData.cityLat,
      longitude: birthData.longitude || birthData.cityLng,
      timezone_offset: birthData.timezone_offset || birthData.cityTz || 8,
    } : {}),
    ...(birthData.timezone ? { timezone: birthData.timezone } : {}),
    ...(birthData.birth_city ? { birth_city: birthData.birth_city } : {}),
    ...(birthData.birth_country ? { birth_country: birthData.birth_country } : {}),
  }
}

test('既有 E3 輸入不會被 consultation 欄位污染，payload 維持原有語意', () => {
  assert(request, `calculator request 無法載入: ${loadError?.message || 'unknown error'}`)
  const payload = request.buildCalculatorRequestPayload({
    name: '合成 E3', year: 1990, month: 10, day: 12, hour: 20, minute: 0,
    gender: 'M', calendar_type: 'solar', lunar_leap: false, time_unknown: false,
    time_mode: 'shichen', latitude: 23.69, longitude: 120.96, timezone_offset: 8,
    timezone: 'Asia/Taipei', birth_city: 'Chiayi', birth_country: 'TW', plan: 'E3',
    target_year: 2040, as_of: '2040-12-31',
    bazi_school: 'korea', ayanamsa_type: 'raman', fold: 1,
  })
  assertEqual(payload.target_year, undefined)
  assertEqual(payload.as_of, undefined)
  assertEqual(payload.plan, undefined)
  assertEqual(payload.bazi_school, undefined)
  assertEqual(payload.ayanamsa_type, undefined)
  assertEqual(payload.fold, undefined)
  assertEqual(payload.time_mode, 'shichen')
  assertEqual(payload.latitude, 23.69)
  assertEqual(payload.timezone, 'Asia/Taipei')

  const legacyZeroCoordinates = request.buildCalculatorRequestPayload({
    name: '合成 E3 零座標', year: 1990, month: 10, day: 12, hour: 20, minute: 0,
    gender: 'M', plan: 'E3', latitude: 0, longitude: 0, cityLat: 0, cityLng: 0,
    timezone_offset: 0, target_year: 2040, as_of: '2040-12-31',
  })
  assertEqual(legacyZeroCoordinates.latitude, undefined)
  assertEqual(legacyZeroCoordinates.longitude, undefined)
  assertEqual(legacyZeroCoordinates.timezone_offset, undefined)
})

test('C/G15 可明確傳 target_year、as_of 與排盤學派選項，hash 任一變動都改變', () => {
  const base = {
    name: '合成 C', year: 1990, month: 10, day: 12, hour: 20, minute: 0,
    gender: 'M', target_year: 2026, as_of: '2026-08-09', bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri', fold: 0,
  }
  const payload = request.buildCalculatorRequestPayload(base, { consultationMode: true })
  assertEqual(payload.target_year, 2026)
  assertEqual(payload.as_of, '2026-08-09')
  assertEqual(payload.bazi_school, 'china_mainland')
  assertEqual(payload.ayanamsa_type, 'lahiri')
  assertEqual(payload.fold, 0)
  const first = request.hashCalculatorRequest(payload)
  const second = request.hashCalculatorRequest(request.buildCalculatorRequestPayload(
    { ...base, target_year: 2040 },
    { consultationMode: true },
  ))
  assert(/^sha256:[0-9a-f]{64}$/u.test(first))
  assert(first !== second)
})

test('C/G15 保留經緯度與 UTC 零值，並拒絕互相矛盾的未知時辰狀態', () => {
  const payload = request.buildCalculatorRequestPayload({
    name: '合成零值', year: 1990, month: 1, day: 1, hour: 0, minute: 0,
    gender: 'F', latitude: 0, longitude: 0, timezone_offset: 0,
    target_year: 2026, as_of: '2026-08-09', time_unknown: false, time_mode: 'exact',
  }, { consultationMode: true })
  assertEqual(payload.latitude, 0)
  assertEqual(payload.longitude, 0)
  assertEqual(payload.timezone_offset, 0)
  let contradiction
  try {
    request.buildCalculatorRequestPayload({
      name: '矛盾', year: 1990, month: 1, day: 1, hour: 12, gender: 'M',
      target_year: 2026, as_of: '2026-08-09', time_unknown: true, time_mode: 'shichen',
    }, { consultationMode: true })
  } catch (error) {
    contradiction = error
  }
  assert(contradiction && /必須一致/u.test(contradiction.message), '矛盾時辰狀態必須 fail closed')
})

test('legacy/E3 對抗矩陣與改造前 inline serializer 逐 byte 相同', () => {
  const common = {
    name: '合成 E3 對抗矩陣',
    year: 1990,
    month: 10,
    day: 12,
    hour: 0,
    gender: 'F',
    plan: 'E3',
    target_year: 2040,
    as_of: '2040-12-31',
    bazi_school: 'korea',
    ayanamsa_type: 'raman',
    fold: 1,
  }
  const cases = [
    { minute: undefined, time_unknown: undefined, time_mode: undefined },
    { minute: 0, time_unknown: false, time_mode: '', calendar_type: '', calendarType: 'lunar' },
    { minute: 30, time_unknown: true, time_mode: 'shichen' },
    { latitude: 0, longitude: 0, cityLat: 0, cityLng: 0, timezone_offset: 0 },
    { latitude: undefined, longitude: undefined, cityLat: 23.69, cityLng: 120.96, cityTz: 0 },
    { latitude: 25.03, longitude: 121.56, cityLat: 1, cityLng: 2, timezone_offset: 0 },
    { timezone: 'Asia/Taipei', birth_city: 'Taipei', birth_country: 'TW', lunar_leap: false, lunarLeap: true },
  ]
  for (const variant of cases) {
    const input = { ...common, ...variant }
    const expected = JSON.stringify(buildPreConsultationPayload(input))
    const actual = JSON.stringify(request.buildCalculatorRequestPayload(input))
    assertEqual(actual, expected, `legacy payload drift: ${JSON.stringify(variant)}`)
  }
})

done()
