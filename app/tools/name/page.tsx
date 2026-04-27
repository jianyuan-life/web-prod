'use client'

import { useState } from 'react'
import Link from 'next/link'
import { searchCities, searchLocations, type LocationSearchResult } from '@/lib/cities'
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

const WX_COLORS: Record<string, string> = { '木': '#22c55e', '火': '#ef4444', '土': '#eab308', '金': '#f59e0b', '水': '#3b82f6' }

// ── 三才配置吉凶對照（簡化版 125 組合）──
const SANCAI_JIXIONG: Record<string, { level: string; desc: string }> = {
  // 吉配
  '木木木': { level: '大吉', desc: '發展穩定、根基紮實，人緣佳，但個性固執' },
  '木火土': { level: '大吉', desc: '五行相生，一生平順，貴人多助' },
  '火土金': { level: '大吉', desc: '人緣好、家庭美滿，事業穩定發展' },
  '土金水': { level: '大吉', desc: '智慧兼具財運，晚年享福' },
  '金水木': { level: '大吉', desc: '聰明機智、善於理財' },
  '水木火': { level: '大吉', desc: '文采兼具領導力，中年後大發' },
  '木木火': { level: '大吉', desc: '創意豐富、有貴人提攜' },
  '火火土': { level: '吉', desc: '熱情積極、但需注意脾氣' },
  '土土金': { level: '吉', desc: '踏實穩重、財運漸長' },
  // 凶配
  '木土金': { level: '凶', desc: '易有病痛、家庭關係緊張' },
  '火水土': { level: '凶', desc: '情緒起伏大、人際易生衝突' },
  '金木火': { level: '凶', desc: '事業多阻、健康需留意' },
  '水火金': { level: '凶帶吉', desc: '有才華但路途多波折，中年後改善' },
  '土木水': { level: '凶', desc: '家人緣薄、事業難成' },
}
function getSancaiJixiong(config: string): { level: string; desc: string } {
  return SANCAI_JIXIONG[config] || { level: '中平', desc: '三才配置中等，關鍵看個人努力與心性修養' }
}

// ── 生肖喜忌字根（簡化版，主要生肖部首）──
const SHENGXIAO_PREFER: Record<string, { likes: string[]; dislikes: string[]; note: string }> = {
  '鼠': { likes: ['米', '豆', '禾', '艸', '宀', '口', '王', '令', '冠'], dislikes: ['午', '馬', '火', '光', '灬', '羊', '未', '兔', '卯'], note: '鼠喜夜行、住洞穴、吃五穀；忌午沖、忌見光、忌遇羊' },
  '牛': { likes: ['艸', '米', '豆', '禾', '水', '氵', '辶', '車'], dislikes: ['心', '忄', '肉', '日', '午', '馬', '羊', '未'], note: '牛喜食草、勞動，忌鞭策、忌見強者' },
  '虎': { likes: ['山', '林', '木', '玉', '王', '君', '大', '冠'], dislikes: ['日', '光', '申', '猴', '袁', '蛇', '虫', '人'], note: '虎喜山林稱王，忌被束縛、忌與猴蛇為伍' },
  '兔': { likes: ['艸', '木', '禾', '豆', '月', '宀', '衣'], dislikes: ['日', '光', '辰', '龍', '酉', '雞'], note: '兔喜月夜、安居，忌日光、忌與龍雞相沖' },
  '龍': { likes: ['水', '氵', '雨', '雲', '日', '月', '星', '王', '帝', '君'], dislikes: ['戌', '狗', '犬', '田', '虫', '小', '牛'], note: '龍喜升天、霖雨，忌受困、忌遇狗' },
  '蛇': { likes: ['口', '宀', '木', '虫', '衣', '彩', '糸'], dislikes: ['亥', '豬', '人', '辶', '寅', '虎', '日', '火'], note: '蛇喜洞穴、隱密，忌見強光、忌遇虎豬' },
  '馬': { likes: ['艸', '禾', '豆', '木', '巾', '系', '衣'], dislikes: ['子', '鼠', '米', '田', '牛', '丑', '水'], note: '馬喜馳騁、華美，忌午沖、忌田園束縛' },
  '羊': { likes: ['艸', '豆', '禾', '木', '米', '几', '門'], dislikes: ['心', '忄', '肉', '丑', '牛', '辰', '龍', '大'], note: '羊喜青草、小巧，忌肉食、忌做大' },
  '猴': { likes: ['木', '禾', '豆', '人', '山', '王', '君'], dislikes: ['虎', '寅', '豕', '亥', '豬', '金', '申'], note: '猴喜攀爬、靈活，忌金銀累身、忌遇虎豬' },
  '雞': { likes: ['米', '豆', '禾', '虫', '宀', '小', '巾', '彩'], dislikes: ['犬', '戌', '狗', '酉', '金', '刀'], note: '雞喜啄食、華彩，忌遇犬、忌剪伐' },
  '狗': { likes: ['人', '心', '忄', '肉', '月', '王', '令', '宀'], dislikes: ['日', '光', '雞', '酉', '羊', '未', '金', '辰'], note: '狗喜主人、忠誠，忌食素、忌遇龍雞' },
  '豬': { likes: ['豆', '禾', '米', '艸', '木', '田', '人', '宀'], dislikes: ['蛇', '巳', '刀', '刂', '日', '文', '彩'], note: '豬喜田園、充實，忌遇蛇、忌修飾' },
}

