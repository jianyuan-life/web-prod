'use client'

import { useState } from 'react'
import { searchCities, searchLocations, type LocationSearchResult } from '@/lib/cities'
import FamilyMemberPicker from '@/components/checkout/FamilyMemberPicker'
import type { SavedFamilyMember } from '@/components/FamilyMembersManager'
import AIAnalysisCard from '@/components/AIAnalysisCard'

const SHICHEN = [
  { label: '子時 (23:00-01:00)', value: 0 }, { label: '丑時 (01:00-03:00)', value: 2 },
  { label: '寅時 (03:00-05:00)', value: 4 }, { label: '卯時 (05:00-07:00)', value: 6 },
  { label: '辰時 (07:00-09:00)', value: 8 }, { label: '巳時 (09:00-11:00)', value: 10 },
  { label: '午時 (11:00-13:00)', value: 12 }, { label: '未時 (13:00-15:00)', value: 14 },
  { label: '申時 (15:00-17:00)', value: 16 }, { label: '酉時 (17:00-19:00)', value: 18 },
  { label: '戌時 (19:00-21:00)', value: 20 }, { label: '亥時 (21:00-23:00)', value: 22 },
]

// 分析步驟動畫
const ANALYSIS_STEPS = [
  { text: '計算命宮位置...', icon: '&#9776;', duration: 700 },
  { text: '安紫微星系...', icon: '&#9733;', duration: 600 },
  { text: '安天府星系...', icon: '&#9734;', duration: 600 },
  { text: '排列十二宮位...', icon: '&#9678;', duration: 800 },
  { text: '推算四化飛星...', icon: '&#10024;', duration: 700 },
  { text: '計算五行局...', icon: '&#9672;', duration: 500 },
  { text: '分析命宮三方四正...', icon: '&#9737;', duration: 600 },
  { text: '判定命格高低...', icon: '&#9878;', duration: 500 },
  { text: '啟動深度解讀引擎...', icon: '&#129302;', duration: 800 },
  { text: '生成專屬命盤報告...', icon: '&#128221;', duration: 1000 },
]

type ZiweiResult = {
  mainStar: string
  starNature: string
  starTitle: string
  personality: string
  strengths: string
  challenges: string
  career: string
  love: string
  health: string
  lucky: string
  year2026: string
  palaceData: Record<string, { branch: string; mainStars: string; minorStars: string; palaceGan?: string; sihuaTag?: string[] }>
  sihua: string[]
  yearTG: string
  wuxingju: number
  // 進階欄位
  mingZhu?: string
  shenZhu?: string
  currentDaxian?: string
  currentXiaoxian?: string
  yearFlow?: string
  daxianStars?: string
  triplePairs?: string[]
  extraAnalyses?: string
  aiAnalysis: string
  hasAi: boolean
}

// 十二宮位說明
const PALACE_DESC: Record<string, string> = {
  '命宮': '先天性格與命運格局',
  '兄弟宮': '兄弟姐妹緣分與合作關係',
  '夫妻宮': '感情婚姻與伴侶特質',
  '子女宮': '子女緣分與親子關係',
  '財帛宮': '財運與理財能力',
  '疾厄宮': '健康狀況與體質',
  '遷移宮': '外出運與社會際遇',
  '交友宮': '人際關係與部下緣',
  '事業宮': '事業格局與職業方向',
  '田宅宮': '不動產運與家庭環境',
  '福德宮': '精神生活與享受',
  '父母宮': '與父母長輩的關係',
}

// 十二宮位標準順序
const PALACE_ORDER = ['命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮', '遷移宮', '交友宮', '事業宮', '田宅宮', '福德宮', '父母宮']

// ==========================================
// 傳統紫微方盤佈局：4x4 grid，中間 2x2 合併
// 地支排列：寅=左下角，逆時針排列
// ==========================================

// 地支順序（用於確定宮位在方盤上的位置）
const DIZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

// 方盤 4x4 grid 中十二宮位的位置（按地支固定位置）
// row, col 從 0 開始（左上角為 0,0）
// 巳=左上, 午=上左中, 未=上右中, 申=右上
// 辰=左上中, 酉=右上中
// 卯=左下中, 戌=右下中
// 寅=左下, 丑=下左中, 子=下右中, 亥=右下
const DIZHI_POSITION: Record<string, { row: number; col: number }> = {
  '巳': { row: 0, col: 0 },
  '午': { row: 0, col: 1 },
  '未': { row: 0, col: 2 },
  '申': { row: 0, col: 3 },
  '辰': { row: 1, col: 0 },
  '酉': { row: 1, col: 3 },
  '卯': { row: 2, col: 0 },
  '戌': { row: 2, col: 3 },
  '寅': { row: 3, col: 0 },
  '丑': { row: 3, col: 1 },
  '子': { row: 3, col: 2 },
  '亥': { row: 3, col: 3 },
}

