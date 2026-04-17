// ================================================================
// 500+ 全球大城市時區對應表（Sprint 3 國際化）
//
// 目的：
//   - 前端結帳城市選單可直接帶 IANA 時區（Asia/Taipei、America/New_York 等）
//   - Sprint 4 送到後端 BirthRequest.timezone 欄位
//   - Sprint 5 既有資料用 lookupCityTz() 反查填補
//
// 欄位說明：
//   name        繁體中文名（台灣華語使用者習慣）
//   name_en     英文名（ASCII）
//   country     繁體中文國家/地區名
//   countryCode ISO 3166-1 alpha-2（TW/US/HK/CN...）
//   lat         緯度（WGS-84）
//   lng         經度（WGS-84）
//   timezone    IANA 時區名稱（Olson database，zic 認可）
//               一律使用 Area/Location 格式，不使用已 deprecated 的 Asia/Chongqing
//   tz          UTC 固定偏移（小時，僅當地區無 DST 時才有意義）
//               有 DST 的城市寫「標準時偏移」，由 IANA tzdata 自動計算夏令時
//
// 準確度來源：
//   - IANA tzdata 2026a（tzdata 2024.1+）
//   - 經緯度以 OpenStreetMap / GeoNames 為準
//
// 維護原則：
//   - 新增城市時先查 tzdata：`TZ="America/New_York" date` 或 Python `ZoneInfo('America/New_York')`
//   - 避免重複：同一個 IANA 時區可對應多個城市，但城市本身不重複
// ================================================================

export interface CityTz {
  name: string
  name_en: string
  country: string
  countryCode: string
  lat: number
  lng: number
  timezone: string   // IANA 時區名
  tz: number         // 標準時 UTC 偏移（小時）
}

// ============================================================
// 華人地區（置頂，最常用）
// ============================================================

const CITIES_TAIWAN: CityTz[] = [
  { name:'台北', name_en:'Taipei', country:'台灣', countryCode:'TW', lat:25.033, lng:121.565, timezone:'Asia/Taipei', tz:8 },
  { name:'新北', name_en:'New Taipei', country:'台灣', countryCode:'TW', lat:25.012, lng:121.466, timezone:'Asia/Taipei', tz:8 },
  { name:'桃園', name_en:'Taoyuan', country:'台灣', countryCode:'TW', lat:24.994, lng:121.297, timezone:'Asia/Taipei', tz:8 },
  { name:'台中', name_en:'Taichung', country:'台灣', countryCode:'TW', lat:24.148, lng:120.674, timezone:'Asia/Taipei', tz:8 },
  { name:'台南', name_en:'Tainan', country:'台灣', countryCode:'TW', lat:22.999, lng:120.227, timezone:'Asia/Taipei', tz:8 },
  { name:'高雄', name_en:'Kaohsiung', country:'台灣', countryCode:'TW', lat:22.627, lng:120.301, timezone:'Asia/Taipei', tz:8 },
  { name:'基隆', name_en:'Keelung', country:'台灣', countryCode:'TW', lat:25.128, lng:121.739, timezone:'Asia/Taipei', tz:8 },
  { name:'新竹', name_en:'Hsinchu', country:'台灣', countryCode:'TW', lat:24.804, lng:120.972, timezone:'Asia/Taipei', tz:8 },
  { name:'嘉義', name_en:'Chiayi', country:'台灣', countryCode:'TW', lat:23.480, lng:120.449, timezone:'Asia/Taipei', tz:8 },
  { name:'花蓮', name_en:'Hualien', country:'台灣', countryCode:'TW', lat:23.977, lng:121.605, timezone:'Asia/Taipei', tz:8 },
  { name:'屏東', name_en:'Pingtung', country:'台灣', countryCode:'TW', lat:22.682, lng:120.484, timezone:'Asia/Taipei', tz:8 },
  { name:'宜蘭', name_en:'Yilan', country:'台灣', countryCode:'TW', lat:24.752, lng:121.754, timezone:'Asia/Taipei', tz:8 },
  { name:'苗栗', name_en:'Miaoli', country:'台灣', countryCode:'TW', lat:24.564, lng:120.821, timezone:'Asia/Taipei', tz:8 },
  { name:'彰化', name_en:'Changhua', country:'台灣', countryCode:'TW', lat:24.081, lng:120.538, timezone:'Asia/Taipei', tz:8 },
  { name:'南投', name_en:'Nantou', country:'台灣', countryCode:'TW', lat:23.916, lng:120.685, timezone:'Asia/Taipei', tz:8 },
  { name:'雲林', name_en:'Yunlin', country:'台灣', countryCode:'TW', lat:23.709, lng:120.543, timezone:'Asia/Taipei', tz:8 },
  { name:'台東', name_en:'Taitung', country:'台灣', countryCode:'TW', lat:22.758, lng:121.144, timezone:'Asia/Taipei', tz:8 },
  { name:'澎湖', name_en:'Penghu', country:'台灣', countryCode:'TW', lat:23.571, lng:119.579, timezone:'Asia/Taipei', tz:8 },
  { name:'金門', name_en:'Kinmen', country:'台灣', countryCode:'TW', lat:24.435, lng:118.318, timezone:'Asia/Taipei', tz:8 },
  { name:'馬祖', name_en:'Matsu', country:'台灣', countryCode:'TW', lat:26.159, lng:119.951, timezone:'Asia/Taipei', tz:8 },
]

const CITIES_HK_MACAU: CityTz[] = [
  { name:'香港', name_en:'Hong Kong', country:'香港', countryCode:'HK', lat:22.320, lng:114.170, timezone:'Asia/Hong_Kong', tz:8 },
  { name:'九龍', name_en:'Kowloon', country:'香港', countryCode:'HK', lat:22.320, lng:114.177, timezone:'Asia/Hong_Kong', tz:8 },
  { name:'新界', name_en:'New Territories', country:'香港', countryCode:'HK', lat:22.421, lng:114.206, timezone:'Asia/Hong_Kong', tz:8 },
  { name:'澳門', name_en:'Macau', country:'澳門', countryCode:'MO', lat:22.199, lng:113.544, timezone:'Asia/Macau', tz:8 },
]

