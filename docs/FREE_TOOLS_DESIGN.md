# 免費排盤工具升級設計文件

> 藝術部門 + 網頁製作部門聯合產出
> 日期：2026-04-13
> 版本：v1.0

---

## 一、現有架構分析

### 1.1 檔案結構

| 頁面 | 路由 | API |
|:---|:---|:---|
| 八字排盤 | `app/tools/bazi/page.tsx`（~690行） | `app/api/free-bazi/route.ts` |
| 紫微排盤 | `app/tools/ziwei/page.tsx`（~598行） | `app/api/free-ziwei/route.ts` |
| 姓名學 | `app/tools/name/page.tsx` | `app/api/free-name/route.ts` |
| 共用 Layout | `app/tools/layout.tsx` | — |
| **奇門排盤** | **不存在，需新建** | **不存在，需新建** |

### 1.2 共用元件

- `FamilyMemberPicker`：從已儲存家人快速帶入表單
- `searchLocations` / `searchCities`（`lib/cities.ts`）：出生地區搜尋 + 時區 + 經緯度
- `SHICHEN` 常量：十二時辰選單（兩頁各自重複定義）
- 表單欄位組合：姓名/性別/曆法/出生日期/出生時間三選一/出生地區——**兩頁幾乎完全重複**

### 1.3 設計系統（globals.css @theme）

| Token | 值 | 用途 |
|:---|:---|:---|
| `--color-primary` | `#0f1628` 星夜藍 | 主背景 |
| `--color-gold` | `#c9a84c` 品牌金 | 標題/CTA/高亮 |
| `--color-gold-light` | `#e0c068` 晨曦金 | 漸層 |
| `--color-dark` | `#0a0e1a` 深空黑 | body 背景 |
| `--color-cream` | `#E8E4DE` 暖月白 | 正文 |
| `--color-text` | `#d4d0ca` 暖灰 | 段落 |
| `--color-text-muted` | `#6880a0` 星塵灰 | 輔助文字 |
| `--color-red-accent` | `#ef4444` | 警告/火 |
| `--color-blue-accent` | `#4a7aff` | 科技藍/水 |
| `--color-purple-accent` | `#8b5cf6` | 靈性紫 |
| `--color-teal-accent` | `#2dd4bf` | 能量青 |
| `--font-sans` | Noto Serif TC（襯線） | 標題 |
| `--font-body` | Noto Sans TC（無襯線） | 正文 |

### 1.4 共用 CSS class

- `.glass`：毛玻璃卡片（深色背景 + blur + gold border）
- `.text-gradient-gold`：金色漸層文字
- `.btn-glow`：按鈕金色光暈
- `.aurora-bg`：極光漸層裝飾背景
- `.divider-ornament`：古典分隔線
- `.stamp`：紅色印章效果

### 1.5 現有 UI 結構（通用模式）

```
頁面容器 py-16
└── max-w-5xl mx-auto px-6
    ├── 標題區（h1 text-gradient-gold + 副標題 + 「免費」標語）
    ├── 由來說明（details/summary 折疊區塊）
    ├── 分析進度動畫（loading 時顯示步驟列表）
    ├── 表單（glass 卡片，max-w-lg）
    │   ├── FamilyMemberPicker
    │   ├── 姓名 + 性別
    │   ├── 曆法切換
    │   ├── 出生日期（年/月/日）
    │   ├── 出生時間三選一
    │   ├── 出生地區搜尋
    │   └── 提交按鈕
    ├── 結果展示區
    │   ├── 命格概述卡片（人格封號 + 性格描述）
    │   ├── 優勢/注意 雙欄卡片
    │   ├── 六大維度 2x2 grid
    │   ├── 開運指南
    │   ├── 排盤數據區（八字四柱 / 紫微十二宮）
    │   ├── AI 深度分析段落
    │   └── 速算提示文字
    └── 付費升級引導區（漸層背景 + 三賣點 + CTA 按鈕）
```

### 1.6 API 呼叫方式

- `POST /api/free-bazi`：傳送 year/month/day/hour/minute/gender/name/calendar_type/latitude/longitude/timezone_offset
- `POST /api/free-ziwei`：傳送 year/month/day/hour/gender/name/calendar_type
- 後端流程：先呼叫 Python API（Fly.io）排盤 → 再呼叫 DeepSeek/Kimi AI 潤色 → 回傳完整結果
- fallback：Python API 休眠時用 TS 本地排盤

### 1.7 現有問題

