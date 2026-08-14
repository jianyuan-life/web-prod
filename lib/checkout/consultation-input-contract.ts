import { buildAgeContext } from '../consultation/age-context.ts'
import { validateGregorianDate } from '../consultation/gregorian-date.ts'
import {
  CONSULTATION_RELATIONSHIP_STATUSES,
  type ConsultationRelationshipStatus as NormalizedRelationshipStatus,
} from '../consultation/relationship-context.ts'

export type ConsultationRelationshipStatus = '' | NormalizedRelationshipStatus

type ReadParam = (name: string) => string | null

export type SinglePersonDefaults = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  gender: string
  maritalStatus: ConsultationRelationshipStatus | 'unmarried'
  timeMode: 'unknown' | 'shichen' | 'exact'
}

const C_RELATIONSHIP_STATUSES = new Set<ConsultationRelationshipStatus>([
  '', ...CONSULTATION_RELATIONSHIP_STATUSES,
])

export function getSinglePersonDefaults(
  planCode: string,
  readParam: ReadParam,
  urlIsLunar: boolean,
): SinglePersonDefaults {
  const consultation = planCode === 'C'
  const relationshipParam = readParam('marital_status') || ''
  const consultationRelationship = C_RELATIONSHIP_STATUSES.has(relationshipParam as ConsultationRelationshipStatus)
    ? relationshipParam as ConsultationRelationshipStatus
    : ''
  const legacyRelationship: 'married' | 'unmarried' = relationshipParam === 'married' ? 'married' : 'unmarried'

  return {
    year: (urlIsLunar ? null : readParam('year')) || (consultation ? '' : '1990'),
    month: (urlIsLunar ? null : readParam('month')) || (consultation ? '' : '1'),
    day: (urlIsLunar ? null : readParam('day')) || (consultation ? '' : '1'),
    hour: readParam('hour') || '12',
    minute: readParam('minute') || (consultation ? '0' : '30'),
    gender: readParam('gender') || (consultation ? '' : 'M'),
    maritalStatus: consultation ? consultationRelationship : legacyRelationship,
    timeMode: (readParam('timeMode') as 'unknown' | 'shichen' | 'exact' | null)
      || (consultation ? 'unknown' : 'shichen'),
  }
}

export function getConsultationAge(
  year: string,
  month: string,
  day: string,
  asOfDate: string,
): number | null {
  if (!/^\d{4}$/u.test(year) || !/^\d{1,2}$/u.test(month) || !/^\d{1,2}$/u.test(day)) return null
  const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  try {
    return buildAgeContext({ birthDate, asOfDate }).ageYears
  } catch {
    return null
  }
}

export function currentLocalCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function isConsultationBirthDateInFuture(
  year: string,
  month: string,
  day: string,
  asOfDate: string = currentLocalCalendarDate(),
): boolean {
  if (!validateGregorianDate(year, month, day).valid) return false
  const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return birthDate > asOfDate
}
