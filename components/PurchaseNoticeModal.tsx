'use client'

import { useState, useEffect } from 'react'
// @ts-expect-error react-dom 型別在 Next.js 15 依賴中由 next 自身帶、外層 TS 無法檢測
import { createPortal } from 'react-dom'

type PlanCode = 'E1' | 'E2' | 'E3' | 'E4' | 'C' | 'D' | 'G15' | 'R'

interface PurchaseNoticeProps {
  planCode: PlanCode
  onConfirm: () => void
  onCancel?: () => void
}

// E2 執行時段資訊（動態從 Fly.io API 取得）
interface E2ExecWindow {
  solar_date: string        // '2026-05-16'
  solar_display: string     // '5 月 16 日（星期六）'
  lunar_month_display: string  // '農曆三月晦日'
  lunar_year_gz: string     // '丙午年'
  next_day_display: string  // '5 月 17 日'
}

const LUNAR_MONTH_CN = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '臘月']
const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function formatE2Window(data: {
  target_hui_day: string
  target_lunar_month: number
  target_lunar_year_gz?: string
}): E2ExecWindow {
  const [y, m, d] = data.target_hui_day.split('-').map(Number)
  const huiDate = new Date(y, m - 1, d)
  const weekday = WEEKDAY_CN[huiDate.getDay()]
  const nextDate = new Date(huiDate)
  nextDate.setDate(nextDate.getDate() + 1)
  // 上一月（因為後端 target_lunar_month 是「接氣月」= 下個月；晦日本身是上個月末）
  const huiLunarMonth = data.target_lunar_month === 1 ? 12 : data.target_lunar_month - 1
  return {
    solar_date: data.target_hui_day,
    solar_display: `${m} 月 ${d} 日（星期${weekday}）`,
    lunar_month_display: `農曆${LUNAR_MONTH_CN[huiLunarMonth] || huiLunarMonth + '月'}晦日`,
    lunar_year_gz: data.target_lunar_year_gz ? `${data.target_lunar_year_gz}年` : '',
    next_day_display: `${nextDate.getMonth() + 1} 月 ${nextDate.getDate()} 日`,
  }
}

// 共用須知（所有方案）
const SHARED_NOTICE = [
  '報告為虛擬數位內容，付款後即開始精密計算、不支持退款',
  '所有排盤基於古法確定性演算法，相同輸入 100% 得到相同結果',
  '報告永久保存於您的帳號中、網頁線上查閱',
]

// 各方案專屬須知
const PLAN_SPECIFIC_NOTICE: Record<PlanCode, { title: string; items: string[]; timing?: string }> = {
  E1: {
    title: '事件出門訣須知',
    items: [
      '針對「單一重要事件」精算 Top3 最佳吉時方案',
      '依事件描述自動匹配 14 大古法事件用神（面試／簽約／求財等）',
      '結果依您的年命宮個人化評分',
      '古法奇門遁甲「一時一盤」原則——錯過吉時無法以隔天替代',
      '行事曆邀約（.ics）可一鍵加入手機／電腦行事曆',
    ],
    timing: '購買後約 5-10 分鐘即可查看',
  },
  E2: {
    title: '月度出門訣須知',
    items: [
      '當月購買、當月執行、單次計費',
      '月盤古法排盤（立春／節氣換月）',
      '輸出當月主吉方＋最佳吉時窗口',
      '行事曆邀約一鍵加入',
      '若錯過當月，可下月再購買',
    ],
    timing: '晦日 21:00 前購買屬當月、21:00 後切下月；坐盤接氣須於晦日當晚 22:20 後（亥末子初交替）',
  },
  E3: {
    title: '週度補運須知',
    items: [
      '月度計畫——選 1-3 個主題用神（事業／財運／感情／健康／學業／貴人／化解小人／家庭）',
      '4 週每週精算 Top2 吉時、共 8 個最佳時窗',
      '古法占事派：用神權重 60% + 基礎格局 20% + 年命宮 20%',
      '每週吉時行事曆邀約自動匯入',
      '可隨時取消訂閱、已付該月不退',
    ],
    timing: '訂閱當月即生效、每 30 天自動續訂',
  },
  E4: {
    title: '年度方案須知',
    items: [
      '年盤＋12 個月盤的古法精算、全年擇吉一次到位',
      '立春前 30 天限時販售、錯過等明年',
      '年度主吉方／忌方總覽＋每月主吉方',
      '全年吉時一次匯入行事曆（.ics）',
      '立春換年（次年 2/4 前後）自動啟用',
    ],
    timing: '每年立春前 30 天限時開放、早鳥優先',
  },
  C: {
    title: '人生藍圖須知',
    items: [
      '十四套命理系統交叉分析、一次看清人生全貌',
      '約 30,000 字網頁重點版＋完整 PDF',
      '付款後系統自動精密計算並生成報告',
    ],
    timing: '約 30-60 分鐘完成生成',
  },
  D: {
    title: '心之所惑須知',
    items: [
      '選一個面向（財運／事業／感情／健康／學業／搬家）',
      '用 200 字描述您的具體困惑',
      '精選相關系統聚焦深度分析＋具體行動建議',
    ],
    timing: '約 20-40 分鐘完成生成',
  },
  G15: {
    title: '家族藍圖須知',
    items: [
      '前提：每位家庭成員需先各自完成「人生藍圖」（$89）',
      '系統調取所有成員命格數據、深度分析互動關係',
      '家族能量圖譜＋親子／夫妻具體建議',
    ],
    timing: '依人數約 30-90 分鐘',
  },
  R: {
    title: '合否？須知',
    items: [
      '兩人合盤＋互動關係深度分析',
      '對方可只提供年月日、時辰未知亦可分析',
      '含好的／注意／改善三大建議',
      '每加 1 人 +$19',
    ],
    timing: '約 20-40 分鐘完成生成',
  },
}

