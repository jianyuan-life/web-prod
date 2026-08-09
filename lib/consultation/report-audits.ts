export type AuditableParagraph = {
  paragraphId: string
  text: string
  claimIds?: readonly string[]
  subjectPersonIds?: readonly string[]
}

export type ReportAuditIssue = {
  code: string
  severity: 'hard'
  paragraphIds: string[]
  message: string
}

export type DeterministicAuditInput = {
  paragraphs?: readonly AuditableParagraph[]
  customerVisibleTexts?: readonly AuditableParagraph[]
  ageContexts?: readonly {
    personId: string
    birthDate?: string
    asOfDate?: string
    ageYears: number
    timeHorizonEndAge?: number | null
    stage?: 'toddler' | 'child' | 'teen' | 'young_adult' | 'early_mid' | 'mid' | 'pre_senior' | 'elder'
    prohibitedTopics?: readonly string[]
  }[]
  claimLedger?: {
    entries?: readonly { claimId: string; subjectPersonIds?: readonly string[] }[]
  }
}

export const NEAR_DUPLICATE_THRESHOLD = 0.86
const MIN_NEAR_DUPLICATE_LENGTH = 80
const HEAVENLY_STEMS = '甲乙丙丁戊己庚辛壬癸'
const EARTHLY_BRANCHES = '子丑寅卯辰巳午未申酉戌亥'

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

/** Gregorian year ganzhi, anchored on 4 CE = 甲子. */
export function getGanzhiYear(year: number): string {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('year must be an integer from 1 to 9999')
  }
  return `${HEAVENLY_STEMS[positiveModulo(year - 4, 10)]}${EARTHLY_BRANCHES[positiveModulo(year - 4, 12)]}`
}

function issue(code: string, paragraphIds: string[], message: string): ReportAuditIssue {
  return { code, severity: 'hard', paragraphIds, message }
}