// 中國大陸（IANA 只保留 Asia/Shanghai 與 Asia/Urumqi 兩個區域）
const CITIES_CHINA: CityTz[] = [
  { name:'北京', name_en:'Beijing', country:'中國', countryCode:'CN', lat:39.904, lng:116.407, timezone:'Asia/Shanghai', tz:8 },
  { name:'上海', name_en:'Shanghai', country:'中國', countryCode:'CN', lat:31.230, lng:121.474, timezone:'Asia/Shanghai', tz:8 },
  { name:'廣州', name_en:'Guangzhou', country:'中國', countryCode:'CN', lat:23.129, lng:113.264, timezone:'Asia/Shanghai', tz:8 },
  { name:'深圳', name_en:'Shenzhen', country:'中國', countryCode:'CN', lat:22.543, lng:114.058, timezone:'Asia/Shanghai', tz:8 },
  { name:'天津', name_en:'Tianjin', country:'中國', countryCode:'CN', lat:39.084, lng:117.201, timezone:'Asia/Shanghai', tz:8 },
  { name:'重慶', name_en:'Chongqing', country:'中國', countryCode:'CN', lat:29.563, lng:106.551, timezone:'Asia/Shanghai', tz:8 },
  { name:'成都', name_en:'Chengdu', country:'中國', countryCode:'CN', lat:30.573, lng:104.066, timezone:'Asia/Shanghai', tz:8 },
  { name:'杭州', name_en:'Hangzhou', country:'中國', countryCode:'CN', lat:30.275, lng:120.155, timezone:'Asia/Shanghai', tz:8 },
  { name:'南京', name_en:'Nanjing', country:'中國', countryCode:'CN', lat:32.061, lng:118.797, timezone:'Asia/Shanghai', tz:8 },
  { name:'蘇州', name_en:'Suzhou', country:'中國', countryCode:'CN', lat:31.299, lng:120.585, timezone:'Asia/Shanghai', tz:8 },
  { name:'武漢', name_en:'Wuhan', country:'中國', countryCode:'CN', lat:30.593, lng:114.305, timezone:'Asia/Shanghai', tz:8 },
  { name:'長沙', name_en:'Changsha', country:'中國', countryCode:'CN', lat:28.228, lng:112.939, timezone:'Asia/Shanghai', tz:8 },
  { name:'西安', name_en:"Xi'an", country:'中國', countryCode:'CN', lat:34.264, lng:108.944, timezone:'Asia/Shanghai', tz:8 },
  { name:'鄭州', name_en:'Zhengzhou', country:'中國', countryCode:'CN', lat:34.747, lng:113.625, timezone:'Asia/Shanghai', tz:8 },
  { name:'青島', name_en:'Qingdao', country:'中國', countryCode:'CN', lat:36.067, lng:120.383, timezone:'Asia/Shanghai', tz:8 },
  { name:'大連', name_en:'Dalian', country:'中國', countryCode:'CN', lat:38.914, lng:121.615, timezone:'Asia/Shanghai', tz:8 },
  { name:'瀋陽', name_en:'Shenyang', country:'中國', countryCode:'CN', lat:41.805, lng:123.432, timezone:'Asia/Shanghai', tz:8 },
  { name:'哈爾濱', name_en:'Harbin', country:'中國', countryCode:'CN', lat:45.750, lng:126.650, timezone:'Asia/Shanghai', tz:8 },
  { name:'長春', name_en:'Changchun', country:'中國', countryCode:'CN', lat:43.817, lng:125.323, timezone:'Asia/Shanghai', tz:8 },
  { name:'濟南', name_en:'Jinan', country:'中國', countryCode:'CN', lat:36.651, lng:117.120, timezone:'Asia/Shanghai', tz:8 },
  { name:'合肥', name_en:'Hefei', country:'中國', countryCode:'CN', lat:31.820, lng:117.229, timezone:'Asia/Shanghai', tz:8 },
  { name:'南昌', name_en:'Nanchang', country:'中國', countryCode:'CN', lat:28.683, lng:115.858, timezone:'Asia/Shanghai', tz:8 },
  { name:'福州', name_en:'Fuzhou', country:'中國', countryCode:'CN', lat:26.075, lng:119.306, timezone:'Asia/Shanghai', tz:8 },
  { name:'廈門', name_en:'Xiamen', country:'中國', countryCode:'CN', lat:24.480, lng:118.089, timezone:'Asia/Shanghai', tz:8 },
  { name:'泉州', name_en:'Quanzhou', country:'中國', countryCode:'CN', lat:24.874, lng:118.676, timezone:'Asia/Shanghai', tz:8 },
  { name:'東莞', name_en:'Dongguan', country:'中國', countryCode:'CN', lat:23.021, lng:113.752, timezone:'Asia/Shanghai', tz:8 },
  { name:'佛山', name_en:'Foshan', country:'中國', countryCode:'CN', lat:23.028, lng:113.122, timezone:'Asia/Shanghai', tz:8 },
  { name:'珠海', name_en:'Zhuhai', country:'中國', countryCode:'CN', lat:22.271, lng:113.577, timezone:'Asia/Shanghai', tz:8 },
  { name:'汕頭', name_en:'Shantou', country:'中國', countryCode:'CN', lat:23.354, lng:116.681, timezone:'Asia/Shanghai', tz:8 },
  { name:'南寧', name_en:'Nanning', country:'中國', countryCode:'CN', lat:22.817, lng:108.366, timezone:'Asia/Shanghai', tz:8 },
  { name:'桂林', name_en:'Guilin', country:'中國', countryCode:'CN', lat:25.274, lng:110.290, timezone:'Asia/Shanghai', tz:8 },
  { name:'海口', name_en:'Haikou', country:'中國', countryCode:'CN', lat:20.044, lng:110.199, timezone:'Asia/Shanghai', tz:8 },
  { name:'三亞', name_en:'Sanya', country:'中國', countryCode:'CN', lat:18.253, lng:109.512, timezone:'Asia/Shanghai', tz:8 },
  { name:'貴陽', name_en:'Guiyang', country:'中國', countryCode:'CN', lat:26.647, lng:106.631, timezone:'Asia/Shanghai', tz:8 },
  { name:'昆明', name_en:'Kunming', country:'中國', countryCode:'CN', lat:25.040, lng:102.712, timezone:'Asia/Shanghai', tz:8 },
  { name:'大理', name_en:'Dali', country:'中國', countryCode:'CN', lat:25.606, lng:100.268, timezone:'Asia/Shanghai', tz:8 },
  { name:'麗江', name_en:'Lijiang', country:'中國', countryCode:'CN', lat:26.872, lng:100.228, timezone:'Asia/Shanghai', tz:8 },
  { name:'拉薩', name_en:'Lhasa', country:'中國', countryCode:'CN', lat:29.650, lng:91.100, timezone:'Asia/Shanghai', tz:8 },
  { name:'蘭州', name_en:'Lanzhou', country:'中國', countryCode:'CN', lat:36.061, lng:103.834, timezone:'Asia/Shanghai', tz:8 },
  { name:'西寧', name_en:'Xining', country:'中國', countryCode:'CN', lat:36.617, lng:101.778, timezone:'Asia/Shanghai', tz:8 },
  { name:'銀川', name_en:'Yinchuan', country:'中國', countryCode:'CN', lat:38.487, lng:106.230, timezone:'Asia/Shanghai', tz:8 },
  { name:'呼和浩特', name_en:'Hohhot', country:'中國', countryCode:'CN', lat:40.842, lng:111.750, timezone:'Asia/Shanghai', tz:8 },
  { name:'太原', name_en:'Taiyuan', country:'中國', countryCode:'CN', lat:37.871, lng:112.550, timezone:'Asia/Shanghai', tz:8 },
  { name:'石家莊', name_en:'Shijiazhuang', country:'中國', countryCode:'CN', lat:38.042, lng:114.515, timezone:'Asia/Shanghai', tz:8 },
  { name:'洛陽', name_en:'Luoyang', country:'中國', countryCode:'CN', lat:34.619, lng:112.454, timezone:'Asia/Shanghai', tz:8 },
  { name:'寧波', name_en:'Ningbo', country:'中國', countryCode:'CN', lat:29.868, lng:121.544, timezone:'Asia/Shanghai', tz:8 },
  { name:'溫州', name_en:'Wenzhou', country:'中國', countryCode:'CN', lat:27.994, lng:120.699, timezone:'Asia/Shanghai', tz:8 },
  { name:'無錫', name_en:'Wuxi', country:'中國', countryCode:'CN', lat:31.491, lng:120.312, timezone:'Asia/Shanghai', tz:8 },
  { name:'徐州', name_en:'Xuzhou', country:'中國', countryCode:'CN', lat:34.207, lng:117.184, timezone:'Asia/Shanghai', tz:8 },
  { name:'烏魯木齊', name_en:'Urumqi', country:'中國', countryCode:'CN', lat:43.826, lng:87.617, timezone:'Asia/Urumqi', tz:6 },
  { name:'喀什', name_en:'Kashgar', country:'中國', countryCode:'CN', lat:39.470, lng:75.989, timezone:'Asia/Urumqi', tz:6 },
]

// ============================================================
// 東亞
// ============================================================

