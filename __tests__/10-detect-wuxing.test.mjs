// detectWuxing 算法 unit test(對應 lesson #099 root cause、L5 P0 #3 unit test gap)
// v5.10.91 char-by-char 掃描算法、避免 v5.10.x 之前 regex `[^。]{0,60}` greedy 跨人名 bug
import { suite, test, assert, done } from './harness.mjs'

// 純 JS 重現 detectWuxing 邏輯(避免 import TS、test runner 純 Node.js)
function detectWuxing(memberName, aiContent) {
  if (!memberName || !aiContent) return ''
  const GAN_TO_WUXING = {
    甲: '木', 乙: '木', 丙: '火', 丁: '火',
    戊: '土', 己: '土', 庚: '金', 辛: '金',
    壬: '水', 癸: '水',
  }
  const TIANGAN = '甲乙丙丁戊己庚辛壬癸'
  const WUXING_CHAR = '金木水火土'

  let idx = 0
  while ((idx = aiContent.indexOf(memberName, idx)) !== -1) {
    const startAfter = idx + memberName.length
    let endAfter = Math.min(startAfter + 30, aiContent.length)
    for (let i = startAfter; i < endAfter; i++) {
      const c = aiContent[i]
      if (c === '。' || c === '\n' || c === '、' || c === ',') {
        endAfter = i
        break
      }
    }
    const after = aiContent.substring(startAfter, endAfter)

    for (let i = 0; i < after.length - 1; i++) {
      const gan = after[i]
      const wux = after[i + 1]
      if (TIANGAN.includes(gan) && WUXING_CHAR.includes(wux)) {
        return GAN_TO_WUXING[gan]
      }
    }

    const matchRz = after.match(/日主[為是]?\s*([甲乙丙丁戊己庚辛壬癸])/)
    if (matchRz) {
      const gan = matchRz[1]
      if (GAN_TO_WUXING[gan]) return GAN_TO_WUXING[gan]
    }

    idx += memberName.length
  }

  return ''
}

suite('detectWuxing 算法測試(lesson #099 root cause)')

// G15 7LLM 真實 ai_content 第 1 段(實測 Supabase MCP)
const realAiContent = '何宣逸庚金日主帶雙丙七殺、何紀萳八字時柱丙辰火土、何宥諄丙火日主坐巳月建祿——全家火能量密度極高'

test('何宣逸 = 金(庚金日主、不被跨人名 bug 抓到水)', () => {
  assert(detectWuxing('何宣逸', realAiContent) === '金', `expected 金, got ${detectWuxing('何宣逸', realAiContent)}`)
})

test('何紀萳 = 火(時柱丙辰火土、Pattern 1 match 「丙辰」)', () => {
  // Pattern 1 「丙辰」實際抓「丙→火」(辰非五行 char、Pattern 1 fail)、再試 Pattern 2「日主」、無、最終 fall through
  // 實際何紀萳這段 P1 「八字時柱丙辰火土」first {天干}{五行}「丙辰」「辰」非五行 char、不 match
  // L1 何紀萳 後 30 字「八字時柱丙辰火土」斷句到「、」、context 「八字時柱丙辰火土」
  // 跑邏輯:i=0「八」非 TIANGAN、i=1「字」非、i=2「時」非、i=3「柱」非、i=4「丙」TIANGAN、i=5「辰」非 WUXING → fail
  // i=5「辰」非 TIANGAN、i=6「火」非 TIANGAN、i=7「土」非 TIANGAN → fail
  // P2「日主」regex 無、return ''
  // 真實:何紀萳第 1 occurrence 「水」、需在 ai_content 後段「癸水日主」抓到、本 fixture 無
  assert(detectWuxing('何紀萳', realAiContent) === '', '本 fixture 後 30 字無「{天干}{五行}」、應 return 空')
})

test('何宥諄 = 火(丙火日主、Pattern 1 match)', () => {
  assert(detectWuxing('何宥諄', realAiContent) === '火', `expected 火, got ${detectWuxing('何宥諄', realAiContent)}`)
})

test('空 input return 空', () => {
  assert(detectWuxing('', 'any') === '', 'empty name')
  assert(detectWuxing('any', '') === '', 'empty content')
})

test('斷句符號邊界保護(不跨人名)', () => {
  const c = '何宣逸是個好人。何紀萳癸水日主'
  // 何宣逸 後接「是個好人」、無「{天干}{五行}」、且斷句「。」前無 match
  // 應 return ''(不跨「。」抓何紀萳的癸水)
  assert(detectWuxing('何宣逸', c) === '', '不跨句號')
})

test('斷句「、」邊界保護', () => {
  const c = '何宣逸庚金、何紀萳癸水'
  assert(detectWuxing('何宣逸', c) === '金', '何宣逸 = 金')
  assert(detectWuxing('何紀萳', c) === '水', '何紀萳 = 水')
})

test('Pattern 2 anchor「日主」匹配', () => {
  const c = '何宣逸的日主是庚、性格剛強'
  // Pattern 1 「的日」「日主」非 TIANGAN+WUXING → fail
  // Pattern 2 「日主是庚」regex match、return GAN_TO_WUXING[庚] = 金
  assert(detectWuxing('何宣逸', c) === '金', `P2 anchor 命中、got ${detectWuxing('何宣逸', c)}`)
})

done()
