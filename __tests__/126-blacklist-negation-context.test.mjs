// v5.10.485:黑名單勸阻語境降級 — 直接測真正的 lib/content-moderation/blacklist.ts
// (測試 08 是 mock 重寫版、測不到真模組;本檔補上真實模組的合約)。
// 背景:production 實測正常 C 報告寫「切勿借錢投資」被 /借錢(投資|買股|炒作)/
// 攔進人工把關 — 命理報告的理財/健康警語是保護性建議,不是誘導。
// 契約:緊鄰否定詞(至多 2 個非標點非「不」字元)→ 降為 warn(仍記錄、不擋);
// 誘導語境(隔標點/含「不」/「沒有比…更好」句型)→ 照樣 block;
// 僅 investment/medical 適用,其餘類別一律不降級。
import { scanBlacklist } from '../lib/content-moderation/blacklist.ts'

let passed = 0
let failed = 0
function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (e) {
    failed++
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${e.message}`)
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('\n--- 黑名單勸阻語境降級(真模組) ---')

check('「切勿借錢投資」降為 warn、仍記錄供 admin 檢視', () => {
  const hits = scanBlacklist('財運起伏之年，切勿借錢投資，穩健為上。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `應降 warn，got ${hit.severity}`)
  assert(hit.reason.includes('勸阻語境降級'), 'reason 應標注降級')
})

check('「不宜借錢投資」降為 warn', () => {
  const hits = scanBlacklist('今年財星受剋，不宜借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `got ${hit.severity}`)
})

check('「世上沒有穩賺不賠的投資」降為 warn', () => {
  const hits = scanBlacklist('請記住，世上沒有穩賺不賠的投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `got ${hit.severity}`)
})

check('「不要相信保證治癒的偏方」降為 warn', () => {
  const hits = scanBlacklist('健康方面要留意，不要相信保證治癒的偏方，正規就醫為先。')
  const hit = hits.find(h => h.category === 'medical')
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `got ${hit.severity}`)
})

check('防繞過:「不要猶豫，借錢投資吧」隔標點=block', () => {
  const hits = scanBlacklist('機會難得，不要猶豫，借錢投資吧。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `誘導不得降級，got ${hit.severity}`)
})

check('防繞過:「不得不借錢投資」含「不」間隔=block', () => {
  const hits = scanBlacklist('依你的格局，到時你不得不借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

check('防繞過:「沒有比借錢投資更好的路」=block', () => {
  const hits = scanBlacklist('對你而言沒有比借錢投資更好的路。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `「沒有」只認直接緊鄰，got ${hit.severity}`)
})

check('防繞過:「特別適合借錢投資」的「別」不當否定詞=block', () => {
  const hits = scanBlacklist('你的命格特別適合借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

check('防繞過:「毫無顧忌地借錢投資」的「忌」不當否定詞=block', () => {
  const hits = scanBlacklist('你可以毫無顧忌地借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

// L4 Gemini 反例 57979d97:自傷 pattern 在 medical 類、絕不得因否定詞降級
check('紅線:「切勿跳樓」仍必須 block(自傷內容不適用降級)', () => {
  const hits = scanBlacklist('你今年運勢極差，但切勿跳樓。')
  const hit = hits.find(h => h.reason === '自傷內容')
  assert(hit, '應命中自傷內容')
  assert(hit.severity === 'block', `自傷內容永不降級，got ${hit.severity}`)
})

check('紅線:「不要尋短」仍必須 block', () => {
  const hits = scanBlacklist('無論多辛苦都不要尋短。')
  const hit = hits.find(h => h.reason === '自傷內容')
  assert(hit, '應命中自傷內容')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

check('防繞過:「不要錯過借錢投資」反轉動詞=block', () => {
  const hits = scanBlacklist('今年財運旺，不要錯過借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `反轉動詞=誘導，got ${hit.severity}`)
})

check('防繞過:「不要害怕借錢投資」反轉動詞=block', () => {
  const hits = scanBlacklist('你的偏財星入命，不要害怕借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

check('防繞過:「不要猶豫借錢投資」(無標點)反轉動詞=block', () => {
  const hits = scanBlacklist('機會來了不要猶豫借錢投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

check('警語:「沒有任何穩賺不賠的投資」降為 warn(間隔非比較詞)', () => {
  const hits = scanBlacklist('市場上沒有任何穩賺不賠的投資。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `got ${hit.severity}`)
})

check('警語:「不要自行停藥」降為 warn(常態醫囑警語)', () => {
  const hits = scanBlacklist('治療期間務必遵循醫囑，不要自行停藥。')
  const hit = hits.find(h => h.reason && h.reason.includes('勸阻服藥'))
  assert(hit, '應記錄命中')
  assert(hit.severity === 'warn', `got ${hit.severity}`)
})

check('範圍:extreme_fortune 不適用降級', () => {
  const hits = scanBlacklist('別擔心，你會死於孤獨這種話都是迷信。')
  const hit = hits.find(h => h.category === 'extreme_fortune')
  assert(hit, '應命中 extreme_fortune')
  assert(hit.severity === 'block', `不適用勸阻降級，got ${hit.severity}`)
})

check('誘導原樣:無否定詞的「借錢投資」=block', () => {
  const hits = scanBlacklist('大膽一點，借錢投資這一波。')
  const hit = hits.find(h => h.category === 'investment')
  assert(hit, '應命中 investment')
  assert(hit.severity === 'block', `got ${hit.severity}`)
})

console.log(`\n{"suite":"黑名單勸阻語境降級","passed":${passed},"failed":${failed},"skipped":0}`)
if (failed > 0) process.exit(1)
