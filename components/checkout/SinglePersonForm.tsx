'use client'

import { type City, type LocationSearchResult, type Country } from '@/lib/cities'
import HistoricalFigures from '@/components/HistoricalFigures'
import FamilyMemberPicker from './FamilyMemberPicker'
import BirthDataFields from './BirthDataFields'
import TimeBlockPicker from './TimeBlockPicker'
import ThemePicker from './ThemePicker'
import CustomerNote from './CustomerNote'
import ConfirmationModal from './ConfirmationModal'
import { D_TOPICS, E1_EVENT_TYPES, type CheckoutFormState as FormState } from './types'

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
  e1EventType: string
  setE1EventType: (v: string) => void
  e1HasExactTime: 'yes' | 'no'
  setE1HasExactTime: (v: 'yes' | 'no') => void
  e1EventExactTime: string
  setE1EventExactTime: (v: string) => void
  // E1/E2 時段
  eSelectedBlocks: boolean[]
  setESelectedBlocks: (v: boolean[]) => void
  // E3 週度補運主題（8 選 1-3、順序即 TOP 1/2/3）
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
  cityResults, onCitySearch, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
  dTopic, setDTopic, dOtherDesc, setDOtherDesc,
  e1StartDate, setE1StartDate, e1EndDate, setE1EndDate,
  e1EventType, setE1EventType, e1HasExactTime, setE1HasExactTime,
  e1EventExactTime, setE1EventExactTime,
  eSelectedBlocks, setESelectedBlocks,
  e3SelectedTopics = [], setE3SelectedTopics = () => {},
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

      {/* 方案 E1：事件類型 + 事件日期範圍（最早 7 天後、最晚 30 天內） */}
      {planCode === 'E1' && (() => {
        // 事件日期規則：最早今天+7 天（給足排盤準備與提前準備時間）、最晚今天+30 天
        const minStartDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const maxStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const maxEnd = e1StartDate
          ? new Date(new Date(e1StartDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : maxStartDate
        return (
        <div className="border-t border-gold/10 pt-4 space-y-3">
          {/* 事件類型 */}
          <div>
            <label className="block text-sm font-semibold text-gold mb-2">事件類型 *</label>
            <select
              required
              value={e1EventType}
              onChange={(e) => setE1EventType(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
            >
              <option value="" className="bg-[#1a1a2e] text-white">請選擇事件類型</option>
              {E1_EVENT_TYPES.map((t) => <option key={t} value={t} className="bg-[#1a1a2e] text-white">{t}</option>)}
            </select>
            <p className="text-[10px] text-text-muted/60 mt-1">系統會依據事件類型調整吉時篩選條件（如財運 vs. 貴人 vs. 安全等）</p>
          </div>

          {/* 有無明確時間 */}
          <div>
            <label className="block text-sm font-semibold text-gold mb-2">事件有無固定時間？ *</label>
            <div className="flex gap-6 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="e1-has-exact-time" value="yes"
                  checked={e1HasExactTime === 'yes'}
                  onChange={() => setE1HasExactTime('yes')}
                  className="accent-gold"
                />
                <span className="text-sm text-text">有（如面試、簽約、會議已排好時間）</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="e1-has-exact-time" value="no"
                  checked={e1HasExactTime === 'no'}
                  onChange={() => setE1HasExactTime('no')}
                  className="accent-gold"
                />
                <span className="text-sm text-text">無（由我們找最佳吉時）</span>
              </label>
            </div>
            <p className="text-[10px] text-text-muted/60 mt-1">{e1HasExactTime === 'yes' ? '請於下方事件描述註明確切時間，系統會驗證該時辰的吉凶' : '系統會從事件日期範圍內找出 Top3 最佳吉時'}</p>
          </div>

          <p className="text-sm font-semibold text-gold">事件日期</p>
          <div>
            <label className="block text-xs text-text-muted mb-1">您的事件會在哪一天發生？*</label>
            {/* v5.3.91 簡化:只要事件日、系統自動從明天(T+1)開始找吉時、到事件日為止 */}
            <select
              required
              value={e1EndDate}
              onChange={(e) => setE1EndDate(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none cursor-pointer"
            >
              <option value="">請選擇事件日期</option>
              {Array.from({ length: 30 }, (_, i) => {
                const days = i + 2  // T+2 起(給出 1 天準備),到 T+31
                const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
                const v = d.toISOString().split('T')[0]
                const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
                return <option key={v} value={v}>{v} (週{weekday}、{days} 天後)</option>
              })}
            </select>
            <p className="text-[10px] text-text-muted/60 mt-1">💡 系統會從明天開始、到您的事件日為止、找出 Top 3 最佳吉時</p>
          </div>

          {/* v5.3.22：yes 模式下要求填事件確切時辰 */}
          {e1HasExactTime === 'yes' && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <label className="block text-sm font-semibold text-gold mb-2">事件確切時間 *（HH:MM）</label>
              <input
                type="time"
                required
                value={e1EventExactTime}
                onChange={(e) => setE1EventExactTime(e.target.value)}
                className="w-full bg-white/5 border border-gold/30 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none [color-scheme:dark]"
              />
              <p className="text-[10px] text-text-muted/60 mt-1">
                事件的確切開始時間（如：面試 14:00、簽約 15:30）。
                系統會**直接評估這個時辰的吉凶**並提供前置補運建議，而不只是找 Top 3 吉時。
              </p>
            </div>
          )}
          <div className="mt-4">
            <label className="block text-sm font-semibold text-gold mb-2">事件描述 *（最多 200 字）</label>
            <textarea
              required
              maxLength={200}
              rows={4}
              placeholder={e1HasExactTime === 'yes'
                ? '請描述事件與確切時間（如：4月25日下午3點面試，對方是科技公司HR）...'
                : '請描述事件背景（如：重要面試、簽約、旅行、搬家）與希望達成的目標...'}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none placeholder:text-text-muted/40"
            />
            <p className="text-[10px] text-text-muted/50 text-right mt-1">{customerNote.length}/200</p>
          </div>
        </div>
        )
      })()}

      {/* v5.3.59 規格書對齊：
          - E1 事件出門訣：勾選候選時辰（最少 1 個）
          - E2 月度出門訣：極簡、不勾時辰（引擎自動給當月主吉時）
          - E3 週度補運：勾選候選時辰（最少 3 個）+ 主題選擇（8 類選 1-3）
          - E4 年度方案：極簡、不勾時辰（引擎自動給年盤+12月盤） */}
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
          ⓘ E3 週度補運需勾選至少 3 個時辰（候選池要 84 個以上才能挑 Top 2 × 4 週）
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

      {/* v5.3.61 備注欄：
          - C/D 方案在 TopicAndDescription 已有描述區
          - E1 在事件描述區已有
          - E2/E4 極簡不需描述
          - E3 選 3 個主題 TOP 1/2/3 已表達優先序、不需自由文字
          所以所有方案都不顯示 CustomerNote */}

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
    </form>
  )
}
