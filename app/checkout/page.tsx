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
              <h2 id="g15-form-heading" className="text-xl font-semibold text-cream">選擇家族成員報告</h2>
            </div>
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
              <div className="text-center text-text-muted text-sm py-4" role="status">正在載入您的報告…</div>
            ) : ctx.g15LoadError ? (
              <div className="checkout-form-error rounded-xl p-4 text-sm" role="alert">
                <p>{ctx.g15LoadError}</p>
                <button type="button" onClick={ctx.loadMyReports} className="mt-2 text-gold underline underline-offset-2">
                  重新載入
                </button>
              </div>
            ) : ctx.g15MyReports.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-muted">您帳號下的人生藍圖</p>
                {ctx.g15MyReports
                  .filter(r => !ctx.g15Selected.some(s => s.reportId === r.id))
                  .map((report) => {
                  const canAdd = report.eligible !== false && ctx.g15Selected.length < 8
                  return (
                  <div key={report.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3 hover:border-gold/40 border border-transparent transition-colors">
                    <div className="min-w-0">
                      <span className="text-white text-sm">{report.name}</span>
                      {report.createdAt && (
                        <span className="text-text-muted/50 text-xs ml-2">
                          {new Date(report.createdAt).toLocaleDateString('zh-TW')}
                        </span>
                      )}
                      {report.eligible === false && report.eligibilityReason && (
                        <p className="mt-1 text-xs leading-relaxed text-amber-300" role="status">{report.eligibilityReason}</p>
                      )}
                    </div>
                    {report.eligible === false ? (
                      <Link href="/life-blueprint" className="shrink-0 text-xs font-medium text-gold underline underline-offset-2 hover:text-gold/80">
                        重新建立可用的人生藍圖
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => ctx.addG15Report(report)}
                        disabled={!canAdd}
                        aria-label={canAdd ? `加入 ${report.name}` : '已選滿 8 位家庭成員'}
                        className="shrink-0 cursor-pointer text-xs text-gold transition-colors hover:text-gold/80 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {canAdd ? '+ 加入' : '已達 8 人上限'}
                      </button>
                    )}
                  </div>
                  )})}
              </div>
            ) : !ctx.g15MyLoading ? (
              <div className="glass rounded-xl p-4 text-center">
                <p className="text-text-muted text-sm">您的帳號下還沒有已完成的人生藍圖報告</p>
                <Link href="/pricing" className="text-gold text-xs hover:underline mt-1 inline-block">
                  前往購買人生藍圖
                </Link>
              </div>
            ) : null}

            {/* 在目前帳戶內依姓名篩選 */}
            {ctx.g15Selected.length < 8 && (
              <div className="space-y-2">
                <label htmlFor="g15-report-search" className="text-sm font-medium text-text-muted">在此帳戶內依姓名篩選</label>
                <p className="text-xs leading-relaxed text-text-muted/70">只會搜尋您目前登入帳戶中已完成的人生藍圖；不會搜尋其他人的帳戶。</p>
                <div className="flex gap-2">
                  <input
                    id="g15-report-search"
                    type="text"
                    placeholder="輸入此帳戶人生藍圖中的姓名"
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
                    {ctx.g15SearchLoading ? '搜尋中…' : '搜尋'}
                  </button>
                </div>

                {/* 搜尋結果 */}
                {ctx.g15SearchResults.length > 0 && (
                  <div className="space-y-1.5">
                    {ctx.g15SearchResults.map((report) => {
                      const canAdd = report.eligible !== false && ctx.g15Selected.length < 8
                      return (
                      <div key={report.id} className="glass rounded-lg p-3 flex items-center justify-between gap-3 hover:border-gold/40 border border-transparent transition-colors">
                        <div className="min-w-0">
                          <span className="text-white text-sm">{report.name}</span>
                          {report.emailHint && (
                            <span className="text-text-muted/40 text-xs ml-2">{report.emailHint}</span>
                          )}
                          {report.eligible === false && report.eligibilityReason && (
                            <p className="mt-1 text-xs leading-relaxed text-amber-300" role="status">{report.eligibilityReason}</p>
                          )}
                        </div>
                        {report.eligible === false ? (
                          <Link href="/life-blueprint" className="shrink-0 text-xs font-medium text-gold underline underline-offset-2 hover:text-gold/80">
                            重新建立可用的人生藍圖
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => ctx.addG15Report(report)}
                            disabled={!canAdd}
                            aria-label={canAdd ? `加入 ${report.name}` : '已選滿 8 位家庭成員'}
                            className="shrink-0 cursor-pointer text-xs text-gold transition-colors hover:text-gold/80 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {canAdd ? '+ 加入' : '已達 8 人上限'}
                          </button>
                        )}
                      </div>
                    )})}
                  </div>
                )}
                {ctx.g15SearchAttempted && !ctx.g15SearchLoading && !ctx.g15SearchError && ctx.g15SearchResults.length === 0 && (
                  <p className="text-text-muted/70 text-xs text-center py-2">此帳戶找不到相符且已完成的人生藍圖。</p>
                )}
                {ctx.g15SearchError && <p className="checkout-form-error text-xs" role="alert">{ctx.g15SearchError}</p>}
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

            <div className="rounded-xl border border-gold/20 bg-gold/[0.05] p-4 text-left">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={ctx.g15ConsentAccepted}
                onChange={(event) => ctx.setG15ConsentAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#d5ae62]"
                aria-describedby="g15-consent-description g15-consent-status"
              />
              <span id="g15-consent-description" className="text-xs leading-relaxed text-text-muted/80">
                我確認每位成年成員已明確同意本次分析。授權範圍包含讀取其人生藍圖與出生資料。
                我了解只要增減成員就必須重新確認。
              </span>
            </label>
            <p className="mt-3 pl-7 text-xs text-text-muted/80">
              <Link href="/privacy" className="text-gold/90 underline underline-offset-2 hover:text-gold">查看隱私政策</Link>
              （開啟連結不會替您勾選同意）。
            </p>
            <p id="g15-consent-status" className="mt-2 pl-7 text-xs leading-relaxed text-text-muted/80" role={ctx.g15ConsentStatusMessage.includes('超過') ? 'alert' : 'status'} aria-live="polite">
              {ctx.g15ConsentStatusMessage || '勾選後保留 30 分鐘；到期或變更成員時，需要重新確認。'}
            </p>
            </div>

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
