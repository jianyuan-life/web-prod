// 全球主要城市數據庫（經緯度+時區）
// 優先覆蓋華人地區，再覆蓋全球主要城市
//
// v5.2.4（2026-04-17 國際化 Sprint 3）：
//   原 60 個城市保留為「華人快速選單」，完整 500+ 城市庫改放 cities-with-tz.ts。
//   本檔案只提供向後相容的 City / searchCities API，內部會 fallback 到 cities-with-tz。

import {
  CITIES_WITH_TZ,
  searchCitiesTz,
  type CityTz,
} from './cities-with-tz'

export interface City {
  name: string      // 繁體中文名
  name_s: string    // 簡體中文名
  name_en: string   // 英文名
  country: string   // 國家/地區
  lat: number       // 緯度
  lng: number       // 經度
  tz: number        // UTC 標準時偏移（小時；DST 由前端依時刻動態計算）
  tzName: string    // IANA 時區名稱
  countryCode?: string  // ISO 3166-1 alpha-2（Sprint 3 新增）
}

// CityTz → City 適配：保持與舊 API 相容
function adaptCityTz(c: CityTz): City {
  return {
    name: c.name,
    name_s: c.name, // 簡中別名目前不維護，用繁體
    name_en: c.name_en,
    country: c.country,
    lat: c.lat,
    lng: c.lng,
    tz: c.tz,
    tzName: c.timezone,
    countryCode: c.countryCode,
  }
}

// ══════ 國家/地區優先搜尋 ══════

export interface Country {
  name: string       // 繁體中文名
  nameEn: string     // 英文名
  tz: number         // UTC 時區偏移
  lat: number        // 首都/代表城市緯度
  lng: number        // 首都/代表城市經度
  isMultiTz?: boolean // 是否為多時區國家
}

// 單一時區國家（選了就完成）
export const SINGLE_TZ_COUNTRIES: Country[] = [
  // 華人常用（置頂）
  { name: '台灣', nameEn: 'Taiwan', tz: 8, lat: 23.69, lng: 120.96 },
  { name: '香港', nameEn: 'Hong Kong', tz: 8, lat: 22.32, lng: 114.17 },
  { name: '中國', nameEn: 'China', tz: 8, lat: 39.91, lng: 116.40 },
  { name: '新加坡', nameEn: 'Singapore', tz: 8, lat: 1.35, lng: 103.85 },
  { name: '馬來西亞', nameEn: 'Malaysia', tz: 8, lat: 3.14, lng: 101.69 },
  { name: '日本', nameEn: 'Japan', tz: 9, lat: 35.68, lng: 139.69 },
  { name: '韓國', nameEn: 'South Korea', tz: 9, lat: 37.57, lng: 126.98 },
  { name: '泰國', nameEn: 'Thailand', tz: 7, lat: 13.76, lng: 100.50 },
  { name: '越南', nameEn: 'Vietnam', tz: 7, lat: 21.03, lng: 105.85 },
  { name: '菲律賓', nameEn: 'Philippines', tz: 8, lat: 14.60, lng: 120.98 },
  { name: '英國', nameEn: 'United Kingdom', tz: 0, lat: 51.51, lng: -0.13 },
  { name: '法國', nameEn: 'France', tz: 1, lat: 48.86, lng: 2.35 },
  { name: '德國', nameEn: 'Germany', tz: 1, lat: 52.52, lng: 13.41 },
  { name: '印度', nameEn: 'India', tz: 5.5, lat: 28.61, lng: 77.21 },
  { name: '紐西蘭', nameEn: 'New Zealand', tz: 12, lat: -41.29, lng: 174.78 },
  { name: '澳門', nameEn: 'Macau', tz: 8, lat: 22.20, lng: 113.54 },
  { name: '阿聯酋', nameEn: 'UAE', tz: 4, lat: 25.21, lng: 55.27 },
]

