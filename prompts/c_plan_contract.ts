export type CPromptPeriodContext = {
  asOf?: string
  targetYear?: number
  timeUnknown?: boolean
  birthMonth?: number
  birthDay?: number
  birthYear?: number
  ageGroup?: string
  clientNeed?: string
  relationshipStatus?: string
}

export type CPromptPeriod = {
  asOf: string
  targetYear: number
  targetYearGanzhi: string
  fiveYearEnd: number
  fiveYearRange: string
}

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
}

function isoDateFromDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function computeGregorianYearGanzhi(year: number): string {
  const normalizedYear = Number.isInteger(year) ? year : 1984
  const offset = normalizedYear - 1984
  const stem = STEMS[((offset % 10) + 10) % 10]
  const branch = BRANCHES[((offset % 12) + 12) % 12]
  return `${stem}${branch}`
}

export function resolveCPromptPeriod(
  context: CPromptPeriodContext = {},
  now: Date = new Date(),
): CPromptPeriod {
  const asOf = validIsoDate(context.asOf) ? context.asOf : isoDateFromDate(now)
  const asOfYear = Number(asOf.slice(0, 4))
  const targetYear = Number.isInteger(context.targetYear) && context.targetYear! >= 1900 && context.targetYear! <= 2200
    ? context.targetYear!
    : asOfYear
  const fiveYearEnd = targetYear + 4
  return {
    asOf,
    targetYear,
    targetYearGanzhi: computeGregorianYearGanzhi(targetYear),
    fiveYearEnd,
    fiveYearRange: `${targetYear}-${fiveYearEnd}`,
  }
}

export function calculateAgeAsOf(
  birthYear: number,
  birthMonth = 1,
  birthDay = 1,
  asOf?: string,
  now: Date = new Date(),
): number {
  const reference = validIsoDate(asOf) ? asOf : isoDateFromDate(now)
  const [referenceYear, referenceMonth, referenceDay] = reference.split('-').map(Number)
  const hadBirthday = referenceMonth > birthMonth ||
    (referenceMonth === birthMonth && referenceDay >= birthDay)
  return Math.max(0, referenceYear - birthYear - (hadBirthday ? 0 : 1))
}

export function cLifeStageForAge(age: number): 'toddler' | 'child' | 'teen' | 'young_adult' | 'early_mid' | 'mid' | 'pre_senior' | 'elder' {
  if (age <= 6) return 'toddler'
  if (age <= 12) return 'child'
  if (age <= 18) return 'teen'
  if (age <= 30) return 'young_adult'
  if (age <= 40) return 'early_mid'
  if (age <= 50) return 'mid'
  if (age <= 60) return 'pre_senior'
  return 'elder'
}

export function buildCPromptPeriodInstruction(period: CPromptPeriod): string {
  return `【本報告時間基準】\n- 資料基準日：${period.asOf}\n- 分析目標年：${period.targetYear}（${period.targetYearGanzhi}年）\n- 五年展望：${period.fiveYearRange}\n所有「今年／未來五年」都以這組日期為準，不得改用模型當下日期。`
}

export function buildUnknownBirthTimeInstruction(timeUnknown: boolean): string {
  if (!timeUnknown) return ''
  return `【出生時間未提供】12:00 只是資料傳輸與計算流程的內部占位，不是客戶的真實出生時刻。不得把占位時間寫成事實，也不得引用任何會隨出生時刻改變的排盤結果。`
}

const V4_AGE_INSTRUCTIONS: Record<string, string> = {
  toddler: '【幼兒 0-6 歲】寫給父母；只談作息、情緒、興趣與親子互動，不套用成人議題。',
  child: '【兒童 7-12 歲】寫給父母；聚焦學習、同儕、情緒與陪伴方法，不談桃花、投資或職場。',
  teen: '【青少年 13-18 歲】兼顧本人與父母；聚焦升學、自我認同、壓力與界線，不預測婚戀。',
  young_adult: '【青年 19-30 歲】直接寫給本人；聚焦職涯、財務獨立、自我探索與重要關係，不催促單一路徑。',
  early_mid: '【早中年 31-40 歲】直接寫給本人；處理工作、家庭、財務與時間取捨，不預設婚育。',
  mid: '【中年 41-50 歲】直接寫給本人；聚焦責任重整、職涯、健康與家庭界線，不使用危機恐嚇。',
  pre_senior: '【中老年過渡 51-60 歲】尊重經驗與自主；聚焦工作轉換、退休準備、健康、社交與生活意義。',
  elder: '【長者 61+ 歲】使用「您」並保持尊重；聚焦生活、傳承、健康習慣與心願，不預測壽命或重病。',
  adult: '【成人】直接寫給本人；依已提供的實際生活狀態分析，不預設伴侶、子女或職業。',
}

export function buildV4AgeInstruction(ageGroup: string): string {
  return V4_AGE_INSTRUCTIONS[ageGroup] ?? V4_AGE_INSTRUCTIONS.adult
}
