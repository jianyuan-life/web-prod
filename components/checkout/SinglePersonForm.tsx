'use client'

import { useState } from 'react'
import { type City, type LocationSearchResult, type Country } from '@/lib/cities'
import HistoricalFigures from '@/components/HistoricalFigures'
import FamilyMemberPicker from './FamilyMemberPicker'
import BirthDataFields from './BirthDataFields'
import TimeBlockPicker from './TimeBlockPicker'
import ThemePicker from './ThemePicker'
import CustomerNote from './CustomerNote'
import ConfirmationModal from './ConfirmationModal'
import CFinalReviewModal from '@/components/consultation/CFinalReviewModal'
import CheckoutSecurityNote from './CheckoutSecurityNote'
import { isChumenjiPlan } from '@/lib/plan-names'
import { validateGregorianDate } from '@/lib/consultation/gregorian-date'
import {
  currentLocalCalendarDate,
  getConsultationAge,
  isConsultationBirthDateInFuture,
} from '@/lib/checkout/consultation-input-contract'
import { D_TOPICS, E1_EVENT_TYPES } from './types'
import type { ConsultationCheckoutFormState as FormState } from '@/components/consultation/checkout-types'

interface SinglePersonFormProps {
  planCode: string
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  timeMode: 'unknown' | 'shichen' | 'exact'
  setTimeMode: (m: 'unknown' | 'shichen' | 'exact') => void
  cityResults: LocationSearchResult[]
  onCitySearch: (val: string) => void
  onCityResultsDismiss?: () => void
  onCitySelect: (c: City) => void
  onCountrySelect?: (country: Country, isMultiTz: boolean) => void
  onCancelCountry?: () => void
  needCityForCountry?: string
  // D 方案
  dTopic: string
  setDTopic: (v: string) => void
  dOtherDesc: string
  setDOtherDesc: (v: string) => void
  // E1 方案（v5.3.93：砍 e1StartDate,系統自動 T+1）
  e1EndDate: string
  setE1EndDate: (v: string) => void
  e1EventType: string
  setE1EventType: (v: string) => void
  e1HasExactTime: 'yes' | 'no'
  setE1HasExactTime: (v: 'yes' | 'no') => void
  e1EventExactTime: string
  setE1EventExactTime: (v: string) => void
  // E1/E2 時段
  eSelectedBlocks: boolean[]
  setESelectedBlocks: (v: boolean[]) => void
  // E3 月度精選主題（8 選 1-3、順序即 TOP 1/2/3）
  e3SelectedTopics?: string[]
  setE3SelectedTopics?: React.Dispatch<React.SetStateAction<string[]>>
  // 備注
  customerNote: string
  setCustomerNote: (v: string) => void
  // 通用
  loading: boolean
  error: string
  finalPrice: number
  totalPrice?: number
  pointsUsed?: number
  pointsDiscount?: number
  onPointsChange?: (pts: number, discount: number) => void
  couponApplied?: { code: string; discountAmount: number } | null
  isFormValid: boolean
  onSubmit: (e: React.FormEvent) => void
  // 確認彈窗
  showConfirmModal: boolean
  onCloseConfirmModal: () => void
  onConfirmCheckout: () => void
}

