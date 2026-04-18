'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import AIAnalysisCard from '@/components/AIAnalysisCard'

// ── 十二時辰 ──
const SHICHEN = [
  { label: '子時 (23:00-01:00)', value: 0 }, { label: '丑時 (01:00-03:00)', value: 2 },
  { label: '寅時 (03:00-05:00)', value: 4 }, { label: '卯時 (05:00-07:00)', value: 6 },
  { label: '辰時 (07:00-09:00)', value: 8 }, { label: '巳時 (09:00-11:00)', value: 10 },
  { label: '午時 (11:00-13:00)', value: 12 }, { label: '未時 (13:00-15:00)', value: 14 },
  { label: '申時 (15:00-17:00)', value: 16 }, { label: '酉時 (17:00-19:00)', value: 18 },
  { label: '戌時 (19:00-21:00)', value: 20 }, { label: '亥時 (21:00-23:00)', value: 22 },
]

// ── 九宮洛書排列（4-9-2 / 3-5-7 / 8-1-6）──
const LUOSHU_ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6]

// ── 宮位名稱 ──
const PALACE_NAMES: Record<number, { name: string; direction: string }> = {
  1: { name: '坎一宮', direction: '北' },
  2: { name: '坤二宮', direction: '西南' },
  3: { name: '震三宮', direction: '東' },
  4: { name: '巽四宮', direction: '東南' },
  5: { name: '中五宮', direction: '中' },
  6: { name: '乾六宮', direction: '西北' },
  7: { name: '兌七宮', direction: '西' },
  8: { name: '艮八宮', direction: '東北' },
  9: { name: '離九宮', direction: '南' },
}

