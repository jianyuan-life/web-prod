// ============================================================
// 從 calcResult 抽取完整排盤數據（full_charts）給 PDF 專用區塊用
//
// 【背景】
// v1 PDF 的附錄排盤資料靠 `_build_appendix(raw_calculations)` 動態生成，
// 但只拿 client_data + analyses 的部分欄位，資訊密度不足。
//
// 【v2 方案】
// 在 workflow 把 calcResult.analyses 的 `raw_data` / `tables` / `summary`
// 按系統分類抽出，整理成 full_charts 物件，塞進 report_result.full_charts。
// PDF 側 charts_pro.py 會優先讀 full_charts；沒有就退回 v1 路徑。
//
// 【向後相容】
// - 舊報告沒 full_charts → PDF 走 _build_appendix（現況）
// - 新報告有 full_charts → PDF 走 charts_pro 的專業排盤表（Commit 4 實作）
// ============================================================

// ── 型別（與 steps.ts 的 CalcResult 對齊） ──

interface AnalysisItemShape {
  system: string
  score?: number
  summary?: string
  good_points?: string[]
  bad_points?: string[]
  warnings?: string[]
  improvements?: string[]
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  details?: string | Record<string, unknown>
  info_boxes?: Array<{ title?: string; items?: string[] }>
  raw_data?: Record<string, unknown>
}

interface CalcResultShape {
  client_data?: {
    bazi?: string
    yongshen?: string
    five_elements?: Record<string, number>
    lunar_date?: string
    nayin?: string
    ming_gong?: string
    [key: string]: unknown
  }
  analyses?: AnalysisItemShape[]
  [key: string]: unknown
}

// ── 輸出型別：full_charts ──

export interface BaziChart {
  four_pillars?: {
    year?: { gan: string; zhi: string; nayin?: string; shishen?: string }
    month?: { gan: string; zhi: string; nayin?: string; shishen?: string }
    day?: { gan: string; zhi: string; nayin?: string; shishen?: string }
    hour?: { gan: string; zhi: string; nayin?: string; shishen?: string }
  }
  day_master?: string           // 日主
  bazi_school?: string          // 流派（v2 新增：盲派/子平/真太陽時等）
  five_elements?: Record<string, number>
  yongshen?: string             // 用神
  xishen?: string               // 喜神
  dayun?: Array<{
    age_start: number
    age_end: number
    ganzhi: string
    shishen?: string
  }>
  liunian_2026?: {
    ganzhi: string
    shishen?: string
    summary?: string
  }
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  summary?: string
}

export interface ZiweiChart {
  ming_gong?: string            // 命宮
  shen_gong?: string            // 身宮
  life_master?: string          // 命主
  body_master?: string          // 身主
  wu_xing_ju?: string           // 五行局
  palaces?: Array<{             // 12 宮
    name: string                // e.g. 命宮/兄弟/夫妻...
    branch: string              // 地支
    main_stars: string[]        // 主星（正曜）
    auxiliary_stars?: string[]  // 副星
    minor_stars?: string[]      // 雜曜/煞星
    sihua?: string[]            // 四化
    strength?: string           // 廟旺利陷
  }>
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  summary?: string
}

export interface QimenChart {
  ju: string                    // 局數（e.g. "陽遁五局"）
  yuan?: string                 // 上中下元
  jieqi?: string                // 節氣
  gongs?: Array<{               // 九宮
    position: string            // e.g. 坎一宮、離九宮
    ba_shen?: string            // 八神
    ba_men?: string             // 八門
    jiu_xing?: string           // 九星
    tian_gan?: string           // 天盤干
    di_gan?: string             // 地盤干
  }>
  day_ganzhi?: string
  hour_ganzhi?: string
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  summary?: string
}

export interface WesternChart {
  sun_sign?: string
  moon_sign?: string
  asc_sign?: string             // 上升
  mc_sign?: string              // 中天
  planets?: Array<{
    name: string
    sign: string
    house: number
    degree?: number
    retrograde?: boolean
  }>
  houses?: Array<{
    number: number
    sign: string
    degree?: number
  }>
  aspects?: Array<{
    from: string
    to: string
    type: string                // conjunction/trine/square/opposition/sextile
    orb?: number
  }>
  tables?: Array<{ title: string; headers?: string[]; rows?: string[][] }>
  summary?: string
}

/** 完整排盤數據集合（按系統） */
export interface FullCharts {
  bazi?: BaziChart
  ziwei?: ZiweiChart
  qimen?: QimenChart
  western?: WesternChart
  // 其他系統以 raw_dump 形式保留（未細化）
  vedic?: Record<string, unknown>
  yijing?: Record<string, unknown>
  tarot?: Record<string, unknown>
  human_design?: Record<string, unknown>
  fengshui?: Record<string, unknown>
  numerology?: Record<string, unknown>
  naming?: Record<string, unknown>
  chinese_classical?: Record<string, unknown>
  zodiac?: Record<string, unknown>
  biorhythm?: Record<string, unknown>
  southeast_asian?: Record<string, unknown>
}

