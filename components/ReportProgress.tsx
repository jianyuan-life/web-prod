'use client'

import { useEffect, useState } from 'react'

const ALL_SYSTEMS = [
  { name: '八字命理', icon: '☰' },
  { name: '紫微斗數', icon: '★' },
  { name: '奇門遁甲', icon: '☯' },
  { name: '西洋占星', icon: '♌' },
  { name: '吠陀占星', icon: '✦' },
  { name: '易經六爻', icon: '☱' },
  { name: '姓名學',   icon: '文' },
  { name: '風水學',   icon: '宅' },
  { name: '人類圖',   icon: '◈' },
  { name: '塔羅牌',   icon: '牌' },
  { name: '數字命理', icon: '∞' },
  { name: '古典命理', icon: '⊕' },
  { name: '生肖命理', icon: '肖' },
  { name: '生物節律', icon: '律' },
  { name: '南洋術數', icon: '術' },
]

// 各方案使用系統數 + 預估總分鐘數（以「下限」作為基準）
const PLAN_CONFIG: Record<string, { systems: number; minMinutes: number; maxMinutes: number; label: string }> = {
  C:   { systems: 15, minMinutes: 30, maxMinutes: 60, label: '全方位命理分析' },
  D:   { systems: 0,  minMinutes: 25, maxMinutes: 45, label: '深度主題分析' },
  G15: { systems: 15, minMinutes: 40, maxMinutes: 70, label: '家族命理分析' },
  R:   { systems: 0,  minMinutes: 30, maxMinutes: 50, label: '合盤關係分析' },
  E1:  { systems: 1,  minMinutes: 35, maxMinutes: 55, label: '事件出門訣排算' },
  E2:  { systems: 1,  minMinutes: 40, maxMinutes: 65, label: '月度 360 時辰排算' },
}

// 分析階段 — 溫度化文案（第二人稱、強調「為您」）
const PHASES_DEFAULT = [
  { label: '為您起盤',   desc: '正在為您起盤推算，調取命理基礎數據' },
  { label: '命格分析',   desc: '分析您的命格結構、五行格局與關鍵節點' },
  { label: '深度解讀',   desc: '多系統交叉驗證，撰寫專屬於您的解讀' },
  { label: '整合報告',   desc: '彙整所有系統結論，即將生成完整報告' },
]

const PHASES_CHUMENJI = [
  { label: '奇門起局',   desc: '以時家奇門遁甲為您起局，計算天地盤干支' },
  { label: '時辰掃描',   desc: '逐時辰排算八方位吉凶，25 層古籍理論評分' },
  { label: '方位評分',   desc: '三吉門、九遁、天地盤生剋、神煞交叉驗證' },
  { label: '出門訣生成', desc: '套入您的年命宮驗證，產出最佳吉時方位' },
]

function getPhases(planCode: string) {
  return ['E1', 'E2'].includes(planCode) ? PHASES_CHUMENJI : PHASES_DEFAULT
}

// 命理小知識——讓客戶在等待時學到東西
const FACTS_DEFAULT = [
  '八字中的「食神」代表創造力與口福，食神旺的人天生懂得享受生活。',
  '紫微斗數起源於宋朝，由陳希夷創立，距今已有千年歷史。',
  '西洋占星的上升星座代表你給人的第一印象，比太陽星座更影響外在表現。',
  '人類圖結合了易經、卡巴拉、脈輪和西洋占星四大體系，1987 年才被創立。',
  '八字的「日主」就是你出生那天的天干，它代表你的核心性格。',
  '紫微斗數共有 14 顆主星，分布在 12 個宮位中，形成獨一無二的命盤。',
  '奇門遁甲被稱為「帝王之術」，古代只有皇室才能使用。',
  '姓名學的康熙筆畫跟現代筆畫不同——「草」字康熙筆畫是 12 畫，不是 9 畫。',
  '八字中五行平衡的人不到 5%，大多數人都有某種五行偏重。',
  '吠陀占星比西洋占星早了兩千年，起源於古印度吠陀經典。',
]
const FACTS_CHUMENJI = [
  '奇門遁甲的「遁」指的是天干中的「甲」被隱藏，藏在六儀之下。',
  '時家奇門遁甲共有 1,080 局，由節氣和時辰決定。',
  '出門訣的核心是「接引吉方能量」——到達吉方定點後需停留 40 分鐘讓能量灌滿。',
  '奇門遁甲的八門中，「開門」「休門」「生門」是三吉門，最適合出行。',
  '出門訣的「九遁」包括天遁、地遁、人遁等 9 種特殊吉格，遇到任一種都是大吉。',
  '奇門遁甲中的「值使門」是當值的門神，它的落宮方位影響整個時辰的吉凶。',
]

