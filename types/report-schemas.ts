// v5.10.202 Sprint 1 step 4 — 4 種報告 Schema TypeScript 定義
//
// Source:Jamie 連發 system-reminder 規格(2026-05-12 23:15-23:50)
// 用途:
//   - components/report/types/* 元件 prop 強型別
//   - lib/report-adapter.ts 從 paid_reports 映射用
//   - PDF 樣板鏡像 React 元件用
//
// Sprint 1:純型別、不含 adapter 實作(留 Sprint 2)
// 命盤計算正確性(priority 1)由 calculator regression test 保(留 step 6)

// ============================================================
// 共用 base type
// ============================================================

export type ISO = string

export interface ReportMeta {
  id: string
  hash: string
  engineVersion: string // 例:'v5.10.197'
  reportDate: ISO
  durationShort: number // 精華版閱讀分鐘
  durationFull: number // 完整版閱讀分鐘
}

export interface BaziPillars {
  year: string
  month: string
  day: string
  hour: string
  dayMaster: string // 日主天干
}

export interface FiveElements {
  '木': number
  '火': number
  '土': number
  '金': number
  '水': number
}

export type Confidence = 1 | 2 | 3 | 4 | 5
export type ReportType = 'life-blueprint' | 'heart-doubts' | 'compatibility' | 'family-blueprint'

// ============================================================
// 1. LifeBlueprintReport(人生藍圖、type='life-blueprint')
// ============================================================

export interface LifeBlueprintReport {
  meta: ReportMeta & {
    name: string
    gender: 'M' | 'F'
    birthDate: ISO
    birthPlace: string
    isChild: boolean
    sect: {
      ziwei: string
      bazi: string
      vedic: string
      western: string
      hd: string
    }
  }
  hero: {
    title: string // 「太陽之火」
    subtitle: string
    icon: 'sun' | 'moon' | 'mountain' | 'water' | 'flame' | string
    keyword: [string, string, string]
  }
  actions2026: {
    q1q2: { label: '啟動'; color: 'green'; text: string }
    fullYear: { label: '持續·留意覺察'; color: 'amber'; text: string }
    q3q4: { label: '整合'; color: 'violet'; text: string }
  }
  card5: {
    title: string
    subtitle: string
    bazi: BaziPillars
    ziwei: { palaceStar: string; palace: string }
    talentsTop3: string[]
    challengesTop3: string[]
  }
  insight3steps: {
    step1: { title: '核心性格'; content: string }
    step2: {
      dashboard: { personality: number; action: number; cultivation: number }
      tags: [string, string, string]
      trapWarning: string
    }
    step3: {
      priorityActions: { date: string; type: '工作' | '檢查' | '覆盤'; text: string }[]
      successMetrics: string[]
    }
  }
  insight5cards: { icon: string; title: string; subtitle: string; detail: string }[]
  natalOverview: {
    ziwei12palaces: { palace: string; mainPalace: boolean; bigFour: boolean; stars: string[]; ganzhi: string }[]
    daily: { date: string; element: string; tip: string }
  }
  yearEnergy12: { month: number; score: number }[]
  daYun: {
    seq: number
    ageRange: string
    years: string
    ganZhi: string
    tenGod: string
    energy: number
    theme: string
    strategy: string
    keyYears: { year: string; ganZhi: string; note: string }[]
  }[]
  consensusMatrix: {
    dimensions: string[] // 7 個
    systems: string[] // 14 個
    grid: number[][] // 7×14、每格 0-5 ★
    consensus: { level: 'high' | 'mid' | 'low'; pct: number }[]
  }
  talentsTop5: {
    title: string
    supportSystems: string[]
    confidence: Confidence
    manifestation: string
    howToAmplify: string
  }[]
  risksTop5: {
    title: string
    supportSystems: string[]
    confidence: Confidence
    triggerTime: string
    prevention: string
  }[]
  planStages: {
    immediate: { action: string; why: string; how: string; deadline: string }[]
    short: { action: string; alignment: string; checkpoint: string }[]
    long: { action: string; alignment: string; outcome: string }[]
  }
  luckyParams: {
    colors: string[]
    numbers: number[]
    directions: string[]
    hours: string[]
    plants: string[]
    avoid: string[]
    protectStars: string[]
    talents: string[]
  }
  practices5: {
    title: string
    commandRecipe: string
    painPoint: string
    vision: string
    steps: [string, string, string]
    obstacle: string
  }[]
  oneLiner: string
  letterFinal: { retrospect: string; present: string; future: string; declaration: string }
  appendix14Systems: { system: string; finding: string }[]
}

