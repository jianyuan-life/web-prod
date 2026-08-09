import { validateG15Selection } from '../lib/checkout/validate-g15-selection.ts'

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

function assert(condition, message) {
  if (!condition) throw new Error(message || '斷言失敗')
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `期望 ${JSON.stringify(expected)}，實得 ${JSON.stringify(actual)}`)
  }
}

const REPORT_A = '11111111-1111-4111-8111-111111111111'
const REPORT_B = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function birthData(name, day = 1) {
  return {
    name,
    year: 1990,
    month: 1,
    day,
    hour: 12,
    minute: 0,
    gender: 'F',
    time_unknown: false,
    time_mode: 'exact',
    calendar_type: 'solar',
    lunar_leap: false,
    latitude: 25.033,
    longitude: 121.5654,
    timezone: 'Asia/Taipei',
    timezone_offset: 8,
    bazi_school: 'china_mainland',
    ayanamsa_type: 'lahiri',
  }
}

console.log('\n--- G15 server-side selection validator ---')

await test('成功時只採信 DB 列，並按客戶選擇順序產生 memberNames', async () => {
  let queriedIds
  const result = await validateG15Selection({
    selectedReportIds: [REPORT_B, REPORT_A],
    member_names: ['client 偽造名稱 A', 'client 偽造名稱 B'],
    auth: { userId: OWNER_ID, email: 'owner@example.test' },
    queryReports: async (reportIds) => {
      queriedIds = [...reportIds]
      return {
        data: [
          {
            id: REPORT_A,
            client_name: '何宣逸',
            plan_code: 'C',
            status: 'completed',
            deleted_at: null,
            user_id: OWNER_ID,
            customer_email: 'owner@example.test',
            birth_data: birthData('何宣逸', 1),
          },
          {
            id: REPORT_B,
            client_name: '何紀萳',
            plan_code: 'C',
            status: 'completed',
            deleted_at: null,
            user_id: OWNER_ID,
            customer_email: 'owner@example.test',
            birth_data: birthData('何紀萳', 2),
          },
        ],
        error: null,
      }
    },
  })

  assert(result.ok, '合法的同帳戶 C 報告選擇應通過')
  assertEqual(queriedIds, [REPORT_B, REPORT_A])
  assertEqual(result.reportIds, [REPORT_B, REPORT_A])
  assertEqual(result.memberNames, ['何紀萳', '何宣逸'])
})

await test('非陣列或含非字串的 client payload 會安全拒絕，不拋出 runtime error', async () => {
  let queryCalls = 0
  const queryReports = async () => {
    queryCalls++
    return { data: [], error: null }
  }

  for (const selectedReportIds of [undefined, REPORT_A, [REPORT_A, 42]]) {
    const result = await validateG15Selection({
      selectedReportIds,
      auth: { userId: OWNER_ID },
      queryReports,
    })
    assert(!result.ok, '非法 payload 必須回傳拒絕結果')
    assertEqual(result.code, 'INVALID_SELECTION')
  }

  assertEqual(queryCalls, 0, '非法 payload 不得觸及 DB')
})

await test('少於 2 筆或超過 8 筆時在查詢 DB 前拒絕', async () => {
  let queryCalls = 0
  const queryReports = async () => {
    queryCalls++
    return { data: [], error: null }
  }

  for (const selectedReportIds of [[REPORT_A], Array.from({ length: 9 }, (_, index) =>
    `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`)]) {
    const result = await validateG15Selection({
      selectedReportIds,
      auth: { userId: OWNER_ID, email: 'owner@example.test' },
      queryReports,
    })
    assert(!result.ok, '超出 2–8 筆範圍必須拒絕')
    assertEqual(result.code, 'INVALID_SELECTION')
  }

  assertEqual(queryCalls, 0, '格式驗證失敗不得查詢 DB')
})

await test('每個 report id 必須是唯一的標準 UUID，大小寫不能繞過重複檢查', async () => {
  let queryCalls = 0
  const queryReports = async () => {
    queryCalls++
    return { data: [], error: null }
  }

  for (const selectedReportIds of [
    [REPORT_A, REPORT_A.toUpperCase()],
    [REPORT_A, 'not-a-uuid'],
    [REPORT_A, '00000000-0000-0000-0000-000000000000'],
  ]) {
    const result = await validateG15Selection({
      selectedReportIds,
      auth: { userId: OWNER_ID, email: 'owner@example.test' },
      queryReports,
    })
    assert(!result.ok, '重複、非 UUID 或 nil UUID 必須拒絕')
    assertEqual(result.code, 'INVALID_SELECTION')
  }

  assertEqual(queryCalls, 0, '無效 ID 不得查詢 DB')
})

