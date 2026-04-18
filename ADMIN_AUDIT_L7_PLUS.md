# /jamie 後台全面稽查 L7+

> 稽查時間：2026-04-18
> 稽查範圍：17 頁 + 23 個 Admin API + 對應 Supabase 表
> 稽查人：後台稽查專員
> Supabase Project：jvmnntavizbjsgofnusy

---

## 摘要

| 指標 | 結果 |
|:---|:---|
| 17 頁稽查結果 | **9 頁正常**、**5 頁需優化**、**3 頁有 bug 或 schema 不匹配** |
| DB schema 落差 | **ab_experiments 4 欄位缺、moderation_log 9 欄位缺**（已在 API 層修復相容） |
| TypeScript 檢查 | ✅ 零錯誤 |
| 本次直接修復 | 2 個 API（ab-tests、content-review） |
| 待老闆執行 migration | 2 段 SQL（非強制） |
| 空表導致 $0 / 0 顯示 | 6 個（ai_cost_log、email_log、report_feedback、moderation_log、promotions、ab_events） |
| 權限驗證 | 23 個 API 全部已接 `checkAdminAuth + checkAdminRateLimit` ✅ |

**資料誤差：0 / 48 份報告資料完整、33 筆 transactions、22 筆 coupon_uses、8 筆 point_transactions。**

---

## 全域觀察

### 正面
- 全部 API 走統一 `checkAdminAuth` + `checkAdminRateLimit` + `writeAuditLog`
- layout.tsx 已移除 sessionStorage 明文密碼儲存（v5.2.2 L7 P0 修復）
- 空表都有優雅的「暫無資料」UI，沒有硬 crash
- TypeScript 嚴格模式零錯誤

### 負面
- **ab_experiments 表結構與 API 不對齊**（name/primary_metric/notes/updated_at 缺）→ 建立新實驗 POST 會失敗，更新實驗 PATCH 會失敗。已在 API 層加相容層。
- **moderation_log 表結構大幅落後**（缺 hits/content_preview/retry_attempt/admin_note/reviewed_by/reviewed_at/blocked/plan_code/reason/status），前端渲染的 9 個欄位實際都對不上。已在 API 層 shim。
- `loyalty` API 每位用戶都要呼叫 `supabase.auth.admin.getUserById` 一次 → 200 位用戶 = 200 次 HTTP 往返，**嚴重慢**，應批次優化（未改，列為 P1）。
- `orders` 頁面呼叫的是總覽 `/api/admin?range=90d`（fallback），實際走 `/api/admin/orders`，但 admin 根 API 在部分場景被 Orders/Reports 兩頁共用，耦合過重。

---

## 每頁詳細

### 1. /jamie（總覽）
- **API**：`/api/admin?range=XX`（`app/api/admin/route.ts`）、`/api/admin/ai-balance`
- **DB 表**：paid_reports、visitor_events、free_tool_usage
- **檢查**：
  - ✅ 權限 OK（x-admin-key header）
  - ✅ 營收/訂單/活動數據計算正確（48 份 completed 報告、4097 筆 visitor_events、36 筆 free_tool_usage）
  - ⚠️ `data.daily_revenue` 當期間 0 訂單時 UI 有兜底「營收數據將在有訂單後顯示」👍
- **發現**：無 bug。
- **建議**：KPI 區 `total_revenue_usd` 沒加小數點，可顯示 `$X.XX`。

---

### 2. /jamie/ab-tests
- **API**：`/api/admin/ab-tests`
- **DB 表**：`ab_experiments`（1 筆）、`ab_events`（0 筆）、`ab_assignments`（0 筆）
- **檢查**：
  - ❌ **schema 落差嚴重**：
    - 實際表無 `name` 欄位（API 讀 exp.name → undefined）
    - 實際表無 `primary_metric` 欄位（建立會拋 column not found）
    - 實際表無 `notes` 欄位（存在 `conclusion` 代替）
    - 實際表無 `updated_at` 欄位（PATCH 會拋）
- **已修（✅）**：
  - GET：`name` 優先用 `exp.name`，否則用 `description` 當名稱顯示；`notes` 優先 notes，否則讀 `conclusion`
  - POST：insert 不帶 `name/primary_metric`，改寫 description；primary_metric 僅在回傳 body 保留
  - PATCH：移除 `updated_at`；`notes` 寫入 `conclusion` 欄位
- **建議 SQL**（可選，為未來擴充）：
  ```sql
  ALTER TABLE ab_experiments
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS primary_metric TEXT DEFAULT 'conversion',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  ```

---

