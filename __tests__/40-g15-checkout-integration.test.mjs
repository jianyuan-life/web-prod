import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  G15_SELECTION_COLUMNS,
  getG15ValidationHttpStatus,
  prepareCheckoutBirthData,
} from '../lib/checkout/prepare-checkout-birth-data.ts'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
} from '../lib/checkout/g15-independent-consent.ts'

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
const SELECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUBJECT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SUBJECT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const subjectForReport = (reportId) => reportId === REPORT_A ? SUBJECT_A : SUBJECT_B

function consent(reportIds) {
  const acceptedAt = new Date(Date.now() - 1_000).toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return {
    selection: {
      id: SELECTION_ID,
      purchaser_user_id: OWNER_ID,
      selected_report_ids: [...reportIds],
      selected_report_ids_hash: hashG15ConsentReportIds(reportIds),
      policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharing_scope: G15_CONSENT_SHARING_SCOPE,
      expires_at: expiresAt,
      superseded_at: null,
      consumed_at: null,
      consumed_stripe_session_id: null,
      consumed_report_id: null,
    },
    receipts: reportIds.map((reportId, index) => ({
      selection_id: SELECTION_ID,
      subject_report_id: reportId,
      subject_user_id: subjectForReport(reportId),
      subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
      status: 'accepted',
      accepted_at: acceptedAt,
      revoked_at: null,
      expires_at: expiresAt,
      accept_token_hash: null,
      revoke_token_hash: `sha256:${String(index + 3).repeat(64)}`,
    })),
    error: null,
  }
}

function familyContext() {
  return {
    stated_relationships: ['何宣逸與何紀萳是共同照顧孩子的伴侶。'],
    consultation_goals: ['希望理解家庭溝通節奏，並建立不互相打斷的討論方式。'],
  }
}

function eligibleRows(ids = [REPORT_A, REPORT_B]) {
  return ids.map((id, index) => ({
    id,
    client_name: index === 0 ? '何宣逸' : '何紀萳',
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    user_id: subjectForReport(id),
    customer_email: `${subjectForReport(id).slice(0, 8)}@example.test`,
    birth_data: {
      name: index === 0 ? '何宣逸' : '何紀萳',
      year: 1990,
      month: 1,
      day: index + 1,
      hour: 12,
      minute: 0,
      gender: 'F',
      marital_status: 'single',
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
    },
  }))
}

console.log('\n--- G15 checkout integration contract ---')

await test('E3 完全略過 C/G15 新契約，並保留原 birthData 物件與序列化結果', async () => {
  for (const planCode of ['E3']) {
    let queryCalls = 0
    const original = {
      plan_type: planCode === 'E3' ? 'single' : undefined,
      name: '原始資料',
      nested: { order: ['a', 'b'] },
    }
    const before = JSON.stringify(original)
    const result = await prepareCheckoutBirthData({
      planCode,
      birthData: original,
      auth: {},
      queryReports: async () => {
        queryCalls++
        return { data: [], error: null }
      },
    })

    assert(result.ok, `${planCode} 不應被 G15 驗證攔截`)
    assert(Object.is(result.birthData, original), `${planCode} 必須保留同一物件參考`)
    assertEqual(JSON.stringify(result.birthData), before, `${planCode} JSON payload 不得漂移`)
    assertEqual(queryCalls, 0, `${planCode} 不得新增 paid_reports 查詢`)
  }
})

await test('C 必須在付款前具備明確國曆、完整可重播輸入與不可變報告期間', async () => {
  const valid = eligibleRows([REPORT_A])[0].birth_data
  const accepted = await prepareCheckoutBirthData({
    planCode: 'C',
    birthData: valid,
    asOfDate: '2026-08-09',
    auth: {},
    queryReports: async () => { throw new Error('C 不應查詢 G15 報告') },
  })
  assert(accepted.ok)
  assert(!Object.is(accepted.birthData, valid), '合法 C 資料必須以新物件固定報告期間')
  assertEqual(accepted.birthData.as_of, '2026-08-09')
  assertEqual(accepted.birthData.target_year, 2026)
  assert(!('as_of' in valid), '不得反向改寫使用者的原始 birthData')

  for (const unsafe of [
    { ...valid, calendar_type: 'lunar' },
    { ...valid, calendar_type: undefined },
    { ...valid, latitude: undefined },
    { ...valid, timezone: undefined },
    { ...valid, time_mode: 'unknown', time_unknown: false },
  ]) {
    const rejected = await prepareCheckoutBirthData({
      planCode: 'C',
      birthData: unsafe,
      asOfDate: '2026-08-09',
      auth: {},
      queryReports: async () => { throw new Error('C 不應查詢 G15 報告') },
    })
    assert(!rejected.ok, '不完整 C 出生資料必須在 Stripe 前拒絕')
    assertEqual(rejected.code, 'INVALID_SELECTION')
  }
})