// 四化顏色映射
const SIHUA_COLORS: Record<string, string> = {
  '祿': 'bg-green-500/20 text-green-400 border border-green-500/30',
  '權': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  '科': 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  '忌': 'bg-red-500/20 text-red-400 border border-red-500/30',
}

// 從四化字串中判斷某宮是否有四化標記
function getPalaceSihua(mainStarsStr: string, sihua: string[]): { type: string; label: string }[] {
  const result: { type: string; label: string }[] = []
  if (!mainStarsStr || !sihua?.length) return result
  const stars = mainStarsStr.split(/[、\/]/).map(s => s.trim())
  for (const sh of sihua) {
    // 四化格式："廉貞化祿"
    const huaMatch = sh.match(/(.+)(化[祿權科忌])/)
    if (huaMatch) {
      const starName = huaMatch[1]
      const huaType = huaMatch[2].replace('化', '')
      if (stars.some(s => s.includes(starName))) {
        result.push({ type: huaType, label: huaType })
      }
    }
  }
  return result
}

// 五行局名稱
function getWuxingJuName(wuxingju: number): string {
  const map: Record<number, string> = { 2: '水二局', 3: '木三局', 4: '金四局', 5: '土五局', 6: '火六局' }
  return map[wuxingju] || `${wuxingju}局`
}

// 大限年齡範圍（簡易計算：根據五行局數推算）
function getDaxianRanges(wuxingju: number): { start: number; end: number }[] {
  const startAge = wuxingju // 五行局數即為起運歲數
  const ranges: { start: number; end: number }[] = []
  for (let i = 0; i < 12; i++) {
    ranges.push({
      start: startAge + i * 10,
      end: startAge + (i + 1) * 10 - 1,
    })
  }
  return ranges
}

// ==========================================
// 方盤宮格元件（專業版：宮干 + 四化 + 大限 + 流年高亮）
// ==========================================
function PalaceCell({
  palaceName,
  branch,
  palaceGan,
  mainStarsStr,
  minorStarsStr,
  sihua,
  sihuaTag,
  isActive,
  onClick,
  daxianRange,
  isCurrentDaxian,
  isCurrentYear,
  isXiaoxian,
}: {
  palaceName: string
  branch: string
  palaceGan?: string
  mainStarsStr: string
  minorStarsStr: string
  sihua: string[]
  sihuaTag?: string[]
  isActive: boolean
  onClick: () => void
  daxianRange?: string
  isCurrentDaxian?: boolean
  isCurrentYear?: boolean
  isXiaoxian?: boolean
}) {
  // 優先使用後端傳入的 sihuaTag（較準），否則從 mainStarsStr 解析
  const allSihua = sihuaTag && sihuaTag.length > 0
    ? sihuaTag.map(t => ({ type: t, label: t }))
    : [...getPalaceSihua(mainStarsStr, sihua), ...getPalaceSihua(minorStarsStr, sihua)]
  const isLifePalace = palaceName === '命宮'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left p-2 sm:p-3 rounded-lg border transition-all min-h-[120px] sm:min-h-[140px] flex flex-col ${
        isActive
          ? 'border-gold bg-gold/[0.12] shadow-[0_0_16px_rgba(201,168,76,0.3)] ring-1 ring-gold/40'
          : isCurrentDaxian
            ? 'border-cyan-500/50 bg-cyan-500/[0.05] hover:border-cyan-400/70'
            : isLifePalace
              ? 'border-gold/30 bg-gold/[0.04] hover:border-gold/40'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
      }`}
    >
      {/* 左上角：宮干 */}
      {palaceGan && (
        <div className="absolute top-1 left-1 text-[8px] sm:text-[9px] text-amber-400/70 font-semibold">
          {palaceGan}
        </div>
      )}

      {/* 右上角：地支 */}
      <div className="absolute top-1 right-1 text-[9px] sm:text-[10px] text-cream/50 font-bold">
        {branch}
      </div>

      {/* 流年標記（左上） */}
      {isCurrentYear && (
        <div className="absolute -top-1.5 -left-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded-full shadow-lg font-bold">流</div>
      )}

      {/* 小限標記（左下） */}
      {isXiaoxian && (
        <div className="absolute -bottom-1 -left-1 bg-blue-500 text-white text-[8px] px-1 py-0.5 rounded-full shadow-lg font-bold">小</div>
      )}

      {/* 大限標記（右上角下方） */}
      {isCurrentDaxian && (
        <div className="absolute top-1 right-7 bg-cyan-500/30 text-cyan-300 text-[8px] px-1 py-0.5 rounded font-bold border border-cyan-500/40">
          當運
        </div>
      )}

      {/* 宮名 */}
      <div className="flex items-center justify-between mt-3 mb-1">
        <span className={`text-[10px] sm:text-xs font-bold ${isLifePalace ? 'text-gold' : 'text-cream/80'}`}>
          {palaceName}
        </span>
      </div>

      {/* 主星 */}
      <div className="flex-1">
        {mainStarsStr ? (
          <div className="text-[11px] sm:text-sm font-bold text-gold/90 leading-tight mb-0.5">
            {mainStarsStr.split(/[、\/]/).map((star, i) => (
              <span key={i}>
                {i > 0 && <span className="text-text-muted/30"> </span>}
                {star.trim()}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[10px] sm:text-xs text-text-muted/50 italic">借對宮星</div>
        )}

        {/* 輔星（縮小顯示） */}
        {minorStarsStr && (
          <div className="text-[9px] sm:text-[10px] text-text-muted/60 leading-tight mt-0.5 line-clamp-2">
            {minorStarsStr}
          </div>
        )}
      </div>

      {/* 四化標記 */}
      {allSihua.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {allSihua.map((sh, i) => (
            <span
              key={i}
              className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold ${SIHUA_COLORS[sh.type] || 'bg-white/10 text-text-muted'}`}
            >
              {sh.label}
            </span>
          ))}
        </div>
      )}

      {/* 大限年齡範圍 */}
      {daxianRange && (
        <div className={`text-[8px] sm:text-[9px] mt-1 text-center border-t pt-0.5 ${
          isCurrentDaxian ? 'text-cyan-300/80 border-cyan-500/20 font-semibold' : 'text-text-muted/30 border-white/[0.04]'
        }`}>
          {daxianRange}
        </div>
      )}
    </button>
  )
}

