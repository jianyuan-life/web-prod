// v5.10.482:出生地區字串 → IANA 時區反解(家人導入路徑補洞)
// 背景:C/G15 伺服器驗證要求有效 IANA timezone;家人一鍵導入只回填 city 名與
// 經緯度/偏移、未存 tzName → 客戶點付款被 400 擋(2026-08-16 老闆實測)。
// 本測試鎖住 resolveTzNameFromBirthCity 的行為:解得出=正確 IANA、解不出=空字串
// (fail closed、絕不默默塞 Asia/Taipei)。
import { resolveTzNameFromBirthCity } from '../lib/cities.ts'

let passed = 0
let failed = 0
function check(name, actual, expected) {
  if (actual === expected) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: got '${actual}' expected '${expected}'`) }
}

// 快速選單城市(含國別註記格式)
check('香港（香港）', resolveTzNameFromBirthCity('香港（香港）'), 'Asia/Hong_Kong')
check('台北（台灣）', resolveTzNameFromBirthCity('台北（台灣）'), 'Asia/Taipei')
check('東京（日本）', resolveTzNameFromBirthCity('東京（日本）'), 'Asia/Tokyo')
// 純城市/國名(舊資料常見)
check('香港', resolveTzNameFromBirthCity('香港'), 'Asia/Hong_Kong')
check('台灣', resolveTzNameFromBirthCity('台灣'), 'Asia/Taipei')
check('新加坡', resolveTzNameFromBirthCity('新加坡'), 'Asia/Singapore')
// 半形括號變體
check('台北(台灣)', resolveTzNameFromBirthCity('台北(台灣)'), 'Asia/Taipei')
// fail closed:解不出=空字串、不得默默給預設
check('空字串', resolveTzNameFromBirthCity(''), '')
check('無法辨識地名', resolveTzNameFromBirthCity('不存在的某個地方'), '')
// L4 Gemini 反例(receipt 86b8aab9):同名跨國/國別矛盾不得盲猜
check('已知城市配矛盾國別(台北（日本）)', resolveTzNameFromBirthCity('台北（日本）'), '')
check('未收錄城市+單時區國別註記(小鎮（日本）)', resolveTzNameFromBirthCity('小鎮（日本）'), 'Asia/Tokyo')

console.log(`\n  tz-resolver: ${passed} passed / ${failed} failed`)
if (failed > 0) process.exit(1)
