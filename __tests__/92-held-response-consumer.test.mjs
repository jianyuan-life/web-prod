// 真的 Python held 回應,餵進真的 Node 消費端。
//
// 這條測試存在的原因:未知時辰的 held 機制在 Python 側是對的(實測 bazi 第四柱
// 是「未知」、birth_date 沒有 12:00、6 套 held),但那份回應從來沒有被送進
// normalizeCalculatorFacts。實際上它會被三條獨立的死因各自擋掉:
//   1. hasSubstantiveAnalysis 要求 detail ≥200 字 -> held slot 是 empty_shell
//   2. payload 指紋只扣 system,6 個 held slot 逐 byte 相同 -> duplicate_payload
//   3. hasCalculatorClientContract 要求 4 組干支,「未知」只湊得出 3 組
// 三者任一都足以讓 time_unknown=true 的 C/G15 永遠生不出報告。
//
// fixture 由 Python 嚴格端點實際產出,不是手寫的。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { normalizeCalculatorFacts } from '../lib/consultation/calculator-facts.ts'

const here = dirname(fileURLToPath(import.meta.url))
const held = JSON.parse(
  readFileSync(join(here, 'fixtures', 'consultation-v1-held-response.json'), 'utf8'),
)

const BIRTH = {
  name: '虛構案例甲', year: 1990, month: 6, day: 15, hour: 12, minute: 0,
  gender: 'M', time_unknown: true, time_mode: 'unknown', as_of: '2026-08-09',
}

// normalizeCalculatorFacts 拒絕時是拋 CalculatorFactsError,不是回傳 issues。
function issuesOf(response = held) {
  try {
    normalizeCalculatorFacts({ response, birthData: BIRTH, asOfDate: '2026-08-09' })
    return []
  } catch (error) {
    if (Array.isArray(error?.issues)) return error.issues
    return [{ code: error?.name ?? 'unknown', message: String(error?.message ?? error) }]
  }
}

test('fixture 真的是未知時辰的 held 形狀', () => {
  assert.equal(held.held_systems.length, 6)
  assert.equal(held.successful_systems.length, 9)
  assert.deepEqual(held.failed_systems, [])
  assert.ok(held.client_data.bazi.endsWith('未知'))
  assert.ok(!held.client_data.birth_date.includes('12:00'))
})

// 這裡只餵 response,沒有組完整的 attestation envelope,所以 personId /
// targetYear / bundleVersion / requestHash / responseAttestation /
// requestPayload 會各報一個 issue。那是測試呼叫面窄,不是產品缺陷,
// 所以斷言收斂成「沒有任何 held 相關的 issue」,不假裝驗了整條 envelope。
const HELD_RELATED_CODES = [
  'analyses.duplicate_payload',
  'analysis.empty_shell',
  'analysis.partial_failure',
  'client_data.contract_mismatch',
  'client_data.empty_shell',
  'analyses.system_set_mismatch',
]

test('真的 held 回應不再命中任何 held 相關的拒絕原因', () => {
  const codes = issuesOf().map((i) => i.code)
  const heldHits = codes.filter((c) => HELD_RELATED_CODES.includes(c))
  assert.deepEqual(heldHits, [], `held 回應仍被這些原因擋下:${heldHits}`)
})

test('同一份 fixture 若把 held 換成四柱資料就不該有 contract_mismatch —— 對照組', () => {
  const known = structuredClone(held)
  known.client_data.bazi = '庚午 壬午 辛亥 甲午'
  known.client_data.five_elements_simple = { 土: 0, 木: 1, 水: 2, 火: 3, 金: 2 }
  const codes = issuesOf(known).map((i) => i.code)
  assert.ok(!codes.includes('client_data.contract_mismatch'))
})

test('六個一模一樣的 held slot 不得被當成重複 payload', () => {
  const codes = issuesOf().map((i) => i.code)
  assert.ok(!codes.includes('analyses.duplicate_payload'))
})

test('held slot 不得被當成空殼', () => {
  const codes = issuesOf().map((i) => i.code)
  assert.ok(!codes.some((c) => c === 'analysis.empty_shell'))
})

test('三柱加明確「未知」是合法的 client contract', () => {
  const codes = issuesOf().map((i) => i.code)
  assert.ok(!codes.includes('client_data.contract_mismatch'))
})

test('三柱但沒有「未知」標記仍要擋 —— 時柱憑空消失是另一回事', () => {
  const broken = structuredClone(held)
  broken.client_data.bazi = '庚午 壬午 辛亥'
  const codes = issuesOf(broken).map((i) => i.code)
  assert.ok(codes.includes('client_data.contract_mismatch'))
})

test('放寬不等於什麼都收:真的空殼仍要擋', () => {
  const broken = structuredClone(held)
  const real = broken.analyses.find((a) => a.status === 'success')
  real.detail = '太短'
  real.good_points = []
  real.bad_points = []
  real.tables = []
  const codes = issuesOf(broken).map((i) => i.code)
  assert.ok(codes.length > 0, '把一套真讀盤挖空,竟然還通過')
})

test('偽裝成 held 但帶了正文的 slot 不得走 held 豁免', () => {
  const broken = structuredClone(held)
  const fake = broken.analyses.find((a) => a.status === 'held')
  fake.detail = '這裡塞了本來不該有的正文'
  fake.score = 88
  const codes = issuesOf(broken).map((i) => i.code)
  assert.ok(codes.length > 0, 'held 豁免被拿來夾帶內容')
})
