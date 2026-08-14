'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { internalGet, internalPost, RateLimitError } from '@/lib/api'  // T10b v5.10.372(429 友好顯示 + timeout)
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import { searchCities, searchLocations, type City, type LocationSearchResult, type Country } from '@/lib/cities'
import {
  PLANS, D_TOPICS, TIME_BLOCKS,
  newMember, type FamilyMember,
  type G15SelectedReport,
} from '@/components/checkout/types'
import type {
  ConsultationCheckoutFormState as CheckoutFormState,
  ConsultationG15SearchResult as G15SearchResult,
  G15ConsentDisplayStatus,
  G15ConsentMemberState,
} from '@/components/consultation/checkout-types'
import { isVisiblePlan } from '@/lib/plan-names'
import { getG15CheckoutBlockers } from '@/lib/checkout/g15-readiness'
import { CONSULTATION_AUTH_TIMEOUT_MS, withClientTimeout } from '@/lib/checkout/client-timeout'
import {
  currentLocalCalendarDate,
  getConsultationAge,
  getSinglePersonDefaults,
  isConsultationBirthDateInFuture,
} from '@/lib/checkout/consultation-input-contract'
import { validateGregorianDate } from '@/lib/consultation/gregorian-date'
import {
  classifyConsultationLocalTime,
  consultationLocalTimeIssueMessage,
  consultationTimezoneOffsetHoursAtEpoch,
  resolveConsultationUnknownTime,
} from '@/lib/consultation/local-time-validity'