await test('G15 只接受 family_reports 與 report_ids，無認證或錯誤 schema 均在查詢前拒絕', async () => {
  const cases = [
    {
      birthData: { plan_type: 'family_email', report_ids: [REPORT_A, REPORT_B] },
      auth: { userId: OWNER_ID },
      code: 'INVALID_SELECTION',
    },
    {
      birthData: { plan_type: 'family_reports' },
      auth: { userId: OWNER_ID },
      code: 'INVALID_SELECTION',
    },
    {
      birthData: { plan_type: 'family_reports', report_ids: [REPORT_A, REPORT_B] },
      auth: {},
      code: 'AUTH_REQUIRED',
    },
  ]

  for (const item of cases) {
    let queryCalls = 0
    const result = await prepareCheckoutBirthData({
      planCode: 'G15',
      birthData: item.birthData,
      auth: item.auth,
      queryReports: async () => {
        queryCalls++
        return { data: [], error: null }
      },
    })
    assert(!result.ok, '非法 G15 結帳資料必須 fail closed')
    assertEqual(result.code, item.code)
    assertEqual(queryCalls, 0, '格式或認證錯誤不得查詢 DB')
  }
})

await test('合法 G15 只保留不同擁有者的 report_ids，member_names 必須依 DB 回傳並按選取順序重建', async () => {
  let queriedIds
  const submittedConsent = consent([REPORT_B, REPORT_A])
  const result = await prepareCheckoutBirthData({
    planCode: 'G15',
    asOfDate: '2026-08-09',
    birthData: {
      plan_type: 'family_reports',
      report_ids: [REPORT_B, REPORT_A],
      member_names: ['偽造甲', '偽造乙'],
      ...familyContext(),
      consent_selection_id: SELECTION_ID,
      consent_attestation: { accepted: true },
      injected_private_field: '不得流入訂單',
    },
    auth: { userId: OWNER_ID, email: 'owner@example.test' },
    queryReports: async (reportIds) => {
      queriedIds = [...reportIds]
      return { data: eligibleRows(), error: null }
    },
    queryConsent: async () => submittedConsent,
  })

  assert(result.ok, '合法的獨立擁有者 G15 選擇應通過')
  assertEqual(queriedIds, [REPORT_B, REPORT_A])
  assertEqual(result.birthData, {
    plan_type: 'family_reports',
    report_ids: [REPORT_B, REPORT_A],
    member_names: ['何紀萳', '何宣逸'],
    ...familyContext(),
    consent_selection_id: SELECTION_ID,
    consent_authority: {
      selection_id: SELECTION_ID,
      policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      purpose: G15_CONSENT_PURPOSE,
      sharing_scope: G15_CONSENT_SHARING_SCOPE,
      expires_at: submittedConsent.selection.expires_at,
      accepted_at_by_report: {
        [REPORT_A]: submittedConsent.receipts[1].accepted_at,
        [REPORT_B]: submittedConsent.receipts[0].accepted_at,
      },
      subject_user_ids_by_report: {
        [REPORT_B]: SUBJECT_B,
        [REPORT_A]: SUBJECT_A,
      },
    },
    as_of: '2026-08-09',
    target_year: 2026,
  })
  assert(!JSON.stringify(result.birthData).includes('偽造'), 'client member_names 不得流入可信資料')
  assert(!('injected_private_field' in result.birthData), 'G15 未知 client 欄位不得流入訂單')
})