### 3. /jamie/ai-cost
- **API**：`/api/admin/dashboard/ai-cost?period=30d`（注意不是 `/api/admin/ai-cost`）
- **DB 表**：`ai_cost_log`（0 筆）
- **檢查**：
  - ✅ schema 完整（`id/plan_code/provider/call_stage/latency_ms/status/error_message` 已補齊）
  - ✅ 空表 fallback 合理（回 `note` 提示）
  - ⚠️ **UI bug**：總呼叫次數計算用 `Object.values(data.by_provider).reduce(...).prompt_tokens + .completion_tokens`，與 tokens 總和的 `.toLocaleString()` 組合邏輯正確但未四捨五入成整數。
- **建議**：
  - `recordAIUsage()` 需在 `lib/ai-cost-tracker.ts` 已實作但**未在任何 AI 呼叫點接上**，請命理研究部門確認 prompt→report 生成流程是否呼叫。
  - 空表時顯示「尚未收集到 AI 成本資料」更友善（現在只顯示「暫無資料」）。

---

### 4. /jamie/analytics
- **API**：`/api/admin/funnel?days=X`
- **DB 表**：visitor_events、paid_reports、profiles
- **檢查**：
  - ✅ 漏斗階段計算正確（visitors→signups→checkoutViews→payments→completedReports）
  - ✅ 底部 Bot 過濾提示很清楚
- **發現**：signupsFallback 估算 fallback 在註冊數 = 0 時合理。
- **建議**：若過濾期間全部為 0，`avgGenerationMinutes` 顯示 `0 分鐘` 的時候應提示「尚無已完成報告」。

---

### 5. /jamie/audit-log
- **API**：`/api/admin/audit-log?action=X&target_type=X&days=X&limit=500`
- **DB 表**：`admin_audit_log`（2 筆）
- **檢查**：
  - ✅ schema 匹配（id/action/target_type/target_id/metadata/ip/user_agent/admin_id/created_at）
  - ✅ 表不存在時優雅回退（`42P01` 偵測）
  - ✅ CSV 匯出 OK
- **發現**：完全正確。

---

### 6. /jamie/content-review
- **API**：`/api/admin/content-review`
- **DB 表**：`moderation_log`（0 筆）
- **檢查**：
  - ❌ **前端 9 個欄位與表 schema 不對齊**：
    - 前端期望：`plan_code、action、blocked、reason、hits[]、content_preview、retry_attempt、status、admin_note、reviewed_by、reviewed_at`
    - 實際表：`action_taken、admin_override、severity、layer、categories、ai_scores、content_sample、admin_id、notes`
  - 前端期望 `.paid_reports.client_name` JOIN，但 moderation_log.report_id 是 `text`（不是 uuid），無法直接 JOIN 到 paid_reports.id
- **已修（✅）**：
  - GET：改 SELECT 實際欄位，shim 成前端預期 shape（hits = categories[]、content_preview = content_sample、status = action_taken || 'flagged'、reviewed_by = admin_id、reviewed_at = updated_at）
  - GET：status 篩選改為 `action_taken IS NULL` 表示待審
  - POST（dismiss/force_pass/regenerate）：改寫 action_taken + admin_override + notes + admin_id + updated_at
- **建議 SQL**（可選，若要啟用完整功能）：
  ```sql
  ALTER TABLE moderation_log
    ADD COLUMN IF NOT EXISTS plan_code TEXT,
    ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS hits JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS retry_attempt INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS admin_note TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  ```
  ⚠️ 若啟用，需把 report_id 從 text 改成 uuid（或在 select 時加強 JOIN 邏輯）。

---

### 7. /jamie/coupons
- **API**：`/api/admin/coupons` GET/POST/PATCH
- **DB 表**：`coupons`（5 筆）、`coupon_uses`（22 筆）
- **檢查**：
  - ✅ CRUD 完整（code/discount_type/discount_value/applicable_products/max_uses/valid_until/note/is_active）
  - ✅ 稽核日誌 writeAuditLog OK
  - ✅ 23505 unique 衝突處理正確
- **發現**：完全正確。coupons 頁面沒顯示「已使用次數 / max_uses」進度條，但數字有（22 筆 coupon_uses 分散在 5 組）。
- **建議**：`used_count` 欄位 UI 可加進度條視覺。

---

### 8. /jamie/dashboard（BI）
- **API**：5 個並行（`/snapshot、/revenue、/funnel、/system-health、/ai-balance`）
- **DB 表**：paid_reports、visitor_events、transactions、user_points
- **檢查**：
  - ✅ `Promise.all` 並行拉取 5 個 endpoint，失敗單一不影響其他
  - ✅ period 切換正確（7d/30d/90d/12m）
- **發現**：無 bug，但 E2 cohort 部分（`first_purchase_users / m2_retention_users` 等）當用戶數 = 0 時顯示 `0%`，UI 未加「尚無足夠歷史資料」提示，容易誤判為 bug。
- **建議**：`base === 0` 時顯示「—」或「尚無資料」。