| # | 問題 | 影響 |
|:---:|:---|:---|
| 1 | 表單程式碼幾乎完全重複（八字/紫微各自 ~150 行相同的表單代碼） | 維護困難、新增工具要再複製一份 |
| 2 | 八字排盤數據用簡單 4-column grid 展示四柱，缺乏傳統排盤格式 | 專業感不足，不像「排盤」 |
| 3 | 紫微十二宮用 3-column list 展示，不是傳統方盤 | 完全不符合紫微斗數圈的慣例 |
| 4 | 五行能量用橫向進度條，沒有傳統五行相生相剋圖 | 視覺單調 |
| 5 | 付費引導區只有 C/D 兩方案，缺少出門訣引導 | 漏掉核心訂閱收入 |
| 6 | 沒有奇門遁甲免費工具 | 缺少核心賣點入口 |
| 7 | `SHICHEN` 常量在兩個頁面重複定義 | 應提取到 `lib/constants.ts` |

---

## 二、升級設計方案

### 2.0 共用架構重構

#### 2.0.1 提取共用表單元件

新建 `components/tools/BirthInfoForm.tsx`，封裝以下共用表單欄位：

```
BirthInfoForm
├── FamilyMemberPicker（已存在）
├── NameGenderField（姓名 + 性別）
├── CalendarTypeToggle（國曆/農曆切換）
├── BirthDateField（年/月/日選擇器）
├── BirthTimeField（不確定/時辰/精確 三選一）
├── BirthCityField（地區搜尋 + 經緯度 + 時區）
└── SubmitButton（含 disabled 邏輯）
```

Props 介面：

```typescript
interface BirthInfoFormProps {
  onSubmit: (data: BirthFormData) => void
  loading: boolean
  error: string
  submitLabel?: string  // 預設「開始分析」
  requireCity?: boolean // 預設 true
  showTimeField?: boolean // 預設 true
  children?: React.ReactNode // 額外欄位插入點（如奇門的事件類型）
}
```

#### 2.0.2 提取共用常量

新建 `lib/constants.ts`：
- `SHICHEN`：十二時辰選單
- `WX_COLORS`：五行顏色映射
- `PALACE_ORDER`：紫微十二宮排列順序
- `PALACE_DESC`：十二宮位說明
- `PALACE_COLORS`：宮位配色

#### 2.0.3 提取共用結果區塊

新建 `components/tools/`：
- `AnalysisProgress.tsx`：分析進度動畫（接受 steps 陣列 prop）
- `UpgradeCTA.tsx`：付費升級引導區塊（接受 formData + plans prop）
- `WuxingChart.tsx`：五行能量圖（可複用於八字/奇門）

---

### 2.1 八字排盤升級

#### 現狀

四柱用 4-column grid，每格顯示天干/地支/納音/十神。視覺上像資料表格，不像傳統排盤。

#### 升級方案：傳統四柱格式 + 十神 + 大運時間軸 + 五行比例圖

##### A. 四柱排盤區（核心展示）

```
┌─────────────────────────────────────────────────┐
│                八字排盤                           │
│                                                   │
│   ┌────────┬────────┬────────┬────────┐          │
│   │ 時 柱  │ 日 柱  │ 月 柱  │ 年 柱  │  ← 從右到左│
│   ├────────┼────────┼────────┼────────┤          │
│   │ [十神] │  日主  │ [十神] │ [十神] │  ← 十神行  │
│   ├────────┼────────┼────────┼────────┤          │
│   │  辛    │  甲    │  丙    │  壬    │  ← 天干行  │
│   │ (金)   │ (木)   │ (火)   │ (水)   │    五行標注│
│   ├────────┼────────┼────────┼────────┤          │
│   │  酉    │  子    │  寅    │  午    │  ← 地支行  │
│   │ (金)   │ (水)   │ (木)   │ (火)   │    五行標注│
│   ├────────┼────────┼────────┼────────┤          │
│   │ 辛     │ 癸     │甲丙戊  │ 丁己   │  ← 藏干行  │
│   │ 正官   │ 正印   │比劫偏財│偏財正財 │    藏干十神│
│   ├────────┼────────┼────────┼────────┤          │
│   │ 海中金  │ 大溪水 │ 爐中火 │ 天河水 │  ← 納音行  │
│   └────────┴────────┴────────┴────────┘          │
│                                                   │
│   日主：甲木（陽木） 格局：正官格 身強/身弱：身弱    │
│   用神：水（印星生身） 喜神：金（官殺制身）          │
└─────────────────────────────────────────────────┘
```

