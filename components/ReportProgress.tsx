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

// 各方案使用系統數 + 預估總分鐘數
const PLAN_CONFIG: Record<string, { systems: number; totalMinutes: number; label: string }> = {
  C:   { systems: 15, totalMinutes: 30, label: '全方位命理分析' },
  D:   { systems: 0,  totalMinutes: 30, label: '深度主題分析' },
  G15: { systems: 15, totalMinutes: 45, label: '家族命理分析' },
  R:   { systems: 0,  totalMinutes: 35, label: '合盤關係分析' },
  E1:  { systems: 1,  totalMinutes: 40, label: '事件出門訣排算' },
  E2:  { systems: 1,  totalMinutes: 45, label: '月盤 360 時辰排算' },
}

// 分析階段定義（依方案不同顯示不同文字）
const PHASES_DEFAULT = [
  { label: '排盤運算',   desc: '調取東西方十五大命理系統，逐一起盤推算' },
  { label: '命理解析',   desc: '分析命格結構、五行格局、關鍵節點' },
  { label: '深度分析',   desc: '多系統交叉驗證，撰寫個人化解讀' },
  { label: '整合報告',   desc: '彙整所有系統結論，生成完整報告' },
]

const PHASES_CHUMENJI = [
  { label: '奇門排盤',   desc: '以時家奇門遁甲起局，計算天地盤干支' },
  { label: '時辰掃描',   desc: '逐時辰排算八方位吉凶，25 層古籍理論評分' },
  { label: '方位評分',   desc: '三吉門、九遁、天地盤干生剋、神煞過濾' },
  { label: '生成報告',   desc: '套入個人年命宮驗證，產出最佳吉時方位' },
]

function getPhases(planCode: string) {
  return ['E1', 'E2'].includes(planCode) ? PHASES_CHUMENJI : PHASES_DEFAULT
}

// 命理小知識——讓客戶在等待時學到東西
const FACTS_DEFAULT = [
  '八字中的「食神」代表創造力與口福，食神旺的人天生懂得享受生活。',
  '紫微斗數起源於宋朝，由陳希夷創立，距今已有千年歷史。',
  '西洋占星的上升星座代表你給人的第一印象，比太陽星座更影響外在表現。',
  '人類圖結合了易經、卡巴拉、脈輪和西洋占星四大體系，1987年才被創立。',
  '八字的「日主」就是你出生那天的天干，它代表你的核心性格。',
  '紫微斗數共有14顆主星，分布在12個宮位中，形成獨一無二的命盤。',
  '奇門遁甲被稱為「帝王之術」，古代只有皇室才能使用。',
  '姓名學的康熙筆畫跟現代筆畫不同——「草」字康熙筆畫是12畫，不是9畫。',
  '八字中五行平衡的人不到5%，大多數人都有某種五行偏重。',
  '吠陀占星比西洋占星早了兩千年，起源於古印度吠陀經典。',
]
const FACTS_CHUMENJI = [
  '奇門遁甲的「遁」指的是天干中的「甲」被隱藏，藏在六儀之下。',
  '時家奇門遁甲共有1,080局，由節氣和時辰決定。',
  '出門訣的核心是「接引吉方能量」——到達吉方定點後需停留40分鐘讓能量灌滿。',
  '奇門遁甲的八門中，「開門」「休門」「生門」是三吉門，最適合出行。',
  '出門訣的「九遁」包括天遁、地遁、人遁等9種特殊吉格，遇到任一種都是大吉。',
  '奇門遁甲中的「值使門」是當值的門神，它的落宮方位影響整個時辰的吉凶。',
]

function FunFacts({ planCode }: { planCode: string }) {
  const [idx, setIdx] = useState(0)
  const facts = ['E1', 'E2'].includes(planCode) ? FACTS_CHUMENJI : FACTS_DEFAULT

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx(prev => (prev + 1) % facts.length)
    }, 20_000) // 每 20 秒換一條
    return () => clearInterval(timer)
  }, [facts.length])

  return (
    <div className="bg-gold/5 border border-gold/10 rounded-lg px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="text-gold text-sm flex-shrink-0 mt-0.5">&#9733;</span>
        <p className="text-xs text-text-muted/80 leading-relaxed transition-opacity duration-500">
          <span className="text-gold/60 font-medium">命理小知識：</span>{facts[idx]}
        </p>
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
  [key: string]: unknown
}

