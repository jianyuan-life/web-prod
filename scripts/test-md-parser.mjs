// v5.10.248 Smoke test for lib/parsers/life-blueprint-md-parser.ts
// Run: node scripts/test-md-parser.mjs
//
// 測 5 cases:
//   T1 標準 table format(v5.10.246 起支援)
//   T2 加粗 value 兼容(v5.10.247 加、Codex P1 修)
//   T3 emoji 裝飾 label 兼容(v5.10.247 加、Codex P1 修)
//   T4 inline format(v5.10.247 加、實測 32 row 中 2 row 用此)
//   T5 prose-only 正確 return null(防 silent contamination、lesson #124)
//
// 注意:本檔複製 parser 邏輯為 plain JS、避免依賴 tsx
// 若 lib/parsers/life-blueprint-md-parser.ts 改動、需同步更新本檔

const HEAVENLY_STEMS = new Set(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'])
const EARTHLY_BRANCHES = new Set(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'])

function matchPillar(content, pillarName) {
  const escapedName = pillarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `\\|[^|]*?${escapedName}[\\s\\u3000\\*]*\\|[\\s\\u3000\\*]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\\s\\u3000\\*]*\\|`,
    'm',
  )
  const match = content.match(pattern)
  if (!match || !match[1]) return null
  const ganZhi = match[1]
  if (ganZhi.length !== 2) return null
  if (!HEAVENLY_STEMS.has(ganZhi.charAt(0))) return null
  if (!EARTHLY_BRANCHES.has(ganZhi.charAt(1))) return null
  return ganZhi
}

function extractBaziInline(content) {
  const pattern =
    /四柱八字[\s\*　]*[：:][\s　]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s　]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/
  const match = content.match(pattern)
  if (!match) return null
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    dayMaster: match[3].charAt(0),
  }
}

const SAMPLES = {
  T1_table: `**1. 四柱八字**

| 柱 | 天干地支 | 納音 |

| 年柱 | 癸卯 | 金箔金 |
| 月柱 | 丁巳 | 沙中土 |
| 日柱 | 丙寅 | 爐中火 |
| 時柱 | 癸巳 | 長流水 |`,

  T2_bold_value: `| 年柱 | **癸卯** | 金箔金 |
| 月柱 | **丁巳** | 沙中土 |
| 日柱 | **丙寅** | 爐中火 |
| 時柱 | **癸巳** | 長流水 |`,

  T3_emoji_label: `| 🔥 年柱 | 癸卯 | 金箔金 |
| ⭐ 月柱 | 丁巳 | 沙中土 |
| 🌟 日柱 | 丙寅 | 爐中火 |
| 💫 時柱 | 癸巳 | 長流水 |`,

  T4_inline: `**四柱八字**：庚午 丙戌 庚戌 丙戌
* **日主**：庚金`,

  T5_prose_only: `你的紫微命盤更有意思——命宮廉貞貪狼坐寅宮，兩顆星都在廟位（最強的位置）。`,
}

const results = {
  T1: matchPillar(SAMPLES.T1_table, '年柱') === '癸卯',
  T2: matchPillar(SAMPLES.T2_bold_value, '年柱') === '癸卯',
  T3: matchPillar(SAMPLES.T3_emoji_label, '年柱') === '癸卯',
  T4: (() => {
    const r = extractBaziInline(SAMPLES.T4_inline)
    return r && r.year === '庚午' && r.dayMaster === '庚'
  })(),
  T5: matchPillar(SAMPLES.T5_prose_only, '年柱') === null && extractBaziInline(SAMPLES.T5_prose_only) === null,
}

console.log('=== life-blueprint-md-parser smoke test ===')
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k}: ${v ? 'PASS' : 'FAIL'}`)
}

const allPass = Object.values(results).every(Boolean)
console.log(allPass ? '\n=== ALL PASS ===' : '\n=== SOME FAIL ===')
process.exit(allPass ? 0 : 1)
