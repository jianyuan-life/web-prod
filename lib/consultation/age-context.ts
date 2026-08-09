export type BuildAgeContextInput = {
  birthDate: string
  asOfDate: string
}

export type AgeStage =
  | 'toddler'
  | 'child'
  | 'teen'
  | 'young_adult'
  | 'early_mid'
  | 'mid'
  | 'pre_senior'
  | 'elder'

export type ReaderMode = 'guardian' | 'co-read' | 'self'

export type AgeContext = {
  asOfDate: string
  ageYears: number
  stage: AgeStage
  readerMode: ReaderMode
  timeHorizonEndAge: number | null
  allowedTopics: string[]
  prohibitedTopics: string[]
}

type StagePolicy = {
  readerMode: ReaderMode
  timeHorizonEndAge: number | ((ageYears: number) => number)
  allowedTopics: readonly string[]
  prohibitedTopics: readonly string[]
}

const COMMON_PROHIBITED_TOPICS = [
  'medical_diagnosis',
  'legal_guarantee',
  'financial_guarantee_or_specific_allocation',
  'educational_diagnosis',
  'unsupported_time_prediction',
] as const

const MINOR_PROHIBITED_TOPICS = [
  'parental_surveillance',
  'deterministic_labeling',
  'self_fulfilling_prediction',
  'deterministic_education_or_career_prediction',
  'minor_responsible_for_family_repair',
  'expose_minor_sensitive_assessment',
] as const

const ADULT_PROHIBITED_TOPICS = [
  'assume_marriage',
  'assume_gender_role',
  'assume_career',
  'assume_property',
  'assume_children',
] as const

const STAGE_POLICIES: Record<AgeStage, StagePolicy> = {
  toddler: {
    readerMode: 'guardian',
    timeHorizonEndAge: 12,
    allowedTopics: [
      'temperament',
      'sensory_and_sleep_rhythm',
      'attachment_and_care_environment',
      'play_and_exploration',
    ],
    prohibitedTopics: [
      'romance',
      'marriage',
      'wealth_prediction',
      'career_prediction',
      'deterministic_labeling',
    ],
  },
  child: {
    readerMode: 'guardian',
    timeHorizonEndAge: 25,
    allowedTopics: [
      'learning_style',
      'emotional_expression',
      'peer_relationships',
      'family_communication',
      'interest_exploration',
    ],
    prohibitedTopics: [
      'romance',
      'marriage_matching',
      'investment_instruction',
      'adult_workplace',
      'deterministic_future',
    ],
  },
  teen: {
    readerMode: 'co-read',
    timeHorizonEndAge: 30,
    allowedTopics: [
      'identity',
      'learning',
      'peer_relationships',
      'boundaries',
      'family_negotiation',
      'interests_and_direction',
    ],
    prohibitedTopics: [
      'marriage_matching',
      'wealth_prediction',
      'pressure_to_finalize_identity',
      'parental_surveillance',
    ],
  },
  young_adult: {
    readerMode: 'self',
    timeHorizonEndAge: 45,
    allowedTopics: [
      'experimentation',
      'professional_foundation',
      'financial_independence_foundation',
      'intimate_relationship_patterns',
      'living_and_personal_boundaries',
    ],
    prohibitedTopics: [
      'pressure_to_marry',
      'retirement_as_inevitable',
      'exploration_as_failure',
    ],
  },
  early_mid: {
    readerMode: 'self',
    timeHorizonEndAge: 60,
    allowedTopics: [
      'professional_deepening',
      'major_choices',
      'intimate_relationships',
      'family_and_care_responsibilities',
      'resource_allocation',
    ],
    prohibitedTopics: [
      'assume_marriage_children_or_mortgage',
      'single_path_family_pressure',
    ],
  },
  mid: {
    readerMode: 'self',
    timeHorizonEndAge: 70,
    allowedTopics: [
      'second_curve',
      'relationship_restructuring',
      'burden_and_division_of_labor',
      'intergenerational_care',
      'mind_body_rhythm',
    ],
    prohibitedTopics: [
      'midlife_crisis_fear',
      'parental_death_prediction',
      'financial_loss_prediction',
    ],
  },
  pre_senior: {
    readerMode: 'self',
    timeHorizonEndAge: 75,
    allowedTopics: [
      'handover',
      'second_life',
      'work_and_retirement_options',
      'social_connection_and_meaning',
      'care_boundaries',
    ],
    prohibitedTopics: [
      'retirement_as_inevitable',
      'lifespan_prediction',
      'filial_piety_judgment',
      'wellness_sales',
    ],
  },
  elder: {
    readerMode: 'self',
    timeHorizonEndAge: (ageYears) => ageYears + 10,
    allowedTopics: [
      'legacy',
      'life_rhythm',
      'relationship_repair',
      'social_connection',
      'mindset_and_autonomy',
    ],
    prohibitedTopics: [
      'lifespan_prediction',
      'disease_deterioration_prediction',
      'burden_to_children_label',
      'life_extension_or_religious_fear',
    ],
  },
}

