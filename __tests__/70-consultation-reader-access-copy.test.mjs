import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const access = readFileSync(join(root, 'app', 'consultation', 'access', 'page.tsx'), 'utf8')
const accessCss = readFileSync(join(root, 'app', 'consultation', 'access', 'access.module.css'), 'utf8')
const reader = readFileSync(join(root, 'components', 'consultation', 'reader', 'ConsultationReportReader.tsx'), 'utf8')

test('consultation access state is recoverable and uses the site theme', () => {
  assert.match(access, /這不代表報告遺失，也不會產生任何費用/u)
  assert.match(access, /再試一次/u)
  assert.match(access, /前往我的報告/u)
  assert.match(accessCss, /data-theme="light"/u)
  assert.match(accessCss, /prefers-reduced-motion/u)
})

test('consultation reader speaks to people instead of exposing storage jargon', () => {
  assert.match(reader, /人生藍圖諮詢報告/u)
  assert.match(reader, /家族藍圖諮詢報告/u)
  assert.doesNotMatch(reader, /諮詢卷宗/u)
  assert.doesNotMatch(reader, /可反查的 facts/u)
  assert.doesNotMatch(reader, /資料庫保存的舊版報告原文/u)
  assert.doesNotMatch(reader, /PDF 完整版/u)
})
