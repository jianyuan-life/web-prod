import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const presentation = read('app/presentation.css')
const readerCss = read('components/consultation/reader/ConsultationReportReader.module.css')
const checkoutCss = read('app/checkout/checkout-presentation.css')
const layout = read('app/layout.tsx')
const cookie = read('components/CookieConsent.tsx')
const mobileFixture = read('__tests__/fixtures/ui/mobile-cookie-viewport.html')
const readerFixture = read('__tests__/fixtures/ui/mobile-reader-rail.html')
const reader = read('components/consultation/reader/ConsultationReportReader.tsx')
const birthFields = read('components/checkout/BirthDataFields.tsx')
const singlePersonForm = read('components/checkout/SinglePersonForm.tsx')

function parseHex(hex) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(hex)
  assert.ok(match, `expected six-digit hex, received ${hex}`)
  return match.slice(1).map((channel) => Number.parseInt(channel, 16))
}

function luminance(hex) {
  const channels = parseHex(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrast(foreground, background) {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function cssVariable(source, name) {
  const value = new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, 'iu').exec(source)?.[1]
  assert.ok(value, `missing --${name}`)
  return value
}

test('footer Latin wordmark uses a semantic AA color and at least 12px text', () => {
  assert.match(layout, /className="jy-footer__latin">JIANYUAN<\/span>/u)
  assert.doesNotMatch(layout, /text-\[9px\][^>]*>JIANYUAN/u)

  const rule = /\.jy-footer__latin\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  assert.match(rule, /font-size:\s*0\.75rem/u)
  assert.match(rule, /color:\s*var\(--jy-ui-ink-muted\)/u)

  assert.ok(contrast('#bec4ce', '#080b12') >= 4.5, 'dark footer wordmark must meet WCAG AA')
  assert.ok(contrast('#5e574e', '#f5f0e7') >= 4.5, 'light footer wordmark must meet WCAG AA')
})

test('C and G15 report small-text tokens meet WCAG AA on paper', () => {
  const paper = cssVariable(readerCss, 'paper')
  const faint = cssVariable(readerCss, 'ink-faint')
  const sage = cssVariable(readerCss, 'sage')

  assert.ok(contrast(faint, paper) >= 4.5, `--ink-faint contrast is ${contrast(faint, paper).toFixed(2)}:1`)
  assert.ok(contrast(sage, paper) >= 4.5, `--sage contrast is ${contrast(sage, paper).toFixed(2)}:1`)
  assert.doesNotMatch(readerCss, /#767269|#6d7d69/iu)
})

test('390x844 first-visit consent is a bounded fixed bottom sheet, not a flow sibling', () => {
  assert.match(cookie, /data-view=\{showCustom \? 'custom' : 'compact'\}/u)

  const baseRule = /\.jy-cookie\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  assert.match(baseRule, /position:\s*fixed/u)
  assert.match(baseRule, /env\(safe-area-inset-bottom\)/u)
  assert.match(baseRule, /margin:\s*0/u)
  assert.match(baseRule, /overflow-y:\s*auto/u)
  assert.doesNotMatch(baseRule, /position:\s*relative/u)
  assert.doesNotMatch(baseRule, /margin:\s*4\.75rem/u)

  const compactRule = /\.jy-cookie\[data-view=['"]compact['"]\]\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  const maxRem = Number.parseFloat(/--jy-cookie-compact-max-height:\s*([\d.]+)rem/u.exec(compactRule)?.[1] ?? 'NaN')
  assert.ok(Number.isFinite(maxRem), 'compact consent must publish a measurable height cap')
  assert.ok(maxRem * 16 <= 844 * 0.185, 'compact consent may use at most 18.5% of a 390x844 first viewport')
  assert.match(compactRule, /max-height:\s*min\(var\(--jy-cookie-compact-max-height\),\s*calc\(100svh/u)

  const actionsRule = /\.jy-cookie__actions\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  assert.match(actionsRule, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/u)
  const buttonRule = /\.jy-cookie__button\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  assert.match(buttonRule, /font:\s*700\s+0\.75rem\/1\.35/u)
  assert.match(presentation, /body:has\(\.jy-cookie\) #main-content\s*\{[\s\S]*?padding-bottom:/u)

  const desktopFlow = /@media\s*\(min-width:\s*640px\)[\s\S]*?\.jy-cookie\.jy-cookie--flow\s*\{(?<body>[\s\S]*?)\}/u.exec(presentation)?.groups?.body ?? ''
  assert.match(desktopFlow, /position:\s*relative/u)

  assert.match(mobileFixture, /href="\.\.\/\.\.\/\.\.\/app\/presentation\.css"/u)
  assert.match(mobileFixture, /class="jy-cookie jy-cookie--bottom"/u)
  assert.match(mobileFixture, /class="jy-actions"/u)
  assert.match(mobileFixture, /aria-label="主要諮詢入口"/u)
})

test('tablet and mobile report rail is a one-row horizontal scroller with no hidden focus target', () => {
  assert.match(reader, /className=\{styles\.downloadTab\}/u)
  assert.match(reader, /className=\{styles\.dashboardTab\}/u)

  const mobileStart = readerCss.indexOf('@media (max-width: 980px)')
  const mobileEnd = readerCss.indexOf('@media (max-width: 640px)', mobileStart)
  const mobileRail = readerCss.slice(mobileStart, mobileEnd)
  assert.match(mobileRail, /\.rail nav\s*\{[\s\S]*?overflow-x:\s*auto/u)
  assert.match(mobileRail, /\.rail ol\s*\{[\s\S]*?display:\s*flex[\s\S]*?width:\s*max-content/u)
  assert.match(mobileRail, /\.rail li\s*\{[\s\S]*?flex:\s*1\s+0\s+64px/u)
  assert.match(mobileRail, /\.downloadLink,\s*\n\s*\.dashboardLink\s*\{[\s\S]*?display:\s*none/u)
  assert.match(mobileRail, /\.downloadTab,\s*\n\s*\.dashboardTab\s*\{[\s\S]*?display:\s*list-item/u)
  assert.match(mobileRail, /\.downloadLink,\s*\n\s*\.dashboardLink\s*\{[\s\S]*?display:\s*none/u)
  assert.doesNotMatch(mobileRail, /\.dashboardLink[\s\S]{0,180}?clip:\s*rect/u)
  assert.match(mobileRail, /\.(?:layer|chapter)[\s\S]*?scroll-margin-top:\s*(?:8[0-9]|9[0-9]|1\d\d)px/u)
  assert.match(readerFixture, /href="\.\.\/\.\.\/\.\.\/components\/consultation\/reader\/ConsultationReportReader\.module\.css"/u)
  assert.match(readerFixture, /class="downloadTab"/u)
  assert.match(readerFixture, /class="dashboardTab"/u)
})

test('checkout reduced-motion mode removes decorative motion instead of compressing it to a flash', () => {
  const reducedStart = checkoutCss.indexOf('@media (prefers-reduced-motion: reduce)')
  const reduced = checkoutCss.slice(reducedStart)
  assert.ok(reducedStart >= 0, 'checkout must define a reduced-motion mode')
  assert.match(reduced, /transition:\s*none\s*!important/u)
  assert.match(reduced, /animation:\s*none\s*!important/u)
  assert.doesNotMatch(reduced, /0\.01ms/u)
})

test('C checkout exposes field-level validation and keeps submit available to announce errors', () => {
  assert.match(singlePersonForm, /validationAttempted/u)
  assert.match(singlePersonForm, /disabled=\{loading\s*\|\|\s*\(!accessibleValidationEnabled\s*&&\s*!isFormValid\)\}/u)
  assert.doesNotMatch(singlePersonForm, /disabled=\{loading\s*\|\|\s*!isFormValid\}/u)
  assert.match(singlePersonForm, /role="alert"[\s\S]*?checkout-validation-summary/u)
  assert.match(birthFields, /required/u)
  assert.match(birthFields, /aria-invalid=\{/u)
  assert.match(birthFields, /aria-describedby=/u)
  assert.match(birthFields, /checkout-birth-city-error/u)
})

test('birth-city combobox supports arrow navigation, selection and escape', () => {
  assert.match(birthFields, /aria-activedescendant=/u)
  assert.match(birthFields, /case 'ArrowDown'/u)
  assert.match(birthFields, /case 'ArrowUp'/u)
  assert.match(birthFields, /case 'Enter'/u)
  assert.match(birthFields, /case 'Escape'/u)
  assert.match(birthFields, /checkout-city-option-/u)
})
