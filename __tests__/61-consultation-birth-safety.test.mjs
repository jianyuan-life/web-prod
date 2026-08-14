import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  daysInGregorianMonth,
  isGregorianLeapYear,
  validateGregorianDate,
} from '../lib/consultation/gregorian-date.ts'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')
const singlePersonForm = read('components', 'checkout', 'SinglePersonForm.tsx')
const birthDataFields = read('components', 'checkout', 'BirthDataFields.tsx')
const birthTimeField = read('components', 'checkout', 'BirthTimeField.tsx')

test('Gregorian date rules handle ordinary, leap, and century years without Date coercion', () => {
  assert.equal(isGregorianLeapYear(2024), true)
  assert.equal(isGregorianLeapYear(1900), false)
  assert.equal(isGregorianLeapYear(2000), true)

  assert.equal(daysInGregorianMonth(2024, 2), 29)
  assert.equal(daysInGregorianMonth(2023, 2), 28)
  assert.equal(daysInGregorianMonth(2024, 4), 30)
  assert.equal(daysInGregorianMonth(2024, 1), 31)
  assert.equal(daysInGregorianMonth(2024, 13), 0)
})

test('canonical Gregorian validator rejects impossible and malformed dates', () => {
  assert.deepEqual(validateGregorianDate('2024', '2', '29'), {
    valid: true,
    reason: null,
    daysInMonth: 29,
  })
  assert.deepEqual(validateGregorianDate('1900', '2', '29'), {
    valid: false,
    reason: 'day',
    daysInMonth: 28,
  })
  assert.equal(validateGregorianDate('2024', '4', '31').valid, false)
  assert.equal(validateGregorianDate('2024x', '2', '1').reason, 'year')
  assert.equal(validateGregorianDate('2024', '0', '1').reason, 'month')
  assert.equal(validateGregorianDate('2024', '2', '2.5').reason, 'day')
})

test('C removes unsafe shortcut imports while legacy plans keep their existing picker path', () => {
  assert.match(singlePersonForm, /planCode\s*===\s*['"]C['"]\s*\?/u)
  assert.match(singlePersonForm, /為避免把舊資料中的曆法、時區或出生時間精確度帶錯/u)
  assert.match(singlePersonForm, /<FamilyMemberPicker/u)
  assert.match(singlePersonForm, /<HistoricalFigures/u)
  assert.match(singlePersonForm, /consultationBirthSafetyEnabled=\{planCode === ['"]C['"]\}/u)
})

test('C day choices use the canonical month length and legacy defaults remain opt-in safe', () => {
  assert.match(birthDataFields, /consultationBirthSafetyEnabled\?:\s*boolean/u)
  assert.match(birthDataFields, /consultationBirthSafetyEnabled\s*=\s*false/u)
  assert.match(birthDataFields, /daysInGregorianMonth/u)
  assert.match(birthDataFields, /consultationBirthSafetyEnabled\s*\?\s*gregorianDayCount/u)
  assert.match(birthDataFields, /consultationWording=\{consultationBirthSafetyEnabled\}/u)
})

test('C unknown-time wording directs the customer to support without promising self-service regeneration', () => {
  assert.match(birthTimeField, /consultationWording\?:\s*boolean/u)
  assert.match(birthTimeField, /consultationWording\s*=\s*false/u)
  assert.match(birthTimeField, /consultationWording\s*\?/u)
  assert.match(birthTimeField, /請聯絡客服核對是否適合重新生成/u)
})