// ── 八門吉凶配色（精簡：吉/中/凶三級，避免色雜）──
const BAMEN_COLORS: Record<string, { dot: string; text: string; ring: string; level: string }> = {
  '開門': { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/40', level: '大吉' },
  '休門': { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/40', level: '大吉' },
  '生門': { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/40', level: '大吉' },
  '景門': { dot: 'bg-slate-400', text: 'text-slate-300', ring: 'ring-slate-400/30', level: '中平' },
  '杜門': { dot: 'bg-slate-400', text: 'text-slate-300', ring: 'ring-slate-400/30', level: '中平' },
  '傷門': { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-400/30', level: '凶' },
  '驚門': { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-400/30', level: '凶' },
  '死門': { dot: 'bg-red-500', text: 'text-red-300', ring: 'ring-red-500/40', level: '大凶' },
}

// ── 九星配色（統一為中性暖金調，不再五花八門）──
const JIUXING_COLORS: Record<string, string> = {
  '天蓬': 'text-slate-300',
  '天芮': 'text-slate-300',
  '天衝': 'text-slate-300',
  '天輔': 'text-slate-300',
  '天禽': 'text-slate-300',
  '天心': 'text-slate-300',
  '天柱': 'text-slate-300',
  '天任': 'text-slate-300',
  '天英': 'text-slate-300',
}

// ── 八神配色（統一淡金調）──
const BASHEN_COLORS: Record<string, string> = {
  '值符': 'text-amber-300',
  '螣蛇': 'text-slate-400',
  '太陰': 'text-slate-400',
  '六合': 'text-slate-400',
  '白虎': 'text-slate-400',
  '玄武': 'text-slate-400',
  '九地': 'text-slate-400',
  '九天': 'text-slate-400',
}

// ── 格局標籤配色（簡化：吉=金、凶=紅、其他=灰；不再用紫色）──
function getGejuStyle(geju: string): { bg: string; text: string; border: string; isKi: boolean } {
  const xiongKeywords = ['入墓', '反吟', '伏吟', '擊刑', '大格', '飛宮', '跌穴', '門迫', '刑', '凶']
  if (xiongKeywords.some(k => geju.includes(k))) {
    return { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30', isKi: false }
  }
  return { bg: 'bg-gold/10', text: 'text-gold-light', border: 'border-gold/30', isKi: true }
}

// ── 八門完整對照（不在 API 時 fallback 用）──
const BAMEN_ALL = ['休門', '生門', '傷門', '杜門', '景門', '死門', '驚門', '開門']
const JIUXING_ALL = ['天蓬', '天芮', '天衝', '天輔', '天禽', '天心', '天柱', '天任', '天英']
const BASHEN_ALL = ['值符', '螣蛇', '太陰', '六合', '白虎', '玄武', '九地', '九天']

// ── 分析步驟動畫 ──
const ANALYSIS_STEPS = [
  { text: '計算陰陽遁與局數...', icon: '&#9776;', duration: 800 },
  { text: '排列天地盤干支...', icon: '&#9672;', duration: 700 },
  { text: '安九星八門八神...', icon: '&#9733;', duration: 800 },
  { text: '判定格局吉凶...', icon: '&#9878;', duration: 600 },
  { text: '生成排盤結果...', icon: '&#128221;', duration: 700 },
]

// ── API 回傳型別 ──
interface PalaceData {
  position: string
  direction: string
  tianpan_gan: string
  dipan_gan: string
  jiuxing: string
  bamen: string
  bashen: string
  geju: string[]
  kong?: boolean       // 空亡
  fuyin?: boolean      // 伏吟
  fanyin?: boolean     // 反吟
  menpo?: boolean      // 門迫
}

interface QimenResult {
  pan_type: string
  yinyang: string
  ju_number: number
  xunshou: string
  jieqi: string
  datetime: string
  year_gz: string
  month_gz: string
  day_gz: string
  hour_gz: string
  shichen?: string
  shichen_time?: string
  zhifu: string
  zhifu_gong?: string
  zhishi: string
  zhishi_gong?: string
  zhishi_analysis?: { door: string; gong: string; desc: string; is_jimen?: boolean; score?: number } | null
  dun_method?: string
  yuan_method?: string
  palaces: Record<string, PalaceData>
  geju_summary?: { ji: string[]; xiong: string[] }
  kongwang_gongs?: string[]
  tianyi_gongs?: string[]
  yima_gong?: string
  nianming_gong?: string
  wubuyu_shi?: string | null
  chaoshen_jieqi?: { days: number; desc: string; status: string } | null
  tst_offset?: number
  ai_overview?: string
  ai_directions?: string
  has_ai?: boolean
}

// 宮名→數字映射（反向）
const GONG_NAME_TO_NUM: Record<string,number> = {
  '坎一宮': 1, '坎一': 1, '坤二宮': 2, '坤二': 2, '震三宮': 3, '震三': 3, '巽四宮': 4, '巽四': 4,
  '中五宮': 5, '中五': 5, '乾六宮': 6, '乾六': 6, '兌七宮': 7, '兌七': 7, '艮八宮': 8, '艮八': 8, '離九宮': 9, '離九': 9,
}

export default function QimenToolPage() {
  // ── 表單狀態 ──
  const [timeSource, setTimeSource] = useState<'now' | 'custom'>('now')
  const [panType, setPanType] = useState<'hour' | 'day' | 'year'>('hour')
  const now = new Date()
  const [form, setForm] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    day: String(now.getDate()),
    hour: String(Math.floor(now.getHours() / 2) * 2), // 預設到當前時辰
  })

  // ── 當選擇「當前時間」時，自動更新日期時間 ──
  useEffect(() => {
    if (timeSource === 'now') {
      const n = new Date()
      setForm({
        year: String(n.getFullYear()),
        month: String(n.getMonth() + 1),
        day: String(n.getDate()),
        hour: String(Math.floor(n.getHours() / 2) * 2),
      })
    }
  }, [timeSource])

  const [result, setResult] = useState<QimenResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // ── 提交排盤 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(''); setResult(null)
    setCurrentStep(0); setCompletedSteps([])

    // 步驟動畫
    let stepIdx = 0
    const stepInterval = setInterval(() => {
      if (stepIdx < ANALYSIS_STEPS.length) {
        setCompletedSteps(prev => [...prev, stepIdx])
        stepIdx++
        setCurrentStep(stepIdx)
      }
    }, ANALYSIS_STEPS[Math.min(stepIdx, ANALYSIS_STEPS.length - 1)]?.duration || 600)

    try {
      // 決定時間參數
      let year: number, month: number, day: number, hour: number, minute: number
      if (timeSource === 'now') {
        const n = new Date()
        year = n.getFullYear(); month = n.getMonth() + 1; day = n.getDate()
        hour = n.getHours(); minute = n.getMinutes()
      } else {
        year = parseInt(form.year); month = parseInt(form.month); day = parseInt(form.day)
        hour = parseInt(form.hour); minute = 0
      }

      const res = await fetch('/api/free-qimen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, day, hour, minute, pan_type: panType }),
      })

      clearInterval(stepInterval)
      setCompletedSteps(ANALYSIS_STEPS.map((_, i) => i))
      setCurrentStep(ANALYSIS_STEPS.length)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: '排盤失敗' }))
        throw new Error(errData.detail || '排盤失敗')
      }

      await new Promise(r => setTimeout(r, 400))
      const data = await res.json()
      setResult(data)
      gtag.event('generate_lead', { event_category: 'free_tool', tool: 'qimen' })
      fbpixel.trackEvent('Lead', { content_name: '免費奇門遁甲排盤' })
    } catch (err: unknown) {
      clearInterval(stepInterval)
      setError(err instanceof Error ? err.message : '排盤失敗，請稍後再試')
    } finally { setLoading(false) }
  }

  // ── 渲染單一宮位 ──
  const renderPalace = (palaceNum: number) => {
    const palace = result?.palaces?.[String(palaceNum)] as PalaceData | undefined
    const info = PALACE_NAMES[palaceNum]
    const isCenterPalace = palaceNum === 5

    // 計算此宮是否為特殊宮（空亡/天乙/驛馬/年命/值符/值使）
    const isKongwang = result?.kongwang_gongs?.some(k => GONG_NAME_TO_NUM[k] === palaceNum) || false
    const isTianyi = result?.tianyi_gongs?.some(k => GONG_NAME_TO_NUM[k] === palaceNum) || false
    const isYima = result?.yima_gong && GONG_NAME_TO_NUM[result.yima_gong] === palaceNum
    const isNianming = result?.nianming_gong && GONG_NAME_TO_NUM[result.nianming_gong] === palaceNum
    const isZhifuGong = result?.zhifu_gong && GONG_NAME_TO_NUM[result.zhifu_gong] === palaceNum
    const isZhishiGong = result?.zhishi_gong && GONG_NAME_TO_NUM[result.zhishi_gong] === palaceNum

    // ══ 中宮（帝王之術核心）══
    if (isCenterPalace) {
      return (
        <div key={palaceNum} className="relative rounded-2xl p-4 sm:p-5 min-h-[160px] sm:min-h-[200px] flex flex-col justify-center items-center overflow-hidden"
          style={{
            background: 'radial-gradient(circle at center, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 55%, rgba(10,14,26,0.9) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.45), 0 0 32px rgba(201,168,76,0.15)',
          }}>
          {/* 角落裝飾（四個角）*/}
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t border-l border-gold/50" />
          <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t border-r border-gold/50" />
          <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b border-l border-gold/50" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b border-r border-gold/50" />

          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.4em] text-gold/70 font-serif whitespace-nowrap">中宮</div>

          <div className="text-center space-y-2 pt-3">
            <div className="flex items-center justify-center gap-4">
              <div>
                <div className="text-[9px] text-gold/55 tracking-[0.2em] mb-0.5">值符</div>
                <div className="text-2xl sm:text-3xl font-bold text-gold-light font-serif leading-none drop-shadow-[0_0_10px_rgba(201,168,76,0.55)]">{result?.zhifu || '—'}</div>
              </div>
              <div className="w-px h-12 bg-gradient-to-b from-transparent via-gold/40 to-transparent" />
              <div>
                <div className="text-[9px] text-gold/55 tracking-[0.2em] mb-0.5">值使</div>
                <div className="text-2xl sm:text-3xl font-bold text-gold-light font-serif leading-none drop-shadow-[0_0_10px_rgba(201,168,76,0.55)]">{result?.zhishi || '—'}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-center pt-2">
              <div className="w-8 h-px bg-gradient-to-r from-transparent to-gold/50" />
              <span className="text-[8px] text-gold/55 tracking-[0.3em]">DUN</span>
              <div className="w-8 h-px bg-gradient-to-l from-transparent to-gold/50" />
            </div>

            <div className="text-[13px] font-bold text-gold tracking-widest">
              {result?.yinyang || '—'}{result?.ju_number ? ` ${result.ju_number} 局` : ''}
            </div>
            <div className="text-[9px] text-text-muted/80 tracking-wider">旬首 {result?.xunshou || '—'}</div>
          </div>
        </div>
      )
    }

    // 以下 palace 不存在時仍要填位元（fallback）
    const bamen = palace?.bamen || '—'
    const jiuxing = palace?.jiuxing || '—'
    const bashen = palace?.bashen || '—'
    const tianpan = palace?.tianpan_gan || '—'
    const dipan = palace?.dipan_gan || '—'

    const bamenStyle = BAMEN_COLORS[bamen] || { dot: 'bg-slate-500', text: 'text-slate-300', ring: 'ring-slate-500/20', level: '' }
    const jiuxingColor = JIUXING_COLORS[jiuxing] || 'text-slate-300'
    const bashenColor = BASHEN_COLORS[bashen] || 'text-slate-300'

    // 狀態標記
    const statusTags: { label: string; color: string }[] = []
    if (palace?.kong) statusTags.push({ label: '空亡', color: 'text-slate-300 bg-slate-500/10 border-slate-500/30' })
    if (palace?.fuyin) statusTags.push({ label: '伏吟', color: 'text-rose-300 bg-rose-500/10 border-rose-500/30' })
    if (palace?.fanyin) statusTags.push({ label: '反吟', color: 'text-red-300 bg-red-500/10 border-red-500/40' })
    if (palace?.menpo) statusTags.push({ label: '門迫', color: 'text-rose-300 bg-rose-500/10 border-rose-500/30' })

    // 顯示格局：最多 2 個 chip，其餘用 +N 顯示
    // 去除格局說明（冒號後的說明文），只保留格局名本身
    const cleanGeju = (g: string): string => {
      // 去冒號後半：「開門+天心+太陰：門星神三吉全備」→「開門+天心+太陰」
      let s = g.split(/[::]/)[0].trim()
      // 若超長（>12 中文字）強制截斷
      if (s.length > 12) s = s.slice(0, 11) + '…'
      return s
    }
    const gejuRaw = (palace?.geju || []).map(g => typeof g === 'string' ? g : String(g)).filter(Boolean)
    // 去重（避免「伏吟」被列兩次）
    const gejuList: string[] = []
    const seen = new Set<string>()
    for (const g of gejuRaw) {
      const c = cleanGeju(g)
      if (c && !seen.has(c)) { seen.add(c); gejuList.push(c) }
    }
    const visibleGeju = gejuList.slice(0, 2)
    const extraGejuCount = Math.max(0, gejuList.length - 2)

    // 特殊宮樣式
    const isSpecial = isZhifuGong || isZhishiGong
    const cardBorder = isZhifuGong
      ? 'ring-1 ring-gold/60'
      : isZhishiGong
      ? 'ring-1 ring-emerald-400/50'
      : 'ring-1 ring-white/5 hover:ring-gold/30'

    const cardBg = isSpecial
      ? 'bg-gradient-to-br from-gold/[0.06] to-transparent'
      : 'bg-white/[0.015]'

    return (
      <div key={palaceNum}
        className={`relative rounded-2xl ${cardBg} ${cardBorder} p-3 pt-5 sm:p-3.5 sm:pt-5 min-h-[170px] sm:min-h-[210px] transition-all duration-300 hover:bg-gold/[0.03] group overflow-visible ${isKongwang ? 'opacity-80' : ''}`}
      >
        {/* 角色徽章（值符/值使/天乙/年命/驛馬）— 右上角（卡片內避免被裁切）*/}
        <div className="absolute top-1 right-1.5 flex gap-1 flex-wrap justify-end max-w-[75%]">
          {isZhifuGong && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-gold text-dark font-bold tracking-wider shadow shadow-gold/30">值符</span>
          )}
          {isZhishiGong && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-emerald-400 text-dark font-bold tracking-wider shadow shadow-emerald-400/30">值使</span>
          )}
          {isTianyi && !isZhifuGong && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-gold/80 text-dark font-bold tracking-wider">天乙</span>
          )}
          {isNianming && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-sky-400 text-dark font-bold tracking-wider">年命</span>
          )}
          {isYima && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-teal-400 text-dark font-bold tracking-wider">驛馬</span>
          )}
        </div>

        {/* 宮名（左上角襯線） */}
        <div className="mb-1">
          <span className="text-[10px] text-text-muted/80 font-serif tracking-wider">{info.name}</span>
          <span className="text-[9px] text-text-muted/40 ml-1.5">· {info.direction}</span>
        </div>

        {/* 天盤干（主焦點）+ 地盤干（副焦點） */}
        <div className="text-center mb-2.5 relative">
          <div className="text-3xl sm:text-4xl font-bold text-gold-light font-serif leading-none drop-shadow-[0_0_6px_rgba(201,168,76,0.3)]">
            {tianpan}
          </div>
          <div className="text-lg text-cream/70 font-serif leading-none mt-1">{dipan}</div>
        </div>

        {/* 九星 + 八神（次要資訊，置中小字）*/}
        <div className="flex justify-center items-center gap-2 text-[10px] mb-2">
          <span className={`${jiuxingColor}`}>{jiuxing}</span>
          <span className="text-text-muted/30">·</span>
          <span className={`${bashenColor}`}>{bashen}</span>
        </div>

        {/* 八門（帶色點）居中顯示 */}
        <div className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-full bg-black/30 ${bamenStyle.ring} ring-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${bamenStyle.dot}`} />
          <span className={`text-xs font-bold ${bamenStyle.text}`}>{bamen}</span>
          {bamenStyle.level && <span className="text-[9px] text-text-muted/60">· {bamenStyle.level}</span>}
        </div>

        {/* 狀態標記 + 格局（最多 2 個 chip，其餘 +N 彙總）*/}
        {(statusTags.length > 0 || visibleGeju.length > 0) && (
          <div className="flex flex-wrap gap-0.5 mt-2 justify-center">
            {statusTags.slice(0, 2).map(tag => (
              <span key={tag.label} className={`text-[9px] px-1.5 py-0.5 rounded ${tag.color} whitespace-nowrap`}>{tag.label}</span>
            ))}
            {visibleGeju.slice(0, Math.max(0, 2 - statusTags.length)).map((g, idx) => {
              const style = getGejuStyle(g)
              return (
                <span key={idx} className={`text-[9px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border} whitespace-nowrap`}>
                  {g}
                </span>
              )
            })}
            {(extraGejuCount + Math.max(0, statusTags.length - 2)) > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted/70 whitespace-nowrap">
                +{extraGejuCount + Math.max(0, statusTags.length - 2)}
              </span>
            )}
          </div>
        )}

        {/* 若什麼格局/狀態都沒有，顯示低調佔位（保持視覺填滿）*/}
        {statusTags.length === 0 && gejuList.length === 0 && palace && (
          <div className="text-center mt-2">
            <span className="text-[9px] text-text-muted/30 tracking-wide">無特殊格局</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="py-16 overflow-x-hidden max-w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* ═══ 標題 ═══ */}
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2 break-words">
          <span className="text-gradient-gold">奇門遁甲排盤</span>
        </h1>
        <p className="text-center text-text-muted mb-2">天地盤 + 九星八門八神 + 格局判斷</p>
        <p className="text-center text-xs text-text-muted/60 mb-4">不需註冊 &middot; 即時出結果 &middot; 完全免費</p>

        {/* ═══ 由來說明 ═══ */}
        <div className="max-w-2xl mx-auto mb-10">
          <details className="glass rounded-xl p-4 cursor-pointer">
            <summary className="text-sm font-medium text-amber-400/90 flex items-center gap-2">
              <span>&#128218;</span> 關於奇門遁甲：帝王之術
            </summary>
            <div className="mt-3 text-xs text-text-muted/80 space-y-2 leading-relaxed">
              <p><strong className="text-white/90">奇門遁甲的由來：</strong>奇門遁甲與太乙神數、六壬神課並稱中國古代三式，被譽為「帝王之術」。傳說黃帝於涿鹿之戰中得九天玄女傳授奇門遁甲以戰勝蚩尤。其體系融合易學、天文、曆法、陰陽五行，歷經數千年發展，至今仍是預測學中最為精密的術數體系之一。</p>
              <p><strong className="text-white/90">核心原理：</strong>奇門遁甲以九宮格為基本框架，將天盤（天干）、地盤（地干）、九星、八門、八神五層資訊疊加在九宮之上，通過分析各層元素的生剋關係與格局組合，判斷特定時空的吉凶能量分佈。「奇」指乙丙丁三奇，「門」指八門，「遁」指六甲旬首所遁之干。</p>
              <p><strong className="text-white/90">鑒源的做法：</strong>本系統使用精確的天文曆法數據，嚴格按照古法排盤規則（含超神接氣、陰陽遁局判定、寄宮法則），確保每一宮的天地盤干、九星、八門、八神完全正確。格局判斷涵蓋九遁、28種經典格局。</p>
            </div>
          </details>
        </div>

        {/* ═══ 分析進度動畫 ═══ */}
        {loading && !result && (
          <div className="max-w-lg mx-auto">
            <div className="glass rounded-2xl p-8">
              <h3 className="text-lg font-bold text-cream mb-6 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
                正在排列奇門遁甲盤
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
                <p className="text-center text-gold mt-6 animate-pulse text-sm">排盤完成，正在載入...</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ 表單 ═══ */}
        {!result && !loading && (
          <div className="max-w-lg mx-auto">
            <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">

              {/* 排盤類型 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">排盤類型</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10">
                  {([
                    { v: 'hour' as const, l: '時盤' },
                    { v: 'day' as const, l: '日盤' },
                    { v: 'year' as const, l: '年盤' },
                  ]).map(({ v, l }) => (
                    <button key={v} type="button"
                      onClick={() => setPanType(v)}
                      className={`flex-1 py-2.5 text-sm font-medium transition-all ${panType === v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted/50 mt-1">
                  {panType === 'hour' ? '時盤精度最高，適合判斷具體事件的吉凶方位' : panType === 'day' ? '日盤適合判斷整天的能量趨勢' : '年盤適合判斷整年的大方向'}
                </p>
              </div>

              {/* 排盤時間 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">排盤時間</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10 mb-3">
                  {([
                    { v: 'now' as const, l: '當前時間' },
                    { v: 'custom' as const, l: '自訂時間' },
                  ]).map(({ v, l }) => (
                    <button key={v} type="button"
                      onClick={() => setTimeSource(v)}
                      className={`flex-1 py-2.5 text-sm font-medium transition-all ${timeSource === v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {timeSource === 'now' && (
                  <p className="text-xs text-text-muted/70">
                    將以當前系統時間進行排盤
                  </p>
                )}

                {timeSource === 'custom' && (
                  <>
                    {/* 日期選擇 */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] text-text-muted/60 mb-1">年</label>
                        <input type="number" min="1920" max="2100" value={form.year}
                          onChange={(e) => setForm({ ...form, year: e.target.value })}
                          className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-cream text-sm focus:border-gold/40 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted/60 mb-1">月</label>
                        <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}
                          className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-cream text-sm focus:border-gold/40 focus:outline-none">
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1} 月</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-muted/60 mb-1">日</label>
                        <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}
                          className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-cream text-sm focus:border-gold/40 focus:outline-none">
                          {Array.from({ length: 31 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1} 日</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* 時辰選擇 */}
                    <div>
                      <label className="block text-[10px] text-text-muted/60 mb-1">時辰</label>
                      <select value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })}
                        className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-cream text-sm focus:border-gold/40 focus:outline-none">
                        {SHICHEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* 提交按鈕 */}
              <button type="submit" disabled={loading}
                className="w-full py-4 font-bold rounded-xl text-lg transition-all bg-gold text-dark btn-glow disabled:opacity-50">
                {loading ? '排盤中...' : '開始排盤'}
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            </form>
          </div>
        )}

        {/* ═══ 結果展示 ═══ */}
        {result && (
          <div className="space-y-8">
            <div className="text-center">
              <button onClick={() => setResult(null)} className="text-sm text-gold hover:underline">&larr; 重新排盤</button>
            </div>

            {/* ═══ 時空概覽卡片 ═══ */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">當前時空概覽</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="glass rounded-lg p-3 text-center">
                  <div className="text-[10px] text-text-muted/60">年柱</div>
                  <div className="text-lg font-bold text-amber-400">{result.year_gz || '-'}</div>
                </div>
                <div className="glass rounded-lg p-3 text-center">
                  <div className="text-[10px] text-text-muted/60">月柱</div>
                  <div className="text-lg font-bold text-amber-400">{result.month_gz || '-'}</div>
                </div>
                <div className="glass rounded-lg p-3 text-center">
                  <div className="text-[10px] text-text-muted/60">日柱</div>
                  <div className="text-lg font-bold text-amber-400">{result.day_gz || '-'}</div>
                </div>
                <div className="glass rounded-lg p-3 text-center">
                  <div className="text-[10px] text-text-muted/60">時柱</div>
                  <div className="text-lg font-bold text-amber-400">{result.hour_gz || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass rounded-lg p-3">
                  <div className="text-[10px] text-text-muted/60">遁局</div>
                  <div className="text-sm font-semibold text-white">{result.yinyang} {result.ju_number}局</div>
                  {result.yuan_method && (
                    <div className="text-[9px] text-text-muted/40 mt-0.5">定元：{result.yuan_method}</div>
                  )}
                </div>
                <div className="glass rounded-lg p-3">
                  <div className="text-[10px] text-text-muted/60">旬首</div>
                  <div className="text-sm font-semibold text-white">{result.xunshou || '-'}</div>
                  {result.shichen && (
                    <div className="text-[9px] text-text-muted/40 mt-0.5">{result.shichen}時 {result.shichen_time}</div>
                  )}
                </div>
                <div className="glass rounded-lg p-3">
                  <div className="text-[10px] text-text-muted/60">值符 / 值使</div>
                  <div className="text-sm font-semibold text-amber-400">{result.zhifu} / {result.zhishi}</div>
                  {result.zhifu_gong && (
                    <div className="text-[9px] text-amber-400/60 mt-0.5">落宮：{result.zhifu_gong}</div>
                  )}
                </div>
                <div className="glass rounded-lg p-3">
                  <div className="text-[10px] text-text-muted/60">節氣</div>
                  <div className="text-sm font-semibold text-white">{result.jieqi || '-'}</div>
                  {result.chaoshen_jieqi && (
                    <div className={`text-[9px] mt-0.5 ${result.chaoshen_jieqi.status === '超神' ? 'text-blue-400' : result.chaoshen_jieqi.status === '接氣' ? 'text-orange-400' : 'text-green-400'}`}>
                      {result.chaoshen_jieqi.status}
                    </div>
                  )}
                </div>
              </div>

              {/* 特殊標記（超神接氣、五不遇時、值使分析） */}
              {(result.chaoshen_jieqi || result.wubuyu_shi || result.zhishi_analysis) && (
                <div className="mt-4 space-y-2">
                  {result.chaoshen_jieqi && (
                    <div className={`rounded-lg p-3 border ${
                      result.chaoshen_jieqi.status === '超神' ? 'bg-blue-500/10 border-blue-500/20' :
                      result.chaoshen_jieqi.status === '接氣' ? 'bg-orange-500/10 border-orange-500/20' :
                      'bg-green-500/10 border-green-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${
                          result.chaoshen_jieqi.status === '超神' ? 'text-blue-400' :
                          result.chaoshen_jieqi.status === '接氣' ? 'text-orange-400' :
                          'text-green-400'
                        }`}>超神接氣：{result.chaoshen_jieqi.status}</span>
                        <span className="text-[10px] text-text-muted">（距節氣 {result.chaoshen_jieqi.days} 天）</span>
                      </div>
                      <p className="text-xs text-text/80">{result.chaoshen_jieqi.desc}</p>
                    </div>
                  )}
                  {result.wubuyu_shi && (
                    <div className="rounded-lg p-3 border bg-red-500/10 border-red-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-red-400">五不遇時</span>
                        <span className="text-[10px] text-red-400/70">（百事不宜，忌大事）</span>
                      </div>
                      <p className="text-xs text-text/80">{result.wubuyu_shi}</p>
                    </div>
                  )}
                  {result.zhishi_analysis && result.zhishi_analysis.desc && (
                    <div className={`rounded-lg p-3 border ${
                      result.zhishi_analysis.is_jimen ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-orange-500/10 border-orange-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${result.zhishi_analysis.is_jimen ? 'text-emerald-400' : 'text-orange-400'}`}>值使分析</span>
                        <span className="text-[10px] text-text-muted">{result.zhishi_analysis.door}落{result.zhishi_analysis.gong}</span>
                      </div>
                      <p className="text-xs text-text/80">{result.zhishi_analysis.desc}</p>
                    </div>
                  )}
                </div>
              )}

              {result.datetime && (
                <p className="text-[10px] text-text-muted/40 text-center mt-3">排盤時間：{result.datetime}</p>
              )}
            </div>

            {/* ═══ 九宮格排盤（帝王之術版） ═══ */}
            <div className="glass rounded-2xl p-5 sm:p-8"
              style={{
                background: 'linear-gradient(135deg, rgba(15,22,40,0.6) 0%, rgba(10,14,26,0.8) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(201,168,76,0.08)',
              }}>
              <div className="flex items-end justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-gradient-to-b from-gold to-gold/30 rounded-full" />
                    <h2 className="text-lg sm:text-xl font-bold text-cream font-serif">奇門遁甲九宮</h2>
                  </div>
                  <p className="text-[11px] text-text-muted/60 mt-1 ml-3 tracking-wider">洛書九宮 · 天地盤 · 九星八門八神</p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gold tracking-widest font-serif">
                    {result.yinyang}{result.ju_number ? ` ${result.ju_number}局` : ''}
                  </div>
                  <div className="text-[9px] text-text-muted/50 mt-0.5">旬首 {result.xunshou || '—'}</div>
                </div>
              </div>

              {/* 手機版滑動提示 */}
              <p className="text-center text-[10px] text-text-muted/40 mb-3 md:hidden">左右滑動查看完整排盤</p>

              {/* 九宮 + 四正方位的外框 */}
              <div className="relative">
                {/* 上方位（南） */}
                <div className="flex justify-center mb-3">
                  <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-gold/5 border border-gold/20">
                    <span className="text-gold/80 text-xs">▲</span>
                    <span className="text-xs tracking-[0.3em] text-gold font-serif">南</span>
                  </div>
                </div>

                <div className="flex items-center">
                  {/* 左方位（東） */}
                  <div className="hidden sm:flex flex-col items-center gap-2 mr-3">
                    <div className="flex flex-col items-center gap-1 px-2 py-3 rounded-full bg-gold/5 border border-gold/20">
                      <span className="text-gold/80 text-xs">◀</span>
                      <span className="text-xs tracking-[0.3em] text-gold font-serif writing-vertical">東</span>
                    </div>
                  </div>

                  {/* 九宮格 */}
                  <div className="flex-1 overflow-x-auto pb-1 -mx-2 px-2">
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 min-w-[320px] sm:min-w-[520px] max-w-full">
                      {LUOSHU_ORDER.map(num => renderPalace(num))}
                    </div>
                  </div>

                  {/* 右方位（西） */}
                  <div className="hidden sm:flex flex-col items-center gap-2 ml-3">
                    <div className="flex flex-col items-center gap-1 px-2 py-3 rounded-full bg-gold/5 border border-gold/20">
                      <span className="text-gold/80 text-xs">▶</span>
                      <span className="text-xs tracking-[0.3em] text-gold font-serif">西</span>
                    </div>
                  </div>
                </div>

                {/* 下方位（北） */}
                <div className="flex justify-center mt-3">
                  <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-gold/5 border border-gold/20">
                    <span className="text-gold/80 text-xs">▼</span>
                    <span className="text-xs tracking-[0.3em] text-gold font-serif">北</span>
                  </div>
                </div>

                {/* 手機版左右方位（下方橫排）*/}
                <div className="sm:hidden flex justify-between mt-3 text-xs px-1">
                  <span className="text-gold tracking-[0.3em]">◀ 東</span>
                  <span className="text-gold tracking-[0.3em]">西 ▶</span>
                </div>
              </div>

              {/* 圖例（完整、大字、分區）*/}
              <div className="mt-8 pt-6 border-t border-gold/10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] tracking-[0.3em] text-gold/70 font-serif">LEGEND · 圖例</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg px-3 py-2 bg-emerald-400/5 border border-emerald-400/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-emerald-300 font-bold">大吉</span>
                    </div>
                    <p className="text-[10px] text-text-muted/70">開門 · 休門 · 生門</p>
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-slate-400/5 border border-slate-400/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span className="text-xs text-slate-300 font-bold">中平</span>
                    </div>
                    <p className="text-[10px] text-text-muted/70">景門 · 杜門</p>
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-rose-400/5 border border-rose-400/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-xs text-rose-300 font-bold">凶</span>
                    </div>
                    <p className="text-[10px] text-text-muted/70">傷門 · 驚門</p>
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-red-500/5 border border-red-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs text-red-300 font-bold">大凶</span>
                    </div>
                    <p className="text-[10px] text-text-muted/70">死門</p>
                  </div>
                </div>
                {/* 徽章圖例 */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gold text-dark font-bold tracking-wider">值符</span>
                  <span className="text-[9px] text-text-muted/60 self-center">天盤主導的宮</span>
                  <span className="mx-1 text-text-muted/30">·</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-400 text-dark font-bold tracking-wider">值使</span>
                  <span className="text-[9px] text-text-muted/60 self-center">人事落宮</span>
                  <span className="mx-1 text-text-muted/30">·</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gold/80 text-dark font-bold tracking-wider">天乙</span>
                  <span className="text-[9px] text-text-muted/60 self-center">貴人方</span>
                  <span className="mx-1 text-text-muted/30">·</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-sky-400 text-dark font-bold tracking-wider">年命</span>
                  <span className="text-[9px] text-text-muted/60 self-center">本命宮</span>
                  <span className="mx-1 text-text-muted/30">·</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-teal-400 text-dark font-bold tracking-wider">驛馬</span>
                  <span className="text-[9px] text-text-muted/60 self-center">動方</span>
                </div>
              </div>
            </div>

            {/* ═══ 格局匯總 ═══ */}
            {result.geju_summary && (result.geju_summary.ji?.length > 0 || result.geju_summary.xiong?.length > 0) && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-gold rounded-full" />
                  <h2 className="text-lg font-bold text-white">本盤格局</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(() => {
                    // 硬化：陣列元素可能不是純字串
                    const toStr = (g: unknown): string => {
                      if (typeof g === 'string') return g.trim()
                      if (g && typeof g === 'object') {
                        const obj = g as { name?: string; title?: string }
                        return String(obj.name || obj.title || '').trim()
                      }
                      return ''
                    }
                    const jiList = ((result.geju_summary.ji || []) as unknown[]).map(toStr).filter(Boolean)
                    const xiongList = ((result.geju_summary.xiong || []) as unknown[]).map(toStr).filter(Boolean)
                    return (
                      <>
                        {jiList.length > 0 && (
                          <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
                            <h4 className="text-sm font-bold text-green-400 mb-3">&#10003; 吉格</h4>
                            <div className="flex flex-wrap gap-2">
                              {jiList.map((g: string, i: number) => (
                                <span key={i} className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {xiongList.length > 0 && (
                          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-5">
                            <h4 className="text-sm font-bold text-red-400 mb-3">&#9888; 凶格</h4>
                            <div className="flex flex-wrap gap-2">
                              {xiongList.map((g: string, i: number) => (
                                <span key={i} className="text-xs px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* ═══ AI 解讀 ═══ */}
            {result.has_ai && result.ai_overview && (
              <AIAnalysisCard text={result.ai_overview} title="整體能量場解讀" accentColor="purple" />
            )}

            {result.has_ai && result.ai_directions && (
              <AIAnalysisCard text={result.ai_directions} title="方位吉凶提示" accentColor="emerald" />
            )}

            {/* ═══ 宮位列表（手機友好） ═══ */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">九宮詳細資訊</h2>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
                  const palace = result.palaces?.[String(num)] as PalaceData | undefined
                  const info = PALACE_NAMES[num]
                  if (!palace && num !== 5) return null
                  const bamenStyle = palace?.bamen ? BAMEN_COLORS[palace.bamen] : null

                  return (
                    <details key={num} className="group">
                      <summary className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-all">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-amber-400 w-6 text-center">{num}</span>
                          <span className="text-sm text-cream">{info.name}</span>
                          <span className="text-xs text-text-muted/50">({info.direction})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {palace?.bamen && bamenStyle && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full bg-black/30 ${bamenStyle.text} ring-1 ${bamenStyle.ring} inline-flex items-center gap-1`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${bamenStyle.dot}`} />
                              {palace.bamen}
                            </span>
                          )}
                          {palace?.tianpan_gan && (
                            <span className="text-xs text-amber-400 font-bold">{palace.tianpan_gan}</span>
                          )}
                          <span className="text-text-muted/40 text-xs group-open:rotate-180 transition-transform">&#9660;</span>
                        </div>
                      </summary>
                      <div className="px-4 py-3 ml-9 text-xs space-y-1 text-text-muted">
                        {num === 5 ? (
                          <>
                            <p>值符：<span className="text-amber-400">{result.zhifu}</span></p>
                            <p>值使：<span className="text-amber-400">{result.zhishi}</span></p>
                            <p>遁局：<span className="text-white">{result.yinyang} {result.ju_number}局</span></p>
                            <p>旬首：<span className="text-white">{result.xunshou}</span></p>
                            {palace?.tianpan_gan && <p>天盤干：<span className="text-amber-400">{palace.tianpan_gan}</span></p>}
                            {palace?.dipan_gan && <p>地盤干：<span className="text-white">{palace.dipan_gan}</span></p>}
                            {palace?.jiuxing && <p>九星：<span className={JIUXING_COLORS[palace.jiuxing] || 'text-white'}>{palace.jiuxing}</span></p>}
                          </>
                        ) : palace ? (
                          <>
                            <p>天盤干：<span className="text-amber-400 font-bold">{palace.tianpan_gan}</span></p>
                            <p>地盤干：<span className="text-white">{palace.dipan_gan}</span></p>
                            <p>九星：<span className={JIUXING_COLORS[palace.jiuxing] || 'text-white'}>{palace.jiuxing}</span></p>
                            <p>八門：<span className={bamenStyle?.text || 'text-white'}>{palace.bamen}</span>
                              {bamenStyle && <span className="text-text-muted/40 ml-1">({bamenStyle.level})</span>}
                            </p>
                            <p>八神：<span className={BASHEN_COLORS[palace.bashen] || 'text-white'}>{palace.bashen}</span></p>
                            {palace.kong && <p className="text-purple-400">&#9678; 空亡</p>}
                            {palace.fuyin && <p className="text-orange-400">&#9678; 伏吟</p>}
                            {palace.fanyin && <p className="text-red-400">&#9678; 反吟</p>}
                            {palace.menpo && <p className="text-purple-400">&#9678; 門迫</p>}
                            {palace.geju && palace.geju.length > 0 && (
                              <p>格局：{palace.geju.map((g, i) => {
                                const style = getGejuStyle(g)
                                return <span key={i} className={`${style.text} mr-2`}>{g}</span>
                              })}</p>
                            )}
                          </>
                        ) : null}
                      </div>
                    </details>
                  )
                })}
              </div>
            </div>

            {/* ═══ 速算提示 ═══ */}
            <p className="text-center text-xs text-text-muted/50 leading-relaxed">
              以上為即時排盤結果。如需針對特定事件的深度奇門分析，請查看付費出門訣服務
            </p>

            {/* ═══ 付費升級引導（重點推出門訣 E1/E2） ═══ */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(26,58,92,0.4))' }}>
              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    想知道 <span className="text-gradient-gold">最佳出門時機</span> 嗎？
                  </h3>
                  <p className="text-base text-text max-w-2xl mx-auto leading-relaxed">
                    您剛才看到的是奇門遁甲的基礎排盤。我們的<strong className="text-white">出門訣服務</strong>將根據您的具體事件，
                    結合 25 步專業評分系統，為您挑選出最有利的出行時間與方位。
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128205;</div>
                    <h4 className="font-bold text-white mb-1">精準方位指引</h4>
                    <p className="text-sm text-text-muted">根據八門九星分析，告訴您往哪個方向出門最有利</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#9200;</div>
                    <h4 className="font-bold text-white mb-1">Top 3 吉時推薦</h4>
                    <p className="text-sm text-text-muted">從所有可用時段中挑選最佳出門時間，含日曆邀約</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128302;</div>
                    <h4 className="font-bold text-white mb-1">補運指南</h4>
                    <p className="text-sm text-text-muted">針對您的事件提供穿著、配飾、方位等補運建議</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
                    <Link href="/checkout?plan=E1"
                      className="px-10 py-4 bg-gold text-dark font-bold rounded-xl text-lg btn-glow">
                      事件出門訣 $89
                    </Link>
                    <Link href="/checkout?plan=E2"
                      className="px-10 py-4 glass text-white font-semibold rounded-xl text-lg hover:bg-white/10">
                      月盤出門訣 $99
                    </Link>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 text-xs text-text-muted/60 mb-4">
                    <span>&#128274; Stripe 安全支付</span>
                    <span>&#9889; 約 30-60 分鐘出報告</span>
                    <span>&#128230; PDF 永久保存</span>
                  </div>
                  <p className="text-xs text-text-muted/50">
                    還沒準備好？{' '}
                    <Link href="/auth/signup" className="text-gold hover:underline">免費註冊帳號</Link>
                    {' '}先體驗更多免費工具
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
