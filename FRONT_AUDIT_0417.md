# 前台全面稽查報告（2026-04-17）

## 摘要
- **稽查範圍**：15 個前台頁面 + 關鍵共用元件（Navbar、Footer、PricingCards、AIAnalysisCard、HeroCTAExperiment、FreeTryBanner、checkout types）
- **結果**：12 頁正常 / 3 處已修（34,458 殘留、Top 5 過時、不實承諾）/ 3 處需後續觀察
- **已對所有修改執行 `npm run type-check`，零錯誤**
- **dashboard/page.tsx 按指示未動**

## 本輪修復動作（已完成）

| # | 檔案 | 問題 | 修復 |
|---|------|------|------|
| 1 | `lib/brand.ts:26` | `differentiators` 仍寫「34,458 條規則」 | 改為「4,600+ 條規則源自數十部經典古籍」 |
| 2 | `app/page.tsx:11` metadata description | 仍寫「數萬條古籍規則…30 秒出結果」 | 改為「4,600+ 條古籍規則…即時出結果」 |
| 3 | `app/page.tsx:255` | 文案用「獨家」 | 依真實性規則改為「特色」 |
| 4 | `app/tools/qimen/page.tsx:861` | 升級引導寫「Top 5 吉時推薦」與實際 E1 Top3 不符 | 改為「Top 3 吉時推薦」 |
| 5 | `app/tools/name/page.tsx:726` | 「5 分鐘出報告」與實際 30-60 分鐘不符 | 改為「約 30-60 分鐘出報告」 |
| 6 | `components/checkout/types.ts:75-76` | E1 文案「Top 5」、E2 文案「排算 30 天 360 個時辰…Top 5」與實際（E1 Top3、E2 每週 1 盤共 4 盤）不符 | 改為 E1 「Top 3 出行方案」、E2「每週 1 盤共 4 週」 |
| 7 | `app/tools/bazi/page.tsx` | 5 個 AI 章節仍用純文字 `whitespace-pre-line`，ziwei 已用 AIAnalysisCard 但 bazi 沒 | 套用 AIAnalysisCard（purple/emerald/blue/amber/rose 配色） |
| 8 | `app/tools/qimen/page.tsx` | 2 個 AI 區塊（整體能量場、方位吉凶）用純文字 | 套用 AIAnalysisCard（purple/emerald） |
| 9 | `app/tools/name/page.tsx` | 姓名深度解讀用純文字 | 套用 AIAnalysisCard（amber） |

---

## 每頁詳細

### 1. 首頁（app/page.tsx）
- **狀態**：已修 + 部分可優化
- **發現**：
  - metadata description 寫「數萬條」「30 秒出結果」— 已改
  - line 255「獨家」違反真實性規則 — 已改「特色」
  - line 145「30 秒，免費看見你的命格密碼」、line 629「用 30 秒做一次免費命理速算」— 這兩處指免費速算實際可達，合理保留
  - line 100 使用 `HeroCTAExperiment`（A/B 測試），A 版「立即免費體驗 · 30 秒出結果」B 版「3 分鐘看懂你的命盤」— 屬於測試中不動
- **建議**：A/B 測試結束後統一文案

### 2. 定價頁（app/pricing/page.tsx）
- **狀態**：正常
- **發現**：E1 說明「Top3 吉時」、E2 說明「4 週各 1 盤 Top1」— 已與後端一致
- **FAQ**：7 題對齊真實性規則，回答合宜

### 3. 結帳頁（app/checkout/page.tsx + components/checkout/*）
- **狀態**：主頁面正常，`types.ts` 的 `PLAN_DESCRIPTIONS` 已修（E1/E2 對齊 Top3 + 4 週）
- **發現**：主頁面已完全組件化（SinglePersonForm/RMemberForm/G15 導入模式），結構清晰

### 4. 客戶儀表板（app/dashboard/page.tsx）
- **狀態**：按指示未動（老闆自己修）
- **已知**：cbe566@gmail.com 登入看不到 14 份報告（需 Jamie 排查）

### 5. 免費八字（app/tools/bazi/page.tsx）
- **狀態**：已優化
- **發現**：
  - 原本 5 個 AI 章節用純文字顯示，markdown 符號會外洩 — 已全套 AIAnalysisCard
  - 排盤結果含完整神煞（桃花/驛馬/天乙貴人/空亡 12 種）、大運時間軸、流年、胎元、五行圓餅圖——視覺豐富
  - 標題字體、顏色分層清楚

### 6. 免費紫微（app/tools/ziwei/page.tsx）
- **狀態**：正常（老闆已套 AIAnalysisCard）