// ============================================================
// 系統名稱 → 內部 key 的映射
// （AI 回傳的 system 欄位可能含不同字樣，這裡做規整）
// ============================================================
const SYSTEM_KEY_MAP: Array<{ match: RegExp; key: keyof FullCharts }> = [
  { match: /八字|四柱|子平/, key: 'bazi' },
  { match: /紫微|斗數|斗数/, key: 'ziwei' },
  { match: /奇門|遁甲/, key: 'qimen' },
  { match: /西洋占星|西方占星|占星術|Western/i, key: 'western' },
  { match: /吠陀|印度占星|Vedic/i, key: 'vedic' },
  { match: /易經|六爻|卦象/, key: 'yijing' },
  { match: /塔羅/, key: 'tarot' },
  { match: /人類圖|人类图|Human.?Design/i, key: 'human_design' },
  { match: /風水|风水|玄空/, key: 'fengshui' },
  { match: /數字|靈數|卡巴拉|Numerology/i, key: 'numerology' },
  { match: /姓名學|姓名学/, key: 'naming' },
  { match: /古典命理|七政|鐵板|太乙/, key: 'chinese_classical' },
  { match: /生肖/, key: 'zodiac' },
  { match: /生物節律|生物节律|Biorhythm/i, key: 'biorhythm' },
  { match: /南洋|泰國|Mahabote|KP.?Astrology/i, key: 'southeast_asian' },
]

function mapSystemToKey(systemName: string): keyof FullCharts | null {
  for (const { match, key } of SYSTEM_KEY_MAP) {
    if (match.test(systemName)) return key
  }
  return null
}

// ============================================================
// 主函式：從 calcResult 抽取 full_charts
// ============================================================

export function extractFullCharts(calcResult: unknown): FullCharts {
  const result: FullCharts = {}
  if (!calcResult || typeof calcResult !== 'object') return result

  const calc = calcResult as CalcResultShape
  const analyses = Array.isArray(calc.analyses) ? calc.analyses : []
  const clientData = calc.client_data || {}

  for (const analysis of analyses) {
    if (!analysis || typeof analysis !== 'object') continue
    const systemName = analysis.system
    if (!systemName) continue

    const key = mapSystemToKey(systemName)
    if (!key) continue

    // 八字：做細化抽取
    if (key === 'bazi') {
      result.bazi = extractBazi(analysis, clientData)
      continue
    }
    // 紫微
    if (key === 'ziwei') {
      result.ziwei = extractZiwei(analysis, clientData)
      continue
    }
    // 奇門
    if (key === 'qimen') {
      result.qimen = extractQimen(analysis)
      continue
    }
    // 西洋占星
    if (key === 'western') {
      result.western = extractWestern(analysis)
      continue
    }
    // 其他系統：存 raw_data 方便 PDF 做簡單表格
    const raw = analysis.raw_data || {}
    const summary = analysis.summary || ''
    const tables = analysis.tables || []
    result[key] = { ...raw, _summary: summary, _tables: tables } as Record<string, unknown>
  }

  return result
}

// ============================================================
// 八字細化抽取
// ============================================================
function extractBazi(
  analysis: AnalysisItemShape,
  clientData: CalcResultShape['client_data'] = {},
): BaziChart {
  const raw = (analysis.raw_data || {}) as Record<string, unknown>
  const chart: BaziChart = {}

  // 四柱：優先從 raw_data.four_pillars，fallback 到 client_data.bazi 字串拆解
  if (raw.four_pillars && typeof raw.four_pillars === 'object') {
    chart.four_pillars = raw.four_pillars as BaziChart['four_pillars']
  } else if (clientData?.bazi && typeof clientData.bazi === 'string') {
    // client_data.bazi 格式可能是「癸卯 丁巳 丙寅 癸巳」
    const parts = clientData.bazi.trim().split(/\s+/)
    if (parts.length >= 3) {
      const parsePillar = (p: string) => {
        if (!p || p.length < 2) return undefined
        return { gan: p[0], zhi: p.slice(1) }
      }
      chart.four_pillars = {
        year: parsePillar(parts[0]),
        month: parsePillar(parts[1]),
        day: parsePillar(parts[2]),
        hour: parts[3] ? parsePillar(parts[3]) : undefined,
      }
    }
  }

  // 日主
  if (typeof raw.day_master === 'string') chart.day_master = raw.day_master
  else if (chart.four_pillars?.day?.gan) chart.day_master = chart.four_pillars.day.gan

  // 流派（v2 由 X3 新增）
  if (typeof raw.bazi_school === 'string') chart.bazi_school = raw.bazi_school

  // 五行分布
  if (clientData?.five_elements) chart.five_elements = clientData.five_elements
  else if (raw.five_elements && typeof raw.five_elements === 'object') {
    chart.five_elements = raw.five_elements as Record<string, number>
  }

  // 喜用神
  if (typeof clientData?.yongshen === 'string') chart.yongshen = clientData.yongshen
  if (typeof raw.xishen === 'string') chart.xishen = raw.xishen

  // 大運
  if (Array.isArray(raw.dayun)) {
    chart.dayun = raw.dayun as BaziChart['dayun']
  }

  // 流年 2026
  if (raw.liunian_2026 && typeof raw.liunian_2026 === 'object') {
    chart.liunian_2026 = raw.liunian_2026 as BaziChart['liunian_2026']
  }

  if (analysis.tables) chart.tables = analysis.tables
  if (analysis.summary) chart.summary = analysis.summary

  return chart
}