// 多時區國家（需要進一步選城市）
export const MULTI_TZ_COUNTRIES: Country[] = [
  { name: '美國', nameEn: 'United States', tz: -5, lat: 40.71, lng: -74.01, isMultiTz: true },
  { name: '加拿大', nameEn: 'Canada', tz: -5, lat: 43.65, lng: -79.38, isMultiTz: true },
  { name: '澳洲', nameEn: 'Australia', tz: 10, lat: -33.87, lng: 151.21, isMultiTz: true },
  { name: '俄羅斯', nameEn: 'Russia', tz: 3, lat: 55.76, lng: 37.62, isMultiTz: true },
  { name: '巴西', nameEn: 'Brazil', tz: -3, lat: -23.55, lng: -46.63, isMultiTz: true },
  { name: '印尼', nameEn: 'Indonesia', tz: 7, lat: -6.21, lng: 106.85, isMultiTz: true },
  { name: '墨西哥', nameEn: 'Mexico', tz: -6, lat: 19.43, lng: -99.13, isMultiTz: true },
]

export interface CountrySearchResult {
  type: 'country'
  country: Country
  isMultiTz: boolean
}

export interface CitySearchResult {
  type: 'city'
  city: City
}

export type LocationSearchResult = CountrySearchResult | CitySearchResult

// 搜尋國家（中文或英文）
function searchCountries(query: string): CountrySearchResult[] {
  const q = query.toLowerCase().trim()
  const results: CountrySearchResult[] = []

  // 先搜尋單一時區國家
  for (const c of SINGLE_TZ_COUNTRIES) {
    if (c.name.includes(q) || c.nameEn.toLowerCase().includes(q)) {
      results.push({ type: 'country', country: c, isMultiTz: false })
    }
  }

  // 再搜尋多時區國家
  for (const c of MULTI_TZ_COUNTRIES) {
    if (c.name.includes(q) || c.nameEn.toLowerCase().includes(q)) {
      results.push({ type: 'country', country: c, isMultiTz: true })
    }
  }

  return results
}

// 統一搜尋：先匹配國家，再匹配城市
export function searchLocations(query: string): LocationSearchResult[] {
  // v5.3.34：修復 query 為純空白（'   '）時 trim 後空字串仍進 loop 的問題
  //   String.includes('') 永遠 true → 會把所有城市都 match 出來浪費 CPU
  if (!query) return []
  const q = query.toLowerCase().trim()
  if (!q) return []

  const results: LocationSearchResult[] = []

  // 1. 先匹配國家
  const countryResults = searchCountries(q)
  results.push(...countryResults)

  // 2. 再匹配城市（排除已經被國家覆蓋的）
  const matchedCountryNames = new Set(countryResults.map(r => r.country.name))
  const cityResults = CITIES.filter(c =>
    c.name.includes(q) || c.name_s.includes(q) ||
    c.name_en.toLowerCase().includes(q)
  ).filter(c => !matchedCountryNames.has(c.country)) // 避免國家名搜出一堆城市
  .slice(0, 6)

  for (const city of cityResults) {
    results.push({ type: 'city', city })
  }

  return results.slice(0, 8)
}

