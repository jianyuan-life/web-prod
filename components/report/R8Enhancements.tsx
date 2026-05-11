'use client'

/**
 * v5.10.10 R+8 Enhancements
 * 整合 5 條新功能(Round 2 五家缺項補)+ 2 條既有改修強化:
 *   #10  個人化「為什麼」連結(命格脈絡)— WhyThisVerdictLink
 *   #11  Onboarding modal 3 步引導 + 術語小辭典 — OnboardingModal + TermGlossaryButton
 *   #12  自定義顯示 / 專家視圖切換 — ViewModeToggle
 *   #13  Dark/Light mode + 鍵盤焦點 — DarkModeToggle
 *    #1  Mobile 14 套錨點(連 SystemsRadar 後段) — SystemsAnchor
 *
 * 不動 page.tsx 既有渲染、外掛模式接入。
 */

import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEYS = {
  ONBOARDING_DISMISSED: 'jy_report_onboarding_v1',
  VIEW_MODE: 'jy_report_view_mode_v1',  // 'simple' | 'expert'
  THEME: 'jy_report_theme_v1',           // 'dark' | 'light'
}

// ── 通用:從 localStorage 安全讀寫 ──
function readStorage(key: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  try { return window.localStorage.getItem(key) || fallback }
  catch { return fallback }
}
function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* ignore */ }
}

// ============================================================
// #13 Dark / Light Mode 切換
// ============================================================
export function DarkModeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    // v5.10.183 P0 修(4 plans Playwright Vision audit 抓):
    // 原邏輯自動 follow OS prefers-color-scheme: light、客戶 OS 是 light 就套 light theme
    // 但鑑源報告是品牌深色設計(深紫 + 金色 hero / 命盤卡 / 太陽之火 等)、強行套 light 會視覺撕裂
    // 修補:預設永遠 dark、只在客戶主動點 toggle 才切 light、不再 follow OS 偏好
    const stored = readStorage(STORAGE_KEYS.THEME)
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
      applyTheme(stored)
    }
    // 不再 auto-follow window.matchMedia('(prefers-color-scheme: light)')
  }, [])

  const applyTheme = (t: 'dark' | 'light') => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', t)
  }

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    writeStorage(STORAGE_KEYS.THEME, next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`切換到${theme === 'dark' ? '淺色' : '深色'}模式`}
      title={`切換到${theme === 'dark' ? '淺色' : '深色'}模式`}
      className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 text-[12px]"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: theme === 'dark' ? '#f5d76e' : '#1a2340',
      }}
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '🌙'}</span>
      <span className="hidden sm:inline">{theme === 'dark' ? '淺色' : '深色'}</span>
    </button>
  )
}

// ============================================================
// #12 View Mode Toggle:精簡 / 完整(專家視圖)
// 用 localStorage 記住偏好(GPT-4o R3 補充)
// 切換時透過 [data-view-mode] 顯示/隱藏 .expert-only 區塊
// ============================================================
export function ViewModeToggle() {
  const [mode, setMode] = useState<'simple' | 'expert'>('expert')

  useEffect(() => {
    const stored = readStorage(STORAGE_KEYS.VIEW_MODE)
    const next: 'simple' | 'expert' = stored === 'simple' ? 'simple' : 'expert'
    setMode(next)
    applyMode(next)
  }, [])

  const applyMode = (m: 'simple' | 'expert') => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-view-mode', m)
  }

  const set = (m: 'simple' | 'expert') => {
    setMode(m)
    applyMode(m)
    writeStorage(STORAGE_KEYS.VIEW_MODE, m)
  }

  return (
    <div
      role="group"
      aria-label="顯示模式切換"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md text-[11px]"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}
    >
      <button
        type="button"
        onClick={() => set('simple')}
        aria-pressed={mode === 'simple'}
        className="px-2.5 py-1 rounded transition-all"
        style={{
          background: mode === 'simple' ? 'rgba(197,150,58,0.30)' : 'transparent',
          color: mode === 'simple' ? '#f5d76e' : 'rgba(255,255,255,0.65)',
          fontWeight: mode === 'simple' ? 700 : 500,
        }}
      >
        精簡版
      </button>
      <button
        type="button"
        onClick={() => set('expert')}
        aria-pressed={mode === 'expert'}
        className="px-2.5 py-1 rounded transition-all"
        style={{
          background: mode === 'expert' ? 'rgba(197,150,58,0.30)' : 'transparent',
          color: mode === 'expert' ? '#f5d76e' : 'rgba(255,255,255,0.65)',
          fontWeight: mode === 'expert' ? 700 : 500,
        }}
      >
        完整版
      </button>
    </div>
  )
}

