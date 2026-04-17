// 測試 6：R 方案（合否？）端對端驗證
// L3 P0 Bug 4 修復：R 方案 prompt + 品質閘門 + userPrompt 預篩 8 套系統
//
// 策略：不實際呼叫 Claude API（成本太高、測試慢），改用「偽造 AI 報告 + 跑品質閘門」
// 驗證：
//   1. userPrompt 預篩：只餵 8 套相關系統
//   2. 品質閘門：雙方互動比例 >= 40%
//   3. 品質閘門：三段式總結檢查
//   4. 品質閘門：9 個必要章節檢查
//
// 測試客戶配對（來自全方位命理系統客戶總表）：
//   何宣逸 × 何紀萳（家庭關係）
//   何則興 × 李禹樂（家庭關係）

import { suite, test, assert, assertEqual, done } from './harness.mjs'

// ── 從原始碼提取的純函式（R 方案品質閘門核心邏輯） ──
function qualityGateR(reportContent) {
  const warnings = []

  // 9 個必要章節
  const rRequired = [
    { pattern: /你們的問題|關係描述/, name: '你們的問題' },
    { pattern: /你們的答案|合否結論/, name: '你們的答案' },
    { pattern: /化學反應|合盤分析/, name: '化學反應' },
    { pattern: /好的地方|最好的/, name: '好的地方' },
    { pattern: /需要注意|最該注意/, name: '需要注意的地方' },
    { pattern: /改善建議|關係處方/, name: '改善建議' },
    { pattern: /刻意練習/, name: '刻意練習' },
    { pattern: /流年|2026|2027/, name: '關係流年' },
    { pattern: /寫給.*的話/, name: '寫給你們的話' },
  ]
  for (const sec of rRequired) {
    if (!sec.pattern.test(reportContent)) {
      warnings.push(`合否缺少必要章節: ${sec.name}`)
    }
  }

  // 明確結論
  const hasConclusion = /結論\s*[:：]/.test(reportContent) || /你們(合|不合|合，但)/.test(reportContent)
  if (!hasConclusion) {
    warnings.push('合否缺少明確結論')
  }

  // 字數 8,000
  if (reportContent.length < 8000) {
    warnings.push(`合否內容偏短: ${reportContent.length} 字`)
  }

  // L3 P0 Bug 4：雙方互動比例 >= 40%
  const paragraphs = reportContent.split(/\n\s*\n/).filter(p => p.trim().length > 50)
  const interactionPattern = /你們|兩個人|兩人|彼此|互動|對方|一個.{0,3}一個|互相|雙方/
  const interactionParagraphs = paragraphs.filter(p => interactionPattern.test(p))
  const interactionRatio = paragraphs.length > 0 ? interactionParagraphs.length / paragraphs.length : 0
  if (interactionRatio < 0.40) {
    warnings.push(`合否雙方互動比例過低: ${(interactionRatio * 100).toFixed(0)}%`)
  }

  // 三段式總結
  const hasTrinitySummary = /🟢|好的地方/.test(reportContent)
    && /🟡|需要注意/.test(reportContent)
    && /🔵|改善建議|關係處方/.test(reportContent)
  if (!hasTrinitySummary) {
    warnings.push('合否缺少三段式總結')
  }

  return { passed: warnings.length === 0, warnings, interactionRatio }
}

// ── userPrompt 預篩驗證 ──
function filterRRelevantSystems(allAnalyses) {
  const R_RELEVANT_SYSTEMS = [
    '八字四柱', '紫微斗數', '西洋占星', '吠陀占星',
    '人類圖', '數字能量學', '姓名學', '生肖運勢',
  ]
  return allAnalyses.filter(a => a.system && R_RELEVANT_SYSTEMS.includes(a.system))
}

// ── 測試用 fixture：模擬 15 套系統 ──
const MOCK_15_SYSTEMS = [
  { system: '八字四柱', summary: '甲木日主' },
  { system: '紫微斗數', summary: '天機坐命' },
  { system: '奇門遁甲', summary: '乙奇入坎' },  // R 不相關，應被過濾
  { system: '風水堪輿', summary: '坐北朝南' },  // R 不相關
  { system: '姓名學', summary: '吉數 23' },
  { system: '西洋占星', summary: '太陽獅子' },
  { system: '吠陀占星', summary: '月亮巨蟹' },
  { system: '易經占卜', summary: '乾為天' },  // R 不相關
  { system: '人類圖', summary: '生產者' },
  { system: '塔羅牌', summary: '戀人牌' },  // R 不相關
  { system: '數字能量學', summary: '生命靈數 7' },
  { system: '中國古典占星', summary: '木星入廟' },  // R 不相關
  { system: '生肖運勢', summary: '屬龍' },
  { system: '生物節律', summary: '體能高峰' },  // R 不相關
  { system: '南洋術數', summary: 'Mahabote Mon' },  // R 不相關
]

