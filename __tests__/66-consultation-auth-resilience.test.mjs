import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const trigger = readFileSync(join(root, 'components', 'consultation', 'ConsultationCheckoutTrigger.tsx'), 'utf8')
const notice = readFileSync(join(root, 'components', 'consultation', 'ConsultationPurchaseNoticeModal.tsx'), 'utf8')
const hook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')
const checkout = readFileSync(join(root, 'app', 'checkout', 'page.tsx'), 'utf8')

test('purchase notice recovers when auth lookup fails instead of hanging', () => {
  assert.match(trigger, /navigationError/u)
  assert.match(trigger, /if \(error\) throw error/u)
  assert.match(trigger, /catch/u)
  assert.match(trigger, /setContinuing\(false\)/u)
  assert.match(notice, /confirming/u)
  assert.match(notice, /confirmError/u)
  assert.match(notice, /正在確認登入狀態/u)
})

test('checkout auth check has an explicit error and retry state', () => {
  assert.match(hook, /authError/u)
  assert.match(hook, /retryAuthCheck/u)
  assert.match(hook, /authRetryKey/u)
  assert.match(hook, /if \(authLookupError\) throw authLookupError/u)
  assert.match(checkout, /目前無法確認登入狀態/u)
  assert.match(checkout, /重新檢查/u)
})
