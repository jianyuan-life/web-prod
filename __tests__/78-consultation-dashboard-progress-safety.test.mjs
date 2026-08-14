import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const dashboard = readFileSync(join(root, 'app', 'dashboard', 'page.tsx'), 'utf8')
const progress = readFileSync(join(root, 'components', 'ReportProgress.tsx'), 'utf8')

test('C and G15 deletion waits for a successful response and exposes an inline error', () => {
  const handler = dashboard.slice(
    dashboard.indexOf('const handleDelete = async'),
    dashboard.indexOf('// 重試失敗的報告'),
  )

  assert.match(handler, /isConsultationPlan\(reportToDelete\.plan_code\)/u)
  assert.match(handler, /await internalDelete\('\/api\/reports',\s*\{[\s\S]*authToken,[\s\S]*body: \{ id, email: userEmail \}/u)

  const safeBranch = handler.slice(handler.indexOf('if (consultationDeletion)'))
  const requestIndex = safeBranch.indexOf("await internalDelete('/api/reports'")
  const removeIndex = safeBranch.indexOf('setReports(prev => prev.filter')
  const catchIndex = safeBranch.indexOf('} catch (error)')
  const inlineErrorIndex = safeBranch.indexOf('setDeleteErrors', catchIndex)

  assert.ok(requestIndex >= 0, 'C/G15 must call the shared DELETE client')
  assert.doesNotMatch(safeBranch.slice(0, requestIndex), /setReports\(prev => prev\.filter/u)
  assert.ok(removeIndex > requestIndex, 'C/G15 must remain visible until DELETE succeeds')
  assert.ok(catchIndex > removeIndex, 'the successful removal must stay inside the try block')
  assert.ok(inlineErrorIndex > catchIndex, 'DELETE rejection must be surfaced inline')
  assert.match(safeBranch.slice(catchIndex), /ApiError \|\| error instanceof RateLimitError/u)

  assert.match(dashboard, /deleteErrors\[r\.id\][\s\S]*role="alert"/u)
  assert.match(dashboard, /無法從清單移除/u)
})

test('non-consultation deletion retains the existing optimistic path', () => {
  const handler = dashboard.slice(
    dashboard.indexOf('const handleDelete = async'),
    dashboard.indexOf('// 重試失敗的報告'),
  )
  const legacyBranch = handler.slice(
    handler.indexOf('if (!consultationDeletion)'),
    handler.indexOf('if (consultationDeletion)'),
  )

  assert.match(
    legacyBranch,
    /setDeletedIds\(prev => new Set\(prev\)\.add\(id\)\)[\s\S]*setReports\(prev => prev\.filter\(r => r\.id !== id\)\)[\s\S]*await fetch/u,
  )
})

test('C and G15 progress is monotonic while other plans retain direct percentage updates', () => {
  const monotonicWrites = progress.match(
    /setPct\(previous => consultation \? Math\.max\(previous, [^)]+\) : [^)]+\)/gu,
  ) ?? []

  assert.ok(monotonicWrites.length >= 3, `expected at least 3 monotonic writes, got ${monotonicWrites.length}`)
  assert.match(progress, /consultation \? Math\.max\(previous, 0\) : 0/u)
})

test('C and G15 stale states state only what is observed and offer a retry or support path', () => {
  assert.match(progress, /consultation[\s\S]*最近沒有收到新的製作進度/u)
  assert.match(progress, /重新整理此頁，重試取得最新狀態/u)
  assert.match(progress, /目前無法從現有訊號判斷原因/u)
  assert.match(progress, /support@jianyuan\.life/u)

  // Existing E3 and other-plan copy stays available only through the non-consultation branch.
  assert.match(progress, /consultation \? \([\s\S]*\) : \([\s\S]*您的命盤較為複雜/u)
  assert.match(progress, /consultation \? \([\s\S]*\) : \([\s\S]*工程團隊會主動關注/u)
})