export function auditTemporalClaims(
  paragraphs: readonly AuditableParagraph[] = [],
  ageContexts: NonNullable<DeterministicAuditInput['ageContexts']> = [],
  claimLedger: DeterministicAuditInput['claimLedger'] = { entries: [] },
): ReportAuditIssue[] {
  const issues: ReportAuditIssue[] = []
  const yearGanzhi = /\b((?:19|20|21)\d{2})\s*年?[^\n。；;]{0,18}?([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/gu
  const explicitDate = /\b((?:19|20|21)\d{2})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*日?/gu
  const asOfDateClaim = /(?:截至|資料基準日(?:為)?|報告基準日(?:為)?)\s*((?:19|20|21)\d{2})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*日?/gu
  const currentAgeClaim = /(?:目前|現在|現年|今年(?:是|已)?)\s*[^\d。；;]{0,10}?(\d{1,3})\s*歲/gu
  const futureAgeClaim = /(?:到|到了|年滿)\s*(\d{1,3})\s*歲(?:時|前後|以後|之後)?/gu
  const planningYearClaim = /\b((?:19|20|21)\d{2})\s*年[^\n。；;]{0,24}?(?:會|將|預計|可以|建議|適合|進入|面臨)/gu
  const contextByPersonId = new Map(ageContexts.map((context) => [context.personId, context]))
  const subjectsByClaimId = new Map(
    (claimLedger?.entries ?? []).map((claim) => [claim.claimId, claim.subjectPersonIds ?? []]),
  )

  const boundContexts = (paragraph: AuditableParagraph) => {
    const personIds = [...new Set([
      ...(paragraph.subjectPersonIds ?? []),
      ...(paragraph.claimIds ?? []).flatMap((claimId) => subjectsByClaimId.get(claimId) ?? []),
    ])]
    return personIds.map((personId) => contextByPersonId.get(personId)).filter(Boolean) as Array<NonNullable<typeof ageContexts[number]>>
  }

  const validDate = (year: number, month: number, day: number): string | null => {
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) return null
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  for (const paragraph of paragraphs) {
    if (typeof paragraph?.text !== 'string') continue
    for (const match of paragraph.text.matchAll(yearGanzhi)) {
      const year = Number(match[1])
      const actual = match[2]
      const expected = getGanzhiYear(year)
      if (actual !== expected) {
        issues.push(issue(
          'temporal.ganzhi_mismatch',
          [paragraph.paragraphId],
          `${year} 年干支應為 ${expected}，內容卻寫成 ${actual}`,
        ))
      }
    }
    for (const match of paragraph.text.matchAll(explicitDate)) {
      if (!validDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
        issues.push(issue('temporal.date_invalid', [paragraph.paragraphId], `內容含不可能的日期 ${match[0].trim()}`))
      }
    }

    const contexts = boundContexts(paragraph)
    for (const match of paragraph.text.matchAll(asOfDateClaim)) {
      const asserted = validDate(Number(match[1]), Number(match[2]), Number(match[3]))
      if (!asserted) continue
      if (contexts.length === 0) {
        issues.push(issue('temporal.subject_missing', [paragraph.paragraphId], '基準日陳述缺少可重算的人物綁定'))
      } else if (contexts.some((context) => !context.asOfDate || context.asOfDate !== asserted)) {
        issues.push(issue('temporal.as_of_mismatch', [paragraph.paragraphId], `內容基準日 ${asserted} 與報告 AgeContext 不一致`))
      }
    }

    for (const match of paragraph.text.matchAll(currentAgeClaim)) {
      const assertedAge = Number(match[1])
      if (contexts.length === 0) {
        issues.push(issue('temporal.subject_missing', [paragraph.paragraphId], '目前年齡陳述缺少可重算的人物綁定'))
        continue
      }
      const expectedAges = [...new Set(contexts.map((context) => context.ageYears))]
      if (expectedAges.length !== 1) {
        issues.push(issue('temporal.age_ambiguous', [paragraph.paragraphId], '同一段綁定多位不同年齡人物，卻只寫一個目前年齡'))
      } else if (assertedAge !== expectedAges[0]) {
        issues.push(issue('temporal.current_age_mismatch', [paragraph.paragraphId], `目前年齡應為 ${expectedAges[0]} 歲，內容卻寫成 ${assertedAge} 歲`))
      }
    }

    for (const match of paragraph.text.matchAll(futureAgeClaim)) {
      const assertedAge = Number(match[1])
      for (const context of contexts) {
        if (assertedAge < context.ageYears) {
          issues.push(issue('temporal.future_age_before_present', [paragraph.paragraphId], `未來年齡 ${assertedAge} 歲早於目前 ${context.ageYears} 歲`))
        }
        if (context.timeHorizonEndAge !== null && context.timeHorizonEndAge !== undefined && assertedAge > context.timeHorizonEndAge) {
          issues.push(issue('temporal.age_horizon_exceeded', [paragraph.paragraphId], `年齡 ${assertedAge} 歲超出本報告 ${context.timeHorizonEndAge} 歲的討論範圍`))
        }
      }
    }

    for (const match of paragraph.text.matchAll(planningYearClaim)) {
      const assertedYear = Number(match[1])
      for (const context of contexts) {
        const asOfYear = Number(context.asOfDate?.slice(0, 4))
        const birthYear = Number(context.birthDate?.slice(0, 4))
        if (Number.isInteger(asOfYear) && assertedYear < asOfYear) {
          issues.push(issue('temporal.past_year_as_plan', [paragraph.paragraphId], `${assertedYear} 年早於報告基準年，不得寫成未來規劃`))
        }
        if (
          Number.isInteger(birthYear) &&
          context.timeHorizonEndAge !== null && context.timeHorizonEndAge !== undefined &&
          assertedYear > birthYear + context.timeHorizonEndAge + 1
        ) {
          issues.push(issue('temporal.year_horizon_exceeded', [paragraph.paragraphId], `${assertedYear} 年超出該人物的報告討論範圍`))
        }
      }
    }
  }
  return issues
}

function normalizeForSimilarity(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/[*_~`>#|\[\](){}]/gu, '')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function shingles(text: string, width = 4): Set<string> {
  const result = new Set<string>()
  for (let index = 0; index <= text.length - width; index += 1) {
    result.add(text.slice(index, index + width))
  }
  return result
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

export function auditNearDuplicates(
  paragraphs: readonly AuditableParagraph[] = [],
): ReportAuditIssue[] {
  const candidates = paragraphs
    .filter((paragraph) => typeof paragraph?.text === 'string')
    .map((paragraph) => {
      const normalized = normalizeForSimilarity(paragraph.text)
      return { paragraph, normalized, shingles: shingles(normalized) }
    })
    .filter((entry) => entry.normalized.length >= MIN_NEAR_DUPLICATE_LENGTH)
  const issues: ReportAuditIssue[] = []

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]
      const right = candidates[rightIndex]
      const containment = Math.min(left.normalized.length, right.normalized.length) /
        Math.max(left.normalized.length, right.normalized.length)
      const similarity = jaccard(left.shingles, right.shingles)
      if (containment >= 0.8 && similarity >= NEAR_DUPLICATE_THRESHOLD) {
        issues.push(issue(
          'content.near_duplicate',
          [left.paragraph.paragraphId, right.paragraph.paragraphId],
          `兩段文字近似度 ${(similarity * 100).toFixed(1)}%，需合併或改寫為新資訊`,
        ))
      }
    }
  }
  return issues
}

const MACHINE_PROCESS_PATTERN = /(?:facts?\s+ledger|claim\s+ledger|schema|json|pipeline|驗證通過|品質閘門|台帳|模型輸出|prompt|token|artifact|hash|fly-release|digest\s*=|sha256:|\bgit\s*=)/iu
const MARKDOWN_PATTERN = /(?:\*\*|__|`{1,3}|^\s*#{1,6}\s|^\s*>\s|^\s*[-*+]\s|\|\s*[-:]{2,}\s*\|)/mu
const EMOJI_PATTERN = /[\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u
const HTML_PATTERN = /<\/?[a-z][^>]{0,300}>|&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/iu
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

export function auditHumanLanguage(
  paragraphs: readonly AuditableParagraph[] = [],
): ReportAuditIssue[] {
  const issues: ReportAuditIssue[] = []
  for (const paragraph of paragraphs) {
    const text = typeof paragraph?.text === 'string' ? paragraph.text : ''
    if (MACHINE_PROCESS_PATTERN.test(text)) {
      issues.push(issue('language.machine_process', [paragraph.paragraphId], '正文含內部流程或機器介面用語'))
    }
    if (MARKDOWN_PATTERN.test(text)) {
      issues.push(issue('language.markdown_residue', [paragraph.paragraphId], '正文含未轉譯的 Markdown 標記'))
    }
    if (EMOJI_PATTERN.test(text)) {
      issues.push(issue('language.emoji', [paragraph.paragraphId], '正文含不屬於報告視覺語言的 emoji'))
    }
    if (HTML_PATTERN.test(text)) {
      issues.push(issue('language.html_residue', [paragraph.paragraphId], '讀者文字含未轉譯的 HTML 或 entity'))
    }
    if (CONTROL_PATTERN.test(text)) {
      issues.push(issue('language.control_character', [paragraph.paragraphId], '讀者文字含控制或雙向覆寫字元'))
    }
  }
  return issues
}

const DETERMINISTIC_PATTERN = /(?:注定|命中註定|一定(?:會|是|要|適合)|必然(?:會|是)|絕對(?:會|不會|是)|天生就是|一輩子都|永遠無法|無法改變)/u
const PERSONAL_FINANCE_PATTERN = /(?:(?:必須|應該|務必).{0,18}(?:投入|買入|賣出|賣掉|改買|持有|配置).{0,12}\d+\s*%|\d+\s*%\s*(?:資產|資金).{0,18}(?:投入|買入|配置)|(?:使用|開啟|加到).{0,8}[一二三四五六七八九十\d]+\s*倍槓桿|(?:應該|必須|務必|今天|明天|現在).{0,18}(?:賣掉|賣出|買入|改買|投入|全倉|清倉).{0,18}(?:基金|股票|科技股|比特幣|加密貨幣|虛擬貨幣|債券|期權|選擇權|房產|黃金))/u
const MEDICAL_DIAGNOSIS_PATTERN = /(?:(?:命盤|八字|星盤|紫微|占星).{0,12}(?:證明|顯示|看出|代表).{0,14}(?:你|他|她)?(?:有|罹患|患有|得了|會得|一定會生病).{0,12}(?:糖尿病|高血壓|心臟病|癌症|癌|憂鬱症|躁鬱症|自閉症|疾病|病症)|(?:確診|你患有).{0,20}(?:疾病|症|癌|病))/u
const MEDICAL_TREATMENT_OVERRIDE_PATTERN = /(?:(?:停止|停用|中斷|自行調整).{0,14}(?:醫師|醫生).{0,10}(?:開立|處方|藥物)|單靠.{0,12}(?:命盤|命理|八字|星盤).{0,14}(?:恢復|康復|痊癒|治好))/u
const ASSET_CONCENTRATION_PATTERN = /(?:(?:全部|所有).{0,8}(?:資產|資金|積蓄).{0,12}(?:集中|投入|買入)|(?:翻身|致富).{0,10}(?:唯一道路|唯一方法|唯一選擇))/u
const RELATIONSHIP_FINALITY_PATTERN = /(?:(?:婚姻|關係).{0,14}(?:沒有|已無|不存在).{0,12}(?:修復空間|挽回可能)|(?:分開|離婚).{0,10}(?:唯一結局|唯一選擇|唯一道路))/u
const PERSONAL_LEGAL_PATTERN = /(?:(?:應該|可以|必須|務必|直接).{0,14}(?:認罪|簽約|解約|提告|撤告|和解|放棄繼承|移轉產權|過戶|作證).{0,18}(?:不用|不必|無須)?.{0,8}(?:律師|法律意見|專業諮詢)?|(?:不用|不必|無須).{0,10}(?:找|問|諮詢).{0,6}(?:律師|法律專業).{0,12}(?:認罪|簽約|提告|和解))/u
const INFERRED_ROLE_PATTERN = /第\s*[一二三四五六七八九十\d]+\s*位\s*(?:男性|女性|男生|女生).{0,16}(?:就是|代表|必定是).{0,6}(?:父親|母親|丈夫|妻子|哥哥|弟弟|姐姐|妹妹|兒子|女兒)/u
const STIGMA_PATTERN = /(?:問題小孩|拖累全家|剋父|剋母|剋夫|剋妻|沒有救|家庭負擔)/u

export function auditHighRiskLanguage(
  paragraphs: readonly AuditableParagraph[] = [],
): ReportAuditIssue[] {
  const issues: ReportAuditIssue[] = []
  for (const paragraph of paragraphs) {
    const text = typeof paragraph?.text === 'string' ? paragraph.text : ''
    if (DETERMINISTIC_PATTERN.test(text)) {
      issues.push(issue('safety.deterministic_claim', [paragraph.paragraphId], '內容把詮釋寫成不可改變的命令或結局'))
    }
    if (PERSONAL_FINANCE_PATTERN.test(text)) {
      issues.push(issue('safety.personal_financial_instruction', [paragraph.paragraphId], '內容含未經適合度評估的個人化投資比例或槓桿指令'))
    }
    if (MEDICAL_DIAGNOSIS_PATTERN.test(text)) {
      issues.push(issue('safety.medical_diagnosis', [paragraph.paragraphId], '內容以命理作醫療診斷或疾病斷言'))
    }
    if (MEDICAL_TREATMENT_OVERRIDE_PATTERN.test(text)) {
      issues.push(issue('safety.medical_treatment_override', [paragraph.paragraphId], '內容要求以命理取代醫囑或自行停止治療'))
    }
    if (ASSET_CONCENTRATION_PATTERN.test(text)) {
      issues.push(issue('safety.asset_concentration', [paragraph.paragraphId], '內容要求集中全部資產或把投機寫成唯一道路'))
    }
    if (RELATIONSHIP_FINALITY_PATTERN.test(text)) {
      issues.push(issue('safety.relationship_finality', [paragraph.paragraphId], '內容把關係寫成沒有修復空間的唯一結局'))
    }
    if (PERSONAL_LEGAL_PATTERN.test(text)) {
      issues.push(issue('safety.personal_legal_instruction', [paragraph.paragraphId], '內容含未經個案專業審查的法律行動指示'))
    }
    if (INFERRED_ROLE_PATTERN.test(text)) {
      issues.push(issue('safety.inferred_family_role', [paragraph.paragraphId], '內容以出現順序或性別推定家庭角色'))
    }
    if (STIGMA_PATTERN.test(text)) {
      issues.push(issue('safety.stigmatizing_label', [paragraph.paragraphId], '內容含污名化或傷害性的家庭標籤'))
    }
  }
  return issues
}

const MINOR_ADULT_TOPIC_PATTERN = /(?:早婚|晚婚|婚配|結婚對象|投資比例|股票配置|使用槓桿|成人職場|(?:成年後|長大後|未來).{0,20}(?:公司|職場|主管|升遷|加薪|工作談判|感情伴侶|戀愛|結婚|買房)|承擔.{0,8}(?:修復|拯救).{0,4}(?:全家|家庭)|負責.{0,8}(?:修復|拯救).{0,4}(?:全家|家庭))/u
const MINOR_ADULT_SYNONYM_PATTERN = /(?:(?:日後|將來|未來|長大後|成年後).{0,48}(?:組織任職|職場|公司|上級|職級|主管|升遷|加薪|親密伴侶|伴侶關係|戀愛|婚姻)|(?:組織任職|上級協商|職級調整|親密伴侶關係))/u
const MINOR_SURVEILLANCE_PATTERN = /(?:父母|家長|照顧者).{0,16}(?:查看|檢查|監看|監控|追蹤).{0,16}(?:私人訊息|聊天紀錄|手機|日記|定位|帳號)/u
const MINOR_DETERMINISTIC_FUTURE_PATTERN = /(?:長大後|未來).{0,20}(?:一定|注定|必然|只能).{0,16}(?:適合|成為|就讀|從事|當).{0,12}(?:醫生|醫師|律師|老師|工程師|職業|科系|工作)/u
const MINOR_EXPOSURE_PATTERN = /(?:公開|轉傳|分享|提供).{0,18}(?:評估|測驗|報告|分析|內容).{0,18}(?:親戚|同學|老師|群組|社群|他人)/u
const MINOR_FIXED_LABEL_PATTERN = /(?:你|他|她|孩子).{0,6}(?:就是|永遠是|天生是).{0,12}(?:笨|沒天分|問題人物|不合群|難教|失敗者)/u
const MINOR_MARRIAGE_PROPERTY_PATTERN = /(?:(?:(?:到了?|年滿).{0,8}(?:歲|年紀)|(?:[一二三四五六七八九十百]+|\d{1,3})歲).{0,18}(?:結婚|成家|買房|持有.{0,6}(?:房產|房屋|物業))|(?:會|將|注定|預計).{0,12}(?:結婚|成家|買房|持有.{0,6}(?:房產|房屋|物業)))/u
const MINOR_INVESTMENT_PATTERN = /(?:壓歲錢|零用錢|孩子|未成年).{0,16}(?:買|投入|配置|持有).{0,16}(?:股票|科技股|基金|債券|期權|選擇權|加密貨幣|虛擬貨幣)/u
const PARENTAL_DEATH_PATTERN = /(?:父親|母親|父母|爸爸|媽媽|雙親).{0,24}(?:會|將|大約|預計|恐怕).{0,24}(?:離世|過世|死亡|病逝)/u
const LIFESPAN_PATTERN = /(?:(?:壽命|壽數|陽壽|活到).{0,14}(?:\d+|[一二三四五六七八九十百]+).{0,3}歲|(?:會|將).{0,12}(?:\d+|[一二三四五六七八九十百]+).{0,3}歲.{0,10}(?:離世|過世|死亡))/u
const RETIREMENT_INEVITABLE_PATTERN = /(?:一定|只能|必須|注定).{0,10}(?:退休|離開職場|停止工作)/u
const PRESSURE_TO_MARRY_PATTERN = /(?:應該|必須|務必|趕快).{0,10}(?:結婚|成家|生小孩|生孩子)/u
const FAMILY_PATH_ASSUMPTION_PATTERN = /(?:到了?|年滿|未來).{0,14}(?:一定|自然會|就會).{0,14}(?:結婚|生子|生小孩|買房|背房貸)/u
const MIDLIFE_FEAR_PATTERN = /(?:中年|中年危機).{0,14}(?:一定|必然|注定).{0,14}(?:崩潰|失敗|失去方向|離婚)/u
const FINANCIAL_LOSS_PREDICTION_PATTERN = /(?:會|將|注定|必然).{0,14}(?:破產|破財|損失大筆|失去財產)/u
const ELDER_DISEASE_PATTERN = /(?:病情|疾病|身體).{0,16}(?:一定|必然|將會|會).{0,12}(?:惡化|失能|臥床)/u
const BURDEN_TO_CHILDREN_PATTERN = /(?:你|長者|老人).{0,10}(?:就是|一定是|只會成為).{0,10}(?:孩子|子女|家人).{0,6}(?:負擔|包袱)/u
const FILIAL_JUDGMENT_PATTERN = /(?:不照顧|不陪伴|不給錢).{0,12}(?:就是|代表).{0,10}(?:不孝|沒良心)/u
const WELLNESS_FEAR_SALES_PATTERN = /(?:不買|不使用|不參加).{0,12}(?:保健品|療程|法會|宗教服務).{0,14}(?:就會|一定會).{0,10}(?:生病|短命|遭報應)/u

function inferredStage(ageYears: number): NonNullable<NonNullable<DeterministicAuditInput['ageContexts']>[number]['stage']> {
  if (ageYears <= 6) return 'toddler'
  if (ageYears <= 12) return 'child'
  if (ageYears <= 17) return 'teen'
  if (ageYears <= 30) return 'young_adult'
  if (ageYears <= 40) return 'early_mid'
  if (ageYears <= 50) return 'mid'
  if (ageYears <= 60) return 'pre_senior'
  return 'elder'
}

export function auditAgeSafety(report: DeterministicAuditInput): ReportAuditIssue[] {
  const minorIds = new Set(
    (report.ageContexts ?? [])
      .filter((context) => Number.isFinite(context.ageYears) && context.ageYears < 18)
      .map((context) => context.personId),
  )
  const subjectsByClaim = new Map(
    (report.claimLedger?.entries ?? []).map((claim) => [claim.claimId, claim.subjectPersonIds ?? []]),
  )
  const issues: ReportAuditIssue[] = []
  const ageByPersonId = new Map((report.ageContexts ?? []).map((context) => [context.personId, context]))
  for (const paragraph of report.paragraphs ?? []) {
    const targetPersonIds = [...new Set([
      ...(paragraph.subjectPersonIds ?? []),
      ...(paragraph.claimIds ?? []).flatMap((claimId) => subjectsByClaim.get(claimId) ?? []),
    ])]
    if (targetPersonIds.length === 0) {
      issues.push(issue('age.subject_missing', [paragraph.paragraphId], '每個客戶可見段落都必須明確綁定適用人物'))
      continue
    }
    const targetContexts = targetPersonIds.map((personId) => ageByPersonId.get(personId)).filter(Boolean)
    const targetsMinor = targetPersonIds.some((personId) => minorIds.has(personId))
    if (targetsMinor && MINOR_MARRIAGE_PROPERTY_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.minor_marriage_property', [paragraph.paragraphId], '未成年人內容預設未來婚姻或房產結局'))
    }
    if (targetsMinor && MINOR_INVESTMENT_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.minor_investment', [paragraph.paragraphId], '未成年人內容提供具體證券投資指示'))
    }
    if (targetsMinor && (MINOR_ADULT_TOPIC_PATTERN.test(paragraph.text) || MINOR_ADULT_SYNONYM_PATTERN.test(paragraph.text))) {
      issues.push(issue('age.minor_adult_topic', [paragraph.paragraphId], '未成年人內容越過婚配、投資或家庭修復責任邊界'))
    }
    if (targetsMinor && MINOR_SURVEILLANCE_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.parental_surveillance', [paragraph.paragraphId], '未成年人內容要求監看私人訊息或日常紀錄'))
    }
    if (targetsMinor && MINOR_DETERMINISTIC_FUTURE_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.deterministic_future', [paragraph.paragraphId], '未成年人內容把教育或職涯探索寫成固定結局'))
    }
    if (targetsMinor && MINOR_EXPOSURE_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.expose_sensitive_assessment', [paragraph.paragraphId], '未成年人評估內容不得在未說明同意與必要性的情況下外傳'))
    }
    if (targetsMinor && MINOR_FIXED_LABEL_PATTERN.test(paragraph.text)) {
      issues.push(issue('age.deterministic_label', [paragraph.paragraphId], '未成年人內容含可能造成自我實現的固定負面標籤'))
    }
    for (const context of targetContexts) {
      if (!context) continue
      const stage = context.stage ?? inferredStage(context.ageYears)
      if (stage === 'mid' && PARENTAL_DEATH_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.parental_death_prediction', [paragraph.paragraphId], '不得預測父母死亡時間或據此提前處分財產'))
      }
      if ((stage === 'pre_senior' || stage === 'elder') && LIFESPAN_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.lifespan_prediction', [paragraph.paragraphId], '不得預測壽命或死亡年齡'))
      }
      if ((stage === 'young_adult' || stage === 'pre_senior') && RETIREMENT_INEVITABLE_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.retirement_inevitable', [paragraph.paragraphId], '不得把退休或離開職場寫成必然結局'))
      }
      if (stage === 'young_adult' && PRESSURE_TO_MARRY_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.pressure_to_marry', [paragraph.paragraphId], '不得以年齡施壓結婚或生育'))
      }
      if (stage === 'early_mid' && FAMILY_PATH_ASSUMPTION_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.single_family_path', [paragraph.paragraphId], '不得預設婚姻、子女、房產或房貸是唯一人生路徑'))
      }
      if (stage === 'mid' && MIDLIFE_FEAR_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.midlife_crisis_fear', [paragraph.paragraphId], '不得用中年危機恐嚇或固定化讀者'))
      }
      if (stage === 'mid' && FINANCIAL_LOSS_PREDICTION_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.financial_loss_prediction', [paragraph.paragraphId], '不得預測破產、破財或確定財務損失'))
      }
      if (stage === 'elder' && ELDER_DISEASE_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.disease_deterioration_prediction', [paragraph.paragraphId], '不得預測疾病惡化或失能'))
      }
      if (stage === 'elder' && BURDEN_TO_CHILDREN_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.burden_label', [paragraph.paragraphId], '不得把熟齡者定型為子女負擔'))
      }
      if ((stage === 'pre_senior' || stage === 'elder') && FILIAL_JUDGMENT_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.filial_judgment', [paragraph.paragraphId], '不得用孝道標籤替代照護界線討論'))
      }
      if ((stage === 'pre_senior' || stage === 'elder') && WELLNESS_FEAR_SALES_PATTERN.test(paragraph.text)) {
        issues.push(issue('age.wellness_fear_sales', [paragraph.paragraphId], '不得以健康或宗教恐懼促銷產品服務'))
      }
    }
  }
  return issues
}

export function runDeterministicReportAudits(report: DeterministicAuditInput): {
  ok: boolean
  issues: ReportAuditIssue[]
} {
  const paragraphs = report.paragraphs ?? []
  const customerVisibleTexts = report.customerVisibleTexts ?? paragraphs
  const ageBoundVisibleTexts = customerVisibleTexts.filter((entry) =>
    (entry.claimIds?.length ?? 0) > 0 || (entry.subjectPersonIds?.length ?? 0) > 0,
  )
  const issues = [
    ...auditTemporalClaims(customerVisibleTexts, report.ageContexts ?? [], report.claimLedger),
    ...auditNearDuplicates(paragraphs),
    ...auditHumanLanguage(customerVisibleTexts),
    ...auditHighRiskLanguage(customerVisibleTexts),
    ...auditAgeSafety({ ...report, paragraphs: ageBoundVisibleTexts }),
  ]
  return { ok: issues.length === 0, issues }
}
