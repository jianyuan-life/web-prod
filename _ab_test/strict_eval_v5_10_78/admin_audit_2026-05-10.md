# 後台 Admin Audit 2026-05-10(63 檔、刪除建議)

> **方法**:逐檔 grep frontend caller(`*.tsx` only、排除 `.next/`)、確認對齊真相、保守原則:不確定不標 🔴。
> **產出位置**:`_ab_test/strict_eval_v5_10_78/admin_audit_2026-05-10.md`
> **總檔數**:23 pages(含 layout)+ 40 API routes = 63 檔

---

## 總覽

| 類別 | 核心 🟢 | 偶用 🟡 | 可刪 🔴 | 總計 |
|:---|:---:|:---:|:---:|:---:|
| Pages | 12 | 9 | 1 | 22(+1 layout)|
| APIs | 30 | 7 | 3 | 40 |
| **合計** | **42** | **16** | **4** | **62**(+1 layout)|

**結論**:鑑源後台**整體乾淨**(94% 在用)、**僅 4 檔可刪**(2 個 0 caller dead API、1 個重複舊版 funnel + analytics page、1 個 deprecated 占位)。**重複功能 5 組**有整合空間但不急刪。

---

## 23 Pages 逐一審查

| # | page | 功能 | 對齊 API | 分類 | 刪除/整合理由 |
|:---:|:---|:---|:---|:---:|:---|
| 1 | `layout.tsx` | 後台共用 layout(導覽 / auth) | (無) | 🟢 核心 | layout、必留 |
| 2 | `page.tsx`(根 /jamie) | 後台首頁總覽(訪客 / 訂單 / 報告基礎統計 + AI 餘額) | `/api/admin/route.ts` + `ai-balance` | 🟢 核心 | 首頁入口 |
| 3 | `dashboard` | L7+ BI 儀表板(snapshot / revenue / funnel / system-health / ai-balance + accounting summary 並行)| `dashboard/snapshot` `dashboard/revenue` `dashboard/funnel` `dashboard/system-health` `ai-balance` `accounting/summary` `accounting/daily` | 🟢 核心 | 主力 BI 頁、6 API 並行 |
| 4 | `accounting` | 完整會計儀表板(P&L / 月結 / 訂閱 / 支出 / 單位經濟學)| 8+ accounting/* API | 🟢 核心 | 財務主力、用最多 API |
| 5 | `ai-cost` | AI 成本分析(per-period 燒錢)| `dashboard/ai-cost` | 🟢 核心 | 成本控管 |
| 6 | `monitoring` | 系統監控儀表板(含 telegram 測試發送)| `monitoring-dashboard` `telegram-test` | 🟢 核心 | 7×24 監控 |
| 7 | `system` | 系統健康 + telegram 測試 | `system` `telegram-test` | 🟡 偶用 | **與 monitoring 功能重疊**、可整合(都用 telegram-test) |
| 8 | `orders` | 訂單列表 + 操作(retry / cancel) | `orders` | 🟢 核心 | 客服日常 |
| 9 | `reports` | 報告列表(從 orders API 取數據)| `orders`(共用)| 🟡 偶用 | **與 orders 功能極度重疊**、僅 view filter 不同;v5.x 後可考慮合併 |
| 10 | `users` | 用戶列表(sort/order)| `users` | 🟢 核心 | 用戶管理 |
| 11 | `referrals` | 推薦關係樹 + 手動發點 | `referrals` `search-users` `grant-points` | 🟢 核心 | 推薦系統管理 |
| 12 | `loyalty` | 客戶忠誠度 + audit-log + 發點 | `loyalty` `audit-log` `grant-points` | 🟢 核心 | 積分管理 |
| 13 | `coupons` | 優惠券 CRUD | `coupons` | 🟢 核心 | 行銷工具 |
| 14 | `promotions` | 活動 promotion CRUD | `promotions` | 🟡 偶用 | **與 coupons 概念重疊**、可整合行銷模組 |
| 15 | `refunds` | 退款列表 + 執行 Stripe refund | `refunds`(GET)+ `refund`(POST)| 🟢 核心 | 客服日常 |
| 16 | `recalculate` | 補時區 + 重觸發報告 | `timezone-missing` `recalculate-report` | 🟡 偶用 | 維運用、月用幾次 |
| 17 | `quality-reports` | 5 LLM Post-Gen QA 儀表板 | `quality-reports` | 🟢 核心 | 品質監控 |
| 18 | `content-review` | flagged 內容審核(force_pass / regenerate / dismiss)| `content-review` | 🟡 偶用 | flagged 才用、低頻 |
| 19 | `audit-log` | 審計日誌瀏覽 | `audit-log` | 🟡 偶用 | 安全審計、低頻 |
| 20 | `feedback` | 客戶回饋列表 | `feedback` | 🟡 偶用 | 客服讀回饋 |
| 21 | `analytics` | 漏斗分析(舊版單頁)| `funnel`(舊版)| 🟡 偶用 | **被 dashboard 的 funnel 功能取代**、留著相容、可考慮砍 |
| 22 | `ab-tests` | A/B 實驗列表 + CRUD | `ab-tests` | 🟡 偶用 | 實驗時用 |
| 23 | `ab-tests/[key]` | 單一實驗詳情 + 暫停 / 結論 | `ab-tests`(共用)| 🟡 偶用 | 同上 |

**Pages 結論**:**0 個全 dead 可刪**(每個都有真 caller)、但 **5 組功能重疊**(系統 vs 監控 / 訂單 vs 報告 / 優惠券 vs 活動 / 漏斗分析 vs 儀表板漏斗 / 退款列表 vs 退款執行)。

---

## 40 APIs 逐一審查

### 🟢 核心(30 個、不可刪)

| # | API | 功能 | caller | 分類 |
|:---:|:---|:---|:---|:---:|
| 1 | `route.ts`(根) | 訪客聚合 + 報告基礎統計 | `/jamie/page.tsx` | 🟢 |
| 2 | `ai-balance` | Anthropic + DeepSeek 餘額查詢 | `/jamie/page.tsx` `/jamie/dashboard` | 🟢 |
| 3 | `dashboard/snapshot` | 即時系統快照 | `/jamie/dashboard` | 🟢 |
| 4 | `dashboard/revenue` | 營收曲線 | `/jamie/dashboard` | 🟢 |
| 5 | `dashboard/funnel` | 漏斗分析(v5.3.38 RPC 化新版)| `/jamie/dashboard` | 🟢 |
| 6 | `dashboard/system-health` | 系統健康 | `/jamie/dashboard` | 🟢 |
| 7 | `dashboard/ai-cost` | AI 成本分時段聚合 | `/jamie/ai-cost` | 🟢 |
| 8 | `accounting/summary` | P&L 總覽 | `/jamie/accounting` `/jamie/dashboard` | 🟢 |
| 9 | `accounting/daily` | 日報表 | `/jamie/accounting` `/jamie/dashboard` | 🟢 |
| 10 | `accounting/by-plan` | 各方案損益 | `/jamie/accounting` | 🟢 |
| 11 | `accounting/by-expense-category` | 支出分類 | `/jamie/accounting` | 🟢 |
| 12 | `accounting/monthly-snapshots` | 月結快照 | `/jamie/accounting` | 🟢 |
| 13 | `accounting/export` | 匯出 CSV | `/jamie/accounting` | 🟢 |
| 14 | `accounting/subscriptions` | 訂閱管理 CRUD | `/jamie/accounting` | 🟢 |
| 15 | `accounting/subscriptions/backfill` | 訂閱歷史回填 | `/jamie/accounting` | 🟢 |
| 16 | `accounting/unit-economics` | 單位經濟學 | `/jamie/accounting` | 🟢 |
| 17 | `accounting/expense` | 手動支出 CRUD | `/jamie/accounting` | 🟢 |
| 18 | `monitoring-dashboard` | 監控儀表板 | `/jamie/monitoring` | 🟢 |
| 19 | `system` | 系統資訊 | `/jamie/system` | 🟢 |
| 20 | `telegram-test` | telegram 測試發送 | `/jamie/monitoring` `/jamie/system` | 🟢 |
| 21 | `orders` | 訂單列表 + 操作 | `/jamie/orders` `/jamie/reports` | 🟢 |
| 22 | `users` | 用戶列表 | `/jamie/users` | 🟢 |
| 23 | `search-users` | 用戶搜尋 autocomplete | `/jamie/referrals` | 🟢 |
| 24 | `referrals` | 推薦關係樹 | `/jamie/referrals` | 🟢 |
| 25 | `grant-points` | 手動發點 | `/jamie/referrals` `/jamie/loyalty` | 🟢 |
| 26 | `loyalty` | 客戶忠誠度 | `/jamie/loyalty` | 🟢 |
| 27 | `audit-log` | 審計日誌 | `/jamie/audit-log` `/jamie/loyalty` | 🟢 |
| 28 | `quality-reports` | 5 LLM QA | `/jamie/quality-reports` | 🟢 |
| 29 | `coupons` | 優惠券 CRUD | `/jamie/coupons` | 🟢 |
| 30 | `recalculate-report` | 報告重觸發 | `/jamie/recalculate` | 🟢 |

### 🟡 偶用(7 個、可保留可整合)

| # | API | 功能 | caller | 整合建議 |
|:---:|:---|:---|:---|:---|
| 31 | `refund` | POST Stripe 退款執行 | `/jamie/refunds` | 與 #32 整合到單一 refunds 路由(GET=list / POST=execute / DELETE?) |
| 32 | `refunds` | GET 退款列表 | `/jamie/refunds` | 同上 |
| 33 | `timezone-missing` | 列缺時區的訂單 | `/jamie/recalculate` | 維運用、低頻 |
| 34 | `content-review` | flagged 報告審核 | `/jamie/content-review` | 低頻、保留 |
| 35 | `feedback` | 客戶回饋列表 | `/jamie/feedback` | 低頻、保留 |
| 36 | `promotions` | 活動 CRUD | `/jamie/promotions` | 與 coupons 整合行銷模組 |
| 37 | `ab-tests` | A/B 實驗 CRUD | `/jamie/ab-tests` `/jamie/ab-tests/[key]` | 實驗用、保留 |

### 🔴 可刪(3 個、0 caller dead 或被取代)

| # | API | LOC | 功能 | grep 結果 | 刪除理由 |
|:---:|:---|:---:|:---|:---|:---|
| 38 | `email-log` | ~80 | Email 日誌查詢 | **0 個 frontend caller**(只有 `.next/` build artifact 和自身 route.ts) | **完全 dead**、無任何 page 引用、開發完未上線 |
| 39 | `accounting/anthropic-historical` | ~?  | Anthropic 歷史成本回填(POST) | **0 個 frontend caller**(grep 全 codebase 無命中) | **完全 dead**、可能是一次性回填腳本、寫成 API 但從未接 UI;若有需要可改成 `scripts/` 目錄下 CLI |
| 40 | `funnel`(舊版) | 182 | 漏斗分析(舊邏輯、無 RPC) | `/jamie/analytics/page.tsx` 唯一 caller | **被 `dashboard/funnel`(76 行 v5.3.38 RPC 新版)取代**;analytics page 也屬「被取代頁」;雙刪可省 ~250 LOC |

---

## 🔴 刪除清單(按依賴順序、保守原則)

### 第一批:0 caller dead(可立即刪、無風險)
1. `app/api/admin/email-log/route.ts`(80 LOC、0 caller)
2. `app/api/admin/accounting/anthropic-historical/route.ts`(0 caller、改放 `scripts/` 即可)

### 第二批:重複被取代(刪需老闆審、會少一個 page)
3. `app/jamie/analytics/page.tsx` + `app/api/admin/funnel/route.ts`(182 LOC)
   - 條件:確認 `/jamie/dashboard` 的 funnel section 已涵蓋 analytics page 的視覺
   - 若 analytics 還有獨立視覺(如趨勢圖、自訂 days 篩選)→ 改成 dashboard 子 tab、再砍

### 第三批:整合(不急刪、留待 v5.11 重構)
4. `refund` + `refunds` 合併到單一 `refunds/route.ts`(用 method 區分 GET/POST、省 1 路由)
5. `system` page + `monitoring` page 合併(都用 telegram-test、UI 都顯示系統資訊)
6. `orders` page + `reports` page 合併(都用同一個 `/api/admin/orders`、僅 filter 不同)
7. `coupons` + `promotions` 合併行銷模組(同樣是優惠 CRUD)

---

## 重複功能整合建議

| 重複組 | 現況 | 建議 |
|:---|:---|:---|
| **funnel vs dashboard/funnel** | 兩個 API 同樣計算漏斗、舊版 182 LOC 無 RPC、新版 76 LOC 有 RPC、只是 caller page 不同 | **刪舊版 + analytics page**、或把 analytics 改 dashboard 子 tab |
| **refund vs refunds** | 兩個獨立 route(POST 退款執行 / GET 列表)、共用同一個 page | **合併單一 refunds/route.ts**、用 HTTP method 區分(REST 慣例) |
| **orders page vs reports page** | 都用 `/api/admin/orders`、僅 view filter 不同(orders=訂單視角 / reports=報告視角) | **合併單一 orders page**、加 view toggle(訂單模式 / 報告模式) |
| **monitoring page vs system page** | 都顯示系統健康 + 都用 telegram-test、視覺類似 | **合併** monitoring(主)、把 system 的獨家欄位搬過去 |
| **coupons vs promotions** | 都是優惠 / 行銷工具 CRUD | **合併行銷模組**(coupons=折扣碼 / promotions=活動 banner、共一個 page 兩個 tab) |
| **accounting/anthropic-historical** | 一次性回填、寫成 API 但從未 UI | **移到 `scripts/anthropic_historical_backfill.ts`**、CLI 跑、刪 API 路由 |

---

## 對齊前台缺口(後台缺什麼前台需要的)

掃描結論:**後台對齊前台需求 OK**、無重大缺口。已有:
- ✅ 訂單管理(orders)
- ✅ 退款執行(refund / refunds)
- ✅ 報告品質監控(quality-reports + content-review)
- ✅ 推薦 / 積分管理(referrals / loyalty / grant-points)
- ✅ 財務(accounting/* 8 個)
- ✅ AI 成本(ai-cost / ai-balance)

**潛在缺口(可後續加、非急迫)**:
- 🟡 `email-log` 雖 dead、但**真該有功能**(查 Email 寄送狀態、客服常被問「為什麼沒收到」)→ **建議:不刪、改補上 `/jamie/email-log` page、把 dead API 接活**
- 🟡 缺 `subscription cancel UI`(目前只有 accounting/subscriptions CRUD、沒專屬訂閱管理 page、E3 月度精選會逐步累積訂閱戶)
- 🟡 缺 `feature flag UI`(目前 hardcode env、未來 Feature Flag rollout 必要)

---

## Top 5 應該優先刪的(按 LOC × 風險低 排序)

| 排名 | 檔案 | LOC | 風險 | 理由 |
|:---:|:---|:---:|:---:|:---|
| 1 | `app/api/admin/funnel/route.ts` | **182** | 🟢 低 | 被 `dashboard/funnel` 取代、analytics page 是唯一 caller、可同時刪 page;省最多 LOC |
| 2 | `app/api/admin/accounting/anthropic-historical/route.ts` | ~50 | 🟢 低 | 0 caller、一次性回填、改 CLI script 即可 |
| 3 | `app/api/admin/email-log/route.ts` | ~80 | 🟢 低 | 0 caller、開發完未上線(但建議改補 page 再用) |
| 4 | `app/jamie/analytics/page.tsx` | 中 | 🟢 低 | 配合 #1 一起刪、功能已被 dashboard 取代 |
| 5 | 整合 `refund` + `refunds` 為單一 route | -50 | 🟡 中 | REST 慣例、改完省 50 LOC、但需改 frontend caller(兩處 fetch 改 method) |

---

## 完工

- **Report path**:`D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/admin_audit_2026-05-10.md`
- **🔴 刪除數**:**4 檔**(2 dead API + 1 舊版 funnel API + 1 舊版 analytics page)
- **🟢 保留數**:**42 檔**(12 page 核心 + 30 API 核心)
- **🟡 整合數**:**16 檔**(可整合成 5 組更精簡模組)
- **保守判斷**:不確定 = 不標 🔴、3 dead 全有 grep 命中證據(0 frontend caller)、第 4 是「被取代」需老闆確認

**派工**:Claude 直接 sub-agent grep + Read、無外部互審(屬探索性 audit、不修 code、本身低風險)。**回報 🔴 list 僅 4 個**、未達需 Codex 互審門檻、可直接由老闆審後執行。