await test('缺少已驗證 user id 與 email 時 fail closed，不查詢 DB', async () => {
  let queryCalls = 0
  const queryReports = async () => {
    queryCalls++
    return { data: [], error: null }
  }

  for (const auth of [undefined, {}, { userId: ' ', email: ' ' }]) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth,
      queryReports,
    })
    assert(!result.ok, '無認證身分不得驗證家庭報告')
    assertEqual(result.code, 'AUTH_REQUIRED')
  }

  assertEqual(queryCalls, 0, '無認證身分不得查詢 DB')
})

await test('DB 回傳 error 或查詢拋錯都 fail closed，不回傳半套結果', async () => {
  const queryFunctions = [
    async () => ({ data: [], error: new Error('database unavailable') }),
    async () => { throw new Error('network timeout') },
  ]

  for (const queryReports of queryFunctions) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID, email: 'owner@example.test' },
      queryReports,
    })
    assert(!result.ok, '查詢異常必須拒絕')
    assertEqual(result.code, 'QUERY_FAILED')
    assert(!('memberNames' in result), '失敗時不得夾帶部分成員資料')
  }
})

await test('DB 必須對每個選取 UUID 正好回傳一列，缺列、多列或重複列均拒絕', async () => {
  const validRow = (id) => ({
    id,
    client_name: '成員',
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    user_id: OWNER_ID,
    customer_email: 'owner@example.test',
    birth_data: birthData('成員'),
  })
  const reportC = '33333333-3333-4333-8333-333333333333'
  const cases = [
    [validRow(REPORT_A)],
    [validRow(REPORT_A), validRow(REPORT_B), validRow(reportC)],
    [validRow(REPORT_A), validRow(REPORT_A)],
  ]

  for (const data of cases) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID },
      queryReports: async () => ({ data, error: null }),
    })
    assert(!result.ok, '不完整或不精確的 DB 結果必須拒絕')
    assertEqual(result.code, 'REPORT_MISMATCH')
  }
})

await test('每份 DB 報告都必須是 C、completed 且 deleted_at 為 null', async () => {
  const validRow = (id) => ({
    id,
    client_name: '成員',
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    user_id: OWNER_ID,
    customer_email: 'owner@example.test',
    birth_data: birthData('成員'),
  })
  const invalidPatches = [
    { plan_code: 'G15' },
    { status: 'pending' },
    { deleted_at: '2026-08-09T00:00:00.000Z' },
  ]

  for (const patch of invalidPatches) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID },
      queryReports: async () => ({
        data: [{ ...validRow(REPORT_A), ...patch }, validRow(REPORT_B)],
        error: null,
      }),
    })
    assert(!result.ok, '非 C、未完成或已刪除報告必須拒絕')
    assertEqual(result.code, 'INELIGIBLE_REPORT')
  }
})

await test('歷史農曆或未標示曆法的 C 報告不得被當成國曆重排進 G15', async () => {
  for (const unsafeBirthData of [
    { ...birthData('何宣逸', 1), calendar_type: 'lunar' },
    (() => { const value = birthData('何宣逸', 1); delete value.calendar_type; return value })(),
  ]) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID },
      queryReports: async () => ({
        data: [
          { id: REPORT_A, client_name: '何宣逸', plan_code: 'C', status: 'completed', deleted_at: null, user_id: OWNER_ID, customer_email: null, birth_data: unsafeBirthData },
          { id: REPORT_B, client_name: '何紀萳', plan_code: 'C', status: 'completed', deleted_at: null, user_id: OWNER_ID, customer_email: null, birth_data: birthData('何紀萳', 2) },
        ],
        error: null,
      }),
    })
    assertEqual(result.ok, false)
    assertEqual(result.code, 'INELIGIBLE_REPORT')
  }
})

