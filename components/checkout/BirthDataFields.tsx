'use client'

import { useState } from 'react'
import { type City, type LocationSearchResult, type Country } from '@/lib/cities'
import { displayTzOffset, isDstAt } from '@/lib/cities-with-tz'
import BirthTimeField from './BirthTimeField'
import { type CheckoutFormState as FormState } from './types'

interface BirthDataFieldsProps {
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
  accessibleValidationEnabled?: boolean
  validationAttempted?: boolean
  nameInvalid?: boolean
  yearInvalid?: boolean
  cityInvalid?: boolean
}

export default function BirthDataFields({
  form, setForm, timeMode, setTimeMode,
  cityResults, onCitySearch, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
  accessibleValidationEnabled = false,
  validationAttempted = false,
  nameInvalid = false,
  yearInvalid = false,
  cityInvalid = false,
}: BirthDataFieldsProps) {
  const [activeCityIndex, setActiveCityIndex] = useState(-1)
  const cityListOpen = cityResults.length > 0
  const showNameError = accessibleValidationEnabled && validationAttempted && nameInvalid
  const showYearError = accessibleValidationEnabled && validationAttempted && yearInvalid
  const showCityError = accessibleValidationEnabled && validationAttempted && cityInvalid

  const selectLocation = (result: LocationSearchResult) => {
    if (result.type === 'country') {
      onCountrySelect?.(result.country, result.isMultiTz)
    } else {
      onCitySelect(result.city)
    }
    setActiveCityIndex(-1)
  }

  const handleCityKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!accessibleValidationEnabled) return

    switch (event.key) {
      case 'ArrowDown':
        if (cityResults.length === 0) return
        event.preventDefault()
        setActiveCityIndex((current) => (current + 1) % cityResults.length)
        break
      case 'ArrowUp':
        if (cityResults.length === 0) return
        event.preventDefault()
        setActiveCityIndex((current) => current <= 0 ? cityResults.length - 1 : current - 1)
        break
      case 'Enter':
        if (activeCityIndex < 0 || !cityResults[activeCityIndex]) return
        event.preventDefault()
        selectLocation(cityResults[activeCityIndex])
        break
      case 'Escape':
        if (!cityListOpen) return
        event.preventDefault()
        onCitySearch('')
        setActiveCityIndex(-1)
        break
    }
  }

  return (
    <>
      {/* 姓名 */}
      <div>
        <label htmlFor="checkout-name" className="block text-xs text-text-muted mb-1">姓名 *</label>
        <input
          id="checkout-name"
          type="text" required placeholder="請輸入您的全名"
          value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          aria-invalid={accessibleValidationEnabled ? showNameError : undefined}
          aria-describedby={showNameError ? 'checkout-name-error' : undefined}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
        />
        {showNameError && <p id="checkout-name-error" className="checkout-form-error mt-1 text-xs">請填寫姓名。</p>}
      </div>

      {/* 國曆/農曆切換 — v5.10.471 暫時下架農曆選項(2026-08-01 L4 審查發現 P0:
          排盤 API 的 BirthRequest 未宣告 calendar_type、pydantic extra:'ignore' 靜默丟棄,
          農曆生日會被當國曆排盤(差近一個月、15 套全錯)。實測 89 筆付費訂單 0 筆農曆、無既往受災。
          待 API 端補欄位+轉換(比照 /api/free-bazi 的 lunar-to-solar 路徑)後恢復本切換 UI。
          詳:tasks/goal_2026-08-01_report_overhaul/CALC_INPUT_AUDIT.md */}
      <fieldset>
        <legend className="block text-xs text-text-muted mb-1">曆法</legend>
        <div className="flex rounded-lg overflow-hidden border border-gold/20" role="group" aria-label="選擇曆法">
          <span className="flex-1 py-2.5 text-sm font-medium text-center bg-gold/20 text-gold">國曆（西曆）</span>
        </div>
        <p className="text-[11px] text-text-muted mt-1.5 leading-5">
          目前僅支援國曆生日。若您只記得農曆生日,可先用
          <a href="/tools/bazi" className="text-gold underline underline-offset-2 mx-0.5">免費八字工具</a>
          的農曆轉換查出對應國曆日期,再回來填寫。
        </p>
      </fieldset>

      {/* 年月日 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="checkout-birth-year" className="block text-xs text-text-muted mb-1">出生年</label>
          <input
            id="checkout-birth-year"
            type="number" min={accessibleValidationEnabled ? 1900 : 1920} max={accessibleValidationEnabled ? new Date().getFullYear() : 2030}
            required={accessibleValidationEnabled || undefined}
            value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
            aria-invalid={accessibleValidationEnabled ? showYearError : undefined}
            aria-describedby={showYearError ? 'checkout-birth-year-error' : undefined}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
          />
          {showYearError && <p id="checkout-birth-year-error" className="checkout-form-error mt-1 text-xs">請填寫有效的出生年份。</p>}
        </div>
        <div>
          <label htmlFor="checkout-birth-month" className="block text-xs text-text-muted mb-1">{form.calendarType === 'lunar' ? '農曆月' : '月'}</label>
          <select id="checkout-birth-month" value={form.month} onChange={(e) => setForm(f => ({ ...f, month: e.target.value }))}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {form.calendarType === 'lunar'
                  ? ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'][i] + '月'
                  : `${i + 1}月`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="checkout-birth-day" className="block text-xs text-text-muted mb-1">{form.calendarType === 'lunar' ? '農曆日' : '日'}</label>
          <select id="checkout-birth-day" value={form.day} onChange={(e) => setForm(f => ({ ...f, day: e.target.value }))}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {Array.from({ length: form.calendarType === 'lunar' ? 30 : 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {form.calendarType === 'lunar'
                  ? ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'][i]
                  : `${i + 1}日`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 出生時間 */}
      <BirthTimeField
        timeMode={timeMode}
        setTimeMode={setTimeMode}
        hour={form.hour}
        minute={form.minute}
        onChange={(field, val) => setForm(f => ({ ...f, [field]: val }))}
      />

      {/* 性別 */}
      <fieldset>
        <legend className="block text-xs text-text-muted mb-1">性別</legend>
        <div className="flex gap-6">
          {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
            <label key={v} className="checkout-choice flex items-center gap-2 cursor-pointer">
              <input type="radio" name="gender" value={v} checked={form.gender === v}
                onChange={(e) => setForm(f => ({ ...f, gender: e.target.value }))} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* v5.10.5 婚姻狀況(C/D/G15/R 感情段個性化、避免對已婚客戶寫「該找對象」誤導)*/}
      <fieldset>
        <legend className="block text-xs text-text-muted mb-1">婚姻狀況 <span className="text-red-400">*</span></legend>
        <div className="flex gap-6">
          {[{ v: 'unmarried' as const, l: '未婚' }, { v: 'married' as const, l: '已婚' }].map(({ v, l }) => (
            <label key={v} className="checkout-choice flex items-center gap-2 cursor-pointer">
              <input type="radio" name="marital_status" value={v} checked={form.marital_status === v}
                onChange={() => setForm(f => ({ ...f, marital_status: v }))} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-text-muted/60 mt-1">影響感情/家庭運勢段的詮釋方向(已婚聚焦婚姻品質、未婚聚焦擇偶與桃花)</p>
      </fieldset>

      {/* 出生地區 */}
      <div className="relative">
        <label htmlFor="checkout-birth-city" className="block text-xs text-text-muted mb-1">出生地區 <span className="text-red-400">*</span></label>
        {needCityForCountry && (
          <p className="text-xs text-gold/80 mb-1">已選擇「{needCityForCountry}」（多時區），請輸入城市名</p>
        )}
        <input
          id="checkout-birth-city"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={cityListOpen}
          aria-controls="checkout-city-results"
          aria-activedescendant={accessibleValidationEnabled && activeCityIndex >= 0 ? `checkout-city-option-${activeCityIndex}` : undefined}
          aria-invalid={accessibleValidationEnabled ? showCityError : undefined}
          aria-describedby={showCityError ? 'checkout-birth-city-error' : undefined}
          required={accessibleValidationEnabled || undefined}
          placeholder={needCityForCountry ? `輸入${needCityForCountry}的城市名` : '輸入地區名（如：台灣、香港、日本）'}
          value={form.birthCity}
          onChange={(e) => { setActiveCityIndex(-1); onCitySearch(e.target.value) }}
          onKeyDown={handleCityKeyDown}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
        />
        {showCityError && <p id="checkout-birth-city-error" className="checkout-form-error mt-1 text-xs">請從搜尋結果中選定出生城市。</p>}
        {cityListOpen && (
          <div id="checkout-city-results" className="absolute z-10 w-full mt-1 bg-dark border border-gold/20 rounded-lg overflow-hidden shadow-xl max-h-48 overflow-y-auto" role="listbox" aria-label="出生地區搜尋結果">
            {cityResults.map((r, idx) => r.type === 'country' ? (
              <button id={`checkout-city-option-${idx}`} key={`country-${r.country.name}`} type="button"
                className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center ${activeCityIndex === idx ? 'bg-gold/10' : ''}`}
                onMouseEnter={() => accessibleValidationEnabled && setActiveCityIndex(idx)}
                onClick={() => selectLocation(r)}
                role="option"
                aria-selected={activeCityIndex === idx}
              >
                <span>{r.country.name}</span>
                <span className="text-[10px] text-text-muted/60">
                  {r.isMultiTz ? '多時區，請選擇城市' : `UTC${r.country.tz >= 0 ? '+' : ''}${r.country.tz}`}
                </span>
              </button>
            ) : (
              <button id={`checkout-city-option-${idx}`} key={`city-${r.city.name_en}-${idx}`} type="button"
                className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center ${activeCityIndex === idx ? 'bg-gold/10' : ''}`}
                onMouseEnter={() => accessibleValidationEnabled && setActiveCityIndex(idx)}
                onClick={() => selectLocation(r)}
                role="option"
                aria-selected={activeCityIndex === idx}
              >
                <span>{r.city.name}（{r.city.country}）</span>
                <span className="text-[10px] text-text-muted/60">UTC{r.city.tz >= 0 ? '+' : ''}{r.city.tz}</span>
              </button>
            ))}
          </div>
        )}
        {needCityForCountry && (
          <button type="button" onClick={() => onCancelCountry?.()}
            className="text-xs text-gold/60 hover:text-gold mt-1 underline">取消，重新選擇國家</button>
        )}
        {form.cityLat !== 0 && (() => {
          // 依出生日期動態計算當時的實際時區偏移（含 DST）
          const year = parseInt(form.year) || 2000
          const month = parseInt(form.month) || 1
          const day = parseInt(form.day) || 1
          let dstHint = ''
          let effectiveTz = form.cityTz
          if (form.timezone) {
            try {
              const birthAt = new Date(year, month - 1, day, 12, 0, 0)
              effectiveTz = displayTzOffset(form.timezone, birthAt)
              const dst = isDstAt(form.timezone, birthAt)
              if (dst && effectiveTz !== form.cityTz) {
                dstHint = `（出生時為夏令時 UTC${effectiveTz >= 0 ? '+' : ''}${effectiveTz}）`
              }
            } catch {}
          }
          return (
            <p className="text-[10px] text-text-muted/50 mt-1">
              經度 {form.cityLng.toFixed(2)}° | 時區 UTC{form.cityTz >= 0 ? '+' : ''}{form.cityTz}{dstHint}
              {form.timezone ? ` | ${form.timezone}` : ''} | 將自動校正真太陽時與 DST
            </p>
          )
        })()}
      </div>
    </>
  )
}