export const CITIES: City[] = [
  // ══════ 台灣 ══════
  { name:'台北', name_s:'台北', name_en:'Taipei', country:'台灣', lat:25.033, lng:121.565, tz:8, tzName:'Asia/Taipei' },
  { name:'台中', name_s:'台中', name_en:'Taichung', country:'台灣', lat:24.148, lng:120.674, tz:8, tzName:'Asia/Taipei' },
  { name:'高雄', name_s:'高雄', name_en:'Kaohsiung', country:'台灣', lat:22.627, lng:120.301, tz:8, tzName:'Asia/Taipei' },
  { name:'台南', name_s:'台南', name_en:'Tainan', country:'台灣', lat:22.999, lng:120.227, tz:8, tzName:'Asia/Taipei' },
  { name:'新北', name_s:'新北', name_en:'New Taipei', country:'台灣', lat:25.012, lng:121.466, tz:8, tzName:'Asia/Taipei' },
  { name:'桃園', name_s:'桃园', name_en:'Taoyuan', country:'台灣', lat:24.994, lng:121.297, tz:8, tzName:'Asia/Taipei' },
  { name:'新竹', name_s:'新竹', name_en:'Hsinchu', country:'台灣', lat:24.804, lng:120.972, tz:8, tzName:'Asia/Taipei' },
  { name:'基隆', name_s:'基隆', name_en:'Keelung', country:'台灣', lat:25.128, lng:121.739, tz:8, tzName:'Asia/Taipei' },
  { name:'嘉義', name_s:'嘉义', name_en:'Chiayi', country:'台灣', lat:23.480, lng:120.449, tz:8, tzName:'Asia/Taipei' },
  { name:'花蓮', name_s:'花莲', name_en:'Hualien', country:'台灣', lat:23.977, lng:121.605, tz:8, tzName:'Asia/Taipei' },
  { name:'屏東', name_s:'屏东', name_en:'Pingtung', country:'台灣', lat:22.682, lng:120.484, tz:8, tzName:'Asia/Taipei' },
  { name:'宜蘭', name_s:'宜兰', name_en:'Yilan', country:'台灣', lat:24.752, lng:121.754, tz:8, tzName:'Asia/Taipei' },

  // ══════ 香港/澳門 ══════
  { name:'香港', name_s:'香港', name_en:'Hong Kong', country:'香港', lat:22.320, lng:114.170, tz:8, tzName:'Asia/Hong_Kong' },
  { name:'九龍', name_s:'九龙', name_en:'Kowloon', country:'香港', lat:22.320, lng:114.177, tz:8, tzName:'Asia/Hong_Kong' },
  { name:'澳門', name_s:'澳门', name_en:'Macau', country:'澳門', lat:22.199, lng:113.544, tz:8, tzName:'Asia/Macau' },

  // ══════ 中國大陸 ══════
  { name:'北京', name_s:'北京', name_en:'Beijing', country:'中國', lat:39.904, lng:116.407, tz:8, tzName:'Asia/Shanghai' },
  { name:'上海', name_s:'上海', name_en:'Shanghai', country:'中國', lat:31.230, lng:121.474, tz:8, tzName:'Asia/Shanghai' },
  { name:'廣州', name_s:'广州', name_en:'Guangzhou', country:'中國', lat:23.129, lng:113.264, tz:8, tzName:'Asia/Shanghai' },
  { name:'深圳', name_s:'深圳', name_en:'Shenzhen', country:'中國', lat:22.543, lng:114.058, tz:8, tzName:'Asia/Shanghai' },
  { name:'杭州', name_s:'杭州', name_en:'Hangzhou', country:'中國', lat:30.275, lng:120.155, tz:8, tzName:'Asia/Shanghai' },
  { name:'成都', name_s:'成都', name_en:'Chengdu', country:'中國', lat:30.573, lng:104.066, tz:8, tzName:'Asia/Shanghai' },
  { name:'重慶', name_s:'重庆', name_en:'Chongqing', country:'中國', lat:29.563, lng:106.551, tz:8, tzName:'Asia/Shanghai' },
  { name:'武漢', name_s:'武汉', name_en:'Wuhan', country:'中國', lat:30.593, lng:114.305, tz:8, tzName:'Asia/Shanghai' },
  { name:'南京', name_s:'南京', name_en:'Nanjing', country:'中國', lat:32.061, lng:118.797, tz:8, tzName:'Asia/Shanghai' },
  { name:'天津', name_s:'天津', name_en:'Tianjin', country:'中國', lat:39.084, lng:117.201, tz:8, tzName:'Asia/Shanghai' },
  { name:'西安', name_s:'西安', name_en:"Xi'an", country:'中國', lat:34.264, lng:108.944, tz:8, tzName:'Asia/Shanghai' },
  { name:'蘇州', name_s:'苏州', name_en:'Suzhou', country:'中國', lat:31.299, lng:120.585, tz:8, tzName:'Asia/Shanghai' },
  { name:'長沙', name_s:'长沙', name_en:'Changsha', country:'中國', lat:28.228, lng:112.939, tz:8, tzName:'Asia/Shanghai' },
  { name:'鄭州', name_s:'郑州', name_en:'Zhengzhou', country:'中國', lat:34.747, lng:113.625, tz:8, tzName:'Asia/Shanghai' },
  { name:'東莞', name_s:'东莞', name_en:'Dongguan', country:'中國', lat:23.021, lng:113.752, tz:8, tzName:'Asia/Shanghai' },
  { name:'廈門', name_s:'厦门', name_en:'Xiamen', country:'中國', lat:24.480, lng:118.089, tz:8, tzName:'Asia/Shanghai' },
  { name:'福州', name_s:'福州', name_en:'Fuzhou', country:'中國', lat:26.075, lng:119.306, tz:8, tzName:'Asia/Shanghai' },
  { name:'昆明', name_s:'昆明', name_en:'Kunming', country:'中國', lat:25.040, lng:102.712, tz:8, tzName:'Asia/Shanghai' },
  { name:'大連', name_s:'大连', name_en:'Dalian', country:'中國', lat:38.914, lng:121.615, tz:8, tzName:'Asia/Shanghai' },
  { name:'青島', name_s:'青岛', name_en:'Qingdao', country:'中國', lat:36.067, lng:120.383, tz:8, tzName:'Asia/Shanghai' },
  { name:'烏魯木齊', name_s:'乌鲁木齐', name_en:'Urumqi', country:'中國', lat:43.826, lng:87.617, tz:8, tzName:'Asia/Shanghai' },
  { name:'哈爾濱', name_s:'哈尔滨', name_en:'Harbin', country:'中國', lat:45.750, lng:126.650, tz:8, tzName:'Asia/Shanghai' },
  { name:'瀋陽', name_s:'沈阳', name_en:'Shenyang', country:'中國', lat:41.805, lng:123.432, tz:8, tzName:'Asia/Shanghai' },
  { name:'拉薩', name_s:'拉萨', name_en:'Lhasa', country:'中國', lat:29.650, lng:91.100, tz:8, tzName:'Asia/Shanghai' },

  // ══════ 日本 ══════
  { name:'東京', name_s:'东京', name_en:'Tokyo', country:'日本', lat:35.682, lng:139.769, tz:9, tzName:'Asia/Tokyo' },
  { name:'大阪', name_s:'大阪', name_en:'Osaka', country:'日本', lat:34.694, lng:135.502, tz:9, tzName:'Asia/Tokyo' },
  { name:'京都', name_s:'京都', name_en:'Kyoto', country:'日本', lat:35.012, lng:135.768, tz:9, tzName:'Asia/Tokyo' },
  { name:'橫濱', name_s:'横滨', name_en:'Yokohama', country:'日本', lat:35.444, lng:139.638, tz:9, tzName:'Asia/Tokyo' },
  { name:'名古屋', name_s:'名古屋', name_en:'Nagoya', country:'日本', lat:35.181, lng:136.906, tz:9, tzName:'Asia/Tokyo' },
  { name:'福岡', name_s:'福冈', name_en:'Fukuoka', country:'日本', lat:33.590, lng:130.402, tz:9, tzName:'Asia/Tokyo' },

  // ══════ 韓國 ══════
  { name:'首爾', name_s:'首尔', name_en:'Seoul', country:'韓國', lat:37.567, lng:126.978, tz:9, tzName:'Asia/Seoul' },
  { name:'釜山', name_s:'釜山', name_en:'Busan', country:'韓國', lat:35.180, lng:129.076, tz:9, tzName:'Asia/Seoul' },

  // ══════ 東南亞 ══════
  { name:'新加坡', name_s:'新加坡', name_en:'Singapore', country:'新加坡', lat:1.352, lng:103.820, tz:8, tzName:'Asia/Singapore' },
  { name:'吉隆坡', name_s:'吉隆坡', name_en:'Kuala Lumpur', country:'馬來西亞', lat:3.139, lng:101.687, tz:8, tzName:'Asia/Kuala_Lumpur' },
  { name:'曼谷', name_s:'曼谷', name_en:'Bangkok', country:'泰國', lat:13.756, lng:100.502, tz:7, tzName:'Asia/Bangkok' },
  { name:'胡志明市', name_s:'胡志明市', name_en:'Ho Chi Minh City', country:'越南', lat:10.823, lng:106.630, tz:7, tzName:'Asia/Ho_Chi_Minh' },
  { name:'河內', name_s:'河内', name_en:'Hanoi', country:'越南', lat:21.029, lng:105.852, tz:7, tzName:'Asia/Ho_Chi_Minh' },
  { name:'雅加達', name_s:'雅加达', name_en:'Jakarta', country:'印尼', lat:-6.208, lng:106.846, tz:7, tzName:'Asia/Jakarta' },
  { name:'馬尼拉', name_s:'马尼拉', name_en:'Manila', country:'菲律賓', lat:14.600, lng:120.984, tz:8, tzName:'Asia/Manila' },

  // ══════ 歐美澳 ══════
  { name:'倫敦', name_s:'伦敦', name_en:'London', country:'英國', lat:51.507, lng:-0.128, tz:0, tzName:'Europe/London' },
  { name:'紐約', name_s:'纽约', name_en:'New York', country:'美國', lat:40.713, lng:-74.006, tz:-5, tzName:'America/New_York' },
  { name:'洛杉磯', name_s:'洛杉矶', name_en:'Los Angeles', country:'美國', lat:34.052, lng:-118.244, tz:-8, tzName:'America/Los_Angeles' },
  { name:'舊金山', name_s:'旧金山', name_en:'San Francisco', country:'美國', lat:37.775, lng:-122.419, tz:-8, tzName:'America/Los_Angeles' },
  { name:'溫哥華', name_s:'温哥华', name_en:'Vancouver', country:'加拿大', lat:49.283, lng:-123.121, tz:-8, tzName:'America/Vancouver' },
  { name:'多倫多', name_s:'多伦多', name_en:'Toronto', country:'加拿大', lat:43.653, lng:-79.383, tz:-5, tzName:'America/Toronto' },
  { name:'巴黎', name_s:'巴黎', name_en:'Paris', country:'法國', lat:48.857, lng:2.352, tz:1, tzName:'Europe/Paris' },
  { name:'柏林', name_s:'柏林', name_en:'Berlin', country:'德國', lat:52.520, lng:13.405, tz:1, tzName:'Europe/Berlin' },
  { name:'雪梨', name_s:'悉尼', name_en:'Sydney', country:'澳洲', lat:-33.869, lng:151.209, tz:10, tzName:'Australia/Sydney' },
  { name:'墨爾本', name_s:'墨尔本', name_en:'Melbourne', country:'澳洲', lat:-37.814, lng:144.963, tz:10, tzName:'Australia/Melbourne' },
  { name:'奧克蘭', name_s:'奥克兰', name_en:'Auckland', country:'紐西蘭', lat:-36.848, lng:174.763, tz:12, tzName:'Pacific/Auckland' },
  { name:'杜拜', name_s:'迪拜', name_en:'Dubai', country:'阿聯酋', lat:25.205, lng:55.271, tz:4, tzName:'Asia/Dubai' },
]

// 搜尋城市（支援繁體、簡體、英文）
// v5.2.4：先查原 CITIES（快速選單），不足 8 筆再 fallback 到 500+ 全球庫
export function searchCities(query: string): City[] {
  // v5.3.34：同 searchLocations，防純空白 query 變全量搜尋
  if (!query) return []
  const q = query.toLowerCase().trim()
  if (!q) return []
  const fromLocal = CITIES.filter(c =>
    c.name.includes(q) || c.name_s.includes(q) ||
    c.name_en.toLowerCase().includes(q) || c.country.includes(q)
  )
  const seen = new Set(fromLocal.map(c => `${c.name_en}|${c.country}`))
  const fromGlobal = searchCitiesTz(q, 8)
    .map(adaptCityTz)
    .filter(c => !seen.has(`${c.name_en}|${c.country}`))
  return [...fromLocal, ...fromGlobal].slice(0, 10)
}