await test('缺少或格式錯誤的逐位同意 selection locator 都在 DB 查詢前拒絕', async () => {
  for (const consent_selection_id of [undefined, '', 'not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
    let queryCalls = 0
    const result = await prepareCheckoutBirthData({
      planCode: 'G15',
      birthData: { plan_type: 'family_reports', report_ids: [REPORT_A, REPORT_B], consent_selection_id },
      auth: { userId: OWNER_ID },
      queryReports: async () => { queryCalls += 1; return { data: eligibleRows(), error: null } },
    })
    assert(!result.ok)
    assertEqual(result.code, 'CONSENT_REQUIRED')
    assertEqual(queryCalls, 0)
  }
})

await test('同一擁有者、缺列、不合格列與查詢失敗都不產生可信 birthData', async () => {
  const cases = [
    { expected: 'INVALID_SELECTION', data: eligibleRows().map((row) => ({ ...row, user_id: SUBJECT_A, customer_email: 'same-owner@example.test' })), error: null },
    { expected: 'REPORT_MISMATCH', data: eligibleRows([REPORT_A]), error: null },
    { expected: 'INELIGIBLE_REPORT', data: eligibleRows().map((row, index) => index === 1 ? { ...row, status: 'pending' } : row), error: null },
    { expected: 'QUERY_FAILED', data: null, error: new Error('DB unavailable') },
  ]

  for (const item of cases) {
    const result = await prepareCheckoutBirthData({
      planCode: 'G15',
      birthData: { plan_type: 'family_reports', report_ids: [REPORT_A, REPORT_B], ...familyContext(), consent_selection_id: SELECTION_ID },
      auth: { userId: OWNER_ID, email: 'owner@example.test' },
      queryReports: async () => ({ data: item.data, error: item.error }),
      queryConsent: async () => consent([REPORT_A, REPORT_B]),
    })
    assert(!result.ok, `${item.expected} 必須拒絕`)
    assertEqual(result.code, item.expected)
    assert(!('birthData' in result), '拒絕結果不得夾帶半套可信資料')
  }
})

await test('G15 Supabase projection 必須固定為最小明確欄位集合', () => {
  assertEqual(
    G15_SELECTION_COLUMNS,
    'id,client_name,plan_code,status,deleted_at,user_id,customer_email,birth_data',
  )
})

await test('驗證結果映射為 fail-closed HTTP 狀態且不把 DB 失敗誤報成 client error', () => {
  assertEqual(getG15ValidationHttpStatus('AUTH_REQUIRED'), 401)
  assertEqual(getG15ValidationHttpStatus('FORBIDDEN'), 403)
  assertEqual(getG15ValidationHttpStatus('QUERY_FAILED'), 503)
  assertEqual(getG15ValidationHttpStatus('CONSENT_QUERY_FAILED'), 503)
  for (const code of ['INVALID_SELECTION', 'REPORT_MISMATCH', 'INELIGIBLE_REPORT']) {
    assertEqual(getG15ValidationHttpStatus(code), 400)
  }
})

await test('checkout route 在 Stripe/優惠計算前驗證 G15，且所有持久化 sink 都改用可信資料', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const routeSource = await fs.readFile(path.join(here, '..', 'app', 'api', 'checkout', 'route.ts'), 'utf8')
  const prepareIndex = routeSource.indexOf('prepareCheckoutBirthData({')
  const stripeIndex = routeSource.indexOf('const stripeKey')
  const promoIndex = routeSource.indexOf(".from('promotions')")

  assert(routeSource.includes("from '@/lib/checkout/prepare-checkout-birth-data'"), 'route 必須匯入 G15 準備 helper')
  assert(prepareIndex > 0, 'route 必須呼叫 G15 準備 helper')
  assert(prepareIndex < stripeIndex && prepareIndex < promoIndex, 'G15 必須在 Stripe 與優惠計算前 fail closed')
  assert(routeSource.includes('.select(G15_SELECTION_COLUMNS)'), 'paid_reports 查詢必須使用明確欄位常數')
  assert(!routeSource.includes('birth_data: birthData'), '任何訂單/草稿不得再持久化未驗證 birthData')
  assert(!routeSource.includes('birthData?.member_names'), '免費訂單名稱不得再讀 client member_names')
  assert(routeSource.includes('birth_data: trustedBirthData'), '持久化 sink 必須使用 trustedBirthData')
  assert(routeSource.includes('trustedBirthData?.member_names'), 'G15 client_name 必須取自 trustedBirthData')
})

console.log(JSON.stringify({ suite: 'G15 checkout integration contract', passed, failed, skipped: 0 }))
process.exitCode = failed > 0 ? 1 : 0