### 7. 免費奇門（app/tools/qimen/page.tsx）
- **狀態**：已優化
- **發現**：
  - 原本「Top 5 吉時推薦」— 已改 Top 3
  - 原本 2 個 AI 區塊用純文字 — 已套 AIAnalysisCard
  - 九宮格視覺優秀：值符/值使/天乙/年命/驛馬都有彩色標籤
  - 格局配色依吉凶自動判斷（綠/藍/橘/紅/紫）

### 8. 免費姓名學（app/tools/name/page.tsx）
- **狀態**：已優化，存在
- **發現**：
  - 「5 分鐘出報告」— 已改「約 30-60 分鐘」
  - 姓名深度解讀 — 已套 AIAnalysisCard
  - 結構完整：五格數理、三才配置（125 組合吉凶）、生肖喜忌字根、補救建議

### 9. 登入頁（app/auth/login/page.tsx）
- **狀態**：正常
- **發現**：Supabase 錯誤訊息中文化、Google OAuth、reset-password 連結齊全

### 10. 註冊頁（app/auth/signup/page.tsx）
- **狀態**：路徑為 `/auth/signup`（不是 `register`），Navbar/Footer 都正確指向此路徑
- **發現**：無需異動

### 11. 報告頁（app/report/[token]/page.tsx）
- **狀態**：正常（大型 SSR + 客戶端混合頁）
- **發現**：
  - pending/generating 狀態分方案顯示等待訊息（E1/E2 40-50 分鐘、G15/R 30-45 分鐘、C/D 40-60 分鐘）
  - 章節過濾邏輯嚴謹，防 Markdown 殘留
  - 列印樣式完整（白底、分頁不斷）
  - R 方案合/不合文字結論、E1/E2 Top3 專屬卡片已整合

### 12. 隱私政策（app/privacy/page.tsx）
- **狀態**：正常
- **發現**：資料收集、存儲、第三方、用戶權利、Cookie 7 章完整

### 13. 服務條款（app/terms/page.tsx）
- **狀態**：正常
- **發現**：line 31「不保證100%準確」為否定句，合乎真實性規則

### 14. FAQ（app/faq/page.tsx）
- **狀態**：無獨立頁，FAQ 內嵌在 pricing/page.tsx（7 題）— 這是合理設計

### 15. 品牌常數（lib/brand.ts）
- **狀態**：已修
- **發現**：34,458 已改為 4,600+

### 16. 國際化（lib/i18n.ts）
- **狀態**：正常
- **發現**：
  - UI_TEXT 繁/簡體雙版本，key 齊全
  - `cta_no_card` / `free_no_register` 用「30 秒出結果」— 對應免費速算場景，合理

### 17. Navbar（components/Navbar.tsx）
- **狀態**：正常
- **發現**：手機漢堡選單含 backdrop、locale 切換、scroll shadow、a11y aria 屬性完整

### 18. Footer（在 app/layout.tsx 行 163-212，沒獨立元件）
- **狀態**：正常
- **發現**：4 欄分類（命理服務 / 了解更多 / 法律條款 / 聯繫我們），年份用 `new Date().getFullYear()` 且加 `suppressHydrationWarning` 避免 hydration 錯誤

### 19. PricingCards（components/PricingCards.tsx）
- **狀態**：正常
- **發現**：3 方案精簡卡片（D/C/R），與 pricing/page.tsx 詳版一致

### 20. AIAnalysisCard（components/AIAnalysisCard.tsx）
- **狀態**：新元件運作正常
- **發現**：支援 5 種配色（purple/amber/emerald/blue/rose）、自動繁簡轉換、markdown 解析成 bullets、fallback 清理純文字

---

## 後續觀察建議（非阻斷，下一輪再處理）

| # | 項目 | 檔案 |
|---|------|------|
| 1 | bazi 升級區塊 line 1260「數萬條專業規則」可統一改 4,600+ | `app/tools/bazi/page.tsx:1260` |
| 2 | A/B 測試結束後，HeroCTAExperiment 統一文案 | `components/HeroCTAExperiment.tsx` |
| 3 | `app/layout.tsx:23` metadata description 仍寫「數萬條古籍規則」（全站預設） | `app/layout.tsx` |
| 4 | 各 blog 文末 CTA 文案有「30 秒」— 確認是否統一改 | `app/blog/**` |
| 5 | `ShareCard.tsx:25` 分享文案「免費體驗 30 秒就有結果」— 免費速算場景合理 | `components/ShareCard.tsx` |

---

## 驗證
- `npm run type-check`：✅ 通過，零錯誤
- 所有修改的檔案：`lib/brand.ts`、`app/page.tsx`、`app/tools/bazi/page.tsx`、`app/tools/qimen/page.tsx`、`app/tools/name/page.tsx`、`components/checkout/types.ts`
- 未改動：dashboard（按指示）、後台 /jamie（其他 agent）、A/B 測試相關

---

**稽查人**：前端 UI/UX 稽查專員
**完成時間**：2026-04-17