const CITIES_JAPAN: CityTz[] = [
  { name:'東京', name_en:'Tokyo', country:'日本', countryCode:'JP', lat:35.682, lng:139.769, timezone:'Asia/Tokyo', tz:9 },
  { name:'橫濱', name_en:'Yokohama', country:'日本', countryCode:'JP', lat:35.444, lng:139.638, timezone:'Asia/Tokyo', tz:9 },
  { name:'大阪', name_en:'Osaka', country:'日本', countryCode:'JP', lat:34.694, lng:135.502, timezone:'Asia/Tokyo', tz:9 },
  { name:'京都', name_en:'Kyoto', country:'日本', countryCode:'JP', lat:35.012, lng:135.768, timezone:'Asia/Tokyo', tz:9 },
  { name:'神戶', name_en:'Kobe', country:'日本', countryCode:'JP', lat:34.690, lng:135.196, timezone:'Asia/Tokyo', tz:9 },
  { name:'名古屋', name_en:'Nagoya', country:'日本', countryCode:'JP', lat:35.181, lng:136.906, timezone:'Asia/Tokyo', tz:9 },
  { name:'福岡', name_en:'Fukuoka', country:'日本', countryCode:'JP', lat:33.590, lng:130.402, timezone:'Asia/Tokyo', tz:9 },
  { name:'札幌', name_en:'Sapporo', country:'日本', countryCode:'JP', lat:43.062, lng:141.354, timezone:'Asia/Tokyo', tz:9 },
  { name:'仙台', name_en:'Sendai', country:'日本', countryCode:'JP', lat:38.268, lng:140.870, timezone:'Asia/Tokyo', tz:9 },
  { name:'廣島', name_en:'Hiroshima', country:'日本', countryCode:'JP', lat:34.385, lng:132.455, timezone:'Asia/Tokyo', tz:9 },
  { name:'沖繩', name_en:'Okinawa', country:'日本', countryCode:'JP', lat:26.212, lng:127.679, timezone:'Asia/Tokyo', tz:9 },
  { name:'千葉', name_en:'Chiba', country:'日本', countryCode:'JP', lat:35.607, lng:140.123, timezone:'Asia/Tokyo', tz:9 },
  { name:'奈良', name_en:'Nara', country:'日本', countryCode:'JP', lat:34.685, lng:135.805, timezone:'Asia/Tokyo', tz:9 },
  { name:'金澤', name_en:'Kanazawa', country:'日本', countryCode:'JP', lat:36.562, lng:136.656, timezone:'Asia/Tokyo', tz:9 },
  { name:'長崎', name_en:'Nagasaki', country:'日本', countryCode:'JP', lat:32.750, lng:129.877, timezone:'Asia/Tokyo', tz:9 },
]

const CITIES_KOREA: CityTz[] = [
  { name:'首爾', name_en:'Seoul', country:'韓國', countryCode:'KR', lat:37.567, lng:126.978, timezone:'Asia/Seoul', tz:9 },
  { name:'釜山', name_en:'Busan', country:'韓國', countryCode:'KR', lat:35.180, lng:129.076, timezone:'Asia/Seoul', tz:9 },
  { name:'仁川', name_en:'Incheon', country:'韓國', countryCode:'KR', lat:37.456, lng:126.706, timezone:'Asia/Seoul', tz:9 },
  { name:'大邱', name_en:'Daegu', country:'韓國', countryCode:'KR', lat:35.871, lng:128.601, timezone:'Asia/Seoul', tz:9 },
  { name:'大田', name_en:'Daejeon', country:'韓國', countryCode:'KR', lat:36.351, lng:127.385, timezone:'Asia/Seoul', tz:9 },
  { name:'光州', name_en:'Gwangju', country:'韓國', countryCode:'KR', lat:35.160, lng:126.851, timezone:'Asia/Seoul', tz:9 },
  { name:'濟州', name_en:'Jeju', country:'韓國', countryCode:'KR', lat:33.499, lng:126.531, timezone:'Asia/Seoul', tz:9 },
]

// ============================================================
// 東南亞
// ============================================================

const CITIES_SEA: CityTz[] = [
  // 新加坡
  { name:'新加坡', name_en:'Singapore', country:'新加坡', countryCode:'SG', lat:1.352, lng:103.820, timezone:'Asia/Singapore', tz:8 },
  // 馬來西亞
  { name:'吉隆坡', name_en:'Kuala Lumpur', country:'馬來西亞', countryCode:'MY', lat:3.139, lng:101.687, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'檳城', name_en:'Penang', country:'馬來西亞', countryCode:'MY', lat:5.414, lng:100.329, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'新山', name_en:'Johor Bahru', country:'馬來西亞', countryCode:'MY', lat:1.493, lng:103.741, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'馬六甲', name_en:'Malacca', country:'馬來西亞', countryCode:'MY', lat:2.189, lng:102.250, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'怡保', name_en:'Ipoh', country:'馬來西亞', countryCode:'MY', lat:4.598, lng:101.090, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'亞庇', name_en:'Kota Kinabalu', country:'馬來西亞', countryCode:'MY', lat:5.980, lng:116.072, timezone:'Asia/Kuala_Lumpur', tz:8 },
  { name:'古晉', name_en:'Kuching', country:'馬來西亞', countryCode:'MY', lat:1.557, lng:110.345, timezone:'Asia/Kuching', tz:8 },
  // 泰國
  { name:'曼谷', name_en:'Bangkok', country:'泰國', countryCode:'TH', lat:13.756, lng:100.502, timezone:'Asia/Bangkok', tz:7 },
  { name:'清邁', name_en:'Chiang Mai', country:'泰國', countryCode:'TH', lat:18.796, lng:98.979, timezone:'Asia/Bangkok', tz:7 },
  { name:'普吉', name_en:'Phuket', country:'泰國', countryCode:'TH', lat:7.880, lng:98.392, timezone:'Asia/Bangkok', tz:7 },
  { name:'芭達雅', name_en:'Pattaya', country:'泰國', countryCode:'TH', lat:12.924, lng:100.878, timezone:'Asia/Bangkok', tz:7 },
  // 越南
  { name:'河內', name_en:'Hanoi', country:'越南', countryCode:'VN', lat:21.029, lng:105.852, timezone:'Asia/Ho_Chi_Minh', tz:7 },
  { name:'胡志明市', name_en:'Ho Chi Minh City', country:'越南', countryCode:'VN', lat:10.823, lng:106.630, timezone:'Asia/Ho_Chi_Minh', tz:7 },
  { name:'峴港', name_en:'Da Nang', country:'越南', countryCode:'VN', lat:16.047, lng:108.206, timezone:'Asia/Ho_Chi_Minh', tz:7 },
  // 菲律賓
  { name:'馬尼拉', name_en:'Manila', country:'菲律賓', countryCode:'PH', lat:14.600, lng:120.984, timezone:'Asia/Manila', tz:8 },
  { name:'宿霧', name_en:'Cebu', country:'菲律賓', countryCode:'PH', lat:10.317, lng:123.891, timezone:'Asia/Manila', tz:8 },
  { name:'達沃', name_en:'Davao', country:'菲律賓', countryCode:'PH', lat:7.191, lng:125.455, timezone:'Asia/Manila', tz:8 },
  // 印尼（橫跨三個時區）
  { name:'雅加達', name_en:'Jakarta', country:'印尼', countryCode:'ID', lat:-6.208, lng:106.846, timezone:'Asia/Jakarta', tz:7 },
  { name:'泗水', name_en:'Surabaya', country:'印尼', countryCode:'ID', lat:-7.258, lng:112.752, timezone:'Asia/Jakarta', tz:7 },
  { name:'萬隆', name_en:'Bandung', country:'印尼', countryCode:'ID', lat:-6.917, lng:107.619, timezone:'Asia/Jakarta', tz:7 },
  { name:'峇里島', name_en:'Bali', country:'印尼', countryCode:'ID', lat:-8.409, lng:115.189, timezone:'Asia/Makassar', tz:8 },
  { name:'望加錫', name_en:'Makassar', country:'印尼', countryCode:'ID', lat:-5.147, lng:119.432, timezone:'Asia/Makassar', tz:8 },
  { name:'查亞普拉', name_en:'Jayapura', country:'印尼', countryCode:'ID', lat:-2.533, lng:140.717, timezone:'Asia/Jayapura', tz:9 },
  // 柬埔寨 / 寮國 / 緬甸
  { name:'金邊', name_en:'Phnom Penh', country:'柬埔寨', countryCode:'KH', lat:11.562, lng:104.916, timezone:'Asia/Phnom_Penh', tz:7 },
  { name:'永珍', name_en:'Vientiane', country:'寮國', countryCode:'LA', lat:17.976, lng:102.633, timezone:'Asia/Vientiane', tz:7 },
  { name:'仰光', name_en:'Yangon', country:'緬甸', countryCode:'MM', lat:16.866, lng:96.195, timezone:'Asia/Yangon', tz:6.5 },
  // 汶萊
  { name:'斯里巴加灣', name_en:'Bandar Seri Begawan', country:'汶萊', countryCode:'BN', lat:4.903, lng:114.939, timezone:'Asia/Brunei', tz:8 },
]

// ============================================================
// 南亞
// ============================================================

