import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const pagePath = join(root, 'app', 'g15-consent', 'page.tsx')
const layoutPath = join(root, 'app', 'g15-consent', 'layout.tsx')
const checkoutPath = join(root, 'app', 'checkout', 'page.tsx')
const dashboardPath = join(root, 'app', 'dashboard', 'page.tsx')

test('invitee page keeps bearer tokens in the URL fragment, requires owner login, and posts accept/revoke actions', () => {
  assert.equal(existsSync(pagePath), true)
  const source = readFileSync(pagePath, 'utf8')
  assert.match(source, /window\.location\.hash/u)
  assert.match(source, /URLSearchParams/u)
  assert.match(source, /\/api\/g15-consents\/action/u)
  assert.match(source, /action:\s*'inspect'/u)
  assert.match(source, /action:\s*'accept'/u)
  assert.match(source, /action:\s*'revoke'/u)
  assert.match(source, /data\.outcome\s*===\s*'revoked'\s*&&\s*data\.status\s*===\s*'revoked'/u)
  assert.match(source, /我同意本次資料使用/u)
  assert.match(source, /撤回同意/u)
  assert.match(source, /確認.*終止.*付款頁/u)
  assert.match(source, /登入.*報告.*帳號/u)
  assert.match(source, /user_id/u)
  assert.doesNotMatch(source, /searchParams/u)
  assert.doesNotMatch(source, /localStorage/u)
  assert.doesNotMatch(source, /console\./u)
})

test('action API binds every inspect/accept/revoke transition to the authenticated subject user', () => {
  const source = readFileSync(join(root, 'app', 'api', 'g15-consents', 'action', 'route.ts'), 'utf8')
  assert.match(source, /getAuthUser/u)
  assert.match(source, /p_subject_user_id\s*:\s*auth\.userId/u)
  assert.match(source, /prepare_g15_consent_revocation/u)
  assert.match(source, /finalize_g15_consent_revocation/u)
  assert.match(source, /checkout\/sessions\/\$\{encodeURIComponent/u)
  assert.match(source, /401/u)
})

test('invitee route is noindex and does not leak token-bearing fragments into metadata', () => {
  assert.equal(existsSync(layoutPath), true)
  const source = readFileSync(layoutPath, 'utf8')
  assert.match(source, /index:\s*false/u)
  assert.match(source, /follow:\s*false/u)
  assert.doesNotMatch(source, /acceptToken|revokeToken/u)
})

test('purchaser uses non-content invite codes and cannot choose an arbitrary consent mailbox', () => {
  const checkout = readFileSync(checkoutPath, 'utf8')
  const dashboard = readFileSync(dashboardPath, 'utf8')
  assert.match(checkout, /家族邀請碼/u)
  assert.match(checkout, /邀請碼不會開啟報告內容/u)
  assert.match(checkout, /g15ConsentAccessInputs/u)
  assert.doesNotMatch(checkout, /g15-consent-email-/u)
  assert.doesNotMatch(checkout, /updateG15ConsentEmail/u)
  assert.match(dashboard, /handleCopyG15InviteCode/u)
  assert.match(dashboard, /clipboard\.writeText\(report\.id\)/u)
  assert.match(dashboard, /它本身不能開啟或閱讀這份報告/u)
})
