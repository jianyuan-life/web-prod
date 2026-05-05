'use client'

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
}

export default function BirthDataFields({
  form, setForm, timeMode, setTimeMode,
  cityResults, onCitySearch, onCitySelect,
  onCountrySelect, onCancelCountry, needCityForCountry,
}: BirthDataFieldsProps) {
  return (
    <>
      {/* 姓名 */}
      <div>
        <label className="block text-xs text-text-muted mb-1">姓名 *</label>
        <input
          type="text" required placeholder="請輸入您的全名"
          value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
        />
      </div>

      {/* 國曆/農曆切換 */}
      <div>
        <label className="block text-xs text-text-muted mb-1">曆法</label>
        <div className="flex rounded-lg overflow-hidden border border-gold/20">
          {([{ v: 'solar' as const, l: '國曆（西曆）' }, { v: 'lunar' as const, l: '農曆' }]).map(({ v, l }) => (
            <button key={v} type="button"
              onClick={() => setForm(f => ({ ...f, calendarType: v, lunarLeap: false }))}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${form.calendarType === v ? 'bg-gold/20 text-gold' : 'bg-white/5 text-text-muted hover:bg-white/5'}`}>
              {l}
            </button>
          ))}
        </div>
        {form.calendarType === 'lunar' && (
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={form.lunarLeap}
              onChange={(e) => setForm(f => ({ ...f, lunarLeap: e.target.checked }))}
              className="accent-gold" />
            <span className="text-xs text-text-muted">閏月</span>
          </label>
        )}
      </div>

      {/* 年月日 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">出生年</label>
          <input
            type="number" min="1920" max="2030"
            value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">{form.calendarType === 'lunar' ? '農曆月' : '月'}</label>
          <select value={form.month} onChange={(e) => setForm(f => ({ ...f, month: e.target.value }))}
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
          <label className="block text-xs text-text-muted mb-1">{form.calendarType === 'lunar' ? '農曆日' : '日'}</label>
          <select value={form.day} onChange={(e) => setForm(f => ({ ...f, day: e.target.value }))}
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
      <div>
        <label className="block text-xs text-text-muted mb-1">性別</label>
        <div className="flex gap-6">
          {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="gender" value={v} checked={form.gender === v}
                onChange={(e) => setForm(f => ({ ...f, gender: e.target.value }))} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
      </div>

      {/* v5.10.5 婚姻狀況(C/D/G15/R 感情段個性化、避免對已婚客戶寫「該找對象」誤導)*/}
      <div>
        <label className="block text-xs text-text-muted mb-1">婚姻狀況 <span className="text-red-400">*</span></label>
        <div className="flex gap-6">
          {[{ v: 'unmarried' as const, l: '未婚' }, { v: 'married' as const, l: '已婚' }].map(({ v, l }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="marital_status" value={v} checked={form.marital_status === v}
                onChange={() => setForm(f => ({ ...f, marital_status: v }))} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-text-muted/60 mt-1">影響感情/家庭運勢段的詮釋方向(已婚聚焦婚姻品質、未婚聚焦擇偶與桃花)</p>
      </div>

      {/* 出生地區 */}
      <div className="relative">
        <label className="block text-xs text-text-muted mb-1">出生地區 <span className="text-red-400">*</span></label>
        {needCityForCountry && (
          <p className="text-xs text-gold/80 mb-1">已選擇「{needCityForCountry}」（多時區），請輸入城市名</p>
        )}
        <input
          type="text"
          placeholder={needCityForCountry ? `輸入${needCityForCountry}的城市名` : '輸入地區名（如：台灣、香港、日本）'}
          value={form.birthCity}
          onChange={(e) => onCitySearch(e.target.value)}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
        />
        {cityResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-dark border border-gold/20 rounded-lg overflow-hidden shadow-xl max-h-48 overflow-y-auto">
            {cityResults.map((r, idx) => r.type === 'country' ? (
              <button key={`country-${r.country.name}`} type="button"
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center"
                onClick={() => onCountrySelect?.(r.country, r.isMultiTz)}
              >
                <span>{r.country.name}</span>
                <span className="text-[10px] text-text-muted/60">
                  {r.isMultiTz ? '多時區，請選擇城市' : `UTC${r.country.tz >= 0 ? '+' : ''}${r.country.tz}`}
                </span>
              </button>
            ) : (
              <button key={`city-${r.city.name_en}-${idx}`} type="button"
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center"
                onClick={() => onCitySelect(r.city)}
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
