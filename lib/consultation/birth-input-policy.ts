export class ConsultationBirthInputPolicyError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ConsultationBirthInputPolicyError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const BAZI_SCHOOLS = new Set([
  'china_mainland',
  'japan_takaki',
  'japan_abetaizan',
  'korea',
])

const AYANAMSA_TYPES = new Set(['lahiri', 'raman', 'krishnamurti', 'kp'])

export interface ReplayableConsultationBirthSettings {
  timeUnknown: boolean
  timeMode: 'unknown' | 'shichen' | 'exact'
  hour: number
  minute: number
  latitude: number
  longitude: number
  timezone: string
  timezoneOffset: number
  baziSchool: string
  ayanamsaType: string
  fold: 0 | 1 | null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validIanaTimezone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timezone = value.trim()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0)
    return timezone
  } catch {
    return null
  }
}

/**
 * Fly consultation calculator currently accepts Gregorian fields only. Historical
 * lunar or calendar-unknown records must be converted with a traceable receipt
 * before they can enter C/G15; treating lunar numbers as Gregorian would silently
 * produce a different person chart.
 */
export function assertGregorianConsultationBirthInput(value: unknown): void {
  if (!isRecord(value)) {
    throw new ConsultationBirthInputPolicyError('birth.input_invalid', '出生資料格式不完整')
  }
  const calendarType = value.calendar_type ?? value.calendarType
  const lunarLeap = value.lunar_leap ?? value.lunarLeap
  if (calendarType !== 'solar' || lunarLeap === true) {
    throw new ConsultationBirthInputPolicyError(
      'birth.calendar_not_gregorian',
      'C/G15 新報告只接受已明確標示為國曆的出生日期；農曆資料需先完成可追溯轉換',
    )
  }
}

/**
 * Return the exact chart-affecting inputs required to replay a historical C
 * report inside G15. Missing location/timezone data is rejected instead of
 * silently falling back to Taipei or to a different astrology school.
 */
export function replayableConsultationBirthSettings(
  value: unknown,
): ReplayableConsultationBirthSettings {
  assertGregorianConsultationBirthInput(value)
  if (!isRecord(value)) {
    throw new ConsultationBirthInputPolicyError('birth.input_invalid', '出生資料格式不完整')
  }

  const timeUnknown = value.time_unknown === true
  const rawTimeMode = value.time_mode ?? value.timeMode
  if (!['unknown', 'shichen', 'exact'].includes(String(rawTimeMode))) {
    throw new ConsultationBirthInputPolicyError('birth.time_mode_missing', '出生時間精度未明確記錄')
  }
  const timeMode = rawTimeMode as ReplayableConsultationBirthSettings['timeMode']
  if (timeUnknown !== (timeMode === 'unknown')) {
    throw new ConsultationBirthInputPolicyError('birth.time_mode_mismatch', '出生時間精度紀錄互相矛盾')
  }

  const hour = finiteNumber(value.hour)
  const minute = finiteNumber(value.minute)
  if (
    hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    minute === null || !Number.isInteger(minute) || minute < 0 || minute > 59
  ) {
    throw new ConsultationBirthInputPolicyError('birth.time_invalid', '出生時間欄位不完整')
  }
  if (timeMode === 'unknown' && (hour !== 12 || minute !== 0)) {
    throw new ConsultationBirthInputPolicyError(
      'birth.unknown_time_placeholder_noncanonical',
      '未知出生時間必須使用固定的內部占位值，避免重播漂移',
    )
  }
  if (timeMode === 'shichen' && minute !== 0) {
    throw new ConsultationBirthInputPolicyError('birth.shichen_minute_invalid', '時辰資料不得夾帶推測分鐘')
  }

  const latitude = finiteNumber(value.latitude ?? value.cityLat ?? value.city_lat)
  const longitude = finiteNumber(value.longitude ?? value.cityLng ?? value.city_lng)
  if (latitude === null || latitude < -90 || latitude > 90) {
    throw new ConsultationBirthInputPolicyError('birth.latitude_missing', '缺少可重播的出生緯度')
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    throw new ConsultationBirthInputPolicyError('birth.longitude_missing', '缺少可重播的出生經度')
  }

  const timezone = validIanaTimezone(value.timezone)
  if (!timezone) {
    throw new ConsultationBirthInputPolicyError('birth.timezone_missing', '缺少有效的 IANA 出生時區')
  }
  const timezoneOffset = finiteNumber(value.timezone_offset ?? value.cityTz ?? value.city_tz)
  if (timezoneOffset === null || timezoneOffset < -12 || timezoneOffset > 14) {
    throw new ConsultationBirthInputPolicyError('birth.timezone_offset_missing', '缺少可重播的出生時區偏移')
  }

  const baziSchool = typeof value.bazi_school === 'string' && value.bazi_school.trim()
    ? value.bazi_school.trim()
    : 'china_mainland'
  if (!BAZI_SCHOOLS.has(baziSchool)) {
    throw new ConsultationBirthInputPolicyError('birth.bazi_school_invalid', '八字流派設定不受支援')
  }
  const rawAyanamsa = value.ayanamsa_type ?? value.ayanamsa
  const ayanamsaType = typeof rawAyanamsa === 'string' && rawAyanamsa.trim()
    ? rawAyanamsa.trim()
    : 'lahiri'
  if (!AYANAMSA_TYPES.has(ayanamsaType)) {
    throw new ConsultationBirthInputPolicyError('birth.ayanamsa_invalid', '吠陀歲差設定不受支援')
  }

  const fold = value.fold === 0 || value.fold === 1 ? value.fold : null
  return {
    timeUnknown,
    timeMode,
    hour,
    minute,
    latitude,
    longitude,
    timezone,
    timezoneOffset,
    baziSchool,
    ayanamsaType,
    fold,
  }
}
