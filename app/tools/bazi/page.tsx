'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import { searchCities, searchLocations, type City, type LocationSearchResult } from '@/lib/cities'
import FamilyMemberPicker from '@/components/checkout/FamilyMemberPicker'
import type { SavedFamilyMember } from '@/components/FamilyMembersManager'
import AIAnalysisCard from '@/components/AIAnalysisCard'
import LiveCounter from '@/components/LiveCounter'
import FreemiumPaywall from '@/components/FreemiumPaywall'

const SHICHEN = [
  { label: '子時 (23:00-01:00)', value: 0 }, { label: '丑時 (01:00-03:00)', value: 2 },
  { label: '寅時 (03:00-05:00)', value: 4 }, { label: '卯時 (05:00-07:00)', value: 6 },
  { label: '辰時 (07:00-09:00)', value: 8 }, { label: '巳時 (09:00-11:00)', value: 10 },
  { label: '午時 (11:00-13:00)', value: 12 }, { label: '未時 (13:00-15:00)', value: 14 },
  { label: '申時 (15:00-17:00)', value: 16 }, { label: '酉時 (17:00-19:00)', value: 18 },
  { label: '戌時 (19:00-21:00)', value: 20 }, { label: '亥時 (21:00-23:00)', value: 22 },
]
const WX_COLORS: Record<string,string> = { 木:'#22c55e', 火:'#ef4444', 土:'#eab308', 金:'#f59e0b', 水:'#3b82f6' }

// ── 前端排盤輔助常量（用於豐富結果展示） ──
const TG = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
const DZ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
const WX_TG: Record<string,string> = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'}
const WX_DZ: Record<string,string> = {子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水'}

// 完整藏干表
const DZ_CANGGAN: Record<string,string[]> = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'],
  卯:['乙'], 辰:['戊','乙','癸'], 巳:['丙','庚','戊'],
  午:['丁','己','丙'], 未:['己','丁','乙'], 申:['庚','壬','戊'],
  酉:['辛'], 戌:['戊','辛','丁'], 亥:['壬','甲'],
}

// 藏干氣名
const CANGGAN_LABELS = ['本氣','中氣','餘氣']

// 十神計算
function getShishen(dayMaster: string, other: string): string {
  const WX = ['木','火','土','金','水']
  const dmI = WX.indexOf(WX_TG[dayMaster])
  const otI = WX.indexOf(WX_TG[other])
  if (dmI < 0 || otI < 0) return ''
  const same = (TG.indexOf(dayMaster) % 2) === (TG.indexOf(other) % 2)
  if (WX_TG[dayMaster] === WX_TG[other]) return same ? '比肩' : '劫財'
  if (WX[(dmI+1)%5] === WX_TG[other]) return same ? '食神' : '傷官'
  if (WX[(dmI+2)%5] === WX_TG[other]) return same ? '偏財' : '正財'
  if (WX[(dmI+3)%5] === WX_TG[other]) return same ? '七殺' : '正官'
  if (WX[(dmI+4)%5] === WX_TG[other]) return same ? '偏印' : '正印'
  return ''
}

// 地支六合
const LIUHE_MAP: Record<string,string> = {子:'丑',丑:'子',寅:'亥',亥:'寅',卯:'戌',戌:'卯',辰:'酉',酉:'辰',巳:'申',申:'巳',午:'未',未:'午'}
// 地支六沖
const LIUCHONG_MAP: Record<string,string> = {子:'午',午:'子',丑:'未',未:'丑',寅:'申',申:'寅',卯:'酉',酉:'卯',辰:'戌',戌:'辰',巳:'亥',亥:'巳'}

// ── 神煞計算（以日支或年支為基準查對應神煞） ──
// 桃花（咸池）：年支/日支 → 對應桃花地支
// 亥卯未見子，寅午戌見卯，巳酉丑見午，申子辰見酉
const TAOHUA_MAP: Record<string,string> = { 亥:'子',卯:'子',未:'子', 寅:'卯',午:'卯',戌:'卯', 巳:'午',酉:'午',丑:'午', 申:'酉',子:'酉',辰:'酉' }
// 驛馬：亥卯未見巳，寅午戌見申，巳酉丑見亥，申子辰見寅
const YIMA_MAP: Record<string,string> = { 亥:'巳',卯:'巳',未:'巳', 寅:'申',午:'申',戌:'申', 巳:'亥',酉:'亥',丑:'亥', 申:'寅',子:'寅',辰:'寅' }
// 華蓋：亥卯未見未，寅午戌見戌，巳酉丑見丑，申子辰見辰
const HUAGAI_MAP: Record<string,string> = { 亥:'未',卯:'未',未:'未', 寅:'戌',午:'戌',戌:'戌', 巳:'丑',酉:'丑',丑:'丑', 申:'辰',子:'辰',辰:'辰' }
// 將星：亥卯未見卯，寅午戌見午，巳酉丑見酉，申子辰見子
const JIANGXING_MAP: Record<string,string> = { 亥:'卯',卯:'卯',未:'卯', 寅:'午',午:'午',戌:'午', 巳:'酉',酉:'酉',丑:'酉', 申:'子',子:'子',辰:'子' }
// 紅鸞：年支 → 紅鸞地支（順行）
const HONGLUAN_MAP: Record<string,string> = { 子:'卯',丑:'寅',寅:'丑',卯:'子',辰:'亥',巳:'戌',午:'酉',未:'申',申:'未',酉:'午',戌:'巳',亥:'辰' }
// 天喜：紅鸞對沖
const TIANXI_MAP: Record<string,string> = { 子:'酉',丑:'申',寅:'未',卯:'午',辰:'巳',巳:'辰',午:'卯',未:'寅',申:'丑',酉:'子',戌:'亥',亥:'戌' }
// 天德貴人：月支 → 天干
const TIANDE_MAP: Record<string,string> = { 子:'巳',丑:'庚',寅:'丁',卯:'申',辰:'壬',巳:'辛',午:'亥',未:'甲',申:'癸',酉:'寅',戌:'丙',亥:'乙' }
// 月德貴人：月支 → 天干
const YUEDE_MAP: Record<string,string> = { 寅:'丙',午:'丙',戌:'丙', 申:'壬',子:'壬',辰:'壬', 巳:'庚',酉:'庚',丑:'庚', 亥:'甲',卯:'甲',未:'甲' }
// 文昌貴人：日干 → 地支
const WENCHANG_MAP: Record<string,string> = { 甲:'巳',乙:'午',丙:'申',丁:'酉',戊:'申',己:'酉',庚:'亥',辛:'子',壬:'寅',癸:'卯' }
// 天乙貴人：日干 → 兩個地支
const TIANYI_MAP: Record<string,string[]> = { 甲:['丑','未'],戊:['丑','未'],庚:['丑','未'], 乙:['子','申'],己:['子','申'], 丙:['亥','酉'],丁:['亥','酉'], 辛:['寅','午'], 壬:['卯','巳'],癸:['卯','巳'] }
// 空亡（旬空）：日柱干支 → 空亡兩地支
// v5.2.7 修正：找出日柱在六十甲子中的 n（n%10=tgIdx, n%12=dzIdx），
// 再由 Math.floor(n/10) 得到旬首 idx（0=甲子旬...5=甲寅旬）
function calcKongwang(dayPillar: string): string[] {
  const tgIdx = TG.indexOf(dayPillar[0])
  const dzIdx = DZ.indexOf(dayPillar[1])
  if (tgIdx < 0 || dzIdx < 0) return []
  // 枚舉 k=0..5，找 n = tgIdx + 10*k 滿足 n%12 = dzIdx
  let xunIdx = -1
  for (let k = 0; k < 6; k++) {
    if ((tgIdx + 10 * k) % 12 === dzIdx) {
      xunIdx = k
      break
    }
  }
  if (xunIdx < 0) return []
  // 每旬的空亡地支（固定對照表）
  const kongMap: Record<number, string[]> = {
    0: ['戌', '亥'],  // 甲子旬空戌亥
    1: ['申', '酉'],  // 甲戌旬空申酉
    2: ['午', '未'],  // 甲申旬空午未
    3: ['辰', '巳'],  // 甲午旬空辰巳
    4: ['寅', '卯'],  // 甲辰旬空寅卯
    5: ['子', '丑'],  // 甲寅旬空子丑
  }
  return kongMap[xunIdx] || []
}

