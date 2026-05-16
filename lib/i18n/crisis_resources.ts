// ============================================================
// 提示詞合集 Prompt 27 — 跨文化危機資源 i18n
// ============================================================
// Prompt 6 的 <CrisisCard> 依用戶 locale 讀此檔顯示在地危機熱線。
//
// 🔴🔴🔴 零幻覺 + 攸關性命:危機熱線號碼是「會被真實求助者撥打」的事實。
//   撥錯號碼 = 人命風險。因此:
//   - 每筆帶 `verified` + `source`(官方來源 URL)+ `lastChecked`
//   - 模組級硬閘 CRISIS_RESOURCES_VERIFIED = false
//     → getCrisisResource() 在硬閘 false 時回 null(CrisisCard 改顯示
//       通用「請聯絡當地緊急服務」fallback、絕不顯示未驗證號碼)
//   - 上線前必經:Prompt 27 acceptance「法務 review(各國心理熱線
//     使用條款)」+ 臨床/客服逐筆對官方網站核對 → 逐筆 verified:true
//     → 全綠才把 CRISIS_RESOURCES_VERIFIED 設 true(P0、老闆拍板)
//
// 下列號碼來自提示詞合集 Prompt 27 + 配套研究報告,**尚未逐筆官方核對**,
// 全部 verified:false。不可在 verified 前對外顯示。

export interface CrisisResource {
  country: string       // ISO-3166 alpha-2
  locale: string        // 主要 locale(BCP-47)
  name: string          // 機構名
  phone: string         // 撥號(在地格式)
  url: string           // 官方網站(核對來源)
  open_hours: string    // 服務時間
  language: string[]    // 支援語言
  verified: boolean     // 是否已對官方來源逐筆核對(預設全 false)
  lastChecked: string | null  // YYYY-MM-DD,核對日期
  note?: string         // 待核對 / 替代號碼備註
}

// i18n 文案(繁中 / 英 / 日 / 韓 / 簡中)— CrisisCard 依 user locale 取
export const CRISIS_CARD_I18N: Record<string, { title: string; subtitle: string; cta: string; fallback: string }> = {
  'zh-TW': {
    title: '你並不孤單,現在就可以找人說',
    subtitle: '看到這段話的你,值得被好好對待。以下是 24 小時的專業陪伴。',
    cta: '撥打專線',
    fallback: '若情況緊急,請立即撥打當地緊急服務電話,或前往最近的急診室。',
  },
  'en': {
    title: 'You are not alone — help is available right now',
    subtitle: 'What you are feeling matters. Trained people are ready to listen, any time.',
    cta: 'Call now',
    fallback: 'If this is an emergency, please call your local emergency number or go to the nearest emergency room.',
  },
  'ja': {
    title: 'あなたは一人ではありません',
    subtitle: 'いまの気持ちを、訓練を受けた人に話してみませんか。',
    cta: '電話する',
    fallback: '緊急の場合は、お住まいの地域の緊急番号に電話するか、最寄りの救急外来へ。',
  },
  'ko': {
    title: '당신은 혼자가 아닙니다',
    subtitle: '지금 느끼는 감정은 중요합니다. 언제든 들어줄 사람이 있습니다.',
    cta: '전화하기',
    fallback: '응급 상황이라면 지역 응급 번호로 전화하거나 가까운 응급실로 가세요.',
  },
  'zh-CN': {
    title: '你并不孤单,现在就可以找人倾诉',
    subtitle: '你此刻的感受很重要。有受过训练的人随时愿意倾听。',
    cta: '拨打专线',
    fallback: '若情况紧急,请立即拨打当地紧急服务电话,或前往最近的急诊。',
  },
}