function getShengxiao(year: number): string {
  const sxList = ['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','雞','狗','豬']
  return sxList[((year - 4) % 12 + 12) % 12]
}

// ── 音律五行分類（簡化：根據拼音聲母分類）──
// 實際姓名學音韻派涵蓋「宮商角徵羽」五音
function getMusicWuxing(char: string): string {
  // 簡化：根據字母（不可能用中文拼音算）— 改用部首近似
  // 這裡用一個精簡的映射表
  const MUSIC_MAP: Record<string, string> = {
    // 常見姓氏字
    '王': '木', '李': '木', '陳': '金', '林': '木', '黃': '土', '張': '火', '劉': '火', '楊': '木', '吳': '木', '何': '水',
    '趙': '火', '孫': '金', '周': '金', '徐': '金', '朱': '金', '高': '木', '郭': '木', '馬': '水', '胡': '水', '羅': '火',
    '許': '木', '蔣': '木', '謝': '金', '鄭': '火', '韓': '水', '唐': '火', '馮': '水', '于': '土', '董': '火', '蕭': '金',
    '蘇': '金', '曹': '金', '呂': '火', '丁': '火', '潘': '水', '傅': '水', '阮': '木', '翁': '土', '歐': '土',
    '梁': '火', '任': '金', '袁': '土', '沈': '水', '崔': '金', '彭': '水',
  }
  return MUSIC_MAP[char] || ''
}

// 分析步驟動畫
const ANALYSIS_STEPS = [
  { text: '拆解姓名筆畫...', icon: '&#9998;', duration: 600 },
  { text: '計算天格數理...', icon: '&#9737;', duration: 500 },
  { text: '計算人格數理...', icon: '&#9678;', duration: 500 },
  { text: '計算地格數理...', icon: '&#9672;', duration: 500 },
  { text: '計算外格數理...', icon: '&#9734;', duration: 500 },
  { text: '計算總格數理...', icon: '&#9733;', duration: 500 },
  { text: '推算三才配置...', icon: '&#9776;', duration: 600 },
  { text: '判定五行生剋...', icon: '&#10024;', duration: 700 },
  { text: '啟動深度解讀引擎...', icon: '&#129302;', duration: 800 },
  { text: '生成姓名分析報告...', icon: '&#128221;', duration: 1000 },
]

type GeResult = {
  value: number
  wuxing: string
  level: string
  desc: string
}

type NameResult = {
  fullName: string
  surname: string
  givenName: string
  surnameStrokes: number[]
  givenStrokes: number[]
  tiange: GeResult
  renge: GeResult
  dige: GeResult
  waige: GeResult
  zongge: GeResult
  sancai: { tian: string; ren: string; di: string; config: string }
  totalScore: number
  aiAnalysis: string
  hasAi: boolean
}

