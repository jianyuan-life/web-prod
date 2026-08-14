import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { isConsultationCheckoutPlan } from '../lib/checkout/consultation-presentation.ts'

const root = process.cwd()
const checkoutPage = readFileSync(join(root, 'app', 'checkout', 'page.tsx'), 'utf8')
const consultationCssPath = join(root, 'app', 'checkout', 'consultation-checkout-presentation.css')

test('consultation checkout presentation is limited to C and G15', () => {
  assert.equal(isConsultationCheckoutPlan('C'), true)
  assert.equal(isConsultationCheckoutPlan('G15'), true)

  for (const legacyPlan of ['D', 'R', 'E1', 'E2', 'E3', 'E4', '', 'UNKNOWN']) {
    assert.equal(
      isConsultationCheckoutPlan(legacyPlan),
      false,
      `${legacyPlan || '(empty)'} must stay on the legacy checkout presentation`,
    )
  }
})

test('shared checkout page applies the consultation skin without changing the E3 root class', () => {
  assert.match(checkoutPage, /isConsultationCheckoutPlan\(ctx\.planCode\)/u)
  assert.match(checkoutPage, /checkout-shell--consultation/u)
  assert.match(checkoutPage, /consultation-checkout-presentation\.css/u)
  assert.doesNotMatch(checkoutPage, /planCode\s*===\s*['"]E3['"][\s\S]{0,120}checkout-shell--consultation/u)
})

test('consultation skin is scoped, theme-aware, responsive, and does not mention E3', () => {
  assert.equal(existsSync(consultationCssPath), true, 'dedicated consultation checkout CSS must exist')
  const css = readFileSync(consultationCssPath, 'utf8')

  assert.match(css, /\.checkout-shell--consultation\s*\{/u)
  assert.match(css, /\[data-theme=["']light["']\]\s+\.checkout-shell--consultation/u)
  assert.match(css, /@media\s*\(max-width:\s*880px\)/u)
  assert.match(css, /@media\s*\(max-width:\s*540px\)/u)
  assert.match(css, /prefers-reduced-motion:\s*reduce/u)
  assert.match(css, /:focus-visible/u)
  assert.doesNotMatch(css, /(^|[^-])\.checkout-shell\s*\{/mu, 'must not override the legacy checkout root')
  assert.doesNotMatch(css, /\bE3\b/u)
})
