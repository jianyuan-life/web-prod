'use client'

import { useState, useMemo } from 'react'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import { searchCities, searchLocations, type City, type LocationSearchResult } from '@/lib/cities'
import FamilyMemberPicker from '@/components/checkout/FamilyMemberPicker'
import type { SavedFamilyMember } from '@/components/FamilyMembersManager'

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

    // 大運
    const dayun = calcDayun(result.pillars.year, result.pillars.month, form.gender, parseInt(form.year))

    // 地支關係
    const dzRelations = analyzeDzRelations(pillarsArr)

    return { pillarDetails, dayun, dzRelations }
  }, [result, form.gender, form.year])

  return (
    <div className="py-16">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-3xl font-bold text-center mb-2"><span className="text-gradient-gold">命理速算</span></h1>
        <p className="text-center text-text-muted mb-2">精確排盤 + 深度分析 + 個人化命格解讀</p>
        <p className="text-center text-xs text-text-muted/60 mb-4">不需註冊 &middot; 即時出結果 &middot; 完全免費</p>

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
              <h3 className="text-lg font-bold text-cream mb-6 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
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
            <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
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
                  <label className="block text-sm text-text-muted mb-1.5">出生年</label>
                  <input type="number" min="1920" max="2025" value={form.year} onChange={(e)=>setForm({...form,year:e.target.value})}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">{form.calendarType==='lunar'?'農曆月':'月'}</label>
                  <select value={form.month} onChange={(e)=>setForm({...form,month:e.target.value})}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{form.calendarType==='lunar'?`${['正','二','三','四','五','六','七','八','九','十','冬','臘'][i]}月`:`${i+1}月`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">{form.calendarType==='lunar'?'農曆日':'日'}</label>
                  <select value={form.day} onChange={(e)=>setForm({...form,day:e.target.value})}
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
                  <select value={form.hour} onChange={(e)=>setForm({...form,hour:e.target.value})}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {SHICHEN.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
                {form.timeMode==='exact' && (
                  <div className="grid grid-cols-2 gap-3">
                    <select value={form.exactHour} onChange={(e)=>setForm({...form,exactHour:e.target.value})}
                      className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                      {Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')} 時</option>)}
                    </select>
                    <select value={form.exactMinute} onChange={(e)=>setForm({...form,exactMinute:e.target.value})}
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
                  <div className="w-1 h-6 bg-gold rounded-full" />
                  <h2 className="text-lg font-bold text-gradient-gold">2026 丙午年 — {form.name} 的整體運勢</h2>
                </div>
                <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['2026整體運勢']}</p>
              </div>
            )}

            {/* ═══ 校正提示 ═══ */}
            {(result.solar_time || result.lunar_converted || result.time_unknown || result.is_fallback) && (
              <div className="glass rounded-xl p-4 text-xs text-text-muted space-y-1">
                {result.lunar_converted && (
                  <p>&#9672; 已將農曆日期自動轉換為國曆進行排盤計算</p>
                )}
                {result.solar_time && (
                  <p>&#9672; 已根據出生地經度（{result.solar_time.longitude.toFixed(1)}°）進行真太陽時校正：{result.solar_time.original} → <strong className="text-gold">{result.solar_time.corrected}</strong>（{result.solar_time.diff_minutes > 0 ? '+' : ''}{result.solar_time.diff_minutes} 分鐘）</p>
                )}
                {result.time_unknown && (
                  <p>&#9888; 未提供出生時間，以午時（12:00）預設。八字時柱、上升星座等可能有偏差。</p>
                )}
                {result.is_fallback && (
                  <p>&#9888; 此為速算結果（精確度約 95%），完整精確排盤請查看付費報告</p>
                )}
              </div>
            )}

            {/* ═══ 傳統四柱排盤 ═══ */}
            <div className="glass rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">八字排盤</h2>
                <span className="text-xs text-text-muted ml-2">（傳統四柱格式）</span>
              </div>

              {/* 四柱主體 — 桌面從右到左，手機從上到下 */}
              <div className="hidden md:block overflow-x-auto">
                <div className="flex flex-row-reverse justify-center gap-3 min-w-[520px]">
                  {derivedData.pillarDetails.map((p) => (
                    <div key={p.col} className={`flex-1 max-w-[140px] rounded-xl p-4 text-center transition-all ${
                      p.isDay ? 'border-2 border-gold/40 bg-gold/[0.06]' : 'glass'
                    }`}>
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

              {/* 手機版 — 從上到下 */}
              <div className="md:hidden space-y-3">
                {derivedData.pillarDetails.map((p) => (
                  <div key={p.col} className={`rounded-xl p-4 transition-all ${
                    p.isDay ? 'border-2 border-gold/40 bg-gold/[0.06]' : 'glass'
                  }`}>
                    <div className="flex items-center gap-4">
                      {/* 柱名+十神 */}
                      <div className="w-16 text-center shrink-0">
                        <div className="text-xs text-text-muted">{p.label}</div>
                        <div className={`text-xs font-semibold ${p.isDay ? 'text-gold' : 'text-gold/70'}`}>{p.shishen}</div>
                      </div>
                      {/* 天干地支 */}
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <div className="text-2xl font-bold" style={{ color: WX_COLORS[p.tgWx] }}>{p.tg}</div>
                          <div className="text-[10px]" style={{ color: WX_COLORS[p.tgWx] }}>{p.tgWx}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold" style={{ color: WX_COLORS[p.dzWx] }}>{p.dz}</div>
                          <div className="text-[10px]" style={{ color: WX_COLORS[p.dzWx] }}>{p.dzWx}</div>
                        </div>
                      </div>
                      {/* 藏干 */}
                      <div className="flex-1 text-right">
                        <div className="text-[10px] text-text-muted/60">
                          藏干：{p.canggan.map((cg, i) => (
                            <span key={i} className="inline-block mx-0.5">
                              <span style={{ color: WX_COLORS[WX_TG[cg]] }}>{cg}</span>
                              <span className="text-gold/40">({p.cangganShishen[i]})</span>
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-text-muted/30 mt-0.5">{p.nayin}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 命盤概要 */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {l:'日主',v:`${result.day_master}（${result.day_master_wuxing}）`, highlight: true},
                  {l:'身強弱',v:result.strength}, {l:'格局',v:result.geju},
                  {l:'用神',v:result.yongshen, gold:true}, {l:'喜神',v:result.xishen, gold:true},
                  {l:'生肖',v:result.shengxiao?`${result.shengxiao}（${result.pillars.year}）`:result.pillars.year},
                ].map(({l,v,gold,highlight})=>(
                  <div key={l} className={`rounded-lg p-3 ${highlight ? 'bg-gold/10 border border-gold/20' : 'glass'}`}>
                    <div className="text-[10px] text-text-muted">{l}</div>
                    <div className={`text-sm font-semibold mt-0.5 ${gold?'text-gold':highlight?'text-gold':'text-white'}`}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ 地支關係 ═══ */}
            {derivedData.dzRelations.length > 0 && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-purple-accent rounded-full" />
                  <h2 className="text-lg font-bold text-white">地支關係</h2>
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

            {/* ═══ 五行能量分佈（圓餅圖 + 進度條） ═══ */}
            <div className="glass rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">五行能量分佈</h2>
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
                              <span className="w-8 text-base font-bold" style={{color:WX_COLORS[elem]}}>{elem}</span>
                              <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full rounded-full flex items-center pl-3 transition-all duration-700" style={{width:`${Math.max(pct,5)}%`,background:WX_COLORS[elem]}}>
                                  <span className="text-[10px] font-bold text-white">{typeof val==='number'&&val%1!==0?val.toFixed(1):val}</span>
                                </div>
                              </div>
                              <span className="w-12 text-right text-sm text-text-muted">{pct}%</span>
                              {val===0&&<span className="text-xs text-red-400 font-semibold">缺</span>}
                              {elem === strongest && val > 0 && <span className="text-xs text-gold font-semibold">旺</span>}
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
            <div className="glass rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">大運走勢</h2>
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
            <div className="glass rounded-2xl p-8">
              <div className="text-center mb-6">
                <div className="inline-block px-4 py-1.5 rounded-full bg-gold/20 text-gold text-sm font-semibold mb-3">
                  {form.name} 的命格密碼
                </div>
                <h2 className="text-2xl font-bold text-white">您是「{result.profile.title}」型人格</h2>
              </div>
              <p className="text-base text-text leading-[1.9] mb-6">{result.profile.personality}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
                  <h4 className="text-sm font-bold text-green-400 mb-2">&#10003; 您的天生優勢</h4>
                  <p className="text-sm text-text leading-relaxed">{result.profile.strengths}</p>
                </div>
                <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-5">
                  <h4 className="text-sm font-bold text-orange-400 mb-2">&#9888; 需要留意的地方</h4>
                  <p className="text-sm text-text leading-relaxed">{result.profile.challenges}</p>
                </div>
              </div>
            </div>

            {/* ═══ 六大維度分析 ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title:'事業方向', text:result.profile.career, icon:'&#128188;', color:'border-blue-500/20 bg-blue-500/5' },
                { title:'感情特質', text:result.profile.love, icon:'&#10084;&#65039;', color:'border-pink-500/20 bg-pink-500/5' },
                { title:'健康提醒', text:result.profile.health, icon:'&#127973;', color:'border-green-500/20 bg-green-500/5' },
                { title:'2026年運勢', text:result.profile.year2026, icon:'&#9733;', color:'border-yellow-500/20 bg-yellow-500/5' },
              ].map(item=>(
                <div key={item.title} className={`rounded-xl border p-5 ${item.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg" dangerouslySetInnerHTML={{__html:item.icon}} />
                    <h4 className="text-base font-bold text-white">{item.title}</h4>
                  </div>
                  <p className="text-sm text-text leading-[1.8]">{item.text}</p>
                </div>
              ))}
            </div>

            {/* ═══ 幸運元素 ═══ */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-base font-bold text-gold mb-3">&#128161; 您的開運指南</h3>
              <p className="text-base text-text leading-[1.8]">{result.profile.lucky}</p>
            </div>

            {/* ═══ 太陽星座 ═══ */}
            {result.sun_sign && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-purple-500 rounded-full" />
                  <h2 className="text-lg font-bold text-cream">西洋占星：{result.sun_sign.name}</h2>
                  <span className="text-xs text-purple-400/70">{result.sun_sign.element}</span>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.sun_sign.trait}</p>
                <p className="text-sm text-text-muted italic mt-3">完整星盤需要精確出生時間和地點，包含月亮星座、上升星座、行星相位等深度分析...</p>
              </div>
            )}

            {/* ═══ 生命靈數 ═══ */}
            {result.life_path && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-cyan-500 rounded-full" />
                  <h2 className="text-lg font-bold text-cream">生命靈數：{result.life_path.number} 號 — {result.life_path.title}</h2>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.life_path.desc}</p>
              </div>
            )}

            {/* ═══ 生肖詳細年運 ═══ */}
            {result.shengxiao_fortune && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-red-accent rounded-full" />
                  <h2 className="text-lg font-bold text-cream">屬{result.shengxiao} — 2026 丙午年運勢</h2>
                </div>
                <p className="text-base text-text leading-[1.9]">{result.shengxiao_fortune}</p>
              </div>
            )}

            {/* ═══ 深度分析 ═══ */}
            {result.has_ai && (
              <>
                {result.ai_sections['性格深度剖析'] && (
                  <div className="glass rounded-2xl p-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-6 bg-purple-500 rounded-full" />
                      <h2 className="text-lg font-bold text-cream">性格深度剖析</h2>
                    </div>
                    <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['性格深度剖析']}</p>
                  </div>
                )}

                {result.ai_sections['財運方向'] && (
                  <div className="glass rounded-2xl p-8 border-l-2 border-green-500/30">
                    <h2 className="text-lg font-bold text-cream mb-4">財運方向</h2>
                    <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['財運方向']}</p>
                  </div>
                )}

                {result.ai_sections['人際與貴人'] && (
                  <div className="glass rounded-2xl p-8 border-l-2 border-cyan-500/30">
                    <h2 className="text-lg font-bold text-cream mb-4">人際與貴人</h2>
                    <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['人際與貴人']}</p>
                  </div>
                )}

                {result.ai_sections['未來機會窗口'] && (
                  <div className="rounded-2xl p-8 border border-gold/20" style={{background:'linear-gradient(135deg, rgba(197,150,58,0.06), rgba(15,22,40,0.3))'}}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-6 bg-gold rounded-full" />
                      <h2 className="text-lg font-bold text-gradient-gold">未來機會窗口</h2>
                    </div>
                    <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['未來機會窗口']}</p>
                    <p className="text-sm text-gold/50 mt-4 italic">完整報告包含逐年大運走勢分析、未來機會窗口解讀、具體的行動方案與時機建議...</p>
                  </div>
                )}

                {result.ai_sections['需要留意的地方'] && (
                  <div className="glass rounded-2xl p-8 border-l-2 border-orange-500/30">
                    <h2 className="text-lg font-bold text-orange-300/80 mb-4">需要留意的地方</h2>
                    <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_sections['需要留意的地方']}</p>
                    <p className="text-sm text-orange-400/50 mt-4 italic">完整報告包含具體的調整方案與行動建議...</p>
                  </div>
                )}
              </>
            )}

            {/* 速算提示 */}
            <p className="text-center text-xs text-text-muted/50 leading-relaxed">
              以上為日主速算概覽，完整報告將根據您的完整命盤做 15 系統個人化深度分析
            </p>

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
                    橫跨 15 套東西方命理體系，為您呈現一份前所未有的命格全景報告。
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128218;</div>
                    <h4 className="font-bold text-white mb-1">千年古籍精髓</h4>
                    <p className="text-sm text-text-muted">融合數十部命理經典核心理論，數萬條專業規則</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#129302;</div>
                    <h4 className="font-bold text-white mb-1">科技量化深度解讀</h4>
                    <p className="text-sm text-text-muted">AI 深度引擎逐句分析，每段結論精準到您個人命盤</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#127760;</div>
                    <h4 className="font-bold text-white mb-1">15 系統交叉驗證</h4>
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
                      <a href="/checkout?plan=E1" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        事件出門訣 $119
                      </a>
                      <a href="/checkout?plan=E2" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        月盤出門訣 $89
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center gap-4 text-xs text-text-muted/60 mb-4">
                    <span>&#128274; Stripe 安全支付</span>
                    <span>&#9889; 約30-60分鐘出報告</span>
                    <span>&#128230; PDF 永久保存</span>
                  </div>
                  <p className="text-xs text-text-muted/50">
                    還沒準備好？{' '}
                    <a href="/auth/signup" className="text-gold hover:underline">免費註冊帳號</a>
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
