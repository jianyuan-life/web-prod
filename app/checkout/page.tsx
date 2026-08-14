'use client'

import { Suspense, useEffect, useState } from 'react'
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
import CheckoutProgress from '@/components/checkout/CheckoutProgress'
import CheckoutSecurityNote from '@/components/checkout/CheckoutSecurityNote'
import TurnstileWidget from '@/components/security/TurnstileWidget'
import ConsultIntro from '@/components/checkout/ConsultIntro'  // v5.10.420 Phase 2(flag off 不渲染)  // Phase 5 v5.10.382 老闆按鈕 #5(Turnstile bot 防護、checkout 高價值 funnel)
import G15FinalReviewModal from '@/components/consultation/G15FinalReviewModal'
import { isConsultationCheckoutPlan } from '@/lib/checkout/consultation-presentation'
import './checkout-presentation.css'
import './consultation-checkout-presentation.css'

function CheckoutForm() {
  const ctx = useCheckoutForm()
  const consultationCheckout = isConsultationCheckoutPlan(ctx.planCode)
  const checkoutShellClassName = consultationCheckout
    ? 'checkout-shell checkout-shell--consultation'
    : 'checkout-shell'
  // v5.10.420 Phase 2 問診式 onboarding(flag NEXT_PUBLIC_FF_CONSULT_ONBOARDING、純呈現層):
  // intro 未完成前只顯示對話卡、完成/跳過後顯示既有完整表單(底層 state 同一份、零資料流改動)
  // Codex L3 P2 修:customer_note 只在單人路徑(useCheckoutForm L565)進 birthData、
  // G15/R/家庭分支會靜默丟失 → intro 限定 C/D(note 確定送達 AI);E 系有自己的結構化事件欄、不需要。
  const consultEnabled = process.env.NEXT_PUBLIC_FF_CONSULT_ONBOARDING === 'true' && ['C', 'D'].includes(ctx.planCode)
  const [introDone, setIntroDone] = useState(!consultEnabled)

  // P2-D:checkout title 帶方案名(原本八方案 title 都一樣「結帳 — 鑒源 JianYuan」、分不出)
  //   plan 來自 searchParams、client-only、layout metadata 取不到 → 在這裡客戶端補
  //   SSR 先顯示 layout 的「結帳 | 鑒源 JianYuan」、hydrate 後 refine 成「人生藍圖 結帳 — 鑒源 JianYuan」
  useEffect(() => {
    const planName = ctx.plan?.name
    document.title = planName
      ? `${planName} 結帳 — 鑒源 JianYuan`
      : '結帳 — 鑒源 JianYuan'
  }, [ctx.plan?.name])

  if (!ctx.authChecked) {
    if (consultationCheckout && ctx.authError) {
      return (
        <div className={checkoutShellClassName}>
          <section className="checkout-auth-state" role="alert" aria-labelledby="checkout-auth-error-title">
            <p className="checkout-kicker">登入連線中斷</p>
            <h1 id="checkout-auth-error-title">目前無法確認登入狀態</h1>
            <p>{ctx.authError} 您已填寫的頁面資料不會因此送出，也不會因此扣款。</p>
            <div className="checkout-auth-actions">
              <button type="button" onClick={ctx.retryAuthCheck}>重新檢查</button>
              <Link href="/pricing">返回方案</Link>
            </div>
          </section>
        </div>
      )
    }
    return <div className={`${checkoutShellClassName} py-20 text-center text-text-muted`} role="status">正在確認登入狀態…</div>
  }

  return (
    <div className={checkoutShellClassName}>
      <FunnelPageHit step="start_checkout" planCode={ctx.planCode} />
      <div className="checkout-frame">
        {/* v5.6.10 (Round C):checkout 加「← 返回方案」鍵(對應 QA P0、防 escape 困住客戶) */}
        <Link
          href="/pricing"
          className="checkout-back-link inline-flex items-center gap-2 text-text-muted hover:text-gold transition-colors text-sm"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          返回方案
        </Link>

        <header className="checkout-page-heading">
          <p className="checkout-kicker">結帳步驟 · 01 / 03</p>
          <h1>核對報告資料</h1>
          <p>
            先核對分析所需資料與一次性金額；送出後若需付款，您會前往 Stripe 完成付款。
          </p>
        </header>

        {/* v5.6.10 R3:checkout 進度條(填表 → 付款 → 報告) */}
        <div className="checkout-progress-frame">
          <CheckoutProgress current={1} planCode={consultationCheckout ? ctx.planCode as 'C' | 'G15' : undefined} />
        </div>

        {/* v5.10.420 Phase 2:問診式對話卡(flag off=null;完成/跳過前先不攤 12 欄表單、
            progressive disclosure;customerNote 與表單同 state、後面仍可改) */}
        {consultEnabled && !introDone && (
          <ConsultIntro
            planCode={ctx.planCode}
            planName={ctx.plan.name}
            customerNote={ctx.customerNote}
            setCustomerNote={ctx.setCustomerNote}
            onDone={() => setIntroDone(true)}
          />
        )}
        {(!consultEnabled || introDone) && (
        <div className="checkout-layout">
          <aside className="checkout-summary">
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
            pointsDiscount={ctx.pointsDiscount}
            planSystems={ctx.plan.systems}
            />

            {/* 金額調整與訂單摘要放在一起，避免打斷核心委託資料的填寫節奏。 */}
            <div className="checkout-adjustments grid grid-cols-1 gap-3 mt-4" role="group" aria-label="優惠與積分折抵">
              <CouponInput
                couponInput={ctx.couponInput}
                setCouponInput={ctx.setCouponInput}
                couponApplied={ctx.couponApplied}
                setCouponApplied={() => ctx.setCouponApplied(null)}
                couponLoading={ctx.couponLoading}
                couponError={ctx.couponError}
                setCouponError={ctx.setCouponError}
                applyCoupon={ctx.applyCoupon}
                consultationMode={consultationCheckout}
              />
              <PointsRedeem
                planCode={ctx.planCode}
                orderAmount={ctx.totalPrice}
                couponApplied={ctx.couponApplied}
                onPointsChange={ctx.handlePointsChange}
                enforceMutualExclusion={consultationCheckout}
                couponLoading={consultationCheckout ? ctx.couponLoading : false}
              />
            </div>
          </aside>

          <section className="checkout-main" aria-label="委託資料表單">

        {/* Phase 5 v5.10.382 — Cloudflare Turnstile bot 防護(老闆灌 NEXT_PUBLIC_TURNSTILE_SITE_KEY 後 widget render、未設則隱身、結帳是高價值 funnel 防 bot 重要) */}
        <TurnstileWidget onVerify={ctx.setTurnstileToken} />

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
          <>
          <form onSubmit={ctx.handleCheckout} className="checkout-form-card space-y-4" aria-labelledby="g15-form-heading">
            <div>
              <p className="checkout-order-kicker">家庭成員</p>
              <h2 id="g15-form-heading" className="text-xl font-semibold text-cream">邀請家族成員授權報告</h2>
            </div>
            <div className="glass rounded-xl p-4 mb-2">
              <p className="text-sm text-text-muted leading-relaxed">
                每位成年成員須以自己帳號所擁有、已完成的「人生藍圖」加入，並親自登入同意本次使用。
                <br />
                <span className="text-gold">請輸入 2–8 組不同擁有者的「家族邀請碼」。</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-text-muted/70">
                成員可在「我的報告」複製家族邀請碼。邀請碼不會開啟報告內容；所有人同意前，購買者也看不到成員姓名或報告資料。
              </p>
            </div>

            <div className="space-y-3" aria-label="家族邀請碼">
              {ctx.g15ConsentAccessInputs.map((value, index) => (
                <div key={`g15-invite-${index}`} className="glass rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`g15-invite-${index}`} className="text-sm font-medium text-cream">
                      成員 {index + 1} 的家族邀請碼
                    </label>
                    {ctx.g15ConsentAccessInputs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => ctx.removeG15ConsentAccessInput(index)}
                        className="text-xs text-red-300 hover:text-red-200"
                        aria-label={`移除成員 ${index + 1}`}
                      >
                        移除
                      </button>
                    )}
                  </div>
                  <input
                    id={`g15-invite-${index}`}
                    type="text"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => ctx.updateG15ConsentAccessInput(index, event.target.value)}
                    placeholder="由該成員在「我的報告」複製"
                    className="mt-2 w-full rounded-lg border border-gold/20 bg-dark-lighter px-3 py-2.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-text-muted/40 focus:border-gold/60 focus:outline-none"
                  />
                </div>
              ))}
              {ctx.g15ConsentAccessInputs.length < 8 && (
                <button
                  type="button"
                  onClick={ctx.addG15ConsentAccessInput}
                  className="w-full rounded-xl border border-gold/30 py-3 text-sm text-gold transition-colors hover:bg-gold/10"
                >
                  + 加入第 {ctx.g15ConsentAccessInputs.length + 1} 位成員
                </button>
              )}
            </div>

            {ctx.g15Selected.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gold">全員同意後確認的成員（{ctx.g15Selected.length}）</p>
                {ctx.g15Selected.map((member) => (
                  <div key={member.reportId} className="glass rounded-xl p-3 flex items-center gap-2">
                    <span className="text-green-400 text-sm" aria-hidden="true">&#10003;</span>
                    <span className="text-white text-sm font-medium">{member.name}</span>
                  </div>
                ))}
              </div>
            )}

            <fieldset className="space-y-4 rounded-xl border border-gold/15 bg-white/[0.025] p-4">
              <legend className="px-2 text-sm font-semibold text-gold">讓報告理解真實的家庭情境</legend>
              <div>
                <label htmlFor="g15-relationship-context" className="block text-sm font-medium text-cream">
                  成員之間的關係 <span className="text-red-300">*</span>
                </label>
                <p id="g15-relationship-context-hint" className="mt-1 text-xs leading-relaxed text-text-muted/70">
                  請直接寫明誰是誰的父母、伴侶、孩子、手足或其他照顧關係；系統不會依年齡、性別或排序猜測。
                </p>
                <textarea
                  id="g15-relationship-context"
                  required minLength={8} maxLength={1200} rows={4}
                  value={ctx.g15RelationshipContext}
                  onChange={(event) => ctx.setG15RelationshipContext(event.target.value)}
                  aria-describedby="g15-relationship-context-hint"
                  placeholder="例如：何宣逸是父親、何紀萳是母親、何宥諄是孩子；目前主要由父母共同照顧孩子。"
                  className="mt-2 w-full resize-y rounded-lg border border-gold/20 bg-dark-lighter px-3 py-3 text-sm leading-relaxed text-white placeholder:text-text-muted/40 focus:border-gold/60 focus:outline-none"
                />
                <p className="mt-1 text-right text-[11px] text-text-muted/50">{ctx.g15RelationshipContext.length}/1200</p>
              </div>
              <div>
                <label htmlFor="g15-consultation-goals" className="block text-sm font-medium text-cream">
                  這次最想理解或改善的事 <span className="text-red-300">*</span>
                </label>
                <p id="g15-consultation-goals-hint" className="mt-1 text-xs leading-relaxed text-text-muted/70">
                  描述一至三個真實情境，例如溝通卡住、教養分工、家庭決策、界線或照顧壓力。報告會以此安排閱讀順序。
                </p>
                <textarea
                  id="g15-consultation-goals"
                  required minLength={8} maxLength={1200} rows={4}
                  value={ctx.g15ConsultationGoals}
                  onChange={(event) => ctx.setG15ConsultationGoals(event.target.value)}
                  aria-describedby="g15-consultation-goals-hint"
                  placeholder="例如：想理解親子溝通為何容易急躁，也想建立每週一次、不互相打斷的家庭會議。"
                  className="mt-2 w-full resize-y rounded-lg border border-gold/20 bg-dark-lighter px-3 py-3 text-sm leading-relaxed text-white placeholder:text-text-muted/40 focus:border-gold/60 focus:outline-none"
                />
                <p className="mt-1 text-right text-[11px] text-text-muted/50">{ctx.g15ConsultationGoals.length}/1200</p>
              </div>
            </fieldset>

            {ctx.error && <p className="checkout-form-error text-sm" role="alert">{ctx.error}</p>}

            <section className="rounded-xl border border-gold/20 bg-gold/[0.05] p-4 text-left" aria-labelledby="g15-consent-heading">
              <h3 id="g15-consent-heading" className="text-base font-semibold text-cream">每位成年成員獨立同意</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted/80">
                系統只會寄到每份人生藍圖擁有者帳號的已確認 Email。成員必須登入同一個帳號，才可同意本次讀取其人生藍圖與出生資料。付款建立前可撤回；付款建立後本次授權已被訂單使用，請聯絡客服處理後續資料權利要求。
              </p>
              <div className="mt-4 space-y-3">
                {ctx.g15ConsentMembers.map((member) => {
                  const statusLabel = member.status === 'accepted'
                    ? '已同意'
                    : member.status === 'revoked'
                      ? '已撤回'
                      : member.status === 'expired'
                        ? '已過期'
                        : member.status === 'pending'
                          ? '待同意'
                          : '尚未寄送'
                  const statusClass = member.status === 'accepted'
                    ? 'border-green-400/30 bg-green-500/10 text-green-300'
                    : member.status === 'revoked' || member.status === 'expired'
                      ? 'border-red-400/30 bg-red-500/10 text-red-300'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
                  return (
                    <div key={member.reportId} className="rounded-lg border border-white/10 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-white">{member.name}</span>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusClass}`}>{statusLabel}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={ctx.sendG15ConsentInvitations}
                  disabled={ctx.g15ConsentLoading || ctx.g15ConsentAccessInputs.length < 2 || ctx.g15ConsentAccessInputs.some((value) => value.trim().length < 24)}
                  className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ctx.g15ConsentLoading ? '處理中…' : ctx.g15ConsentSelectionId ? '重新寄送待同意邀請' : '寄出逐位同意邀請'}
                </button>
                {ctx.g15ConsentSelectionId && (
                  <button
                    type="button"
                    onClick={() => ctx.refreshG15ConsentStatus()}
                    disabled={ctx.g15ConsentLoading}
                    className="rounded-lg border border-gold/30 px-4 py-2.5 text-sm font-medium text-gold disabled:opacity-50"
                  >
                    更新同意狀態
                  </button>
                )}
              </div>
              <p id="g15-consent-status" className="mt-3 text-xs leading-relaxed text-text-muted/80" role="status" aria-live="polite">
                {ctx.g15ConsentStatusMessage || '填妥每位成年成員的家族邀請碼後寄出邀請；所有人顯示「已同意」前不會建立付款。'}
              </p>
              {ctx.g15ConsentExpiresAt && (
                <p className="mt-1 text-[11px] text-text-muted/60">本輪邀請有效至 {new Date(ctx.g15ConsentExpiresAt).toLocaleString('zh-TW')}</p>
              )}
              {ctx.g15ConsentError && <p className="mt-2 text-xs text-red-300" role="alert">{ctx.g15ConsentError}</p>}
              <p className="mt-3 text-[11px] leading-relaxed text-text-muted/60">
                帳號與報告擁有權驗證不等於身分證明、實名驗證或 KYC。未滿 18 歲的報告目前不能加入，同一帳號也不能代表多位成員。{' '}
                <Link href="/privacy" className="text-gold/90 underline underline-offset-2 hover:text-gold">查看隱私政策</Link>
              </p>
            </section>

            <CheckoutSecurityNote />

            <button
              type="submit"
              disabled={ctx.loading || !ctx.isFormValid}
              aria-describedby={ctx.g15CheckoutBlockers.length > 0 ? 'g15-checkout-blockers' : undefined}
              className="mt-4 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-lg font-bold text-dark btn-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              核對資料與金額
            </button>
            {ctx.g15CheckoutBlockers.length > 0 && (
              <div id="g15-checkout-blockers" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3" aria-live="polite">
                <p className="text-xs font-semibold text-amber-300">完成以下項目後即可繼續：</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-text-muted">
                  {ctx.g15CheckoutBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-text-muted/60 text-center">
              完成後會寄電子郵件通知；您可在「我的報告」線上閱讀並下載 PDF。
            </p>
          </form>
          <G15FinalReviewModal
            show={ctx.showConfirmModal}
            members={ctx.g15Selected}
            consentMembers={ctx.g15ConsentMembers}
            relationshipContext={ctx.g15RelationshipContext}
            consultationGoals={ctx.g15ConsultationGoals}
            totalPrice={ctx.totalPrice}
            finalPrice={ctx.finalPrice}
            couponCode={ctx.couponApplied?.code}
            couponDiscount={ctx.couponApplied?.discountAmount}
            pointsUsed={ctx.pointsUsed}
            pointsDiscount={ctx.pointsDiscount}
            submitError={ctx.error}
            loading={ctx.loading}
            onClose={() => ctx.setShowConfirmModal(false)}
            onConfirm={ctx.confirmCheckout}
          />
          </>
        ) : ctx.isFamilyPlan ? (
          /* 家庭方案表單 */
          <form onSubmit={ctx.handleCheckout} className="checkout-form-card space-y-4" aria-labelledby="family-form-heading">
            <div>
              <p className="checkout-order-kicker">Birth records</p>
              <h2 id="family-form-heading" className="text-xl font-semibold text-cream">填寫家庭成員資料</h2>
            </div>
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
                <span className="text-text-muted ml-2">（一次性 + USD {ctx.extraPrice}）</span>
              </button>
            )}

            <CustomerNote customerNote={ctx.customerNote} setCustomerNote={ctx.setCustomerNote} />

            {ctx.error && <p className="checkout-form-error text-sm" role="alert">{ctx.error}</p>}

            {/* v5.10.269 GDPR/個資法 第三方授權 disclaimer(對應 Gemini L4 P0 audit) */}
            <p className="text-xs text-text-muted/70 text-center leading-relaxed border-t border-gold/5 pt-3 mt-2">
              您確認已獲所有家庭成員同意、代為提供其姓名與出生資料用於命理分析。
              <br />
              本服務遵守 <Link href="/privacy" className="text-gold/80 underline hover:text-gold">隱私政策</Link> 與 GDPR/個資法。
            </p>

            <CheckoutSecurityNote />

            <button
              type="submit" disabled={ctx.loading}
              className="w-full py-3.5 bg-gold text-dark font-bold rounded-xl text-lg btn-glow disabled:opacity-50 mt-4"
            >
              {ctx.loading ? '跳轉付款中...' : ctx.finalPrice === 0 ? '檢查資料並免費領取報告' : `檢查資料並付款 — USD ${ctx.finalPrice}`}
            </button>
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
            onCityResultsDismiss={ctx.dismissCityResults}
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
          </section>
        </div>)}
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="checkout-shell py-20 text-center text-text-muted" role="status">載入中...</div>}>
      <CheckoutForm />
    </Suspense>
  )
}