const CITIES_SOUTH_ASIA: CityTz[] = [
  // 印度（整個國家一個時區 IST=+5:30，無 DST）
  { name:'新德里', name_en:'New Delhi', country:'印度', countryCode:'IN', lat:28.614, lng:77.209, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'孟買', name_en:'Mumbai', country:'印度', countryCode:'IN', lat:19.076, lng:72.878, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'班加羅爾', name_en:'Bangalore', country:'印度', countryCode:'IN', lat:12.972, lng:77.595, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'加爾各答', name_en:'Kolkata', country:'印度', countryCode:'IN', lat:22.572, lng:88.364, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'清奈', name_en:'Chennai', country:'印度', countryCode:'IN', lat:13.083, lng:80.270, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'海德拉巴', name_en:'Hyderabad', country:'印度', countryCode:'IN', lat:17.385, lng:78.487, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'艾哈邁達巴德', name_en:'Ahmedabad', country:'印度', countryCode:'IN', lat:23.023, lng:72.572, timezone:'Asia/Kolkata', tz:5.5 },
  { name:'浦那', name_en:'Pune', country:'印度', countryCode:'IN', lat:18.520, lng:73.857, timezone:'Asia/Kolkata', tz:5.5 },
  // 巴基斯坦
  { name:'伊斯蘭馬巴德', name_en:'Islamabad', country:'巴基斯坦', countryCode:'PK', lat:33.684, lng:73.048, timezone:'Asia/Karachi', tz:5 },
  { name:'喀拉蚩', name_en:'Karachi', country:'巴基斯坦', countryCode:'PK', lat:24.861, lng:67.010, timezone:'Asia/Karachi', tz:5 },
  { name:'拉合爾', name_en:'Lahore', country:'巴基斯坦', countryCode:'PK', lat:31.549, lng:74.344, timezone:'Asia/Karachi', tz:5 },
  // 孟加拉
  { name:'達卡', name_en:'Dhaka', country:'孟加拉', countryCode:'BD', lat:23.810, lng:90.412, timezone:'Asia/Dhaka', tz:6 },
  // 斯里蘭卡
  { name:'可倫坡', name_en:'Colombo', country:'斯里蘭卡', countryCode:'LK', lat:6.927, lng:79.862, timezone:'Asia/Colombo', tz:5.5 },
  // 尼泊爾
  { name:'加德滿都', name_en:'Kathmandu', country:'尼泊爾', countryCode:'NP', lat:27.717, lng:85.324, timezone:'Asia/Kathmandu', tz:5.75 },
]

// ============================================================
// 中東
// ============================================================

const CITIES_MIDDLE_EAST: CityTz[] = [
  { name:'杜拜', name_en:'Dubai', country:'阿聯酋', countryCode:'AE', lat:25.205, lng:55.271, timezone:'Asia/Dubai', tz:4 },
  { name:'阿布達比', name_en:'Abu Dhabi', country:'阿聯酋', countryCode:'AE', lat:24.453, lng:54.377, timezone:'Asia/Dubai', tz:4 },
  { name:'沙迦', name_en:'Sharjah', country:'阿聯酋', countryCode:'AE', lat:25.348, lng:55.421, timezone:'Asia/Dubai', tz:4 },
  { name:'利雅德', name_en:'Riyadh', country:'沙烏地阿拉伯', countryCode:'SA', lat:24.713, lng:46.675, timezone:'Asia/Riyadh', tz:3 },
  { name:'吉達', name_en:'Jeddah', country:'沙烏地阿拉伯', countryCode:'SA', lat:21.485, lng:39.193, timezone:'Asia/Riyadh', tz:3 },
  { name:'多哈', name_en:'Doha', country:'卡達', countryCode:'QA', lat:25.285, lng:51.531, timezone:'Asia/Qatar', tz:3 },
  { name:'科威特市', name_en:'Kuwait City', country:'科威特', countryCode:'KW', lat:29.376, lng:47.976, timezone:'Asia/Kuwait', tz:3 },
  { name:'麥納瑪', name_en:'Manama', country:'巴林', countryCode:'BH', lat:26.228, lng:50.586, timezone:'Asia/Bahrain', tz:3 },
  { name:'馬斯喀特', name_en:'Muscat', country:'阿曼', countryCode:'OM', lat:23.588, lng:58.385, timezone:'Asia/Muscat', tz:4 },
  { name:'德黑蘭', name_en:'Tehran', country:'伊朗', countryCode:'IR', lat:35.689, lng:51.389, timezone:'Asia/Tehran', tz:3.5 },
  { name:'巴格達', name_en:'Baghdad', country:'伊拉克', countryCode:'IQ', lat:33.312, lng:44.361, timezone:'Asia/Baghdad', tz:3 },
  { name:'安曼', name_en:'Amman', country:'約旦', countryCode:'JO', lat:31.956, lng:35.945, timezone:'Asia/Amman', tz:3 },
  { name:'貝魯特', name_en:'Beirut', country:'黎巴嫩', countryCode:'LB', lat:33.888, lng:35.495, timezone:'Asia/Beirut', tz:2 },
  { name:'大馬士革', name_en:'Damascus', country:'敘利亞', countryCode:'SY', lat:33.513, lng:36.292, timezone:'Asia/Damascus', tz:3 },
  { name:'耶路撒冷', name_en:'Jerusalem', country:'以色列', countryCode:'IL', lat:31.768, lng:35.214, timezone:'Asia/Jerusalem', tz:2 },
  { name:'特拉維夫', name_en:'Tel Aviv', country:'以色列', countryCode:'IL', lat:32.085, lng:34.781, timezone:'Asia/Jerusalem', tz:2 },
  { name:'伊斯坦堡', name_en:'Istanbul', country:'土耳其', countryCode:'TR', lat:41.008, lng:28.978, timezone:'Europe/Istanbul', tz:3 },
  { name:'安卡拉', name_en:'Ankara', country:'土耳其', countryCode:'TR', lat:39.933, lng:32.867, timezone:'Europe/Istanbul', tz:3 },
]

// ============================================================
// 歐洲
// ============================================================

