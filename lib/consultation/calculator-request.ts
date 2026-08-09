import { sha256HexSync } from './sha256.ts'

// The two calculator endpoints, kept apart on purpose.
//
// `LEGACY_CALCULATE_PATH` is frozen: E3 月度精選 and E1–E4 depend on its exact
// bytes, and the shared request model there still accepts unknown fields.
//
// `CONSULTATION_CALCULATE_PATH` is the strict C／G15 path.  It validates every
// consultation field, reads "today" from the request's `as_of` instead of the
// server clock, tells success apart from held and failed, and signs its exact
// response bytes.  Only `callPythonCalculateAttested()` uses it.
//
// The signed `path` value is one of the twelve HMAC fields, so these strings
// are a shared contract with the Python producer: change one side only and
// verification fails closed.
export const LEGACY_CALCULATE_PATH = '/api/calculate' as const
export const CONSULTATION_CALCULATE_PATH = '/api/consultation/v1/calculate' as const

export type CalculatorEndpointPath =
  | typeof LEGACY_CALCULATE_PATH
  | typeof CONSULTATION_CALCULATE_PATH

export type CalculatorBirthInput = {
  name?: unknown
  year?: unknown
  month?: unknown
  day?: unknown
  hour?: unknown
  minute?: unknown
  gender?: unknown
  calendar_type?: unknown
  calendarType?: unknown
  lunar_leap?: unknown
  lunarLeap?: unknown
  time_unknown?: unknown
  time_mode?: unknown
  timeMode?: unknown
  latitude?: unknown
  longitude?: unknown
  cityLat?: unknown
  cityLng?: unknown
  timezone_offset?: unknown
  cityTz?: unknown
  timezone?: unknown
  birth_city?: unknown
  birth_country?: unknown
  target_year?: unknown
  as_of?: unknown
  bazi_school?: unknown
  ayanamsa_type?: unknown
  ayanamsa?: unknown
  fold?: unknown
  [key: string]: unknown
}

export type CalculatorRequestPayload = Record<string, unknown>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function buildCalculatorRequestPayload(
  birthData: CalculatorBirthInput,
  options: { consultationMode?: boolean } = {},
): CalculatorRequestPayload {
  // Never infer consultation semantics from fields that a legacy stored row
  // may happen to contain. Only the C/G15 consultation caller may opt in.
  const consultationMode = options.consultationMode === true
  const timeUnknown = consultationMode
    ? birthData.time_unknown === true
    : birthData.time_unknown || false
  const timeMode = consultationMode
    ? (birthData.time_mode ?? birthData.timeMode ?? (timeUnknown ? 'unknown' : 'shichen'))
    : birthData.time_mode || birthData.timeMode || 'shichen'
  if (consultationMode && timeUnknown !== (timeMode === 'unknown')) {
    throw new RangeError('consultation time_unknown 與 time_mode 必須一致')
  }
  const payload: CalculatorRequestPayload = {
    name: birthData.name,
    year: birthData.year,
    month: birthData.month,
    day: birthData.day,
    hour: birthData.hour,
    minute: consultationMode ? (birthData.minute ?? 0) : (birthData.minute || 0),
    gender: birthData.gender,
    calendar_type: birthData.calendar_type || birthData.calendarType || 'solar',
    lunar_leap: birthData.lunar_leap || birthData.lunarLeap || false,
    time_unknown: timeUnknown,
    time_mode: timeMode,
  }
  const latitude = consultationMode
    ? birthData.latitude ?? birthData.cityLat
    : birthData.latitude || birthData.cityLat
  const longitude = consultationMode
    ? birthData.longitude ?? birthData.cityLng
    : birthData.longitude || birthData.cityLng
  const hasCoordinates = consultationMode
    ? latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null
    : Boolean(latitude) && Boolean(longitude)
  if (hasCoordinates) {
    payload.latitude = latitude
    payload.longitude = longitude
    payload.timezone_offset = consultationMode
      ? birthData.timezone_offset ?? birthData.cityTz ?? 8
      : birthData.timezone_offset || birthData.cityTz || 8
  }
  if (birthData.timezone) payload.timezone = birthData.timezone
  if (birthData.birth_city) payload.birth_city = birthData.birth_city
  if (birthData.birth_country) payload.birth_country = birthData.birth_country
  if (consultationMode && Number.isInteger(birthData.target_year)) payload.target_year = birthData.target_year
  if (consultationMode && typeof birthData.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(birthData.as_of)) {
    payload.as_of = birthData.as_of
  }
  // In consultation mode these three are always written, never omitted.
  //
  // They used to be conditional, so a checkout that had not collected a school
  // simply left the field out — and the strict endpoint declares all three as
  // required, which meant a 422, three retries and a failed paid report. The
  // deeper reason to send them explicitly: an absent field leaves the server
  // to pick a default, and "the server quietly picked a 流派" is the exact
  // failure FLY-C01 was about. Sending the value makes what was used auditable
  // in the signed request bytes.
  //
  // The defaults here are the product defaults, stated once:
  //   bazi_school   china_mainland  子初換日, the 中國/台灣 mainstream
  //   ayanamsa_type lahiri          Indian government 1956 official
  //   fold          0               non-ambiguous local times only have fold 0
  if (consultationMode) {
    const rawSchool = typeof birthData.bazi_school === 'string' ? birthData.bazi_school.trim() : ''
    if (rawSchool && !['china_mainland', 'japan_takaki', 'japan_abetaizan', 'korea'].includes(rawSchool)) {
      throw new RangeError('consultation bazi_school 不支援')
    }
    payload.bazi_school = rawSchool || 'china_mainland'

    const rawAyanamsa = birthData.ayanamsa_type ?? birthData.ayanamsa
    const ayanamsa = typeof rawAyanamsa === 'string' ? rawAyanamsa.trim() : ''
    if (ayanamsa && !['lahiri', 'raman', 'krishnamurti', 'kp'].includes(ayanamsa)) {
      throw new RangeError('consultation ayanamsa_type 不支援')
    }
    payload.ayanamsa_type = ayanamsa || 'lahiri'

    payload.fold = birthData.fold === 1 ? 1 : 0
  }
  return payload
}

export function hashCalculatorRequest(payload: CalculatorRequestPayload): `sha256:${string}` {
  const stable = serializeCalculatorRequest(payload)
  return `sha256:${sha256HexSync(stable)}`
}

export function serializeCalculatorRequest(payload: CalculatorRequestPayload): string {
  return JSON.stringify(stableValue(payload))
}