// ============================================================
// 紫微細化抽取
// ============================================================
function extractZiwei(
  analysis: AnalysisItemShape,
  clientData: CalcResultShape['client_data'] = {},
): ZiweiChart {
  const raw = (analysis.raw_data || {}) as Record<string, unknown>
  const chart: ZiweiChart = {}

  if (typeof raw.ming_gong === 'string') chart.ming_gong = raw.ming_gong
  else if (typeof clientData?.ming_gong === 'string') chart.ming_gong = clientData.ming_gong

  if (typeof raw.shen_gong === 'string') chart.shen_gong = raw.shen_gong
  if (typeof raw.life_master === 'string') chart.life_master = raw.life_master
  if (typeof raw.body_master === 'string') chart.body_master = raw.body_master
  if (typeof raw.wu_xing_ju === 'string') chart.wu_xing_ju = raw.wu_xing_ju

  if (Array.isArray(raw.palaces)) {
    chart.palaces = raw.palaces as ZiweiChart['palaces']
  }

  if (analysis.tables) chart.tables = analysis.tables
  if (analysis.summary) chart.summary = analysis.summary

  return chart
}

// ============================================================
// 奇門細化抽取
// ============================================================
function extractQimen(analysis: AnalysisItemShape): QimenChart {
  const raw = (analysis.raw_data || {}) as Record<string, unknown>
  const chart: QimenChart = {
    ju: typeof raw.ju === 'string' ? raw.ju : (typeof raw.ju_shu === 'string' ? raw.ju_shu : ''),
  }

  if (typeof raw.yuan === 'string') chart.yuan = raw.yuan
  if (typeof raw.jieqi === 'string') chart.jieqi = raw.jieqi
  if (typeof raw.day_ganzhi === 'string') chart.day_ganzhi = raw.day_ganzhi
  if (typeof raw.hour_ganzhi === 'string') chart.hour_ganzhi = raw.hour_ganzhi

  if (Array.isArray(raw.gongs)) {
    chart.gongs = raw.gongs as QimenChart['gongs']
  } else if (Array.isArray(raw.palaces)) {
    // 別名相容
    chart.gongs = raw.palaces as QimenChart['gongs']
  }

  if (analysis.tables) chart.tables = analysis.tables
  if (analysis.summary) chart.summary = analysis.summary

  return chart
}

// ============================================================
// 西洋占星細化抽取
// ============================================================
function extractWestern(analysis: AnalysisItemShape): WesternChart {
  const raw = (analysis.raw_data || {}) as Record<string, unknown>
  const chart: WesternChart = {}

  if (typeof raw.sun_sign === 'string') chart.sun_sign = raw.sun_sign
  if (typeof raw.moon_sign === 'string') chart.moon_sign = raw.moon_sign
  if (typeof raw.asc_sign === 'string') chart.asc_sign = raw.asc_sign
  else if (typeof raw.ascendant === 'string') chart.asc_sign = raw.ascendant
  if (typeof raw.mc_sign === 'string') chart.mc_sign = raw.mc_sign
  else if (typeof raw.midheaven === 'string') chart.mc_sign = raw.midheaven

  if (Array.isArray(raw.planets)) chart.planets = raw.planets as WesternChart['planets']
  if (Array.isArray(raw.houses)) chart.houses = raw.houses as WesternChart['houses']
  if (Array.isArray(raw.aspects)) chart.aspects = raw.aspects as WesternChart['aspects']

  if (analysis.tables) chart.tables = analysis.tables
  if (analysis.summary) chart.summary = analysis.summary

  return chart
}

// ============================================================
// 除錯輔助：full_charts 摘要（給 log 用）
// ============================================================
export function summarizeFullCharts(charts: FullCharts): string {
  const parts: string[] = []
  if (charts.bazi?.four_pillars) {
    const p = charts.bazi.four_pillars
    parts.push(`八字:${[p.year, p.month, p.day, p.hour].filter(Boolean).map(x => x ? `${x.gan}${x.zhi}` : '').join(' ')}`)
  }
  if (charts.ziwei?.ming_gong) parts.push(`紫微命宮:${charts.ziwei.ming_gong}`)
  if (charts.qimen?.ju) parts.push(`奇門:${charts.qimen.ju}`)
  if (charts.western?.sun_sign) parts.push(`太陽:${charts.western.sun_sign}`)
  return parts.length ? parts.join(' | ') : '(空)'
}
