// v5.10.482:內容審查 Claude Haiku 回應解析容錯合約
// 背景:Haiku 常包 ```json fence 或前後加說明文字、原嚴格 JSON.parse 直接 throw
// → contentModerationStep 整步失敗 → C/G15 全數 fail-closed 轉人工把關
// (2026-08-16 production 實測兩筆 C 滯留)。本測試鎖住:
// 1) 純 JSON / fence 包裹 / 前後夾敘述 都要解得出
// 2) 真垃圾(無 JSON 物件)仍必須 throw — fail-closed 語意不得弱化
import { parseClaudeModerationJson } from '../lib/content-moderation/ai-moderator.ts'

let passed = 0
let failed = 0
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`) }
}
function assertEqual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function assertThrows(fn) { try { fn() } catch { return } throw new Error('expected throw') }

const sample = { violence: 0.01, self_harm: 0.02 }
const json = JSON.stringify(sample)

ok('純 JSON', () => assertEqual(parseClaudeModerationJson(json), sample))
ok('```json fence 包裹', () => assertEqual(parseClaudeModerationJson('```json\n' + json + '\n```'), sample))
ok('``` fence 無語言標記', () => assertEqual(parseClaudeModerationJson('```\n' + json + '\n```'), sample))
ok('前置敘述文字', () => assertEqual(parseClaudeModerationJson('以下是審查結果：\n' + json), sample))
ok('前後都有文字', () => assertEqual(parseClaudeModerationJson('結果如下\n' + json + '\n以上供參考'), sample))
ok('前後空白換行', () => assertEqual(parseClaudeModerationJson('\n\n  ' + json + '  \n'), sample))
// fail closed:真垃圾必須 throw
ok('純文字無 JSON → throw', () => assertThrows(() => parseClaudeModerationJson('抱歉我無法評分')))
ok('空字串 → throw', () => assertThrows(() => parseClaudeModerationJson('')))
ok('壞 JSON 物件 → throw', () => assertThrows(() => parseClaudeModerationJson('{violence: bad,,}')))

console.log(`\n  moderation-json-tolerance: ${passed} passed / ${failed} failed`)
if (failed > 0) process.exit(1)