function FunFacts({ planCode }: { planCode: string }) {
  const [idx, setIdx] = useState(0)
  const facts = ['E1', 'E2'].includes(planCode) ? FACTS_CHUMENJI : FACTS_DEFAULT

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx(prev => (prev + 1) % facts.length)
    }, 15_000) // 每 15 秒換一條（保持新鮮感）
    return () => clearInterval(timer)
  }, [facts.length])

  // 支援手動下一條（提升互動感）
  const next = () => setIdx(prev => (prev + 1) % facts.length)
  const prev = () => setIdx(prevIdx => (prevIdx - 1 + facts.length) % facts.length)

  return (
    <div className="bg-gradient-to-r from-gold/10 via-gold/5 to-transparent border border-gold/15 rounded-lg px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="text-gold text-base flex-shrink-0 mt-0.5">&#9733;</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gold/75 font-medium tracking-wide">
              邊等邊學｜命理小知識 <span className="text-gold/40">({idx + 1}/{facts.length})</span>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={prev}
                aria-label="上一條"
                className="w-5 h-5 flex items-center justify-center rounded text-gold/50 hover:text-gold hover:bg-gold/10 transition-colors text-xs"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="下一條"
                className="w-5 h-5 flex items-center justify-center rounded text-gold/50 hover:text-gold hover:bg-gold/10 transition-colors text-xs"
              >
                ›
              </button>
            </div>
          </div>
          <p className="text-sm text-cream/90 leading-relaxed transition-opacity duration-500">
            {facts[idx]}
          </p>
        </div>
      </div>
    </div>
  )
}

function getPhaseIndex(pct: number) {
  if (pct < 25) return 0
  if (pct < 55) return 1
  if (pct < 85) return 2
  return 3
}

interface GenerationProgress {
  step?: string
  progress?: number
  message?: string
  progress_updated_at?: string
  // v5.3.32：Call N 已寫字數（後端串流時每 3000 字更新一次）
  'Call 1'?: string
  'Call 2'?: string
  'Call 3'?: string
  'Call 1_updated'?: string
  'Call 2_updated'?: string
  'Call 3_updated'?: string
  [key: string]: unknown
}

// v5.3.32：Call N 預期字數（與後端 CALL_EXPECTED_CHARS 對齊）
// Call 1 = 0-30%, Call 2 = 30-60%, Call 3 = 60-90%, 剩 10% 留給 PDF/Storage/Email
const CALL_EXPECTED_CHARS_FRONT: Record<string, number> = {
  'Call 1': 18000,
  'Call 2': 15000,
  'Call 3': 13000,
}

