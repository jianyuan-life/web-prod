import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const fields = readFileSync(join(root, 'components', 'checkout', 'BirthDataFields.tsx'), 'utf8')
const form = readFileSync(join(root, 'components', 'checkout', 'SinglePersonForm.tsx'), 'utf8')
const hook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')

test('C checkout does not promise minor support before the report path is verified', () => {
  assert.match(fields, /目前暫不接受未成年人委託/u)
  assert.match(fields, /不會讓此筆委託進入付款/u)
  assert.doesNotMatch(fields, /這份報告會依兒童或青少年階段調整/u)
  assert.doesNotMatch(fields, /guardian-name/u)
})

test('C minor checkout is blocked while the submit remains focusable for an accessible explanation', () => {
  assert.match(form, /coreFormInvalid[\s\S]{0,180}isMinor/u)
  assert.match(form, /if \(coreFormInvalid\)[\s\S]{0,120}event\.preventDefault\(\)/u)
  assert.match(form, /isMinor[\s\S]{0,80}'minor-report-boundary-heading'/u)
  assert.match(form, /disabled=\{loading \|\| \(!accessibleValidationEnabled && !isFormValid\)\}/u)
  assert.match(form, /未成年人委託暫未開放/u)
  assert.match(hook, /if \(cIsMinor\) return false/u)
  assert.doesNotMatch(hook, /birthData\.guardian_attestation/u)
})

test('C CTA describes the actual review step rather than immediate payment', () => {
  assert.match(form, /核對資料與金額/u)
  assert.match(form, /確認後才前往 Stripe/u)
})
