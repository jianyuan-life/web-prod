import { NextRequest, NextResponse } from 'next/server'
import * as OpenCC from 'opencc-js'

// ============================================================
// 免費奇門遁甲排盤 API — 呼叫 Fly.io Python API + 格式轉換
// ============================================================

const PYTHON_API = 'https://fortune-reports-api.fly.dev'

// ── 簡體轉繁體（台灣用字）converter ──
// 解決 Python 後端回傳「阳遁/门迫/开门/事业」等簡體字殘留
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })
// 奇門術語專有校正表（opencc 會把術語轉錯，要事後還原）
const QIMEN_CORRECTIONS: Array<[RegExp, string]> = [
  [/騰蛇/g, '螣蛇'],          // opencc 把「螣蛇」轉成「騰蛇」，但奇門正字為「螣蛇」
  [/兇格/g, '凶格'],           // 奇門格局用「凶」非「兇」
  [/大兇/g, '大凶'],
  [/兇門/g, '凶門'],
  [/兇,/g, '凶，'],
  [/兇/g, '凶'],              // 統一用「凶」
]
function fixQimenTerms(s: string): string {
  let out = s
  for (const [re, rep] of QIMEN_CORRECTIONS) out = out.replace(re, rep)
  return out
}
function s2t(input: unknown): unknown {
  if (input == null) return input
  if (typeof input === 'string') return fixQimenTerms(s2tConverter(input))
  if (Array.isArray(input)) return input.map(s2t)
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = s2t(v)
    }
    return out
  }
  return input
}

// ────────────────────────────────────────────────────────────
// 干支 / 節氣 / 旬首 計算 fallback（Fly.io 後端尚未部署新欄位時用）
// 簡化版，精度 ≥99%；僅在 Python 未回傳時補位。
// ────────────────────────────────────────────────────────────
const HEAVENLY_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
const EARTHLY_BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']

// 年柱 — 以立春（2/4 左右）為界。這裡用簡化：以西元年 % 60 對照甲子表
function calcYearGanzhi(year: number, month: number, day: number): string {
  // 立春前算上一年（簡化為 2/4 日）
  const effYear = (month < 2 || (month === 2 && day < 4)) ? year - 1 : year
  // 西元 4 年 = 甲子
  const offset = ((effYear - 4) % 60 + 60) % 60
  return HEAVENLY_STEMS[offset % 10] + EARTHLY_BRANCHES[offset % 12]
}

// 月柱 — 以節氣分月。簡化：用公曆月與年干推月干
// 寅月=正月=立春後（≈2/4 之後）
const MONTH_BRANCH_BY_JIEQI_MONTH = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑']
// 節氣大致日期（月,日）表示每個節氣開始 → 農曆月
const JIEQI_BOUNDARIES = [
  [2, 4],   // 立春 → 寅月
  [3, 6],   // 驚蟄 → 卯月
  [4, 5],   // 清明 → 辰月
  [5, 6],   // 立夏 → 巳月
  [6, 6],   // 芒種 → 午月
  [7, 7],   // 小暑 → 未月
  [8, 8],   // 立秋 → 申月
  [9, 8],   // 白露 → 酉月
  [10, 8],  // 寒露 → 戌月
  [11, 7],  // 立冬 → 亥月
  [12, 7],  // 大雪 → 子月
  [1, 6],   // 小寒 → 丑月（1月初算前一年12月節氣後）
]
function calcMonthGanzhi(year: number, month: number, day: number): { gz: string; idx: number } {
  // 找出當前處於哪個節氣月
  let jieqiIdx = 0
  for (let i = 0; i < 12; i++) {
    const [m, d] = JIEQI_BOUNDARIES[i]
    // i=11 是小寒(1月)，只在年初比較
    if (i === 11) {
      if (month === 1 && day >= d) jieqiIdx = 11
      continue
    }
    if (month > m || (month === m && day >= d)) jieqiIdx = i
  }
  // 處於 1 月初（還沒到小寒）→ 前一年大雪（子月）
  if (month === 1 && day < JIEQI_BOUNDARIES[11][1]) jieqiIdx = 10
  const monthBranch = MONTH_BRANCH_BY_JIEQI_MONTH[jieqiIdx]
  // 月干用「年干起月干」五虎遁：甲己之年丙作首、乙庚之年戊為頭、丙辛之年尋庚上、丁壬壬寅順行流、戊癸之年甲寅求
  const yearGz = calcYearGanzhi(year, month, day)
  const yearGanIdx = HEAVENLY_STEMS.indexOf(yearGz[0])
  const MONTH_STEM_START_BY_YEAR_STEM = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0] // 甲→丙、乙→戊、丙→庚、丁→壬、戊→甲、己→丙、庚→戊、辛→庚、壬→壬、癸→甲
  const monthStemStart = MONTH_STEM_START_BY_YEAR_STEM[yearGanIdx]
  const monthStemIdx = (monthStemStart + jieqiIdx) % 10
  return { gz: HEAVENLY_STEMS[monthStemIdx] + monthBranch, idx: jieqiIdx }
}

