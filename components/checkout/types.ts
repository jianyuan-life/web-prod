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
  C: { name: '人生藍圖', price: 89, systems: 14 },
  D: { name: '心之所惑', price: 39, systems: 0 },
  G15: { name: '家族藍圖', price: 59, systems: 14 },
  R: { name: '合否？', price: 59, systems: 0 },
  E1: { name: '事件出門訣', price: 59, systems: 1 },
  E2: { name: '月度出門訣', price: 29, systems: 1 },
  E3: { name: '週度補運', price: 89, systems: 1 },
  E4: { name: '年度方案', price: 279, systems: 1 },
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
  C: '填寫您的出生資料，我們將為您進行十四套命理系統深度分析',
  D: '請選擇分析主題並填寫出生資料',
  G15: '從已完成的人生藍圖報告中選擇家庭成員，進行家族互動分析',
  R: '請填寫雙方（或多方）的出生資料',
  E1: '請填寫您的出生資料與事件背景。系統將精密計算事件前後各時段的古法奇門遁甲盤面，套入您的年命宮驗證，交出針對此事最精準的 Top 3 出行方案。',
  E2: '請填寫您的出生資料。系統依奇門紫白擇日派四層架構（紫白飛星月+年吉星並集 + 月家奇門輔助 + 年命宮個人化）算出當月主吉方與最佳吉時窗口。晦日 21:00 前購買當月執行。',
  E3: '請選擇 1-3 個主題（事業／財運／感情／健康／學業／貴人／化解小人／家庭），系統依用神佔事派 4 週精算 Top2 吉時、共 8 個最佳時窗。',
  E4: '請填寫您的出生資料。系統將為您精算年盤＋12 個月盤，全年擇吉一次到位。立春前 30 天限時販售。',
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

// E3 週度補運主題（可選 1-3 個）—對應後端 topic_yongshen_map.py 的 8 類
export const E3_TOPICS: Array<{ code: string; label: string; desc: string }> = [
  { code: 'career', label: '事業運', desc: '升遷、創業、專案推進' },
  { code: 'wealth', label: '財運', desc: '投資、求財、業務談判' },
  { code: 'love', label: '感情運', desc: '交往、復合、姻緣' },
  { code: 'health', label: '健康', desc: '養生、求醫、身心平衡' },
  { code: 'study', label: '學業', desc: '考試、求學、進修' },
  { code: 'noble', label: '貴人', desc: '拜訪長官、結交助力' },
  { code: 'villain', label: '化解小人', desc: '化煞、迴避衝突' },
  { code: 'family', label: '家庭', desc: '家人關係、家運興旺' },
]

// E1 事件出門訣 — 事件類型選單
// v5.3.93：砍重複「談判」→「談判/協商」、新增手術/訴訟/表白三類情感剛性事件
// 對應奇門遁甲用神：財運→生/天財、貴人→德/九天、談判/簽約→開/杜、搬家→杜/死、求醫→天醫/天任、考試/面試→文/九地、求姻緣→天喜/紅鸞、旅行出行→開/驛馬、訴訟→景/玄武、手術→天醫/傷、表白→天喜/紅鸞
export const E1_EVENT_TYPES = [
  '面試',
  '簽約',
  '談判/協商',
  '考試',
  '開店/開業',
  '搬家/遷移',
  '拜訪貴人',
  '投資/理財',
  '求姻緣/相親',
  '表白/告白',
  '手術/醫療',
  '求醫/就診',
  '訴訟/法律',
  '旅行/出遊',
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