// 計算四柱神煞
function calcShensha(pillars: { year: string; month: string; day: string; time: string }, dayMaster: string) {
  const pillarsArr = [pillars.year, pillars.month, pillars.day, pillars.time]
  const dzs = pillarsArr.map(p => p[1])
  const tgs = pillarsArr.map(p => p[0])
  const yearDz = pillars.year[1]
  const dayDz = pillars.day[1]
  const monthDz = pillars.month[1]

  // 以日支/年支 為主的神煞
  const taohua = TAOHUA_MAP[dayDz] || TAOHUA_MAP[yearDz]
  const yima = YIMA_MAP[dayDz] || YIMA_MAP[yearDz]
  const huagai = HUAGAI_MAP[dayDz] || HUAGAI_MAP[yearDz]
  const jiangxing = JIANGXING_MAP[dayDz] || JIANGXING_MAP[yearDz]
  const honglan = HONGLUAN_MAP[yearDz]
  const tianxi = TIANXI_MAP[yearDz]
  // 天德月德（地支→天干，看四柱天干是否有）
  const tianDeGan = TIANDE_MAP[monthDz]
  const yueDeGan = YUEDE_MAP[monthDz]
  // 文昌天乙（日干→地支，看四柱地支是否有）
  const wenchangDz = WENCHANG_MAP[dayMaster]
  const tianyiDzs = TIANYI_MAP[dayMaster] || []
  // 空亡
  const kongwang = calcKongwang(pillars.day)

  const shenshaList: { name: string; pillars: string[]; desc: string; color: string }[] = []

  // 檢查各神煞在哪柱
  const pillarLabels = ['年', '月', '日', '時']
  const findDzInPillars = (target: string): string[] => {
    return dzs.map((dz, i) => dz === target ? pillarLabels[i] : null).filter(Boolean) as string[]
  }
  const findTgInPillars = (target: string): string[] => {
    return tgs.map((tg, i) => tg === target ? pillarLabels[i] : null).filter(Boolean) as string[]
  }

  if (taohua) {
    const hits = findDzInPillars(taohua)
    if (hits.length) shenshaList.push({ name: '桃花', pillars: hits, desc: '人緣佳、異性緣旺，主藝術才華', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' })
  }
  if (yima) {
    const hits = findDzInPillars(yima)
    if (hits.length) shenshaList.push({ name: '驛馬', pillars: hits, desc: '主奔波、變動、遠行、海外發展', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' })
  }
  if (huagai) {
    const hits = findDzInPillars(huagai)
    if (hits.length) shenshaList.push({ name: '華蓋', pillars: hits, desc: '主聰明、孤獨、宗教哲學緣深', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' })
  }
  if (jiangxing) {
    const hits = findDzInPillars(jiangxing)
    if (hits.length) shenshaList.push({ name: '將星', pillars: hits, desc: '主領導才能、有威權、掌權之象', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' })
  }
  if (honglan) {
    const hits = findDzInPillars(honglan)
    if (hits.length) shenshaList.push({ name: '紅鸞', pillars: hits, desc: '主姻緣、喜慶，運限逢主成婚', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' })
  }
  if (tianxi) {
    const hits = findDzInPillars(tianxi)
    if (hits.length) shenshaList.push({ name: '天喜', pillars: hits, desc: '主喜悅、添丁進口、婚姻美滿', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' })
  }
  if (tianDeGan) {
    const hits = findTgInPillars(tianDeGan)
    if (hits.length) shenshaList.push({ name: '天德貴人', pillars: hits, desc: '主逢凶化吉、貴人相助', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' })
  }
  if (yueDeGan) {
    const hits = findTgInPillars(yueDeGan)
    if (hits.length) shenshaList.push({ name: '月德貴人', pillars: hits, desc: '主逢兇化吉、清廉正直', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' })
  }
  if (wenchangDz) {
    const hits = findDzInPillars(wenchangDz)
    if (hits.length) shenshaList.push({ name: '文昌', pillars: hits, desc: '主學業優秀、文思敏捷、聰明有才', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' })
  }
  for (const tydz of tianyiDzs) {
    const hits = findDzInPillars(tydz)
    if (hits.length) {
      shenshaList.push({ name: '天乙貴人', pillars: hits, desc: '主貴人多助、消災解難', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' })
      break
    }
  }
  // 空亡（看哪些地支落空亡）
  for (const k of kongwang) {
    const hits = findDzInPillars(k)
    if (hits.length) {
      shenshaList.push({ name: '空亡', pillars: hits, desc: '主該柱能量減弱、有名無實（化解：六合或三合）', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' })
    }
  }

  return shenshaList
}

// 大運計算（前端簡化版）
function calcDayun(yearPillar: string, monthPillar: string, gender: string, birthYear: number): { age: number; ganzhi: string; wuxing: string; startYear: number; isCurrent: boolean }[] {
  // 判斷順逆排（陽年男/陰年女=順排，陽年女/陰年男=逆排）
  const yearTgIdx = TG.indexOf(yearPillar[0])
  const isYangYear = yearTgIdx % 2 === 0
  const isMale = gender === 'M'
  const isForward = (isYangYear && isMale) || (!isYangYear && !isMale)

  const monthTgIdx = TG.indexOf(monthPillar[0])
  const monthDzIdx = DZ.indexOf(monthPillar[1])

  // 起運年齡（簡化為固定 3 歲起運，實際需要計算節氣）
  const startAge = 3
  const currentYear = 2026
  const currentAge = currentYear - birthYear

  const dayunList: { age: number; ganzhi: string; wuxing: string; startYear: number; isCurrent: boolean }[] = []
  for (let i = 0; i < 8; i++) {
    const age = startAge + i * 10
    const offset = isForward ? i + 1 : -(i + 1)
    const tgIdx = ((monthTgIdx + offset) % 10 + 10) % 10
    const dzIdx = ((monthDzIdx + offset) % 12 + 12) % 12
    const gz = TG[tgIdx] + DZ[dzIdx]
    const wx = WX_TG[TG[tgIdx]]
    const startYear = birthYear + age
    const endYear = startYear + 9
    const isCurrent = currentAge >= age && currentAge < age + 10
    dayunList.push({ age, ganzhi: gz, wuxing: wx, startYear, isCurrent })
  }
  return dayunList
}

// 地支關係分析
function analyzeDzRelations(pillars: string[]): { type: string; desc: string; positions: [number, number] }[] {
  const relations: { type: string; desc: string; positions: [number, number] }[] = []
  const dzArr = pillars.map(p => p[1])
  const PILLAR_NAMES = ['年','月','日','時']
  for (let i = 0; i < dzArr.length; i++) {
    for (let j = i + 1; j < dzArr.length; j++) {
      if (LIUHE_MAP[dzArr[i]] === dzArr[j]) {
        relations.push({ type: '六合', desc: `${PILLAR_NAMES[i]}支${dzArr[i]}與${PILLAR_NAMES[j]}支${dzArr[j]}相合`, positions: [i, j] })
      }
      if (LIUCHONG_MAP[dzArr[i]] === dzArr[j]) {
        relations.push({ type: '六沖', desc: `${PILLAR_NAMES[i]}支${dzArr[i]}與${PILLAR_NAMES[j]}支${dzArr[j]}相沖`, positions: [i, j] })
      }
    }
  }
  return relations
}

type Profile = { title:string; personality:string; strengths:string; challenges:string; career:string; love:string; health:string; lucky:string; year2026:string }
type LiunianItem = { year: number; ganzhi: string; shishen: string; rating: string; reason: string; wuxing?: string; interactions?: string[] }
type DayunItem = { ganzhi: string; shishen: string; start_age: number; start_year?: number }
type Result = {
  pillars: { year:string; month:string; day:string; time:string }
  day_master:string; day_master_wuxing:string; strength:string; geju:string
  yongshen:string; xishen:string; shengxiao:string
  nayin: Record<string,string>; shishen_gan: Record<string,string>
  wuxing_count: Record<string,number>
  wuxing_count_full?: Record<string,number>
  profile: Profile
  ai_sections: Record<string,string>
  has_ai: boolean
  sun_sign?: { name:string; element:string; trait:string }
  life_path?: { number:number; title:string; desc:string }
  shengxiao_fortune?: string
  solar_time?: { original:string; corrected:string; diff_minutes:number; longitude:number } | null
  lunar_converted?: boolean
  time_unknown?: boolean
  is_fallback?: boolean
  // 進階欄位（從 Python API 取得）
  dayun?: DayunItem[]
  current_dayun?: DayunItem
  liunian?: LiunianItem[]
  tai_yuan?: { ganzhi: string; nayin: string }
  strength_detail?: { strength: string; total_score: number; [k: string]: unknown }
}

// 分析步驟動畫
const ANALYSIS_STEPS = [
  { text: '排列四柱八字，推算天干地支...', icon: '&#9776;', duration: 1200 },
  { text: '計算五行能量分佈與格局...', icon: '&#9672;', duration: 1000 },
  { text: '查詢星座、生肖、靈數等輔助系統...', icon: '&#9790;', duration: 800 },
  { text: '啟動 AI 深度分析引擎...', icon: '&#129302;', duration: 1500 },
]

// ── 五行 SVG 圓餅圖元件 ──
function WuxingPieChart({ data }: { data: Record<string,number> }) {
  const total = Object.values(data).reduce((a,b) => a+b, 0)
  if (total === 0) return null
  const entries = Object.entries(data)
  let cumAngle = -90 // 從頂部開始
  const radius = 70
  const cx = 90, cy = 90

  const slices = entries.map(([elem, val]) => {
    const pct = val / total
    const angle = pct * 360
    const startAngle = cumAngle
    const endAngle = cumAngle + angle
    cumAngle = endAngle

    // SVG arc 路徑
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + radius * Math.cos(startRad)
    const y1 = cy + radius * Math.sin(startRad)
    const x2 = cx + radius * Math.cos(endRad)
    const y2 = cy + radius * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0

    // 標籤位置（弧段中點）
    const midRad = ((startAngle + endAngle) / 2 * Math.PI) / 180
    const labelR = radius * 0.6
    const lx = cx + labelR * Math.cos(midRad)
    const ly = cy + labelR * Math.sin(midRad)

    return { elem, pct, d: `M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`, color: WX_COLORS[elem], lx, ly }
  })

  return (
    <svg viewBox="0 0 180 180" className="w-40 h-40 md:w-48 md:h-48 mx-auto">
      {slices.map(s => (
        <g key={s.elem}>
          <path d={s.d} fill={s.color} stroke="rgba(10,14,26,0.8)" strokeWidth="1.5" />
          {s.pct > 0.08 && (
            <text x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize="10" fontWeight="bold">
              {s.elem}
            </text>
          )}
        </g>
      ))}
      {/* 中空效果 */}
      <circle cx={cx} cy={cy} r={28} fill="rgba(10,14,26,0.9)" />
      <text x={cx} y={cy-4} textAnchor="middle" fill="#c9a84c" fontSize="9" fontWeight="bold">五行</text>
      <text x={cx} y={cy+8} textAnchor="middle" fill="#d4d0ca" fontSize="7">比例</text>
    </svg>
  )
}

export default function FreeToolPage() {
  const [form, setForm] = useState({
    name:'', year:'1990', month:'1', day:'1', hour:'12', gender:'M',
    calendarType:'solar' as 'solar'|'lunar', // 國曆/農曆
    timeMode:'shichen' as 'unknown'|'shichen'|'exact', // 時辰是八字基本要求
    exactHour:'12', exactMinute:'0', // 精確時間
    city:'', cityLat:0, cityLng:0, cityTz:8, // 出生城市
  })
  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')  // 多時區國家名
  const [result, setResult] = useState<Result|null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // 從家人選擇後自動填入表單
  const handleFamilySelect = (member: SavedFamilyMember) => {
    const hourVal = member.time_mode === 'exact' ? String(member.hour) : String(Math.floor(member.hour / 2) * 2)
    setForm({
      ...form,
      name: member.name,
      gender: member.gender,
      year: String(member.year),
      month: String(member.month),
      day: String(member.day),
      hour: hourVal,
      timeMode: member.time_mode as 'unknown' | 'shichen' | 'exact',
      exactHour: String(member.hour),
      exactMinute: String(member.minute),
      calendarType: (member.calendar_type || 'solar') as 'solar' | 'lunar',
      city: member.birth_city || '',
      cityLat: member.city_lat || 0,
      cityLng: member.city_lng || 0,
      cityTz: member.city_tz || 8,
    })
    setCityResults([])
    setNeedCityForCountry('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('請輸入姓名'); return }
    if (!form.city.trim() || form.cityLat === 0) { setError('請選擇出生地區'); return }
    setLoading(true); setError(''); setResult(null)
    setCurrentStep(0); setCompletedSteps([])

    // 啟動步驟動畫
    let stepIdx = 0
    const stepInterval = setInterval(() => {
      if (stepIdx < ANALYSIS_STEPS.length) {
        setCompletedSteps(prev => [...prev, stepIdx])
        stepIdx++
        setCurrentStep(stepIdx)
      }
    }, ANALYSIS_STEPS[Math.min(stepIdx, ANALYSIS_STEPS.length - 1)]?.duration || 600)

    try {
      const res = await fetch('/api/free-bazi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year:parseInt(form.year), month:parseInt(form.month), day:parseInt(form.day),
          hour: form.timeMode==='exact' ? parseInt(form.exactHour) : form.timeMode==='shichen' ? parseInt(form.hour) : 12,
          minute: form.timeMode==='exact' ? parseInt(form.exactMinute) : 0,
          time_unknown: form.timeMode==='unknown',
          gender:form.gender, name:form.name,
          calendar_type: form.calendarType,
          latitude: form.cityLat || undefined,
          longitude: form.cityLng || undefined,
          timezone_offset: form.cityTz,
        }),
      })
      clearInterval(stepInterval)
      setCompletedSteps(ANALYSIS_STEPS.map((_, i) => i))
      setCurrentStep(ANALYSIS_STEPS.length)

      if (!res.ok) throw new Error((await res.json()).detail || '分析失敗')

      await new Promise(r => setTimeout(r, 500))
      const resultData = await res.json()
      setResult(resultData)
      gtag.event('generate_lead', { event_category: 'free_tool', tool: 'bazi' })
      fbpixel.trackEvent('Lead', { content_name: '免費命理速算' })
    } catch (err: unknown) {
      clearInterval(stepInterval)
      setError(err instanceof Error ? err.message : '分析失敗')
    } finally { setLoading(false) }
  }

  // ── 衍生計算（基於 result） ──
  const derivedData = useMemo(() => {
    if (!result) return null
    const pillarsArr = [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time]

    // 計算各柱藏干及藏干十神
    const pillarDetails = (['year','month','day','time'] as const).map((col, idx) => {
      const pillar = result.pillars[col]
      const tg = pillar[0]
      const dz = pillar[1]
      const canggan = DZ_CANGGAN[dz] || []
      const cangganShishen = canggan.map(cg => col === 'day' ? (cg === result.day_master ? '比肩' : getShishen(result.day_master, cg)) : getShishen(result.day_master, cg))
      return {
        col,
        label: col === 'year' ? '年柱' : col === 'month' ? '月柱' : col === 'day' ? '日柱' : '時柱',
        tg,
        dz,
        tgWx: WX_TG[tg] || '',
        dzWx: WX_DZ[dz] || '',
        shishen: col === 'day' ? '日主' : (result.shishen_gan[col] || getShishen(result.day_master, tg)),
        canggan,
        cangganShishen,
        nayin: result.nayin[col] || '',
        isDay: col === 'day',
      }
    })

    // 大運：優先使用 Python API 返回的精確大運（含節氣計算）
    const birthYear = parseInt(form.year)
    const currentYear = 2026
    const currentAge = currentYear - birthYear
    const dayun = (result.dayun && result.dayun.length > 0)
      ? result.dayun.slice(0, 9).map((dy) => {
          const startYear = dy.start_year || (birthYear + dy.start_age)
          const isCurrent = currentAge >= dy.start_age && currentAge < dy.start_age + 10
          return {
            age: dy.start_age,
            ganzhi: dy.ganzhi,
            wuxing: WX_TG[dy.ganzhi[0]] || '',
            startYear,
            isCurrent,
          }
        })
      : calcDayun(result.pillars.year, result.pillars.month, form.gender, birthYear)

    // 地支關係
    const dzRelations = analyzeDzRelations(pillarsArr)

    // 神煞計算
    const shensha = calcShensha(result.pillars, result.day_master)

    // 空亡（前端計算）：用於在各柱上標記
    const kongwangDzs = calcKongwang(result.pillars.day)
    const pillarKongwang = [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time].map(p => kongwangDzs.includes(p[1]))

    return { pillarDetails, dayun, dzRelations, shensha, kongwangDzs, pillarKongwang }
  }, [result, form.gender, form.year])

  return (
    <div className="py-12 md:py-20 overflow-x-hidden max-w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <div className="text-center mb-10 md:mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/25 text-gold/90 text-[11px] sm:text-xs font-semibold tracking-[0.25em] uppercase mb-5">
            <span className="text-[10px]">&#10022;</span>
            <span>BaZi &middot; 四柱八字</span>
            <span className="text-[10px]">&#10022;</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-center mb-4 break-words tracking-tight leading-[1.1]">
            <span className="text-gradient-gold">八字命理速算</span>
          </h1>
          <p className="text-center text-sm sm:text-base text-text tracking-[0.02em] mb-2">
            四柱排盤 <span className="text-gold/50 mx-1">&middot;</span> 五行十神 <span className="text-gold/50 mx-1">&middot;</span> 大運流年
          </p>
          <p className="text-center text-xs text-text-muted/60 tracking-wider">
            不需註冊 &middot; 即時出結果 &middot; 完全免費
          </p>
        </div>

        {/* 八字由來說明 */}
        <div className="max-w-2xl mx-auto mb-10">
          <details className="glass rounded-xl p-4 cursor-pointer">
            <summary className="text-sm font-medium text-gold-400 flex items-center gap-2">
              <span>&#128218;</span> 關於八字命理：三千年的智慧
            </summary>
            <div className="mt-3 text-xs text-text-muted/80 space-y-2 leading-relaxed">
              <p><strong className="text-white/90">八字的由來：</strong>八字命理（又稱四柱推命）源自中國古代天文曆法，歷經兩千餘年發展。唐代李虛中以年柱為主創立雛形，宋代徐子平改以日柱為核心，奠定了現代八字學的基礎，故又稱「子平術」。八字以出生的年、月、日、時四柱天干地支共八個字，推算一個人的先天命格與後天運勢。</p>
              <p><strong className="text-white/90">核心原理：</strong>八字的理論基礎是陰陽五行（金木水火土）的生剋制化。透過分析日主（出生日的天干）與其他七個字的關係，推導出十神（正官、偏財、食神等），再結合大運和流年的變化，解讀一個人在性格、事業、感情、財運等方面的傾向與時機。</p>
              <p><strong className="text-white/90">鑒源的做法：</strong>本系統使用天文級精度的萬年曆進行排盤，支援農曆／國曆雙向查詢，並可根據出生地經度進行真太陽時校正，確保時柱的準確性。分析涵蓋五行能量分佈、十神關係、格局判定與大運流年推演。</p>
            </div>
          </details>
        </div>

        {/* 分析進度動畫 */}
        {loading && !result && (
          <div className="max-w-lg mx-auto">
            <div className="glass rounded-2xl p-8">
              <h3 className="text-2xl md:text-3xl font-black text-cream tracking-tight mb-6 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
                正在為 <span className="text-gold">{form.name}</span> 進行命格分析
              </h3>
              <div className="space-y-2">
                {ANALYSIS_STEPS.map((step, i) => {
                  const isCompleted = completedSteps.includes(i)
                  const isCurrent = currentStep === i
                  return (
                    <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300 ${
                      isCompleted ? 'bg-gold/10' : isCurrent ? 'bg-gold/5' : 'opacity-30'
                    }`}>
                      <span className={`w-6 text-center text-sm transition-all ${isCompleted ? 'text-gold' : isCurrent ? 'text-gold/70 animate-pulse' : 'text-text-muted/40'}`}
                        dangerouslySetInnerHTML={{ __html: isCompleted ? '&#10003;' : step.icon }} />
                      <span className={`text-sm transition-all ${isCompleted ? 'text-cream' : isCurrent ? 'text-text animate-pulse' : 'text-text-muted/40'}`}>
                        {step.text}
                      </span>
                      {isCurrent && <span className="ml-auto w-4 h-4 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />}
                      {isCompleted && <span className="ml-auto text-xs text-gold/60">完成</span>}
                    </div>
                  )
                })}
              </div>
              {currentStep >= ANALYSIS_STEPS.length && (
                <p className="text-center text-gold mt-6 animate-pulse text-sm">報告生成完畢，正在載入...</p>
              )}
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="max-w-lg mx-auto">
            <form onSubmit={handleSubmit} className="glass rounded-2xl px-6 py-8 md:p-10 space-y-6">
              {/* 從家人選擇 */}
              <FamilyMemberPicker onSelect={handleFamilySelect} />

              {/* 姓名 + 性別 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-text-muted mb-1.5">姓名 <span className="text-red-accent">*</span></label>
                  <input type="text" required placeholder="請輸入您的全名" value={form.name}
                    onChange={(e) => setForm({...form, name:e.target.value})}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">性別</label>
                  <div className="flex gap-4 pt-2">
                    {[{v:'M',l:'男'},{v:'F',l:'女'}].map(({v,l})=>(
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="gender" value={v} checked={form.gender===v} onChange={(e)=>setForm({...form,gender:e.target.value})} className="accent-gold" />
                        <span className="text-base text-text">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 曆法、出生時間、出生城市（八字基本必要欄位） */}
              <>
              {/* 國曆/農曆切換 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">曆法</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10">
                  {[{v:'solar' as const,l:'國曆（西曆）'},{v:'lunar' as const,l:'農曆'}].map(({v,l})=>(
                    <button key={v} type="button"
                      onClick={()=>setForm({...form, calendarType:v})}
                      className={`flex-1 py-2.5 text-sm font-medium transition-all ${form.calendarType===v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.calendarType==='lunar' && (
                  <p className="text-xs text-gold/60 mt-1.5">系統將自動轉換為國曆並處理閏月</p>
                )}
              </div>

              {/* 出生日期 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="bazi-year" className="block text-sm text-text-muted mb-1.5">出生年</label>
                  <input id="bazi-year" type="number" min="1920" max="2025" value={form.year} onChange={(e)=>setForm({...form,year:e.target.value})}
                    aria-label="出生年"
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="bazi-month" className="block text-sm text-text-muted mb-1.5">{form.calendarType==='lunar'?'農曆月':'月'}</label>
                  <select id="bazi-month" value={form.month} onChange={(e)=>setForm({...form,month:e.target.value})}
                    aria-label={form.calendarType==='lunar'?'農曆月':'月'}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{form.calendarType==='lunar'?`${['正','二','三','四','五','六','七','八','九','十','冬','臘'][i]}月`:`${i+1}月`}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="bazi-day" className="block text-sm text-text-muted mb-1.5">{form.calendarType==='lunar'?'農曆日':'日'}</label>
                  <select id="bazi-day" value={form.day} onChange={(e)=>setForm({...form,day:e.target.value})}
                    aria-label={form.calendarType==='lunar'?'農曆日':'日'}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>{form.calendarType==='lunar'?`${['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'][i]}`:`${i+1}日`}</option>)}
                  </select>
                </div>
              </div>

              {/* 出生時間 — 三選一 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">出生時間</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10 mb-3">
                  {[
                    {v:'unknown' as const, l:'不確定'},
                    {v:'shichen' as const, l:'知道時辰'},
                    {v:'exact' as const, l:'知道精確時間'},
                  ].map(({v,l})=>(
                    <button key={v} type="button"
                      onClick={()=>setForm({...form, timeMode:v})}
                      className={`flex-1 py-2.5 text-xs font-medium transition-all ${form.timeMode===v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.timeMode==='unknown' && (
                  <p className="text-xs text-text-muted/70 leading-relaxed">
                    系統將以午時（12:00）作為預設進行分析。生肖、數字能量、姓名學等不受影響，但八字時柱、上升星座等會有偏差。
                    <span className="text-gold/70">建議向父母或出生醫院確認出生時間，可獲得更精準的分析。</span>
                  </p>
                )}
                {form.timeMode==='shichen' && (
                  <select aria-label="出生時辰" value={form.hour} onChange={(e)=>setForm({...form,hour:e.target.value})}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {SHICHEN.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
                {form.timeMode==='exact' && (
                  <div className="grid grid-cols-2 gap-3">
                    <select aria-label="出生小時" value={form.exactHour} onChange={(e)=>setForm({...form,exactHour:e.target.value})}
                      className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                      {Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')} 時</option>)}
                    </select>
                    <select aria-label="出生分鐘" value={form.exactMinute} onChange={(e)=>setForm({...form,exactMinute:e.target.value})}
                      className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                      {Array.from({length:60},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')} 分</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 出生地區 */}
              <div className="relative">
                <label className="block text-sm text-text-muted mb-1.5">出生地區 <span className="text-red-accent">*</span></label>
                {needCityForCountry && (
                  <p className="text-xs text-gold/80 mb-1.5">已選擇「{needCityForCountry}」（多時區），請輸入城市名</p>
                )}
                <input type="text" placeholder={needCityForCountry ? `輸入${needCityForCountry}的城市名` : '輸入地區名（如：台灣、香港、日本）'} value={form.city}
                  onChange={(e) => {
                    const val = e.target.value
                    setForm({...form, city:val})
                    if (needCityForCountry) {
                      const cities = searchCities(val).filter(c => c.country === needCityForCountry || c.name.includes(val) || c.name_en.toLowerCase().includes(val.toLowerCase()))
                      setCityResults(cities.map(c => ({ type: 'city' as const, city: c })))
                    } else {
                      setCityResults(val.length >= 1 ? searchLocations(val) : [])
                    }
                  }}
                  className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                {cityResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 glass rounded-lg border border-gold/20 max-h-48 overflow-y-auto">
                    {cityResults.map((r, idx) => r.type === 'country' ? (
                      <button key={`country-${r.country.name}`} type="button"
                        onClick={() => {
                          if (r.isMultiTz) {
                            setNeedCityForCountry(r.country.name)
                            setForm({...form, city: ''})
                            setCityResults([])
                          } else {
                            setForm({...form, city: r.country.name, cityLat: r.country.lat, cityLng: r.country.lng, cityTz: r.country.tz})
                            setCityResults([])
                            setNeedCityForCountry('')
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors flex justify-between items-center">
                        <span className="text-sm text-cream">{r.country.name}</span>
                        <span className="text-[10px] text-text-muted/60">
                          {r.isMultiTz ? '多時區，請選擇城市' : `UTC${r.country.tz >= 0 ? '+' : ''}${r.country.tz}`}
                        </span>
                      </button>
                    ) : (
                      <button key={`city-${r.city.name_en}-${idx}`} type="button"
                        onClick={() => {
                          setForm({...form, city:`${r.city.name}（${r.city.country}）`, cityLat:r.city.lat, cityLng:r.city.lng, cityTz:r.city.tz})
                          setCityResults([])
                          setNeedCityForCountry('')
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors flex justify-between items-center">
                        <span className="text-sm text-cream">{r.city.name} <span className="text-text-muted">({r.city.country})</span></span>
                        <span className="text-[10px] text-text-muted/60">UTC{r.city.tz>=0?'+':''}{r.city.tz}</span>
                      </button>
                    ))}
                  </div>
                )}
                {needCityForCountry && (
                  <button type="button" onClick={() => { setNeedCityForCountry(''); setForm({...form, city: ''}); setCityResults([]) }}
                    className="text-xs text-gold/60 hover:text-gold mt-1 underline">取消，重新選擇國家</button>
                )}
                {form.cityLat !== 0 && (
                  <p className="text-[10px] text-text-muted/50 mt-1">經度 {form.cityLng.toFixed(2)}° | 時區 UTC{form.cityTz>=0?'+':''}{form.cityTz} | 將自動校正真太陽時</p>
                )}
              </div>

              </>

              <button type="submit" disabled={loading || !form.name.trim() || form.cityLat === 0}
                className={`w-full py-4 font-bold rounded-xl text-lg transition-all ${
                  form.name.trim() && form.cityLat !== 0
                    ? 'bg-gold text-dark btn-glow disabled:opacity-50'
                    : 'bg-white/10 text-text-muted cursor-not-allowed'
                }`}>
                {!form.name.trim() || form.cityLat === 0 ? '請填寫完整資料' : '開始命理分析'}
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            </form>
          </div>
        )}

        {result && derivedData && (
          <div className="space-y-8">
            <div className="text-center">
              <button onClick={()=>setResult(null)} className="text-sm text-gold hover:underline">&larr; 重新分析</button>
            </div>

            {/* ═══ 2026 整體運勢（第一眼！） ═══ */}
            {result.has_ai && result.ai_sections['2026整體運勢'] && (
              <div className="rounded-2xl p-8 border border-gold/30" style={{background:'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(15,22,40,0.4))'}}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-gold to-gold/30 rounded-full shadow-[0_0_8px_rgba(201,168,76,0.4)]" />
                  <h2 className="text-xl md:text-2xl font-extrabold text-gradient-gold tracking-tight">2026 丙午年 — {form.name} 的整體運勢</h2>
                </div>
                <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['2026整體運勢']}</p>
              </div>
            )}

            {/* ═══ 校正提示 ═══ */}
            {(result.solar_time || result.lunar_converted || result.time_unknown || result.is_fallback) && (
              <div className="glass rounded-xl px-5 py-4 text-xs text-text-muted/80 space-y-2 border border-white/5">
                {result.lunar_converted && (
                  <p className="flex items-start gap-2"><span className="text-gold mt-0.5">&#9881;</span><span>已將農曆日期自動轉換為國曆進行排盤計算</span></p>
                )}
                {result.solar_time && (
                  <p className="flex items-start gap-2"><span className="text-gold mt-0.5">&#128337;</span><span>已根據出生地經度（{result.solar_time.longitude.toFixed(1)}°）進行真太陽時校正：{result.solar_time.original} → <strong className="text-gold">{result.solar_time.corrected}</strong>（{result.solar_time.diff_minutes > 0 ? '+' : ''}{result.solar_time.diff_minutes} 分鐘）</span></p>
                )}
                {result.time_unknown && (
                  <p className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">&#9888;</span><span>未提供出生時間，以午時（12:00）預設。八字時柱、上升星座等可能有偏差。</span></p>
                )}
                {result.is_fallback && (
                  <p className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">&#9432;</span><span>此為速算結果（精確度約 95%），完整精確排盤請查看付費報告</span></p>
                )}
              </div>
            )}

            {/* ═══ 傳統四柱排盤 ═══ */}
            <div className="glass rounded-2xl p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-7 bg-gradient-to-b from-gold to-gold/30 rounded-full shadow-[0_0_8px_rgba(201,168,76,0.4)]" />
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">八字排盤</h2>
                <span className="text-xs text-text-muted ml-2">（傳統四柱格式）</span>
              </div>

              {/* 四柱主體 — 桌面從右到左，手機從上到下 */}
              <div className="hidden md:block overflow-x-auto">
                <div className="flex flex-row-reverse justify-center gap-3 min-w-[520px]">
                  {derivedData.pillarDetails.map((p, idx) => (
                    <div key={p.col} className={`relative flex-1 max-w-[140px] rounded-xl p-4 text-center transition-all ${
                      p.isDay ? 'border-2 border-gold/40 bg-gold/[0.06]' : 'glass'
                    }`}>
                      {derivedData.pillarKongwang[idx] && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-600/80 text-white border border-gray-500/50 font-bold">空亡</span>
                      )}
                      {/* 柱名 */}
                      <div className="text-xs text-text-muted mb-1">{p.label}</div>
                      {/* 十神 */}
                      <div className={`text-xs font-semibold mb-2 ${p.isDay ? 'text-gold' : 'text-gold/70'}`}>
                        {p.shishen}
                      </div>
                      {/* 天干 */}
                      <div className="text-3xl font-bold mb-0.5" style={{ color: WX_COLORS[p.tgWx] || '#d4d0ca' }}>
                        {p.tg}
                      </div>
                      <div className="text-[10px] mb-2" style={{ color: WX_COLORS[p.tgWx] || '#6880a0' }}>
                        {p.tgWx}
                      </div>
                      {/* 分隔線 */}
                      <div className="border-t border-gold/10 my-2" />
                      {/* 地支 */}
                      <div className="text-3xl font-bold mb-0.5" style={{ color: WX_COLORS[p.dzWx] || '#d4d0ca' }}>
                        {p.dz}
                      </div>
                      <div className="text-[10px] mb-2" style={{ color: WX_COLORS[p.dzWx] || '#6880a0' }}>
                        {p.dzWx}
                      </div>
                      {/* 藏干 */}
                      <div className="border-t border-gold/10 my-2" />
                      <div className="space-y-0.5">
                        {p.canggan.map((cg, i) => (
                          <div key={i} className="flex items-center justify-center gap-1 text-[10px]">
                            <span className="text-text-muted/50">{CANGGAN_LABELS[i]}</span>
                            <span style={{ color: WX_COLORS[WX_TG[cg]] || '#6880a0' }}>{cg}</span>
                            <span className="text-gold/50">{p.cangganShishen[i]}</span>
                          </div>
                        ))}
                      </div>
                      {/* 納音 */}
                      <div className="border-t border-gold/10 my-2" />
                      <div className="text-[10px] text-text-muted/40">{p.nayin}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 手機版 — 垂直堆疊（藏干/納音獨立行以避免擠壓） */}
              <div className="md:hidden space-y-3">
                {derivedData.pillarDetails.map((p, idx) => (
                  <div key={p.col} className={`relative rounded-xl p-4 transition-all ${
                    p.isDay ? 'border-2 border-gold/40 bg-gold/[0.06] shadow-[0_0_20px_rgba(201,168,76,0.1)]' : 'glass'
                  }`}>
                    {derivedData.pillarKongwang[idx] && (
                      <span className="absolute -top-1.5 -right-1.5 text-[10px] px-2 py-0.5 rounded-full bg-gray-600/90 text-white border border-gray-500/50 font-bold">空亡</span>
                    )}
                    {/* 頂部：柱名 + 天干地支 + 十神 */}
                    <div className="flex items-center gap-4">
                      <div className="w-[60px] text-center shrink-0">
                        <div className="text-[11px] text-text-muted mb-0.5">{p.label}</div>
                        <div className={`text-xs font-semibold ${p.isDay ? 'text-gold' : 'text-gold/70'}`}>{p.shishen}</div>
                      </div>
                      <div className="flex items-center gap-4 flex-1 justify-center">
                        <div className="text-center">
                          <div className="text-3xl font-bold leading-none mb-1" style={{ color: WX_COLORS[p.tgWx] }}>{p.tg}</div>
                          <div className="text-[10px] opacity-80" style={{ color: WX_COLORS[p.tgWx] }}>{p.tgWx}</div>
                        </div>
                        <div className="w-px h-10 bg-gold/15" aria-hidden="true" />
                        <div className="text-center">
                          <div className="text-3xl font-bold leading-none mb-1" style={{ color: WX_COLORS[p.dzWx] }}>{p.dz}</div>
                          <div className="text-[10px] opacity-80" style={{ color: WX_COLORS[p.dzWx] }}>{p.dzWx}</div>
                        </div>
                      </div>
                    </div>
                    {/* 藏干（獨立行，充足呼吸） */}
                    {p.canggan.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gold/10">
                        <div className="text-[11px] text-text-muted/70 mb-1.5">藏干</div>
                        <div className="flex flex-wrap gap-2">
                          {p.canggan.map((cg, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10">
                              <span className="text-[10px] text-text-muted/60">{CANGGAN_LABELS[i]}</span>
                              <span className="font-bold" style={{ color: WX_COLORS[WX_TG[cg]] }}>{cg}</span>
                              <span className="text-gold/70 text-[10px]">{p.cangganShishen[i]}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 納音 */}
                    {p.nayin && (
                      <div className="mt-2 text-[11px] text-text-muted/50">
                        <span className="text-text-muted/40">納音：</span>{p.nayin}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 命盤概要 */}
              <div className="mt-8 pt-6 border-t border-gold/10">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted/50 mb-3 text-center">核心參數</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {l:'日主',v:`${result.day_master}（${result.day_master_wuxing}）`, highlight: true},
                    {l:'身強弱',v:result.strength}, {l:'格局',v:result.geju},
                    {l:'用神',v:result.yongshen, gold:true}, {l:'喜神',v:result.xishen, gold:true},
                    {l:'生肖',v:result.shengxiao?`${result.shengxiao}（${result.pillars.year}）`:result.pillars.year},
                  ].map(({l,v,gold,highlight})=>(
                    <div key={l} className={`rounded-xl px-4 py-3 transition-all ${highlight ? 'bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/30 shadow-[0_0_15px_rgba(201,168,76,0.08)]' : 'glass border border-white/5'}`}>
                      <div className="text-[10px] uppercase tracking-wider text-text-muted/70">{l}</div>
                      <div className={`text-[15px] font-bold mt-1 ${gold?'text-gold':highlight?'text-gold':'text-white'}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ═══ 地支關係 ═══ */}
            {derivedData.dzRelations.length > 0 && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-purple-400 to-purple-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">地支關係</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {derivedData.dzRelations.map((rel, i) => (
                    <div key={i} className={`rounded-lg px-4 py-2.5 text-sm ${
                      rel.type === '六合' ? 'bg-green-500/10 border border-green-500/20 text-green-400' :
                      rel.type === '六沖' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
                      'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                    }`}>
                      <span className="font-bold mr-2">{rel.type}</span>
                      <span className="text-text/80">{rel.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ 神煞 ═══ */}
            {derivedData.shensha.length > 0 && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-amber-300 to-amber-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">命中神煞</h2>
                  <span className="text-xs text-text-muted/50 ml-2">（傳統四柱神煞，影響命格特質）</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {derivedData.shensha.map((s, i) => (
                    <div key={i} className={`rounded-lg p-3 border ${s.color}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">{s.name}</span>
                        <div className="flex gap-1">
                          {s.pillars.map((p, j) => (
                            <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-muted">{p}柱</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-text/70 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
                {derivedData.kongwangDzs.length > 0 && (
                  <p className="text-[10px] text-text-muted/50 mt-3 italic">
                    空亡地支：{derivedData.kongwangDzs.join('、')}（從日柱「{result.pillars.day}」推算的旬空）
                  </p>
                )}
              </div>
            )}

            {/* ═══ 胎元（命宮） ═══ */}
            {result.tai_yuan && (
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                  <h3 className="text-base font-bold text-white">胎元</h3>
                  <span className="text-lg font-bold text-indigo-400 ml-2">{result.tai_yuan.ganzhi}</span>
                  <span className="text-xs text-text-muted">納音：{result.tai_yuan.nayin}</span>
                </div>
                <p className="text-xs text-text-muted mt-2">胎元是受胎之月，代表先天根基與潛在才能，與月柱形成互補關係。</p>
              </div>
            )}

            {/* ═══ 近 5 年流年（Python API 提供） ═══ */}
            {result.liunian && result.liunian.length > 0 && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-red-400 to-red-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">流年運勢</h2>
                  <span className="text-xs text-text-muted/50 ml-2">（近 3 年）</span>
                </div>
                <div className="space-y-3">
                  {result.liunian.slice(0, 5).map((ln, i) => {
                    const isGood = ['吉', '大吉', '小吉'].includes(ln.rating)
                    const isBad = ['凶', '大凶', '小凶'].includes(ln.rating)
                    return (
                      <div key={i} className={`rounded-xl p-4 border ${
                        isGood ? 'bg-green-500/5 border-green-500/20' : isBad ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.02] border-white/10'
                      }`}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-base font-bold text-white">{ln.year}年</span>
                          <span className="text-lg font-bold" style={{ color: WX_COLORS[ln.wuxing || ''] }}>{ln.ganzhi}</span>
                          <span className="text-xs text-gold/70">{ln.shishen}</span>
                          <span className={`text-xs font-semibold ml-auto px-2 py-0.5 rounded-full ${
                            isGood ? 'bg-green-500/20 text-green-400' : isBad ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-text-muted'
                          }`}>{ln.rating}</span>
                        </div>
                        <p className="text-xs text-text/80 leading-relaxed">{ln.reason}</p>
                        {ln.interactions && ln.interactions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {ln.interactions.map((intr, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">{intr}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ═══ 五行能量分佈（圓餅圖 + 進度條） ═══ */}
            <div className="glass rounded-2xl p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-7 bg-gradient-to-b from-gold to-gold/30 rounded-full shadow-[0_0_8px_rgba(201,168,76,0.4)]" />
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">五行能量分佈</h2>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-6">
                {/* 圓餅圖 */}
                <div className="shrink-0">
                  <WuxingPieChart data={result.wuxing_count_full || result.wuxing_count} />
                </div>
                {/* 進度條 */}
                <div className="flex-1 w-full space-y-3">
                  {(()=>{
                    const wxData = result.wuxing_count_full || result.wuxing_count
                    const total = Object.values(wxData).reduce((a,b)=>a+b,0)
                    const missing = Object.entries(wxData).filter(([,v]) => v === 0).map(([k]) => k)
                    const strongest = Object.entries(wxData).sort((a,b) => b[1] - a[1])[0]?.[0]
                    return (
                      <>
                        {Object.entries(wxData).map(([elem,val])=>{
                          const pct = total > 0 ? Math.round((val/total)*100) : 0
                          return (
                            <div key={elem} className="flex items-center gap-3">
                              <span className="w-9 text-lg font-bold tracking-wide" style={{color:WX_COLORS[elem]}}>{elem}</span>
                              <div className="flex-1 h-7 bg-white/5 rounded-full overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]">
                                <div className="h-full rounded-full flex items-center pl-3 transition-all duration-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" style={{width:`${Math.max(pct,5)}%`,background:`linear-gradient(90deg, ${WX_COLORS[elem]}dd, ${WX_COLORS[elem]})`}}>
                                  <span className="text-[11px] font-bold text-white drop-shadow-sm">{typeof val==='number'&&val%1!==0?val.toFixed(1):val}</span>
                                </div>
                              </div>
                              <span className="w-14 text-right text-base font-semibold text-cream/90 tabular-nums">{pct}%</span>
                              {val===0&&<span className="text-xs text-red-400 font-semibold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">缺</span>}
                              {elem === strongest && val > 0 && <span className="text-xs text-gold font-semibold px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20">旺</span>}
                            </div>
                          )
                        })}
                        {missing.length > 0 && (
                          <p className="text-xs text-red-400/80 mt-2">
                            &#9888; 命盤缺 <strong>{missing.join('、')}</strong>，建議透過後天調補強化
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* ═══ 大運時間軸 ═══ */}
            <div className="glass rounded-2xl p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-7 bg-gradient-to-b from-gold to-gold/30 rounded-full shadow-[0_0_8px_rgba(201,168,76,0.4)]" />
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">大運走勢</h2>
                <span className="text-xs text-text-muted ml-2">（每十年一運）</span>
              </div>

              {/* 桌面版：橫向時間軸 */}
              <div className="hidden md:block overflow-x-auto pb-4">
                <div className="relative min-w-[600px]">
                  {/* 時間線 */}
                  <div className="absolute top-6 left-8 right-8 h-0.5 bg-gold/20" />
                  <div className="flex justify-between px-4">
                    {derivedData.dayun.map((dy, i) => {
                      const isLast = i === derivedData.dayun.length - 1
                      return (
                        <div key={i} className={`relative flex flex-col items-center w-[80px] ${isLast ? 'opacity-40' : ''}`}>
                          {/* 節點 */}
                          <div className={`w-3 h-3 rounded-full z-10 mb-2 ${
                            dy.isCurrent ? 'bg-gold ring-4 ring-gold/30 scale-125' : 'bg-white/40'
                          }`} />
                          {dy.isCurrent && (
                            <div className="absolute -top-5 text-[10px] text-gold font-bold">當前</div>
                          )}
                          {/* 干支 */}
                          <div className={`text-base font-bold ${dy.isCurrent ? 'text-gold' : 'text-cream'}`}>
                            <span style={{ color: WX_COLORS[WX_TG[dy.ganzhi[0]]] }}>{dy.ganzhi[0]}</span>
                            <span style={{ color: WX_COLORS[WX_DZ[dy.ganzhi[1]]] }}>{dy.ganzhi[1]}</span>
                          </div>
                          {/* 年齡 */}
                          <div className="text-[10px] text-text-muted mt-0.5">{dy.age}歲</div>
                          {/* 年份 */}
                          <div className="text-[10px] text-text-muted/50">{dy.startYear}</div>
                          {/* 鎖定圖標 */}
                          {isLast && (
                            <div className="text-xs text-gold/40 mt-1">&#128274;</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* 手機版：垂直時間軸 */}
              <div className="md:hidden">
                <div className="relative pl-8">
                  {/* 垂直線 */}
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gold/20" />
                  <div className="space-y-4">
                    {derivedData.dayun.map((dy, i) => {
                      const isLast = i === derivedData.dayun.length - 1
                      return (
                        <div key={i} className={`relative flex items-center gap-3 ${isLast ? 'opacity-40' : ''}`}>
                          {/* 節點 */}
                          <div className={`absolute -left-5 w-2.5 h-2.5 rounded-full ${
                            dy.isCurrent ? 'bg-gold ring-3 ring-gold/30' : 'bg-white/40'
                          }`} />
                          {/* 內容 */}
                          <div className={`flex items-center gap-3 flex-1 rounded-lg px-3 py-2 ${
                            dy.isCurrent ? 'bg-gold/10 border border-gold/20' : ''
                          }`}>
                            <span className="font-bold text-base">
                              <span style={{ color: WX_COLORS[WX_TG[dy.ganzhi[0]]] }}>{dy.ganzhi[0]}</span>
                              <span style={{ color: WX_COLORS[WX_DZ[dy.ganzhi[1]]] }}>{dy.ganzhi[1]}</span>
                            </span>
                            <span className="text-xs text-text-muted">{dy.age}歲起</span>
                            <span className="text-xs text-text-muted/50">{dy.startYear}年</span>
                            {dy.isCurrent && <span className="text-[10px] text-gold font-bold ml-auto">當前大運</span>}
                            {isLast && <span className="text-xs text-gold/40 ml-auto">&#128274;</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gold/40 mt-4 italic text-center">
                完整大運分析包含逐運五行變化、事業財運感情詳解、關鍵流年提示...
              </p>
            </div>

            {/* ═══ 命格概述（核心：讓客戶覺得準） ═══ */}
            <div className="relative glass rounded-2xl p-8 md:p-10 overflow-hidden">
              {/* 金色裝飾光暈 */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-gold/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
              <div className="relative text-center mb-8">
                <div className="inline-block px-5 py-2 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs sm:text-sm font-semibold mb-4 tracking-wide">
                  {form.name} 的命格密碼
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                  您是「<span className="text-gradient-gold">{result.profile.title}</span>」型人格
                </h2>
                <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              </div>
              <p className="relative text-base md:text-lg text-text leading-[2] mb-8 tracking-[0.02em]">{result.profile.personality}</p>
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl bg-green-500/8 border border-green-500/25 p-6">
                  <h4 className="text-sm font-bold text-green-400 mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20">&#10003;</span>
                    您的天生優勢
                  </h4>
                  <p className="text-sm md:text-[15px] text-text leading-[1.9]">{result.profile.strengths}</p>
                </div>
                <div className="rounded-xl bg-orange-500/8 border border-orange-500/25 p-6">
                  <h4 className="text-sm font-bold text-orange-400 mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20">&#9888;</span>
                    需要留意的地方
                  </h4>
                  <p className="text-sm md:text-[15px] text-text leading-[1.9]">{result.profile.challenges}</p>
                </div>
              </div>
            </div>

            {/* ═══ 六大維度分析 ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { title:'事業方向', text:result.profile.career, icon:'&#128188;', color:'border-blue-500/25 bg-blue-500/5 hover:border-blue-500/40', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
                { title:'感情特質', text:result.profile.love, icon:'&#10084;&#65039;', color:'border-pink-500/25 bg-pink-500/5 hover:border-pink-500/40', iconBg: 'bg-pink-500/15', iconColor: 'text-pink-400' },
                { title:'健康提醒', text:result.profile.health, icon:'&#127973;', color:'border-green-500/25 bg-green-500/5 hover:border-green-500/40', iconBg: 'bg-green-500/15', iconColor: 'text-green-400' },
                { title:'2026年運勢', text:result.profile.year2026, icon:'&#9733;', color:'border-yellow-500/25 bg-yellow-500/5 hover:border-yellow-500/40', iconBg: 'bg-yellow-500/15', iconColor: 'text-yellow-400' },
              ].map(item=>(
                <div key={item.title} className={`rounded-2xl border p-6 transition-all ${item.color}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-lg ${item.iconBg} ${item.iconColor}`} dangerouslySetInnerHTML={{__html:item.icon}} />
                    <h4 className="text-base font-bold text-white tracking-wide">{item.title}</h4>
                  </div>
                  <p className="text-sm md:text-[15px] text-text/90 leading-[1.9]">{item.text}</p>
                </div>
              ))}
            </div>

            {/* ═══ 幸運元素 ═══ */}
            <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
              <h3 className="text-base font-bold text-gold mb-3">&#128161; 您的開運指南</h3>
              <p className="text-base text-text leading-[1.8]">{result.profile.lucky}</p>
            </div>

            {/* ═══ 太陽星座 ═══ */}
            {result.sun_sign && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-purple-400 to-purple-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">西洋占星：{result.sun_sign.name}</h2>
                  <span className="text-xs text-purple-400/70">{result.sun_sign.element}</span>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.sun_sign.trait}</p>
                <p className="text-sm text-text-muted italic mt-3">完整星盤需要精確出生時間和地點，包含月亮星座、上升星座、行星相位等深度分析...</p>
              </div>
            )}

            {/* ═══ 生命靈數 ═══ */}
            {result.life_path && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-cyan-400 to-cyan-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">生命靈數：{result.life_path.number} 號 — {result.life_path.title}</h2>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.life_path.desc}</p>
              </div>
            )}

            {/* ═══ 生肖詳細年運 ═══ */}
            {result.shengxiao_fortune && (
              <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-7 bg-gradient-to-b from-red-400 to-red-600/40 rounded-full" />
                  <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">屬{result.shengxiao} — 2026 丙午年運勢</h2>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.shengxiao_fortune}</p>
              </div>
            )}

            {/* ═══ 深度分析 ═══ */}
            {result.has_ai && (
              <>
                {result.ai_sections['性格深度剖析'] && (
                  <AIAnalysisCard text={result.ai_sections['性格深度剖析']} title="性格深度剖析" accentColor="purple" />
                )}

                {result.ai_sections['財運方向'] && (
                  <AIAnalysisCard text={result.ai_sections['財運方向']} title="財運方向" accentColor="emerald" />
                )}

                {result.ai_sections['人際與貴人'] && (
                  <AIAnalysisCard text={result.ai_sections['人際與貴人']} title="人際與貴人" accentColor="blue" />
                )}

                {result.ai_sections['未來機會窗口'] && (
                  <AIAnalysisCard text={result.ai_sections['未來機會窗口']} title="未來機會窗口" accentColor="amber" />
                )}

                {result.ai_sections['需要留意的地方'] && (
                  <AIAnalysisCard text={result.ai_sections['需要留意的地方']} title="需要留意的地方" accentColor="rose" />
                )}
              </>
            )}

            {/* 速算提示 */}
            <p className="text-center text-xs text-text-muted/50 leading-relaxed">
              以上為日主速算概覽，完整報告將根據您的完整命盤做 14 系統個人化深度分析
            </p>

            {/* v5.4.17 P0 freemium paywall(Gemini+Codex 共識「準但不完整」)*/}
            <FreemiumPaywall systemName="八字" clientName={form.name} checkoutQuery={`name=${encodeURIComponent(form.name)}&year=${form.year}&month=${form.month}&day=${form.day}&hour=${form.timeMode === 'exact' ? form.exactHour : form.hour}&gender=${form.gender}&calendarType=${form.calendarType}`} />

            {/* ═══ 升級引導 ═══ */}
            <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(26,58,92,0.4))'}}>
              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    以上只揭示了您命格的 <span className="text-gradient-gold">6.7%</span>
                  </h3>
                  <p className="text-base text-text max-w-2xl mx-auto leading-relaxed">
                    您剛才體驗的是八字一個系統的簡要分析。完整報告融合
                    <strong className="text-white">千年東方玄學經典</strong>——
                    《滴天髓》《窮通寶鑑》《紫微斗數全書》《奇門遁甲統宗》，結合
                    <strong className="text-white">全球最頂尖的命理分析引擎</strong>，
                    橫跨 14 套東西方命理體系，為您呈現一份前所未有的命格全景報告。
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128218;</div>
                    <h4 className="font-bold text-white mb-1">千年古籍精髓</h4>
                    <p className="text-sm text-text-muted">融合數十部命理經典核心理論，44,421+ 條專業規則</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#129302;</div>
                    <h4 className="font-bold text-white mb-1">科技量化深度解讀</h4>
                    <p className="text-sm text-text-muted">AI 深度引擎逐句分析，每段結論精準到您個人命盤</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#127760;</div>
                    <h4 className="font-bold text-white mb-1">14 系統交叉驗證</h4>
                    <p className="text-sm text-text-muted">東西方系統互相印證，多系統共識的結論才最可靠</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                    {([
                      { plan: 'C', label: '解鎖人生藍圖完整報告 $89', primary: true },
                      { plan: 'D', label: '聚焦單一困惑深度分析 $39', primary: false },
                    ] as const).map(({ plan, label, primary }) => {
                      const q = new URLSearchParams({
                        plan,
                        name: form.name,
                        year: form.year,
                        month: form.month,
                        day: form.day,
                        hour: form.timeMode === 'exact' ? form.exactHour : form.hour,
                        minute: form.timeMode === 'exact' ? form.exactMinute : '0',
                        gender: form.gender,
                        timeMode: form.timeMode,
                        calendarType: form.calendarType,
                      })
                      const cls = primary
                        ? 'px-10 py-4 bg-gold text-dark font-bold rounded-xl text-lg btn-glow'
                        : 'px-10 py-4 glass text-white font-semibold rounded-xl text-lg hover:bg-white/10'
                      return <a key={plan} href={`/checkout?${q}`} className={cls}>{label}</a>
                    })}
                  </div>

                  {/* 出門訣引導 */}
                  <div className="glass rounded-xl p-5 max-w-md mx-auto mb-6">
                    <p className="text-sm text-cream mb-2 font-semibold">想知道什麼時候出門最順利？</p>
                    <p className="text-xs text-text-muted mb-3">奇門遁甲出門訣 — 精準計算吉時吉方，讓每次出門都事半功倍</p>
                    <div className="flex gap-2 justify-center">
                      <Link href="/checkout?plan=E1" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        事件擇吉 $59
                      </Link>
                      <Link href="/checkout?plan=E2" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        月度單盤 $29
                      </Link>
                    </div>
                  </div>

                  {/* v5.4.7 P3 social proof */}
                  <p className="text-xs text-text-muted/70 mb-3">
                    已有 <LiveCounter type="paid" /> 份完整付費報告完成交付
                  </p>

                  <div className="flex flex-wrap justify-center gap-4 text-xs text-text-muted/60 mb-4">
                    <span>&#128274; Stripe 安全支付</span>
                    <span>&#9889; 約30-60分鐘出報告</span>
                    <span>&#128230; PDF 永久保存</span>
                  </div>
                  <p className="text-xs text-text-muted/50">
                    還沒準備好？{' '}
                    <Link href="/auth/signup" className="text-gold underline hover:no-underline">免費註冊帳號</Link>
                    {' '}先收藏命格資料，隨時回來查閱
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