await test('歷史 C 報告缺少可重播的地點、時區或排盤設定時不得進入 G15', async () => {
  const unsafePatches = [
    { latitude: undefined },
    { longitude: undefined },
    { timezone: undefined },
    { timezone: 'Not/A_Zone' },
    { timezone_offset: undefined },
    { timezone_offset: 18 },
    { bazi_school: 'imaginary-school' },
    { ayanamsa_type: 'imaginary-ayanamsa' },
    { time_mode: 'unknown', time_unknown: false },
  ]
  for (const patch of unsafePatches) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID },
      queryReports: async () => ({
        data: [
          { id: REPORT_A, client_name: '何宣逸', plan_code: 'C', status: 'completed', deleted_at: null, user_id: OWNER_ID, customer_email: null, birth_data: { ...birthData('何宣逸', 1), ...patch } },
          { id: REPORT_B, client_name: '何紀萳', plan_code: 'C', status: 'completed', deleted_at: null, user_id: OWNER_ID, customer_email: null, birth_data: birthData('何紀萳', 2) },
        ],
        error: null,
      }),
    })
    assertEqual(result.ok, false)
    assertEqual(result.code, 'INELIGIBLE_REPORT')
  }
})

await test('人物指紋必須綁定完整排盤輸入，不能把同名同生日但不同出生地誤判為同一份盤', async () => {
  const base = {
    plan_code: 'C', status: 'completed', deleted_at: null,
    user_id: OWNER_ID, customer_email: 'owner@example.test',
  }
  const result = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID },
    queryReports: async () => ({ data: [
      { ...base, id: REPORT_A, client_name: '同名', birth_data: birthData('同名', 1) },
      { ...base, id: REPORT_B, client_name: '同名', birth_data: { ...birthData('同名', 1), latitude: 22.3193, longitude: 114.1694, timezone: 'Asia/Hong_Kong' } },
    ], error: null }),
  })
  assert(result.ok, '不同出生地與時區是不同的排盤輸入，不得被截短指紋誤擋')
  assertEqual(new Set(result.personFingerprints).size, 2)
})

await test('成員姓名缺失或只有空白時 fail closed，不產生空白家庭角色', async () => {
  const result = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID },
    queryReports: async () => ({
      data: [
        {
          id: REPORT_A,
          client_name: '有效成員',
          plan_code: 'C',
          status: 'completed',
          deleted_at: null,
          user_id: OWNER_ID,
          customer_email: null,
          birth_data: birthData('有效成員', 1),
        },
        {
          id: REPORT_B,
          client_name: '   ',
          plan_code: 'C',
          status: 'completed',
          deleted_at: null,
          user_id: OWNER_ID,
          customer_email: null,
          birth_data: birthData('空白成員', 2),
        },
      ],
      error: null,
    }),
  })

  assert(!result.ok, '空白成員姓名不得通過')
  assertEqual(result.code, 'INELIGIBLE_REPORT')
})

await test('只要一份報告既不屬於已驗證 user id，也不屬於已驗證 email，整組拒絕', async () => {
  const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const data = [
    {
      id: REPORT_A,
      client_name: '自己的報告',
      plan_code: 'C',
      status: 'completed',
      deleted_at: null,
      user_id: OWNER_ID,
      customer_email: 'owner@example.test',
      birth_data: birthData('自己的報告', 1),
    },
    {
      id: REPORT_B,
      client_name: '別人的報告',
      plan_code: 'C',
      status: 'completed',
      deleted_at: null,
      user_id: otherUserId,
      customer_email: 'other@example.test',
      birth_data: birthData('別人的報告', 2),
    },
  ]

  const result = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID, email: 'owner@example.test' },
    queryReports: async () => ({ data, error: null }),
  })

  assert(!result.ok, '跨帳戶報告不得通過')
  assertEqual(result.code, 'FORBIDDEN')
  assert(!JSON.stringify(result).includes('別人的報告'), '拒絕結果不得洩漏成員姓名')
  assert(!JSON.stringify(result).includes('other@example.test'), '拒絕結果不得洩漏他人 email')
})