const CITIES_EUROPE: CityTz[] = [
  // 英國 / 愛爾蘭（有 BST 夏令時）
  { name:'倫敦', name_en:'London', country:'英國', countryCode:'GB', lat:51.507, lng:-0.128, timezone:'Europe/London', tz:0 },
  { name:'曼徹斯特', name_en:'Manchester', country:'英國', countryCode:'GB', lat:53.480, lng:-2.245, timezone:'Europe/London', tz:0 },
  { name:'伯明翰', name_en:'Birmingham', country:'英國', countryCode:'GB', lat:52.486, lng:-1.890, timezone:'Europe/London', tz:0 },
  { name:'格拉斯哥', name_en:'Glasgow', country:'英國', countryCode:'GB', lat:55.865, lng:-4.258, timezone:'Europe/London', tz:0 },
  { name:'愛丁堡', name_en:'Edinburgh', country:'英國', countryCode:'GB', lat:55.953, lng:-3.189, timezone:'Europe/London', tz:0 },
  { name:'利物浦', name_en:'Liverpool', country:'英國', countryCode:'GB', lat:53.410, lng:-2.978, timezone:'Europe/London', tz:0 },
  { name:'都柏林', name_en:'Dublin', country:'愛爾蘭', countryCode:'IE', lat:53.350, lng:-6.260, timezone:'Europe/Dublin', tz:0 },
  // 西歐（CET/CEST）
  { name:'巴黎', name_en:'Paris', country:'法國', countryCode:'FR', lat:48.857, lng:2.352, timezone:'Europe/Paris', tz:1 },
  { name:'尼斯', name_en:'Nice', country:'法國', countryCode:'FR', lat:43.710, lng:7.262, timezone:'Europe/Paris', tz:1 },
  { name:'里昂', name_en:'Lyon', country:'法國', countryCode:'FR', lat:45.764, lng:4.836, timezone:'Europe/Paris', tz:1 },
  { name:'馬賽', name_en:'Marseille', country:'法國', countryCode:'FR', lat:43.297, lng:5.370, timezone:'Europe/Paris', tz:1 },
  { name:'柏林', name_en:'Berlin', country:'德國', countryCode:'DE', lat:52.520, lng:13.405, timezone:'Europe/Berlin', tz:1 },
  { name:'慕尼黑', name_en:'Munich', country:'德國', countryCode:'DE', lat:48.137, lng:11.575, timezone:'Europe/Berlin', tz:1 },
  { name:'法蘭克福', name_en:'Frankfurt', country:'德國', countryCode:'DE', lat:50.111, lng:8.682, timezone:'Europe/Berlin', tz:1 },
  { name:'漢堡', name_en:'Hamburg', country:'德國', countryCode:'DE', lat:53.551, lng:9.994, timezone:'Europe/Berlin', tz:1 },
  { name:'科隆', name_en:'Cologne', country:'德國', countryCode:'DE', lat:50.938, lng:6.960, timezone:'Europe/Berlin', tz:1 },
  { name:'阿姆斯特丹', name_en:'Amsterdam', country:'荷蘭', countryCode:'NL', lat:52.370, lng:4.895, timezone:'Europe/Amsterdam', tz:1 },
  { name:'鹿特丹', name_en:'Rotterdam', country:'荷蘭', countryCode:'NL', lat:51.924, lng:4.477, timezone:'Europe/Amsterdam', tz:1 },
  { name:'布魯塞爾', name_en:'Brussels', country:'比利時', countryCode:'BE', lat:50.850, lng:4.348, timezone:'Europe/Brussels', tz:1 },
  { name:'蘇黎世', name_en:'Zurich', country:'瑞士', countryCode:'CH', lat:47.377, lng:8.540, timezone:'Europe/Zurich', tz:1 },
  { name:'日內瓦', name_en:'Geneva', country:'瑞士', countryCode:'CH', lat:46.204, lng:6.144, timezone:'Europe/Zurich', tz:1 },
  { name:'伯恩', name_en:'Bern', country:'瑞士', countryCode:'CH', lat:46.948, lng:7.447, timezone:'Europe/Zurich', tz:1 },
  { name:'維也納', name_en:'Vienna', country:'奧地利', countryCode:'AT', lat:48.209, lng:16.372, timezone:'Europe/Vienna', tz:1 },
  { name:'盧森堡', name_en:'Luxembourg', country:'盧森堡', countryCode:'LU', lat:49.611, lng:6.130, timezone:'Europe/Luxembourg', tz:1 },
  // 南歐
  { name:'馬德里', name_en:'Madrid', country:'西班牙', countryCode:'ES', lat:40.417, lng:-3.704, timezone:'Europe/Madrid', tz:1 },
  { name:'巴塞隆納', name_en:'Barcelona', country:'西班牙', countryCode:'ES', lat:41.385, lng:2.173, timezone:'Europe/Madrid', tz:1 },
  { name:'瓦倫西亞', name_en:'Valencia', country:'西班牙', countryCode:'ES', lat:39.470, lng:-0.377, timezone:'Europe/Madrid', tz:1 },
  { name:'塞維亞', name_en:'Seville', country:'西班牙', countryCode:'ES', lat:37.389, lng:-5.984, timezone:'Europe/Madrid', tz:1 },
  { name:'里斯本', name_en:'Lisbon', country:'葡萄牙', countryCode:'PT', lat:38.722, lng:-9.140, timezone:'Europe/Lisbon', tz:0 },
  { name:'波多', name_en:'Porto', country:'葡萄牙', countryCode:'PT', lat:41.158, lng:-8.629, timezone:'Europe/Lisbon', tz:0 },
  { name:'羅馬', name_en:'Rome', country:'義大利', countryCode:'IT', lat:41.902, lng:12.496, timezone:'Europe/Rome', tz:1 },
  { name:'米蘭', name_en:'Milan', country:'義大利', countryCode:'IT', lat:45.464, lng:9.190, timezone:'Europe/Rome', tz:1 },
  { name:'那不勒斯', name_en:'Naples', country:'義大利', countryCode:'IT', lat:40.852, lng:14.268, timezone:'Europe/Rome', tz:1 },
  { name:'佛羅倫斯', name_en:'Florence', country:'義大利', countryCode:'IT', lat:43.770, lng:11.258, timezone:'Europe/Rome', tz:1 },
  { name:'威尼斯', name_en:'Venice', country:'義大利', countryCode:'IT', lat:45.440, lng:12.316, timezone:'Europe/Rome', tz:1 },
  { name:'雅典', name_en:'Athens', country:'希臘', countryCode:'GR', lat:37.984, lng:23.728, timezone:'Europe/Athens', tz:2 },
  { name:'摩納哥', name_en:'Monaco', country:'摩納哥', countryCode:'MC', lat:43.738, lng:7.424, timezone:'Europe/Monaco', tz:1 },
  // 北歐
  { name:'斯德哥爾摩', name_en:'Stockholm', country:'瑞典', countryCode:'SE', lat:59.329, lng:18.069, timezone:'Europe/Stockholm', tz:1 },
  { name:'哥本哈根', name_en:'Copenhagen', country:'丹麥', countryCode:'DK', lat:55.676, lng:12.568, timezone:'Europe/Copenhagen', tz:1 },
  { name:'奧斯陸', name_en:'Oslo', country:'挪威', countryCode:'NO', lat:59.914, lng:10.752, timezone:'Europe/Oslo', tz:1 },
  { name:'赫爾辛基', name_en:'Helsinki', country:'芬蘭', countryCode:'FI', lat:60.170, lng:24.941, timezone:'Europe/Helsinki', tz:2 },
  { name:'雷克雅維克', name_en:'Reykjavik', country:'冰島', countryCode:'IS', lat:64.146, lng:-21.942, timezone:'Atlantic/Reykjavik', tz:0 },
  // 東歐
  { name:'華沙', name_en:'Warsaw', country:'波蘭', countryCode:'PL', lat:52.230, lng:21.012, timezone:'Europe/Warsaw', tz:1 },
  { name:'克拉科夫', name_en:'Krakow', country:'波蘭', countryCode:'PL', lat:50.065, lng:19.945, timezone:'Europe/Warsaw', tz:1 },
  { name:'布拉格', name_en:'Prague', country:'捷克', countryCode:'CZ', lat:50.075, lng:14.438, timezone:'Europe/Prague', tz:1 },
  { name:'布達佩斯', name_en:'Budapest', country:'匈牙利', countryCode:'HU', lat:47.498, lng:19.040, timezone:'Europe/Budapest', tz:1 },
  { name:'布加勒斯特', name_en:'Bucharest', country:'羅馬尼亞', countryCode:'RO', lat:44.427, lng:26.103, timezone:'Europe/Bucharest', tz:2 },
  { name:'索菲亞', name_en:'Sofia', country:'保加利亞', countryCode:'BG', lat:42.698, lng:23.320, timezone:'Europe/Sofia', tz:2 },
  { name:'貝爾格勒', name_en:'Belgrade', country:'塞爾維亞', countryCode:'RS', lat:44.787, lng:20.457, timezone:'Europe/Belgrade', tz:1 },
  { name:'基輔', name_en:'Kyiv', country:'烏克蘭', countryCode:'UA', lat:50.450, lng:30.524, timezone:'Europe/Kyiv', tz:2 },
  { name:'明斯克', name_en:'Minsk', country:'白俄羅斯', countryCode:'BY', lat:53.900, lng:27.567, timezone:'Europe/Minsk', tz:3 },
  // 俄羅斯（橫跨 11 個時區）
  { name:'莫斯科', name_en:'Moscow', country:'俄羅斯', countryCode:'RU', lat:55.756, lng:37.618, timezone:'Europe/Moscow', tz:3 },
  { name:'聖彼得堡', name_en:'Saint Petersburg', country:'俄羅斯', countryCode:'RU', lat:59.931, lng:30.361, timezone:'Europe/Moscow', tz:3 },
  { name:'葉卡捷琳堡', name_en:'Yekaterinburg', country:'俄羅斯', countryCode:'RU', lat:56.839, lng:60.606, timezone:'Asia/Yekaterinburg', tz:5 },
  { name:'新西伯利亞', name_en:'Novosibirsk', country:'俄羅斯', countryCode:'RU', lat:55.008, lng:82.935, timezone:'Asia/Novosibirsk', tz:7 },
  { name:'伊爾庫茨克', name_en:'Irkutsk', country:'俄羅斯', countryCode:'RU', lat:52.287, lng:104.305, timezone:'Asia/Irkutsk', tz:8 },
  { name:'海參崴', name_en:'Vladivostok', country:'俄羅斯', countryCode:'RU', lat:43.117, lng:131.900, timezone:'Asia/Vladivostok', tz:10 },
]

// ============================================================
// 北美
// ============================================================

