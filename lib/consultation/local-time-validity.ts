export interface ConsultationLocalTimeInput {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  timezone: string
}

export type ConsultationLocalTimeStatus =
  | 'unique'
  | 'ambiguous'
  | 'nonexistent'
  | 'invalid'

export interface ConsultationLocalTimeValidity {
  status: ConsultationLocalTimeStatus
  candidateEpochMs: number[]
}

export type ConsultationLocalDateInput = Pick<
  ConsultationLocalTimeInput,
  'year' | 'month' | 'day' | 'timezone'
>

type WallClockParts = Omit<ConsultationLocalTimeInput, 'timezone'> & { second: number }

function wallClockParts(formatter: Intl.DateTimeFormat, epochMs: number): WallClockParts {
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(epochMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function sameMinute(parts: WallClockParts, input: ConsultationLocalTimeInput): boolean {
  return parts.year === input.year
    && parts.month === input.month
    && parts.day === input.day
    && parts.hour === input.hour
    && parts.minute === input.minute
}

/**
 * Finds how many real instants map to one IANA-zone wall-clock minute.
 * 0 = spring-forward gap, 1 = normal, 2+ = fall-back overlap.
 *
 * We sample offsets around the target date instead of asking JavaScript to
 * silently choose one side of a DST transition. This also covers half-hour
 * transitions and historical non-whole-hour offsets preserved by Intl.
 */
export function classifyConsultationLocalTime(
  input: ConsultationLocalTimeInput,
): ConsultationLocalTimeValidity {
  if (
    !Number.isInteger(input.year) || input.year < 1900 || input.year > 2200
    || !Number.isInteger(input.month) || input.month < 1 || input.month > 12
    || !Number.isInteger(input.day) || input.day < 1 || input.day > 31
    || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23
    || !Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59
    || typeof input.timezone !== 'string' || !input.timezone.trim()
  ) {
    return { status: 'invalid', candidateEpochMs: [] }
  }

  const nominalUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0)
  const nominalDate = new Date(nominalUtc)
  if (
    nominalDate.getUTCFullYear() !== input.year
    || nominalDate.getUTCMonth() + 1 !== input.month
    || nominalDate.getUTCDate() !== input.day
  ) {
    return { status: 'invalid', candidateEpochMs: [] }
  }

  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
      timeZone: input.timezone.trim(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    return { status: 'invalid', candidateEpochMs: [] }
  }

  const offsets = new Set<number>()
  for (let hours = -48; hours <= 48; hours += 3) {
    const sampleEpoch = nominalUtc + hours * 60 * 60 * 1000
    const parts = wallClockParts(formatter, sampleEpoch)
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    offsets.add(representedAsUtc - sampleEpoch)
  }

  const matches = [...offsets]
    .map((offsetMs) => nominalUtc - offsetMs)
    .filter((candidateEpoch) => sameMinute(wallClockParts(formatter, candidateEpoch), input))
    .filter((candidateEpoch, index, candidates) => candidates.indexOf(candidateEpoch) === index)
    .sort((left, right) => left - right)

  return {
    status: matches.length === 0 ? 'nonexistent' : matches.length === 1 ? 'unique' : 'ambiguous',
    candidateEpochMs: matches,
  }
}

/**
 * Unknown birth time still needs a real local calendar date. Some civil-time
 * changes skipped an entire date (for example Pacific/Apia 2011-12-30). We
 * probe several hours and retain one real instant only as an internal anchor;
 * it must never be presented as the person's birth time.
 */
export function resolveConsultationUnknownTime(
  input: ConsultationLocalDateInput,
): ConsultationLocalTimeValidity {
  for (const hour of [12, 6, 18, 0, 23]) {
    const validity = classifyConsultationLocalTime({ ...input, hour, minute: 0 })
    if (validity.status === 'invalid') return validity
    if (validity.candidateEpochMs.length > 0) {
      return { status: 'unique', candidateEpochMs: [validity.candidateEpochMs[0]] }
    }
  }
  return { status: 'nonexistent', candidateEpochMs: [] }
}

/** Return the IANA-zone offset at one already-resolved instant. */
export function consultationTimezoneOffsetHoursAtEpoch(
  timezone: string,
  epochMs: number,
): number | null {
  if (!Number.isFinite(epochMs) || typeof timezone !== 'string' || !timezone.trim()) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
      timeZone: timezone.trim(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const parts = wallClockParts(formatter, epochMs)
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    return Math.round(((representedAsUtc - epochMs) / 3_600_000) * 1_000_000) / 1_000_000
  } catch {
    return null
  }
}

export function consultationLocalTimeIssueMessage(
  status: ConsultationLocalTimeStatus,
): string | null {
  if (status === 'ambiguous') {
    return '這個出生時間正逢夏令時間切換，同一個時間出現兩次；目前系統無法安全判定是哪一次，因此暫不進入付款。請改選「不知道確切時間」，或先聯絡客服確認。'
  }
  if (status === 'nonexistent') {
    return '這個出生時間正逢夏令時間切換，當地時鐘不存在這一分鐘；請重新核對時間，或改選「不知道確切時間」。'
  }
  if (status === 'invalid') return '出生日期、時間或時區資料不完整，請重新核對。'
  return null
}