**設計要點：**
- 排列順序：**從右到左**（年→月→日→時），符合傳統閱讀習慣（桌面版）
- 手機版：改為**從上到下**（年→月→日→時）垂直排列
- 每個天干/地支帶**五行顏色標注**（木=綠、火=紅、土=黃、金=金、水=藍）
- 日柱天干（日主）用**品牌金高亮 + 加粗 + 邊框強調**
- 十神行：日柱位置寫「日主」，其餘寫十神名稱
- 藏干行：展開顯示本氣/中氣/餘氣 + 對應十神
- 納音行：灰色小字

**樣式規格：**
- 外框：`.glass` 圓角卡片
- 天干字體：`text-2xl font-bold`，顏色用 `WX_COLORS` 對應五行色
- 地支字體：`text-2xl font-bold`，顏色用 `WX_COLORS` 對應五行色
- 十神字體：`text-xs text-gold`
- 藏干字體：`text-xs text-text-muted`
- 納音字體：`text-xs text-text-muted/50`
- 日柱特殊處理：`border-2 border-gold/40 bg-gold/[0.06]`

##### B. 五行能量圖（雙模式）

保留現有橫向進度條，新增**五行圓餅圖**：

```
┌──────────────────────────────┐
│       五行能量分佈             │
│                               │
│   ┌─── 圓餅圖 ───┐  ┌ 進度條 ┐│
│   │   木 25%      │  │ 木 ███  ││
│   │   火 20%      │  │ 火 ██   ││
│   │   土 15%      │  │ 土 █    ││
│   │   金 30%      │  │ 金 ████ ││
│   │   水 10%      │  │ 水 █    ││
│   └───────────────┘  └────────┘│
│                               │
│   缺：水 ← 缺五行紅字警告     │
│   旺：金 ← 最旺五行金色標注    │
└──────────────────────────────┘
```

- 圓餅圖用 SVG `<circle>` 繪製（不引入圖表庫）
- 五行各段用對應五行色
- 手機版：圓餅圖在上，進度條在下
- 桌面版：左右並排

##### C. 大運時間軸（新增）

```
┌──────────────────────────────────────────────┐
│  大運走勢                                      │
│                                                │
│  ──●────●────●────●────●────●────●────●──→     │
│   3歲  13歲 23歲 33歲 43歲 53歲 63歲 73歲      │
│   甲寅  乙卯  丙辰  丁巳  戊午  己未  庚申  辛酉 │
│   (木)  (木)  (火)  (火)  (土)  (土)  (金)  (金)│
│                      ▲                         │
│                   當前大運                       │
│                                                │
│  ⚠️ 完整大運分析包含逐運詳解... [升級查看]        │
└──────────────────────────────────────────────┘
```

**設計要點：**
- 水平時間軸，每個節點是一個大運
- 當前大運用**品牌金圓點 + 向上箭頭**標記
- 每個節點顯示：起運年齡 + 天干地支 + 五行色
- 手機版：改為垂直時間軸
- 最後一個節點顯示模糊效果 + 鎖定圖標，引導升級
- API 需新增回傳大運資料（`dayun` 陣列）

**資料結構：**
```typescript
interface DayunInfo {
  age: number       // 起運年齡
  ganzhi: string    // 天干地支（如「甲寅」）
  wuxing: string    // 主五行
  isCurrent: boolean // 是否為當前大運
}
```

---

### 2.2 紫微排盤升級

#### 現狀

