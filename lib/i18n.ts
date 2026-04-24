// ============================================================
// 繁簡體切換系統（使用 opencc-js 完整轉換）
// ============================================================

import * as OpenCC from 'opencc-js'

// 簡→繁白名單：避免 OpenCC s2tw 把語境錯的「只」誤轉為「隻」
// 「只」在簡體對應繁體「只/隻」二字，只有量詞（一隻貓、一隻手）應該用「隻」
// 其餘「只是/只有/只能/只需要/只會/只要/只剩/只好/只不過/只見/只怕」等副詞用法都該保留「只」
const s2tCustomDict: Array<[string, string]> = [
  ['只是', '只是'],
  ['只有', '只有'],
  ['只能', '只能'],
  ['只需', '只需'],
  ['只需要', '只需要'],
  ['只會', '只會'],
  ['只会', '只會'],
  ['只要', '只要'],
  ['只剩', '只剩'],
  ['只好', '只好'],
  ['只不過', '只不過'],
  ['只不过', '只不過'],
  ['只見', '只見'],
  ['只见', '只見'],
  ['只怕', '只怕'],
  ['只管', '只管'],
  ['只顧', '只顧'],
  ['只顾', '只顧'],
  ['只為', '只為'],
  ['只为', '只為'],
  ['只求', '只求'],
  ['只知道', '只知道'],
  ['只差', '只差'],
  ['只在', '只在'],
]

const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })
const s2tConverter = OpenCC.ConverterFactory(
  OpenCC.Locale.from.cn,
  OpenCC.Locale.to.tw.concat([s2tCustomDict]),
)

export function toSimplified(text: string): string {
  return t2sConverter(text)
}

export function toTraditional(text: string): string {
  return s2tConverter(text)
}

export type Locale = 'zh-TW' | 'zh-CN'