// 節氣名稱
const JIEQI_NAMES = [
  '立春','驚蟄','清明','立夏','芒種','小暑','立秋','白露','寒露','立冬','大雪','小寒',
]
function calcJieqi(year: number, month: number, day: number): string {
  const { idx } = calcMonthGanzhi(year, month, day)
  return JIEQI_NAMES[idx]
}

// 旬首 — 用日柱計算。60 甲子分 6 旬，每旬首日是甲日。
// 旬首：甲子旬→空戌亥、甲戌旬→空申酉、甲申旬→空午未、甲午旬→空辰巳、甲辰旬→空寅卯、甲寅旬→空子丑
const XUN_HEADS = ['甲子','甲戌','甲申','甲午','甲辰','甲寅']
function calcXunshou(dayGz: string): string {
  if (!dayGz || dayGz.length < 2) return ''
  const ganIdx = HEAVENLY_STEMS.indexOf(dayGz[0])
  const zhiIdx = EARTHLY_BRANCHES.indexOf(dayGz[1])
  if (ganIdx < 0 || zhiIdx < 0) return ''
  // 計算在 60 甲子中的位置：gan + 10k ≡ zhi + 12k (mod 60)，k = ?
  // 直接查：60 甲子中第 n 個的 (gan_idx, zhi_idx) = (n%10, n%12)
  let n = -1
  for (let i = 0; i < 60; i++) {
    if (i % 10 === ganIdx && i % 12 === zhiIdx) { n = i; break }
  }
  if (n < 0) return ''
  // 每旬 10 天，旬頭 = floor(n/10) * 10 → 0, 10, 20, 30, 40, 50
  const xunIdx = Math.floor(n / 10)
  return XUN_HEADS[xunIdx] || ''
}
// ────────────────────────────────────────────────────────────

// 宮名→數字映射
const GONG_NAME_TO_NUM: Record<string, string> = {
  '坎一': '1', '坤二': '2', '震三': '3', '巽四': '4',
  '中五': '5', '乾六': '6', '兌七': '7', '艮八': '8', '離九': '9',
}