// 從 generation_progress 的 Call 1/2/3 實際字數推算真實進度（最可信）
// 回傳 { pct, latestUpdate, stage }，用不到時回 null 讓呼叫端 fallback
function computeRealPctFromCallChars(gp: GenerationProgress | null | undefined): {
  pct: number
  latestUpdate: number
  stage: string
  writtenChars: number
} | null {
  if (!gp) return null
  const call1 = typeof gp['Call 1'] === 'string' ? gp['Call 1']!.length : 0
  const call2 = typeof gp['Call 2'] === 'string' ? gp['Call 2']!.length : 0
  const call3 = typeof gp['Call 3'] === 'string' ? gp['Call 3']!.length : 0

  if (call1 === 0 && call2 === 0 && call3 === 0) return null

  // Call 3 有內容 → 60-90%
  // Call 2 有內容 → 30-60%
  // 只有 Call 1 有內容 → 0-30%
  let base = 10
  let span = 30
  let written = call1
  let stage = 'Call 1'
  if (call3 > 0) {
    base = 65; span = 25; written = call3; stage = 'Call 3'
  } else if (call2 > 0) {
    base = 40; span = 25; written = call2; stage = 'Call 2'
  }
  const expected = CALL_EXPECTED_CHARS_FRONT[stage] || 15000
  const ratio = Math.min(written / expected, 1)
  const pct = Math.min(Math.round(base + ratio * span), 90)

  // 取最新的 Call N_updated 時間戳
  const ts1 = gp['Call 1_updated'] ? new Date(gp['Call 1_updated']!).getTime() : 0
  const ts2 = gp['Call 2_updated'] ? new Date(gp['Call 2_updated']!).getTime() : 0
  const ts3 = gp['Call 3_updated'] ? new Date(gp['Call 3_updated']!).getTime() : 0
  const latestUpdate = Math.max(ts1, ts2, ts3)

  return { pct, latestUpdate, stage, writtenChars: written }
}