// ============================================================
// 2. HeartDoubtsReport(心之所惑、type='heart-doubts')
// ============================================================

export type ScoreGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D'

export interface HeartDoubtsReport {
  meta: ReportMeta & { name: string; birthDate: ISO }
  score: {
    grade: ScoreGrade
    value: number // 0-100
    percentile: number // Top X%
    challengeLevel: '低' | '中' | '高'
    systemsCount: number
    indicatorDots: number
  }
  bazi: BaziPillars & {
    elements: FiveElements
    insight: string
  }
  question: {
    topic: '遷移' | '事業' | '財運' | '感情' | '健康' | '學業' | '家庭' | '時運'
    icon: '🏠' | '💼' | '💰' | '❤️' | '🩺' | '📚' | '👨‍👩‍👦' | '⏳'
    raw: string
  }
  evidence: { system: string; finding: string }[] // 12 條
  toc: { qi: 1; cheng: 7; zhuan: 2; he: 4 }
  answer: { conclusion: string; condition: string; paragraphs: string[] }
  chapters: {
    one_deep: { quickSummary: string; body: string[] }
    bond: { quickSummary: string; body: string[] }
    flowYear: { quickSummary: string; body: string[] }
    bestPlan: {
      short: { title: string; actions: string[] }
      mid: { title: string; actions: string[] }
      long: { title: string; actions: string[] }
    }
    timing: { period: string; action: string; reason: string; note: string }[]
    risks: { title: string; detail: string }[]
    practice: {
      title: string
      purpose: string
      bond: string
      duration: string
      tool: string
      scene: string
      content: string
      milestone: string
      recovery: string
      difficulty: { easy: string; mid: string; hard: string }
    }[]
  }
  root: { quickSummary: string; body: string[] }
  caveats: { title: string; bond: string; remedy: string }[]
  way: { quickSummary: string; body: string[] }
  goods: { title: string; support: string; howToUse: string }[]
  improvements: {
    title: string
    whyYou: string
    steps: string[]
    ifNot: string
    ifDo: string
    bestTime: string
  }[]
  letter: { quickSummary: string; body: string[] }
}

// ============================================================
// 3. CompatibilityReport(合否?、type='compatibility')
// ============================================================

export type Verdict = '合' | '合但有雷區' | '需要磨合' | '不合'

export interface PersonProfile {
  name: string
  birthDate: ISO
  bazi: BaziPillars
  ziwei: { palace: string; star: string }
  hd: { type: string; profile: string; authority: string }
  numerology: { life: number; soul: number }
  zodiac: string
  western: { sun: string; moon: string; asc: string; mars: string; venus: string }
}

export interface CompatibilityReport {
  meta: ReportMeta
  pair: { a: PersonProfile; b: PersonProfile }
  verdict: Verdict
  verdictMeta: {
    icon: '⚡' | '✅' | '🔧' | '❌'
    color: 'amber' | 'green' | 'blue' | 'red'
    subtitle: string
  }
  scenario: '伴侶' | '創業合夥' | '家人' | '朋友' | '同事'
  question: { raw: string }
  toc: { qi: 2; cheng: 14; zhuan: 3; he: 3 }

  questionChapter: { quickSummary: string }
  answerChapter: { quickSummary: string; body: string[] }

  chemistry: { quickSummary: string; metaphor: string }
  baziSynastry: {
    summary: string
    dayMasterRelation: string
    yearBranchRelation: string
    fiveElementComplement: string
    daYunMatch: string
    verdict: '合' | '需磨合' | '不合'
  }
  ziweiSynastry: {
    summary: string
    aCommandPalace: string
    bCommandPalace: string
    fourTransformations: { a: string; b: string }
    crossFlightAnalysis: string
    verdict: string
  }
  westernSynastry: {
    selfCheck: string
    sectDay: '晝盤' | '夜盤'
    aspects: { planet: string; relation: string; orb: number; impact: string }[]
    verdict: string
  }
  vedicKuta: {
    grahaMaitri: string
    tara: 'Sampat' | 'Vipat' | 'Kshema' | 'Pratyari' | 'Sadhaka' | 'Vadha' | 'Mitra' | 'AtiMitra'
    yogasShared: string[]
    verdict: string
  }
  hdPair: {
    typeMatch: string
    profileMatch: string
    centersComplement: string
    verdict: string
  }
  numerologyPair: {
    pair: string
    missingShared: number[]
    masterNumberNote?: string
    verdict: string
  }
  ichingPair: { hexagram: string; interpretation: string; warning: string; verdict: string }
  zodiacPair: {
    a: string
    b: string
    relation: '六合' | '三合' | '半合' | '中性' | '相沖' | '相刑' | '相害'
    taiSuiNote?: string
    verdict: string
  }

