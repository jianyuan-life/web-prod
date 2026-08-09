import { readFileSync } from 'node:fs'
import { g15ReportEligibility } from '../lib/checkout/validate-g15-selection.ts'

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed++
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `期望 ${JSON.stringify(expected)}，實得 ${JSON.stringify(actual)}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '斷言失敗')
}

function birthData(overrides = {}) {
  return {
    name: '何宣逸',
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0,
    gender: 'M',
    time_unknown: false,
    time_mode: 'exact',
    calendar_type: 'solar',
    lunar_leap: false,
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    birth_country: 'TW',
    birth_city: '台北（台灣）',
    birth_location_precision: 'city',
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
    ...overrides,
  }
}

function reportRow(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    client_name: '何宣逸',
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    customer_email: 'owner@example.test',
    birth_data: birthData(),
    ...overrides,
  }
}

console.log('\n--- G15 search eligibility projection ---')

await test('完整且可重播的 C 報告才能顯示為可加入', () => {
  assertEqual(g15ReportEligibility(reportRow()), {
    eligible: true,
    reasonCode: null,
    reason: null,
  })
})

await test('農曆或未明確標示曆法的舊報告會給出可理解的人工確認原因', () => {
  for (const unsafeBirthData of [
    birthData({ calendar_type: 'lunar' }),
    (() => {
      const value = birthData()
      delete value.calendar_type
      return value
    })(),
  ]) {
    const result = g15ReportEligibility(reportRow({ birth_data: unsafeBirthData }))
    assertEqual(result, {
      eligible: false,
      reasonCode: 'CALENDAR_REVIEW_REQUIRED',
      reason: '這份人生藍圖的曆法資料需要人工確認，暫時不能加入',
    })
  }
})

await test('出生時間精度缺失、矛盾或無法重播時不可顯示為可加入', () => {
  const unsafePatches = [
    { time_mode: undefined },
    { time_mode: 'unknown', time_unknown: false },
    { time_mode: 'unknown', time_unknown: true, hour: 9 },
    { time_mode: 'shichen', time_unknown: false, minute: 30 },
    { hour: 24 },
  ]
  for (const patch of unsafePatches) {
    assertEqual(
      g15ReportEligibility(reportRow({ birth_data: birthData(patch) })),
      {
        eligible: false,
        reasonCode: 'BIRTH_TIME_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生時間需要重新確認，暫時不能加入',
      },
    )
  }
})

await test('舊 C 報告遇到夏令時間缺口或未指定重疊側時不可加入 G15', () => {
  for (const unsafeBirthData of [
    birthData({
      year: 1990,
      month: 4,
      day: 1,
      hour: 2,
      minute: 30,
      timezone: 'America/New_York',
      timezone_offset: -5,
    }),
    birthData({
      year: 1990,
      month: 10,
      day: 28,
      hour: 1,
      minute: 30,
      timezone: 'America/New_York',
      timezone_offset: -4,
    }),
  ]) {
    assertEqual(
      g15ReportEligibility(reportRow({ birth_data: unsafeBirthData })),
      {
        eligible: false,
        reasonCode: 'BIRTH_TIME_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生時間正逢時制切換，需要重新確認後才能加入',
      },
    )
  }

  assertEqual(
    g15ReportEligibility(reportRow({ birth_data: birthData({
      year: 1990,
      month: 10,
      day: 28,
      hour: 1,
      minute: 30,
      timezone: 'America/New_York',
      timezone_offset: -4,
      fold: 0,
    }) })),
    { eligible: true, reasonCode: null, reason: null },
  )
})

await test('缺少座標、IANA 時區或時差時不可顯示為可加入', () => {
  const unsafePatches = [
    { latitude: undefined },
    { longitude: undefined },
    { timezone: undefined },
    { timezone: 'UTC+8' },
    { timezone_offset: undefined },
    { timezone_offset: 18 },
  ]
  for (const patch of unsafePatches) {
    assertEqual(
      g15ReportEligibility(reportRow({ birth_data: birthData(patch) })),
      {
        eligible: false,
        reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
        reason: '這份人生藍圖的出生地與時區資料不完整，暫時不能加入',
      },
    )
  }
})

await test('舊 C 的固定城市時差若不符合出生當下 DST，不可加入 G15', () => {
  assertEqual(
    g15ReportEligibility(reportRow({ birth_data: birthData({
      year: 1990,
      month: 7,
      day: 1,
      timezone: 'America/New_York',
      timezone_offset: -5,
      latitude: 40.7128,
      longitude: -74.006,
    }) })),
    {
      eligible: false,
      reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生時區未包含當時的夏令時間，暫時不能加入',
    },
  )
})

await test('舊 C 缺少城市來源證明或只存國家代表座標時不可加入 G15', () => {
  for (const unsafePatch of [
    { birth_location_precision: undefined },
    { birth_location_precision: 'country_representative', birth_city: '中國', birth_country: 'CN' },
  ]) {
    assertEqual(
      g15ReportEligibility(reportRow({ birth_data: birthData(unsafePatch) })),
      {
        eligible: false,
        reasonCode: 'BIRTHPLACE_REVIEW_REQUIRED',
        reason: '這份人生藍圖的實際出生城市需要重新確認，暫時不能加入',
      },
    )
  }
})

await test('未成年人報告在專屬安全流程完成前不可加入 G15', () => {
  assertEqual(
    g15ReportEligibility(reportRow({ birth_data: birthData({ year: 2020 }) })),
    {
      eligible: false,
      reasonCode: 'MINOR_REVIEW_REQUIRED',
      reason: '未成年人專屬的內容與監護流程尚未開放，這份報告目前不能加入',
    },
  )
})

await test('出生資料結構缺失或日期不存在時只回傳安全的摘要原因', () => {
  for (const row of [
    reportRow({ birth_data: null }),
    reportRow({ birth_data: birthData({ month: 2, day: 31 }) }),
    reportRow({ client_name: '何宣逸', birth_data: birthData({ name: '不同的人' }) }),
  ]) {
    const result = g15ReportEligibility(row)
    assertEqual(result, {
      eligible: false,
      reasonCode: 'BIRTH_DATA_REVIEW_REQUIRED',
      reason: '這份人生藍圖的出生資料需要重新確認，暫時不能加入',
    })
    assert(!JSON.stringify(result).includes('owner@example.test'), '原因不得夾帶 email')
    assert(!JSON.stringify(result).includes('不同的人'), '原因不得夾帶出生資料姓名')
  }
})

await test('搜尋 API 必須先讀取可重播欄位，將不合格報告移出現有 reports 清單', () => {
  const route = readFileSync(
    new URL('../app/api/checkout/search-reports/route.ts', import.meta.url),
    'utf8',
  )
  const projection = readFileSync(
    new URL('../lib/checkout/g15-search-results.ts', import.meta.url),
    'utf8',
  )
  assert(/const selectColumns\s*=\s*[^\n]*birth_data/u.test(route), '共用帳戶查詢欄位必須包含 birth_data')
  assert(route.includes('.select(selectColumns)'), 'user_id 與 email fallback 必須共用同一安全欄位集合')
  assert(route.includes('projectG15SearchReports'), 'API 必須重用 G15 eligibility 與同人去重投影')
  assert(
    /const reports\s*=\s*projectedReports\.filter\(\(report\)\s*=>\s*report\.eligible\)/u.test(projection),
    '舊前端只會讀 reports，因此不合格報告不得留在 reports',
  )
  assert(
    /const unavailableReports\s*=\s*projectedReports\.filter\(\(report\)\s*=>\s*!report\.eligible\)/u.test(projection),
    'API 應保留不可用原因供介面說明',
  )
  assert(!/birth_data\s*:/u.test(route), 'API response 不得回傳完整出生資料')
})

console.log(JSON.stringify({ suite: 'G15 search eligibility projection', passed, failed, skipped: 0 }))
process.exitCode = failed > 0 ? 1 : 0