// UI 文字翻譯
export const UI_TEXT: Record<Locale, Record<string, string>> = {
  'zh-TW': {
    brand: '鑒源',
    tagline: '十四套系統交叉驗證，一份報告看清自己',
    nav_systems: '系統介紹',
    nav_pricing: '方案定價',
    nav_free: '免費速算',
    nav_login: '登入',
    nav_signup: '免費註冊',
    nav_my_reports: '我的報告',
    nav_logout: '登出',
    nav_blog: '知識',
    hero_title_1: '十四套系統交叉驗證',
    hero_title_2: '一份報告，看清自己',
    hero_desc: '不再依賴單一命理師的主觀判斷。鑒源整合八字、紫微、奇門遁甲等最多14套系統，以 4,600+ 條專業規則交叉分析，給你經得起驗證的命格報告。',
    cta_free: '免費體驗命理速算',
    cta_pricing: '查看完整方案',
    cta_no_card: '不需註冊 · 30 秒出結果 · 完全免費',
    free_title: '命理速算',
    free_subtitle: '精確排盤 + 深度分析 + 個人化命格解讀',
    free_no_register: '不需註冊 · 30 秒出結果 · 完全免費',
    name_label: '姓名',
    name_required: '請輸入您的全名',
    year_label: '出生年',
    month_label: '月',
    day_label: '日',
    hour_label: '出生時辰',
    gender_label: '性別',
    gender_male: '男',
    gender_female: '女',
    btn_analyze: '開始命理分析',
    btn_analyzing: '深度分析中，請稍候...',
    pricing_title: '方案與定價',
    pricing_subtitle: '6 種方案，從了解自己到採取行動',
    login_title: '歡迎回來',
    signup_title: '建立帳號',
    footer_disclaimer: '本服務融合傳統命理學與現代科技，分析結果僅供參考，不構成任何醫療、投資或法律建議。',
    footer_back_to_origin: '回到源頭 · 看清本質',
    footer_services: '命理服務',
    footer_free_tools: '免費命理速算',
    footer_plans: '方案與定價',
    footer_systems: '系統介紹',
    footer_15_systems: '十四大系統',
    footer_process: '分析流程',
    footer_legal: '法律條款',
    footer_privacy: '隱私政策',
    footer_terms: '使用條款',
    footer_contact: '聯繫我們',
    // 免費工具共用
    tool_bazi: '八字命理速算',
    tool_ziwei: '紫微斗數速算',
    tool_name: '姓名學速算',
    tool_surname: '姓',
    tool_given_name: '名',
    tool_surname_placeholder: '例：王',
    tool_given_name_placeholder: '例：小明',
    tool_start_analysis: '開始姓名分析',
    tool_analyzing: '深度分析中...',
    // 結帳頁
    checkout_redirecting: '跳轉付款中...',
    checkout_free_claim: '免費領取報告',
    checkout_confirm_pay: '確認付款',
    checkout_stripe_note: '付款由 Stripe 安全處理。報告平均需 30 分鐘以上，出門訣需 40 分鐘以上。',
    // 儀表板
    dashboard_title: '我的報告',
    dashboard_no_reports: '您還沒有購買任何報告',
    dashboard_browse: '瀏覽方案',
    // 登入/註冊
    auth_email: '電子信箱',
    auth_password: '密碼',
    auth_login_btn: '登入',
    auth_signup_btn: '註冊',
    auth_no_account: '還沒有帳號？',
    auth_has_account: '已經有帳號？',
  },
  'zh-CN': {
    brand: '鉴源',
    tagline: '十四套系统交叉验证，一份报告看清自己',
    nav_systems: '系统介绍',
    nav_pricing: '方案定价',
    nav_free: '免费速算',
    nav_login: '登录',
    nav_signup: '免费注册',
    nav_my_reports: '我的报告',
    nav_logout: '退出',
    nav_blog: '知识',
    hero_title_1: '十四套系统交叉验证',
    hero_title_2: '一份报告，看清自己',
    hero_desc: '不再依赖单一命理师的主观判断。鉴源整合八字、紫微、奇门遁甲等最多14套系统，以数万条专业规则交叉分析，给你经得起验证的命格报告。',
    cta_free: '免费体验命理速算',
    cta_pricing: '查看完整方案',
    cta_no_card: '不需注册 · 30 秒出结果 · 完全免费',
    free_title: '命理速算',
    free_subtitle: '精确排盘 + 深度分析 + 个人化命格解读',
    free_no_register: '不需注册 · 30 秒出结果 · 完全免费',
    name_label: '姓名',
    name_required: '请输入您的全名',
    year_label: '出生年',
    month_label: '月',
    day_label: '日',
    hour_label: '出生时辰',
    gender_label: '性别',
    gender_male: '男',
    gender_female: '女',
    btn_analyze: '开始命理分析',
    btn_analyzing: '深度分析中，请稍候...',
    pricing_title: '方案与定价',
    pricing_subtitle: '6 种方案，从了解自己到采取行动',
    login_title: '欢迎回来',
    signup_title: '创建账号',
    footer_disclaimer: '本服务融合传统命理学与现代科技，分析结果仅供参考，不构成任何医疗、投资或法律建议。',
    footer_back_to_origin: '回到源头 · 看清本质',
    footer_services: '命理服务',
    footer_free_tools: '免费命理速算',
    footer_plans: '方案与定价',
    footer_systems: '系统介绍',
    footer_15_systems: '十四大系统',
    footer_process: '分析流程',
    footer_legal: '法律条款',
    footer_privacy: '隐私政策',
    footer_terms: '使用条款',
    footer_contact: '联系我们',
    // 免費工具共用
    tool_bazi: '八字命理速算',
    tool_ziwei: '紫微斗数速算',
    tool_name: '姓名学速算',
    tool_surname: '姓',
    tool_given_name: '名',
    tool_surname_placeholder: '例：王',
    tool_given_name_placeholder: '例：小明',
    tool_start_analysis: '开始姓名分析',
    tool_analyzing: '深度分析中...',
    // 結帳頁
    checkout_redirecting: '跳转付款中...',
    checkout_free_claim: '免费领取报告',
    checkout_confirm_pay: '确认付款',
    checkout_stripe_note: '付款由 Stripe 安全处理。报告平均需 30 分钟以上，出门诀需 40 分钟以上。',
    // 儀表板
    dashboard_title: '我的报告',
    dashboard_no_reports: '您还没有购买任何报告',
    dashboard_browse: '浏览方案',
    // 登入/註冊
    auth_email: '电子邮箱',
    auth_password: '密码',
    auth_login_btn: '登录',
    auth_signup_btn: '注册',
    auth_no_account: '还没有账号？',
    auth_has_account: '已经有账号？',
  },
}

// 取得當前語言
export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-TW'
  return (localStorage.getItem('locale') as Locale) || 'zh-TW'
}

export function setLocale(locale: Locale) {
  localStorage.setItem('locale', locale)
  // 發送自訂事件，不 reload 頁面
  window.dispatchEvent(new CustomEvent('locale-change', { detail: locale }))
}

export function t(key: string): string {
  const locale = getLocale()
  return UI_TEXT[locale]?.[key] || UI_TEXT['zh-TW'][key] || key
}