// ⚠️ 全部 verified:false — 上線前逐筆核對官方來源 + 法務 review
export const CRISIS_RESOURCES: CrisisResource[] = [
  { country: 'US', locale: 'en', name: '988 Suicide & Crisis Lifeline', phone: '988', url: 'https://988lifeline.org', open_hours: '24/7', language: ['en', 'es'], verified: false, lastChecked: null },
  { country: 'TW', locale: 'zh-TW', name: '衛福部安心專線', phone: '1925', url: 'https://dep.mohw.gov.tw', open_hours: '24/7', language: ['zh-TW'], verified: false, lastChecked: null, note: '另:生命線 1995 / 張老師 1980' },
  { country: 'JP', locale: 'ja', name: 'TELL Lifeline', phone: '03-5774-0992', url: 'https://telljp.com', open_hours: '依官網', language: ['en', 'ja'], verified: false, lastChecked: null, note: '時間/號碼待官網核對' },
  { country: 'KR', locale: 'ko', name: '자살예방상담전화', phone: '1393', url: 'https://www.kfsp.or.kr', open_hours: '24/7', language: ['ko'], verified: false, lastChecked: null },
  { country: 'HK', locale: 'zh-TW', name: '香港撒瑪利亞防止自殺會', phone: '2389-2222', url: 'https://www.sbhk.org.hk', open_hours: '24/7', language: ['zh-TW', 'zh-CN', 'en'], verified: false, lastChecked: null },
  { country: 'CN', locale: 'zh-CN', name: '心理援助熱線(12320 轉 5)', phone: '12320', url: 'http://www.12320.gov.cn', open_hours: '依地區', language: ['zh-CN'], verified: false, lastChecked: null, note: '北京心理危機研究與干預中心 010-82951332 為常被引用替代,待核對哪個為當前官方主線' },
  { country: 'SG', locale: 'en', name: 'Samaritans of Singapore (SOS)', phone: '1767', url: 'https://www.sos.org.sg', open_hours: '24/7', language: ['en', 'zh-CN'], verified: false, lastChecked: null, note: 'SOS 24h 熱線近年改 1767;舊號 1800-221-4444 待確認是否仍有效' },
  { country: 'MY', locale: 'en', name: 'Befrienders KL', phone: '03-7627-2929', url: 'https://www.befrienders.org.my', open_hours: '24/7', language: ['en', 'zh-CN'], verified: false, lastChecked: null, note: '提示詞合集列 03-7956-8145,Befrienders 官網近年公佈 03-7627-2929,須核對' },
  { country: 'AU', locale: 'en', name: 'Lifeline Australia', phone: '13 11 14', url: 'https://www.lifeline.org.au', open_hours: '24/7', language: ['en'], verified: false, lastChecked: null },
  { country: 'GB', locale: 'en', name: 'Samaritans', phone: '116 123', url: 'https://www.samaritans.org', open_hours: '24/7', language: ['en'], verified: false, lastChecked: null },
  { country: 'CA', locale: 'en', name: 'Talk Suicide Canada', phone: '1-833-456-4566', url: 'https://talksuicide.ca', open_hours: '24/7', language: ['en', 'fr'], verified: false, lastChecked: null, note: '加拿大 2023 起另有 988 三碼線,待核對主推哪個' },
]

/**
 * 🔴 模組級硬閘:未完成「逐筆官方核對 + 法務 review」前恆 false。
 * 全部 verified:true 後,由老闆拍板 commit 改 true(P0、One-way、攸關性命)。
 */
export const CRISIS_RESOURCES_VERIFIED = false

/**
 * 取得指定國家危機資源。
 * - 硬閘 false 或該筆未 verified → 回 null
 *   (CrisisCard 收 null 時改顯示 CRISIS_CARD_I18N.fallback 通用文案,
 *    絕不顯示未驗證號碼 — 撥錯號碼 = 人命風險)
 */
export function getCrisisResource(country: string): CrisisResource | null {
  if (!CRISIS_RESOURCES_VERIFIED) return null
  const r = CRISIS_RESOURCES.find((x) => x.country === country.toUpperCase())
  if (!r || !r.verified) return null
  return r
}

/** 取 CrisisCard i18n 文案,locale 無對應時退 en */
export function getCrisisCardCopy(locale: string) {
  return CRISIS_CARD_I18N[locale] || CRISIS_CARD_I18N[locale?.split('-')[0]] || CRISIS_CARD_I18N['en']
}
