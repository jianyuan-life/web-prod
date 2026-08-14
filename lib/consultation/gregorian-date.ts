export type GregorianDateInvalidReason = 'year' | 'month' | 'day'

export interface GregorianDateValidation {
  valid: boolean
  reason: GregorianDateInvalidReason | null
  daysInMonth: number | null
}

function parseStrictInteger(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null
  }

  const normalized = value.trim()
  if (!/^-?\d+$/u.test(normalized)) return null

  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function isGregorianLeapYear(year: number): boolean {
  return Number.isInteger(year)
    && year > 0
    && (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0))
}

export function daysInGregorianMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year <= 0 || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0
  }

  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

export function validateGregorianDate(
  yearValue: string | number,
  monthValue: string | number,
  dayValue: string | number,
): GregorianDateValidation {
  const year = parseStrictInteger(yearValue)
  if (year === null || year <= 0) {
    return { valid: false, reason: 'year', daysInMonth: null }
  }

  const month = parseStrictInteger(monthValue)
  if (month === null || month < 1 || month > 12) {
    return { valid: false, reason: 'month', daysInMonth: null }
  }

  const daysInMonth = daysInGregorianMonth(year, month)
  const day = parseStrictInteger(dayValue)
  if (day === null || day < 1 || day > daysInMonth) {
    return { valid: false, reason: 'day', daysInMonth }
  }

  return { valid: true, reason: null, daysInMonth }
}