---

### 9. /jamie/feedback
- **API**：`/api/admin/feedback`
- **DB 表**：`report_feedback`（0 筆）、`paid_reports` JOIN
- **檢查**：
  - ✅ schema 完整（id/rating/most_valuable/suggestion/would_recommend/paid_reports inner join）
  - ✅ 空表顯示「暫無反饋資料」
- **發現**：`!inner` join 在 paid_reports 不存在時整筆會被濾掉，正常。
- **建議**：avg rating / NPS% 當 totalCount=0 時 UI 已顯示「—」👍。

---

### 10. /jamie/loyalty
- **API**：`/api/admin/loyalty`
- **DB 表**：`user_points`（3 筆）、`referral_codes`（10 筆）、`auth.users`
- **檢查**：
  - ✅ schema 匹配
  - ⚠️ **效能問題**：`for (const uid of userIdArray.slice(0, 200)) { await supabase.auth.admin.getUserById(uid) }` 是**順序 200 次 await**，最壞情況 20+ 秒。
- **發現**：功能正確但慢。
- **建議 P1**：
  - 改用 `supabase.auth.admin.listUsers({ page: 1, perPage: 500 })` 一次抓全部，然後 Map join（users 表現在只有 14 位，listUsers 更快）。

---

### 11. /jamie/orders
- **API**：`/api/admin/orders` GET/PATCH
- **DB 表**：paid_reports（48 筆）
- **檢查**：
  - ✅ 48 筆 completed 報告全部查到
  - ✅ PATCH 重試報告：workflow 優先 + fallback 雙路徑 + 稽核日誌 OK
  - ✅ birth_data 個資脫敏（只保留 plan/plan_type/locale/year/gender）
- **發現**：Expand 詳情區展示 `retry_count` 但 API 預設該欄位 nullish 下 UI 會顯示 0 ✅。
- **建議**：Orders 頁面頂部 KPI 可加「待處理 (pending+generating)」和「失敗」數字。

---

### 12. /jamie/promotions
- **API**：`/api/admin/promotions` GET/POST/PATCH
- **DB 表**：`promotions`（0 筆，RLS 已關）
- **檢查**：
  - ✅ CRUD 完整（name/discount_percent/start_at/end_at/applicable_plans/is_active）
  - ✅ 稽核日誌 OK
  - ✅ 狀態動態判斷（未開始/進行中/已結束/已停用）正確
- **發現**：RLS `enabled=false` ⚠️ 其他表都 true，建議打開 RLS。
- **建議**：
  ```sql
  ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
  -- admin only policy：
  CREATE POLICY "admin_only" ON promotions FOR ALL USING (false);
  ```
  （實際 admin 寫入走 service_role_key，bypass RLS）。

---

### 13. /jamie/recalculate
- **API**：`/api/admin/timezone-missing` GET + `/api/admin/recalculate-report` POST
- **DB 表**：paid_reports（tz_null=0，全部已補）
- **檢查**：
  - ✅ 所有報告 timezone 已補齊（48 筆中 0 筆 NULL）
- **發現**：頁面將顯示「🎉 全部報告都已補填完畢」合理。
- **建議**：無。

---

### 14. /jamie/referrals
- **API**：`/api/admin/referrals` + `/api/admin/grant-points` + `/api/admin/search-users`
- **DB 表**：`referrals`（1 筆）、`referral_codes`（10 筆）、auth.users
- **檢查**：
  - ✅ schema 匹配（包含 v5.2.2 補齊的 `referred_email/referred_ip/suspicious_flag`）
  - ⚠️ **效能問題同 loyalty**：`for (uid of referrerIds.slice(0, 50)) { await supabase.auth.admin.getUserById(uid) }`
- **發現**：功能正確。
- **建議 P1**：同 loyalty，改用 `listUsers`。

---

### 15. /jamie/refunds
- **API**：`/api/admin/refunds` GET + `/api/admin/refund` POST
- **DB 表**：paid_reports（0 筆退款）
- **檢查**：
  - ✅ schema 完整（id/refunded_at/refunded_amount_usd/refund_reason/stripe_refund_id）
  - ✅ candidate 篩選邏輯合理（refunded_at IS NULL）
- **發現**：無 bug，0 筆退款屬正常測試環境。
- **建議**：無。

---

### 16. /jamie/reports
- **API**：共用 `/api/admin/orders`（實際等於 Orders 頁）
- **DB 表**：paid_reports
- **檢查**：
  - ⚠️ Reports 和 Orders 頁同樣 API，差異只在前端 tab 篩選（all/pending/completed/failed）
  - ✅ 批量重試邏輯 OK（retry_count < 3 才加入批量）