  finalJudge: {
    summary: string
    countCompat: number
    countNeed: number
    countNot: number
    pros: string[]
    cautions: { point: string; remedy: string }[]
    suggestions: string[]
  }

  yearly: {
    year: number
    ganzhi: string
    relationEnergy: string
    aImpact: string
    bImpact: string
    sweetMonths: string[]
    mineMonths: string[]
    whatToDo: string
    whatNotToDo: string
  }[]
  threeYearOverview: { best: string; toughest: string; decisionWindows: string[] }

  bestPoints: { title: string; support: string[]; guide: string }[]
  cautions: { title: string; support: string[]; trigger: string; remedy: string }[]
  relationFlow: { summary: string }

  prescriptions: {
    title: string
    importance: string
    steps: string[]
    psychBasis: string
    expected: string
  }[]
  practices: {
    title: string
    purpose: string
    duration: string
    steps: string[]
  }[]
  letter: { a: string; b: string; together: string }
}

// ============================================================
// 4. FamilyBlueprintReport(家族藍圖、type='family-blueprint')
// ============================================================

export interface FamilyMember {
  role: '父' | '母' | '子' | '女' | '兄' | '弟' | '姐' | '妹' | string
  name: string
  birthDate: ISO
  bazi: BaziPillars
  fiveElements: FiveElements
}

export interface FamilyBlueprintReport {
  meta: ReportMeta & { familyName: string; memberCount: number }
  members: FamilyMember[]
  fiveElementsDistribution: {
    chartData: { member: string; values: FiveElements; dayMaster: string; strongest: string; weakest: string }[]
    metaphor: string // 「廚房比喻」
    keyFinding: string
  }
  pairAnalysis: {
    fatherMother?: PairAnalysisData
    motherChild?: PairAnalysisData
    fatherChild?: PairAnalysisData
  }
  triangleDynamics: {
    edges: { from: string; to: string; energy: string; color: 'gold' | 'water' | 'fire' }[]
    dangerousMode: string
    breakingTriangle: string[]
  }
  goods: { title: string; element: string; content: string; howToUse: string }[]
  cautions: { title: string; detail: string; response: string }[]
  communicationModel: {
    roles: { decisionMaker: string; coordinator: string; executor: string; emotionStabilizer: string }
    emotionChain: { from: string; to: string }[]
    cutPoint: string
  }
  parenting: {
    childTalent: string
    fatherRole: string
    motherRole: string
    conflictPrevention: { ageRange: string; warning: string }[]
  }
  yearly5: {
    year: number
    ganzhi: string
    nickname: string
    icon: string
    overallEnergy: string
    keywords: string[]
    memberImpacts: { member: string; impact: string; pressure: number; concerns: string[] }[]
    crossInterpretation: string[]
    suggestions: { do: string[]; dont: string[] }
    keyMonths: { best: string[]; worst: string[] }
    conflictWarning?: string
  }[]
  fiveYearOverview: {
    goldenYear: string
    repairYear: string
    decisionWindows: string[]
    biggestChallenge: string
  }
  prescriptions: {
    title: string
    importance: string
    steps: string[]
    psychBasis: string
    expected: string
    astrologyBoost: string
  }[]
  practices: { title: string; purpose: string; duration: string; steps: string[] }[]
  actionGuide: {
    daily: string[]
    monthly: string[]
    yearly: string[]
    luckyElements: { commonColor: string; assistColor: string; direction: string; numbers: number[]; activities: string[] }
  }
  letter: { quickSummary: string; body: string[] }
}

interface PairAnalysisData {
  pair: string // '父×母' / '母×子' / '父×子'
  baziSynastry: { summary: string; verdict: string }
  ziweiInterplay: { summary: string; verdict: string }
  zodiacInteraction: { relation: string; verdict: string }
  numerologyInteraction: { summary: string; verdict: string }
  guidance: string[] // 5-8 條相處建議
}

// ============================================================
// Discriminated union(供 ReportRenderer 用、type-safe dispatch)
// ============================================================

export type ReportData =
  | { type: 'life-blueprint'; data: LifeBlueprintReport }
  | { type: 'heart-doubts'; data: HeartDoubtsReport }
  | { type: 'compatibility'; data: CompatibilityReport }
  | { type: 'family-blueprint'; data: FamilyBlueprintReport }