export function useCheckoutForm() {
  const params = useSearchParams()
  const rawPlanCode = params.get('plan') || 'C'
  // v5.10.467:隱藏/未知方案不接受新購 → 導回定價頁
  // (原本靜默 fallback 到 C,客戶以為在買 E1 實際會下 C 的單;現改為明確導離)
  const planIsPurchasable = isVisiblePlan(rawPlanCode) && !!PLANS[rawPlanCode]
  const planCode = planIsPurchasable ? rawPlanCode : 'C'
  const plan = PLANS[planCode]
  const consultationCheckout = planCode === 'C' || planCode === 'G15'

  useEffect(() => {
    if (!planIsPurchasable && typeof window !== 'undefined') {
      window.location.replace('/pricing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planIsPurchasable])

  // 確認彈窗
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // v5.10.471:農曆暫停支援(P0 防雷:排盤 API 會把農曆當國曆算,詳 CALC_INPUT_AUDIT.md)。
  // URL 帶 calendarType=lunar 時(免費工具 paywall 轉入),不沿用其農曆日期、退回預設,
  // 由客戶重填國曆;強制 calendarType='solar'。API 端補轉換後移除此防護並恢復切換 UI。
  const _urlIsLunar = params.get('calendarType') === 'lunar'
  const singlePersonDefaults = getSinglePersonDefaults(planCode, (name) => params.get(name), _urlIsLunar)
  const [form, setForm] = useState<CheckoutFormState>({
    name: params.get('name') || '',
    year: singlePersonDefaults.year,
    month: singlePersonDefaults.month,
    day: singlePersonDefaults.day,
    hour: singlePersonDefaults.hour,
    minute: singlePersonDefaults.minute,
    gender: singlePersonDefaults.gender,
    marital_status: singlePersonDefaults.maritalStatus,
    guardian_name: '', guardian_relationship: '', guardian_consent: false,
    address: '', addressLat: 0, addressLng: 0,
    birthCity: '', cityLat: 0, cityLng: 0, cityTz: 8, birthLocationPrecision: '',
    // Sprint 3 國際化：IANA 時區 + ISO 國家碼
    timezone: '', countryCode: '',
    calendarType: 'solar' as 'solar' | 'lunar',  // v5.10.471 強制 solar(農曆暫停支援、見上方註解)
    lunarLeap: false,
  })
  const [timeMode, setTimeMode] = useState<'unknown' | 'shichen' | 'exact'>(
    singlePersonDefaults.timeMode
  )
  const [cityResults, setCityResults] = useState<LocationSearchResult[]>([])
  const [needCityForCountry, setNeedCityForCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 優惠碼
  const [couponInput, setCouponInputState] = useState('')
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountAmount: number; message: string } | null>(null)
  // 積分折抵
  const [pointsDiscount, setPointsDiscount] = useState(0)
  const [pointsUsed, setPointsUsed] = useState(0)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const couponRequestId = useRef(0)
  const couponRequestInFlight = useRef(false)
  const checkoutRequestRef = useRef<{ payload: string; key: string } | null>(null)

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
  const [g15SearchQuery, setG15SearchQueryState] = useState('')
  const [g15SearchResults, setG15SearchResults] = useState<G15SearchResult[]>([])
  const [g15SearchLoading, setG15SearchLoading] = useState(false)
  const [g15SearchAttempted, setG15SearchAttempted] = useState(false)
  const g15SearchRequestId = useRef(0)
  const [g15ConsentEmails, setG15ConsentEmails] = useState<Record<string, string>>({})
  const [g15ConsentAccessInputs, setG15ConsentAccessInputs] = useState<string[]>(['', ''])
  const [g15ConsentStatuses, setG15ConsentStatuses] = useState<Record<string, G15ConsentDisplayStatus>>({})
  const [g15ConsentSelectionId, setG15ConsentSelectionId] = useState('')
  const [g15ConsentExpiresAt, setG15ConsentExpiresAt] = useState('')
  const [g15ConsentStatusMessage, setG15ConsentStatusMessage] = useState('')
  const [g15ConsentLoading, setG15ConsentLoading] = useState(false)
  const [g15ConsentError, setG15ConsentError] = useState('')
  const g15ConsentRequestRef = useRef<{ payload: string; key: string } | null>(null)
  const g15ConsentOperationId = useRef(0)
  const [g15MyLoading, setG15MyLoading] = useState(false)
  const [g15RelationshipContext, setG15RelationshipContext] = useState('')
  const [g15ConsultationGoals, setG15ConsultationGoals] = useState('')
  const [g15LoadError, setG15LoadError] = useState('')
  const [g15SearchError, setG15SearchError] = useState('')

  // 方案 G15（舊版保留兼容）
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([newMember(), newMember()])

  // 方案 E1（v5.3.93：砍 e1StartDate,開始日期系統自動設 T+1）
  const [e1EndDate, setE1EndDate] = useState('')
  const [e1EventType, setE1EventType] = useState('')
  const [e1HasExactTime, setE1HasExactTime] = useState<'yes' | 'no'>('no')
  // v5.3.22：E1 升級，「有固定時間」時填入精確時辰（HH:MM）
  const [e1EventExactTime, setE1EventExactTime] = useState('')

  // E1/E3 十二時辰候選池：子丑寅卯辰巳午未申酉戌亥（E2/E4 不用、引擎自動算）
  const [eSelectedBlocks, setESelectedBlocks] = useState<boolean[]>([
    false, false, false, false, false, false, false, false, false, false, false, false
  ])

  // 方案 E3 月度精選：8 主題選擇（最多 3 個、按點選順序即 TOP 1/2/3）
  // code 對應 types.ts 的 E3_TOPICS、順序即為客戶的優先序
  const [e3SelectedTopics, setE3SelectedTopics] = useState<string[]>([])

  // Auth
  const [authChecked, setAuthChecked] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authError, setAuthError] = useState('')
  const [authRetryKey, setAuthRetryKey] = useState(0)

  // Phase 5 v5.10.382 — Turnstile bot 防護(老闆灌 NEXT_PUBLIC_TURNSTILE_SITE_KEY 後 widget 自動顯示、verify 後設 token)
  const [turnstileToken, setTurnstileToken] = useState('')

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
  const consultationAsOfDate = currentLocalCalendarDate()
  const cAge = planCode === 'C'
    ? getConsultationAge(form.year, form.month, form.day, consultationAsOfDate)
    : null
  const cBirthDateInFuture = planCode === 'C'
    && validateGregorianDate(form.year, form.month, form.day).valid
    && isConsultationBirthDateInFuture(form.year, form.month, form.day, consultationAsOfDate)
  const cIsMinor = cAge !== null && cAge < 18
  const cLocalTimeValidity = useMemo(() => {
    const date = validateGregorianDate(form.year, form.month, form.day)
    if (planCode !== 'C' || !date.valid || !form.timezone) {
      return { status: 'unique' as const, candidateEpochMs: [] }
    }
    if (timeMode === 'unknown') {
      return resolveConsultationUnknownTime({
        year: Number(form.year),
        month: Number(form.month),
        day: Number(form.day),
        timezone: form.timezone,
      })
    }
    return classifyConsultationLocalTime({
      year: Number(form.year),
      month: Number(form.month),
      day: Number(form.day),
      hour: Number(form.hour),
      minute: timeMode === 'exact' ? Number(form.minute) : 0,
      timezone: form.timezone,
    })
  }, [form.day, form.hour, form.minute, form.month, form.timezone, form.year, planCode, timeMode])
  const cEffectiveTimezoneOffset = planCode === 'C' && cLocalTimeValidity.status === 'unique'
    ? consultationTimezoneOffsetHoursAtEpoch(form.timezone, cLocalTimeValidity.candidateEpochMs[0])
    : null
  const g15ConsentMembers: G15ConsentMemberState[] = g15Selected.length > 0
    ? g15Selected.map((member) => ({
        reportId: member.reportId,
        name: member.name,
        email: '由系統使用擁有者帳號的 canonical Email',
        status: g15ConsentStatuses[member.reportId] || 'not_invited',
      }))
    : g15ConsentAccessInputs.map((_, index) => ({
        reportId: `slot:${index + 1}`,
        name: `成員 ${index + 1}`,
        email: '未回傳報告內容',
        status: g15ConsentStatuses[`slot:${index + 1}`] || 'not_invited',
      }))
  const g15AllMembersAccepted = Boolean(g15ConsentSelectionId)
    && g15Selected.length >= 2
    && g15Selected.every((member) => g15ConsentStatuses[member.reportId] === 'accepted')
  const g15CheckoutBlockers = getG15CheckoutBlockers({
    selectedCount: g15Selected.length,
    relationshipContext: g15RelationshipContext,
    consultationGoals: g15ConsultationGoals,
    allMembersAccepted: g15AllMembersAccepted,
  })

  // 表單驗證：判斷所有必填欄位是否完成
  const isFormValid = (() => {
    if (planCode === 'G15') {
      return g15CheckoutBlockers.length === 0
    }
    if (planCode === 'R') {
      const allMembersValid = rMembers.every(m => m.name.trim() !== '' && (m.birthCity || '').trim() !== '' && (m.cityLat || 0) !== 0)
      return allMembersValid && rRelationDesc.trim() !== ''
    }
    if (planCode === 'C') {
      if (!form.name.trim()) return false
      if (!validateGregorianDate(form.year, form.month, form.day).valid) return false
      if (cBirthDateInFuture) return false
      if (cIsMinor) return false
      if (!form.gender || !form.marital_status) return false
      if (!form.birthCity || !form.timezone || !form.countryCode) return false
      if (form.birthLocationPrecision !== 'city') return false
      if (cLocalTimeValidity.status !== 'unique') return false
      if (cEffectiveTimezoneOffset === null) return false
      return true
    }
    // 單人表單驗證
    if (!form.name.trim()) return false
    const yr = parseInt(form.year)
    if (yr < 1900 || yr > new Date().getFullYear()) return false
    if (!form.gender) return false
    // 出生地區必填：必須選了國家/城市（cityLat !== 0 或 birthCity 非空且不是搜尋中）
    if (!form.birthCity || form.cityLat === 0) return false
    // v5.3.91 E1 簡化：只需事件日期（e1EndDate）+ 事件類型、開始日期系統自動設 T+1
    if (planCode === 'E1' && !e1EndDate) return false
    if (planCode === 'E1' && !e1EventType) return false
    // v5.3.94：選「有固定時間」時、必填確切 HH:MM（前端 button 正確 disable）
    if (planCode === 'E1' && e1HasExactTime === 'yes' && !e1EventExactTime) return false
    // v5.3.59 規格書對齊：
    //   E1 候選時辰至少 1 個（挑 Top 3）
    //   E3 候選時辰至少 3 個（84 候選池、每週挑 Top 2）
    //   E2/E4 不需勾選（引擎自動算月盤/年盤）
    const selectedCount = eSelectedBlocks.filter(b => b).length
    if (planCode === 'E1' && selectedCount < 1) return false
    if (planCode === 'E3' && selectedCount < 3) return false
    // E3 必選 1-3 個主題
    if (planCode === 'E3' && (e3SelectedTopics.length < 1 || e3SelectedTopics.length > 3)) return false
    // D 方案問事（其他）必填描述
    if (planCode === 'D' && dTopic === '問事（其他）' && !dOtherDesc.trim()) return false
    return true
  })()

  const setCouponInput = (value: string) => {
    if (consultationCheckout) {
      couponRequestId.current += 1
      couponRequestInFlight.current = false
      setCouponLoading(false)
    }
    setCouponInputState(value)
  }

  // 優惠碼驗證
  const applyCoupon = async () => {
    const normalizedCode = couponInput.trim().toUpperCase()
    if (!normalizedCode) return
    if (consultationCheckout && (couponRequestInFlight.current || couponLoading)) return
    const requestId = consultationCheckout ? ++couponRequestId.current : 0
    if (consultationCheckout) couponRequestInFlight.current = true
    setCouponLoading(true)
    setCouponError('')
    setCouponApplied(null)
    try {
      // T10b v5.10.372 — internalGet 統一處理 429 RateLimitError + timeout(原 raw fetch 無 timeout、429 無友好顯示)
      const data = await internalGet(
        `/api/coupons/validate?code=${encodeURIComponent(consultationCheckout ? normalizedCode : couponInput)}&plan=${planCode}&amount=${totalPrice}`,
      ) as { valid: boolean; discountAmount?: number; message?: string }
      if (consultationCheckout && requestId !== couponRequestId.current) return
      if (data.valid) {
        setCouponApplied({ code: normalizedCode, discountAmount: data.discountAmount ?? 0, message: data.message ?? '' })
      } else {
        setCouponError(data.message || '優惠碼無效')
      }
    } catch (err) {
      if (consultationCheckout && requestId !== couponRequestId.current) return
      if (err instanceof RateLimitError) {
        setCouponError(`驗證過於頻繁、請等 ${err.retryAfter} 秒後重試`)
      } else {
        setCouponError('驗證失敗，請稍後再試')
      }
    } finally {
      if (!consultationCheckout || requestId === couponRequestId.current) {
        couponRequestInFlight.current = false
        setCouponLoading(false)
      }
    }
  }

  // 國家/城市搜尋
  const handleCitySearch = (val: string) => {
    setForm(f => ({
      ...f,
      birthCity: val,
      cityLat: 0,
      cityLng: 0,
      birthLocationPrecision: '',
    }))
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
      birthLocationPrecision: 'city',
      // Sprint 3：帶 IANA 時區（tzName）與國家碼
      timezone: c.tzName || f.timezone,
      countryCode: c.countryCode || f.countryCode,
    }))
    setCityResults([])
    setNeedCityForCountry('')
  }

  const selectCountry = (country: Country, isMultiTz: boolean) => {
    if (planCode === 'C') {
      // C 會做經度相關計算；國家代表點不是客戶的出生地。
      // 選國家只能縮小搜尋範圍，必須再選實際城市。
      setNeedCityForCountry(country.name)
      setForm(f => ({
        ...f,
        birthCity: '',
        cityLat: 0,
        cityLng: 0,
        timezone: '',
        countryCode: '',
        birthLocationPrecision: '',
      }))
      setCityResults([])
    } else if (isMultiTz) {
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
        birthLocationPrecision: '',
        timezone: ianaByCountry[country.name] || f.timezone,
        countryCode: isoByCountry[country.name] || f.countryCode,
      }))
      setCityResults([])
      setNeedCityForCountry('')
    }
  }

  const cancelCountrySelection = () => {
    setNeedCityForCountry('')
    setForm(f => ({
      ...f,
      birthCity: '',
      cityLat: 0,
      cityLng: 0,
      birthLocationPrecision: '',
    }))
    setCityResults([])
  }

  // Auth guard
  useEffect(() => {
    let active = true
    setAuthChecked(false)
    if (consultationCheckout) setAuthError('')

    const checkAuth = async () => {
      try {
        const authResult = consultationCheckout
          ? await withClientTimeout(
              supabase.auth.getUser(),
              CONSULTATION_AUTH_TIMEOUT_MS,
              '登入狀態確認逾時',
            )
          : await supabase.auth.getUser()
        const { data, error: authLookupError } = authResult
        if (authLookupError) throw authLookupError
        if (!active) return

        if (!data.user) {
          sessionStorage.setItem('pending_plan', planCode)
          // 帶 redirect 參數，登入後回到同樣的 checkout 頁
          const redirect = encodeURIComponent(`/checkout?plan=${planCode}`)
          window.location.href = `/auth/login?redirect=${redirect}`
          return
        }

        const fullName = data.user.user_metadata?.full_name || ''
        if (fullName && !params.get('name')) setForm(f => ({ ...f, name: fullName }))
        // 快取 email，供 dashboard 在 Stripe 重導向後使用
        if (data.user.email) {
          setAuthEmail(data.user.email)
          try {
            sessionStorage.setItem('jianyuan_email', data.user.email)
            localStorage.setItem('jianyuan_email', data.user.email)
          } catch {}
          // G15 使用成員自己的私人報告連結，不再把購買者帳號內報告當成多位獨立成員。
        }
        setAuthChecked(true)
      } catch {
        if (!active || !consultationCheckout) return
        setAuthError('目前無法確認登入狀態，請檢查網路後重新嘗試。')
      }
    }

    void checkAuth()
    return () => {
      active = false
    }
  }, [authRetryKey, planCode])

  const retryAuthCheck = () => setAuthRetryKey((value) => value + 1)

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

  // G15 導入模式:自動載入當前用戶的已完成人生藍圖
  const loadMyReports = async () => {
    setG15MyLoading(true)
    setG15LoadError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      // T10b v5.10.372 — internalGet 統一處理 429 + timeout
      const data = await internalGet('/api/checkout/search-reports', {
        authToken: session?.access_token,
      }) as { reports?: G15SearchResult[]; unavailableReports?: G15SearchResult[] }
      if (!Array.isArray(data.reports)) throw new Error('報告清單格式不完整')
      const unavailable = Array.isArray(data.unavailableReports) ? data.unavailableReports : []
      setG15MyReports([
        ...data.reports,
        ...unavailable.map((report) => ({ ...report, eligibilityReason: report.reason || undefined })),
      ])
    } catch (err) {
      setG15LoadError(err instanceof RateLimitError
        ? `載入過於頻繁，請等 ${err.retryAfter} 秒後重試。`
        : '目前無法載入您的人生藍圖報告，請重試；若持續發生，請聯絡客服。')
    }
    finally { setG15MyLoading(false) }
  }

  const dismissCityResults = () => setCityResults([])

  const setG15SearchQuery = (query: string) => {
    g15SearchRequestId.current += 1
    setG15SearchQueryState(query)
    setG15SearchResults([])
    setG15SearchError('')
    setG15SearchAttempted(false)
    setG15SearchLoading(false)
  }

  // G15 僅搜尋目前登入帳戶內的人生藍圖(用姓名篩選)
  const searchG15Reports = async (query: string) => {
    if (!query.trim()) {
      g15SearchRequestId.current += 1
      setG15SearchResults([])
      setG15SearchError('')
      setG15SearchAttempted(false)
      setG15SearchLoading(false)
      return
    }
    const requestId = ++g15SearchRequestId.current
    setG15SearchLoading(true)
    setG15SearchError('')
    setG15SearchAttempted(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      // T10b v5.10.372 — internalGet 統一處理
      const data = await internalGet(
        `/api/checkout/search-reports?q=${encodeURIComponent(query.trim())}`,
        { authToken: session?.access_token },
      ) as { reports?: G15SearchResult[]; unavailableReports?: G15SearchResult[] }
      if (!Array.isArray(data.reports)) throw new Error('搜尋結果格式不完整')
      if (requestId !== g15SearchRequestId.current) return
      // 過濾掉已選取的報告
      const selectedIds = new Set(g15Selected.map(s => s.reportId))
      const unavailable = Array.isArray(data.unavailableReports) ? data.unavailableReports : []
      setG15SearchResults([...data.reports, ...unavailable]
        .filter((report) => !selectedIds.has(report.id))
        .map((report) => ({ ...report, eligibilityReason: report.reason || undefined })))
    } catch (err) {
      if (requestId !== g15SearchRequestId.current) return
      setG15SearchResults([])
      setG15SearchError(err instanceof RateLimitError
        ? `搜尋過於頻繁，請等 ${err.retryAfter} 秒後重試。`
        : '搜尋暫時失敗，請稍後重試。')
    }
    finally {
      if (requestId === g15SearchRequestId.current) setG15SearchLoading(false)
    }
  }

  const clearG15ConsentAuthority = (message: string) => {
    g15ConsentOperationId.current += 1
    g15ConsentRequestRef.current = null
    setG15ConsentSelectionId('')
    setG15ConsentExpiresAt('')
    setG15ConsentStatuses({})
    setG15ConsentError('')
    setG15ConsentStatusMessage(message)
  }

  // G15 選取報告
  const addG15Report = (report: G15SearchResult) => {
    if (report.eligible === false) return
    if (g15Selected.length >= 8) return
    if (g15Selected.some(s => s.reportId === report.id)) return
    setG15Selected(prev => [...prev, {
      reportId: report.id,
      name: report.name,
      createdAt: report.createdAt,
    }])
    clearG15ConsentAuthority('成員已變更；請填寫每位成員的 Email 並重新寄出逐位同意邀請。')
    // 從搜尋結果移除已選的
    setG15SearchResults(prev => prev.filter(r => r.id !== report.id))
  }

  // G15 移除已選報告
  const removeG15Report = (reportId: string) => {
    setG15Selected(prev => prev.filter(s => s.reportId !== reportId))
    setG15ConsentEmails((current) => {
      const next = { ...current }
      delete next[reportId]
      return next
    })
    clearG15ConsentAuthority('成員已變更；請重新寄出逐位同意邀請。')
  }

  const updateG15ConsentEmail = (reportId: string, email: string) => {
    setG15ConsentEmails((current) => ({ ...current, [reportId]: email }))
    if (g15ConsentSelectionId || Object.keys(g15ConsentStatuses).length > 0) {
      clearG15ConsentAuthority('Email 已變更；請重新寄出逐位同意邀請。')
    } else {
      setG15ConsentError('')
    }
  }

  const updateG15ConsentAccessInput = (index: number, value: string) => {
    setG15ConsentAccessInputs((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? value : entry
    )))
    setG15Selected([])
    clearG15ConsentAuthority('家族邀請碼已變更；請重新寄出逐位同意邀請。')
  }

  const addG15ConsentAccessInput = () => {
    if (g15ConsentAccessInputs.length >= 8) return
    setG15ConsentAccessInputs((current) => [...current, ''])
    setG15Selected([])
    clearG15ConsentAuthority('成員已變更；請重新寄出逐位同意邀請。')
  }

  const removeG15ConsentAccessInput = (index: number) => {
    if (g15ConsentAccessInputs.length <= 2) return
    setG15ConsentAccessInputs((current) => current.filter((_, entryIndex) => entryIndex !== index))
    setG15Selected([])
    clearG15ConsentAuthority('成員已變更；請重新寄出逐位同意邀請。')
  }

  const applyG15ConsentStatus = (data: {
    selectionId?: unknown
    expiresAt?: unknown
    members?: unknown
  }): boolean => {
    const selectionId = typeof data.selectionId === 'string' ? data.selectionId.toLowerCase() : ''
    const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : ''
    const members = Array.isArray(data.members) ? data.members : []
    const expectedCount = g15ConsentAccessInputs.length
    const allowedStatuses = new Set<G15ConsentDisplayStatus>(['pending', 'accepted', 'revoked', 'expired'])
    const parsedMembers = members.map((member) => {
      if (!member || typeof member !== 'object') return null
      const record = member as Record<string, unknown>
      const reportId = typeof record.reportId === 'string' ? record.reportId.toLowerCase() : ''
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      const slot = Number(record.slot)
      const status = typeof record.status === 'string' ? record.status as G15ConsentDisplayStatus : 'not_invited'
      return allowedStatuses.has(status) && Number.isInteger(slot) && slot >= 1 && slot <= expectedCount
        ? { reportId, name, slot, status }
        : null
    })
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(selectionId)
      || !Number.isFinite(Date.parse(expiresAt))
      || parsedMembers.some((member) => member === null)
      || parsedMembers.length !== expectedCount
      || new Set(parsedMembers.map((member) => member?.slot)).size !== expectedCount
    ) {
      throw new Error('逐位同意狀態格式不完整')
    }
    const acceptedWithTrustedIdentity = parsedMembers.every((member) => (
      member?.status === 'accepted'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(member.reportId)
      && member.name.length > 0
    ))
    const statuses = Object.fromEntries(parsedMembers.map((member) => [
      acceptedWithTrustedIdentity ? member!.reportId : `slot:${member!.slot}`,
      member!.status,
    ]))
    if (acceptedWithTrustedIdentity) {
      setG15Selected(parsedMembers
        .sort((left, right) => left!.slot - right!.slot)
        .map((member) => ({ reportId: member!.reportId, name: member!.name, createdAt: '' })))
    } else {
      setG15Selected([])
    }
    setG15ConsentSelectionId(selectionId)
    setG15ConsentExpiresAt(expiresAt)
    setG15ConsentStatuses(statuses)

    const acceptedCount = Object.values(statuses).filter((status) => status === 'accepted').length
    const hasRevoked = Object.values(statuses).some((status) => status === 'revoked')
    const hasExpired = Object.values(statuses).some((status) => status === 'expired')
    const allAccepted = acceptedWithTrustedIdentity && acceptedCount === expectedCount && expectedCount >= 2
    setG15ConsentStatusMessage(
      allAccepted
        ? `所有 ${expectedCount} 位成年成員均已完成帳號綁定的獨立同意。`
        : hasRevoked
          ? '有成員已撤回同意；請尊重其決定，本次名單目前不能付款。'
          : hasExpired
            ? '逐位同意邀請已過期；請重新寄出邀請。'
            : `已有 ${acceptedCount} / ${expectedCount} 位同意；仍在等待其餘成員。`,
    )
    return allAccepted
  }

  const refreshG15ConsentStatus = useCallback(async (silent = false): Promise<boolean> => {
    if (!g15ConsentSelectionId) return false
    const operationId = ++g15ConsentOperationId.current
    if (!silent) setG15ConsentLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const data = await internalGet(
        `/api/g15-consents?selectionId=${encodeURIComponent(g15ConsentSelectionId)}`,
        { authToken: session?.access_token },
      ) as { selectionId?: unknown; expiresAt?: unknown; members?: unknown }
      if (operationId !== g15ConsentOperationId.current) return false
      const allAccepted = applyG15ConsentStatus(data)
      setG15ConsentError('')
      return allAccepted
    } catch (refreshError) {
      if (operationId === g15ConsentOperationId.current && !silent) {
        setG15ConsentError(refreshError instanceof RateLimitError
          ? `更新過於頻繁，請等 ${refreshError.retryAfter} 秒後再試。`
          : '目前無法更新逐位同意狀態，付款仍會由伺服器重新查驗。')
      }
      return false
    } finally {
      if (!silent && operationId === g15ConsentOperationId.current) setG15ConsentLoading(false)
    }
  // applyG15ConsentStatus uses the current selected report set intentionally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g15ConsentAccessInputs, g15ConsentSelectionId])

  const sendG15ConsentInvitations = async () => {
    if (g15ConsentAccessInputs.length < 2) {
      setG15ConsentError('請先提供至少 2 位成年成員的家族邀請碼。')
      return
    }
    const members = g15ConsentAccessInputs.map((reportLocator) => ({
      reportLocator: reportLocator.normalize('NFKC').trim(),
    }))
    if (members.some((member) => member.reportLocator.length < 24)) {
      setG15ConsentError('請為每位成年成員填寫完整的家族邀請碼。')
      return
    }
    if (new Set(members.map((member) => member.reportLocator)).size !== members.length) {
      setG15ConsentError('每位成年成員必須提供不同的家族邀請碼。')
      return
    }
    const payload = JSON.stringify(members)
    if (g15ConsentRequestRef.current?.payload !== payload) {
      g15ConsentRequestRef.current = { payload, key: globalThis.crypto.randomUUID().toLowerCase() }
    }
    const operationId = ++g15ConsentOperationId.current
    setG15ConsentLoading(true)
    setG15ConsentError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const data = await internalPost('/api/g15-consents', {
        requestKey: g15ConsentRequestRef.current.key,
        members,
      }, { authToken: session?.access_token }) as {
        selectionId?: unknown
        expiresAt?: unknown
        members?: Array<{ delivery?: unknown }>
      }
      if (operationId !== g15ConsentOperationId.current) return
      setG15Selected([])
      applyG15ConsentStatus(data)
      if (Array.isArray(data.members) && data.members.some((member) => member.delivery === 'failed')) {
        setG15ConsentError('部分邀請信未能送達報告擁有者的 canonical Email；請稍後重試。')
      }
    } catch (inviteError) {
      if (operationId === g15ConsentOperationId.current) {
        setG15ConsentError(inviteError instanceof RateLimitError
          ? `寄送過於頻繁，請等 ${inviteError.retryAfter} 秒後再試。`
          : inviteError instanceof Error ? inviteError.message : '目前無法寄出逐位同意邀請。')
      }
    } finally {
      if (operationId === g15ConsentOperationId.current) setG15ConsentLoading(false)
    }
  }

  useEffect(() => {
    if (planCode !== 'G15' || !g15ConsentSelectionId) return
    const intervalId = window.setInterval(() => {
      void refreshG15ConsentStatus(true)
    }, 12_000)
    return () => window.clearInterval(intervalId)
  }, [g15ConsentSelectionId, planCode, refreshG15ConsentStatus])

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
      if (g15CheckoutBlockers.length > 0) {
        setError(g15CheckoutBlockers[0])
        return
      }
      setError('')
      setShowConfirmModal(true)
      return
    } else if (planCode !== 'R') {
      // R 方案用 rMembers，不用 form，所以跳過 form 驗證
      if (!form.name.trim()) { alert('請輸入姓名'); return }
      const yr = parseInt(form.year)
      const validationYear = planCode === 'C'
        ? Number.parseInt(consultationAsOfDate.slice(0, 4), 10)
        : new Date().getFullYear()
      if (yr < 1900 || yr > validationYear) { alert('出生年份範圍需在 1900 至今年之間'); return }
      // 出生地區必填
      if (!form.birthCity || form.cityLat === 0) { alert('請選擇出生地區'); return }
      if (planCode === 'C' && !isFormValid) {
        setError(cIsMinor
          ? '未成年人專屬報告流程尚未完成驗收，目前無法進入付款。'
          : cBirthDateInFuture
            ? `出生日期不能晚於今天（以香港日期 ${consultationAsOfDate} 為準）。`
          : consultationLocalTimeIssueMessage(cLocalTimeValidity.status)
            || '請完整核對出生資料、關係狀態與出生地計算設定。')
        return
      }
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
      if (!e1EndDate) { alert('請選擇事件日期'); return }
      if (e1HasExactTime === 'yes' && !e1EventExactTime) { alert('您選了「有固定時間」、請填寫事件確切時間（HH:MM）'); return }
    }

    // v5.3.66 — E1/E3 才需勾候選時辰（E2/E4 極簡、引擎自動擇吉）
    if (planCode === 'E1' || planCode === 'E3') {
      const minSlots = planCode === 'E3' ? 3 : 1
      const selected = eSelectedBlocks.filter(b => b).length
      if (selected < minSlots) {
        alert(planCode === 'E3'
          ? '月度精選需勾選至少 3 個時辰（84 候選池）、才能挑每週 Top 2'
          : '請至少勾選一個可配合的出行時段')
        return
      }
    }

    // 顯示確認彈窗
    setShowConfirmModal(true)
  }

  // 確認後真正提交
  const confirmCheckout = async () => {
    if (planCode !== 'G15') setShowConfirmModal(false)
    if (planCode === 'G15') {
      if (!g15AllMembersAccepted || !g15ConsentSelectionId) {
        setError('請等待每位成年成員完成獨立同意後再付款')
        return
      }
      const stillAccepted = await refreshG15ConsentStatus()
      if (!stillAccepted) {
        setError('逐位同意狀態已變更或暫時無法查驗，尚未建立付款')
        return
      }
    }
    if (planCode === 'G15' && (g15RelationshipContext.trim().length < 8 || g15ConsultationGoals.trim().length < 8)) {
      setError('請完整填寫家庭關係與本次諮詢目標')
      return
    }
    setError('')
    setLoading(true)

    // Phase 5 v5.10.382 — Turnstile bot 防護:有 site key 時必驗(沒設則 stub mode 自動 pass)
    // 結帳是 P0 高價值 funnel、bot 防禦比 signup 更重要
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (turnstileSiteKey) {
      try {
        const verifyRes = await internalPost('/api/auth/turnstile-verify', { token: turnstileToken }) as { success?: boolean; errorCodes?: string[] }
        if (!verifyRes.success) {
          setError('人機驗證失敗、請重新嘗試')
          setLoading(false)
          return
        }
      } catch {
        setError('人機驗證系統異常、請稍後再試')
        setLoading(false)
        return
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let birthData: Record<string, any> = {}

      if (planCode === 'G15') {
        // G15：傳送已選取的報告 ID，後端直接讀取報告資料
        birthData = {
          plan_type: 'family_reports',
          report_ids: g15Selected.map(s => s.reportId),
          member_names: g15Selected.map(s => s.name),
          stated_relationships: [g15RelationshipContext.trim()],
          consultation_goals: [g15ConsultationGoals.trim()],
          consent_selection_id: g15ConsentSelectionId,
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
          // v5.10.5 婚姻狀況(C/D/G15/R 感情段個性化、不傳給 E1-E4 calculator)
          marital_status: form.marital_status,
          address: form.address,
          address_lat: form.addressLat || undefined,
          address_lng: form.addressLng || undefined,
          time_unknown: timeMode === 'unknown',
          time_mode: timeMode,
          latitude: planCode === 'C' ? form.cityLat : form.cityLat || undefined,
          longitude: planCode === 'C' ? form.cityLng : form.cityLng || undefined,
          timezone_offset: planCode === 'C' ? cEffectiveTimezoneOffset : form.cityTz,
          // Sprint 3 國際化：傳 IANA 時區 + 國家碼給後端（Python BirthInput 用來算 DST）
          timezone: form.timezone || undefined,
          birth_country: form.countryCode || undefined,
          birth_city: form.birthCity || undefined,
          birth_location_precision: planCode === 'C' ? form.birthLocationPrecision : undefined,
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
              // v5.10.5 R 各成員獨立婚姻狀況(感情/夫妻互動段個性化)
              marital_status: m.marital_status || 'unmarried',
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
          // v5.3.91：開始日期系統自動設 T+1（買了隔天就開始找吉時）、結束日期 = 客戶填的事件日期
          const tPlus1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          birthData.event_start_date = tPlus1
          birthData.event_end_date = e1EndDate
          // E1 結構化欄位：事件類型 + 有無明確時間（不依賴 customer_note）
          birthData.event_type = e1EventType
          birthData.has_exact_time = e1HasExactTime === 'yes'
          // v5.3.22：E1 升級，yes 時傳入事件精確時辰
          if (e1HasExactTime === 'yes' && e1EventExactTime) {
            birthData.event_exact_time = e1EventExactTime
          }
        }

        // v5.3.61：E1/E3 需傳候選時辰池（E2/E4 引擎自動算、不需傳）
        if (planCode === 'E1' || planCode === 'E3') {
          birthData.available_time_slots = TIME_BLOCKS
            .filter((_, i) => eSelectedBlocks[i])
            .map(b => ({ start: b.start, end: b.end }))
        }

        // v5.3.61：E3 必傳主題選擇（8 選 1-3、順序即 TOP 1/2/3）
        if (planCode === 'E3') {
          birthData.topics = e3SelectedTopics // 例：['career','health','noble']
          birthData.topic_rank = e3SelectedTopics.reduce((acc, code, idx) => {
            acc[code] = idx + 1 // TOP N
            return acc
          }, {} as Record<string, number>)
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

      // T10b v5.10.372 — internalPost 統一處理 429 + timeout、結帳是 P0 funnel、429 給友好顯示
      const checkoutPayload = {
        planCode,
        totalPrice: ['G15', 'R'].includes(planCode) ? totalPrice : undefined,
        birthData,
        locale: userLocale,
        couponCode: couponApplied?.code || undefined,
        couponDiscount: couponApplied?.discountAmount || undefined,
        pointsToUse: pointsUsed > 0 ? pointsUsed : undefined,
        userEmail: authEmail || sessionStorage.getItem('jianyuan_email') || undefined,
      }
      const checkoutPayloadIdentity = JSON.stringify(checkoutPayload)
      if (checkoutRequestRef.current?.payload !== checkoutPayloadIdentity) {
        checkoutRequestRef.current = {
          payload: checkoutPayloadIdentity,
          key: `jyco_${globalThis.crypto.randomUUID().toLowerCase()}`,
        }
      }

      const data = await internalPost('/api/checkout', {
        ...checkoutPayload,
        checkoutRequestKey: checkoutRequestRef.current.key,
      }, { authToken }) as { url?: string; error?: string }

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
        setError(data.error || '付款建立失敗、請稍後再試')
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        // T10b:結帳 429 給明確倒數、不靜默失敗
        setError(`系統繁忙、請等 ${err.retryAfter} 秒後重試`)
      } else {
        setError(err instanceof Error ? err.message : '網路錯誤、請稍後再試')
      }
    } finally {
      setLoading(false)
    }
  }

  return {
    // 基本資訊
    planCode, plan, isFamilyPlan, isRelationPlan, isG15Plan,
    // 表單
    form, setForm, timeMode, setTimeMode,
    cityResults, handleCitySearch, dismissCityResults, selectCity, selectCountry, cancelCountrySelection, needCityForCountry,
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
    g15SearchQuery, setG15SearchQuery, g15SearchResults, g15SearchLoading, g15SearchAttempted,
    searchG15Reports, addG15Report, removeG15Report, loadMyReports,
    g15RelationshipContext, setG15RelationshipContext,
    g15ConsultationGoals, setG15ConsultationGoals,
    g15LoadError, g15SearchError,
    g15ConsentMembers, g15ConsentSelectionId, g15ConsentExpiresAt,
    g15ConsentStatusMessage, g15ConsentError, g15ConsentLoading,
    g15AllMembersAccepted, g15CheckoutBlockers,
    g15ConsentAccessInputs, updateG15ConsentAccessInput,
    addG15ConsentAccessInput, removeG15ConsentAccessInput,
    updateG15ConsentEmail, sendG15ConsentInvitations, refreshG15ConsentStatus,
    // 家庭成員（保留供 UI 相容）
    familyMembers, updateFamilyMember, addFamilyMember, removeFamilyMember,
    // E1 方案
    e1EndDate, setE1EndDate,
    e1EventType, setE1EventType, e1HasExactTime, setE1HasExactTime,
    e1EventExactTime, setE1EventExactTime,
    // E1/E2 時段（E1/E3 用、E2/E4 不用）
    eSelectedBlocks, setESelectedBlocks,
    // E3 月度精選主題（8 選 1-3、順序即 TOP 1/2/3）
    e3SelectedTopics, setE3SelectedTopics,
    // 金額
    extraMemberCount, extraPrice, rExtraCount, totalPrice, finalPrice,
    // Auth
    authChecked, authError, retryAuthCheck,
    // Phase 5 v5.10.382 — Turnstile
    setTurnstileToken,
    // 驗證
    isFormValid,
    // 確認彈窗
    showConfirmModal, setShowConfirmModal,
    // 提交
    handleCheckout, confirmCheckout,
  }
}