export default function SinglePersonForm({
  planCode, form, setForm, timeMode, setTimeMode,
  cityResults, onCitySearch, onCityResultsDismiss, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
  dTopic, setDTopic, dOtherDesc, setDOtherDesc,
  e1EndDate, setE1EndDate,
  e1EventType, setE1EventType, e1HasExactTime, setE1HasExactTime,
  e1EventExactTime, setE1EventExactTime,
  eSelectedBlocks, setESelectedBlocks,
  e3SelectedTopics = [], setE3SelectedTopics = () => {},
  customerNote, setCustomerNote,
  loading, error, finalPrice, totalPrice, pointsUsed, pointsDiscount, onPointsChange, couponApplied, isFormValid, onSubmit,
  showConfirmModal, onCloseConfirmModal, onConfirmCheckout,
}: SinglePersonFormProps) {
  const [validationAttempted, setValidationAttempted] = useState(false)
  const checkoutAsOfDate = currentLocalCalendarDate()
  const currentYear = Number.parseInt(checkoutAsOfDate.slice(0, 4), 10)
  const birthYear = Number.parseInt(form.year, 10)
  const nameInvalid = form.name.trim() === ''
  const yearInvalid = !Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear
  const accessibleValidationEnabled = planCode === 'C'
  const cityInvalid = form.birthCity.trim() === '' || form.cityLat === 0
    || (accessibleValidationEnabled && (!form.timezone || !form.countryCode))
  const gregorianDateValidation = validateGregorianDate(form.year, form.month, form.day)
  const futureBirthDate = accessibleValidationEnabled
    && gregorianDateValidation.valid
    && isConsultationBirthDateInFuture(form.year, form.month, form.day, checkoutAsOfDate)
  const dateInvalid = !gregorianDateValidation.valid || futureBirthDate
  const consultationAge = accessibleValidationEnabled
    ? getConsultationAge(form.year, form.month, form.day, checkoutAsOfDate)
    : null
  const isMinor = consultationAge !== null && consultationAge < 18
  const genderInvalid = form.gender === ''
  const relationshipInvalid = !isMinor && form.marital_status === ''
  const coreFormInvalid = accessibleValidationEnabled
    && (nameInvalid || yearInvalid || dateInvalid || genderInvalid || relationshipInvalid || isMinor || cityInvalid)

  const handleAccessibleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    setValidationAttempted(true)

    if (coreFormInvalid) {
      event.preventDefault()
      const firstInvalidId = nameInvalid
        ? 'checkout-name'
        : yearInvalid
          ? 'checkout-birth-year'
          : dateInvalid
            ? gregorianDateValidation.reason === 'month'
              ? 'checkout-birth-month'
              : 'checkout-birth-day'
            : genderInvalid
              ? 'checkout-gender-M'
              : relationshipInvalid
                ? 'checkout-relationship-single'
                : isMinor
                  ? 'minor-report-boundary-heading'
                  : 'checkout-birth-city'
      window.requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus())
      return
    }

    onSubmit(event)
  }

  return (
    <form onSubmit={handleAccessibleSubmit} className="checkout-form-card space-y-4" aria-labelledby="single-person-form-heading">
      <div>
        <p className="checkout-order-kicker">出生資料</p>
        <h2 id="single-person-form-heading" className="text-xl font-semibold text-cream">填寫分析資料</h2>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">標示 * 的欄位為建立命盤所需資料。</p>
      </div>
      {planCode === 'C' ? (
        <section className="rounded-xl border border-gold/15 bg-gold/[0.045] px-4 py-3" aria-labelledby="consultation-birth-data-safety-heading">
          <h3 id="consultation-birth-data-safety-heading" className="text-sm font-semibold text-gold">請重新核對這份報告的出生資料</h3>
          <p className="mt-1.5 text-xs leading-6 text-text-muted">
            為避免把舊資料中的曆法、時區或出生時間精確度帶錯，人生藍圖暫不提供一鍵匯入。請依出生證明或可靠的家庭紀錄，重新確認下方的國曆日期、時間與出生城市。
          </p>
        </section>
      ) : (
        <>
          {/* 從已儲存的家人選擇（登入時才顯示） */}
          <FamilyMemberPicker onSelect={(m) => {
            setForm(f => ({
              ...f,
              name: m.name,
              year: String(m.year),
              month: String(m.month),
              day: String(m.day),
              hour: String(m.hour),
              minute: String(m.minute),
              gender: m.gender as 'M' | 'F',
              birthCity: m.birth_city,
              cityLat: m.city_lat,
              cityLng: m.city_lng,
              cityTz: m.city_tz,
              calendarType: (m.calendar_type as 'solar' | 'lunar') || 'solar',
              lunarLeap: m.lunar_leap || false,
            }))
            setTimeMode(m.time_mode as 'unknown' | 'shichen' | 'exact')
          }} />

          {/* 一鍵導入歷史人物 */}
          <HistoricalFigures onSelect={(fig) => {
            setForm(f => ({ ...f, name: fig.name, year: fig.year, month: fig.month, day: fig.day, hour: fig.hour, minute: fig.minute, gender: fig.gender as 'M' | 'F' }))
            setTimeMode('shichen')
          }} />
        </>
      )}

      {/* 出生資料欄位 */}
      <BirthDataFields
        form={form} setForm={setForm}
        timeMode={timeMode} setTimeMode={setTimeMode}
        cityResults={cityResults}
        onCitySearch={onCitySearch}
        onCityResultsDismiss={onCityResultsDismiss}
        onCitySelect={onCitySelect}
        onCountrySelect={onCountrySelect}
        onCancelCountry={onCancelCountry}
        needCityForCountry={needCityForCountry}
        accessibleValidationEnabled={accessibleValidationEnabled}
        validationAttempted={validationAttempted}
        nameInvalid={nameInvalid}
        yearInvalid={yearInvalid}
        cityInvalid={cityInvalid}
        consultationBirthSafetyEnabled={planCode === 'C'}
      />

      {/* 方案 D：分析主題 */}
      {planCode === 'D' && (
        <div className="border-t border-gold/10 pt-4 space-y-3">
          <p className="text-sm font-semibold text-gold">專項分析設定</p>
          <div>
            <label htmlFor="checkout-d-topic" className="block text-xs text-text-muted mb-1">分析主題 *</label>
            <select
              id="checkout-d-topic"
              required
              value={dTopic}
              onChange={(e) => setDTopic(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
            >
              {D_TOPICS.map((t) => <option key={t} value={t} className="bg-[#1a1a2e] text-white">{t}</option>)}
            </select>
          </div>
          {dTopic === '問事（其他）' && (
            <div>
              <label htmlFor="checkout-d-other" className="block text-xs text-text-muted mb-1">請描述您的問題 *（最多 200 字）</label>
              <textarea
                id="checkout-d-other"
                required
                maxLength={200}
                rows={3}
                placeholder="請詳細說明您想了解的問題..."
                value={dOtherDesc}
                onChange={(e) => setDOtherDesc(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none"
              />
              <p className="text-[10px] text-text-muted/50 text-right mt-1">{dOtherDesc.length}/200</p>
            </div>
          )}
        </div>
      )}

      {/* 方案 E1：事件類型 + 事件日期（最早 T+7、最晚 T+30） */}
      {planCode === 'E1' && (
        <div className="border-t border-gold/10 pt-4 space-y-3">
          {/* 事件類型 */}
          <div>
            <label htmlFor="e1-event-type" className="block text-sm font-semibold text-gold mb-2">事件類型 *</label>
            <select
              id="e1-event-type"
              required
              value={e1EventType}
              onChange={(e) => setE1EventType(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
            >
              <option value="" disabled className="bg-[#1a1a2e] text-white">請選擇事件類型</option>
              {E1_EVENT_TYPES.map((t) => <option key={t} value={t} className="bg-[#1a1a2e] text-white">{t}</option>)}
            </select>
            <p className="text-[10px] text-text-muted/60 mt-1">您選的事件類型會決定吉時的「守護面向」— 例如面試優先找有貴人星的時辰、手術優先找天醫守護的時辰</p>
          </div>

          {/* 有無明確時間 */}
          <fieldset>
            <legend className="block text-sm font-semibold text-gold mb-2">事件有無固定時間？ *</legend>
            <div className="flex gap-6 flex-wrap">
              <label className="checkout-choice flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="e1-has-exact-time" value="yes"
                  checked={e1HasExactTime === 'yes'}
                  onChange={() => setE1HasExactTime('yes')}
                  className="accent-gold"
                />
                <span className="text-sm text-text">有（如面試、簽約、會議已排好時間）</span>
              </label>
              <label className="checkout-choice flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="e1-has-exact-time" value="no"
                  checked={e1HasExactTime === 'no'}
                  onChange={() => { setE1HasExactTime('no'); setE1EventExactTime('') }}
                  className="accent-gold"
                />
                <span className="text-sm text-text">無（由我們找最佳吉時）</span>
              </label>
            </div>
            <p className="text-[10px] text-text-muted/60 mt-1">{e1HasExactTime === 'yes' ? '請於下方事件描述註明確切時間，系統會驗證該時辰的吉凶' : '系統會從事件日期範圍內找出 Top3 最佳吉時'}</p>
          </fieldset>

          {/* 事件日期 */}
          <div>
            <label htmlFor="e1-event-date" className="block text-sm font-semibold text-gold mb-2">事件日期 *</label>
            {/* v5.3.92 規則:最早 T+7(給足準備時間)、最晚 T+30(一個月內) */}
            <select
              id="e1-event-date"
              required
              value={e1EndDate}
              onChange={(e) => setE1EndDate(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none cursor-pointer"
            >
              <option value="" disabled>請選擇您的事件日期</option>
              {Array.from({ length: 24 }, (_, i) => {
                const days = i + 7  // T+7 起(最早 7 天後),到 T+30(最晚 30 天內)
                const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
                const v = d.toISOString().split('T')[0]
                const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
                return <option key={v} value={v}>{v} (週{weekday}、{days} 天後)</option>
              })}
            </select>
            <p className="text-[10px] text-text-muted/60 mt-1">為保證排盤品質與前置補運時間、事件日需 7-30 天內。系統會從明天開始為您找 Top 3 最佳吉時</p>
          </div>

          {/* v5.3.22：yes 模式下要求填事件確切時辰 */}
          {e1HasExactTime === 'yes' && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <label htmlFor="e1-exact-time" className="block text-sm font-semibold text-gold mb-2">事件確切時間 *（HH:MM）</label>
              <input
                id="e1-exact-time"
                type="time"
                required
                value={e1EventExactTime}
                onChange={(e) => setE1EventExactTime(e.target.value)}
                className="w-full bg-white/5 border border-gold/30 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none [color-scheme:dark]"
              />
              <p className="text-[10px] text-text-muted/60 mt-1">
                事件的確切開始時間（如：面試 14:00、簽約 15:30）。系統會直接評估這個時辰的吉凶並提供前置補運建議、而不只是找 Top 3 吉時。
              </p>
            </div>
          )}
          <div className="mt-4">
            <label htmlFor="e1-event-desc" className="block text-sm font-semibold text-gold mb-2">事件描述 *（最多 400 字）</label>
            <textarea
              id="e1-event-desc"
              required
              maxLength={400}
              rows={5}
              placeholder={e1HasExactTime === 'yes'
                ? '請描述事件背景+確切時間（如：下午3點面試科技公司HR、對方要求介紹三個作品、希望對方留下專業印象）…'
                : '請描述事件背景（如：重要面試、簽約、搬家）與您希望達成的目標、系統會依此推薦最契合的吉時…'}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none placeholder:text-text-muted/40"
            />
            <p className="text-[10px] text-text-muted/50 text-right mt-1">{customerNote.length}/400</p>
          </div>
        </div>
      )}

      {/* v5.3.59 規格書對齊：
          - E1 事件擇吉：勾選候選時辰（最少 1 個）
          - E2 月度單盤：極簡、不勾時辰（引擎自動給當月主吉時）
          - E3 月度精選：勾選候選時辰（最少 3 個）+ 主題選擇（8 類選 1-3）
          - E4 年度全運：極簡、不勾時辰（引擎自動給年盤+12月盤） */}
      {/* E3 主題選擇（8 選 1-3、TOP 1/2/3 按點選順序）*/}
      {planCode === 'E3' && (
        <ThemePicker selectedTopics={e3SelectedTopics} onChange={setE3SelectedTopics} />
      )}

      {(planCode === 'E1' || planCode === 'E3') && (
        <TimeBlockPicker
          eSelectedBlocks={eSelectedBlocks}
          setESelectedBlocks={setESelectedBlocks}
        />
      )}
      {planCode === 'E3' && (
        <p className="text-[10px] text-gold/60 mt-1">
          ⓘ E3 月度精選需勾選至少 3 個時辰（候選池要 84 個以上才能挑 Top 2 × 4 週）
        </p>
      )}
      {(planCode === 'E2' || planCode === 'E4') && (
        <div className="rounded-xl bg-gold/5 border border-gold/10 p-3">
          <p className="text-xs text-text leading-[1.7]">
            <strong className="text-gold">⚙ 引擎自動擇吉：</strong>
            {planCode === 'E2'
              ? '本方案採奇門紫白擇日派四層架構推演（紫白飛星月+年吉星並集）、引擎自動算出當月主吉方與最佳吉時窗口、無需客戶勾選。'
              : '本方案採年家奇門＋月家奇門、引擎自動推出年盤主吉方 + 12 個月盤各自吉時、無需客戶勾選。'}
          </p>
        </div>
      )}

      {planCode === 'C' && (
        <CustomerNote customerNote={customerNote} setCustomerNote={setCustomerNote} consultation />
      )}

      {/* v5.3.61 備注欄：
          - C/D 方案在 TopicAndDescription 已有描述區
          - E1 在事件描述區已有
          - E2/E4 極簡不需描述
          - E3 選 3 個主題 TOP 1/2/3 已表達優先序、不需自由文字
          所以所有方案都不顯示 CustomerNote */}

      {error && <p className="checkout-form-error text-sm" role="alert">{error}</p>}

      {/* 下一步說明 */}
      <section className="border-t border-gold/10 pt-4 mt-4" aria-labelledby="checkout-next-heading">
        <h3 id="checkout-next-heading" className="text-xs text-text-muted mb-2 font-semibold">付款後會發生什麼？</h3>
        {planCode === 'C' ? (
          <ol className="space-y-1.5 pl-5 text-[11px] text-text-muted/70 list-decimal">
            <li>先在確認視窗核對出生資料、委託內容與實付金額</li>
            <li>{finalPrice === 0 ? '確認後直接建立報告，本次無須刷卡' : '確認後才前往 Stripe 完成一次性付款'}</li>
            <li>付款成功後開始排盤與章節生成；時間會依資料與系統負載而異</li>
            <li>完成後寄送 Email 通知，也可在「我的報告」閱讀與下載 PDF</li>
          </ol>
        ) : (
          <ol className="space-y-1.5 pl-5 text-[11px] text-text-muted/70 list-decimal">
            <li>跳轉至 Stripe 安全付款頁面完成付款</li>
            <li>系統自動開始為您排盤運算與深度分析</li>
            <li>完整報告平均需 30 分鐘以上{isChumenjiPlan(planCode) ? '，出門訣需 40 分鐘以上' : ''}</li>
            <li>完成後寄送 Email 通知，也可在儀表板即時查看</li>
          </ol>
        )}
      </section>

      <CheckoutSecurityNote />

      {accessibleValidationEnabled && validationAttempted && coreFormInvalid && (
        <div role="alert" id="checkout-validation-summary" className="checkout-form-error rounded-lg p-3 text-sm" tabIndex={-1}>
          <p className="font-semibold">請先修正下列資料：</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {nameInvalid && <li>請填寫姓名。</li>}
            {yearInvalid && <li>出生年份須介於 1900 與 {currentYear} 年。</li>}
            {!yearInvalid && futureBirthDate && <li>出生日期不能晚於今天（以香港日期 {checkoutAsOfDate} 為準）。</li>}
            {!yearInvalid && dateInvalid && !futureBirthDate && <li>請選擇實際存在的國曆出生日期。</li>}
            {genderInvalid && <li>請選擇性別，以核對排盤規則。</li>}
            {relationshipInvalid && <li>請選擇目前關係狀態；也可以選擇不願回答。</li>}
            {isMinor && <li>人生藍圖的未成年人專屬流程尚未完成驗收，目前不接受此筆付款。</li>}
            {cityInvalid && <li>請從搜尋結果中選定出生城市，讓系統取得正確時區與座標。</li>}
          </ul>
        </div>
      )}

      <button
        type="submit" disabled={loading || (!accessibleValidationEnabled && !isFormValid)}
        onClick={() => setValidationAttempted(true)}
        aria-describedby={accessibleValidationEnabled && validationAttempted && coreFormInvalid ? 'checkout-validation-summary' : undefined}
        className={planCode === 'C'
          ? `mt-4 w-full cursor-pointer rounded-xl py-3.5 text-lg font-bold transition-all disabled:cursor-not-allowed ${
              isFormValid
                ? 'bg-gold text-dark btn-glow disabled:opacity-50'
                : 'bg-white/10 text-text-muted'
            }`
          : `w-full py-3.5 font-bold rounded-xl text-lg mt-4 transition-all ${
              isFormValid
                ? 'bg-gold text-dark btn-glow disabled:opacity-50'
                : 'bg-white/10 text-text-muted cursor-not-allowed'
            }`}
      >
        {loading
          ? finalPrice === 0 ? '正在建立報告…' : '正在連接 Stripe…'
          : isMinor
            ? '未成年人委託暫未開放'
          : isFormValid
            ? planCode === 'C'
              ? finalPrice === 0 ? '核對資料並繼續' : `核對資料與金額 — USD ${finalPrice}`
              : finalPrice === 0 ? '檢查資料並免費領取報告' : `檢查資料並付款 — USD ${finalPrice}`
            : '請填寫完整資料'}
      </button>

      {/* 資料確認彈窗 */}
      {planCode === 'C' ? (
        <CFinalReviewModal
          show={showConfirmModal}
          onClose={onCloseConfirmModal}
          onConfirm={onConfirmCheckout}
          form={form}
          timeMode={timeMode}
          loading={loading}
          customerNote={customerNote}
          finalPrice={finalPrice}
          totalPrice={totalPrice}
          pointsUsed={pointsUsed}
          pointsDiscount={pointsDiscount}
          onPointsChange={onPointsChange}
          couponApplied={couponApplied}
        />
      ) : (
        <ConfirmationModal
          show={showConfirmModal}
          onClose={onCloseConfirmModal}
          onConfirm={onConfirmCheckout}
          planCode={planCode}
          form={form}
          timeMode={timeMode}
          loading={loading}
          e1EndDate={e1EndDate}
          e1EventType={e1EventType}
          e1HasExactTime={e1HasExactTime}
          eSelectedBlocks={eSelectedBlocks}
          customerNote={customerNote}
          finalPrice={finalPrice}
          totalPrice={totalPrice}
          pointsUsed={pointsUsed}
          pointsDiscount={pointsDiscount}
          onPointsChange={onPointsChange}
          couponApplied={couponApplied}
        />
      )}
    </form>
  )
}
