import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  getSinglePersonDefaults,
  getConsultationAge,
} from '../lib/checkout/consultation-input-contract.ts'

const root = process.cwd()
const hook = readFileSync(join(root, 'hooks', 'useCheckoutForm.ts'), 'utf8')
const birthFields = readFileSync(join(root, 'components', 'checkout', 'BirthDataFields.tsx'), 'utf8')
const singleForm = readFileSync(join(root, 'components', 'checkout', 'SinglePersonForm.tsx'), 'utf8')
const confirmation = readFileSync(join(root, 'components', 'checkout', 'ConfirmationModal.tsx'), 'utf8')

const noParam = () => null

test('C starts with conservative blank choices while E3 preserves its legacy defaults', () => {
  assert.deepEqual(getSinglePersonDefaults('C', noParam, false), {
    year: '', month: '', day: '', hour: '12', minute: '0', gender: '',
    maritalStatus: '', timeMode: 'unknown',
  })
  assert.deepEqual(getSinglePersonDefaults('E3', noParam, false), {
    year: '1990', month: '1', day: '1', hour: '12', minute: '30', gender: 'M',
    maritalStatus: 'unmarried', timeMode: 'shichen',
  })
})

test('minor detection uses an explicit as-of date and real birthday boundary', () => {
  assert.equal(getConsultationAge('2010', '8', '10', '2026-08-09'), 15)
  assert.equal(getConsultationAge('2008', '8', '9', '2026-08-09'), 18)
  assert.equal(getConsultationAge('not-a-year', '8', '9', '2026-08-09'), null)
})

test('C relation UI supports real-life states and fails closed for minors', () => {
  for (const label of ['單身', '穩定交往或有伴侶', '已婚', '分居', '離婚', '喪偶', '不適用', '不願回答']) {
    assert.match(birthFields, new RegExp(label, 'u'))
  }
  assert.match(birthFields, /目前暫不接受未成年人委託/u)
  assert.match(singleForm, /未成年人委託暫未開放/u)
  assert.match(hook, /if \(cIsMinor\) return false/u)
  assert.doesNotMatch(hook, /guardian_attestation/u)
})

test('C final review includes every interpretation-affecting input', () => {
  assert.match(confirmation, /目前關係狀態/u)
  assert.match(confirmation, /這次最想理解或改善的事/u)
  assert.doesNotMatch(confirmation, /監護人授權/u)
})
