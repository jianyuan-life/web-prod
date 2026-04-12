'use client'

import { type City, type LocationSearchResult, type Country } from '@/lib/cities'
import HistoricalFigures from '@/components/HistoricalFigures'
import FamilyMemberPicker from './FamilyMemberPicker'
import BirthDataFields from './BirthDataFields'
import TimeBlockPicker from './TimeBlockPicker'
import CustomerNote from './CustomerNote'
import ConfirmationModal from './ConfirmationModal'
import { D_TOPICS, type CheckoutFormState as FormState } from './types'

interface SinglePersonFormProps {
  planCode: string
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  timeMode: 'unknown' | 'shichen' | 'exact'
  setTimeMode: (m: 'unknown' | 'shichen' | 'exact') => void
  cityResults: LocationSearchResult[]
  onCitySearch: (val: string) => void
  onCitySelect: (c: City) => void
  onCountrySelect?: (country: Country, isMultiTz: boolean) => void
  onCancelCountry?: () => void
  needCityForCountry?: string
  // D 方案
  dTopic: string
  setDTopic: (v: string) => void
  dOtherDesc: string
  setDOtherDesc: (v: string) => void
  // E1 方案
  e1StartDate: string
  setE1StartDate: (v: string) => void
  e1EndDate: string
  setE1EndDate: (v: string) => void
  // E1/E2 時段
  eSelectedBlocks: boolean[]
  setESelectedBlocks: (v: boolean[]) => void
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
  cityResults, onCitySearch, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
  dTopic, setDTopic, dOtherDesc, setDOtherDesc,
  e1StartDate, setE1StartDate, e1EndDate, setE1EndDate,
  eSelectedBlocks, setESelectedBlocks,
  customerNote, setCustomerNote,
  loading, error, finalPrice, totalPrice, pointsUsed, pointsDiscount, onPointsChange, couponApplied, isFormValid, onSubmit,
  showConfirmModal, onCloseConfirmModal, onConfirmCheckout,
}: SinglePersonFormProps) {
  return (
    <form onSubmit={onSubmit} className="glass rounded-2xl p-6 space-y-4">
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

      {/* 出生資料欄位 */}
      <BirthDataFields
        form={form} setForm={setForm}
        timeMode={timeMode} setTimeMode={setTimeMode}
        cityResults={cityResults}
        onCitySearch={onCitySearch}
        onCitySelect={onCitySelect}
        onCountrySelect={onCountrySelect}
        onCancelCountry={onCancelCountry}
        needCityForCountry={needCityForCountry}
      />

      {/* 方案 D：分析主題 */}
      {planCode === 'D' && (
        <div className="border-t border-gold/10 pt-4 space-y-3">
          <p className="text-sm font-semibold text-gold">專項分析設定</p>
          <div>
            <label className="block text-xs text-text-muted mb-1">分析主題 *</label>
            <select
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
              <label className="block text-xs text-text-muted mb-1">請描述您的問題 *（最多 200 字）</label>
              <textarea
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

      {/* 方案 E1：事件日期範圍（最多 1 個月） */}
      {planCode === 'E1' && (() => {
        const today = new Date().toISOString().split('T')[0]
        const maxStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const maxEnd = e1StartDate
          ? new Date(new Date(e1StartDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : maxStart
        return (
        <div className="border-t border-gold/10 pt-4 space-y-3">
          <p className="text-sm font-semibold text-gold">事件日期</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">希望從何時開始找吉時？ *</label>
              <input
                type="date" required
                value={e1StartDate}
                min={today}
                max={maxStart}
                onChange={(e) => {
                  setE1StartDate(e.target.value)
                  // 如果結束日期超過新開始日期+1個月，自動清空
                  if (e1EndDate) {
                    const newMax = new Date(new Date(e.target.value).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    if (e1EndDate > newMax) setE1EndDate('')
                  }
                }}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-gold/80 mb-1">事件截止日期（選填）</label>
              <input
                type="date"
                value={e1EndDate}
                min={e1StartDate || today}
                max={maxEnd}
                onChange={(e) => setE1EndDate(e.target.value)}
                placeholder="不填則預設 1 個月"
                className="w-full bg-white/5 border border-gold/30 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>
          <p className="text-[10px] text-text-muted/60">不填截止日期 = 從開始日起算 1 個月內找最佳時機。有明確截止日（如面試、簽約）請填寫。</p>
          <div className="mt-4">
            <label className="block text-sm font-semibold text-gold mb-2">事件描述 *（最多 200 字）</label>
            <textarea
              required
              maxLength={200}
              rows={4}
              placeholder="請描述事件背景（如：重要面試、簽約、旅行、搬家）與希望達成的目標..."
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none placeholder:text-text-muted/40"
            />
            <p className="text-[10px] text-text-muted/50 text-right mt-1">{customerNote.length}/200</p>
          </div>
        </div>
        )
      })()}

      {/* E1/E2 可配合出行時段 */}
      {(planCode === 'E1' || planCode === 'E2') && (
        <TimeBlockPicker eSelectedBlocks={eSelectedBlocks} setESelectedBlocks={setESelectedBlocks} />
      )}

      {/* 備注欄 */}
      {!['C', 'D', 'E1', 'E2'].includes(planCode) && (
        <CustomerNote customerNote={customerNote} setCustomerNote={setCustomerNote} />
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* 下一步說明 */}
      <div className="border-t border-gold/10 pt-4 mt-4">
        <p className="text-xs text-text-muted mb-2 font-semibold">付款後會發生什麼？</p>
        <div className="space-y-1.5 text-[11px] text-text-muted/70">
          <p>1. 跳轉至 Stripe 安全付款頁面完成付款</p>
          <p>2. 系統自動開始為您排盤運算與深度分析</p>
          <p>3. 完整報告平均需 30 分鐘以上{['E1', 'E2'].includes(planCode) ? '，出門訣需 40 分鐘以上' : ''}</p>
          <p>4. 完成後寄送 Email 通知，也可在儀表板即時查看</p>
        </div>
      </div>

      <button
        type="submit" disabled={loading || !isFormValid}
        className={`w-full py-3.5 font-bold rounded-xl text-lg mt-4 transition-all ${
          isFormValid
            ? 'bg-gold text-dark btn-glow disabled:opacity-50'
            : 'bg-white/10 text-text-muted cursor-not-allowed'
        }`}
      >
        {loading ? '跳轉付款中...' : isFormValid ? '確認付款' : '請填寫完整資料'}
      </button>

      <p className="text-xs text-text-muted/60 text-center">
        付款由 Stripe 安全處理，您的信用卡資訊不會經過鑒源伺服器
      </p>

      {/* 資料確認彈窗 */}
      <ConfirmationModal
        show={showConfirmModal}
        onClose={onCloseConfirmModal}
        onConfirm={onConfirmCheckout}
        planCode={planCode}
        form={form}
        timeMode={timeMode}
        loading={loading}
        e1StartDate={e1StartDate}
        e1EndDate={e1EndDate}
        eSelectedBlocks={eSelectedBlocks}
        customerNote={customerNote}
        finalPrice={finalPrice}
        totalPrice={totalPrice}
        pointsUsed={pointsUsed}
        pointsDiscount={pointsDiscount}
        onPointsChange={onPointsChange}
        couponApplied={couponApplied}
      />
    </form>
  )
}
