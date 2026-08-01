// 極簡測試工具 — 零依賴
// v5.10.470:加跨 suite 總計數器。原設計 suite() 會重置計數、done() 只輸出最後一個
// suite 的結果 → 非最後 suite 的 FAIL 會被 runner 靜默丟棄、可能綠燈放行(2026-08-01
// 實測:全套 205 PASS 只被計入 126)。done() 改輸出「檔案累計」,runner 取最後一行即為全檔真值。
let _passed = 0, _failed = 0, _skipped = 0, _suiteName = ''
let _totalPassed = 0, _totalFailed = 0, _totalSkipped = 0

export function suite(name) {
  _suiteName = name
  _passed = 0; _failed = 0; _skipped = 0
  console.log(`\n--- ${name} ---`)
}

export function test(name, fn) {
  try {
    fn()
    _passed++; _totalPassed++
    console.log(`  [PASS] ${name}`)
  } catch (e) {
    _failed++; _totalFailed++
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${e.message}`)
  }
}

export function skip(name) {
  _skipped++; _totalSkipped++
  console.log(`  [SKIP] ${name}`)
}

export function assert(condition, msg) {
  if (!condition) throw new Error(msg || '斷言失敗')
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `期望 ${JSON.stringify(expected)}，得到 ${JSON.stringify(actual)}`)
  }
}

export function assertIncludes(arr, item, msg) {
  if (!arr.includes(item)) {
    throw new Error(msg || `陣列不包含 ${JSON.stringify(item)}`)
  }
}

export function done() {
  // 最後一行輸出 JSON 供 runner 解析。
  // passed/failed/skipped = 本檔「累計」(跨所有 suite);多次呼叫 done() 時
  // runner 只讀最後一行,即為全檔真值 — 修 v5.10.470 前「只計最後一個 suite」的漏數。
  console.log(JSON.stringify({ suite: _suiteName, passed: _totalPassed, failed: _totalFailed, skipped: _totalSkipped }))
}