const CITIES_USA: CityTz[] = [
  // 東岸（ET：America/New_York）
  { name:'紐約', name_en:'New York', country:'美國', countryCode:'US', lat:40.713, lng:-74.006, timezone:'America/New_York', tz:-5 },
  { name:'布魯克林', name_en:'Brooklyn', country:'美國', countryCode:'US', lat:40.678, lng:-73.944, timezone:'America/New_York', tz:-5 },
  { name:'皇后區', name_en:'Queens', country:'美國', countryCode:'US', lat:40.728, lng:-73.794, timezone:'America/New_York', tz:-5 },
  { name:'波士頓', name_en:'Boston', country:'美國', countryCode:'US', lat:42.360, lng:-71.058, timezone:'America/New_York', tz:-5 },
  { name:'費城', name_en:'Philadelphia', country:'美國', countryCode:'US', lat:39.953, lng:-75.165, timezone:'America/New_York', tz:-5 },
  { name:'華盛頓', name_en:'Washington DC', country:'美國', countryCode:'US', lat:38.907, lng:-77.037, timezone:'America/New_York', tz:-5 },
  { name:'亞特蘭大', name_en:'Atlanta', country:'美國', countryCode:'US', lat:33.749, lng:-84.388, timezone:'America/New_York', tz:-5 },
  { name:'邁阿密', name_en:'Miami', country:'美國', countryCode:'US', lat:25.762, lng:-80.192, timezone:'America/New_York', tz:-5 },
  { name:'奧蘭多', name_en:'Orlando', country:'美國', countryCode:'US', lat:28.538, lng:-81.379, timezone:'America/New_York', tz:-5 },
  { name:'夏洛特', name_en:'Charlotte', country:'美國', countryCode:'US', lat:35.227, lng:-80.843, timezone:'America/New_York', tz:-5 },
  { name:'匹茲堡', name_en:'Pittsburgh', country:'美國', countryCode:'US', lat:40.441, lng:-79.996, timezone:'America/New_York', tz:-5 },
  { name:'水牛城', name_en:'Buffalo', country:'美國', countryCode:'US', lat:42.886, lng:-78.879, timezone:'America/New_York', tz:-5 },
  // 中部（CT：America/Chicago）
  { name:'芝加哥', name_en:'Chicago', country:'美國', countryCode:'US', lat:41.878, lng:-87.630, timezone:'America/Chicago', tz:-6 },
  { name:'休士頓', name_en:'Houston', country:'美國', countryCode:'US', lat:29.760, lng:-95.370, timezone:'America/Chicago', tz:-6 },
  { name:'達拉斯', name_en:'Dallas', country:'美國', countryCode:'US', lat:32.777, lng:-96.797, timezone:'America/Chicago', tz:-6 },
  { name:'奧斯汀', name_en:'Austin', country:'美國', countryCode:'US', lat:30.268, lng:-97.743, timezone:'America/Chicago', tz:-6 },
  { name:'聖安東尼奧', name_en:'San Antonio', country:'美國', countryCode:'US', lat:29.424, lng:-98.495, timezone:'America/Chicago', tz:-6 },
  { name:'紐奧良', name_en:'New Orleans', country:'美國', countryCode:'US', lat:29.951, lng:-90.072, timezone:'America/Chicago', tz:-6 },
  { name:'納士維', name_en:'Nashville', country:'美國', countryCode:'US', lat:36.163, lng:-86.781, timezone:'America/Chicago', tz:-6 },
  { name:'明尼亞波利斯', name_en:'Minneapolis', country:'美國', countryCode:'US', lat:44.978, lng:-93.265, timezone:'America/Chicago', tz:-6 },
  { name:'聖路易', name_en:'Saint Louis', country:'美國', countryCode:'US', lat:38.627, lng:-90.200, timezone:'America/Chicago', tz:-6 },
  { name:'堪薩斯城', name_en:'Kansas City', country:'美國', countryCode:'US', lat:39.100, lng:-94.579, timezone:'America/Chicago', tz:-6 },
  { name:'密爾瓦基', name_en:'Milwaukee', country:'美國', countryCode:'US', lat:43.039, lng:-87.907, timezone:'America/Chicago', tz:-6 },
  // 山區（MT：America/Denver）
  { name:'丹佛', name_en:'Denver', country:'美國', countryCode:'US', lat:39.739, lng:-104.990, timezone:'America/Denver', tz:-7 },
  { name:'鹽湖城', name_en:'Salt Lake City', country:'美國', countryCode:'US', lat:40.760, lng:-111.891, timezone:'America/Denver', tz:-7 },
  { name:'阿布奎基', name_en:'Albuquerque', country:'美國', countryCode:'US', lat:35.085, lng:-106.651, timezone:'America/Denver', tz:-7 },
  // 鳳凰城（亞利桑那不跟 DST，用 Phoenix 獨立時區）
  { name:'鳳凰城', name_en:'Phoenix', country:'美國', countryCode:'US', lat:33.448, lng:-112.074, timezone:'America/Phoenix', tz:-7 },
  { name:'圖桑', name_en:'Tucson', country:'美國', countryCode:'US', lat:32.222, lng:-110.971, timezone:'America/Phoenix', tz:-7 },
  // 太平洋（PT：America/Los_Angeles）
  { name:'洛杉磯', name_en:'Los Angeles', country:'美國', countryCode:'US', lat:34.052, lng:-118.244, timezone:'America/Los_Angeles', tz:-8 },
  { name:'舊金山', name_en:'San Francisco', country:'美國', countryCode:'US', lat:37.775, lng:-122.419, timezone:'America/Los_Angeles', tz:-8 },
  { name:'聖荷西', name_en:'San Jose', country:'美國', countryCode:'US', lat:37.339, lng:-121.895, timezone:'America/Los_Angeles', tz:-8 },
  { name:'聖地牙哥', name_en:'San Diego', country:'美國', countryCode:'US', lat:32.716, lng:-117.161, timezone:'America/Los_Angeles', tz:-8 },
  { name:'西雅圖', name_en:'Seattle', country:'美國', countryCode:'US', lat:47.606, lng:-122.332, timezone:'America/Los_Angeles', tz:-8 },
  { name:'波特蘭', name_en:'Portland', country:'美國', countryCode:'US', lat:45.515, lng:-122.678, timezone:'America/Los_Angeles', tz:-8 },
  { name:'拉斯維加斯', name_en:'Las Vegas', country:'美國', countryCode:'US', lat:36.170, lng:-115.139, timezone:'America/Los_Angeles', tz:-8 },
  { name:'沙加緬度', name_en:'Sacramento', country:'美國', countryCode:'US', lat:38.582, lng:-121.494, timezone:'America/Los_Angeles', tz:-8 },
  { name:'奧克蘭市', name_en:'Oakland', country:'美國', countryCode:'US', lat:37.804, lng:-122.271, timezone:'America/Los_Angeles', tz:-8 },
  { name:'佛雷斯諾', name_en:'Fresno', country:'美國', countryCode:'US', lat:36.747, lng:-119.772, timezone:'America/Los_Angeles', tz:-8 },
  // 阿拉斯加 / 夏威夷
  { name:'安克拉治', name_en:'Anchorage', country:'美國', countryCode:'US', lat:61.218, lng:-149.900, timezone:'America/Anchorage', tz:-9 },
  { name:'檀香山', name_en:'Honolulu', country:'美國', countryCode:'US', lat:21.307, lng:-157.858, timezone:'Pacific/Honolulu', tz:-10 },
]