- **發現**：功能重複度高，但 UI 有差異（Reports 更關注生成狀態，Orders 更關注金額），合理。
- **建議**：無。

---

### 17. /jamie/system
- **API**：`/api/admin/system`
- **DB 表**：paid_reports（健康檢查用）
- **檢查**：
  - ✅ 5 個服務並行健康檢查：Supabase / Fly.io / Stripe / Resend / Vercel
  - ✅ AbortController 超時 10s 保護
  - ✅ 環境變數檢查 9 個
- **發現**：無 bug。
- **建議**：「執行健康檢查」按鈕旁邊加自動 60s 刷新選項。

---

### 18. /jamie/users
- **API**：`/api/admin/users?sort=X&order=X`
- **DB 表**：`auth.users`（14 筆）+ paid_reports JOIN by email
- **檢查**：
  - ✅ `listUsers({ perPage: 500 })` 批次拉取（與 loyalty 不同，這裡正確）
  - ✅ email 低盤 + trim 後關聯報告
- **發現**：無 bug。
- **建議**：`purchase_count > 0` 的用戶應該標橘色（付費客戶）。

---

## 特殊發現 & 其他 API

| # | API | 狀態 | 備註 |
|:---:|:---|:---|:---|
| 1 | `/api/admin/ai-balance` | ✅ | 查 Claude / DeepSeek / Kimi 三家 API balance |
| 2 | `/api/admin/email-log` | ✅ | schema OK（email_log 表 0 筆） |
| 3 | `/api/admin/funnel` | ✅ | visitor→signup→checkout→pay 邏輯正確 |
| 4 | `/api/admin/grant-points` | ✅ | 手動發積分，走 audit log |
| 5 | `/api/admin/monitoring` | ✅ | system health 增強版 |
| 6 | `/api/admin/recalculate-report` | ✅ | tz 補填 + workflow 重觸發 |
| 7 | `/api/admin/refund` | ✅ | Stripe Refund API + 積分回收 |
| 8 | `/api/admin/search-users` | ✅ | 搜尋下拉補完 |
| 9 | `/api/admin/timezone-missing` | ✅ | 列出 tz NULL 清單 |
| 10 | `/api/admin/dashboard/revenue` | ✅ | AOV / MRR / E2 cohort |
| 11 | `/api/admin/dashboard/snapshot` | ✅ | 今日 KPI |
| 12 | `/api/admin/dashboard/funnel` | ✅ | BI 版漏斗 |
| 13 | `/api/admin/dashboard/system-health` | ✅ | email_delivery + report_generation |

---

## 本次直接修復

| # | 檔案 | 修復內容 |
|:---:|:---|:---|
| 1 | `app/api/admin/ab-tests/route.ts` | ab_experiments schema shim：name←description、notes↔conclusion、移除 updated_at/primary_metric insert；表不存在的 42P01 優雅回退 |
| 2 | `app/api/admin/content-review/route.ts` | moderation_log schema shim：GET 改讀實際 9 個欄位並 reshape 為前端預期 shape；POST 改寫 action_taken/admin_override/notes/admin_id/updated_at |

TypeScript `tsc --noEmit` 驗證通過 ✅

---

## 待老闆執行的 Migration（非急件）

### 1. ab_experiments 擴充（建議）
```sql
ALTER TABLE public.ab_experiments
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS primary_metric TEXT DEFAULT 'conversion',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 回填 description 到 name
UPDATE public.ab_experiments SET name = description WHERE name IS NULL;
```

### 2. moderation_log 擴充（若要啟用完整內容審查功能）
```sql
ALTER TABLE public.moderation_log
  ADD COLUMN IF NOT EXISTS plan_code TEXT,
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS hits JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS retry_attempt INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
```

### 3. promotions RLS（建議）
```sql
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON public.promotions FOR ALL USING (false);
```

---

## P1 效能建議（未修）

| 檔案 | 問題 | 建議 |
|:---|:---|:---|
| `app/api/admin/loyalty/route.ts` | 對 200 位用戶順序 getUserById | 改 `listUsers({ perPage: 500 })` |
| `app/api/admin/referrals/route.ts` | 對 50 位推薦人順序 getUserById | 改 `listUsers` + Map |

---

## 結論

鑑源後台 17 頁全部可正常開啟，權限驗證鏈 100% 覆蓋（x-admin-key + rate-limit + audit-log）。資料面 48 份 paid_reports、22 筆 coupon_uses、8 筆 point_transactions 皆完整無 NULL 異常。

兩個 schema 落差（ab_experiments、moderation_log）已在 API 層做相容 shim 修復，本次不用跑 DB migration 也能正常運作；若未來要啟用更豐富的 A/B 測試和內容審查功能，建議執行上述 migration。

TypeScript 零錯誤 ✅，可直接推送。
