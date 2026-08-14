import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')
const sha256Lf = (source) => createHash('sha256')
  .update(source.replace(/\r\n/g, '\n'))
  .digest('hex')

const legacyConfirmation = read('components', 'checkout', 'ConfirmationModal.tsx')
const legacyTypes = read('components', 'checkout', 'types.ts')
const singlePersonForm = read('components', 'checkout', 'SinglePersonForm.tsx')
const birthDataFields = read('components', 'checkout', 'BirthDataFields.tsx')
const checkoutHook = read('hooks', 'useCheckoutForm.ts')

test('E3 exact-source checkout files remain byte-frozen to protected origin/main', () => {
  assert.equal(
    sha256Lf(legacyConfirmation),
    'baa6c68bed80c2d373cd9b27135b2e9d7aa76306b7204bb33562163de006278b',
  )
  assert.equal(
    sha256Lf(legacyTypes),
    '64e797f04cbfa84faabb02e447e037acca7f71c87535219c35fcd6549bfab9a9',
  )
})

test('C final review is isolated while every non-C plan keeps the frozen modal', () => {
  const cReview = read('components', 'consultation', 'CFinalReviewModal.tsx')

  assert.match(singlePersonForm, /import CFinalReviewModal from '@\/components\/consultation\/CFinalReviewModal'/u)
  assert.match(singlePersonForm, /planCode === 'C'[\s\S]*?<CFinalReviewModal[\s\S]*?:[\s\S]*?<ConfirmationModal/u)
  assert.match(cReview, /目前關係狀態/u)
  assert.match(cReview, /這次最想理解或改善的事/u)
  assert.match(cReview, /本次無須刷卡/u)
  assert.doesNotMatch(legacyConfirmation, /目前關係狀態|這次最想理解或改善的事/u)
})

test('consultation-only form extensions no longer alter the frozen E3 type contract', () => {
  const consultationTypes = read('components', 'consultation', 'checkout-types.ts')

  assert.doesNotMatch(legacyTypes, /consultation-input-contract|guardian_name|birthLocationPrecision/u)
  assert.match(consultationTypes, /Omit<LegacyCheckoutFormState, 'marital_status'>/u)
  assert.match(consultationTypes, /guardian_name/u)
  assert.match(consultationTypes, /birthLocationPrecision/u)
  for (const source of [singlePersonForm, birthDataFields, checkoutHook]) {
    assert.match(source, /ConsultationCheckoutFormState/u)
  }
})
