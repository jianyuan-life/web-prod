'use client'

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
  pointsDiscount: number
  planSystems: number
}

export default function CheckoutHeader({
  planCode, planName, isFamilyPlan, isRelationPlan, isG15Plan,
  extraMemberCount, extraPrice, rExtraCount,
  familyCount, rCount,
  totalPrice, finalPrice, couponApplied, pointsDiscount, planSystems,
}: CheckoutHeaderProps) {
  const planDetail = isG15Plan
    ? '家族互動分析（需每位成員已購人生藍圖）'
    : isFamilyPlan
      ? `基礎 2 人 USD 159，每加一人一次性加收 USD ${extraPrice}`
      : isRelationPlan
        ? '含兩人分析，每加 1 人一次性加收 USD 19'
        : planCode === 'D' ? '精選相關系統聚焦分析'
        : planCode === 'E1' ? '單事件 Top 3 吉時方案'
        : planCode === 'E2' ? '當月主吉方＋吉時、單次執行'
        : planCode === 'E3' ? '4 週 × 每週 Top 2 = 8 吉時'
        : planCode === 'E4' ? '年盤 ＋ 12 月盤、全年擇吉'
        : `${planSystems} 套系統分析`

  return (
    <section className="checkout-order-card" aria-labelledby="checkout-order-title">
      <header className="checkout-order-heading">
        <p className="checkout-order-kicker">Commission summary</p>
        <h2 id="checkout-order-title">委託摘要</h2>
        <p className="checkout-order-description">
          {PLAN_DESCRIPTIONS[planCode] || '填寫出生資料，完成付款後自動生成報告'}
        </p>
      </header>

      <div className="checkout-order-body">
        <div className="checkout-plan-code">方案 {planCode}</div>
        <div className="checkout-plan-name">{planName}</div>
        <p className="checkout-plan-detail">{planDetail}</p>

        {(isFamilyPlan && extraMemberCount > 0) && (
          <p className="checkout-plan-detail">
            目前 {familyCount} 人；額外 {extraMemberCount} 人 × USD {extraPrice} = USD {extraMemberCount * extraPrice}
          </p>
        )}
        {(isRelationPlan && rExtraCount > 0) && (
          <p className="checkout-plan-detail">
            目前 {rCount} 人；額外 {rExtraCount} 人 × USD 19 = USD {rExtraCount * 19}
          </p>
        )}

        <dl className="checkout-order-lines">
          <div className="checkout-order-line">
            <dt>訂單金額</dt>
            <dd>USD {totalPrice}</dd>
          </div>
          {couponApplied && (
            <div className="checkout-order-line is-discount">
              <dt>優惠折抵</dt>
              <dd>− USD {couponApplied.discountAmount}</dd>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="checkout-order-line is-discount">
              <dt>積分折抵</dt>
              <dd>− USD {pointsDiscount}</dd>
            </div>
          )}
        </dl>

        <dl className="checkout-order-total">
          <dt>
            今日應付
            <span>一次性付款，不是訂閱</span>
          </dt>
          <dd>USD {finalPrice}</dd>
        </dl>
      </div>

      <p className="checkout-order-footnote">
        {finalPrice === 0
          ? '此訂單目前無需付款；送出後將按既有流程建立報告。'
          : '下一步會前往 Stripe 的安全付款頁面；本頁不會收取或保存卡片資料。'}
      </p>
    </section>
  )
}
