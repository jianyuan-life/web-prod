'use client'

import { useState } from 'react'
import { searchLocations, searchCities, type LocationSearchResult, type City, type Country } from '@/lib/cities'
import { SHICHEN } from '@/components/checkout/types'
import { internalPost, internalPatch, RateLimitError } from '@/lib/api'  // T10b v5.10.375(timeout + 429 + REST verb)
import type { SavedFamilyMember } from './FamilyMembersManager'

interface FamilyMemberModalProps {
  authToken: string
  member: SavedFamilyMember | null  // null = 新增模式
  onClose: () => void
  onSaved: () => void
}

export default function FamilyMemberModal({ authToken, member, onClose, onSaved }: FamilyMemberModalProps) {
  const isEdit = !!member
  const [name, setName] = useState(member?.name || '')
  const [gender, setGender] = useState(member?.gender || 'M')
  const [year, setYear] = useState(String(member?.year || 1990))
  const [month, setMonth] = useState(String(member?.month || 1))
  const [day, setDay] = useState(String(member?.day || 1))
  const [hour, setHour] = useState(String(member?.hour ?? 12))
  const [minute, setMinute] = useState(String(member?.minute ?? 0))
  const [timeMode, setTimeMode] = useState<'unknown' | 'shichen' | 'exact'>(
    (member?.time_mode as 'unknown' | 'shichen' | 'exact') || 'shichen'
  )
  const [calendarType, setCalendarType] = useState<'solar' | 'lunar'>(
    (member?.calendar_type as 'solar' | 'lunar') || 'solar'
  )
  const [lunarLeap, setLunarLeap] = useState(member?.lunar_leap || false)
  const [birthCity, setBirthCity] = useState(member?.birth_city || '')
  const [cityLat, setCityLat] = useState(member?.city_lat || 0)
  const [cityLng, setCityLng] = useState(member?.city_lng || 0)
  const [cityTz, setCityTz] = useState(member?.city_tz ?? 8)

  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCitySearch = (val: string) => {
    setBirthCity(val)
    setCityLat(0)
    setCityLng(0)
    if (val.length >= 1) {
      if (needCityForCountry) {
        // 多時區國家已選定，只搜城市
        const cities = searchCities(val)
        setCityResults(cities.map(c => ({ type: 'city' as const, city: c })))
      } else {
        setCityResults(searchLocations(val))
      }
    } else {
      setCityResults([])
    }
  }

  const handleCitySelect = (c: City) => {
    setBirthCity(`${c.name}（${c.country}）`)
    setCityLat(c.lat)
    setCityLng(c.lng)
    setCityTz(c.tz)
    setCityResults([])
    setNeedCityForCountry('')
  }

  const handleCountrySelect = (country: Country, isMultiTz: boolean) => {
    if (isMultiTz) {
      setNeedCityForCountry(country.name)
      setBirthCity('')
      setCityResults([])
    } else {
      setBirthCity(country.name)
      setCityLat(country.lat)
      setCityLng(country.lng)
      setCityTz(country.tz)
      setCityResults([])
    }
  }

  const isValid = name.trim() && cityLat !== 0

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError('')

    const payload = {
      name, gender, year, month, day, hour, minute,
      time_mode: timeMode,
      calendar_type: calendarType,
      lunar_leap: lunarLeap,
      birth_city: birthCity,
      city_lat: cityLat,
      city_lng: cityLng,
      city_tz: cityTz,
    }

    try {
      // T10b v5.10.375 — internalPatch / internalPost 統一處理(timeout + 429 + ApiError)
      if (isEdit) {
        await internalPatch(`/api/family-members/${member.id}`, payload, { authToken })
      } else {
        await internalPost('/api/family-members', payload, { authToken })
      }
      onSaved()
    } catch (e) {
      if (e instanceof RateLimitError) {
        setError(`儲存過於頻繁、請等 ${e.retryAfter} 秒後重試`)
      } else {
        setError(e instanceof Error ? e.message : '網路錯誤、請稍後再試')
      }
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg glass rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-cream">{isEdit ? '編輯家人' : '新增家人'}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          {/* 姓名 */}
          <div>
            <label className="block text-xs text-text-muted mb-1">姓名 *</label>
            <input
              type="text" placeholder="請輸入姓名"
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
            />
          </div>

          {/* 性別 */}
          <div>
            <label className="block text-xs text-text-muted mb-1">性別</label>
            <div className="flex gap-6">
              {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="fm-gender" value={v} checked={gender === v}
                    onChange={(e) => setGender(e.target.value)} className="accent-gold" />
                  <span className="text-sm text-text">{l}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 曆法 */}
          <div>
            <label className="block text-xs text-text-muted mb-1">曆法</label>
            <div className="flex rounded-lg overflow-hidden border border-gold/20">
              {([{ v: 'solar' as const, l: '國曆（西曆）' }, { v: 'lunar' as const, l: '農曆' }]).map(({ v, l }) => (
                <button key={v} type="button"
                  onClick={() => { setCalendarType(v); setLunarLeap(false) }}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${calendarType === v ? 'bg-gold/20 text-gold' : 'bg-white/5 text-text-muted hover:bg-white/5'}`}>
                  {l}
                </button>
              ))}
            </div>
            {calendarType === 'lunar' && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={lunarLeap} onChange={(e) => setLunarLeap(e.target.checked)} className="accent-gold" />
                <span className="text-xs text-text-muted">閏月</span>
              </label>
            )}
          </div>

          {/* 年月日 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">出生年</label>
              <input type="number" min="1920" max="2030" value={year} onChange={(e) => setYear(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{calendarType === 'lunar' ? '農曆月' : '月'}</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1} className="bg-[#1a1a2e]">
                    {calendarType === 'lunar'
                      ? ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'][i] + '月'
                      : `${i + 1}月`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{calendarType === 'lunar' ? '農曆日' : '日'}</label>
              <select value={day} onChange={(e) => setDay(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                {Array.from({ length: calendarType === 'lunar' ? 30 : 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1} className="bg-[#1a1a2e]">
                    {calendarType === 'lunar'
                      ? ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'][i]
                      : `${i + 1}日`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 出生時間 */}
          <div>
            <label className="block text-xs text-text-muted mb-1">出生時間</label>
            <div className="flex rounded-lg overflow-hidden border border-gold/20 mb-2">
              {([
                { v: 'shichen' as const, l: '時辰' },
                { v: 'exact' as const, l: '精確時間' },
                { v: 'unknown' as const, l: '不確定' },
              ]).map(({ v, l }) => (
                <button key={v} type="button"
                  onClick={() => setTimeMode(v)}
                  className={`flex-1 py-2 text-xs font-medium transition-all ${timeMode === v ? 'bg-gold/20 text-gold' : 'bg-white/5 text-text-muted'}`}>
                  {l}
                </button>
              ))}
            </div>
            {timeMode === 'shichen' && (
              <select value={hour} onChange={(e) => setHour(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                {SHICHEN.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#1a1a2e]">{s.label}</option>
                ))}
              </select>
            )}
            {timeMode === 'exact' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <select value={hour} onChange={(e) => setHour(e.target.value)}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} className="bg-[#1a1a2e]">{String(i).padStart(2, '0')}時</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select value={minute} onChange={(e) => setMinute(e.target.value)}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i} className="bg-[#1a1a2e]">{String(i).padStart(2, '0')}分</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
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
              value={birthCity}
              onChange={(e) => handleCitySearch(e.target.value)}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
            />
            {cityResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-dark border border-gold/20 rounded-lg overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                {cityResults.map((r, idx) => r.type === 'country' ? (
                  <button key={`country-${r.country.name}`} type="button"
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center"
                    onClick={() => handleCountrySelect(r.country, r.isMultiTz)}
                  >
                    <span>{r.country.name}</span>
                    <span className="text-[10px] text-text-muted/60">
                      {r.isMultiTz ? '多時區，請選擇城市' : `UTC${r.country.tz >= 0 ? '+' : ''}${r.country.tz}`}
                    </span>
                  </button>
                ) : (
                  <button key={`city-${r.city.name_en}-${idx}`} type="button"
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between items-center"
                    onClick={() => handleCitySelect(r.city)}
                  >
                    <span>{r.city.name}（{r.city.country}）</span>
                    <span className="text-[10px] text-text-muted/60">UTC{r.city.tz >= 0 ? '+' : ''}{r.city.tz}</span>
                  </button>
                ))}
              </div>
            )}
            {needCityForCountry && (
              <button type="button" onClick={() => { setNeedCityForCountry(''); setBirthCity('') }}
                className="text-xs text-gold/60 hover:text-gold mt-1 underline">取消，重新選擇國家</button>
            )}
            {cityLat !== 0 && (
              <p className="text-[10px] text-text-muted/50 mt-1">
                經度 {cityLng.toFixed(2)} | 時區 UTC{cityTz >= 0 ? '+' : ''}{cityTz}
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm text-text-muted hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            type="button" onClick={handleSave}
            disabled={saving || !isValid}
            className="flex-1 py-2.5 bg-gold text-dark font-semibold rounded-xl text-sm btn-glow disabled:opacity-50"
          >
            {saving ? '儲存中...' : isEdit ? '更新' : '新增'}
          </button>
        </div>
      </div>
    </div>
  )
}