await test('舊報告沒有同一 user_id 時，仍可用已驗證購買者 email 通過（不分大小寫）', async () => {
  const data = [
    {
      id: REPORT_A,
      client_name: '成員 A',
      plan_code: 'C',
      status: 'completed',
      deleted_at: null,
      user_id: null,
      customer_email: 'owner@example.test',
      birth_data: birthData('成員 A', 1),
    },
    {
      id: REPORT_B,
      client_name: '成員 B',
      plan_code: 'C',
      status: 'completed',
      deleted_at: null,
      user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      customer_email: 'OWNER@EXAMPLE.TEST',
      birth_data: birthData('成員 B', 2),
    },
  ]

  const result = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { email: ' Owner@Example.Test ' },
    queryReports: async () => ({ data, error: null }),
  })

  assert(result.ok, '已驗證購買者 email 應可處理舊報告的 user_id 缺口')
  assertEqual(result.memberNames, ['成員 A', '成員 B'])
})

await test('不同 report UUID 若實為同一人物，或 client_name 與 birth_data.name 不一致，必須拒絕', async () => {
  const base = {
    plan_code: 'C', status: 'completed', deleted_at: null,
    user_id: OWNER_ID, customer_email: 'owner@example.test',
  }
  const duplicate = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID },
    queryReports: async () => ({ data: [
      { ...base, id: REPORT_A, client_name: '同一人', birth_data: birthData('同一人', 1) },
      { ...base, id: REPORT_B, client_name: '同一人', birth_data: birthData('同一人', 1) },
    ], error: null }),
  })
  assert(!duplicate.ok)
  assertEqual(duplicate.code, 'DUPLICATE_PERSON')

  const mismatch = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID },
    queryReports: async () => ({ data: [
      { ...base, id: REPORT_A, client_name: '顯示甲', birth_data: birthData('出生甲', 1) },
      { ...base, id: REPORT_B, client_name: '顯示乙', birth_data: birthData('顯示乙', 2) },
    ], error: null }),
  })
  assert(!mismatch.ok)
  assertEqual(mismatch.code, 'INELIGIBLE_REPORT')
})

await test('查詢異常內容含 PII 時，驗證器不得寫入任何 console', async () => {
  const original = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  }
  const logs = []
  console.error = (...args) => logs.push(args)
  console.warn = (...args) => logs.push(args)
  console.info = (...args) => logs.push(args)
  console.debug = (...args) => logs.push(args)

  let result
  try {
    result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID, email: 'owner@example.test' },
      queryReports: async () => ({
        data: null,
        error: new Error('owner@example.test / 何宣逸 / 1990-01-01'),
      }),
    })
  } finally {
    console.error = original.error
    console.warn = original.warn
    console.info = original.info
    console.debug = original.debug
  }

  assert(!result.ok, '查詢錯誤必須 fail closed')
  assertEqual(logs.length, 0, '驗證器不得記錄可能含 PII 的 DB 錯誤')
  assert(!JSON.stringify(result).includes('owner@example.test'), '回傳結果不得夾帶 PII')
})

await test('結帳前必須拒絕不存在的國曆日期，並正確處理閏年二月', async () => {
  const base = {
    plan_code: 'C', status: 'completed', deleted_at: null,
    user_id: OWNER_ID, customer_email: 'owner@example.test',
  }
  for (const invalidDate of [
    { year: 1990, month: 2, day: 31 },
    { year: 1991, month: 4, day: 31 },
    { year: 1900, month: 2, day: 29 },
  ]) {
    const result = await validateG15Selection({
      selectedReportIds: [REPORT_A, REPORT_B],
      auth: { userId: OWNER_ID },
      queryReports: async () => ({ data: [
        { ...base, id: REPORT_A, client_name: '成員 A', birth_data: { ...birthData('成員 A', 1), ...invalidDate } },
        { ...base, id: REPORT_B, client_name: '成員 B', birth_data: birthData('成員 B', 2) },
      ], error: null }),
    })
    assert(!result.ok)
    assertEqual(result.code, 'INELIGIBLE_REPORT')
  }

  const leapDay = await validateG15Selection({
    selectedReportIds: [REPORT_A, REPORT_B],
    auth: { userId: OWNER_ID },
    queryReports: async () => ({ data: [
      { ...base, id: REPORT_A, client_name: '成員 A', birth_data: { ...birthData('成員 A', 29), year: 2000, month: 2 } },
      { ...base, id: REPORT_B, client_name: '成員 B', birth_data: birthData('成員 B', 2) },
    ], error: null }),
  })
  assert(leapDay.ok, '2000-02-29 是有效國曆日期')
})

console.log(JSON.stringify({ suite: 'G15 server-side selection validator', passed, failed, skipped: 0 }))
process.exitCode = failed > 0 ? 1 : 0