十二宮用 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` 列表展示，每宮一張小卡片。沒有傳統方盤格式。

#### 升級方案：十二宮方盤（4x4 grid，中間空）+ 主星亮度標記 + 四化標記

##### A. 紫微方盤（核心展示）

傳統紫微斗數方盤為 4x4 格局，中間 2x2 為個人資料區：

```
┌─────────┬─────────┬─────────┬─────────┐
│  巳宮    │  午宮    │  未宮    │  申宮    │
│  [宮名]  │  [宮名]  │  [宮名]  │  [宮名]  │
│  紫微★廟 │  天機☆利 │  太陽★旺 │  武曲☆廟 │
│  左輔 文昌│  天鉞    │  化祿    │  化權    │
├─────────┼─────────┴─────────┼─────────┤
│  辰宮    │                   │  酉宮    │
│  [宮名]  │   姓名：XXX       │  [宮名]  │
│  天同☆旺 │   性別：男         │  天相☆廟 │
│  天魁    │   農曆：XXXX年X月X │  天喜    │
├─────────┤   命宮主星：紫微    ├─────────┤
│  卯宮    │   五行局：水二局    │  戌宮    │
│  [宮名]  │   身宮：XX宮       │  [宮名]  │
│  廉貞★陷 │                   │  七殺☆旺 │
│  化忌    │                   │  火星    │
├─────────┼─────────┬─────────┼─────────┤
│  寅宮    │  丑宮    │  子宮    │  亥宮    │
│  [宮名]  │  [宮名]  │  [宮名]  │  [宮名]  │
│  天府★廟 │  太陰☆旺 │  貪狼☆利 │  巨門★廟 │
│  右弼 文曲│  天刑    │  化科    │  鈴星    │
└─────────┴─────────┴─────────┴─────────┘
```

**設計要點：**
- **4x4 CSS Grid**：`grid-template-columns: repeat(4, 1fr)`
- 中間 2x2 合併為個人資料區：用 `grid-column: 2 / 4; grid-row: 2 / 4`
- 十二宮位按地支排列在方盤邊緣 12 格（從寅宮=左下角逆時針排）
- 每宮內容由上到下：
  1. **宮名**（如「命宮」）— `text-xs font-bold`，用 `PALACE_COLORS` 配色
  2. **地支**（如「寅」）— `text-[10px] text-text-muted` 右上角
  3. **主星 + 亮度**（如「紫微★廟」）— `text-sm font-bold text-gold`
  4. **輔星**（如「左輔 文昌」）— `text-[10px] text-text-muted`
  5. **四化標記**（如「化祿」）— 用對應顏色 pill badge

**主星亮度標記系統：**

| 亮度 | 符號 | 顏色 | 說明 |
|:---:|:---:|:---|:---|
| 廟 | ★ | `text-gold`（金色） | 最強，主星力量充分發揮 |
| 旺 | ★ | `text-green-400`（綠色） | 次強 |
| 得地/利 | ☆ | `text-blue-400`（藍色） | 中等 |
| 平 | ○ | `text-text-muted`（灰色） | 普通 |
| 不得地 | △ | `text-orange-400`（橘色） | 偏弱 |
| 落陷 | ▽ | `text-red-400`（紅色） | 最弱 |

**四化標記系統：**

| 四化 | Badge 顏色 | 文字 |
|:---:|:---|:---|
| 化祿 | `bg-green-500/20 text-green-400` | 祿 |
| 化權 | `bg-blue-500/20 text-blue-400` | 權 |
| 化科 | `bg-purple-500/20 text-purple-400` | 科 |
| 化忌 | `bg-red-500/20 text-red-400` | 忌 |

**手機版適配：**
- 手機寬度不足以完整顯示 4x4 方盤
- 方案 A：用 `overflow-x-auto` 水平捲動，保持方盤完整
- 方案 B：固定寬度 `min-w-[360px]`，用 `transform: scale(0.85)` 縮小
- 建議方案：**方案 A**（水平捲動），附加提示文字「左右滑動查看完整命盤」
- 方盤下方仍保留現有的宮位列表（作為詳細資訊展開區）

##### B. 宮位詳情展開

方盤下方保留現有的宮位卡片列表，但改為**可折疊**：
- 預設全部收合
- 點擊方盤某宮 → 自動展開對應宮位詳情
- 詳情包含：宮位說明 + 主星解讀 + 輔星影響 + AI 分析

##### C. 四化飛星視覺化

現有四化用 4-column grid 展示，升級為：
- 在方盤上用**虛線箭頭**連接四化所在宮位（僅桌面版）
- 保留現有 4-column grid 作為獨立區塊

**API 需新增回傳資料：**
```typescript
interface PalaceDataEnhanced {
  branch: string           // 地支
  palaceName: string       // 宮名
  mainStars: { name: string; brightness: string }[]  // 主星 + 亮度
  minorStars: string[]     // 輔星
  sihua: string[]          // 該宮的四化（如 ['化祿']）
}
```

---

### 2.3 奇門排盤（新建）

#### 路由
- 頁面：`app/tools/qimen/page.tsx`
- API：`app/api/free-qimen/route.ts`
- Navbar 新增連結：`/tools/qimen`

#### 表單設計

複用 `BirthInfoForm` 共用元件，額外新增：

```
┌──────────────────────────────────┐
│  奇門遁甲排盤                      │
│                                    │
│  [共用表單：姓名/性別/出生資料]      │
│                                    │
│  ── 排盤類型 ──                    │
│  ● 時盤（預設）  ○ 日盤  ○ 年盤    │
│                                    │
│  ── 排盤時間 ──                    │
│  ● 當前時間（預設）                 │
│  ○ 自訂時間 → [日期選擇器] [時辰]  │
│                                    │
│  [開始排盤]                         │
└──────────────────────────────────┘
```

#### 九宮格排盤（核心展示）

```
┌──────────────┬──────────────┬──────────────┐
│   巽四宮 (SE) │   離九宮 (S)  │   坤二宮 (SW) │
│              │              │              │
│  天盤: 丁    │  天盤: 丙    │  天盤: 乙    │
│  地盤: 壬    │  地盤: 甲    │  地盤: 癸    │
│  九星: 天輔  │  九星: 天英  │  九星: 天芮  │
│  八門: 杜門  │  八門: 景門  │  八門: 死門  │
│  八神: 白虎  │  八神: 玄武  │  八神: 九地  │
│              │              │              │
│  [格局標籤]   │  [格局標籤]   │  [格局標籤]   │
├──────────────┼──────────────┼──────────────┤
│   震三宮 (E)  │   中五宮      │   兌七宮 (W)  │
│              │              │              │
│  天盤: 戊    │  值符: 天心  │  天盤: 庚    │
│  地盤: 辛    │  值使: 開門  │  地盤: 丁    │
│  九星: 天衝  │              │  九星: 天柱  │
│  八門: 傷門  │  局數: 陰遁X局│  八門: 驚門  │
│  八神: 六合  │  旬首: 甲X遁X│  八門: 太陰  │
│              │              │              │
│  [格局標籤]   │              │  [格局標籤]   │
├──────────────┼──────────────┼──────────────┤
│   艮八宮 (NE) │   坎一宮 (N)  │   乾六宮 (NW) │
│              │              │              │
│  天盤: 己    │  天盤: 壬    │  天盤: 辛    │
│  地盤: 戊    │  地盤: 己    │  地盤: 庚    │
│  九星: 天任  │  九星: 天蓬  │  九星: 天心  │
│  八門: 生門  │  八門: 休門  │  八門: 開門  │
│  八神: 九天  │  八神: 值符  │  八神: 螣蛇  │
│              │              │              │
│  [格局標籤]   │  [格局標籤]   │  [格局標籤]   │
└──────────────┴──────────────┴──────────────┘
```

##### 九宮格設計要點

**佈局：**
- `grid-template-columns: repeat(3, 1fr)` 3x3 等寬
- 中宮（五宮）特殊處理：顯示值符/值使/局數/旬首
- 每宮最小高度 `min-h-[160px]`

**每宮內容層次：**

| 層次 | 內容 | 樣式 |
|:---:|:---|:---|
| 1 | 宮名 + 方位 | `text-[10px] text-text-muted` 左上角 |
| 2 | 八神 | `text-xs` 右上角，用專屬配色 |
| 3 | 天盤干 | `text-lg font-bold text-gold`（主要視覺焦點） |
| 4 | 地盤干 | `text-base text-cream` |
| 5 | 九星 | `text-sm` 用九星專屬配色 |
| 6 | 八門 | `text-sm` 用八門吉凶配色 |
| 7 | 格局標籤 | pill badge，底部 |

**八門吉凶配色：**

| 八門 | 吉凶 | 配色 |
|:---:|:---:|:---|
| 開門 | 大吉 | `bg-green-500/20 text-green-400 border-green-500/30` |
| 休門 | 大吉 | `bg-green-500/20 text-green-400 border-green-500/30` |
| 生門 | 大吉 | `bg-green-500/20 text-green-400 border-green-500/30` |
| 景門 | 中平 | `bg-blue-500/20 text-blue-400 border-blue-500/30` |
| 杜門 | 中平 | `bg-blue-500/20 text-blue-400 border-blue-500/30` |
| 傷門 | 凶 | `bg-orange-500/20 text-orange-400 border-orange-500/30` |
| 驚門 | 凶 | `bg-orange-500/20 text-orange-400 border-orange-500/30` |
| 死門 | 大凶 | `bg-red-500/20 text-red-400 border-red-500/30` |

**九星配色：**

| 九星 | 五行 | 配色 |
|:---|:---:|:---|
| 天蓬 | 水 | `text-blue-accent` |
| 天芮 | 土 | `text-yellow-500` |
| 天衝 | 木 | `text-green-400` |
| 天輔 | 木 | `text-green-400` |
| 天禽 | 土 | `text-yellow-500` |
| 天心 | 金 | `text-gold` |
| 天柱 | 金 | `text-gold` |
| 天任 | 土 | `text-yellow-500` |
| 天英 | 火 | `text-red-accent` |

**八神配色：**

| 八神 | 配色 |
|:---|:---|
| 值符 | `text-gold`（品牌金，最重要） |
| 螣蛇 | `text-red-accent` |
| 太陰 | `text-purple-accent` |
| 六合 | `text-green-400` |
| 白虎 | `text-cream`（白色） |
| 玄武 | `text-blue-accent` |
| 九地 | `text-yellow-600` |
| 九天 | `text-teal-accent` |

##### 格局標籤系統

每宮的天盤干 + 地盤干組合會形成格局（如「龍遁」「虎遁」等），用 pill badge 顯示：

| 格局類型 | 配色 | 範例 |
|:---:|:---|:---|
| 吉格 | `bg-green-500/15 text-green-400 border border-green-500/20` | 龍遁、風遁、雲遁 |
| 凶格 | `bg-red-500/15 text-red-400 border border-red-500/20` | 入墓、反吟、伏吟 |
| 特殊 | `bg-purple-500/15 text-purple-400 border border-purple-500/20` | 門迫、六儀擊刑 |

##### 中宮資訊區

```
┌─────────────────────┐
│     中五宮            │
│                       │
│  值符：天心           │
│  值使：開門           │
│                       │
│  陰遁 X 局           │
│  旬首：甲X遁X        │
│                       │
│  節氣：清明           │
│  時辰：辰時           │
└─────────────────────┘
```

##### 手機版適配

- 奇門九宮格在手機上用 `overflow-x-auto` 水平捲動
- 最小寬度 `min-w-[480px]`
- 提示文字：「左右滑動查看完整排盤」
- 九宮格下方加上**宮位列表**（垂直排列），方便手機閱讀

##### 結果展示區（九宮格之外）

```
頁面結構
├── 九宮格排盤（核心）
├── 當前時空概覽卡片
│   ├── 年干支 + 月干支 + 日干支 + 時干支
│   ├── 局數 + 陰陽遁 + 旬首
│   └── 節氣 + 排盤時間
├── AI 整體解讀（簡要）
│   ├── 今日/此時整體能量場
│   └── 吉凶方位提示
├── 格局列表（本盤所有格局）
│   ├── 吉格匯總 + 說明
│   └── 凶格匯總 + 說明
├── 速算提示
└── 付費升級引導（重點推 E1/E2 出門訣）
```

##### API 資料結構

```typescript
interface QimenResult {
  // 基本資訊
  panType: 'hour' | 'day' | 'year'  // 盤型
  yinyang: '陰遁' | '陽遁'
  juNumber: number                    // 局數（1-9）
  xunshou: string                     // 旬首
  jieqi: string                       // 節氣
  datetime: string                    // 排盤時間