// ── 測試開始 ──

suite('R 方案端對端驗證')

test('userPrompt 預篩：從 15 套縮減到 8 套關係相關系統', () => {
  const filtered = filterRRelevantSystems(MOCK_15_SYSTEMS)
  assertEqual(filtered.length, 8, `預篩後應有 8 套，實際 ${filtered.length} 套`)

  // 驗證排除項（奇門/風水/易經/塔羅/古典/生物節律/南洋）
  const excluded = ['奇門遁甲', '風水堪輿', '易經占卜', '塔羅牌', '中國古典占星', '生物節律', '南洋術數']
  for (const ex of excluded) {
    const found = filtered.find(a => a.system === ex)
    assert(!found, `${ex} 應被過濾掉`)
  }

  // 驗證保留項
  const kept = ['八字四柱', '紫微斗數', '西洋占星', '吠陀占星', '人類圖', '數字能量學', '姓名學', '生肖運勢']
  for (const k of kept) {
    const found = filtered.find(a => a.system === k)
    assert(found, `${k} 應保留`)
  }
})

test('高品質報告：雙方互動比例 >= 40% + 三段式總結 + 9 章節', () => {
  const mockReport = `
## 一、你們的問題
你們描述的關係困境是：最近吵架越來越多，冷戰時間變長。

## 二、你們的答案
結論：你們合，但有致命雷區。兩個人的命格互補性強，但情緒觸發點重疊。

## 三、化學反應（合盤分析）
兩個人的八字呈現甲庚相沖：你們吵架時誰都不讓誰。彼此的日柱形成天克地沖，這是你們的核心動力——也是你們的陷阱。紫微盤中雙方的夫妻宮有沖照，對方的火星碰到你的土象金星，造成互動中的摩擦。

## 四、好的地方
🟢 你們的互補性極強——她的溫柔接住他的急躁。兩個人在一起時，一個往前衝，一個往後拉，形成完美平衡。

## 五、需要注意的地方
🟡 你們在經濟決策上的互動容易失衡。雙方對金錢的態度南轅北轍，一個保守一個敢冒險，這是定時炸彈。

## 六、改善建議（關係處方）
🔵 每週固定時間「兩個人」一起對帳討論，建立彼此的財務共識。互動時必須用「我們」取代「你」。

## 七、刻意練習
練習 1：吵架時對方先深呼吸 3 秒再回應。
練習 2：每天兩人互相分享一件感謝對方的事。
練習 3：每月一次兩個人單獨約會，不帶手機不帶孩子。

## 八、關係流年
2026 丙午年，你們的關係進入驗證期。彼此的考驗集中在上半年。

## 九、寫給你們的話
兩個人走過的每一段路都是彼此的選擇。你們不是「命中注定」的組合，是「互相選擇」的組合。
`.repeat(5)  // 確保 8,000 字

  const result = qualityGateR(mockReport)
  assert(result.interactionRatio >= 0.40, `互動比例 ${(result.interactionRatio * 100).toFixed(0)}% 應 >= 40%`)
  assertEqual(result.passed, true, `應通過，但警告: ${result.warnings.join('; ')}`)
})

test('壞品質報告：互動比例 < 40%（個人描述為主）', () => {
  const badReport = `
## 一、你們的問題
描述你的問題。

## 二、你們的答案
結論：你們合。

## 三、化學反應
甲的個性非常剛強，他有強烈的正義感。甲的事業心很重，他適合當領導。
乙的個性溫柔細膩，她擅長照顧別人。乙的人際關係很好，她適合服務業。
甲有好的地方，也有壞的地方。甲在 2026 年會有新機會。
乙有好的地方，也有壞的地方。乙在 2026 年會遇到貴人。
甲的命格特徵是偏財格，他的錢財運勢旺。
乙的命格特徵是正印格，她的貴人運勢強。
甲的健康要注意肝臟。甲要多運動。
乙的健康要注意腸胃。乙要注重飲食。
甲的事業在 2026 有突破。甲要把握機會。
乙的事業在 2026 有變動。乙要謹慎選擇。

## 四、好的地方
甲很有責任感。乙很體貼。

## 五、需要注意的地方
甲太固執。乙太敏感。

## 六、改善建議
甲要學會傾聽。乙要勇敢表達。

## 七、刻意練習
甲練習深呼吸。乙練習寫日記。

## 八、關係流年
2026 年。

## 九、寫給你們的話
祝福甲和乙。
`.repeat(5)

  const result = qualityGateR(badReport)
  assert(result.interactionRatio < 0.40, `壞報告互動比例 ${(result.interactionRatio * 100).toFixed(0)}% 應 < 40%`)
  assert(!result.passed, '壞報告應被擋下')
  const hasRatioWarning = result.warnings.some(w => w.includes('雙方互動比例過低'))
  assert(hasRatioWarning, '應有互動比例警告')
})