// ==========================================
// 主頁元件
// ==========================================
export default function ZiweiToolPage() {
  const [form, setForm] = useState({
    name: '', year: '1990', month: '1', day: '1', hour: '12', gender: 'M',
    calendarType: 'solar' as 'solar' | 'lunar',
    timeMode: 'shichen' as 'unknown' | 'shichen' | 'exact',
    exactHour: '12', exactMinute: '0',
    city: '', cityLat: 0, cityLng: 0, cityTz: 8,
  })
  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')
  const [result, setResult] = useState<ZiweiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [activePalace, setActivePalace] = useState<string | null>(null)

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

    let stepIdx = 0
    const stepInterval = setInterval(() => {
      if (stepIdx < ANALYSIS_STEPS.length) {
        setCompletedSteps(prev => [...prev, stepIdx])
        stepIdx++
        setCurrentStep(stepIdx)
      }
    }, ANALYSIS_STEPS[Math.min(stepIdx, ANALYSIS_STEPS.length - 1)]?.duration || 600)

    try {
      const res = await fetch('/api/free-ziwei', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(form.year), month: parseInt(form.month), day: parseInt(form.day),
          hour: form.timeMode === 'exact' ? parseInt(form.exactHour) : form.timeMode === 'shichen' ? parseInt(form.hour) : 12,
          gender: form.gender, name: form.name,
          calendar_type: form.calendarType,
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

  // 建構方盤資料：根據 palaceData 的 branch（地支）決定方盤位置
  function buildBoardData() {
    if (!result) return null
    // 先建立 branch → palaceName 的映射
    const branchToPalace: Record<string, string> = {}
    const branchToPalaceGan: Record<string, string> = {}
    const branchToSihuaTag: Record<string, string[]> = {}
    for (const [palaceName, data] of Object.entries(result.palaceData)) {
      if (data.branch) {
        // 取地支（可能是 "寅" 或 "寅宮" 格式）
        const branch = data.branch.replace('宮', '').trim()
        branchToPalace[branch] = palaceName
        if (data.palaceGan) branchToPalaceGan[branch] = data.palaceGan
        if (data.sihuaTag) branchToSihuaTag[branch] = data.sihuaTag
      }
    }
    // 計算大限範圍
    const wuxingju = typeof result.wuxingju === 'number' ? result.wuxingju : 2
    const daxianRanges = getDaxianRanges(wuxingju)

    // 建構 4x4 格資料
    const board: (null | {
      palaceName: string
      branch: string
      palaceGan?: string
      sihuaTag?: string[]
      mainStars: string
      minorStars: string
      daxianRange: string
    })[][] = Array.from({ length: 4 }, () => Array(4).fill(null))

    DIZHI_ORDER.forEach((branch, dizhiIndex) => {
      const pos = DIZHI_POSITION[branch]
      if (!pos) return
      const palaceName = branchToPalace[branch]
      if (!palaceName) {
        // 如果沒有映射到宮位，仍顯示空宮
        board[pos.row][pos.col] = {
          palaceName: '',
          branch,
          mainStars: '',
          minorStars: '',
          daxianRange: daxianRanges[dizhiIndex]
            ? `${daxianRanges[dizhiIndex].start}-${daxianRanges[dizhiIndex].end}`
            : '',
        }
        return
      }
      const data = result.palaceData[palaceName]
      board[pos.row][pos.col] = {
        palaceName,
        branch,
        palaceGan: branchToPalaceGan[branch],
        sihuaTag: branchToSihuaTag[branch],
        mainStars: data?.mainStars || '',
        minorStars: data?.minorStars || '',
        daxianRange: daxianRanges[dizhiIndex]
          ? `${daxianRanges[dizhiIndex].start}-${daxianRanges[dizhiIndex].end}`
          : '',
      }
    })

    return board
  }

  // 如果沒有足夠的 palaceData 有 branch 資訊，使用固定排列 fallback
  // 預設命宮逆時針排列十二宮（命宮→兄弟→夫妻→子女...）
  function buildBoardFallback() {
    if (!result) return null
    const wuxingju = typeof result.wuxingju === 'number' ? result.wuxingju : 2
    const daxianRanges = getDaxianRanges(wuxingju)

    // 找到命宮的 branch（如果有的話）
    const mingData = result.palaceData['命宮']
    const mingBranch = mingData?.branch?.replace('宮', '').trim() || '寅'
    const mingBranchIdx = DIZHI_ORDER.indexOf(mingBranch)

    const board: (null | {
      palaceName: string
      branch: string
      palaceGan?: string
      sihuaTag?: string[]
      mainStars: string
      minorStars: string
      daxianRange: string
    })[][] = Array.from({ length: 4 }, () => Array(4).fill(null))

    // 命宮→兄弟→夫妻... 在地支上是逆時針（地支越小）
    PALACE_ORDER.forEach((palaceName, palaceIdx) => {
      const branchIdx = ((mingBranchIdx - palaceIdx) % 12 + 12) % 12
      const branch = DIZHI_ORDER[branchIdx]
      const pos = DIZHI_POSITION[branch]
      if (!pos) return
      const data = result.palaceData[palaceName]
      board[pos.row][pos.col] = {
        palaceName,
        branch,
        palaceGan: data?.palaceGan,
        sihuaTag: data?.sihuaTag,
        mainStars: data?.mainStars || '',
        minorStars: data?.minorStars || '',
        daxianRange: daxianRanges[palaceIdx]
          ? `${daxianRanges[palaceIdx].start}-${daxianRanges[palaceIdx].end}`
          : '',
      }
    })

    return board
  }

  return (
    <div className="py-16 overflow-x-hidden max-w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2 break-words">
          <span className="text-gradient-gold">紫微斗數速算</span>
        </h1>
        <p className="text-center text-text-muted mb-2">排列紫微命盤 + 十四主星解讀 + 十二宮位分析</p>
        <p className="text-center text-xs text-text-muted/60 mb-4">不需註冊 &middot; 即時出結果 &middot; 完全免費</p>

        {/* 紫微斗數由來說明 */}
        <div className="max-w-2xl mx-auto mb-10">
          <details className="glass rounded-xl p-4 cursor-pointer">
            <summary className="text-sm font-medium text-gold-400 flex items-center gap-2">
              <span>&#128218;</span> 關於紫微斗數：帝王之學
            </summary>
            <div className="mt-3 text-xs text-text-muted/80 space-y-2 leading-relaxed">
              <p><strong className="text-white/90">紫微斗數的由來：</strong>紫微斗數相傳由宋代陳希夷（陳摶老祖）所創，是中國命理學中最精密的推命術之一，素有「帝王之學」的美譽。其名來自紫微星——北極星，古人認為它是天帝的居所，統領群星，因此紫微斗數以紫微星為核心，佈列十四主星於十二宮位，形成每個人獨一無二的命盤。</p>
              <p><strong className="text-white/90">核心原理：</strong>紫微斗數以農曆出生年月日時為基礎，將 108 顆星曜按照特定規則排入十二宮位（命宮、兄弟、夫妻、子女、財帛、疾厄、遷移、交友、事業、田宅、福德、父母），每顆星有廟旺利陷四種狀態，再搭配四化飛星（化祿、化權、化科、化忌）的流轉，推演一生各面向的吉凶起伏。</p>
              <p><strong className="text-white/90">鑒源的做法：</strong>本系統精確計算紫微星的安星起始位置，完整排列十四主星與輔星，並逐宮分析星曜組合的意涵。支援農曆／國曆輸入，閏月自動處理，確保命盤排列的準確性。</p>
            </div>
          </details>
        </div>

        {/* 分析進度動畫 */}
        {loading && !result && (
          <div className="max-w-lg mx-auto">
            <div className="glass rounded-2xl p-8">
              <h3 className="text-lg font-bold text-cream mb-6 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
                正在為 <span className="text-gold">{form.name}</span> 排列紫微命盤
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
                <p className="text-center text-gold mt-6 animate-pulse text-sm">命盤排列完畢，正在載入...</p>
              )}
            </div>
          </div>
        )}

        {/* 表單 */}
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
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">性別</label>
                  <div className="flex gap-4 pt-2">
                    {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="gender" value={v} checked={form.gender === v} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="accent-gold" />
                        <span className="text-base text-text">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
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
                    setForm({...form, city: val})
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
                          setForm({...form, city: `${r.city.name}（${r.city.country}）`, cityLat: r.city.lat, cityLng: r.city.lng, cityTz: r.city.tz})
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
                  <button type="button" onClick={() => { setNeedCityForCountry(''); setForm({...form, city: ''}); setCityResults([]) }}
                    className="text-xs text-gold/60 hover:text-gold mt-1 underline">取消，重新選擇國家</button>
                )}
                {form.cityLat !== 0 && (
                  <p className="text-[10px] text-text-muted/50 mt-1">經度 {form.cityLng.toFixed(2)}° | 時區 UTC{form.cityTz >= 0 ? '+' : ''}{form.cityTz}</p>
                )}
              </div>

              {/* 國曆/農曆 */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">曆法</label>
                <div className="flex rounded-lg overflow-hidden border border-gold/10">
                  {[{ v: 'solar' as const, l: '國曆（西曆）' }, { v: 'lunar' as const, l: '農曆' }].map(({ v, l }) => (
                    <button key={v} type="button"
                      onClick={() => setForm({ ...form, calendarType: v })}
                      className={`flex-1 py-2.5 text-sm font-medium transition-all ${form.calendarType === v ? 'bg-gold/20 text-gold' : 'bg-white/3 text-text-muted hover:bg-white/5'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.calendarType === 'lunar' && (
                  <p className="text-xs text-gold/60 mt-1.5">系統將自動轉換為國曆進行排盤計算</p>
                )}
              </div>

              {/* 出生日期 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">出生年</label>
                  <input type="number" min="1920" max="2025" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">{form.calendarType === 'lunar' ? '農曆月' : '月'}</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{form.calendarType === 'lunar' ? `${['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'][i]}月` : `${i + 1}月`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">{form.calendarType === 'lunar' ? '農曆日' : '日'}</label>
                  <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-3 text-cream text-base focus:border-gold/40 focus:outline-none">
                    {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{form.calendarType === 'lunar' ? `${['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'][i]}` : `${i + 1}日`}</option>)}
                  </select>
                </div>
              </div>

              {/* 出生時間 */}
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
                    紫微斗數高度依賴出生時辰，不確定時辰會影響命宮主星判定。
                    <span className="text-gold/70"> 強烈建議確認出生時間以獲得準確的紫微命盤。</span>
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

              <button type="submit" disabled={loading || !form.name.trim() || form.cityLat === 0}
                className={`w-full py-4 font-bold rounded-xl text-lg transition-all ${
                  form.name.trim() && form.cityLat !== 0
                    ? 'bg-gold text-dark btn-glow disabled:opacity-50'
                    : 'bg-white/10 text-text-muted cursor-not-allowed'
                }`}>
                開始紫微排盤
              </button>
              {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            </form>
          </div>
        )}

        {/* ===================== 結果展示區 ===================== */}
        {result && (
          <div className="space-y-8">
            <div className="text-center">
              <button onClick={() => { setResult(null); setActivePalace(null) }} className="text-sm text-gold hover:underline">&larr; 重新排盤</button>
            </div>

            {/* 命宮主星 — 人格封號 */}
            <div className="glass rounded-2xl p-8">
              <div className="text-center mb-6">
                <div className="inline-block px-4 py-1.5 rounded-full bg-gold/20 text-gold text-sm font-semibold mb-3">
                  {form.name} 的紫微命盤
                </div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  您是「<span className="text-gradient-gold">{result.starTitle}</span>」型人格
                </h2>
                <p className="text-sm text-text-muted">
                  命宮主星：{result.mainStar}（{result.starNature}）&middot; {result.yearTG}年生 &middot; {getWuxingJuName(result.wuxingju)}
                </p>
              </div>
              <p className="text-base text-text leading-[1.9] mb-6">{result.personality}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
                  <h4 className="text-sm font-bold text-green-400 mb-2">&#10003; 您的天生優勢</h4>
                  <p className="text-sm text-text leading-relaxed">{result.strengths}</p>
                </div>
                <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-5">
                  <h4 className="text-sm font-bold text-orange-400 mb-2">&#9888; 需要留意的地方</h4>
                  <p className="text-sm text-text leading-relaxed">{result.challenges}</p>
                </div>
              </div>
            </div>

            {/* ===================== 傳統紫微方盤 ===================== */}
            {Object.keys(result.palaceData).length > 0 && (() => {
              const board = buildBoardData() || buildBoardFallback()
              if (!board) return null
              return (
                <div className="glass rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-6 bg-gold rounded-full" />
                    <h2 className="text-lg font-bold text-white">紫微命盤</h2>
                    <span className="text-xs text-text-muted/50 ml-2">點擊宮位查看詳情</span>
                  </div>

                  {/* 手機版提示 */}
                  <p className="text-[10px] text-text-muted/40 text-center mb-3 sm:hidden">左右滑動查看完整命盤</p>

                  {/* 方盤容器 */}
                  <div className="overflow-x-auto pb-2">
                    <div className="min-w-[360px] sm:min-w-0">
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        {board.map((row, rowIdx) =>
                          row.map((cell, colIdx) => {
                            // 中間 2x2 區域：個人資料（專業版）
                            if (rowIdx >= 1 && rowIdx <= 2 && colIdx >= 1 && colIdx <= 2) {
                              if (rowIdx === 1 && colIdx === 1) {
                                // 從當前大限抽出宮名（如「田宅宮（35-44歲）」）
                                const dxPalaceName = result.currentDaxian?.match(/^([\u4e00-\u9fa5]+宮)/)?.[1] || ''
                                const yrPalaceName = result.yearFlow?.match(/(命宮|兄弟宮|夫妻宮|子女宮|財帛宮|疾厄宮|遷移宮|交友宮|事業宮|田宅宮|福德宮|父母宮)/)?.[1] || ''
                                return (
                                  <div
                                    key={`center`}
                                    className="col-span-2 row-span-2 rounded-lg border border-gold/30 bg-gradient-to-br from-gold/[0.06] via-transparent to-gold/[0.02] p-3 sm:p-4 flex flex-col items-center justify-center text-center"
                                    style={{ gridColumn: '2 / 4', gridRow: '2 / 4' }}
                                  >
                                    <div className="text-lg sm:text-xl font-bold text-gradient-gold mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                                      {form.name}
                                    </div>
                                    <div className="space-y-0.5 text-[10px] sm:text-xs text-text-muted leading-relaxed">
                                      <p>
                                        <span className="text-cream/70">性別：</span>
                                        <span className="text-cream">{form.gender === 'M' ? '乾造' : '坤造'}</span>
                                        <span className="text-cream/70 ml-2">生辰：</span>
                                        <span className="text-cream">{result.yearTG}年</span>
                                      </p>
                                      <p>
                                        <span className="text-cream/70">陽曆：</span>
                                        <span className="text-cream">{form.year}/{form.month}/{form.day}</span>
                                      </p>
                                      <div className="border-t border-gold/10 my-1.5" />
                                      <p>
                                        <span className="text-cream/70">命宮主星：</span>
                                        <span className="text-gold font-bold">{result.mainStar}</span>
                                      </p>
                                      <p>
                                        <span className="text-cream/70">五行局：</span>
                                        <span className="text-cream font-semibold">{getWuxingJuName(result.wuxingju)}</span>
                                      </p>
                                      {result.mingZhu && (
                                        <p>
                                          <span className="text-cream/70">命主：</span>
                                          <span className="text-purple-400 font-semibold">{result.mingZhu}</span>
                                          {result.shenZhu && (
                                            <>
                                              <span className="text-cream/70 ml-2">身主：</span>
                                              <span className="text-cyan-400 font-semibold">{result.shenZhu}</span>
                                            </>
                                          )}
                                        </p>
                                      )}
                                      <div className="border-t border-gold/10 my-1.5" />
                                      <p className="text-[10px]">
                                        <span className="text-cream/70">生年四化：</span>
                                      </p>
                                      <div className="flex gap-1 justify-center flex-wrap">
                                        {result.sihua.map((sh, i) => {
                                          const types = ['祿', '權', '科', '忌']
                                          const colors = ['bg-green-500/20 text-green-300 border-green-500/30', 'bg-blue-500/20 text-blue-300 border-blue-500/30', 'bg-purple-500/20 text-purple-300 border-purple-500/30', 'bg-red-500/20 text-red-300 border-red-500/30']
                                          return (
                                            <span key={i} className={`text-[9px] px-1 py-0.5 rounded border ${colors[i]}`}>
                                              {sh.replace('化' + types[i], '')}{types[i]}
                                            </span>
                                          )
                                        })}
                                      </div>
                                      {(result.currentDaxian || result.yearFlow) && (
                                        <>
                                          <div className="border-t border-gold/10 my-1.5" />
                                          {result.currentDaxian && (
                                            <p className="text-[10px]">
                                              <span className="text-cyan-400/80">當前大限：</span>
                                              <span className="text-cyan-300">{dxPalaceName || result.currentDaxian}</span>
                                            </p>
                                          )}
                                          {result.yearFlow && (
                                            <p className="text-[10px]">
                                              <span className="text-red-400/80">2026流年：</span>
                                              <span className="text-red-300">{yrPalaceName || '命宮'}</span>
                                            </p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              }
                              return null
                            }

                            // 外圈十二宮
                            if (!cell) {
                              return (
                                <div key={`${rowIdx}-${colIdx}`} className="min-h-[120px] sm:min-h-[140px] rounded-lg border border-white/[0.04] bg-white/[0.01] p-2 flex items-center justify-center">
                                  <span className="text-[10px] text-text-muted/20">空</span>
                                </div>
                              )
                            }

                            // 判斷是否為當前大限/流年/小限
                            const dxPalace = result.currentDaxian?.match(/^([\u4e00-\u9fa5]+宮)/)?.[1] || ''
                            const yrPalace = result.yearFlow?.match(/(命宮|兄弟宮|夫妻宮|子女宮|財帛宮|疾厄宮|遷移宮|交友宮|事業宮|田宅宮|福德宮|父母宮)/)?.[1] || ''
                            const xxPalace = result.currentXiaoxian?.match(/^([\u4e00-\u9fa5]+宮)/)?.[1] || ''

                            return (
                              <PalaceCell
                                key={`${rowIdx}-${colIdx}`}
                                palaceName={cell.palaceName}
                                branch={cell.branch}
                                palaceGan={cell.palaceGan}
                                mainStarsStr={cell.mainStars}
                                minorStarsStr={cell.minorStars}
                                sihua={result.sihua}
                                sihuaTag={cell.sihuaTag}
                                isActive={activePalace === cell.palaceName}
                                onClick={() => setActivePalace(activePalace === cell.palaceName ? null : cell.palaceName)}
                                daxianRange={cell.daxianRange}
                                isCurrentDaxian={!!dxPalace && cell.palaceName === dxPalace}
                                isCurrentYear={!!yrPalace && cell.palaceName === yrPalace}
                                isXiaoxian={!!xxPalace && cell.palaceName === xxPalace}
                              />
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 圖例 */}
                  <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-white/[0.06]">
                    <span className="text-[10px] text-text-muted/40">四化：</span>
                    {[
                      { label: '祿', desc: '財運亨通', cls: 'bg-green-500/20 text-green-400' },
                      { label: '權', desc: '權勢掌握', cls: 'bg-blue-500/20 text-blue-400' },
                      { label: '科', desc: '聲名遠播', cls: 'bg-purple-500/20 text-purple-400' },
                      { label: '忌', desc: '困頓磨練', cls: 'bg-red-500/20 text-red-400' },
                    ].map(item => (
                      <span key={item.label} className="flex items-center gap-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${item.cls}`}>{item.label}</span>
                        <span className="text-[10px] text-text-muted/40">{item.desc}</span>
                      </span>
                    ))}
                    <span className="text-[10px] text-text-muted/30 ml-2">|</span>
                    <span className="flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/30 text-cyan-300 font-bold">當運</span>
                      <span className="text-[10px] text-text-muted/40">當前大限</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.5 rounded-full bg-red-500 text-white font-bold">流</span>
                      <span className="text-[10px] text-text-muted/40">流年</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-500 text-white font-bold">小</span>
                      <span className="text-[10px] text-text-muted/40">小限</span>
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* 三方四正 + 運限資訊 */}
            {(result.currentDaxian || result.triplePairs?.length || result.daxianStars) && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-cyan-500 rounded-full" />
                  <h2 className="text-lg font-bold text-cream">運限與三方四正</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.currentDaxian && (
                    <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4">
                      <h4 className="text-sm font-bold text-cyan-400 mb-2">當前大限</h4>
                      <p className="text-sm text-text">{result.currentDaxian}</p>
                      {result.daxianStars && (
                        <p className="text-xs text-cyan-300/70 mt-2">大限飛星：{result.daxianStars}</p>
                      )}
                      {result.currentXiaoxian && (
                        <p className="text-xs text-blue-300/70 mt-1">小限：{result.currentXiaoxian}</p>
                      )}
                    </div>
                  )}
                  {result.yearFlow && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                      <h4 className="text-sm font-bold text-red-400 mb-2">2026 流年</h4>
                      <p className="text-sm text-text">{result.yearFlow}</p>
                    </div>
                  )}
                </div>
                {result.triplePairs && result.triplePairs.length > 0 && (
                  <div className="mt-4 rounded-xl bg-purple-500/10 border border-purple-500/20 p-4">
                    <h4 className="text-sm font-bold text-purple-400 mb-2">三方四正飛化</h4>
                    <div className="space-y-1">
                      {result.triplePairs.map((tp, i) => (
                        <p key={i} className="text-sm text-text">&bull; {tp}</p>
                      ))}
                    </div>
                    <p className="text-[10px] text-purple-300/50 mt-2 italic">三方四正：本宮、對宮、財帛宮、官祿宮之間的能量流動</p>
                  </div>
                )}
              </div>
            )}

            {/* 選中宮位的詳情展開 */}
            {activePalace && result.palaceData[activePalace] && (
              <div className="glass rounded-2xl p-6 border border-gold/20 animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-gold">{activePalace}</h3>
                  <button onClick={() => setActivePalace(null)} className="text-xs text-text-muted/50 hover:text-text-muted">收起</button>
                </div>
                <p className="text-xs text-text-muted/60 mb-3">{PALACE_DESC[activePalace] || ''}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-muted/50 mb-1">主星</p>
                    <p className="text-sm text-gold font-bold">{result.palaceData[activePalace].mainStars || '無主星'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted/50 mb-1">地支</p>
                    <p className="text-sm text-cream">{result.palaceData[activePalace].branch}</p>
                  </div>
                  {result.palaceData[activePalace].minorStars && (
                    <div className="col-span-2">
                      <p className="text-xs text-text-muted/50 mb-1">輔星</p>
                      <p className="text-sm text-text">{result.palaceData[activePalace].minorStars}</p>
                    </div>
                  )}
                  {getPalaceSihua(result.palaceData[activePalace].mainStars, result.sihua).length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-text-muted/50 mb-1">四化飛星</p>
                      <div className="flex gap-2">
                        {getPalaceSihua(result.palaceData[activePalace].mainStars, result.sihua).map((sh, i) => (
                          <span key={i} className={`text-xs px-2 py-1 rounded-full font-bold ${SIHUA_COLORS[sh.type] || ''}`}>
                            化{sh.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 六大維度分析 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: '事業方向', text: result.career, icon: '&#128188;', color: 'border-blue-500/20 bg-blue-500/5' },
                { title: '感情特質', text: result.love, icon: '&#10084;&#65039;', color: 'border-pink-500/20 bg-pink-500/5' },
                { title: '健康提醒', text: result.health, icon: '&#127973;', color: 'border-green-500/20 bg-green-500/5' },
                { title: '2026年運勢', text: result.year2026, icon: '&#9733;', color: 'border-yellow-500/20 bg-yellow-500/5' },
              ].map(item => (
                <div key={item.title} className={`rounded-xl border p-5 ${item.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    <h4 className="text-base font-bold text-white">{item.title}</h4>
                  </div>
                  <p className="text-sm text-text leading-[1.8]">{item.text}</p>
                </div>
              ))}
            </div>

            {/* 幸運元素 — 開運指南 */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-base font-bold text-gold mb-3">&#128161; 您的開運指南</h3>
              <p className="text-base text-text leading-[1.8]">{result.lucky}</p>
            </div>

            {/* 四化星 */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-purple-500 rounded-full" />
                <h2 className="text-lg font-bold text-cream">四化飛星（{result.yearTG}年）</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {result.sihua.map((sh, i) => {
                  const types = ['化祿', '化權', '化科', '化忌']
                  const colors = ['text-green-400', 'text-blue-400', 'text-purple-400', 'text-red-400']
                  const bgs = ['bg-green-500/10', 'bg-blue-500/10', 'bg-purple-500/10', 'bg-red-500/10']
                  return (
                    <div key={i} className={`rounded-lg p-4 text-center ${bgs[i]}`}>
                      <div className={`text-xs ${colors[i]} mb-1`}>{types[i]}</div>
                      <div className="text-base font-bold text-white">{sh}</div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-text-muted/60 mt-3">
                化祿主財運亨通、化權主權勢掌握、化科主聲名遠播、化忌主困頓磨練
              </p>
            </div>

            {/* AI 深度解讀 */}
            {result.hasAi && result.aiAnalysis && (
              <AIAnalysisCard text={result.aiAnalysis} title="命盤深度解讀" accentColor="amber" />
            )}

            {/* 速算概覽提示 */}
            <p className="text-xs text-text-muted/50 text-center">以上為命宮主星速算概覽，完整報告將根據您的完整命盤做 15 系統個人化深度分析</p>

            {/* 升級引導 */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(26,58,92,0.4))' }}>
              <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    紫微斗數只是 15 套系統中的 <span className="text-gradient-gold">1 套</span>
                  </h3>
                  <p className="text-base text-text max-w-2xl mx-auto leading-relaxed">
                    完整報告還會融合<strong className="text-white">八字、奇門遁甲、西洋占星、姓名學</strong>等 14 套命理體系，
                    從多維度交叉驗證，為您呈現一份真正全面的命格分析。
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128218;</div>
                    <h4 className="font-bold text-white mb-1">15 系統交叉驗證</h4>
                    <p className="text-sm text-text-muted">東西方命理系統互相印證，結論更可靠</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128202;</div>
                    <h4 className="font-bold text-white mb-1">11 章 30,000字+ 深度報告</h4>
                    <p className="text-sm text-text-muted">從命格名片到刻意練習，涵蓋人生全面向</p>
                  </div>
                  <div className="glass rounded-xl p-5 text-center">
                    <div className="text-3xl mb-2">&#128230;</div>
                    <h4 className="font-bold text-white mb-1">精美 PDF 永久保存</h4>
                    <p className="text-sm text-text-muted">隨時回顧，也可以分享給信任的人</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
                    {(['C', 'D'] as const).map((plan, idx) => {
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
                        city: form.city,
                        cityLat: String(form.cityLat),
                        cityLng: String(form.cityLng),
                        cityTz: String(form.cityTz),
                      })
                      const label = idx === 0 ? '解鎖人生藍圖完整報告 $89' : '聚焦單一困惑深度分析 $39'
                      const cls = idx === 0
                        ? 'px-10 py-4 bg-gold text-dark font-bold rounded-xl text-lg btn-glow'
                        : 'px-10 py-4 glass text-white font-semibold rounded-xl text-lg hover:bg-white/10'
                      return <a key={plan} href={`/checkout?${q}`} className={cls}>{label}</a>
                    })}
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 text-xs text-text-muted/60 mb-4">
                    <span>&#128274; Stripe 安全支付</span>
                    <span>&#9889; 約30-60分鐘出報告</span>
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
