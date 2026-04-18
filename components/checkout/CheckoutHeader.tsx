'use client'

import PriceTag from '@/components/PriceTag'
import { PLAN_DESCRIPTIONS } from './types'

interface CheckoutHeaderProps {
  planCode: string
  planName: string
  isFamilyPlan: boolean
  isRelationPlan: boolean
  isG15Plan?: boolean
  extraMemberCount: number
  extraPrice: number
  rExtraCount: number
  familyCount: number
  rCount: number
  totalPrice: number
  finalPrice: number
  couponApplied: { discountAmount: number } | null
  planSystems: number
}

export default function CheckoutHeader({
  planCode, planName, isFamilyPlan, isRelationPlan, isG15Plan,
  extraMemberCount, extraPrice, rExtraCount,
  familyCount, rCount,
  totalPrice, finalPrice, couponApplied, planSystems,
}: CheckoutHeaderProps) {
  return (
    <>
      <h1 className="text-3xl font-bold text-center mb-2">
        <span className="text-gradient-gold">確認訂單</span>
      </h1>
      <p className="text-center text-text-muted mb-5">{PLAN_DESCRIPTIONS[planCode] || '填寫出生資料，完成付款後自動生成報告'}</p>

      {/* 步驟進度指示器（4 步，含 ARIA 無障礙） */}
      <ol aria-label="結帳流程進度" className="flex items-center justify-center gap-1.5 sm:gap-2 mb-6 text-[11px]">
        {[
          { n: 1, label: '選方案', active: false, done: true },
          { n: 2, label: '填資料', active: true, done: false },
          { n: 3, label: '安全付款', active: false, done: false },
          { n: 4, label: '收到報告', active: false, done: false },
        ].map((s, i, arr) => (
          <li key={s.n} className="flex items-center" aria-current={s.active ? 'step' : undefined}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all ${
              s.done ? 'bg-gold text-dark' : s.active ? 'bg-gold/25 text-gold ring-2 ring-gold/70 ring-offset-1 ring-offset-[#0a0e1a]' : 'bg-white/5 text-text-muted/50'
            }`} aria-label={s.done ? `已完成：${s.label}` : s.active ? `當前步驟：${s.label}` : `尚未開始：${s.label}`}>
              {s.done ? '✓' : s.n}
            </span>
            <span className={`ml-1 mr-1 ${s.active ? 'text-gold font-semibold' : s.done ? 'text-text-muted' : 'text-text-muted/50'}`}>{s.label}</span>
            {i < arr.length - 1 && <span aria-hidden="true" className={`w-3 sm:w-6 h-px mx-0.5 ${s.done ? 'bg-gold/40' : 'bg-white/10'}`} />}
          </li>
        ))}
      </ol>

      {/* 安全保證 */}
      <div className="flex flex-wrap justify-center gap-4 mb-8 text-[10px] text-text-muted/60">
        <span className="flex items-center gap-1"><span className="text-green-400">&#9679;</span> SSL 加密傳輸</span>
        <span className="flex items-center gap-1"><span className="text-green-400">&#9679;</span> Stripe 安全付款</span>
        <span className="flex items-center gap-1"><span className="text-green-400">&#9679;</span> 資料隱私保護</span>
      </div>

      {/* 方案摘要 */}
      <div className="glass rounded-xl p-5 mb-8 flex justify-between items-center">
        <div>
          <div className="text-xs text-gold font-mono">{planName}</div>
          <div className="text-lg font-bold text-white">{planName}</div>
          <div className="text-xs text-text-muted">
            {isG15Plan
              ? '家族互動分析（需每位成員已購人生藍圖）'
              : isFamilyPlan
              ? `基礎 2 人 $159，每加一人 +$${extraPrice}`
              : isRelationPlan
              ? '含兩人分析，每加1人 +$19/人'
              : planCode === 'D' ? '精選相關系統聚焦分析'
              : ['E1', 'E2'].includes(planCode) ? '奇門遁甲出門訣'
              : `${planSystems} 套系統分析`}
          </div>
          {isFamilyPlan && extraMemberCount > 0 && (
            <div className="text-xs text-gold mt-1">
              目前 {familyCount} 人，額外 {extraMemberCount} 人 × ${extraPrice} = +${extraMemberCount * extraPrice}
            </div>
          )}
          {isRelationPlan && rExtraCount > 0 && (
            <div className="text-xs text-gold mt-1">
              目前 {rCount} 人，額外 {rExtraCount} 人 × $19 = +${rExtraCount * 19}
            </div>
          )}
        </div>
        <div className="text-right">
          {couponApplied && (
            <div className="text-xs text-green-400 line-through mb-0.5">${totalPrice}</div>
          )}
          <PriceTag usd={finalPrice} size="lg" />
          {couponApplied && finalPrice === 0 && (
            <div className="text-xs text-green-400 font-bold mt-0.5">免費體驗</div>
          )}
        </div>
      </div>
    </>
  )
}
