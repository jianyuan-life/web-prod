'use client'

import { useState } from 'react'
import BirthTimeField from './BirthTimeField'
import CustomerNote from './CustomerNote'
import FamilyMemberPicker from './FamilyMemberPicker'
import { type FamilyMember } from './types'
import type { SavedFamilyMember } from '@/components/FamilyMembersManager'
import { searchLocations, searchCities, type LocationSearchResult, type City, type Country } from '@/lib/cities'

interface RMemberFormProps {
  rMembers: FamilyMember[]
  updateRMember: (index: number, updated: FamilyMember) => void
  addRMember: () => void
  removeRMember: (index: number) => void
  rRelationDesc: string
  setRRelationDesc: (v: string) => void
  customerNote: string
  setCustomerNote: (v: string) => void
  loading: boolean
  error: string
  finalPrice: number
  isFormValid: boolean
  onSubmit: (e: React.FormEvent) => void
}

// 每個成員的地理搜尋狀態
function useMemberCitySearch() {
  const [results, setResults] = useState<LocationSearchResult[]>([])
  const [needCityFor, setNeedCityFor] = useState('')

  const handleSearch = (val: string, currentNeedCity: string) => {
    if (currentNeedCity) {
      const cities = searchCities(val).filter(c => c.country === currentNeedCity || c.name.includes(val) || c.name_en.toLowerCase().includes(val.toLowerCase()))
      setResults(cities.map(c => ({ type: 'city' as const, city: c })))
    } else {
      setResults(val.length >= 1 ? searchLocations(val) : [])
    }
  }

  return { results, setResults, needCityFor, setNeedCityFor, handleSearch }
}

function MemberCityField({ member, index, updateMember }: {
  member: FamilyMember, index: number,
  updateMember: (updated: FamilyMember) => void
}) {
  const { results, setResults, needCityFor, setNeedCityFor, handleSearch } = useMemberCitySearch()

  const onInputChange = (val: string) => {
    updateMember({ ...member, birthCity: val, cityLat: 0, cityLng: 0 })
    handleSearch(val, needCityFor)
  }

  const selectCity = (c: City) => {
    updateMember({ ...member, birthCity: `${c.name}（${c.country}）`, cityLat: c.lat, cityLng: c.lng, cityTz: c.tz })
    setResults([])
    setNeedCityFor('')
  }

  const selectCountry = (country: Country, isMultiTz: boolean) => {
    if (isMultiTz) {
      setNeedCityFor(country.name)
      updateMember({ ...member, birthCity: '' })
      setResults([])
    } else {
      updateMember({ ...member, birthCity: country.name, cityLat: country.lat, cityLng: country.lng, cityTz: country.tz })
      setResults([])
      setNeedCityFor('')
    }
  }

  return (
    <div className="relative">
      <label className="block text-xs text-text-muted mb-1">出生地區 <span className="text-red-400">*</span></label>
      {needCityFor && (
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs text-gold">{needCityFor} — 請輸入城市名</span>
          <button type="button" onClick={() => { setNeedCityFor(''); updateMember({ ...member, birthCity: '' }); setResults([]) }}
            className="text-[10px] text-red-400 hover:text-red-300">取消</button>
        </div>
      )}
      <input type="text"
        placeholder={needCityFor ? `輸入${needCityFor}的城市名...` : '輸入地區名（如：台灣、香港、日本）'}
        value={member.birthCity || ''}
        onChange={(e) => onInputChange(e.target.value)}
        className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream text-sm focus:border-gold/40 focus:outline-none placeholder:text-text-muted/40"
      />
      {member.birthCity && (member.cityLat || 0) !== 0 && (
        <p className="text-[10px] text-green-400/70 mt-1">&#10003; 已定位</p>
      )}
      {member.birthCity && !member.birthCity.trim() && (
        <p className="text-[10px] text-red-400/70 mt-1">請輸入出生地區</p>
      )}
      {/* 搜尋結果下拉 */}
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-dark-card border border-gold/20 rounded-lg shadow-lg">
          {results.map((item, i) => (
            item.type === 'city' && item.city ? (
              <button key={`city-${i}`} type="button"
                onClick={() => selectCity(item.city!)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gold/10 transition-colors">
                {item.city.name}（{item.city.country}）
                <span className="text-text-muted/40 text-xs ml-1">UTC{item.city.tz >= 0 ? '+' : ''}{item.city.tz}</span>
              </button>
            ) : item.type === 'country' && item.country ? (
              <button key={`country-${i}`} type="button"
                onClick={() => selectCountry(item.country!, item.isMultiTz || false)}
                className="w-full text-left px-3 py-2 text-sm text-gold hover:bg-gold/10 transition-colors">
                {item.country.name}
                {item.isMultiTz && <span className="text-text-muted/40 text-xs ml-1">（多時區，請選城市）</span>}
              </button>
            ) : null
          ))}
        </div>
      )}
    </div>
  )
}