export default function ReportProgress({ createdAt, planCode, generationProgress }: {
  createdAt: string
  planCode: string
  generationProgress?: GenerationProgress | null
}) {
  const [pct, setPct] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [realMessage, setRealMessage] = useState<string | null>(null)
  const [showWhyLong, setShowWhyLong] = useState(false)
  // v5.3.32：追蹤「真實進度已 N 分鐘沒更新」警告
  const [backendSilentMin, setBackendSilentMin] = useState(0)

  const cfg = PLAN_CONFIG[planCode] ?? PLAN_CONFIG['C']
  const systems = ALL_SYSTEMS.slice(0, cfg.systems)
  // 用「上限」作為時間基準，讓 pct 走得穩，不會超過 97% 又完不成
  const totalMs = cfg.maxMinutes * 60 * 1000

  // v5.3.32：三層進度來源（優先序：字數 > progress 欄位 > 時間估算）
  //   1. Call 1/2/3 字數：最可信，反映 AI 實際寫作進度
  //   2. generation_progress.progress（emitProgress 明確寫入的階段值：10/40/60/70/90/95）
  //   3. 時間估算：沒有任何後端訊號時的 fallback
  const callProgress = computeRealPctFromCallChars(generationProgress)
  const hasCallChars = callProgress !== null

  // 判斷 emitProgress 欄位是否有效（2 分鐘內有更新）
  const hasEmitProgress = !!(
    generationProgress?.progress != null &&
    generationProgress?.progress_updated_at &&
    (Date.now() - new Date(generationProgress.progress_updated_at).getTime()) < 120_000
  )

  useEffect(() => {
    const update = () => {
      // 來源 1：Call N 字數（最可信）
      if (hasCallChars && callProgress) {
        // 計算「後端多久沒更新」——超過 5 分鐘就提示
        const silentMs = Date.now() - callProgress.latestUpdate
        const silentMin = Math.floor(silentMs / 60000)
        setBackendSilentMin(silentMin)

        setPct(callProgress.pct)
        setCompleted(Math.min(Math.floor((callProgress.pct / 100) * cfg.systems), cfg.systems - 1))
        setRealMessage(
          `${callProgress.stage} 正在為您撰寫（已完成 ${callProgress.writtenChars.toLocaleString()} 字）`,
        )
        return
      }

      // 來源 2：emitProgress 階段值（排盤/品質檢查/儲存/寄信等非 AI 寫作階段）
      if (hasEmitProgress && generationProgress) {
        const realPct = Math.min(Math.max(generationProgress.progress || 0, 0), 97)
        setPct(realPct)
        setCompleted(Math.min(Math.floor((realPct / 100) * cfg.systems), cfg.systems - 1))
        setRealMessage(generationProgress.message || null)
        setBackendSilentMin(0)
        return
      }

      // 來源 3：時間估算 fallback（初始化階段或後端完全沒訊號）
      // 關鍵修復：不再直接跳到 97%！只走到 25%（Call 1 通常 3-5 分鐘完成首次存檔）
      // 之後必須靠後端真實字數接手，否則一律卡在 25%，讓「卡住提示」觸發
      setRealMessage(null)
      const createdTime = new Date(createdAt).getTime()
      if (isNaN(createdTime) || totalMs <= 0) {
        setPct(0)
        return
      }
      const elapsed = Date.now() - createdTime
      // 時間估算 fallback 上限 25%，防止「假 97%」欺騙客戶
      const fallbackCap = 25
      const rawPct = Math.min(Math.round((elapsed / (5 * 60 * 1000)) * fallbackCap), fallbackCap)
      setPct(rawPct)
      setCompleted(Math.min(Math.floor((rawPct / 100) * cfg.systems), cfg.systems - 1))
      // Call 1 串流首存檔前 5 分鐘若無任何字數訊號，也當「後端可能卡住」
      const elapsedMin = Math.floor(elapsed / 60000)
      if (elapsedMin >= 5 && !hasCallChars && !hasEmitProgress) {
        setBackendSilentMin(elapsedMin)
      } else {
        setBackendSilentMin(0)
      }
    }
    update()
    const timer = setInterval(update, 15_000)
    return () => clearInterval(timer)
  }, [createdAt, totalMs, cfg.systems, hasCallChars, callProgress, hasEmitProgress, generationProgress])

  const phases = getPhases(planCode)
  const phaseIdx = getPhaseIndex(pct)
  const phase = phases[phaseIdx]
  const createdTime = new Date(createdAt).getTime()
  const elapsedMin = isNaN(createdTime) ? 0 : Math.round((Date.now() - createdTime) / 60000)
  // 剩餘時間：用區間表達，給下限到上限的範圍
  const remainMinMin = Math.max(cfg.minMinutes - elapsedMin, 0)
  const remainMinMax = Math.max(cfg.maxMinutes - elapsedMin, 1)
  // 剩餘時間策略：
  // - 97%+ → 已到收尾，明確告知正在撰寫
  // - 超過上限 → 即將完成，請再稍候
  // - 剩下 1 分鐘內 → 1 分鐘內完成
  // - pct > 80（後期） → 改用「單一估值」減少範圍不確定感（回應 deepseek）
  // - 前期中期 → 用區間
  const midRemain = Math.max(Math.ceil((remainMinMin + remainMinMax) / 2), 1)
  const remainText =
    pct >= 97
      ? '即將完成，AI 正在為您撰寫最後章節'
      : elapsedMin >= cfg.maxMinutes
        ? '即將完成，請再稍候'
        : remainMinMin === 0
          ? `預計 1 分鐘內完成`
          : pct > 80
            ? `預計剩餘約 ${midRemain} 分鐘`
            : `預計剩餘 ${remainMinMin}-${remainMinMax} 分鐘`
  // v5.3.32：卡住警示升級為「後端真實沈默 > 5 分鐘」OR 「時間超過上限 20%」
  //   - backendSilentMin：後端最後一次寫入字數/進度距今分鐘數（>5 即視為可能卡住）
  //   - elapsedMin 超時：時間估算的退路
  const isStuck = backendSilentMin >= 5 || elapsedMin > Math.round(cfg.maxMinutes * 1.2)
  // v5.3.32：嚴重卡住（>20 分鐘無後端訊號），主動建議聯絡客服
  const isCriticalStuck = backendSilentMin >= 20

  // 進度描述：前綴加上「第 X/4 步」，讓客戶一眼看到階段位置（回應 gemini）
  const stepPrefix = `第 ${phaseIdx + 1}/${phases.length} 步`
  const progressDesc = realMessage
    ? realMessage
    : `${stepPrefix}｜${phase.desc}`

  return (
    <div className="mt-4 space-y-4">

      {/* 階段指示器（手機版也顯示文字）*/}
      <div className="flex items-start gap-1">
        {phases.map((p, i) => (
          <div key={i} className="flex items-start flex-1 min-w-0">
            <div className={`flex flex-col items-center flex-1 min-w-0 ${i <= phaseIdx ? 'opacity-100' : 'opacity-35'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all duration-700 ${
                i < phaseIdx ? 'bg-gold text-dark shadow-[0_0_8px_rgba(201,168,76,0.4)]' :
                i === phaseIdx ? 'bg-gold/20 border border-gold text-gold animate-pulse ring-2 ring-gold/20' :
                'bg-white/5 border border-white/10 text-white/30'
              }`}>
                {i < phaseIdx ? '✓' : i + 1}
              </div>
              {/* 手機版 text-[9px]，桌機 text-[10px]——永遠顯示，不再 hidden */}
              <span className={`mt-1 text-center text-[9px] sm:text-[10px] leading-tight px-0.5 ${
                i === phaseIdx ? 'text-gold font-medium' :
                i < phaseIdx ? 'text-gold/50' :
                'text-white/25'
              }`}>
                {p.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div className={`h-px flex-1 max-w-[20px] mx-0.5 mt-3 flex-shrink-0 ${i < phaseIdx ? 'bg-gold/40' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      {/* 進度條 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="text-gold/90 font-medium truncate">{progressDesc}</span>
          <span className="text-gold tabular-nums font-semibold flex-shrink-0">{pct}%</span>
        </div>
        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full transition-all duration-[2000ms] ease-out relative overflow-hidden"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #8b6914 0%, #c9a84c 50%, #e8c97a 100%)',
            }}
          >
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)', animation: 'shimmer 2s infinite' }} />
          </div>
        </div>
        {/* 剩餘時間用「友善的一整句」放在進度條下方 */}
        <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
          <div className="flex items-center gap-1.5 text-text-muted/85">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse flex-shrink-0" />
            <span>您的報告正在精心製作中，精彩即將呈現</span>
          </div>
          <span className="text-gold/80 tabular-nums flex-shrink-0 font-medium">{remainText}</span>
        </div>
        {/* 進度條意義說明（回應 gpt：部分用戶不明白進度條意義）*/}
        <div className="text-[10px] text-text-muted/60 leading-relaxed pt-0.5">
          不關閉此頁亦可，報告完成會自動寄信通知您｜進度條反映引擎精算當前深度，並非單純倒數計時
        </div>
      </div>

      {/* 系統格子（出門訣方案不顯示） */}
      {cfg.systems > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {systems.map((s, i) => (
            <div key={s.name} title={s.name}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all duration-700 ${
                i < completed
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : i === completed
                  ? 'bg-white/5 text-gold/60 border border-gold/15 animate-pulse'
                  : 'bg-white/[0.03] text-white/25 border border-white/5'
              }`}>
              <span className="text-[10px]">{s.icon}</span>
              <span>{i < completed ? '✓' : i === completed ? '分析中' : s.name.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 安心保證 — 直接告訴客戶「你的付款和資料絕對安全」*/}
      <div className="flex items-start gap-2 text-xs text-emerald-200/95 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3.5 py-2.5 leading-relaxed">
        <span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>
        <div className="space-y-0.5">
          <div className="text-emerald-300 font-medium">我們在為您精心製作報告，請放心等候</div>
          <div className="text-emerald-200/80">
            付款已收妥、資料已加密保存。即使關閉此頁，報告完成時會自動寄信通知您，絕對不會遺失。
          </div>
        </div>
      </div>

      {/* 「為什麼需要這麼久？」可展開說明 — 緩解焦慮的核心 */}
      <div className="text-[11px]">
        <button
          type="button"
          onClick={() => setShowWhyLong(v => !v)}
          className="inline-flex items-center gap-1 text-gold/70 hover:text-gold transition-colors underline-offset-2 hover:underline"
        >
          <span>{showWhyLong ? '▾' : '▸'}</span>
          <span>為什麼需要 {cfg.minMinutes}–{cfg.maxMinutes} 分鐘？</span>
        </button>
        {showWhyLong && (
          <div className="mt-2 pl-3 border-l-2 border-gold/20 space-y-2 text-text-muted/85">
            <p className="leading-relaxed">
              {['E1', 'E2'].includes(planCode) ? (
                <>鑑源奇門遁甲需排算 {planCode === 'E2' ? '360 個時辰' : '事件前後所有可用時辰'}，每個時辰都要檢驗
                  三吉門、九遁、神煞、年命宮生剋等 25 層古籍規則，再交叉驗證，
                  才能挑出真正能為您接引吉方能量的最佳時辰。我們寧可多花時間，也不讓您用錯時辰。</>
              ) : (
                <>您的報告會同步引用多套命理系統（八字、紫微、奇門、占星、人類圖、塔羅…），
                  每一套都由 AI 依您的命盤個別分析後，再進行「交叉驗證」與「個人化整合」，
                  確保內容是為您量身打造，而不是套模版。深度分析需要時間，請放心等待。</>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {phases.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={`flex-shrink-0 ${i === phaseIdx ? 'text-gold' : 'text-gold/40'}`}>
                    {i + 1}.
                  </span>
                  <span className={i === phaseIdx ? 'text-cream/90' : 'text-text-muted/75'}>
                    <strong className="font-medium">{p.label}</strong>——{p.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 命理小知識輪播 — 讓等待時間有價值 */}
      <FunFacts planCode={planCode} />

      {/* 邊等邊有事做（焦慮緩解 + 推薦引流 + 免費工具引流）*/}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-gold/80 font-medium tracking-wide">
          <span className="text-gold">◈</span>
          <span>等報告時不無聊，讓我們一起探索命理的奧秘</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a
            href="/dashboard#referral"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gradient-to-br from-gold/8 to-transparent border border-gold/15 hover:border-gold/40 hover:from-gold/12 transition-all group"
          >
            <span className="text-gold text-lg flex-shrink-0 group-hover:scale-110 transition-transform">◆</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-cream font-medium">分享給朋友，雙方都有獎</div>
              <div className="text-[10px] text-text-muted/80 mt-0.5 leading-snug">朋友註冊您得 3 點，首購再得 10 點</div>
            </div>
            <span className="text-gold text-xs group-hover:translate-x-0.5 transition-transform flex-shrink-0">→</span>
          </a>
          <a
            href="/tools/bazi"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gradient-to-br from-gold/8 to-transparent border border-gold/15 hover:border-gold/40 hover:from-gold/12 transition-all group"
          >
            <span className="text-gold text-lg flex-shrink-0 group-hover:scale-110 transition-transform">✦</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-cream font-medium">先玩免費排盤工具</div>
              <div className="text-[10px] text-text-muted/80 mt-0.5 leading-snug">八字 / 紫微 / 奇門，即時體驗</div>
            </div>
            <span className="text-gold text-xs group-hover:translate-x-0.5 transition-transform flex-shrink-0">→</span>
          </a>
        </div>
      </div>

      {/* 卡住警示：後端超過 5 分鐘無進度 or 時間超出上限 */}
      {isStuck && !isCriticalStuck && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-xs text-amber-200/90 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 flex-shrink-0">&#9888;</span>
            <div className="space-y-1">
              <div>
                <strong className="text-amber-300">分析深度超出預期，已為您優先處理</strong>
                ——您的命盤較為複雜，AI 正在加碼運算，請放心。
              </div>
              <div className="text-amber-200/75">
                建議您可以先關閉此頁稍後回來，報告完成時會自動寄信到您的信箱。
                若等候超過 2 小時仍未完成，請來信{' '}
                <a href="mailto:support@jianyuan.life" className="underline font-medium hover:text-amber-100">
                  support@jianyuan.life
                </a>
                ，我們會立刻為您處理。您的資料與付款皆已完整保存，報告不會遺失。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v5.3.32：嚴重卡住警示 — 後端超過 20 分鐘完全無訊號，主動建議聯絡客服 */}
      {isCriticalStuck && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-200/95 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-red-400 flex-shrink-0">&#9888;</span>
            <div className="space-y-1">
              <div>
                <strong className="text-red-300">後端處理中，請稍候</strong>
                ——系統已偵測到您的報告已超過 {backendSilentMin} 分鐘沒有新進度更新，我們的工程團隊會主動關注您的案件。
              </div>
              <div className="text-red-200/80">
                若等候超過 20 分鐘仍未完成，請直接來信{' '}
                <a href="mailto:support@jianyuan.life" className="underline font-medium hover:text-red-100">
                  support@jianyuan.life
                </a>
                ，附上您的訂單信箱，我們將於最短時間內為您處理。您的付款與資料皆已完整保存，報告不會遺失。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