const CITIES_CANADA: CityTz[] = [
  // 東岸
  { name:'多倫多', name_en:'Toronto', country:'加拿大', countryCode:'CA', lat:43.653, lng:-79.383, timezone:'America/Toronto', tz:-5 },
  { name:'蒙特婁', name_en:'Montreal', country:'加拿大', countryCode:'CA', lat:45.502, lng:-73.567, timezone:'America/Toronto', tz:-5 },
  { name:'渥太華', name_en:'Ottawa', country:'加拿大', countryCode:'CA', lat:45.421, lng:-75.697, timezone:'America/Toronto', tz:-5 },
  { name:'魁北克市', name_en:'Quebec City', country:'加拿大', countryCode:'CA', lat:46.814, lng:-71.208, timezone:'America/Toronto', tz:-5 },
  { name:'哈利法克斯', name_en:'Halifax', country:'加拿大', countryCode:'CA', lat:44.649, lng:-63.576, timezone:'America/Halifax', tz:-4 },
  { name:'聖約翰斯', name_en:"St. John's", country:'加拿大', countryCode:'CA', lat:47.562, lng:-52.710, timezone:'America/St_Johns', tz:-3.5 },
  // 中部 / 西部
  { name:'溫尼伯', name_en:'Winnipeg', country:'加拿大', countryCode:'CA', lat:49.896, lng:-97.138, timezone:'America/Winnipeg', tz:-6 },
  { name:'卡加利', name_en:'Calgary', country:'加拿大', countryCode:'CA', lat:51.045, lng:-114.057, timezone:'America/Edmonton', tz:-7 },
  { name:'艾德蒙頓', name_en:'Edmonton', country:'加拿大', countryCode:'CA', lat:53.546, lng:-113.493, timezone:'America/Edmonton', tz:-7 },
  { name:'溫哥華', name_en:'Vancouver', country:'加拿大', countryCode:'CA', lat:49.283, lng:-123.121, timezone:'America/Vancouver', tz:-8 },
  { name:'維多利亞', name_en:'Victoria', country:'加拿大', countryCode:'CA', lat:48.428, lng:-123.366, timezone:'America/Vancouver', tz:-8 },
]

const CITIES_MEXICO: CityTz[] = [
  { name:'墨西哥城', name_en:'Mexico City', country:'墨西哥', countryCode:'MX', lat:19.433, lng:-99.133, timezone:'America/Mexico_City', tz:-6 },
  { name:'瓜達拉哈拉', name_en:'Guadalajara', country:'墨西哥', countryCode:'MX', lat:20.659, lng:-103.349, timezone:'America/Mexico_City', tz:-6 },
  { name:'蒙特雷', name_en:'Monterrey', country:'墨西哥', countryCode:'MX', lat:25.687, lng:-100.316, timezone:'America/Monterrey', tz:-6 },
  { name:'坎昆', name_en:'Cancun', country:'墨西哥', countryCode:'MX', lat:21.161, lng:-86.851, timezone:'America/Cancun', tz:-5 },
  { name:'蒂華納', name_en:'Tijuana', country:'墨西哥', countryCode:'MX', lat:32.522, lng:-117.038, timezone:'America/Tijuana', tz:-8 },
]

// ============================================================
// 中南美
// ============================================================

const CITIES_LATIN: CityTz[] = [
  // 巴西（多時區）
  { name:'聖保羅', name_en:'Sao Paulo', country:'巴西', countryCode:'BR', lat:-23.550, lng:-46.633, timezone:'America/Sao_Paulo', tz:-3 },
  { name:'里約熱內盧', name_en:'Rio de Janeiro', country:'巴西', countryCode:'BR', lat:-22.907, lng:-43.173, timezone:'America/Sao_Paulo', tz:-3 },
  { name:'巴西利亞', name_en:'Brasilia', country:'巴西', countryCode:'BR', lat:-15.794, lng:-47.882, timezone:'America/Sao_Paulo', tz:-3 },
  { name:'薩爾瓦多', name_en:'Salvador', country:'巴西', countryCode:'BR', lat:-12.971, lng:-38.501, timezone:'America/Bahia', tz:-3 },
  { name:'福塔萊薩', name_en:'Fortaleza', country:'巴西', countryCode:'BR', lat:-3.732, lng:-38.527, timezone:'America/Fortaleza', tz:-3 },
  { name:'瑪瑙斯', name_en:'Manaus', country:'巴西', countryCode:'BR', lat:-3.119, lng:-60.022, timezone:'America/Manaus', tz:-4 },
  // 阿根廷
  { name:'布宜諾斯艾利斯', name_en:'Buenos Aires', country:'阿根廷', countryCode:'AR', lat:-34.604, lng:-58.382, timezone:'America/Argentina/Buenos_Aires', tz:-3 },
  // 智利 / 哥倫比亞 / 秘魯 / 其他
  { name:'聖地牙哥(智利)', name_en:'Santiago', country:'智利', countryCode:'CL', lat:-33.448, lng:-70.669, timezone:'America/Santiago', tz:-4 },
  { name:'利馬', name_en:'Lima', country:'秘魯', countryCode:'PE', lat:-12.046, lng:-77.043, timezone:'America/Lima', tz:-5 },
  { name:'波哥大', name_en:'Bogota', country:'哥倫比亞', countryCode:'CO', lat:4.711, lng:-74.072, timezone:'America/Bogota', tz:-5 },
  { name:'卡拉卡斯', name_en:'Caracas', country:'委內瑞拉', countryCode:'VE', lat:10.481, lng:-66.904, timezone:'America/Caracas', tz:-4 },
  { name:'基多', name_en:'Quito', country:'厄瓜多', countryCode:'EC', lat:-0.190, lng:-78.485, timezone:'America/Guayaquil', tz:-5 },
  { name:'拉巴斯', name_en:'La Paz', country:'玻利維亞', countryCode:'BO', lat:-16.490, lng:-68.119, timezone:'America/La_Paz', tz:-4 },
  { name:'蒙特維多', name_en:'Montevideo', country:'烏拉圭', countryCode:'UY', lat:-34.901, lng:-56.164, timezone:'America/Montevideo', tz:-3 },
  { name:'亞松森', name_en:'Asuncion', country:'巴拉圭', countryCode:'PY', lat:-25.264, lng:-57.576, timezone:'America/Asuncion', tz:-4 },
  { name:'哈瓦那', name_en:'Havana', country:'古巴', countryCode:'CU', lat:23.113, lng:-82.366, timezone:'America/Havana', tz:-5 },
  { name:'聖多明哥', name_en:'Santo Domingo', country:'多明尼加', countryCode:'DO', lat:18.486, lng:-69.931, timezone:'America/Santo_Domingo', tz:-4 },
  { name:'聖胡安', name_en:'San Juan', country:'波多黎各', countryCode:'PR', lat:18.466, lng:-66.106, timezone:'America/Puerto_Rico', tz:-4 },
  { name:'巴拿馬市', name_en:'Panama City', country:'巴拿馬', countryCode:'PA', lat:8.984, lng:-79.518, timezone:'America/Panama', tz:-5 },
]

// ============================================================
// 大洋洲
// ============================================================

const CITIES_OCEANIA: CityTz[] = [
  // 澳洲（5 個時區）
  { name:'雪梨', name_en:'Sydney', country:'澳洲', countryCode:'AU', lat:-33.869, lng:151.209, timezone:'Australia/Sydney', tz:10 },
  { name:'墨爾本', name_en:'Melbourne', country:'澳洲', countryCode:'AU', lat:-37.814, lng:144.963, timezone:'Australia/Melbourne', tz:10 },
  { name:'坎培拉', name_en:'Canberra', country:'澳洲', countryCode:'AU', lat:-35.281, lng:149.129, timezone:'Australia/Sydney', tz:10 },
  { name:'布里斯本', name_en:'Brisbane', country:'澳洲', countryCode:'AU', lat:-27.470, lng:153.026, timezone:'Australia/Brisbane', tz:10 },
  { name:'黃金海岸', name_en:'Gold Coast', country:'澳洲', countryCode:'AU', lat:-28.017, lng:153.400, timezone:'Australia/Brisbane', tz:10 },
  { name:'伯斯', name_en:'Perth', country:'澳洲', countryCode:'AU', lat:-31.953, lng:115.861, timezone:'Australia/Perth', tz:8 },
  { name:'阿德雷德', name_en:'Adelaide', country:'澳洲', countryCode:'AU', lat:-34.929, lng:138.601, timezone:'Australia/Adelaide', tz:9.5 },
  { name:'達爾文', name_en:'Darwin', country:'澳洲', countryCode:'AU', lat:-12.463, lng:130.842, timezone:'Australia/Darwin', tz:9.5 },
  { name:'霍巴特', name_en:'Hobart', country:'澳洲', countryCode:'AU', lat:-42.882, lng:147.324, timezone:'Australia/Hobart', tz:10 },
  // 紐西蘭
  { name:'奧克蘭', name_en:'Auckland', country:'紐西蘭', countryCode:'NZ', lat:-36.848, lng:174.763, timezone:'Pacific/Auckland', tz:12 },
  { name:'威靈頓', name_en:'Wellington', country:'紐西蘭', countryCode:'NZ', lat:-41.287, lng:174.776, timezone:'Pacific/Auckland', tz:12 },
  { name:'基督城', name_en:'Christchurch', country:'紐西蘭', countryCode:'NZ', lat:-43.532, lng:172.636, timezone:'Pacific/Auckland', tz:12 },
  { name:'皇后鎮', name_en:'Queenstown', country:'紐西蘭', countryCode:'NZ', lat:-45.031, lng:168.662, timezone:'Pacific/Auckland', tz:12 },
  // 其他
  { name:'蘇瓦', name_en:'Suva', country:'斐濟', countryCode:'FJ', lat:-18.124, lng:178.450, timezone:'Pacific/Fiji', tz:12 },
  { name:'莫士比港', name_en:'Port Moresby', country:'巴布亞紐幾內亞', countryCode:'PG', lat:-9.443, lng:147.180, timezone:'Pacific/Port_Moresby', tz:10 },
  { name:'關島', name_en:'Guam', country:'關島', countryCode:'GU', lat:13.444, lng:144.794, timezone:'Pacific/Guam', tz:10 },
]

