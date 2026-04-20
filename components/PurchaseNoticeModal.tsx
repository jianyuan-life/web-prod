'use client'

import { useState } from 'react'

type PlanCode = 'E1' | 'E2' | 'E3' | 'E4' | 'C' | 'D' | 'G15' | 'R'

interface PurchaseNoticeProps {
  planCode: PlanCode
  onConfirm: () => void
  onCancel?: () => void
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
    timing: '農曆月最後一天（晦日）21:00 前購買，即歸屬當月執行；21:00 後自動切下月',
  },
  E3: {
    title: '月度訂閱須知',
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
    title: '年度出門訣須知',
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
      '十五套命理系統交叉分析、一次看清人生全貌',
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
  const notice = PLAN_SPECIFIC_NOTICE[planCode]

  if (!notice) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-title"
    >
      <div className="glass rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 border border-gold/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-gold/70 font-mono mb-1">方案 {planCode}</div>
            <h2 id="notice-title" className="text-xl font-bold text-gradient-gold" style={{ fontFamily: 'var(--font-sans)' }}>
              {notice.title}
            </h2>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-text-muted hover:text-cream transition-colors p-1"
              aria-label="關閉"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

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

        {/* 同意勾選 */}
        <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gold/40 bg-transparent focus:ring-gold/50 focus:ring-2"
          />
          <span className="text-xs text-text leading-[1.7]">
            我已閱讀並理解「本方案重點」與「共同條款」，同意開始付款流程。
          </span>
        </label>

        {/* 按鈕 */}
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm text-text-muted hover:text-cream transition-colors glass"
            >
              取消
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={!agreed}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              agreed
                ? 'bg-gold text-dark btn-glow cursor-pointer'
                : 'bg-white/5 text-text-muted/40 cursor-not-allowed'
            }`}
          >
            前往付款
          </button>
        </div>
      </div>
    </div>
  )
}
