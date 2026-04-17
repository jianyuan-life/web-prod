'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import { searchCities, searchLocations, type City, type LocationSearchResult, type Country } from '@/lib/cities'
import {
  PLANS, D_TOPICS, TIME_BLOCKS,
  newMember, type FamilyMember,
  newFamilyEmail, type FamilyEmailEntry,
  type G15SelectedReport, type G15SearchResult,
} from '@/components/checkout/types'

export function useCheckoutForm() {
  const params = useSearchParams()
  const planCode = params.get('plan') || 'C'
  const plan = PLANS[planCode] || PLANS.C

  // 確認彈窗
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const [form, setForm] = useState({
    name: params.get('name') || '',
    year: params.get('year') || '1990',
    month: params.get('month') || '1',
    day: params.get('day') || '1',
    hour: params.get('hour') || '12',
    minute: params.get('minute') || '0',
    gender: params.get('gender') || 'M',
    address: '', addressLat: 0, addressLng: 0,
    birthCity: '', cityLat: 0, cityLng: 0, cityTz: 8,
    // Sprint 3 國際化：IANA 時區 + ISO 國家碼
    timezone: '', countryCode: '',
    calendarType: (params.get('calendarType') || 'solar') as 'solar' | 'lunar',
    lunarLeap: false,
  })
  const [timeMode, setTimeMode] = useState<'unknown' | 'shichen' | 'exact'>(
    (params.get('timeMode') as 'unknown' | 'shichen' | 'exact') || 'shichen'
  )
  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 優惠碼
  const [couponInput, setCouponInput] = useState('')
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountAmount: number; message: string } | null>(null)
  // 積分折抵
  const [pointsDiscount, setPointsDiscount] = useState(0)
  const [pointsUsed, setPointsUsed] = useState(0)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  // 備注
  const [customerNote, setCustomerNote] = useState('')

  // 方案 D
  const [dTopic, setDTopic] = useState(D_TOPICS[0])
  const [dOtherDesc, setDOtherDesc] = useState('')

  // 方案 R
  const [rMembers, setRMembers] = useState<FamilyMember[]>([newMember(), newMember()])
  const [rRelationDesc, setRRelationDesc] = useState('')

  // 方案 G15（導入已完成的人生藍圖報告）
  const [g15Selected, setG15Selected] = useState<G15SelectedReport[]>([])
  const [g15MyReports, setG15MyReports] = useState<G15SearchResult[]>([])
  const [g15SearchQuery, setG15SearchQuery] = useState('')
  const [g15SearchResults, setG15SearchResults] = useState<G15SearchResult[]>([])
  const [g15SearchLoading, setG15SearchLoading] = useState(false)
  const [g15MyLoading, setG15MyLoading] = useState(false)

  // 舊版保留（相容）
  const [g15Emails, setG15Emails] = useState<FamilyEmailEntry[]>([newFamilyEmail(), newFamilyEmail()])
  const [g15VerifyLoading, setG15VerifyLoading] = useState(false)

  // 方案 G15（舊版保留兼容）
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([newMember(), newMember()])

  // 方案 E1
  const [e1StartDate, setE1StartDate] = useState('')
  const [e1EndDate, setE1EndDate] = useState('')
  const [e1EventType, setE1EventType] = useState('')
  const [e1HasExactTime, setE1HasExactTime] = useState<'yes' | 'no'>('no')

  // E1/E2 十二時辰：子丑寅卯辰巳午未申酉戌亥，預設全不勾（讓客戶自己選）
  const [eSelectedBlocks, setESelectedBlocks] = useState<boolean[]>([
    false, false, false, false, false, false, false, false, false, false, false, false
  ])

  // Auth
  const [authChecked, setAuthChecked] = useState(false)
  const [authEmail, setAuthEmail] = useState('')

  // 計算金額
  const extraMemberCount = Math.max(0, familyMembers.length - 2)
  const extraPrice = 0
  const rExtraCount = Math.max(0, rMembers.length - 2)
  const totalPrice = planCode === 'R'
    ? plan.price + rExtraCount * 19
    : plan.price
  const priceAfterCoupon = couponApplied ? Math.max(0, totalPrice - couponApplied.discountAmount) : totalPrice
  const finalPrice = Math.max(0, priceAfterCoupon - pointsDiscount)

  const isFamilyPlan = false  // G3 已移除
  const isG15Plan = planCode === 'G15'
  const isRelationPlan = planCode === 'R'

  // 表單驗證：判斷所有必填欄位是否完成
  const isFormValid = (() => {
    if (planCode === 'G15') {
      return g15Selected.length >= 2
    }
    if (planCode === 'R') {
      const allMembersValid = rMembers.every(m => m.name.trim() !== '' && (m.birthCity || '').trim() !== '' && (m.cityLat || 0) !== 0)
      return allMembersValid && rRelationDesc.trim() !== ''
    }
    // 單人表單驗證
    if (!form.name.trim()) return false
    const yr = parseInt(form.year)
    if (yr < 1900 || yr > new Date().getFullYear()) return false
    if (!form.gender) return false
    // 出生地區必填：必須選了國家/城市（cityLat !== 0 或 birthCity 非空且不是搜尋中）
    if (!form.birthCity || form.cityLat === 0) return false
    // E1 必填（結束日期選填，不填則預設開始日期+1個月）
    if (planCode === 'E1' && !e1StartDate) return false
    // E1 事件類型必填
    if (planCode === 'E1' && !e1EventType) return false
    // E1/E2 時段
    if ((planCode === 'E1' || planCode === 'E2') && !eSelectedBlocks.some(b => b)) return false
    // D 方案問事（其他）必填描述
    if (planCode === 'D' && dTopic === '問事（其他）' && !dOtherDesc.trim()) return false
    return true
  })()

  // 優惠碼驗證
  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true)
    setCouponError('')
    setCouponApplied(null)
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(couponInput)}&plan=${planCode}&amount=${totalPrice}`)
      const data = await res.json()
      if (data.valid) {
        setCouponApplied({ code: couponInput.trim().toUpperCase(), discountAmount: data.discountAmount, message: data.message })
      } else {
        setCouponError(data.message || '優惠碼無效')
      }
    } catch {
      setCouponError('驗證失敗，請稍後再試')
    } finally {
      setCouponLoading(false)
    }
  }

  // 國家/城市搜尋
  const handleCitySearch = (val: string) => {
    setForm(f => ({ ...f, birthCity: val, cityLat: 0, cityLng: 0 }))
    if (needCityForCountry) {
      // 多時區國家模式：搜尋城市
      const cities = searchCities(val).filter(c => c.country === needCityForCountry || c.name.includes(val) || c.name_en.toLowerCase().includes(val.toLowerCase()))
      setCityResults(cities.map(c => ({ type: 'city' as const, city: c })))
    } else {
      setCityResults(val.length >= 1 ? searchLocations(val) : [])
    }
  }

  const selectCity = (c: City) => {
    setForm(f => ({
      ...f,
      birthCity: `${c.name}（${c.country}）`,
      cityLat: c.lat, cityLng: c.lng, cityTz: c.tz,
      // Sprint 3：帶 IANA 時區（tzName）與國家碼
      timezone: c.tzName || f.timezone,
      countryCode: c.countryCode || f.countryCode,
    }))
    setCityResults([])
    setNeedCityForCountry('')
  }

  const selectCountry = (country: Country, isMultiTz: boolean) => {
    if (isMultiTz) {
      setNeedCityForCountry(country.name)
      setForm(f => ({ ...f, birthCity: '', timezone: '', countryCode: '' }))
      setCityResults([])
    } else {
      // 單時區國家：用 countryTzMap 推測 IANA（台灣=Asia/Taipei 等）
      const ianaByCountry: Record<string, string> = {
        '台灣': 'Asia/Taipei',
        '香港': 'Asia/Hong_Kong',
        '中國': 'Asia/Shanghai',
        '新加坡': 'Asia/Singapore',
        '馬來西亞': 'Asia/Kuala_Lumpur',
        '日本': 'Asia/Tokyo',
        '韓國': 'Asia/Seoul',
        '泰國': 'Asia/Bangkok',
        '越南': 'Asia/Ho_Chi_Minh',
        '菲律賓': 'Asia/Manila',
        '英國': 'Europe/London',
        '法國': 'Europe/Paris',
        '德國': 'Europe/Berlin',
        '印度': 'Asia/Kolkata',
        '紐西蘭': 'Pacific/Auckland',
        '澳門': 'Asia/Macau',
        '阿聯酋': 'Asia/Dubai',
      }
      const isoByCountry: Record<string, string> = {
        '台灣': 'TW', '香港': 'HK', '中國': 'CN', '新加坡': 'SG', '馬來西亞': 'MY',
        '日本': 'JP', '韓國': 'KR', '泰國': 'TH', '越南': 'VN', '菲律賓': 'PH',
        '英國': 'GB', '法國': 'FR', '德國': 'DE', '印度': 'IN', '紐西蘭': 'NZ',
        '澳門': 'MO', '阿聯酋': 'AE',
      }
      setForm(f => ({
        ...f,
        birthCity: country.name, cityLat: country.lat, cityLng: country.lng, cityTz: country.tz,
        timezone: ianaByCountry[country.name] || f.timezone,
        countryCode: isoByCountry[country.name] || f.countryCode,
      }))
      setCityResults([])
      setNeedCityForCountry('')
    }
  }

  const cancelCountrySelection = () => {
    setNeedCityForCountry('')
    setForm(f => ({ ...f, birthCity: '' }))
    setCityResults([])
  }

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        sessionStorage.setItem('pending_plan', planCode)
        window.location.href = '/auth/login'
      } else {
        const fullName = data.user.user_metadata?.full_name || ''
        if (fullName && !params.get('name')) setForm(f => ({ ...f, name: fullName }))
        // 快取 email，供 dashboard 在 Stripe 重導向後使用
        if (data.user.email) {
          setAuthEmail(data.user.email)
          try {
            sessionStorage.setItem('jianyuan_email', data.user.email)
            localStorage.setItem('jianyuan_email', data.user.email)
          } catch {}
          // G15：自動載入該用戶的已完成人生藍圖報告
          if (planCode === 'G15') {
            loadMyReports()
          }
        }
        setAuthChecked(true)
      }
    })
  }, [planCode])

  // 家庭成員操作
  const updateFamilyMember = (index: number, updated: FamilyMember) => {
    setFamilyMembers(prev => prev.map((m, i) => i === index ? updated : m))
  }
  const addFamilyMember = () => {
    if (familyMembers.length < 8) setFamilyMembers(prev => [...prev, newMember()])
  }
  const removeFamilyMember = (index: number) => {
    if (index >= 2) setFamilyMembers(prev => prev.filter((_, i) => i !== index))
  }

  // G15 導入模式：自動載入當前用戶的已完成人生藍圖
  const loadMyReports = async () => {
    setG15MyLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      // 不帶 email 參數，API 會自動用登入 email 查詢
      const res = await fetch('/api/checkout/search-reports', { headers })
      const data = await res.json()
      if (res.ok && data.reports) {
        setG15MyReports(data.reports)
      }
    } catch { /* 靜默失敗 */ }
    finally { setG15MyLoading(false) }
  }

  // G15 搜尋其他人的報告（用姓名）
  const searchG15Reports = async (query: string) => {
    if (!query.trim()) {
      setG15SearchResults([])
      return
    }
    setG15SearchLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const res = await fetch(`/api/checkout/search-reports?q=${encodeURIComponent(query.trim())}`, { headers })
      const data = await res.json()
      if (res.ok && data.reports) {
        // 過濾掉已選取的報告
        const selectedIds = new Set(g15Selected.map(s => s.reportId))
        setG15SearchResults(data.reports.filter((r: G15SearchResult) => !selectedIds.has(r.id)))
      }
    } catch { /* 靜默失敗 */ }
    finally { setG15SearchLoading(false) }
  }

  // G15 選取報告
  const addG15Report = (report: G15SearchResult) => {
    if (g15Selected.length >= 8) return
    if (g15Selected.some(s => s.reportId === report.id)) return
    setG15Selected(prev => [...prev, {
      reportId: report.id,
      name: report.name,
      createdAt: report.createdAt,
    }])
    // 從搜尋結果移除已選的
    setG15SearchResults(prev => prev.filter(r => r.id !== report.id))
  }

  // G15 移除已選報告
  const removeG15Report = (reportId: string) => {
    setG15Selected(prev => prev.filter(s => s.reportId !== reportId))
  }

  // G15 舊版 email 操作（保留相容）
  const updateG15Email = (index: number, email: string) => {
    setG15Emails(prev => prev.map((e, i) => i === index ? { ...e, email, verified: false, name: undefined, errorMsg: undefined } : e))
  }
  const addG15Email = () => {
    if (g15Emails.length < 8) setG15Emails(prev => [...prev, newFamilyEmail()])
  }
  const removeG15Email = (index: number) => {
    if (index >= 2) setG15Emails(prev => prev.filter((_, i) => i !== index))
  }
  const verifyG15Emails = async (): Promise<boolean> => { return true }

  // R 方案成員操作
  const updateRMember = (index: number, updated: FamilyMember) => {
    setRMembers(prev => prev.map((m, i) => i === index ? updated : m))
  }
  const addRMember = () => {
    if (rMembers.length < 6) setRMembers(prev => [...prev, newMember()])
  }
  const removeRMember = (index: number) => {
    if (index >= 2) setRMembers(prev => prev.filter((_, i) => i !== index))
  }

  // 提交前先顯示確認彈窗
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()

    if (planCode === 'G15') {
      if (g15Selected.length < 2) {
        alert('請至少選擇 2 位家庭成員的人生藍圖報告')
        return
      }
      // G15 不需要出生資料確認（選的是已完成報告），直接提交
      await confirmCheckout()
      return
    } else if (planCode !== 'R') {
      // R 方案用 rMembers，不用 form，所以跳過 form 驗證
      if (!form.name.trim()) { alert('請輸入姓名'); return }
      const yr = parseInt(form.year)
      if (yr < 1900 || yr > new Date().getFullYear()) { alert('出生年份範圍需在 1900 至今年之間'); return }
      // 出生地區必填
      if (!form.birthCity || form.cityLat === 0) { alert('請選擇出生地區'); return }
    }

    if (planCode === 'R') {
      for (let i = 0; i < rMembers.length; i++) {
        if (!rMembers[i].name.trim()) {
          alert(`請輸入${i === 0 ? '您' : `第 ${i + 1} 位當事人`}的姓名`)
          return
        }
        if (!(rMembers[i].birthCity || '').trim()) {
          alert(`請輸入${i === 0 ? '您' : `第 ${i + 1} 位當事人`}的出生地區`)
          return
        }
      }
      if (!rRelationDesc.trim()) { alert('請描述你們的關係與想了解的問題'); return }
      // R 方案用 rMembers 不用 form，直接提交（跟 G15 同邏輯）
      await confirmCheckout()
      return
    }

    if (planCode === 'E1') {
      if (!e1EventType) { alert('請選擇事件類型'); return }
      if (!e1StartDate) { alert('請選擇事件開始日期'); return }
    }

    if (planCode === 'E1' || planCode === 'E2') {
      if (!eSelectedBlocks.some(b => b)) {
        alert('請至少勾選一個可配合的出行時段')
        return
      }
    }

    // 顯示確認彈窗
    setShowConfirmModal(true)
  }

  // 確認後真正提交
  const confirmCheckout = async () => {
    setShowConfirmModal(false)
    setLoading(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let birthData: Record<string, any> = {}

      if (planCode === 'G15') {
        // G15：傳送已選取的報告 ID，後端直接讀取報告資料
        birthData = {
          plan_type: 'family_reports',
          report_ids: g15Selected.map(s => s.reportId),
          member_names: g15Selected.map(s => s.name),
        }
      } else {
        birthData = {
          name: form.name,
          year: parseInt(form.year),
          month: parseInt(form.month),
          day: parseInt(form.day),
          hour: timeMode === 'unknown' ? 12 : parseInt(form.hour),
          minute: timeMode === 'exact' ? parseInt(form.minute) : 0,
          gender: form.gender,
          address: form.address,
          address_lat: form.addressLat || undefined,
          address_lng: form.addressLng || undefined,
          time_unknown: timeMode === 'unknown',
          time_mode: timeMode,
          latitude: form.cityLat || undefined,
          longitude: form.cityLng || undefined,
          timezone_offset: form.cityTz,
          // Sprint 3 國際化：傳 IANA 時區 + 國家碼給後端（Python BirthInput 用來算 DST）
          timezone: form.timezone || undefined,
          birth_country: form.countryCode || undefined,
          birth_city: form.birthCity || undefined,
          calendar_type: form.calendarType,
          lunar_leap: form.calendarType === 'lunar' ? form.lunarLeap : undefined,
        }

        if (planCode === 'D') {
          birthData.analysis_topic = dTopic
          if (dTopic === '問事（其他）') birthData.other_question = dOtherDesc
        }

        if (planCode === 'R') {
          birthData = {
            plan: 'R',
            members: rMembers.map((m, i) => ({
              name: m.name,
              year: parseInt(m.year),
              month: parseInt(m.month),
              day: parseInt(m.day),
              hour: m.timeMode === 'unknown' ? 12 : parseInt(m.hour),
              minute: m.timeMode === 'exact' ? parseInt(m.minute) : 0,
              gender: m.gender,
              time_unknown: m.timeMode === 'unknown',
              time_mode: m.timeMode,
              role: i === 0 ? 'self' : 'other',
              birth_city: m.birthCity || undefined,
              city_lat: m.cityLat || undefined,
              city_lng: m.cityLng || undefined,
              latitude: m.cityLat || undefined,
              longitude: m.cityLng || undefined,
              timezone_offset: m.cityTz ?? 8,
              // Sprint 3 國際化
              timezone: m.timezone || undefined,
              birth_country: m.countryCode || undefined,
              calendar_type: m.calendarType || 'solar',
              lunar_leap: m.calendarType === 'lunar' ? m.lunarLeap : undefined,
            })),
            relation_description: rRelationDesc,
          }
        }

        if (planCode === 'E1') {
          birthData.event_start_date = e1StartDate
          // 結束日期選填：不填則預設開始日期 + 1 個月
          if (e1EndDate) {
            birthData.event_end_date = e1EndDate
          } else {
            const defaultEnd = new Date(new Date(e1StartDate).getTime() + 30 * 24 * 60 * 60 * 1000)
            birthData.event_end_date = defaultEnd.toISOString().split('T')[0]
          }
          // E1 新增：事件類型 + 有無明確時間（結構化欄位，不依賴 customer_note）
          birthData.event_type = e1EventType
          birthData.has_exact_time = e1HasExactTime === 'yes'
        }

        if (planCode === 'E1' || planCode === 'E2') {
          birthData.available_time_slots = TIME_BLOCKS
            .filter((_, i) => eSelectedBlocks[i])
            .map(b => ({ start: b.start, end: b.end }))
        }

        if (customerNote.trim()) birthData.customer_note = customerNote.trim()
      }

      const userLocale = (typeof window !== 'undefined' && localStorage.getItem('locale')) || 'zh-TW'

      // 取得 Supabase access token，傳給後端驗證用戶身份（Supabase 用 localStorage 不是 cookie）
      let authToken = ''
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) authToken = session.access_token
      } catch { /* 靜默失敗，後端會用 fallback */ }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planCode,
          totalPrice: ['G15', 'R'].includes(planCode) ? totalPrice : undefined,
          birthData,
          locale: userLocale,
          couponCode: couponApplied?.code || undefined,
          couponDiscount: couponApplied?.discountAmount || undefined,
          pointsToUse: pointsUsed > 0 ? pointsUsed : undefined,
          userEmail: authEmail || sessionStorage.getItem('jianyuan_email') || undefined,
        }),
      })
      const data = await res.json()
      if (data.url && data.url.startsWith('http')) {
        gtag.event('begin_checkout', {
          currency: 'USD',
          value: finalPrice,
          plan_code: planCode,
          plan_name: plan.name,
        })
        // Meta Pixel: InitiateCheckout
        fbpixel.trackEvent('InitiateCheckout', {
          currency: 'USD',
          value: finalPrice,
          content_name: plan.name,
        })
        window.location.href = data.url
      } else {
        setError(data.error || '付款建立失敗，請稍後再試')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '網路錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return {
    // 基本資訊
    planCode, plan, isFamilyPlan, isRelationPlan, isG15Plan,
    // 表單
    form, setForm, timeMode, setTimeMode,
    cityResults, handleCitySearch, selectCity, selectCountry, cancelCountrySelection, needCityForCountry,
    loading, error,
    // 優惠碼
    couponInput, setCouponInput, couponApplied, setCouponApplied,
    couponLoading, couponError, setCouponError, applyCoupon,
    // 積分折抵
    pointsUsed, pointsDiscount,
    handlePointsChange: (pts: number, discount: number) => { setPointsUsed(pts); setPointsDiscount(discount) },
    // 備注
    customerNote, setCustomerNote,
    // D 方案
    dTopic, setDTopic, dOtherDesc, setDOtherDesc,
    // R 方案
    rMembers, updateRMember, addRMember, removeRMember, rRelationDesc, setRRelationDesc,
    // G15 方案（導入模式）
    g15Selected, g15MyReports, g15MyLoading,
    g15SearchQuery, setG15SearchQuery, g15SearchResults, g15SearchLoading,
    searchG15Reports, addG15Report, removeG15Report,
    // G15 舊版 email（保留相容）
    g15Emails, updateG15Email, addG15Email, removeG15Email, g15VerifyLoading,
    // 家庭成員（保留供 UI 相容）
    familyMembers, updateFamilyMember, addFamilyMember, removeFamilyMember,
    // E1 方案
    e1StartDate, setE1StartDate, e1EndDate, setE1EndDate,
    e1EventType, setE1EventType, e1HasExactTime, setE1HasExactTime,
    // E1/E2 時段
    eSelectedBlocks, setESelectedBlocks,
    // 金額
    extraMemberCount, extraPrice, rExtraCount, totalPrice, finalPrice,
    // Auth
    authChecked,
    // 驗證
    isFormValid,
    // 確認彈窗
    showConfirmModal, setShowConfirmModal,
    // 提交
    handleCheckout, confirmCheckout,
  }
}