export default function ReportProgress({ createdAt, planCode, generationProgress }: {
  createdAt: string
  planCode: string
  generationProgress?: GenerationProgress | null
}) {
  const [pct, setPct] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [realMessage, setRealMessage] = useState<string | null>(null)

  const cfg = PLAN_CONFIG[planCode] ?? PLAN_CONFIG['C']
  const systems = ALL_SYSTEMS.slice(0, cfg.systems)
  const totalMs = cfg.totalMinutes * 60 * 1000

  // 判斷真實進度是否有效（30 秒內有更新）
  const hasRealProgress = !!(
    generationProgress?.progress != null &&
    generationProgress?.progress_updated_at &&
    (Date.now() - new Date(generationProgress.progress_updated_at).getTime()) < 120_000
  )

  useEffect(() => {
    if (hasRealProgress && generationProgress) {
      // 使用後端真實進度
      const realPct = Math.min(Math.max(generationProgress.progress || 0, 0), 97)
      setPct(realPct)
      setCompleted(Math.min(Math.floor((realPct / 100) * cfg.systems), cfg.systems - 1))
      setRealMessage(generationProgress.message || null)
      return
    }

    // Fallback：用時間比例估算進度
    setRealMessage(null)
    const update = () => {
      const createdTime = new Date(createdAt).getTime()
      // 防護：createdAt 無效時不計算進度
      if (isNaN(createdTime) || totalMs <= 0) {
        setPct(0)
        return
      }
      const elapsed = Date.now() - createdTime
      const rawPct = Math.min(Math.round((elapsed / totalMs) * 100), 97) // 最多到97%，完成才100%
      setPct(rawPct)
      setCompleted(Math.min(Math.floor((rawPct / 100) * cfg.systems), cfg.systems - 1))
    }
    update()
    const timer = setInterval(update, 15_000)
    return () => clearInterval(timer)
  }, [createdAt, totalMs, cfg.systems, hasRealProgress, generationProgress])

  const phases = getPhases(planCode)
  const phaseIdx = getPhaseIndex(pct)
  const phase = phases[phaseIdx]
  const createdTime = new Date(createdAt).getTime()
  const elapsedMin = isNaN(createdTime) ? 0 : Math.round((Date.now() - createdTime) / 60000)
  const remainMin = Math.max(cfg.totalMinutes - elapsedMin, 1)
  // 如果有真實訊息就用真實訊息，否則用階段描述
  const progressDesc = realMessage || phase.desc

  return (
    <div className="mt-4 space-y-4">

      {/* 階段指示器 */}
      <div className="flex items-center gap-1">
        {phases.map((p, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={`flex items-center gap-1.5 flex-1 ${i <= phaseIdx ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all duration-700 ${
                i < phaseIdx ? 'bg-gold text-dark' :
                i === phaseIdx ? 'bg-gold/20 border border-gold text-gold animate-pulse' :
                'bg-white/5 border border-white/10 text-white/30'
              }`}>
                {i < phaseIdx ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] hidden sm:block ${i === phaseIdx ? 'text-gold' : i < phaseIdx ? 'text-gold/60' : 'text-white/20'}`}>
                {p.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div className={`h-px w-3 mx-1 flex-shrink-0 ${i < phaseIdx ? 'bg-gold/40' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      {/* 進度條 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gold/80 font-medium">{progressDesc}</span>
          <span className="text-gold tabular-nums font-semibold">{pct}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full transition-all duration-[2000ms] ease-out relative overflow-hidden"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #8b6914 0%, #c9a84c 50%, #e8c97a 100%)',
            }}
          >
            {/* 閃光動畫 */}
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)', animation: 'shimmer 2s infinite' }} />
          </div>
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
                  ? 'bg-white/5 text-gold/50 border border-gold/10 animate-pulse'
                  : 'bg-white/3 text-white/20 border border-white/5'
              }`}>
              <span className="text-[10px]">{s.icon}</span>
              <span>{i < completed ? '✓' : i === completed ? '...' : s.name.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 命理小知識輪播 — 讓等待時間有價值 */}
      <FunFacts planCode={planCode} />

      {/* 底部狀態說明 */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span>
            {planCode === 'E2'
              ? `正在排算 360 個時辰奇門局，套入命格驗證吉位`
              : planCode === 'E1'
              ? `正在排算事件前後所有時辰，交叉驗證命格吉位`
              : cfg.systems > 0
              ? `正在同步分析 ${cfg.systems} 套命理系統`
              : `正在進行${cfg.label}`}
          </span>
        </div>
        <span className="text-white/30 tabular-nums">
          {elapsedMin < cfg.totalMinutes ? `預計剩餘 ${remainMin} 分鐘` : '即將完成'}
        </span>
      </div>
    </div>
  )
}