export default function RMemberForm({
  rMembers, updateRMember, addRMember, removeRMember,
  rRelationDesc, setRRelationDesc,
  customerNote, setCustomerNote,
  loading, error, finalPrice, isFormValid, onSubmit,
}: RMemberFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-4">
        {rMembers.map((member, index) => {
          const label = index === 0 ? '我' : index === 1 ? '對方' : `第 ${index + 1} 位當事人`
          return (
            <div key={index} className="border border-gold/20 rounded-xl p-4 space-y-3 bg-white/3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gold">{label}</span>
                {index >= 2 && (
                  <button type="button" onClick={() => removeRMember(index)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded px-2 py-0.5">
                    移除
                  </button>
                )}
              </div>
              {/* 從家人選擇 */}
              <FamilyMemberPicker onSelect={(saved: SavedFamilyMember) => {
                const hourVal = saved.time_mode === 'exact' ? String(saved.hour) : String(Math.floor(saved.hour / 2) * 2)
                updateRMember(index, {
                  ...member,
                  name: saved.name,
                  gender: saved.gender,
                  year: String(saved.year),
                  month: String(saved.month),
                  day: String(saved.day),
                  hour: hourVal,
                  minute: saved.time_mode === 'exact' ? String(saved.minute) : '0',
                  timeMode: saved.time_mode as 'unknown' | 'shichen' | 'exact',
                  birthCity: saved.birth_city || '',
                  cityLat: saved.city_lat || 0,
                  cityLng: saved.city_lng || 0,
                  cityTz: saved.city_tz ?? 8,
                  calendarType: (saved.calendar_type as 'solar' | 'lunar') || 'solar',
                  lunarLeap: saved.lunar_leap || false,
                })
              }} />
              <div>
                <label className="block text-xs text-text-muted mb-1">姓名 *</label>
                <input type="text" required placeholder={`請輸入${label}的姓名`}
                  value={member.name}
                  onChange={(e) => updateRMember(index, { ...member, name: e.target.value })}
                  className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none text-sm"
                />
              </div>
              {/* 曆法選擇 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">曆法</label>
                <div className="flex gap-4">
                  {[{ v: 'solar', l: '國曆' }, { v: 'lunar', l: '農曆' }].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={`r-cal-${index}`} value={v}
                        checked={(member.calendarType || 'solar') === v}
                        onChange={() => updateRMember(index, { ...member, calendarType: v as 'solar' | 'lunar' })}
                        className="accent-gold" />
                      <span className="text-sm text-text">{l}</span>
                    </label>
                  ))}
                  {member.calendarType === 'lunar' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={member.lunarLeap || false}
                        onChange={(e) => updateRMember(index, { ...member, lunarLeap: e.target.checked })}
                        className="accent-gold" />
                      <span className="text-sm text-text">閏月</span>
                    </label>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">出生年</label>
                  <input type="number" min="1920" max="2030"
                    value={member.year}
                    onChange={(e) => updateRMember(index, { ...member, year: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">月</label>
                  <select value={member.month} onChange={(e) => updateRMember(index, { ...member, month: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">日</label>
                  <select value={member.day} onChange={(e) => updateRMember(index, { ...member, day: e.target.value })}
                    className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
                    {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">性別 *</label>
                <div className="flex gap-6">
                  {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={`r-gender-${index}`} value={v} checked={member.gender === v}
                        onChange={() => updateRMember(index, { ...member, gender: v })} className="accent-gold" />
                      <span className="text-sm text-text">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* v5.10.5 R 各成員獨立婚姻狀況(感情/夫妻互動段個性化)*/}
              <div>
                <label className="block text-xs text-text-muted mb-1">婚姻狀況 *</label>
                <div className="flex gap-6">
                  {[{ v: 'unmarried' as const, l: '未婚' }, { v: 'married' as const, l: '已婚' }].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={`r-marital-${index}`} value={v} checked={(member.marital_status || 'unmarried') === v}
                        onChange={() => updateRMember(index, { ...member, marital_status: v })} className="accent-gold" />
                      <span className="text-sm text-text">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <BirthTimeField
                timeMode={member.timeMode}
                setTimeMode={(m) => updateRMember(index, { ...member, timeMode: m })}
                hour={member.hour}
                minute={member.minute}
                onChange={(field, val) => updateRMember(index, { ...member, [field]: val })}
              />
              {/* 出生地區（含地理編碼搜尋） */}
              <MemberCityField
                member={member}
                index={index}
                updateMember={(updated) => updateRMember(index, updated)}
              />
            </div>
          )
        })}
      </div>

      {rMembers.length < 6 && (
        <button type="button" onClick={addRMember}
          className="w-full py-3 border border-gold/30 rounded-xl text-gold text-sm hover:bg-gold/10 transition-all">
          + 加入第 {rMembers.length + 1} 位當事人
          <span className="text-text-muted ml-2">(+$19)</span>
        </button>
      )}

      {/* 關係說明 */}
      <div className="border-t border-gold/10 pt-4">
        <label className="block text-xs text-text-muted mb-1">關係說明 *（最多 200 字）</label>
        <textarea
          required
          maxLength={200}
          rows={3}
          placeholder="請描述你們的關係（如：戀人、夫妻、合作夥伴），以及想了解的問題..."
          value={rRelationDesc}
          onChange={(e) => setRRelationDesc(e.target.value)}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none"
        />
        <p className="text-[10px] text-text-muted/50 text-right mt-1">{rRelationDesc.length}/200</p>
      </div>

      <CustomerNote customerNote={customerNote} setCustomerNote={setCustomerNote} />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="submit" disabled={loading || !isFormValid}
        className={`w-full py-3.5 font-bold rounded-xl text-lg mt-4 transition-all ${
          isFormValid
            ? 'bg-gold text-dark btn-glow disabled:opacity-50'
            : 'bg-white/10 text-text-muted cursor-not-allowed'
        }`}
      >
        {loading ? '跳轉付款中...' : !isFormValid ? '請填寫完整資料' : finalPrice === 0 ? '免費領取報告' : `確認付款 — $${finalPrice}`}
      </button>
      {/* v5.4.21 P0 修(Gemini UI audit):trust badges 強化(R 雙人方案) */}
      <div className="flex flex-wrap justify-center gap-3 text-[10px] text-text-muted/70">
        <span>&#128274; Stripe 加密支付</span>
        <span>&#128737;&#65039; SSL 256-bit</span>
        <span>&#128230; PDF 永久保存</span>
        <span>&#127919; 失敗自動重試 + 24 小時人工補單</span>
      </div>
      <p className="text-xs text-text-muted/60 text-center">
        付款由 Stripe 安全處理、報告平均需 30 分鐘以上、出門訣需 40 分鐘以上
      </p>
    </form>
  )
}
