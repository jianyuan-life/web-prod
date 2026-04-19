// ============================================================
// 多幣種系統：根據用戶地區自動切換
// ============================================================

export type CurrencyCode = 'USD' | 'TWD' | 'HKD' | 'CNY' | 'JPY'

interface CurrencyInfo {
  code: CurrencyCode
  symbol: string
  name: string
  rate: number  // 對 USD 的匯率（近似值，定期更新）
  decimals: number
}

// ⚠️ 匯率是硬編碼近似值（2026-04 更新），僅用於「結帳頁顯示」轉換：
//   實際收費一律由 Stripe 按 USD 扣款，顯示與實收可能有 ±3% 誤差（正常波動）
//   若匯率波動 > 10% 需手動更新下列值，否則客戶會覺得「牌價騙人」
//   未來可改接 Open Exchange Rates / Fixer.io，每日 cron 更新到 Supabase 設定表
const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', name: 'USD', rate: 1, decimals: 0 },
  TWD: { code: 'TWD', symbol: 'NT$', name: 'TWD', rate: 32, decimals: 0 },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'HKD', rate: 7.8, decimals: 0 },
  CNY: { code: 'CNY', symbol: '¥', name: 'CNY', rate: 7.2, decimals: 0 },
  JPY: { code: 'JPY', symbol: '¥', name: 'JPY', rate: 150, decimals: 0 },
}

// 根據時區或語言猜測地區
function detectCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return 'USD'

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const lang = navigator.language || ''

    // 台灣
    if (tz.includes('Taipei') || lang.includes('zh-TW')) return 'TWD'
    // 香港
    if (tz.includes('Hong_Kong') || lang.includes('zh-HK')) return 'HKD'
    // 中國大陸
    if (tz.includes('Shanghai') || tz.includes('Chongqing') || lang === 'zh-CN' || lang === 'zh') return 'CNY'
    // 日本
    if (tz.includes('Tokyo') || lang.includes('ja')) return 'JPY'
    // 新加坡、馬來西亞用 USD
  } catch {
    // ignore
  }

  return 'USD'
}

let _cachedCurrency: CurrencyCode | null = null

export function getUserCurrency(): CurrencyCode {
  if (_cachedCurrency) return _cachedCurrency
  if (typeof window !== 'undefined') {
    try {
      // v5.3.34：localStorage 在 Safari 隱私模式 / iframe 跨源時會 throw
      const saved = localStorage.getItem('currency')
      if (saved && (saved in CURRENCIES)) {
        _cachedCurrency = saved as CurrencyCode
        return _cachedCurrency
      }
    } catch {
      /* ignore localStorage 錯誤，fallback detect */
    }
  }
  const detected = detectCurrency()
  _cachedCurrency = detected
  return detected
}

export function setCurrency(code: CurrencyCode) {
  if (!(code in CURRENCIES)) return // v5.3.34 防寫入不支援的 code
  _cachedCurrency = code
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('currency', code)
    } catch {
      /* Safari 隱私模式 / quota exceeded：記憶體快取已設好，忽略 */
    }
  }
}

export function formatPrice(usdPrice: number, currency?: CurrencyCode): string {
  // v5.3.34：防 NaN/非法值污染顯示（例如後端送 null 進來）
  const safeUsd = Number.isFinite(usdPrice) ? usdPrice : 0
  const code = currency || getUserCurrency()
  const info = CURRENCIES[code] || CURRENCIES.USD
  const converted = Math.round(safeUsd * info.rate)
  return `${info.symbol}${converted.toLocaleString()}`
}

export function getCurrencyInfo(code?: CurrencyCode): CurrencyInfo {
  // v5.3.34：若 code 不在支援清單中，fallback USD 而不是回 undefined
  //   原本 CURRENCIES[code||...] 對未知 code 會回 undefined，呼叫端 .symbol 會炸
  const resolved = code || getUserCurrency()
  return CURRENCIES[resolved] || CURRENCIES.USD
}

export function getAllCurrencies(): CurrencyInfo[] {
  return Object.values(CURRENCIES)
}