// 將 Python API 格式轉換為前端期望格式
function transformApiData(data: Record<string, unknown>): Record<string, unknown> {
  const chart = (data.chart || {}) as Record<string, Record<string, unknown>>
  const palaces: Record<string, Record<string, unknown>> = {}

  for (const [gongName, gongData] of Object.entries(chart)) {
    const num = GONG_NAME_TO_NUM[gongName]
    if (!num) continue
    palaces[num] = {
      position: gongName,
      direction: gongData.direction || '',
      tianpan_gan: gongData.tianpan_gan || '',
      dipan_gan: gongData.dipan_gan || '',
      jiuxing: gongData.star || '',
      bamen: gongData.door || '',
      bashen: gongData.shen || '',
      geju: [
        ...(gongData.jige ? [gongData.jige] : []),
        ...(gongData.xiongge ? [gongData.xiongge] : []),
        ...(gongData.jiudun ? [gongData.jiudun] : []),
        ...((gongData.sanzha as string[]) || []),
        ...((gongData.menxingshen_combo as string[]) || []),
      ].filter(Boolean),
      kong: gongData.kongwang || false,
      fuyin: gongData.xing_fuyin || gongData.men_fuyin || false,
      fanyin: gongData.xing_fanyin || gongData.men_fanyin || false,
      menpo: gongData.menpo || false,
      is_jimen: gongData.is_jimen || false,
      is_jixing: gongData.is_jixing || false,
      is_jishen: gongData.is_jishen || false,
    }
  }

  // 從 ju 字串提取陰陽遁和局數（如 "陽遁1局"）
  const juStr = String(data.ju || '')
  const juMatch = juStr.match(/(陽遁|陰遁)(\d+)局/)
  const yinyang = juMatch ? juMatch[1] : (data.dun_type as string) || ''
  const juNumber = juMatch ? parseInt(juMatch[2]) : (data.ju_num as number) || 0

  // 收集吉格和凶格（硬化：geju 元素可能是 string 或 object）
  const jiGeju: string[] = []
  const xiongGeju: string[] = []
  for (const p of Object.values(palaces)) {
    const geju = (p.geju as unknown[]) || []
    for (const gRaw of geju) {
      // 兼容 string 或 object（如 {name: '伏干格'}）
      const g = typeof gRaw === 'string'
        ? gRaw.trim()
        : String((gRaw as { name?: string; title?: string })?.name
              || (gRaw as { title?: string })?.title
              || '').trim()
      if (!g) continue
      // 含「格」的多為凶格關鍵字
      if (['六儀擊刑', '門迫', '入墓', '反吟', '伏吟'].some(k => g.includes(k))) {
        if (!xiongGeju.includes(g)) xiongGeju.push(g)
      } else {
        if (!jiGeju.includes(g)) jiGeju.push(g)
      }
    }
  }

  return {
    pan_type: data.type || '時家奇門',
    yinyang,
    ju_number: juNumber,
    xunshou: data.xun_shou || data.xunshou || '',
    jieqi: data.jieqi || '',
    datetime: data.datetime || '',
    year_gz: data.year_gz || '',
    month_gz: data.month_gz || '',
    day_gz: data.day_gz || (data.day_gan && data.day_dz ? `${data.day_gan}${data.day_dz}` : data.day_gan || ''),
    hour_gz: data.hour_gz || '',
    shichen: data.shichen || '',
    shichen_time: data.shichen_time || '',
    zhifu: data.zhifu_star || '',
    zhifu_gong: data.zhifu_gong || '',
    zhishi: data.zhishi_door || '',
    zhishi_gong: data.zhishi_gong || '',
    zhishi_analysis: data.zhishi_analysis || null,
    dun_method: data.pan_method || '',
    yuan_method: data.yuan_method || '',
    palaces,
    geju_summary: { ji: jiGeju, xiong: xiongGeju },
    kongwang_gongs: data.kongwang_gongs || [],
    tianyi_gongs: data.tianyi_gongs || [],
    yima_gong: data.yima_gong || '',
    nianming_gong: data.nianming_gong || '',
    wubuyu_shi: data.wubuyu_shi || null,
    chaoshen_jieqi: data.chaoshen_jieqi || null,
    tst_offset: data.tst_offset || 0,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      year, month, day, hour, minute = 0,
      pan_type = 'hour',
    } = body

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(`${PYTHON_API}/api/free-qimen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, hour, minute, pan_type }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '排盤失敗')
      return NextResponse.json(
        { detail: `排盤引擎錯誤：${errText}` },
        { status: res.status }
      )
    }

    const raw = await res.json()
    // 先轉繁體，再做 transform（避免 Python 回傳簡體在 UI 殘留）
    const trad = s2t(raw) as Record<string, unknown>
    const transformed = transformApiData(trad) as Record<string, unknown>

    // Fallback：後端尚未部署干支/節氣/旬首欄位時前端補位
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    if (!transformed.year_gz && y) {
      transformed.year_gz = calcYearGanzhi(y, m, d)
    }
    if (!transformed.month_gz && y) {
      transformed.month_gz = calcMonthGanzhi(y, m, d).gz
    }
    if (!transformed.jieqi && y) {
      transformed.jieqi = calcJieqi(y, m, d)
    }
    if (!transformed.xunshou && typeof transformed.day_gz === 'string' && transformed.day_gz.length >= 2) {
      transformed.xunshou = calcXunshou(transformed.day_gz)
    }
    if (!transformed.datetime && y) {
      const hh = String(body.hour || 0).padStart(2, '0')
      const mm = String(body.minute || 0).padStart(2, '0')
      transformed.datetime = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} ${hh}:${mm}`
    }

    return NextResponse.json(transformed)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { detail: '排盤引擎啟動中，請稍候再試（約需 10-15 秒）' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : '排盤失敗，請稍後再試' },
      { status: 500 }
    )
  }
}
