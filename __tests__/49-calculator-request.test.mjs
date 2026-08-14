import { suite, test, assert, assertEqual, done } from './harness.mjs'

let request
let loadError
try {
  request = await import('../lib/consultation/calculator-request.ts')
} catch (error) {
  loadError = error
}

suite('Fly calculator request 唯一序列化契約')

function assertThrows(fn, pattern) {
  let thrown
  try { fn() } catch (error) { thrown = error }
  assert(thrown instanceof Error, '預期 fail closed，但沒有拋出錯誤')
  assert(pattern.test(thrown.message), `錯誤訊息不符：${thrown.message}`)
}

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
    ayanamsa_type: 'lahiri', fold: 0, calendar_type: 'solar', lunar_leap: false,
    time_unknown: false, time_mode: 'shichen', latitude: 25.033, longitude: 121.5654,
    timezone: 'Asia/Taipei', timezone_offset: 8,
  }
  const payload = request.buildCalculatorRequestPayload(base, { consultationMode: true })
  assertEqual(payload.target_year, 2026)
  assertEqual(payload.as_of, '2026-08-09')
  assertEqual(payload.bazi_school, 'china_mainland')
  assertEqual(payload.ayanamsa_type, 'lahiri')
  assertEqual(payload.fold, 0)
  const first = request.hashCalculatorRequest(payload)
  const second = request.hashCalculatorRequest(request.buildCalculatorRequestPayload(
    { ...base, target_year: 2040, as_of: '2040-12-31' },
    { consultationMode: true },
  ))
  assert(/^sha256:[0-9a-f]{64}$/u.test(first))
  assert(first !== second)
})

test('C/G15 保留經緯度與 UTC 零值，並拒絕互相矛盾的未知時辰狀態', () => {
  const payload = request.buildCalculatorRequestPayload({
    name: '合成零值', year: 1990, month: 1, day: 1, hour: 0, minute: 0,
    gender: 'F', latitude: 0, longitude: 0, timezone_offset: 0,
    timezone: 'UTC',
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

test('C/G15 strict payload 只接受出生瞬間的 IANA 時差，拒絕 stale city base offset', () => {
  const common = {
    name: '合成歷史時制', year: 1975, month: 7, day: 1, hour: 12, minute: 30,
    gender: 'F', latitude: 25.033, longitude: 121.5654,
    timezone: 'Asia/Taipei', target_year: 2026, as_of: '2026-08-09',
    time_unknown: false, time_mode: 'exact', fold: 0,
  }

  assertThrows(
    () => request.buildCalculatorRequestPayload(
      { ...common, timezone_offset: 8 },
      { consultationMode: true },
    ),
    /出生瞬間/u,
  )
  assertEqual(request.buildCalculatorRequestPayload(
    { ...common, timezone_offset: 9 },
    { consultationMode: true },
  ).timezone_offset, 9)

  assertThrows(
    () => request.buildCalculatorRequestPayload({
      ...common,
      year: 1969,
      month: 1,
      day: 1,
      timezone: 'Europe/London',
      latitude: 51.5072,
      longitude: -0.1276,
      timezone_offset: 0,
    }, { consultationMode: true }),
    /出生瞬間/u,
  )
})

test('C/G15 strict payload 對 invalid/nonexistent/ambiguous IANA local time fail closed', () => {
  const common = {
    name: '合成時制邊界', year: 2021, month: 11, day: 7, hour: 1, minute: 30,
    gender: 'F', latitude: 40.7128, longitude: -74.006,
    timezone: 'America/New_York', timezone_offset: -4,
    target_year: 2026, as_of: '2026-08-09', time_unknown: false, time_mode: 'exact',
  }
  assertThrows(
    () => request.buildCalculatorRequestPayload(common, { consultationMode: true }),
    /fold/u,
  )
  assertEqual(request.buildCalculatorRequestPayload(
    { ...common, fold: 0 },
    { consultationMode: true },
  ).timezone_offset, -4)
  assertEqual(request.buildCalculatorRequestPayload(
    { ...common, fold: 1, timezone_offset: -5 },
    { consultationMode: true },
  ).timezone_offset, -5)
  assertThrows(
    () => request.buildCalculatorRequestPayload(
      { ...common, year: 2021, month: 3, day: 14, hour: 2, fold: 0, timezone_offset: -5 },
      { consultationMode: true },
    ),
    /不存在/u,
  )
  assertThrows(
    () => request.buildCalculatorRequestPayload(
      { ...common, timezone: 'Invalid\/Zone', fold: 0 },
      { consultationMode: true },
    ),
    /時區/u,
  )
  assertThrows(
    () => request.buildCalculatorRequestPayload({
      ...common,
      year: 2000,
      month: 1,
      day: 15,
      hour: 12,
      minute: 0,
      timezone: 'Africa/Khartoum',
      timezone_offset: 2,
      time_unknown: true,
      time_mode: 'unknown',
    }, { consultationMode: true }),
    /不存在/u,
  )
})

test('C/G15 strict payload 與 Python canonical time/location contract 逐欄一致', () => {
  const base = {
    name: '合成跨語言契約', year: 1990, month: 1, day: 1, hour: 7, minute: 45,
    gender: 'F', calendar_type: 'solar', lunar_leap: false,
    latitude: 25.033, longitude: 121.5654, timezone: 'Asia/Taipei', timezone_offset: 8,
    target_year: 2026, as_of: '2026-08-09', bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri', fold: 0,
  }
  const unknown = request.buildCalculatorRequestPayload({
    ...base, time_unknown: true, time_mode: 'unknown',
  }, { consultationMode: true })
  assertEqual(unknown.hour, 12)
  assertEqual(unknown.minute, 0)

  const trimmed = request.buildCalculatorRequestPayload({
    ...base, hour: 12, minute: 0, time_unknown: false, time_mode: 'exact',
    timezone: ' Asia/Taipei ',
  }, { consultationMode: true })
  assertEqual(trimmed.timezone, 'Asia/Taipei')

  assertThrows(
    () => request.buildCalculatorRequestPayload({
      ...base,
      year: 1985,
      month: 10,
      day: 27,
      hour: 2,
      minute: 45,
      timezone: 'Australia/Lord_Howe',
      timezone_offset: 11,
      time_unknown: false,
      time_mode: 'shichen',
    }, { consultationMode: true }),
    /不存在/u,
  )

  for (const invalid of [
    { latitude: undefined },
    { longitude: undefined },
    { timezone: undefined },
    { timezone_offset: undefined },
    { time_unknown: false, time_mode: 'exact', minute: undefined },
    { ayanamsa_type: 'raman' },
    { target_year: 2027 },
  ]) {
    assertThrows(
      () => request.buildCalculatorRequestPayload({
        ...base,
        hour: 12,
        minute: 0,
        time_unknown: false,
        time_mode: 'exact',
        ...invalid,
      }, { consultationMode: true }),
      /consultation|IANA|出生|緯度|經度|時區|ayanamsa|target_year|minute/u,
    )
  }
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
