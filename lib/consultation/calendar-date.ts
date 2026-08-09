export type GregorianDateParts = {
  year: unknown
  month: unknown
  day: unknown
}
export function canonicalGregorianDate(
  input: GregorianDateParts,
  bounds: { minimumYear?: number; maximumYear?: number } = {},
): string {
  const year = Number(input.year)
  const month = Number(input.month)
  const day = Number(input.day)
  const minimumYear = bounds.minimumYear ?? 1
  const maximumYear = bounds.maximumYear ?? 9999
  if (
    !Number.isInteger(year) || year < minimumYear || year > maximumYear ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(day) || day < 1 || day > 31
  ) {
    throw new RangeError('invalid Gregorian calendar date')
  }
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError('invalid Gregorian calendar date')
  }
  return value
}