const LEVEL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  '大吉': { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  '吉': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  '凶帶吉': { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  '凶': { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
}

export default function NameToolPage() {
  const [form, setForm] = useState({
    surname: '', givenName: '', gender: 'M',
    year: '1990', month: '1', day: '1',
    hour: '12',
    timeMode: 'unknown' as 'unknown' | 'shichen' | 'exact',
    exactHour: '12', exactMinute: '0',
    city: '', cityLat: 0, cityLng: 0, cityTz: 8,
  })
  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')
  const [result, setResult] = useState<NameResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // 從家人選擇後自動填入表單
  const handleFamilySelect = (member: SavedFamilyMember) => {
    // 嘗試拆分姓名：第一個字為姓，其餘為名
    const fullName = member.name || ''
    const surname = fullName.length > 0 ? fullName[0] : ''
    const givenName = fullName.length > 1 ? fullName.slice(1) : ''
    const hourVal = member.time_mode === 'exact' ? String(member.hour) : String(Math.floor(member.hour / 2) * 2)
    setForm({
      ...form,
      surname,
      givenName,
      gender: member.gender,
      year: String(member.year),
      month: String(member.month),
      day: String(member.day),
      hour: hourVal,
      timeMode: member.time_mode as 'unknown' | 'shichen' | 'exact',
      exactHour: String(member.hour),
      exactMinute: String(member.minute),
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
    if (!form.surname.trim() || !form.givenName.trim()) { setError('請輸入姓和名'); return }
    if (!form.city.trim() || form.cityLat === 0) { setError('請選擇出生地區'); return }
    setLoading(true); setError(''); setResult(null)
    setCurrentStep(0); setCompletedSteps([])

    let stepIdx = 0
    const stepInterval = setInterval(() => {
      if (stepIdx < ANALYSIS_STEPS.length) {
        setCompletedSteps(prev => [...prev, stepIdx])
        stepIdx++
        setCurrentStep(stepIdx)
      }
    }, ANALYSIS_STEPS[Math.min(stepIdx, ANALYSIS_STEPS.length - 1)]?.duration || 600)

    try {
      const res = await fetch('/api/free-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: form.surname, givenName: form.givenName,
          gender: form.gender,
          year: parseInt(form.year), month: parseInt(form.month), day: parseInt(form.day),
          hour: form.timeMode === 'exact' ? parseInt(form.exactHour) : form.timeMode === 'shichen' ? parseInt(form.hour) : 12,
          minute: form.timeMode === 'exact' ? parseInt(form.exactMinute) : 0,
          time_unknown: form.timeMode === 'unknown',
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
      setResult(await res.json())
    } catch (err: unknown) {
      clearInterval(stepInterval)
      setError(err instanceof Error ? err.message : '分析失敗')
    } finally { setLoading(false) }
  }

  // 評分環形圖
  const ScoreRing = ({ score }: { score: number }) => {
    const r = 54, c = 2 * Math.PI * r
    const offset = c - (score / 100) * c
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'
    return (
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" className="transition-all duration-1000" />
        <text x="70" y="64" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">{score}</text>
        <text x="70" y="84" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="12">/ 100</text>
      </svg>
    )
  }

  return (
    <div className="py-12 md:py-20 overflow-x-hidden max-w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <div className="text-center mb-10 md:mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/25 text-gold/90 text-[11px] sm:text-xs font-semibold tracking-[0.25em] uppercase mb-5">
            <span className="text-[10px]">&#10022;</span>
            <span>XingMing &middot; 康熙筆畫</span>
            <span className="text-[10px]">&#10022;</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-center mb-4 break-words tracking-tight leading-[1.1]">
            <span className="text-gradient-gold">姓名學速算</span>
          </h1>
          <p className="text-center text-sm sm:text-base text-text tracking-[0.02em] mb-2">
            五格剖象法 <span className="text-gold/50 mx-1">&middot;</span> 三才配置 <span className="text-gold/50 mx-1">&middot;</span> 數理吉凶分析
          </p>
          <p className="text-center text-xs text-text-muted/60 tracking-wider">
            不需註冊 &middot; 即時出結果 &middot; 完全免費
          </p>
        </div>

        {/* 姓名學由來與說明 */}
        <div className="max-w-2xl mx-auto mb-10">
          <details className="glass rounded-xl p-4 cursor-pointer">
            <summary className="text-sm font-medium text-gold-400 flex items-center gap-2">
              <span>&#128218;</span> 關於姓名學：為什麼用康熙字典筆畫？
            </summary>
            <div className="mt-3 text-xs text-text-muted/80 space-y-2 leading-relaxed">
              <p><strong className="text-white/90">姓名學的由來：</strong>五格剖象法由日本學者熊崎健翁於 1918 年創立，後傳入華人世界並與中國傳統數理、五行學說結合，成為目前最廣泛使用的姓名分析方法。透過姓名的筆畫數，計算出天格、人格、地格、外格、總格五格數理，搭配八十一靈動數與三才配置，推算姓名的吉凶能量。</p>
              <p><strong className="text-white/90">為什麼必須用繁體字（康熙字典）計算？</strong>姓名學的數理基礎建立在《康熙字典》的筆畫標準之上，而非現代簡化字。康熙字典成書於 1716 年，是中國歷史上最權威的字典，其筆畫系統基於 214 個部首的完整字形。簡化字改變了許多字的筆畫數（例如「張」簡體7畫、繁體11畫；「陳」簡體7畫、繁體16畫），若用簡體計算將導致五格數理完全錯誤。</p>
              <p><strong className="text-white/90">鑒源的做法：</strong>本系統採用 Unicode 官方 Unihan 數據庫（涵蓋 102,998 個漢字），以 214 個康熙部首的標準筆畫為基礎計算。無論您輸入繁體或簡體，系統都會自動轉換為繁體字後再進行筆畫查詢，確保結果準確無誤。</p>
            </div>
          </details>
        </div>

        {/* 分析進度動畫 */}
        {loading && !result && (
          <div className="max-w-lg mx-auto">
            <div className="glass rounded-2xl p-8">
              <h3 className="text-2xl md:text-3xl font-black text-cream tracking-tight mb-6 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
                正在分析「<span className="text-gold">{form.surname}{form.givenName}</span>」的姓名能量
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
                <p className="text-center text-gold mt-6 animate-pulse text-sm">分析完畢，正在載入...</p>
              )}
            </div>
          </div>
        )}

        {/* 表單 */}
        {!result && !loading && (
          <div className="max-w-lg mx-auto">
            <form onSubmit={handleSubmit} className="glass rounded-2xl px-6 py-8 md:p-10 space-y-6">
              {/* 從家人選擇 */}
              <FamilyMemberPicker onSelect={handleFamilySelect} />

              {/* 姓 + 名 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">姓氏 <span className="text-red-accent">*</span></label>
                  <input type="text" required placeholder="例：王" value={form.surname}
                    onChange={(e) => setForm({ ...form, surname: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">名字 <span className="text-red-accent">*</span></label>
                  <input type="text" required placeholder="例：大明" value={form.givenName}
                    onChange={(e) => setForm({ ...form, givenName: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
              </div>

              {/* 性別 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">性別</label>
                <div className="flex gap-6">
                  {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="gender" value={v} checked={form.gender === v} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="accent-gold" />
                      <span className="text-base text-text">{l}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 出生日期 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">出生日期</label>
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" min="1920" max="2025" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" placeholder="年" />
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
                  </select>
                  <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
                  </select>
                </div>
              </div>

              {/* 出生時間 — 三選一 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">出生時間</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10 mb-3">
                  {[
                    { v: 'unknown' as const, l: '不確定' },
                    { v: 'shichen' as const, l: '知道時辰' },
                    { v: 'exact' as const, l: '知道精確時間' },
                  ].map(({ v, l }) => (
                    <button key={v} type="button"
                      onClick={() => setForm({ ...form, timeMode: v })}
                      className={`flex-1 py-2.5 text-xs font-medium transition-all ${form.timeMode === v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.timeMode === 'unknown' && (
                  <p className="text-xs text-text-muted/70 leading-relaxed">
                    姓名學五格數理不受時辰影響，但命格補救建議需要完整八字。
                    <span className="text-gold/70"> 建議提供出生時間以獲得更精準的用神分析。</span>
                  </p>
                )}
                {form.timeMode === 'shichen' && (
                  <select value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {SHICHEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
                {form.timeMode === 'exact' && (
                  <div className="grid grid-cols-2 gap-3">
                    <select value={form.exactHour} onChange={(e) => setForm({ ...form, exactHour: e.target.value })}
                      className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')} 時</option>)}
                    </select>
                    <select value={form.exactMinute} onChange={(e) => setForm({ ...form, exactMinute: e.target.value })}
                      className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                      {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')} 分</option>)}
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
                    setForm({ ...form, city: val })
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
                            setForm({ ...form, city: '' })
                            setCityResults([])
                          } else {
                            setForm({ ...form, city: r.country.name, cityLat: r.country.lat, cityLng: r.country.lng, cityTz: r.country.tz })
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
                          setForm({ ...form, city: `${r.city.name}（${r.city.country}）`, cityLat: r.city.lat, cityLng: r.city.lng, cityTz: r.city.tz })
                          setCityResults([])
                          setNeedCityForCountry('')
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors flex justify-between items-center">
                        <span className="text-sm text-cream">{r.city.name} <span className="text-text-muted">({r.city.country})</span></span>
                        <span className="text-[10px] text-text-muted/60">UTC{r.city.tz >= 0 ? '+' : ''}{r.city.tz}</span>
                      </button>
                    ))}
                  </div>
                )}
                {needCityForCountry && (
                  <button type="button" onClick={() => { setNeedCityForCountry(''); setForm({ ...form, city: '' }); setCityResults([]) }}
                    className="text-xs text-gold/60 hover:text-gold mt-1 underline">取消，重新選擇國家</button>
                )}
                {form.cityLat !== 0 && (
                  <p className="text-[10px] text-text-muted/50 mt-1">經度 {form.cityLng.toFixed(2)}° | 時區 UTC{form.cityTz >= 0 ? '+' : ''}{form.cityTz} | 將自動校正真太陽時</p>
                )}
              </div>

              <button type="submit" disabled={loading || !form.surname.trim() || !form.givenName.trim() || form.cityLat === 0}
                className={`w-full py-4 font-bold rounded-xl text-lg transition-all ${
                  form.surname.trim() && form.givenName.trim() && form.cityLat !== 0
                    ? 'bg-gold text-dark btn-glow disabled:opacity-50'
                    : 'bg-white/10 text-text-muted cursor-not-allowed'
                }`}>
                {!form.surname.trim() || !form.givenName.trim() || form.cityLat === 0 ? '請填寫完整資料' : '開始姓名分析'}
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            </form>

            {/* 說明 */}
            <div className="mt-6 glass rounded-xl p-5 text-sm text-text-muted leading-relaxed">
              <p className="font-semibold text-cream mb-2">什麼是五格剖象法？</p>
              <p>
                五格剖象法是日本熊崎健翁氏所創，根據姓名的康熙筆畫數計算天格、人格、地格、外格、總格五個數理，
                再配合三才（天、人、地）的五行生剋關係，推斷姓名對人生各方面的影響。
                其中<strong className="text-cream">人格</strong>反映內在性格，<strong className="text-cream">總格</strong>反映一生運勢。
              </p>
            </div>
          </div>
        )}

        {/* 結果 */}
        {result && (
          <div className="space-y-8">
            <div className="text-center">
              <button onClick={() => setResult(null)} className="text-sm text-gold hover:underline">&larr; 重新分析</button>
            </div>

            {/* 綜合評分 */}
            <div className="relative glass rounded-2xl p-8 md:p-10 overflow-hidden">
              {/* 金色裝飾光暈 */}
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-gold/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
              <div className="relative text-center mb-8">
                <div className="inline-block px-5 py-2 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs sm:text-sm font-semibold mb-4 tracking-wide">
                  姓名能量分析
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6 leading-tight">
                  「<span className="text-gradient-gold">{result.fullName}</span>」
                </h2>
                <div className="flex justify-center mb-5">
                  <ScoreRing score={result.totalScore} />
                </div>
                <div className="mx-auto my-4 h-px w-24 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
                <p className="text-sm text-text-muted/90 tracking-wide">
                  綜合評分<span className="mx-2 text-text-muted/40">&middot;</span>三才配置：
                  <span className="font-bold ml-1" style={{ color: WX_COLORS[result.sancai.tian] }}>{result.sancai.tian}</span>
                  <span className="font-bold" style={{ color: WX_COLORS[result.sancai.ren] }}>{result.sancai.ren}</span>
                  <span className="font-bold" style={{ color: WX_COLORS[result.sancai.di] }}>{result.sancai.di}</span>
                </p>
              </div>

              {/* 筆畫拆解 */}
              <div className="relative flex flex-wrap justify-center gap-3 sm:gap-4 mb-2">
                {[...result.surname].map((char, i) => (
                  <div key={`s-${i}`} className="text-center min-w-[3.5rem] rounded-xl px-3 py-3 bg-gold/5 border border-gold/15">
                    <div className="text-3xl sm:text-4xl font-extrabold text-gold mb-1 leading-none">{char}</div>
                    <div className="text-[11px] text-text-muted">{result.surnameStrokes[i]} 畫</div>
                  </div>
                ))}
                {[...result.givenName].map((char, i) => (
                  <div key={`g-${i}`} className="text-center min-w-[3.5rem] rounded-xl px-3 py-3 bg-white/3 border border-white/10">
                    <div className="text-3xl sm:text-4xl font-extrabold text-white mb-1 leading-none">{char}</div>
                    <div className="text-[11px] text-text-muted">{result.givenStrokes[i]} 畫</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 五格數理 */}
            <div className="glass rounded-2xl p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-7 bg-gradient-to-b from-gold to-gold/40 rounded-full" />
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">五格數理分析</h2>
                <span className="text-xs text-text-muted/50 ml-2">（康熙字典筆畫）</span>
              </div>
              <div className="space-y-4">
                {[
                  { name: '天格', data: result.tiange, desc: '先天運勢（由姓氏決定，不可改）' },
                  { name: '人格', data: result.renge, desc: '性格與人際（最重要的格數）' },
                  { name: '地格', data: result.dige, desc: '前運與基礎（36 歲前影響最大）' },
                  { name: '外格', data: result.waige, desc: '社交與外在助力' },
                  { name: '總格', data: result.zongge, desc: '後運與一生總結（36 歲後影響最大）' },
                ].map(({ name, data, desc }) => {
                  const lc = LEVEL_COLORS[data.level] || LEVEL_COLORS['凶']
                  return (
                    <div key={name} className={`rounded-xl border p-5 transition-all ${lc.border} ${lc.bg}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-white tracking-wide">{name}</span>
                          <span className="text-base font-semibold text-cream/70 tabular-nums">{data.value}</span>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ color: WX_COLORS[data.wuxing], background: `${WX_COLORS[data.wuxing]}22`, border: `1px solid ${WX_COLORS[data.wuxing]}55` }}>
                            {data.wuxing}
                          </span>
                        </div>
                        <span className={`text-sm font-bold px-3 py-1 rounded-full ${lc.text}`} style={{background:'rgba(255,255,255,0.05)'}}>{data.level}</span>
                      </div>
                      <p className="text-[11px] text-text-muted/70 mb-2 uppercase tracking-wider">{desc}</p>
                      <p className="text-sm md:text-[15px] text-text/90 leading-[1.85]">{data.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 三才配置（專業版：含 125 組合吉凶） */}
            {(() => {
              const sancaiJx = getSancaiJixiong(result.sancai.config)
              const sancaiLc = LEVEL_COLORS[sancaiJx.level] || { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' }
              return (
                <div className={`rounded-2xl p-6 md:p-8 border ${sancaiLc.border} ${sancaiLc.bg}`}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-7 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full" />
                    <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">三才配置</h2>
                    <span className={`ml-auto text-sm font-bold px-3 py-1 rounded-full ${sancaiLc.text}`} style={{background:'rgba(255,255,255,0.05)'}}>{sancaiJx.level}</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 md:gap-6 mb-5 flex-wrap">
                    {[
                      { label: '天格', wx: result.sancai.tian, sub: '父輩、長上' },
                      { label: '人格', wx: result.sancai.ren, sub: '性格、本我' },
                      { label: '地格', wx: result.sancai.di, sub: '妻兒、晚輩' },
                    ].map((item, i, arr) => (
                      <div key={i} className="flex items-center gap-3 md:gap-4">
                        <div className="text-center">
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                            style={{ borderColor: WX_COLORS[item.wx], background: `${WX_COLORS[item.wx]}18` }}>
                            <span className="text-2xl md:text-3xl font-extrabold" style={{ color: WX_COLORS[item.wx] }}>{item.wx}</span>
                          </div>
                          <div className="text-sm text-cream font-bold">{item.label}</div>
                          <div className="text-[10px] text-text-muted/70 mt-0.5">{item.sub}</div>
                        </div>
                        {i < arr.length - 1 && (
                          <div className="text-gold/30 text-2xl font-light">&rarr;</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-center px-4 py-3 rounded-xl bg-white/3 border border-white/5">
                    <p className="text-sm md:text-[15px] text-text leading-[1.85]">
                      <strong className="text-white text-base">「{result.sancai.config}」三才</strong>
                      <span className="mx-2 text-text-muted/40">—</span>
                      {sancaiJx.desc}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* 生肖喜忌字 */}
            {form.year && (() => {
              const shengxiao = getShengxiao(parseInt(form.year))
              const prefer = SHENGXIAO_PREFER[shengxiao]
              if (!prefer) return null
              // 檢查姓名中的字是否符合喜忌
              const nameChars = [...result.surname, ...result.givenName]
              const matchedLikes: string[] = []
              const matchedDislikes: string[] = []
              nameChars.forEach(c => {
                if (prefer.likes.some(lk => c.includes(lk))) matchedLikes.push(c)
                if (prefer.dislikes.some(dk => c.includes(dk))) matchedDislikes.push(c)
              })
              return (
                <div className="glass rounded-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-7 bg-gradient-to-b from-amber-300 to-amber-600/40 rounded-full" />
                    <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">生肖派：屬{shengxiao}姓名喜忌</h2>
                  </div>
                  <p className="text-sm text-text/80 leading-relaxed mb-4">
                    {prefer.note}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                      <h4 className="text-xs font-bold text-green-400 mb-2">&#10003; 喜用字根</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {prefer.likes.map((c, i) => (
                          <span key={i} className={`text-sm px-2 py-0.5 rounded ${matchedLikes.some(m => m.includes(c)) ? 'bg-green-500/30 text-green-300 font-bold' : 'bg-white/5 text-text-muted/80'}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                      {matchedLikes.length > 0 && (
                        <p className="text-[10px] text-green-400/80 mt-2">
                          您的姓名中「{matchedLikes.join('、')}」符合屬{shengxiao}喜用字根
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                      <h4 className="text-xs font-bold text-red-400 mb-2">&#9888; 忌避字根</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {prefer.dislikes.map((c, i) => (
                          <span key={i} className={`text-sm px-2 py-0.5 rounded ${matchedDislikes.some(m => m.includes(c)) ? 'bg-red-500/30 text-red-300 font-bold' : 'bg-white/5 text-text-muted/80'}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                      {matchedDislikes.length > 0 && (
                        <p className="text-[10px] text-red-400/80 mt-2">
                          您的姓名中「{matchedDislikes.join('、')}」為屬{shengxiao}忌避字根
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 補救建議（基於凶格數量） */}
            {(() => {
              const allGe = [result.tiange, result.renge, result.dige, result.waige, result.zongge]
              const xiongCount = allGe.filter(g => g.level === '凶' || g.level === '凶帶吉').length
              if (xiongCount === 0) return null
              const suggestions: string[] = []
              if (result.renge.level === '凶') suggestions.push('人格為凶，建議佩戴五行相合的飾品（如水晶、玉石）化解')
              if (result.zongge.level === '凶') suggestions.push('總格為凶，影響後半生運勢，可考慮書畫署名改用其他字輔助')
              if (result.dige.level === '凶') suggestions.push('地格為凶，前運較多波折，建議用學業專業補強')
              const sancaiJx2 = getSancaiJixiong(result.sancai.config)
              if (sancaiJx2.level === '凶' || sancaiJx2.level === '凶帶吉') {
                suggestions.push(`三才「${result.sancai.config}」不和，建議透過八字喜用神來調節日常行為與方位`)
              }
              if (suggestions.length === 0) return null
              return (
                <div className="glass rounded-2xl p-6 border border-orange-500/20 bg-orange-500/[0.03]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-7 bg-gradient-to-b from-orange-400 to-orange-600/40 rounded-full" />
                    <h2 className="text-2xl md:text-3xl font-black text-cream tracking-tight">補救建議</h2>
                  </div>
                  <p className="text-xs text-text-muted mb-3">
                    命中五格有 {xiongCount} 項需留意的地方。姓名只是命格補救的一部分，真正化解需配合完整八字用神。
                  </p>
                  <ul className="space-y-2">
                    {suggestions.map((s, i) => (
                      <li key={i} className="text-sm text-text/80 flex items-start gap-2">
                        <span className="text-orange-400 mt-0.5">&bull;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })()}

            {/* AI 深度解讀 */}
            {result.hasAi && result.aiAnalysis && (
              <AIAnalysisCard text={result.aiAnalysis} title="姓名深度解讀" accentColor="amber" />
            )}

            {/* 速算提示 */}
            <p className="text-center text-xs text-text-muted/50 leading-relaxed">
              以上為姓名速算概覽，完整報告將根據您的完整命盤做 14 系統個人化深度分析
            </p>

            {/* v5.4.17 P0 freemium paywall */}
            <FreemiumPaywall systemName="姓名" />

            {/* 升級引導 */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(26,58,92,0.4))' }}>
              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    姓名學只是 14 套系統中的 <span className="text-gradient-gold">1 套</span>
                  </h3>
                  <p className="text-base text-text max-w-2xl mx-auto leading-relaxed">
                    姓名是先天命格的一部分，但真正影響人生的還有<strong className="text-white">八字、紫微斗數、奇門遁甲</strong>等。
                    完整報告融合 14 套東西方命理體系，多維度交叉驗證，給您最全面的命格分析。
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
                    {(['C', 'D'] as const).map((plan, idx) => {
                      const q = new URLSearchParams({
                        plan,
                        name: form.surname + form.givenName,
                        year: form.year,
                        month: form.month,
                        day: form.day,
                        hour: form.timeMode === 'exact' ? form.exactHour : form.hour,
                        minute: form.timeMode === 'exact' ? form.exactMinute : '0',
                        gender: form.gender,
                        timeMode: form.timeMode,
                      })
                      const label = idx === 0 ? '解鎖人生藍圖完整報告 $89' : '聚焦單一困惑深度分析 $39'
                      const cls = idx === 0
                        ? 'px-10 py-4 bg-gold text-dark font-bold rounded-xl text-lg btn-glow'
                        : 'px-10 py-4 glass text-white font-semibold rounded-xl text-lg hover:bg-white/10'
                      return <a key={plan} href={`/checkout?${q}`} className={cls}>{label}</a>
                    })}
                  </div>

                  {/* v5.4.4 Item 1 批次 5:出門訣 cross-sell(對齊全 4 頁 free tools) */}
                  <div className="glass rounded-xl p-5 max-w-md mx-auto mb-4">
                    <p className="text-sm text-cream mb-2 font-semibold">想知道什麼時候出門最順利?</p>
                    <p className="text-xs text-text-muted mb-3">奇門遁甲出門訣 — 精準計算吉時吉方、讓每次出門都事半功倍</p>
                    <div className="flex gap-2 justify-center">
                      <Link href="/checkout?plan=E1" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        事件出門訣 $59
                      </Link>
                      <Link href="/checkout?plan=E2" className="px-4 py-2 text-xs bg-gold/15 text-gold rounded-lg hover:bg-gold/25 transition-all border border-gold/20">
                        月度出門訣 $29
                      </Link>
                    </div>
                  </div>

                  {/* v5.4.7 P3 social proof */}
                  <p className="text-xs text-text-muted/70 mb-3">
                    已有 <LiveCounter type="paid" /> 份完整付費報告完成交付
                  </p>

                  <div className="flex flex-wrap justify-center gap-4 text-xs text-text-muted/60">
                    <span>&#128274; Stripe 安全支付</span>
                    <span>&#9889; 約 30-60 分鐘出報告</span>
                    <span>&#128230; PDF 永久保存</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
