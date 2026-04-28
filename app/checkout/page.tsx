'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useCheckoutForm } from '@/hooks/useCheckoutForm'
import CheckoutHeader from '@/components/checkout/CheckoutHeader'
import CouponInput from '@/components/checkout/CouponInput'
import SinglePersonForm from '@/components/checkout/SinglePersonForm'
import RMemberForm from '@/components/checkout/RMemberForm'
import FamilyMemberField from '@/components/checkout/FamilyMemberField'
import CustomerNote from '@/components/checkout/CustomerNote'
import PointsRedeem from '@/components/checkout/PointsRedeem'
import FunnelPageHit from '@/components/FunnelPageHit'

function CheckoutForm() {
  const ctx = useCheckoutForm()

  if (!ctx.authChecked) {
    return <div className="py-20 text-center text-text-muted">驗證登入狀態...</div>
  }

  return (
    <div className="py-20">
      <FunnelPageHit step="start_checkout" planCode={ctx.planCode} />
      <div className="max-w-2xl mx-auto px-6">
        {/* v5.6.10 (Round C):checkout 加「← 返回方案」鍵(對應 QA P0、防 escape 困住客戶) */}
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-text-muted hover:text-gold transition-colors text-sm mb-6"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          返回方案
        </Link>
        <CheckoutHeader
          planCode={ctx.planCode}
          planName={ctx.plan.name}
          isFamilyPlan={ctx.isFamilyPlan}
          isRelationPlan={ctx.isRelationPlan}
          isG15Plan={ctx.isG15Plan}
          extraMemberCount={ctx.extraMemberCount}
          extraPrice={ctx.extraPrice}
          rExtraCount={ctx.rExtraCount}
          familyCount={ctx.familyMembers.length}
          rCount={ctx.rMembers.length}
          totalPrice={ctx.totalPrice}
          finalPrice={ctx.finalPrice}
          couponApplied={ctx.couponApplied}
          planSystems={ctx.plan.systems}
        />

        {/* 優惠碼 + 積分折抵（左右並排） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <CouponInput
            couponInput={ctx.couponInput}
            setCouponInput={ctx.setCouponInput}
            couponApplied={ctx.couponApplied}
            setCouponApplied={() => ctx.setCouponApplied(null)}
            couponLoading={ctx.couponLoading}
            couponError={ctx.couponError}
            setCouponError={ctx.setCouponError}
            applyCoupon={ctx.applyCoupon}
          />
          <PointsRedeem
            planCode={ctx.planCode}
            orderAmount={ctx.totalPrice}
            couponApplied={ctx.couponApplied}
            onPointsChange={ctx.handlePointsChange}
          />
        </div>

        {/* R 方案多人表單 */}
        {ctx.isRelationPlan ? (
          <RMemberForm
            rMembers={ctx.rMembers}
            updateRMember={ctx.updateRMember}
            addRMember={ctx.addRMember}
            removeRMember={ctx.removeRMember}
            rRelationDesc={ctx.rRelationDesc}
            setRRelationDesc={ctx.setRRelationDesc}
            customerNote={ctx.customerNote}
            setCustomerNote={ctx.setCustomerNote}
            loading={ctx.loading}
            error={ctx.error}
            finalPrice={ctx.finalPrice}
            isFormValid={ctx.isFormValid}
            onSubmit={ctx.handleCheckout}
          />
        ) : ctx.isG15Plan ? (
          /* G15 家族藍圖：導入已完成的人生藍圖報告 */
          <form onSubmit={ctx.handleCheckout} className="space-y-4">
            <div className="glass rounded-xl p-4 mb-2">
              <p className="text-sm text-text-muted leading-relaxed">
                從已完成的「人生藍圖」報告中選擇家庭成員，系統會讀取各成員的命理資料進行家族互動分析。
                <br />
                <span className="text-gold">至少選擇 2 位，最多 8 位。</span>
              </p>
            </div>

            {/* 已選取的成員 */}
            {ctx.g15Selected.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gold">已選成員（{ctx.g15Selected.length}）</p>
                {ctx.g15Selected.map((member) => (
                  <div key={member.reportId} className="glass rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-sm">&#10003;</span>
                      <span className="text-white text-sm font-medium">{member.name}</span>
                      {member.createdAt && (
                        <span className="text-text-muted/50 text-xs">
                          {new Date(member.createdAt).toLocaleDateString('zh-TW')}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => ctx.removeG15Report(member.reportId)}
                      className="text-red-400 text-xs hover:text-red-300 transition-colors"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 我的報告列表 */}
            {ctx.g15MyLoading ? (
              <div className="text-center text-text-muted text-sm py-4">載入您的報告中...</div>
            ) : ctx.g15MyReports.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-muted">您帳號下的人生藍圖</p>
                {ctx.g15MyReports
                  .filter(r => !ctx.g15Selected.some(s => s.reportId === r.id))
                  .map((report) => (
                  <div key={report.id} className="glass rounded-xl p-3 flex items-center justify-between hover:border-gold/40 border border-transparent transition-colors">
                    <div>
                      <span className="text-white text-sm">{report.name}</span>
                      {report.createdAt && (
                        <span className="text-text-muted/50 text-xs ml-2">
                          {new Date(report.createdAt).toLocaleDateString('zh-TW')}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => ctx.addG15Report(report)}
                      disabled={ctx.g15Selected.length >= 8}
                      className="text-gold text-xs hover:text-gold/80 transition-colors disabled:opacity-30"
                    >
                      + 加入
                    </button>
                  </div>
                ))}
              </div>
            ) : !ctx.g15MyLoading ? (
              <div className="glass rounded-xl p-4 text-center">
                <p className="text-text-muted text-sm">您的帳號下還沒有已完成的人生藍圖報告</p>
                <Link href="/pricing" className="text-gold text-xs hover:underline mt-1 inline-block">
                  前往購買人生藍圖
                </Link>
              </div>
            ) : null}

            {/* 搜尋其他家人的報告 */}
            {ctx.g15Selected.length < 8 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-muted">搜尋其他家人的報告</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="輸入姓名搜尋..."
                    value={ctx.g15SearchQuery}
                    onChange={(e) => ctx.setG15SearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        ctx.searchG15Reports(ctx.g15SearchQuery)
                      }
                    }}
                    className="flex-1 bg-dark-lighter border border-gold/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-text-muted/40 focus:outline-none focus:border-gold/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => ctx.searchG15Reports(ctx.g15SearchQuery)}
                    disabled={ctx.g15SearchLoading || !ctx.g15SearchQuery.trim()}
                    className="px-4 py-2.5 bg-gold/20 text-gold rounded-lg text-sm hover:bg-gold/30 transition-colors disabled:opacity-40"
                  >
                    {ctx.g15SearchLoading ? '搜尋中...' : '搜尋'}
                  </button>
                </div>

                {/* 搜尋結果 */}
                {ctx.g15SearchResults.length > 0 && (
                  <div className="space-y-1.5">
                    {ctx.g15SearchResults.map((report) => (
                      <div key={report.id} className="glass rounded-lg p-3 flex items-center justify-between hover:border-gold/40 border border-transparent transition-colors">
                        <div>
                          <span className="text-white text-sm">{report.name}</span>
                          {report.emailHint && (
                            <span className="text-text-muted/40 text-xs ml-2">{report.emailHint}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => ctx.addG15Report(report)}
                          disabled={ctx.g15Selected.length >= 8}
                          className="text-gold text-xs hover:text-gold/80 transition-colors disabled:opacity-30"
                        >
                          + 加入
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {ctx.g15SearchQuery && !ctx.g15SearchLoading && ctx.g15SearchResults.length === 0 && (
                  <p className="text-text-muted/50 text-xs text-center py-2">找不到符合的報告，請確認姓名是否正確</p>
                )}
              </div>
            )}

            {ctx.error && <p className="text-red-400 text-sm text-center">{ctx.error}</p>}

            <button
              type="submit"
              disabled={ctx.loading || ctx.g15Selected.length < 2}
              className="w-full py-3.5 bg-gold text-dark font-bold rounded-xl text-lg btn-glow disabled:opacity-50 mt-4"
            >
              {ctx.loading ? '跳轉付款中...' : `確認付款 — $${ctx.finalPrice}`}
            </button>
            {ctx.g15Selected.length < 2 && (
              <p className="text-xs text-gold/60 text-center">請至少選擇 2 位家庭成員</p>
            )}
            {/* v5.4.21 P0 修(Gemini UI audit):trust badges 強化(Stripe + SSL + 不滿意全額退) */}
            <div className="flex flex-wrap justify-center gap-3 text-[10px] text-text-muted/70 pt-1">
              <span>&#128274; Stripe 加密支付</span>
              <span>&#128737;&#65039; SSL 256-bit</span>
              <span>&#128230; PDF 永久保存</span>
              <span>&#127919; 不滿意 7 日全額退</span>
            </div>
            <p className="text-xs text-text-muted/60 text-center">
              報告平均需 30 分鐘以上、寫到信箱 + 線上看
            </p>
          </form>
        ) : ctx.isFamilyPlan ? (
          /* 家庭方案表單 */
          <form onSubmit={ctx.handleCheckout} className="space-y-4">
            <div className="space-y-4">
              {ctx.familyMembers.map((member, index) => (
                <FamilyMemberField
                  key={index}
                  index={index}
                  member={member}
                  canDelete={index >= 2}
                  onChange={(updated) => ctx.updateFamilyMember(index, updated)}
                  onDelete={() => ctx.removeFamilyMember(index)}
                />
              ))}
            </div>

            {ctx.familyMembers.length < 8 && (
              <button type="button" onClick={ctx.addFamilyMember}
                className="w-full py-3 border border-gold/30 rounded-xl text-gold text-sm hover:bg-gold/10 transition-all">
                + 加入第 {ctx.familyMembers.length + 1} 位家庭成員
                <span className="text-text-muted ml-2">(+${ctx.extraPrice})</span>
              </button>
            )}

            <CustomerNote customerNote={ctx.customerNote} setCustomerNote={ctx.setCustomerNote} />

            {ctx.error && <p className="text-red-400 text-sm text-center">{ctx.error}</p>}

            <button
              type="submit" disabled={ctx.loading}
              className="w-full py-3.5 bg-gold text-dark font-bold rounded-xl text-lg btn-glow disabled:opacity-50 mt-4"
            >
              {ctx.loading ? '跳轉付款中...' : ctx.finalPrice === 0 ? '免費領取報告' : `確認付款 — $${ctx.finalPrice}`}
            </button>
            {/* v5.4.21 P0 修(Gemini UI audit):trust badges 強化(家庭方案版) */}
            <div className="flex flex-wrap justify-center gap-3 text-[10px] text-text-muted/70 pt-1">
              <span>&#128274; Stripe 加密支付</span>
              <span>&#128737;&#65039; SSL 256-bit</span>
              <span>&#128230; PDF 永久保存</span>
              <span>&#127919; 不滿意 7 日全額退</span>
            </div>
            <p className="text-xs text-text-muted/60 text-center">
              報告平均需 30 分鐘以上、出門訣需 40 分鐘以上
            </p>
          </form>
        ) : (
          /* 單人表單 */
          <SinglePersonForm
            planCode={ctx.planCode}
            form={ctx.form}
            setForm={ctx.setForm}
            timeMode={ctx.timeMode}
            setTimeMode={ctx.setTimeMode}
            cityResults={ctx.cityResults}
            onCitySearch={ctx.handleCitySearch}
            onCitySelect={ctx.selectCity}
            onCountrySelect={ctx.selectCountry}
            onCancelCountry={ctx.cancelCountrySelection}
            needCityForCountry={ctx.needCityForCountry}
            dTopic={ctx.dTopic}
            setDTopic={ctx.setDTopic}
            dOtherDesc={ctx.dOtherDesc}
            setDOtherDesc={ctx.setDOtherDesc}
            e1EndDate={ctx.e1EndDate}
            setE1EndDate={ctx.setE1EndDate}
            e1EventType={ctx.e1EventType}
            setE1EventType={ctx.setE1EventType}
            e1HasExactTime={ctx.e1HasExactTime}
            setE1HasExactTime={ctx.setE1HasExactTime}
            e1EventExactTime={ctx.e1EventExactTime}
            setE1EventExactTime={ctx.setE1EventExactTime}
            eSelectedBlocks={ctx.eSelectedBlocks}
            setESelectedBlocks={ctx.setESelectedBlocks}
            e3SelectedTopics={ctx.e3SelectedTopics}
            setE3SelectedTopics={ctx.setE3SelectedTopics}
            customerNote={ctx.customerNote}
            setCustomerNote={ctx.setCustomerNote}
            loading={ctx.loading}
            error={ctx.error}
            finalPrice={ctx.finalPrice}
            totalPrice={ctx.totalPrice}
            pointsUsed={ctx.pointsUsed}
            pointsDiscount={ctx.pointsDiscount}
            onPointsChange={ctx.handlePointsChange}
            couponApplied={ctx.couponApplied}
            isFormValid={ctx.isFormValid}
            onSubmit={ctx.handleCheckout}
            showConfirmModal={ctx.showConfirmModal}
            onCloseConfirmModal={() => ctx.setShowConfirmModal(false)}
            onConfirmCheckout={ctx.confirmCheckout}
          />
        )}
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-text-muted">載入中...</div>}>
      <CheckoutForm />
    </Suspense>
  )
}
