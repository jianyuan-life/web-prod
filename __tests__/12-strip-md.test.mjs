// stripMd 算法 unit test(L5 P0 #3 cascade、確保 markdown sanitize 正確)
import { suite, test, assert, done } from './harness.mjs'

// 純 JS 重現 stripMd 邏輯(對應 lib/report-structure.ts)
function stripMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*+/g, '')
    .replace(/^[「"」"']+|[「"」"']+$/g, '')
    .replace(/[「」]/g, '')
    .trim()
}

suite('stripMd 算法測試(對應 v5.10.30 R+8 + lesson #099 markdown sanitize)')

test('strip 平衡 bold **X**', () => {
  assert(stripMd('**重要詞**') === '重要詞', `expected 重要詞、got ${stripMd('**重要詞**')}`)
})

test('strip 不平衡 bold **X(無 closing)', () => {
  // .replace(/\*+/g, '') 最後清所有殘留 *、徹底消除 ** 字面殘留(v5.10.30)
  assert(stripMd('**重要詞') === '重要詞', `expected 重要詞、got ${stripMd('**重要詞')}`)
})

test('strip italic *X*', () => {
  assert(stripMd('*強調*') === '強調', `expected 強調、got ${stripMd('*強調*')}`)
})

test('strip code `code`', () => {
  assert(stripMd('`var x = 1`') === 'var x = 1', `expected var x = 1、got ${stripMd('`var x = 1`')}`)
})

test('strip 連續多 *(殘留清光)', () => {
  assert(stripMd('***多個星***') === '多個星', `expected 多個星、got ${stripMd('***多個星***')}`)
})

test('strip 開頭結尾引號「」', () => {
  assert(stripMd('「太陽之火」') === '太陽之火', `expected 太陽之火、got ${stripMd('「太陽之火」')}`)
})

test('strip 開頭結尾 ASCII 引號 "X"', () => {
  assert(stripMd('"hello"') === 'hello', `expected hello、got ${stripMd('"hello"')}`)
})

test('混合 bold + 引號 strip', () => {
  assert(stripMd('「**太陽之火**」') === '太陽之火', `expected 太陽之火、got ${stripMd('「**太陽之火**」')}`)
})

test('trim 前後空白', () => {
  assert(stripMd('   重點   ') === '重點', `expected 重點、got ${stripMd('   重點   ')}`)
})

done()
