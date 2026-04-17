'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'

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

// ── 八門吉凶配色 ──
const BAMEN_COLORS: Record<string, { bg: string; text: string; border: string; level: string }> = {
  '開門': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', level: '大吉' },
  '休門': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', level: '大吉' },
  '生門': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', level: '大吉' },
  '景門': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', level: '中平' },
  '杜門': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', level: '中平' },
  '傷門': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', level: '凶' },
  '驚門': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', level: '凶' },
  '死門': { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', level: '大凶' },
}

// ── 九星配色 ──
const JIUXING_COLORS: Record<string, string> = {
  '天蓬': 'text-blue-400',   // 水
  '天芮': 'text-yellow-500',  // 土
  '天衝': 'text-green-400',   // 木
  '天輔': 'text-green-400',   // 木
  '天禽': 'text-yellow-500',  // 土
  '天心': 'text-amber-400',   // 金
  '天柱': 'text-amber-400',   // 金
  '天任': 'text-yellow-500',  // 土
  '天英': 'text-red-400',     // 火
}

// ── 八神配色 ──
const BASHEN_COLORS: Record<string, string> = {
  '值符': 'text-amber-400',
  '螣蛇': 'text-red-400',
  '太陰': 'text-purple-400',
  '六合': 'text-green-400',
  '白虎': 'text-slate-200',
  '玄武': 'text-blue-400',
  '九地': 'text-yellow-600',
  '九天': 'text-teal-400',
}

// ── 格局標籤配色 ──
function getGejuStyle(geju: string): { bg: string; text: string; border: string } {
  // 凶格關鍵字
  const xiongKeywords = ['入墓', '反吟', '伏吟', '擊刑', '大格', '飛宮', '跌穴', '凶']
  // 特殊格局關鍵字
  const specialKeywords = ['門迫', '空亡', '六儀擊刑', '時干入墓']
  if (xiongKeywords.some(k => geju.includes(k))) {
    return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' }
  }
  if (specialKeywords.some(k => geju.includes(k))) {
    return { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20' }
  }
  // 預設吉格
  return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/20' }
}

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

    if (isCenterPalace) {
      return (
        <div key={palaceNum} className="relative border border-amber-500/30 rounded-xl bg-amber-500/[0.04] p-3 min-h-[180px] flex flex-col justify-center items-center">
          <div className="absolute top-1.5 left-2 text-[10px] text-text-muted/60">{info.name}</div>
          <div className="text-center space-y-2">
            <div className="text-xs text-text-muted">值符</div>
            <div className="text-base font-bold text-amber-400">{result?.zhifu || '-'}</div>
            <div className="text-xs text-text-muted">值使</div>
            <div className="text-base font-bold text-amber-400">{result?.zhishi || '-'}</div>
            <div className="h-px bg-gold/20 my-1" />
            <div className="text-xs text-text-muted">
              {result?.yinyang || '-'} {result?.ju_number ? `${result.ju_number}局` : ''}
            </div>
            <div className="text-[10px] text-text-muted/60">
              旬首：{result?.xunshou || '-'}
            </div>
            {palace && (
              <>
                <div className="text-[10px] text-text-muted/60">天盤：{palace.tianpan_gan} / 地盤：{palace.dipan_gan}</div>
                {palace.jiuxing && <div className="text-[10px] text-text-muted/60">九星：{palace.jiuxing}</div>}
              </>
            )}
          </div>
        </div>
      )
    }

    if (!palace) {
      return (
        <div key={palaceNum} className="border border-white/10 rounded-xl bg-white/[0.02] p-3 min-h-[180px] flex items-center justify-center">
          <span className="text-xs text-text-muted/40">{info.name}</span>
        </div>
      )
    }

    const bamenStyle = BAMEN_COLORS[palace.bamen] || { bg: 'bg-white/10', text: 'text-text-muted', border: 'border-white/20', level: '' }
    const jiuxingColor = JIUXING_COLORS[palace.jiuxing] || 'text-text-muted'
    const bashenColor = BASHEN_COLORS[palace.bashen] || 'text-text-muted'

    // 狀態標記
    const statusTags: { label: string; color: string }[] = []
    if (palace.kong) statusTags.push({ label: '空亡', color: 'text-purple-400 bg-purple-500/15 border-purple-500/20' })
    if (palace.fuyin) statusTags.push({ label: '伏吟', color: 'text-orange-400 bg-orange-500/15 border-orange-500/20' })
    if (palace.fanyin) statusTags.push({ label: '反吟', color: 'text-red-400 bg-red-500/15 border-red-500/20' })
    if (palace.menpo) statusTags.push({ label: '門迫', color: 'text-purple-400 bg-purple-500/15 border-purple-500/20' })

    // 特殊宮高亮邊框
    const specialBorder = isZhifuGong
      ? 'border-amber-500/50 ring-1 ring-amber-500/30'
      : isZhishiGong
      ? 'border-emerald-500/50 ring-1 ring-emerald-500/30'
      : isTianyi
      ? 'border-yellow-500/40'
      : isNianming
      ? 'border-cyan-500/40'
      : isYima
      ? 'border-teal-500/40'
      : isKongwang
      ? 'border-purple-500/30 opacity-75'
      : 'border-white/10'

    return (
      <div key={palaceNum} className={`relative border rounded-xl bg-white/[0.02] p-3 min-h-[180px] hover:border-gold/30 hover:bg-gold/[0.02] transition-all group ${specialBorder}`}>
        {/* 特殊宮標記 */}
        <div className="absolute -top-1.5 left-1 flex gap-1 flex-wrap">
          {isZhifuGong && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500 text-dark font-bold">值符</span>}
          {isZhishiGong && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500 text-dark font-bold">值使</span>}
          {isTianyi && !isZhifuGong && <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/80 text-dark font-bold">天乙</span>}
          {isNianming && <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500 text-dark font-bold">年命</span>}
          {isYima && <span className="text-[8px] px-1 py-0.5 rounded bg-teal-500 text-dark font-bold">驛馬</span>}
        </div>

        {/* 宮名 + 方位 */}
        <div className="flex justify-between items-start mb-2 mt-1">
          <span className="text-[10px] text-text-muted/60">{info.name}</span>
          <span className={`text-[10px] ${bashenColor} font-medium`}>{palace.bashen}</span>
        </div>

        {/* 天盤干（主焦點） */}
        <div className="text-center mb-1">
          <div className="text-2xl font-bold text-amber-400 leading-tight">{palace.tianpan_gan}</div>
          <div className="text-base text-cream/80 leading-tight">{palace.dipan_gan}</div>
          <div className="text-[10px] text-text-muted/50 mt-0.5">天/地盤</div>
        </div>

        {/* 九星 + 八門 */}
        <div className="flex justify-between items-center mt-2 mb-1">
          <span className={`text-xs font-medium ${jiuxingColor}`}>{palace.jiuxing}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${bamenStyle.bg} ${bamenStyle.text} ${bamenStyle.border}`}>
            {palace.bamen}
          </span>
        </div>

        {/* 狀態標記 */}
        {statusTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {statusTags.map(tag => (
              <span key={tag.label} className={`text-[9px] px-1.5 py-0.5 rounded border ${tag.color}`}>
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* 格局標籤 */}
        {palace.geju && palace.geju.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {palace.geju.map((g, idx) => {
              const style = getGejuStyle(g)
              return (
                <span key={idx} className={`text-[9px] px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                  {g}
                </span>
              )
            })}
          </div>
        )}

        {/* 方位角標 */}
        <div className="absolute bottom-1.5 right-2 text-[9px] text-text-muted/30 font-mono">{info.direction}</div>
      </div>
    )
  }

  return (
    <div className="py-16">
      <div className="max-w-5xl mx-auto px-6">
        {/* ═══ 標題 ═══ */}
        <h1 className="text-3xl font-bold text-center mb-2">
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

            {/* ═══ 九宮格排盤 ═══ */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-6 bg-gold rounded-full" />
                <h2 className="text-lg font-bold text-white">奇門遁甲排盤</h2>
                <span className="text-xs text-text-muted/50 ml-2">（洛書九宮）</span>
              </div>

              {/* 方位指示 */}
              <div className="text-center text-xs text-text-muted/40 mb-3">
                <span>&#9650; 南</span>
              </div>

              {/* 手機版提示 */}
              <p className="text-center text-[10px] text-text-muted/40 mb-2 md:hidden">左右滑動查看完整排盤</p>

              {/* 九宮格 */}
              <div className="overflow-x-auto pb-2">
                <div className="grid grid-cols-3 gap-2 min-w-[480px]">
                  {LUOSHU_ORDER.map(num => renderPalace(num))}
                </div>
              </div>

              {/* 方位指示 */}
              <div className="flex justify-between text-xs text-text-muted/40 mt-3 px-4">
                <span>東 &#9664;</span>
                <span>&#9654; 西</span>
              </div>
              <div className="text-center text-xs text-text-muted/40 mt-1">
                <span>&#9660; 北</span>
              </div>

              {/* 圖例 */}
              <div className="mt-6 pt-4 border-t border-white/5">
                <p className="text-[10px] text-text-muted/50 mb-2">圖例</p>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500/60" />
                    <span className="text-[10px] text-text-muted/60">吉門（開/休/生）</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500/60" />
                    <span className="text-[10px] text-text-muted/60">中平（景/杜）</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500/60" />
                    <span className="text-[10px] text-text-muted/60">凶門（傷/驚）</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500/60" />
                    <span className="text-[10px] text-text-muted/60">大凶（死門）</span>
                  </div>
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
                  {result.geju_summary.ji && result.geju_summary.ji.length > 0 && (
                    <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
                      <h4 className="text-sm font-bold text-green-400 mb-3">&#10003; 吉格</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.geju_summary.ji.map((g, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.geju_summary.xiong && result.geju_summary.xiong.length > 0 && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-5">
                      <h4 className="text-sm font-bold text-red-400 mb-3">&#9888; 凶格</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.geju_summary.xiong.map((g, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ AI 解讀 ═══ */}
            {result.has_ai && result.ai_overview && (
              <div className="glass rounded-2xl p-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-purple-500 rounded-full" />
                  <h2 className="text-lg font-bold text-cream">整體能量場解讀</h2>
                </div>
                <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_overview}</p>
              </div>
            )}

            {result.has_ai && result.ai_directions && (
              <div className="glass rounded-2xl p-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-teal-500 rounded-full" />
                  <h2 className="text-lg font-bold text-cream">方位吉凶提示</h2>
                </div>
                <p className="text-base text-text leading-[2] whitespace-pre-line">{result.ai_directions}</p>
              </div>
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${bamenStyle.bg} ${bamenStyle.text} ${bamenStyle.border}`}>
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
                    <h4 className="font-bold text-white mb-1">Top 5 吉時推薦</h4>
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
