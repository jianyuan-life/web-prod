import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = readFileSync(join(process.cwd(), 'components', 'ReportProgress.tsx'), 'utf8')

test('C and G15 waiting states explain estimated progress without exposing engine calls', () => {
  assert.match(source, /const consultation = planCode === 'C' \|\| planCode === 'G15'/u)
  assert.match(source, /百分比優先採用系統回傳進度/u)
  assert.match(source, /尚無新訊號時只顯示初始等待估算/u)
  assert.match(source, /報告製作包含哪些步驟/u)
  assert.match(source, /實際時間會依資料完整度、報告長度與系統負載而異/u)
})

test('C and G15 waiting states remove unverifiable absolutes and trivia', () => {
  assert.match(source, /!consultation && cfg\.systems > 1/u)
  assert.match(source, /CONSULTATION_WAITING_NOTES/u)
  assert.match(source, /consultation[\s\S]{0,120}完成後會寄信通知/u)
  assert.match(source, /若等待過久，可從「我的報告」查看或聯絡客服/u)
})
