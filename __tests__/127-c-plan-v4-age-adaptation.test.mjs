// v5.10.492:C v4(production 現行路徑)年齡適配合約
// 背景:v4 三個 buildCall*Prompt 原本 `void ageGroup` 把年齡層丟棄,3 歲客戶
// production 實單拿到成人版報告(32-41 歲收穫期/婚姻 45 次/投資 38 次)。
// 策略(L4 Gemini 7f24181e):不靠 prompt 內「請轉譯」指令(會被就近成人骨架蓋掉),
// 改在 TS 層抽換骨架——未成年 prompt 裡物理上不存在成人 token。
// 本測試鎖三件事:①未成年無成人 token ②仍命中 quality gate 錨字 ③成人路徑不變。
import {
  buildCall1Prompt,
  buildCall2Prompt,
  buildCall3Prompt,
  buildSingleCallV4C,
} from '../prompts/c_plan_v4.ts'

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`) }
  catch (e) { failed++; console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('\n--- C v4 年齡適配合約 ---')

// 成人 prompt 裡才該出現的 token(未成年一律不得出現)
const ADULT_TOKENS = ['靠什麼賺錢', '破財陷阱', '財富與階層躍遷', '伴侶輪廓', '感情宿命模式']
// quality gate hard patterns(workflows/generate-report/steps.ts L3113-3119)
const GATE_PATTERNS = [
  { re: /原廠設定|你是誰|底層邏輯/, name: '原廠設定' },
  { re: /競爭力|財富路徑|賺錢/, name: '核心競爭力' },
  { re: /感情.*人際|人際磁場|感情.*磁場/, name: '人際磁場' },
  { re: /精準診斷|診斷書/, name: '精準診斷書' },
  { re: /五年戰略|未來五年|戰略推演/, name: '五年戰略' },
]

for (const stage of ['toddler', 'child']) {
  const all = [
    buildCall1Prompt(stage, '健康、讀書開智慧'),
    buildCall2Prompt(stage, '（摘要）'),
    buildCall3Prompt(stage, '小明', '（摘要）'),
  ].join('\n')

  check(`${stage}:三個 Call 都不含成人 token`, () => {
    for (const t of ADULT_TOKENS) {
      assert(!all.includes(t), `不得出現「${t}」`)
    }
  })

  check(`${stage}:出現未成年轉譯標題`, () => {
    assert(/核心競爭力與(天賦學習|學習)路徑/.test(all), '第二章應為天賦/學習路徑')
    assert(all.includes('同儕與家人人際磁場'), '第三章應為同儕與家人人際磁場')
    assert(all.includes('成長戰略推演'), '第五章應為成長戰略推演')
  })

  check(`${stage}:仍帶年齡層寫作指引(AGE_INSTRUCTIONS 已注入)`, () => {
    assert(all.includes('您的孩子') || all.includes('寫作對象'), '應注入年齡層指引')
  })

  check(`${stage}:仍命中全部 quality gate 錨字`, () => {
    for (const g of GATE_PATTERNS) {
      assert(g.re.test(all), `gate「${g.name}」錨字未命中`)
    }
  })

  check(`${stage}:仍保留完整性檢查關鍵字(刻意練習/寫給)`, () => {
    assert(all.includes('## 刻意練習'), '缺刻意練習章')
    assert(all.includes('寫給'), '缺寫給章')
  })
}

// v5.10.493:production 兒童實單 4e2885b5 目錄實測抓到的兩個缺陷
for (const stage of ['toddler', 'child']) {
  const all = [
    buildCall1Prompt(stage, '健康、讀書開智慧'),
    buildCall2Prompt(stage, '（摘要）'),
    buildCall3Prompt(stage, '小明', '（摘要）'),
  ].join('\n')

  check(`${stage}:帶「禁新增章節/禁改編號」硬規則(防章節撞號)`, () => {
    assert(all.includes('禁止新增章節'), '缺禁新增章節規則')
    assert(all.includes('禁止自行改編號'), '缺禁改編號規則')
    assert(all.includes('各開一個 ## 章'), '缺「聚焦項目不得各自開章」規則')
  })

  check(`${stage}:帶「系統依據不得列成年年齡區間」規則`, () => {
    assert(all.includes('成年後') && all.includes('年齡區間'), '缺系統依據年齡改寫規則')
    assert(all.includes('生命靈數週期') || all.includes('人類圖'), '應點名 Tier 3 系統')
  })
}

check('teen:不寫桃花/婚姻但保留成人章名', () => {
  const all = [
    buildCall1Prompt('teen'),
    buildCall2Prompt('teen', '（摘要）'),
    buildCall3Prompt('teen', '小華', '（摘要）'),
  ].join('\n')
  assert(!all.includes('伴侶輪廓'), 'teen 不得寫伴侶輪廓')
  assert(!all.includes('靠什麼賺錢'), 'teen 不得寫變現模式')
  assert(/競爭力|財富路徑|賺錢/.test(all), 'gate 錨字仍需命中')
  assert(all.includes('未來五年戰略推演'), 'teen 保留成人章名')
})

check('成人路徑:成人 token 全在、無兒童轉譯字樣', () => {
  const all = [
    buildCall1Prompt('young_adult'),
    buildCall2Prompt('mid', '（摘要）'),
    buildCall3Prompt('elder', '陳先生', '（摘要）'),
  ].join('\n')
  for (const t of ['靠什麼賺錢', '破財陷阱', '伴侶輪廓']) {
    assert(all.includes(t), `成人版應保留「${t}」`)
  }
  assert(!all.includes('同儕與家人人際磁場'), '成人版不得出現兒童章名')
  assert(!all.includes('成長戰略推演'), '成人版不得出現兒童章名')
})

check('fallback 單-Call:未帶 ageGroup=成人骨架(相容)', () => {
  const p = buildSingleCallV4C('陳先生')
  assert(p.includes('靠什麼賺錢'), '未帶年齡層應維持成人骨架')
})

check('fallback 單-Call:帶 toddler=同樣抽換骨架', () => {
  const p = buildSingleCallV4C('小明', undefined, 'toddler')
  for (const t of ADULT_TOKENS) assert(!p.includes(t), `fallback 不得出現「${t}」`)
  assert(p.includes('天賦學習路徑'), 'fallback 應用兒童章名')
  assert(p.includes('成長戰略推演'), 'fallback 應用兒童第五章')
  for (const g of GATE_PATTERNS) assert(g.re.test(p), `fallback gate「${g.name}」未命中`)
})

console.log(`\n{"suite":"C v4 年齡適配合約","passed":${passed},"failed":${failed},"skipped":0}`)
if (failed > 0) process.exit(1)