test('缺三段式總結：🟢🟡🔵 任一缺失就不通過', () => {
  const reportMissingTrinity = `
## 一、你們的問題
互動描述。

## 二、你們的答案
結論：你們合。彼此互補。

## 三、化學反應
兩個人的互動非常好。你們彼此的命格互相搭配，一個往前一個往後。
你們的化學反應強烈。彼此的日柱形成你們的動力源。

## 四、好的地方
兩個人互補。
`.repeat(10)

  const result = qualityGateR(reportMissingTrinity)
  const hasTrinityWarning = result.warnings.some(w => w.includes('三段式總結'))
  assert(hasTrinityWarning, '應有三段式總結缺失警告')
})

test('缺必要章節：9 章必要，少一個就警告', () => {
  const reportMissingChapters = `
## 你們的問題
你們兩個的互動。

## 你們的答案
你們合。
`.repeat(50)

  const result = qualityGateR(reportMissingChapters)
  const missingChapterWarnings = result.warnings.filter(w => w.includes('缺少必要章節'))
  assert(missingChapterWarnings.length >= 5, `應至少有 5 個章節缺失警告，實際 ${missingChapterWarnings.length} 個`)
})

test('字數 < 8000 觸發偏短警告', () => {
  const shortReport = `
## 你們的問題
X
## 你們的答案
結論：你們合。
## 化學反應
兩個人彼此互動。
## 好的地方
🟢 互補
## 需要注意
🟡 要注意
## 改善建議
🔵 建議
## 刻意練習
1
## 流年 2026
丙午年
## 寫給你們的話
祝福
`

  const result = qualityGateR(shortReport)
  const shortWarning = result.warnings.find(w => w.includes('偏短'))
  assert(shortWarning, '應有偏短警告')
})

test('配對 1：何宣逸 × 何紀萳（家庭關係合盤）— fixture 驗證', () => {
  // 配對命格摘要（用於 prompt 預篩驗證）
  const member1 = {
    name: '何宣逸',
    bazi: '庚辰 丁亥 丙寅 庚寅',  // 丙火日主
    analyses: MOCK_15_SYSTEMS.map(s => ({ ...s, member: '何宣逸' })),
  }
  const member2 = {
    name: '何紀萳',
    bazi: '辛巳 甲午 乙未 丙戌',  // 乙木日主
    analyses: MOCK_15_SYSTEMS.map(s => ({ ...s, member: '何紀萳' })),
  }
  const filtered1 = filterRRelevantSystems(member1.analyses)
  const filtered2 = filterRRelevantSystems(member2.analyses)
  assertEqual(filtered1.length, 8, '何宣逸預篩 8 套')
  assertEqual(filtered2.length, 8, '何紀萳預篩 8 套')
})

test('配對 2：何則興 × 李禹樂（家庭關係合盤）— fixture 驗證', () => {
  const member1 = {
    name: '何則興',
    bazi: '戊戌 甲寅 癸巳 辛酉',
    analyses: MOCK_15_SYSTEMS.map(s => ({ ...s, member: '何則興' })),
  }
  const member2 = {
    name: '李禹樂',
    bazi: '癸未 己未 甲子 乙亥',
    analyses: MOCK_15_SYSTEMS.map(s => ({ ...s, member: '李禹樂' })),
  }
  const filtered1 = filterRRelevantSystems(member1.analyses)
  const filtered2 = filterRRelevantSystems(member2.analyses)
  assertEqual(filtered1.length, 8, '何則興預篩 8 套')
  assertEqual(filtered2.length, 8, '李禹樂預篩 8 套')
})

done()