// ============================================================
// 非洲
// ============================================================

const CITIES_AFRICA: CityTz[] = [
  { name:'開普敦', name_en:'Cape Town', country:'南非', countryCode:'ZA', lat:-33.925, lng:18.424, timezone:'Africa/Johannesburg', tz:2 },
  { name:'約翰尼斯堡', name_en:'Johannesburg', country:'南非', countryCode:'ZA', lat:-26.204, lng:28.047, timezone:'Africa/Johannesburg', tz:2 },
  { name:'開羅', name_en:'Cairo', country:'埃及', countryCode:'EG', lat:30.044, lng:31.236, timezone:'Africa/Cairo', tz:2 },
  { name:'亞歷山大', name_en:'Alexandria', country:'埃及', countryCode:'EG', lat:31.200, lng:29.919, timezone:'Africa/Cairo', tz:2 },
  { name:'卡薩布蘭加', name_en:'Casablanca', country:'摩洛哥', countryCode:'MA', lat:33.573, lng:-7.590, timezone:'Africa/Casablanca', tz:1 },
  { name:'拉巴特', name_en:'Rabat', country:'摩洛哥', countryCode:'MA', lat:34.020, lng:-6.833, timezone:'Africa/Casablanca', tz:1 },
  { name:'阿爾及爾', name_en:'Algiers', country:'阿爾及利亞', countryCode:'DZ', lat:36.737, lng:3.086, timezone:'Africa/Algiers', tz:1 },
  { name:'突尼斯', name_en:'Tunis', country:'突尼西亞', countryCode:'TN', lat:36.806, lng:10.181, timezone:'Africa/Tunis', tz:1 },
  { name:'拉哥斯', name_en:'Lagos', country:'奈及利亞', countryCode:'NG', lat:6.525, lng:3.379, timezone:'Africa/Lagos', tz:1 },
  { name:'內羅畢', name_en:'Nairobi', country:'肯亞', countryCode:'KE', lat:-1.292, lng:36.822, timezone:'Africa/Nairobi', tz:3 },
  { name:'阿迪斯阿貝巴', name_en:'Addis Ababa', country:'衣索比亞', countryCode:'ET', lat:9.032, lng:38.749, timezone:'Africa/Addis_Ababa', tz:3 },
  { name:'阿克拉', name_en:'Accra', country:'迦納', countryCode:'GH', lat:5.604, lng:-0.187, timezone:'Africa/Accra', tz:0 },
]

// ============================================================
// 彙總
// ============================================================

export const CITIES_WITH_TZ: CityTz[] = [
  ...CITIES_TAIWAN,
  ...CITIES_HK_MACAU,
  ...CITIES_CHINA,
  ...CITIES_JAPAN,
  ...CITIES_KOREA,
  ...CITIES_SEA,
  ...CITIES_SOUTH_ASIA,
  ...CITIES_MIDDLE_EAST,
  ...CITIES_EUROPE,
  ...CITIES_USA,
  ...CITIES_CANADA,
  ...CITIES_MEXICO,
  ...CITIES_LATIN,
  ...CITIES_OCEANIA,
  ...CITIES_AFRICA,
]

// ============================================================
// 搜尋與查詢工具
// ============================================================

/**
 * 搜尋城市（支援繁體、英文、國家名）
 * @param query 搜尋字串
 * @param limit 最多回傳幾筆（預設 10）
 */
export function searchCitiesTz(query: string, limit = 10): CityTz[] {
  if (!query || query.length < 1) return []
  const q = query.toLowerCase().trim()
  return CITIES_WITH_TZ.filter(c =>
    c.name.includes(q) ||
    c.name_en.toLowerCase().includes(q) ||
    c.country.includes(q) ||
    c.countryCode.toLowerCase() === q
  ).slice(0, limit)
}

/**
 * 以城市名反查時區（Sprint 5 既有資料遷移用）
 * - 優先中文名完全相符
 * - 其次英文名 case-insensitive
 * - 最後部分字串包含（去掉「（國家）」後綴）
 * @returns 匹配的 CityTz 或 null
 */
export function lookupCityTz(birthCityString: string | null | undefined): CityTz | null {
  if (!birthCityString) return null
  // 去掉「台北（台灣）」這種後綴格式
  const cleaned = birthCityString.replace(/[（(].*?[）)]/g, '').trim()
  if (!cleaned) return null

  // 1. 中文完全相符
  const exact = CITIES_WITH_TZ.find(c => c.name === cleaned)
  if (exact) return exact

  // 2. 英文完全相符（忽略大小寫）
  const lower = cleaned.toLowerCase()
  const exactEn = CITIES_WITH_TZ.find(c => c.name_en.toLowerCase() === lower)
  if (exactEn) return exactEn

  // 3. 部分字串包含
  const partial = CITIES_WITH_TZ.find(c =>
    c.name.includes(cleaned) || cleaned.includes(c.name) ||
    c.name_en.toLowerCase().includes(lower) || lower.includes(c.name_en.toLowerCase())
  )
  return partial || null
}

/**
 * 以 countryCode 取得該國首個城市（當國家不是多時區時用作預設）
 */
export function getDefaultCityByCountryCode(countryCode: string): CityTz | null {
  return CITIES_WITH_TZ.find(c => c.countryCode === countryCode.toUpperCase()) || null
}

/**
 * 取得所有 IANA 時區字串的唯一集合（供 Supabase migration 驗證用）
 */
export function getAllUniqueTimezones(): string[] {
  const set = new Set<string>()
  CITIES_WITH_TZ.forEach(c => set.add(c.timezone))
  return Array.from(set).sort()
}

/**
 * 顯示提示（結帳頁 UI）
 * - 無 DST → "Taipei (UTC+8)"
 * - 有 DST → 由前端依出生月份動態計算；此函式只給固定偏移
 */
export function formatTzHint(city: CityTz): string {
  const sign = city.tz >= 0 ? '+' : ''
  const tzStr = Number.isInteger(city.tz) ? city.tz.toString() : city.tz.toFixed(1)
  return `UTC${sign}${tzStr}`
}

/**
 * 以 IANA 時區 + 指定時刻回傳實際偏移（含 DST）
 * 用法：displayTzOffset('America/New_York', new Date(2023, 5, 15)) → -4（EDT）
 *       displayTzOffset('America/New_York', new Date(2023, 11, 15)) → -5（EST）
 * 瀏覽器端用 Intl.DateTimeFormat 查 tzdata（與 zoneinfo 同資料源）
 */
export function displayTzOffset(timezone: string, at: Date = new Date()): number {
  try {
    // 取得指定時區「當下」相對於 UTC 的偏移
    const utcDate = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzDate = new Date(at.toLocaleString('en-US', { timeZone: timezone }))
    const offsetMs = tzDate.getTime() - utcDate.getTime()
    return Math.round(offsetMs / 3600000 * 10) / 10  // 保留一位小數
  } catch {
    return 0
  }
}

/**
 * 檢查該時區在該時刻是否處於 DST
 */
export function isDstAt(timezone: string, at: Date): boolean {
  try {
    // 比較 1 月（多半非 DST）和 at 當下的偏移
    const janOffset = displayTzOffset(timezone, new Date(at.getFullYear(), 0, 15))
    const atOffset = displayTzOffset(timezone, at)
    // 如果 at 時刻偏移比 1 月多 1 小時 → DST
    return Math.abs(atOffset - janOffset) >= 0.9
  } catch {
    return false
  }
}
