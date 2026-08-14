'use client'

import { useEffect, useMemo, useState } from 'react'
import { type City, type LocationSearchResult, type Country } from '@/lib/cities'
import { displayTzOffset, isDstAt } from '@/lib/cities-with-tz'
import { daysInGregorianMonth, validateGregorianDate } from '@/lib/consultation/gregorian-date'
import {
  currentLocalCalendarDate,
  getConsultationAge,
  isConsultationBirthDateInFuture,
} from '@/lib/checkout/consultation-input-contract'
import {
  classifyConsultationLocalTime,
  consultationLocalTimeIssueMessage,
  consultationTimezoneOffsetHoursAtEpoch,
  resolveConsultationUnknownTime,
} from '@/lib/consultation/local-time-validity'
import BirthTimeField from './BirthTimeField'
import type { ConsultationCheckoutFormState as FormState } from '@/components/consultation/checkout-types'

interface BirthDataFieldsProps {
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
  accessibleValidationEnabled?: boolean
  validationAttempted?: boolean
  nameInvalid?: boolean
  yearInvalid?: boolean
  cityInvalid?: boolean
  consultationBirthSafetyEnabled?: boolean
}

export default function BirthDataFields({
  form, setForm, timeMode, setTimeMode,
  cityResults, onCitySearch, onCityResultsDismiss, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
  accessibleValidationEnabled = false,
  validationAttempted = false,
  nameInvalid = false,
  yearInvalid = false,
  cityInvalid = false,
  consultationBirthSafetyEnabled = false,
}: BirthDataFieldsProps) {
  const [activeCityIndex, setActiveCityIndex] = useState(-1)
  const cityListOpen = cityResults.length > 0
  const showNameError = accessibleValidationEnabled && validationAttempted && nameInvalid
  const showYearError = accessibleValidationEnabled && validationAttempted && yearInvalid
  const showCityError = accessibleValidationEnabled && validationAttempted && cityInvalid
  const checkoutAsOfDate = currentLocalCalendarDate()
  const checkoutYear = Number.parseInt(checkoutAsOfDate.slice(0, 4), 10)
  const parsedYear = Number.parseInt(form.year, 10)
  const parsedMonth = Number.parseInt(form.month, 10)
  const gregorianDayCount = daysInGregorianMonth(parsedYear, parsedMonth) || 31
  const legacyDayCount = form.calendarType === 'lunar' ? 30 : 31
  const dayOptionCount = consultationBirthSafetyEnabled ? gregorianDayCount : legacyDayCount
  const consultationAge = consultationBirthSafetyEnabled
    ? getConsultationAge(form.year, form.month, form.day, checkoutAsOfDate)
    : null
  const futureBirthDate = consultationBirthSafetyEnabled
    && validateGregorianDate(form.year, form.month, form.day).valid
    && isConsultationBirthDateInFuture(form.year, form.month, form.day, checkoutAsOfDate)
  const isMinor = consultationAge !== null && consultationAge < 18
  const showGenderError = consultationBirthSafetyEnabled && validationAttempted && !form.gender
  const showRelationshipError = consultationBirthSafetyEnabled && validationAttempted && !form.marital_status
  const localTimeValidity = useMemo(() => {
    if (!consultationBirthSafetyEnabled || !form.timezone) {
      return { status: 'unique' as const, candidateEpochMs: [] }
    }
    if (timeMode === 'unknown') {
      return resolveConsultationUnknownTime({
        year: parsedYear,
        month: parsedMonth,
        day: Number.parseInt(form.day, 10),
        timezone: form.timezone,
      })
    }
    return classifyConsultationLocalTime({
      year: parsedYear,
      month: parsedMonth,
      day: Number.parseInt(form.day, 10),
      hour: Number.parseInt(form.hour, 10),
      minute: timeMode === 'exact' ? Number.parseInt(form.minute, 10) : 0,
      timezone: form.timezone,
    })
  }, [consultationBirthSafetyEnabled, form.day, form.hour, form.minute, form.timezone, parsedMonth, parsedYear, timeMode])

  useEffect(() => {
    if (!consultationBirthSafetyEnabled || consultationAge === null) return
    setForm((current) => {
      if (isMinor && current.marital_status !== 'not_applicable') {
        return { ...current, marital_status: 'not_applicable' }
      }
      if (!isMinor && current.marital_status === 'not_applicable') {
        return {
          ...current,
          marital_status: '',
          guardian_name: '',
          guardian_relationship: '',
          guardian_consent: false,
        }
      }
      return current
    })
  }, [consultationAge, consultationBirthSafetyEnabled, isMinor, setForm])

  const updateGregorianDatePart = (field: 'year' | 'month', value: string) => {
    setForm((current) => {
      if (!consultationBirthSafetyEnabled) return { ...current, [field]: value }

      const nextYear = field === 'year' ? Number.parseInt(value, 10) : Number.parseInt(current.year, 10)
      const nextMonth = field === 'month' ? Number.parseInt(value, 10) : Number.parseInt(current.month, 10)
      const nextMonthLength = daysInGregorianMonth(nextYear, nextMonth)
      const currentDay = Number.parseInt(current.day, 10)

      return {
        ...current,
        [field]: value,
        day: nextMonthLength > 0 && currentDay > nextMonthLength
          ? String(nextMonthLength)
          : current.day,
      }
    })
  }

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
        onCityResultsDismiss?.()
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
          <label htmlFor="checkout-birth-year" className="block text-xs text-text-muted mb-1">
            {consultationBirthSafetyEnabled ? <>出生年 <span className="text-red-400">*</span></> : '出生年'}
          </label>
          <input
            id="checkout-birth-year"
            type="number" min={accessibleValidationEnabled ? 1900 : 1920} max={accessibleValidationEnabled ? checkoutYear : 2030}
            required={accessibleValidationEnabled || undefined}
            value={form.year} onChange={(e) => updateGregorianDatePart('year', e.target.value)}
            aria-invalid={accessibleValidationEnabled ? showYearError : undefined}
            aria-describedby={showYearError ? 'checkout-birth-year-error' : undefined}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
          />
          {showYearError && <p id="checkout-birth-year-error" className="checkout-form-error mt-1 text-xs">請填寫有效的出生年份。</p>}
        </div>
        <div>
          <label htmlFor="checkout-birth-month" className="block text-xs text-text-muted mb-1">
            {consultationBirthSafetyEnabled
              ? <>{form.calendarType === 'lunar' ? '農曆月' : '月'} <span className="text-red-400">*</span></>
              : form.calendarType === 'lunar' ? '農曆月' : '月'}
          </label>
          <select id="checkout-birth-month" value={form.month} required={consultationBirthSafetyEnabled || undefined} onChange={(e) => updateGregorianDatePart('month', e.target.value)}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {consultationBirthSafetyEnabled && <option value="" disabled>月份</option>}
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
          <label htmlFor="checkout-birth-day" className="block text-xs text-text-muted mb-1">
            {consultationBirthSafetyEnabled
              ? <>{form.calendarType === 'lunar' ? '農曆日' : '日'} <span className="text-red-400">*</span></>
              : form.calendarType === 'lunar' ? '農曆日' : '日'}
          </label>
          <select id="checkout-birth-day" value={form.day} required={consultationBirthSafetyEnabled || undefined} onChange={(e) => setForm(f => ({ ...f, day: e.target.value }))}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {consultationBirthSafetyEnabled && <option value="" disabled>日期</option>}
            {Array.from({ length: dayOptionCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {form.calendarType === 'lunar'
                  ? ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'][i]
                  : `${i + 1}日`}
              </option>
            ))}
          </select>
        </div>
      </div>
      {futureBirthDate && validationAttempted && (
        <p id="checkout-birth-date-error" className="checkout-form-error -mt-2 text-xs" role="alert">
          出生日期不能晚於今天（以香港日期 {checkoutAsOfDate} 為準）。
        </p>
      )}

      {/* 出生時間 */}
      <BirthTimeField
        timeMode={timeMode}
        setTimeMode={setTimeMode}
        hour={form.hour}
        minute={form.minute}
        onChange={(field, val) => setForm(f => ({ ...f, [field]: val }))}
        consultationWording={consultationBirthSafetyEnabled}
      />
      {consultationBirthSafetyEnabled && localTimeValidity.status !== 'unique' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3" role="alert">
          <p className="text-sm font-semibold text-amber-300">
            {timeMode === 'unknown'
              ? '這個出生日期在當地時制中不存在'
              : localTimeValidity.status === 'ambiguous'
              ? '夏令時間切換：同一個時間出現兩次'
              : localTimeValidity.status === 'nonexistent'
                ? '夏令時間切換：這一分鐘在當地時鐘不存在'
                : '出生時間尚未能安全對應'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {timeMode === 'unknown'
              ? '部分地區曾因更換時區而跳過整個日期；請重新核對出生日期與城市。'
              : consultationLocalTimeIssueMessage(localTimeValidity.status)}
          </p>
        </div>
      )}

      {/* 性別 */}
      <fieldset>
        <legend className="block text-xs text-text-muted mb-1">性別 <span className="text-red-400">*</span></legend>
        <div className="flex gap-6">
          {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
            <label key={v} className="checkout-choice flex items-center gap-2 cursor-pointer">
              <input id={`checkout-gender-${v}`} type="radio" name="gender" value={v} required={consultationBirthSafetyEnabled || undefined} checked={form.gender === v}
                onChange={(e) => setForm(f => ({ ...f, gender: e.target.value }))} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
        {showGenderError && <p className="checkout-form-error mt-1 text-xs">請選擇性別，以核對排盤規則。</p>}
      </fieldset>

      {consultationBirthSafetyEnabled ? (
        isMinor ? (
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4" aria-labelledby="minor-report-boundary-heading" role="status">
            <h3 id="minor-report-boundary-heading" className="text-sm font-semibold text-amber-300">目前暫不接受未成年人委託</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              未成年人需要獨立的年齡分層章節、監護人閱讀方式與內容安全審核。這套流程完成驗收前，系統不會讓此筆委託進入付款，也不會收集監護人資料。
            </p>
          </section>
        ) : (
          <fieldset>
            <legend className="block text-xs text-text-muted mb-1">目前關係狀態（用於調整關係章節） <span className="text-red-400">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: 'single' as const, l: '單身' },
                { v: 'partnered' as const, l: '穩定交往或有伴侶' },
                { v: 'married' as const, l: '已婚' },
                { v: 'separated' as const, l: '分居' },
                { v: 'divorced' as const, l: '離婚' },
                { v: 'widowed' as const, l: '喪偶' },
                { v: 'not_applicable' as const, l: '不適用' },
                { v: 'prefer_not_to_say' as const, l: '不願回答' },
              ].map(({ v, l }) => (
                <label key={v} className="checkout-choice flex items-center gap-2 cursor-pointer rounded-lg border border-gold/10 px-3 py-2.5">
                  <input id={`checkout-relationship-${v}`} type="radio" name="marital_status" value={v} required checked={form.marital_status === v}
                    onChange={() => setForm(f => ({ ...f, marital_status: v }))} className="accent-gold" />
                  <span className="text-sm text-text">{l}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-text-muted/70 mt-2">只用來調整關係章節的稱呼與情境；不會據此推定您應該結婚、分手或進入任何關係。</p>
            {showRelationshipError && <p className="checkout-form-error mt-1 text-xs">請選擇一項；也可以選「不願回答」。</p>}
          </fieldset>
        )
      ) : (
        /* Legacy plans retain their existing two-state field and copy. */
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
      )}

      {/* 出生地區 */}
      <div className="relative">
        <label htmlFor="checkout-birth-city" className="block text-xs text-text-muted mb-1">出生地區 <span className="text-red-400">*</span></label>
        {needCityForCountry && (
          <p className="text-xs text-gold/80 mb-1">
            {consultationBirthSafetyEnabled
              ? `已選擇「${needCityForCountry}」，請再選擇實際出生城市；不能只用國家代表座標。`
              : `已選擇「${needCityForCountry}」（多時區），請輸入城市名`}
          </p>
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
          placeholder={needCityForCountry
            ? `輸入${needCityForCountry}的實際出生城市`
            : consultationBirthSafetyEnabled
              ? '輸入實際出生城市或先選國家'
              : '輸入地區名（如：台灣、香港、日本）'}
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
                  {consultationBirthSafetyEnabled
                    ? '選擇後再填實際城市'
                    : r.isMultiTz
                      ? '多時區，請選擇城市'
                      : `UTC${r.country.tz >= 0 ? '+' : ''}${r.country.tz}`}
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
        {(consultationBirthSafetyEnabled ? form.birthLocationPrecision === 'city' : form.cityLat !== 0) && (() => {
          // 依出生日期動態計算當時的實際時區偏移（含 DST）
          const year = parseInt(form.year) || 2000
          const month = parseInt(form.month) || 1
          const day = parseInt(form.day) || 1
          let dstHint = ''
          let effectiveTz = form.cityTz
          if (consultationBirthSafetyEnabled && form.timezone && localTimeValidity.status === 'unique') {
            const resolvedOffset = consultationTimezoneOffsetHoursAtEpoch(
              form.timezone,
              localTimeValidity.candidateEpochMs[0],
            )
            if (resolvedOffset !== null) {
              effectiveTz = resolvedOffset
              if (effectiveTz !== form.cityTz) {
                dstHint = `（出生當時實際為 UTC${effectiveTz >= 0 ? '+' : ''}${effectiveTz}）`
              }
            }
          } else if (form.timezone) {
            try {
              const birthAt = new Date(year, month - 1, day, 12, 0, 0)
              effectiveTz = displayTzOffset(form.timezone, birthAt)
              const dst = isDstAt(form.timezone, birthAt)
              if (dst && effectiveTz !== form.cityTz) {
                dstHint = `（出生時為夏令時 UTC${effectiveTz >= 0 ? '+' : ''}${effectiveTz}）`
              }
            } catch {}
          }
          const technicalSettings = `經度 ${form.cityLng.toFixed(2)}°｜UTC${effectiveTz >= 0 ? '+' : ''}${effectiveTz}${dstHint}${form.timezone ? `｜${form.timezone}` : ''}`
          return consultationBirthSafetyEnabled ? (
            <div className="mt-2 rounded-lg border border-green-600/20 bg-green-700/[0.06] px-3 py-2">
              <p className="text-xs text-green-300">已套用出生地時區與夏令時間校正。</p>
              <details className="mt-1 text-[11px] text-text-muted/70">
                <summary className="cursor-pointer text-gold/80">查看計算設定</summary>
                <p className="mt-1 break-words">{technicalSettings}｜真太陽時校正</p>
              </details>
            </div>
          ) : (
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