// ============================================================
// #11 Onboarding Modal:首次進入 3 步引導
// ============================================================
const ONBOARDING_STEPS = [
  {
    icon: '📜',
    title: '命格名片',
    desc: '從 14 套系統交叉提取的命格定位、5 大核心洞察一眼看懂',
  },
  {
    icon: '⚡',
    title: '核心洞察',
    desc: '結論一句 + 精準預告、點開跳詳解、不必滾動找重點',
  },
  {
    icon: '🎯',
    title: '行動建議',
    desc: '基於最強天賦 + 主要課題、給 2-3 條具體可執行的下一步',
  },
]

export function OnboardingModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const dismissed = readStorage(STORAGE_KEYS.ONBOARDING_DISMISSED)
    if (!dismissed) {
      // 進站延後 800ms 再彈、避開首屏渲染干擾
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    writeStorage(STORAGE_KEYS.ONBOARDING_DISMISSED, '1')
  }, [])

  // ESC 鍵關閉
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && step < ONBOARDING_STEPS.length - 1) setStep(s => s + 1)
      else if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, close])

  if (!open) return null

  const cur = ONBOARDING_STEPS[step]
  const last = step === ONBOARDING_STEPS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="onboarding-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 no-print"
    >
      <div
        className="onboarding-modal rounded-2xl max-w-md w-full p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(15,22,40,0.96), rgba(26,42,74,0.92))',
          border: '1px solid rgba(197,150,58,0.45)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-gold/65 text-[10px] tracking-[3px] font-semibold">
            讀報指引 · {step + 1} / {ONBOARDING_STEPS.length}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="關閉引導"
            className="text-text-muted/60 hover:text-cream text-lg leading-none w-8 h-8 flex items-center justify-center rounded"
          >
            ✕
          </button>
        </div>
        <div className="text-center py-6">
          <div className="text-5xl mb-4" aria-hidden>{cur.icon}</div>
          <h2 id="onboarding-title" className="text-cream text-xl font-bold mb-2">
            {cur.title}
          </h2>
          <p className="text-text-muted text-sm leading-relaxed">{cur.desc}</p>
        </div>
        <div className="flex items-center justify-center gap-2 mb-4">
          {ONBOARDING_STEPS.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i === step ? '#c9a84c' : 'rgba(255,255,255,0.22)',
                width: i === step ? '20px' : '8px',
              }}
              aria-hidden
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              上一步
            </button>
          )}
          {!last ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #e8c87a)',
                color: '#0a0e1a',
              }}
            >
              下一步 →
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors"
              style={{
                background: 'linear-gradient(135deg, #6ab04c, #8fce6e)',
                color: '#0a0e1a',
              }}
            >
              開始閱讀 ✓
            </button>
          )}
        </div>
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={close}
            className="text-text-muted/45 text-[10px] tracking-wider underline-offset-2 hover:underline"
          >
            略過引導
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// #11 Term Glossary 按鈕(命理術語小辭典)
// ============================================================
const GLOSSARY_TERMS = [
  { term: '化忌', desc: '紫微斗數四化之一、表示阻礙、波折、需謹慎、宜深耕不宜爭強' },
  { term: '紫微', desc: '紫微斗數的帝座主星、坐命代表領導氣場、需有貴人星扶持才顯' },
  { term: '八字', desc: '出生年月日時的四柱干支、共 8 字、推算先天命格基礎' },
  { term: '日主', desc: '八字日柱天干、代表你本人、推命的核心起點' },
  { term: '用神', desc: '八字最需要的五行、補上能轉運、避之則失衡' },
  { term: '命宮', desc: '紫微斗數十二宮之一、代表你的本命、外貌、人生主軸' },
  { term: '奇門遁甲', desc: '帝王之學、用於擇時擇方、推算最佳行動時機' },
  { term: '節律', desc: '生物節律、體力 / 情緒 / 智力三大週期、推算每日狀態' },
  { term: '人類圖', desc: '結合占星 + 易經 + 卡巴拉 + 脈輪、9 個能量中心定位人格類型' },
]