  // 四柱
  yearGZ: string   // 年干支
  monthGZ: string  // 月干支
  dayGZ: string    // 日干支
  hourGZ: string   // 時干支

  // 值符值使
  zhifu: string    // 值符星名
  zhishi: string   // 值使門名

  // 九宮資料（key 為宮位數字 1-9）
  palaces: Record<number, {
    position: string      // 方位名（如「坎一宮」）
    direction: string     // 方向（N/NE/E/SE/S/SW/W/NW）
    tianpanGan: string    // 天盤干
    dipanGan: string      // 地盤干
    jiuxing: string       // 九星
    bamen: string         // 八門
    bashen: string        // 八神
    geju: string[]        // 格局標籤
  }>

  // AI 分析
  aiOverview: string      // 整體能量場解讀
  aiDirections: string    // 方位吉凶提示
  hasAi: boolean
}
```

---

### 2.4 付費引導區塊設計（三個工具共用）

#### 現狀問題

- 只引導到 C（人生藍圖 $89）和 D（心之所惑 $39）
- 缺少出門訣引導，但出門訣是核心訂閱收入來源
- 八字頁面的引導文案已經不錯，但不夠個人化

#### 升級方案

**架構：** 新建 `components/tools/UpgradeCTA.tsx`，接受參數動態調整

```typescript
interface UpgradeCTAProps {
  toolName: 'bazi' | 'ziwei' | 'qimen'  // 來源工具
  formData: BirthFormData               // 用戶表單資料（用於預填結帳）
}
```

**佈局：**

```
┌──────────────────────────────────────────────┐
│                                                │
│   [工具特定標題]                                │
│   [工具特定副標題]                               │
│                                                │
│   ┌── 方案卡 ──┐ ┌── 方案卡 ──┐ ┌── 方案卡 ──┐ │
│   │ 人生藍圖   │ │ 心之所惑   │ │ 出門訣     │ │
│   │ $89       │ │ $39       │ │ $89-119   │ │
│   │ 15系統    │ │ 單一困惑   │ │ 奇門遁甲   │ │
│   │ 完整報告   │ │ 聚焦分析   │ │ 每月擇吉   │ │
│   │ [CTA]     │ │ [CTA]     │ │ [CTA]     │ │
│   └───────────┘ └───────────┘ └───────────┘ │
│                                                │
│   安全支付 · 5分鐘出報告 · PDF永久保存          │
│   還沒準備好？免費註冊先收藏                     │
│                                                │
└──────────────────────────────────────────────┘
```

**工具特定文案：**

| 工具 | 標題 | 副標題 |
|:---|:---|:---|
| 八字 | 以上只揭示了您命格的 6.7% | 完整報告融合 15 套東西方命理體系 |
| 紫微 | 紫微斗數只是 15 套系統中的 1 套 | 完整報告還會融合八字、奇門遁甲、西洋占星等 |
| 奇門 | 以上是靜態排盤，出門訣才是動態應用 | 出門訣根據您的具體事件，精準擇吉避凶 |

**出門訣卡片特殊設計：**
- 背景用 `aurora-bg` 極光漸層，視覺突出
- 強調「核心訂閱」概念：「每月一份，持續守護」
- CTA 文字：「啟動出門訣 $29 起」(v5.7.6 命名統一、新價)
- 小字補充：「事件擇吉 $59 / 月度單盤 $29 / 月度精選 $89 / 年度全運 $279」(v5.7.x 8 方案、原「事件出門訣 $119 / 月度出門訣 $89」已棄用)

---

## 三、響應式設計規範

### 3.1 斷點定義（沿用 Tailwind 預設）

| 斷點 | 寬度 | 適用 |
|:---:|:---:|:---|
| 預設 | < 640px | 手機 |
| `sm` | >= 640px | 大手機/小平板 |
| `md` | >= 768px | 平板 |
| `lg` | >= 1024px | 桌面 |

### 3.2 各排盤手機適配

| 排盤 | 桌面版 | 手機版 |
|:---|:---|:---|
| 八字四柱 | 橫向 4 格（右到左） | 垂直 4 格（上到下） |
| 大運時間軸 | 水平軸 | 垂直軸 |
| 五行圖 | 左圓餅右進度條 | 上圓餅下進度條 |
| 紫微方盤 | 4x4 grid | 水平捲動（min-w-360px） |
| 奇門九宮 | 3x3 grid | 水平捲動（min-w-480px） |

---

## 四、新增檔案清單

| 路徑 | 類型 | 說明 |
|:---|:---:|:---|
| `components/tools/BirthInfoForm.tsx` | 新建 | 共用出生資料表單 |
| `components/tools/AnalysisProgress.tsx` | 新建 | 分析進度動畫 |
| `components/tools/UpgradeCTA.tsx` | 新建 | 付費引導區塊 |
| `components/tools/WuxingChart.tsx` | 新建 | 五行圓餅圖 + 進度條 |
| `components/tools/BaziPillars.tsx` | 新建 | 傳統四柱排盤 |
| `components/tools/BaziDayun.tsx` | 新建 | 大運時間軸 |
| `components/tools/ZiweiBoard.tsx` | 新建 | 紫微方盤 |
| `components/tools/QimenBoard.tsx` | 新建 | 奇門九宮格 |
| `lib/constants.ts` | 新建 | 共用常量（時辰/五行色/宮位等） |
| `app/tools/qimen/page.tsx` | 新建 | 奇門排盤頁面 |
| `app/api/free-qimen/route.ts` | 新建 | 奇門排盤 API |

### 需修改的現有檔案

| 路徑 | 修改內容 |
|:---|:---|
| `app/tools/bazi/page.tsx` | 引入共用元件，替換重複程式碼，新增四柱/大運/五行圖元件 |
| `app/tools/ziwei/page.tsx` | 引入共用元件，替換重複程式碼，新增方盤元件 |
| `app/tools/layout.tsx` | 更新 metadata，加入奇門遁甲關鍵字 |
| `components/Navbar.tsx` | 新增奇門排盤連結 |

---

## 五、API 端變更需求

### 5.1 八字 API 擴充

`/api/free-bazi` 回傳新增：

```typescript
// 新增欄位
dayun: DayunInfo[]           // 大運陣列（8-10 個大運）
canggan: Record<string, { gan: string; shishen: string; weight: number }[]>  // 四柱藏干詳情
wuxing_chart: { element: string; count: number; percent: number }[]  // 格式化五行資料
```

### 5.2 紫微 API 擴充

`/api/free-ziwei` 回傳 palaceData 結構調整：

```typescript
// 升級 palaceData
palaceData: Record<string, {
  branch: string
  position: number           // 方盤位置 (1-12 對應地支序)
  mainStars: { name: string; brightness: string }[]  // 原本是字串，改為陣列
  minorStars: string[]
  sihua: string[]            // 該宮所含四化
}>
bodyPalace: string           // 身宮位置
```

### 5.3 奇門 API 新建

`/api/free-qimen` — 呼叫 Python Fly.io 的奇門遁甲引擎：

- 輸入：year/month/day/hour/minute/panType/latitude/longitude/timezone_offset
- 輸出：`QimenResult`（見 2.3 節定義）
- fallback：如果 Python API 休眠，回傳基本排盤資料（無 AI 分析）

---

## 六、實作優先順序

| 優先級 | 任務 | 預估工作量 | 依賴 |
|:---:|:---|:---:|:---|
| P0 | 提取共用元件（BirthInfoForm、AnalysisProgress、UpgradeCTA、constants） | 4hr | 無 |
| P0 | 八字四柱傳統格式（BaziPillars） | 3hr | P0 共用元件 |
| P0 | 紫微方盤（ZiweiBoard） | 4hr | P0 共用元件 |
| P1 | 奇門九宮格（QimenBoard + page + API） | 6hr | P0 共用元件 + Python 排盤 API |
| P1 | 五行圓餅圖（WuxingChart） | 2hr | 無 |
| P1 | 大運時間軸（BaziDayun） | 3hr | API 擴充 |
| P2 | 付費引導區升級（含出門訣卡片） | 2hr | 無 |
| P2 | Navbar 新增奇門連結 + layout metadata 更新 | 0.5hr | 無 |
| P2 | API 回傳資料結構擴充（八字/紫微） | 3hr | Python API 配合 |

**總預估：~28 小時**

---

## 七、SEO 與 Metadata

### 新增頁面 SEO

```typescript
// app/tools/qimen/page.tsx 或 layout.tsx
export const metadata: Metadata = {
  title: '免費奇門遁甲排盤 — 鑒源 JianYuan',
  description: '免費奇門遁甲排盤：九宮格完整展示天盤干、地盤干、九星、八門、八神，自動標記吉凶格局。即時出結果，不需註冊。',
  keywords: '奇門遁甲, 免費排盤, 九宮格, 天盤, 地盤, 九星, 八門, 八神, 格局, 擇吉',
}
```

### 更新 tools/layout.tsx

```typescript
export const metadata: Metadata = {
  title: '免費命理速算 — 鑒源 JianYuan',
  description: '免費體驗鑒源命理速算：八字排盤、紫微斗數、奇門遁甲、姓名學分析。傳統專業排盤格式，即時出結果，不需註冊。',
  keywords: '免費算命, 八字排盤, 紫微斗數, 奇門遁甲, 姓名學, 五行分析, 免費命理',
}
```

---

## 八、品質標準

### 視覺品質

- 所有排盤格式必須符合傳統命理圈慣例（四柱右到左、紫微方盤逆時針、奇門九宮洛書排列）
- 五行顏色統一：木=#22c55e、火=#ef4444、土=#eab308、金=#f59e0b(gold)、水=#3b82f6
- 暗色主題一致性：所有新元件使用 `.glass` + `--color-*` tokens
- 手機可讀性：排盤表格字體不小於 10px

### 功能品質

- 共用表單元件與現有八字/紫微的行為完全一致（含城市搜尋、農曆轉換等）
- 奇門 API 回傳時間 < 5 秒（含 Python API 排盤 + AI 潤色）
- 所有排盤數據必須與 Python 排盤引擎輸出一致，前端只做展示不做計算

### 轉化品質

- 每個工具頁底部都要有付費引導
- 出門訣引導必須出現在所有三個排盤工具的底部
- CTA 按鈕預填用戶已輸入的表單資料，減少二次輸入

---

*文件結束*
