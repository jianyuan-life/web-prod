// v5.10.494:C v4 章節名的起承轉合分類合約
// 根因(production 兒童實單 2b3cb069 目錄實測):v4 章名在 classifyC 沒有對應規則、
// 四散或 fallback 到 qi → 目錄顯示「第一篇/第二篇/第四篇」缺第三篇、卻標「分 3 篇」。
// 本測試鎖:成人版與兒童版章名都能填滿四篇、且同名章不會跨版本漂移。
import { classifyChapter } from '../lib/report-structure.ts'
const classifyChapterPart = (title, plan) => classifyChapter(plan, title)

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`) }
  catch (e) { failed++; console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('\n--- C v4 章節分篇合約 ---')

const ADULT = [
  ['一、原廠設定與底層邏輯', 'qi'],
  ['二、核心競爭力與財富路徑', 'cheng'],
  ['三、感情與人際磁場', 'cheng'],
  ['四、精準診斷書', 'cheng'],
  ['五、未來五年戰略推演', 'zhuan'],
  ['未來五年關鍵節點', 'zhuan'],
  ['專屬開運與防禦清單', 'he'],
  ['刻意練習', 'he'],
  ['寫給陳先生的話', 'he'],
]
const CHILD = [
  ['一、原廠設定與底層邏輯', 'qi'],
  ['二、核心競爭力與天賦學習路徑', 'cheng'],
  ['三、同儕與家人人際磁場', 'cheng'],
  ['四、精準診斷書', 'cheng'],
  ['五、成長戰略推演', 'zhuan'],
  ['未來五年關鍵節點', 'zhuan'],
  ['專屬照護與教養清單', 'he'],
  ['刻意練習', 'he'],
  ['寫給小明父母的話', 'he'],
]

for (const [label, rows] of [['成人版', ADULT], ['兒童版', CHILD]]) {
  check(`${label}:每個章名分到預期的篇`, () => {
    for (const [title, expect] of rows) {
      const got = classifyChapterPart(title, 'C')
      assert(got === expect, `「${title}」應為 ${expect}、實得 ${got}`)
    }
  })
  check(`${label}:四篇全部有章節(不再缺篇)`, () => {
    const parts = new Set(rows.map(([t]) => classifyChapterPart(t, 'C')))
    for (const p of ['qi', 'cheng', 'zhuan', 'he']) {
      assert(parts.has(p), `缺 ${p} 篇`)
    }
  })
}

check('兩版本同名章不漂移(精準診斷書/刻意練習/關鍵節點)', () => {
  for (const t of ['四、精準診斷書', '刻意練習', '未來五年關鍵節點']) {
    assert(classifyChapterPart(t, 'C') === classifyChapterPart(t, 'C'), '同輸入應穩定')
  }
  assert(classifyChapterPart('四、精準診斷書', 'C') === 'cheng')
  assert(classifyChapterPart('未來五年關鍵節點', 'C') === 'zhuan')
})

console.log(`\n{"suite":"C v4 章節分篇合約","passed":${passed},"failed":${failed},"skipped":0}`)
if (failed > 0) process.exit(1)