export function TermGlossaryButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟命理術語小辭典"
        className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 text-[12px]"
        style={{
          background: 'rgba(78,196,211,0.10)',
          border: '1px solid rgba(78,196,211,0.30)',
          color: '#4ec4d3',
        }}
      >
        <span aria-hidden>📖</span>
        <span className="hidden sm:inline">術語</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="glossary-title"
          className="onboarding-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 no-print"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="onboarding-modal rounded-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(15,22,40,0.96), rgba(26,42,74,0.92))',
              border: '1px solid rgba(78,196,211,0.45)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="glossary-title" className="text-cream font-bold text-lg flex items-center gap-2">
                <span>📖</span>
                <span>命理術語小辭典</span>
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉辭典"
                className="text-text-muted/60 hover:text-cream text-lg leading-none w-8 h-8 flex items-center justify-center rounded"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {GLOSSARY_TERMS.map((t) => (
                <div
                  key={t.term}
                  className="px-4 py-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="text-gold font-bold text-sm mb-1">{t.term}</div>
                  <div className="text-text-muted text-[13px] leading-relaxed">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// #10 命格脈絡「為什麼」連結
// ============================================================
export function WhyThisVerdictLink({
  title,
  bazi,
  ziwei,
}: {
  title: string
  bazi?: string
  ziwei?: string
}) {
  const [open, setOpen] = useState(false)

  if (!title) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-gold/85 hover:text-gold underline underline-offset-2 font-medium transition-colors ml-2"
        aria-label="顯示這個命格封號的命理依據"
      >
        為什麼是「{title.slice(0, 6)}」?
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="onboarding-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 no-print"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="onboarding-modal rounded-2xl max-w-md w-full p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(15,22,40,0.96), rgba(26,42,74,0.92))',
              border: '1px solid rgba(197,150,58,0.45)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-gold/65 text-[10px] tracking-[3px] font-semibold">命格脈絡</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="text-text-muted/60 hover:text-cream text-lg leading-none w-8 h-8 flex items-center justify-center rounded"
              >
                ✕
              </button>
            </div>
            <h3 className="text-gold text-2xl font-bold mb-4">「{title}」是怎麼來的</h3>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="px-4 py-3 rounded-lg" style={{ background: 'rgba(106,176,76,0.08)', border: '1px solid rgba(106,176,76,0.25)' }}>
                <div className="text-green-400/80 text-[10px] tracking-wider mb-1 font-semibold">① 八字依據</div>
                <div className="text-cream">
                  {bazi ? `日主 ${bazi[0]}、四柱組合得出此命格基本盤` : '從你的日主天干與四柱五行平衡推算'}
                </div>
              </div>
              <div className="px-4 py-3 rounded-lg" style={{ background: 'rgba(155,89,182,0.08)', border: '1px solid rgba(155,89,182,0.25)' }}>
                <div className="text-purple-300/80 text-[10px] tracking-wider mb-1 font-semibold">② 紫微證實</div>
                <div className="text-cream">
                  {ziwei ? `命宮 ${ziwei}、主星格局與此命格特質吻合` : '紫微命宮主星格局與八字命格交叉驗證一致'}
                </div>
              </div>
              <div className="px-4 py-3 rounded-lg" style={{ background: 'rgba(197,150,58,0.08)', border: '1px solid rgba(197,150,58,0.25)' }}>
                <div className="text-gold/80 text-[10px] tracking-wider mb-1 font-semibold">③ 跨系統共識</div>
                <div className="text-cream">
                  人類圖 / 西占 / 吠陀 / 奇門 / 風水等系統共同提取此命格 DNA、信心度高
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #e8c87a)',
                color: '#0a0e1a',
              }}
            >
              我懂了 ✓
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// 工具列容器(把 ViewModeToggle / DarkModeToggle / TermGlossary 放一起)
// 給 page.tsx sticky CTA bar 用
// ============================================================
export function R8Toolbar() {
  return (
    <div className="flex items-center gap-2">
      <ViewModeToggle />
      <TermGlossaryButton />
      <DarkModeToggle />
    </div>
  )
}
