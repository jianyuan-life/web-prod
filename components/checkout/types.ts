// 結帳頁共用型別定義

export interface FamilyMember {
  name: string
  year: string
  month: string
  day: string
  hour: string
  timeMode: 'unknown' | 'shichen' | 'exact'
  minute: string
  gender: string
  birthCity?: string
  cityLat?: number
  cityLng?: number
  cityTz?: number
  // v5.2.4 國際化（Sprint 3）：IANA 時區與國家碼
  timezone?: string       // 'Asia/Taipei' / 'America/New_York' etc.
  countryCode?: string    // ISO 3166-1 alpha-2
  calendarType?: 'solar' | 'lunar'
  lunarLeap?: boolean
}

export function newMember(): FamilyMember {
  return {
    name: '', year: '1990', month: '1', day: '1', hour: '12',
    timeMode: 'shichen', minute: '0', gender: 'M',
    birthCity: '', cityLat: 0, cityLng: 0, cityTz: 8,
    timezone: '', countryCode: '',
    calendarType: 'solar', lunarLeap: false,
  }
}

export const PLANS: Record<string, { name: string; price: number; systems: number }> = {
  C: { name: '人生藍圖', price: 89, systems: 15 },
  D: { name: '心之所惑', price: 39, systems: 0 },
  G15: { name: '家族藍圖', price: 59, systems: 15 },
  R: { name: '合否？', price: 59, systems: 0 },
  E1: { name: '事件出門訣', price: 89, systems: 1 },
  E2: { name: '月度出門訣', price: 99, systems: 1 },
}


// G15 家族藍圖：從已完成的人生藍圖報告中選取成員
export interface G15SelectedReport {
  reportId: string         // paid_reports.id
  name: string             // 客戶姓名
  createdAt?: string       // 報告建立時間
}

// 搜尋結果項目
export interface G15SearchResult {
  id: string
  name: string
  emailHint?: string       // 隱私遮蔽的 email 提示
  createdAt?: string
}

// 保留舊介面供相容（如有其他引用）
export interface FamilyEmailEntry {
  email: string
  verified: boolean
  name?: string
  errorMsg?: string
}

export function newFamilyEmail(): FamilyEmailEntry {
  return { email: '', verified: false }
}

export const PLAN_DESCRIPTIONS: Record<string, string> = {
  C: '填寫您的出生資料，我們將為您進行十五套命理系統深度分析',
  D: '請選擇分析主題並填寫出生資料',
  G15: '從已完成的人生藍圖報告中選擇家庭成員，進行家族互動分析',
  R: '請填寫雙方（或多方）的出生資料',
  E1: '請填寫您的出生資料與事件背景。系統將精確排算事件前後各時段的奇門局，套入您的命格驗證吉位，交出針對此事最精準的 Top 3 出行方案。計算需 40 分鐘以上。',
  E2: '請填寫您的出生資料。系統將從今日起，為您排算未來一個月共 4 週奇門月盤，套入您的命格找出每週最適合出行的吉時與方向。計算需 40 分鐘以上，完成後可在儀表板查看。',
}

export const SHICHEN = [
  { label: '子時 (23:00-01:00)', value: 0 },
  { label: '丑時 (01:00-03:00)', value: 2 },
  { label: '寅時 (03:00-05:00)', value: 4 },
  { label: '卯時 (05:00-07:00)', value: 6 },
  { label: '辰時 (07:00-09:00)', value: 8 },
  { label: '巳時 (09:00-11:00)', value: 10 },
  { label: '午時 (11:00-13:00)', value: 12 },
  { label: '未時 (13:00-15:00)', value: 14 },
  { label: '申時 (15:00-17:00)', value: 16 },
  { label: '酉時 (17:00-19:00)', value: 18 },
  { label: '戌時 (19:00-21:00)', value: 20 },
  { label: '亥時 (21:00-23:00)', value: 22 },
]

export interface CheckoutFormState {
  name: string
  year: string
  month: string
  day: string
  hour: string
  minute: string
  gender: string
  address: string
  addressLat: number
  addressLng: number
  birthCity: string
  cityLat: number
  cityLng: number
  cityTz: number
  // v5.2.4 國際化（Sprint 3）
  timezone: string       // IANA 如 'Asia/Taipei'，空字串代表舊流程（Nominatim 未帶時區）
  countryCode: string    // ISO 3166-1 alpha-2
  calendarType: 'solar' | 'lunar'
  lunarLeap: boolean
}

export const D_TOPICS = ['財運', '事業', '感情', '健康', '學業', '搬家', '問事（其他）']

// E1 事件出門訣 — 事件類型選單
// 對應奇門遁甲不同用神：財運→生/天財、貴人→德/九天、談判/簽約→開/杜、搬家→杜/死、求醫→天醫/天任、考試/面試→文/九地、求姻緣→天喜/紅鸞、旅行出行→開/驛馬
export const E1_EVENT_TYPES = [
  '面試',
  '談判',
  '簽約',
  '開店/開業',
  '搬家/遷移',
  '考試',
  '求醫/就診',
  '求姻緣/相親',
  '談判/協商',
  '旅行/出遊',
  '投資/理財',
  '拜訪貴人',
  '其他',
]

export const TIME_BLOCKS = [
  { label: '子時 23:00–01:00', start: '23:00', end: '01:00' },
  { label: '丑時 01:00–03:00', start: '01:00', end: '03:00' },
  { label: '寅時 03:00–05:00', start: '03:00', end: '05:00' },
  { label: '卯時 05:00–07:00', start: '05:00', end: '07:00' },
  { label: '辰時 07:00–09:00', start: '07:00', end: '09:00' },
  { label: '巳時 09:00–11:00', start: '09:00', end: '11:00' },
  { label: '午時 11:00–13:00', start: '11:00', end: '13:00' },
  { label: '未時 13:00–15:00', start: '13:00', end: '15:00' },
  { label: '申時 15:00–17:00', start: '15:00', end: '17:00' },
  { label: '酉時 17:00–19:00', start: '17:00', end: '19:00' },
  { label: '戌時 19:00–21:00', start: '19:00', end: '21:00' },
  { label: '亥時 21:00–23:00', start: '21:00', end: '23:00' },
]