export default function PurchaseNoticeModal({ planCode, onConfirm, onCancel }: PurchaseNoticeProps) {
  const [agreed, setAgreed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [e2Window, setE2Window] = useState<E2ExecWindow | null>(null)
  const [e2Loading, setE2Loading] = useState(false)
  const notice = PLAN_SPECIFIC_NOTICE[planCode]

  // v5.3.58 — SSR 安全 mount 確認 + 鎖背景 scroll
  useEffect(() => {
    setMounted(true)
    const origOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = origOverflow }
  }, [])

  // v5.3.66 — E2 專屬：動態抓下個晦日執行時段
  useEffect(() => {
    if (planCode !== 'E2' || !mounted) return
    setE2Loading(true)
    const nowIso = new Date().toISOString()
    fetch('/api/engine/v2/lunar/e2-purchase-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datetime_iso: nowIso }),
    })
      .then(r => r.json())
      .then(json => {
        if (json?.success && json?.data?.target_hui_day) {
          setE2Window(formatE2Window(json.data))
        }
      })
      .catch(() => { /* 靜默失敗、fallback 到靜態 timing 文案 */ })
      .finally(() => setE2Loading(false))
  }, [planCode, mounted])

  if (!notice || !mounted) return null

  // v5.3.59 設計：
  // - 手機（< sm）：底部彈出 Bottom Sheet（85vh、頂部拖把手、內容可滾、底部 sticky 按鈕）
  // - 桌面（sm+）：置中 Dialog
  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-title"
      onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel() }}
    >
      <div className="glass w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl border-t border-gold/20 sm:border border-gold/20 flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        {/* 手機頂部拖把手 */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gold/30" />
        </div>

        {/* 頂部標題（sticky） */}
        <div className="flex items-start justify-between px-5 sm:px-8 pt-4 sm:pt-8 pb-3 border-b border-gold/10 shrink-0">
          <div>
            <div className="text-xs text-gold/70 font-mono mb-1">方案 {planCode}</div>
            <h2 id="notice-title" className="text-xl font-bold text-gradient-gold" style={{ fontFamily: 'var(--font-sans)' }}>
              {notice.title}
            </h2>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-text-muted hover:text-cream transition-colors p-2 -mr-2 shrink-0"
              aria-label="關閉"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* 中間內容（可滾） */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8 py-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* 方案專屬須知 */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gold mb-2">本方案重點</h3>
            <ul className="space-y-2 text-sm text-text leading-[1.8]">
              {notice.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-gold mt-1 shrink-0">&#10003;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 生成時間 */}
          {notice.timing && (
            <div className="rounded-xl bg-gold/5 border border-gold/10 p-3 mb-5">
              <p className="text-xs text-text-muted">
                <strong className="text-gold">⏱ 執行時程：</strong>{notice.timing}
              </p>
            </div>
          )}

          {/* E2 專屬：本月執行晦日動態提示 */}
          {planCode === 'E2' && (
            <div className="rounded-xl bg-red-500/10 border border-red-400/30 p-4 mb-5">
              <h3 className="text-sm font-bold text-red-300 mb-2 flex items-center gap-1">
                <span>⚠️</span>
                <span>請先確認能配合坐盤時段</span>
              </h3>
              {e2Loading && (
                <p className="text-xs text-text-muted">正在精算最近晦日…</p>
              )}
              {!e2Loading && e2Window && (
                <>
                  <div className="mb-3 p-3 rounded-lg bg-black/30 border border-red-400/20">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-red-300 text-xs shrink-0 mt-0.5">執行日</span>
                        <span className="text-cream text-sm font-semibold">
                          國曆 {e2Window.solar_display}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-300 text-xs shrink-0 mt-0.5">農曆</span>
                        <span className="text-cream text-sm">
                          {e2Window.lunar_year_gz}{e2Window.lunar_month_display}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-300 text-xs shrink-0 mt-0.5">坐盤</span>
                        <span className="text-cream text-sm">
                          當晚 <strong className="text-gold">22:20 – 23:40</strong>（亥末子初交替）
                          <br /><span className="text-text-muted">備案：</span>
                          <strong className="text-gold">{e2Window.next_day_display} 清晨 05:00 前</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-400/20 mb-3">
                    <p className="text-[11px] text-amber-200/90 font-semibold mb-1.5">📖 為何是 22:20 不是 22:00？</p>
                    <ul className="space-y-1 text-[11px] text-text leading-[1.7]">
                      <li>• 古法月盤必須在<strong className="text-red-300">亥時（21:00-23:00）末 → 子時（23:00-01:00）初</strong>交替那一刻「接月氣」</li>
                      <li>• 子時交替為 <strong className="text-gold">23:00 整</strong>——要提前 40 分鐘坐定（22:20）、淨心、擺位</li>
                      <li>• 太早（22:00 前）：月氣未到、坐盤接不到新月能量</li>
                      <li>• 太晚（23:40 後）：子時已過半、接氣窗口關閉</li>
                      <li>• 備案清晨：次日凌晨尚屬子時末、寅初（05:00）前完成仍可接到餘氣</li>
                    </ul>
                  </div>
                  <p className="text-xs text-text leading-[1.7]">
                    古法「一時一盤」原則——月盤須在<strong className="text-red-300">{e2Window.lunar_month_display}</strong>亥子交替接氣才有效、錯過就失效。
                    <br />若您無法在上述時段配合，建議改購 E3 週度補運（時窗較彈性）或 E1 事件出門訣。
                  </p>
                </>
              )}
              {!e2Loading && !e2Window && (
                <p className="text-xs text-text-muted">
                  晦日執行時段：農曆月最後一天當晚 22:00 後 或 次日清晨（下單後將以 Email 告知您確切時間）
                </p>
              )}
            </div>
          )}

          {/* 共用須知 */}
          <div className="mb-5 pt-4 border-t border-gold/10">
            <h3 className="text-sm font-semibold text-cream mb-2">共同條款</h3>
            <ul className="space-y-1.5 text-xs text-text-muted leading-[1.7]">
              {SHARED_NOTICE.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-text-muted mt-1 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 同意勾選（移到內容底部、讓客戶看完條款後勾選） */}
          <label className="flex items-start gap-3 mt-6 mb-2 cursor-pointer select-none p-3 rounded-xl bg-gold/5 border border-gold/10">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-gold/40 bg-transparent focus:ring-gold/50 focus:ring-2 shrink-0 cursor-pointer"
            />
            <span className="text-xs text-text leading-[1.7]">
              {planCode === 'E2' && e2Window ? (
                <>
                  我已確認能在 <strong className="text-gold">國曆 {e2Window.solar_display}</strong>（{e2Window.lunar_month_display}）
                  當晚 <strong className="text-gold">22:20–23:40 亥子交替</strong>
                  或 <strong className="text-gold">{e2Window.next_day_display} 清晨 05:00 前</strong>
                  配合坐盤接月氣、並同意「本方案重點」與「共同條款」。
                </>
              ) : (
                <>我已閱讀並理解「本方案重點」與「共同條款」，同意開始付款流程。</>
              )}
            </span>
          </label>
        </div>

        {/* 底部 sticky 按鈕區（永遠可見、確保手機可點） */}
        <div className="flex gap-3 px-5 sm:px-8 pt-3 pb-5 sm:pb-6 border-t border-gold/10 bg-[rgba(10,14,26,0.8)] shrink-0" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 min-h-[48px] rounded-xl text-sm text-text-muted hover:text-cream transition-colors glass"
            >
              取消
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={!agreed || (planCode === 'E2' && e2Loading)}
            className={`flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-all ${
              agreed && !(planCode === 'E2' && e2Loading)
                ? 'bg-gold text-dark btn-glow cursor-pointer'
                : 'bg-white/5 text-text-muted/40 cursor-not-allowed'
            }`}
          >
            {planCode === 'E2' && e2Loading ? '精算晦日中…' : '前往付款'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