const STAGE_UPPER_BOUNDS: readonly [number, AgeStage][] = [
  [6, 'toddler'],
  [12, 'child'],
  [17, 'teen'],
  [30, 'young_adult'],
  [40, 'early_mid'],
  [50, 'mid'],
  [60, 'pre_senior'],
  [Number.POSITIVE_INFINITY, 'elder'],
]

function getAgeStage(ageYears: number): AgeStage {
  return STAGE_UPPER_BOUNDS.find(([upperBound]) => ageYears <= upperBound)![1]
}

type CalendarDate = {
  year: number
  month: number
  day: number
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function parseCalendarDate(value: string, field: 'birthDate' | 'asOfDate'): CalendarDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must be an explicit YYYY-MM-DD calendar date`)
  }

  const [year, month, day] = value.split('-').map(Number)
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new RangeError(`${field} must be a valid Gregorian calendar date`)
  }

  return { year, month, day }
}

/**
 * Builds the shared C/G15 content contract from date-only calendar values.
 * Date-time strings are rejected so server timezone cannot move a birthday.
 * A Feb 29 birthday advances on Mar 1 in a non-leap year.
 */
export function buildAgeContext({ birthDate, asOfDate }: BuildAgeContextInput): AgeContext {
  const birth = parseCalendarDate(birthDate, 'birthDate')
  const asOf = parseCalendarDate(asOfDate, 'asOfDate')
  const birthKey = birth.year * 10_000 + birth.month * 100 + birth.day
  const asOfKey = asOf.year * 10_000 + asOf.month * 100 + asOf.day
  if (birthKey > asOfKey) {
    throw new RangeError('birthDate cannot be after asOfDate')
  }

  const birthdayHasOccurred =
    asOf.month > birth.month ||
    (asOf.month === birth.month && asOf.day >= birth.day)
  const ageYears = asOf.year - birth.year - (birthdayHasOccurred ? 0 : 1)
  const stage = getAgeStage(ageYears)
  const policy = STAGE_POLICIES[stage]
  const timeHorizonEndAge = typeof policy.timeHorizonEndAge === 'function'
    ? policy.timeHorizonEndAge(ageYears)
    : policy.timeHorizonEndAge

  return {
    asOfDate,
    ageYears,
    stage,
    readerMode: policy.readerMode,
    timeHorizonEndAge,
    allowedTopics: [...policy.allowedTopics],
    prohibitedTopics: [
      ...new Set([
        ...COMMON_PROHIBITED_TOPICS,
        ...(ageYears < 18 ? MINOR_PROHIBITED_TOPICS : []),
        ...(ageYears >= 18 ? ADULT_PROHIBITED_TOPICS : []),
        ...policy.prohibitedTopics,
      ]),
    ],
  }
}

export function serializeAgeContext(context: AgeContext): string {
  return JSON.stringify({
    asOfDate: context.asOfDate,
    ageYears: context.ageYears,
    stage: context.stage,
    readerMode: context.readerMode,
    timeHorizonEndAge: context.timeHorizonEndAge,
    allowedTopics: context.allowedTopics,
    prohibitedTopics: context.prohibitedTopics,
  })
}
