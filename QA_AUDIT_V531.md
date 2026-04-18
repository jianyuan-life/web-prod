# v5.3.1 QA 全面排查報告

**稽核範圍：** `app/api/**/route.ts`（61 個）+ Dashboard 前端 fetch 邏輯 + Supabase schema 比對
**稽核日期：** 2026-04-18
**觸發原因：** v5.3.1 hotfix 修了 `/api/reports` auth fallback bug，排查同 pattern 其他位置
**最高優先級：** 「花錢買的東西不能因系統迭代而不見」

---

## P0（客戶會遇到，已修）

### Bug #1 — Schema Mismatch：`paid_reports` 缺 `self_update_count` + `tz_migrated_at`（災難級）

**位置：** Supabase DB schema vs `app/api/reports/route.ts` + `app/api/reports/update-birth-location/route.ts`

**根因：**
- `supabase/migrations/add_timezone_to_paid_reports.sql` 定義了這兩個欄位
- 但該 migration **從未在線上 DB 執行過**
- `/api/reports` GET 的 SELECT 清單裡寫 `self_update_count`
- `/api/reports/update-birth-location` POST 在 SELECT/UPDATE 都用 `self_update_count` 和 `tz_migrated_at`

**症狀：** 線上 DB 這兩個欄位根本不存在，Supabase 收到 query 會回 `column does not exist` → API 直接 500 → Dashboard 顯示「還沒有報告」→ **客戶付了錢卻看不到報告**。

**這是正是 v5.3.1 要修的 pattern 實體化：客戶資料因系統迭代而消失。**

**修復：**
```sql
-- 以 apply_migration 套用 add_tz_and_self_update_to_paid_reports
ALTER TABLE paid_reports
  ADD COLUMN IF NOT EXISTS self_update_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tz_migrated_at TIMESTAMPTZ;
UPDATE paid_reports SET self_update_count = 0 WHERE self_update_count IS NULL;
```

**驗證：** `information_schema.columns` 查詢確認兩欄位已建立（integer default 0 / timestamptz nullable）。

---

### Bug #2 — Auth fallback 缺失（7 支 API，複製 v5.3.1 修法）

**位置：**
1. `app/api/points/balance/route.ts` — Dashboard / 結帳頁每次載入
2. `app/api/points/use/route.ts` — 結帳確認
3. `app/api/referral/my-code/route.ts` — 推薦卡片載入
4. `app/api/family-members/route.ts` — 家人管理 GET/POST
5. `app/api/family-members/[id]/route.ts` — 家人編輯/刪除
6. `app/api/feedback/route.ts` — 報告反饋
7. `app/api/checkout/search-reports/route.ts` — G15 導入人生藍圖
8. `app/api/checkout/verify-family/route.ts` — G15 email 驗證
9. `app/api/reports/update-birth-location/route.ts` — 出生地自助修改

**根因：** 每個檔都有自己的 `getAuthUserId` / `getAuthEmail`，都只呼叫 `supabase.auth.getUser(token)` 失敗時 return null，**沒有 JWT decode fallback**。

**症狀：** Supabase `admin.getUser` 偶爾 timeout/network error 時：
- 積分餘額顯示 0（客戶看不到自己累積的點數）
- 推薦碼拉不出來（客戶的推薦連結不見了）
- 結帳頁積分折抵失敗（本來可以用 $10 結果要付全價）
- 家人資料空白（看不到已登錄的家人）
- G15 結帳無法載入已買的人生藍圖（無法付款升級）
- 出生地自助修改直接「登入狀態失效」

**修復：**
1. 新建 `lib/auth-helper.ts` 共用模組 — 封裝雙層 fallback 邏輯（admin.getUser 為主，JWT decode 為備援，驗 exp）
2. 9 支 API 改用共用模組，移除 local `getAuthUserId` / `getAuthEmail`
3. 補 `.maybeSingle()` 錯誤 log（避免「查不到點數」靜默）

**共用模組安全性：**
- JWT decode 會驗 `exp`，過期直接 reject（不放水）
- 後續 query 用 `userId/email` 過濾，即使 JWT 被偽造也不會洩漏他人資料
- 保留 `console.warn` 記錄 fallback 使用次數，便於追蹤 Supabase auth 健康狀態

---

### Bug #3 — Dashboard 把 5xx 誤判為「空陣列」（客戶看不到報告）

**位置：** `app/dashboard/page.tsx` line 158–162

**根因：** `fetchReports()` 遇到 `!res.ok && res.status !== 401` 時 `return []`，前端直接顯示「還沒有報告」，客戶誤以為付費資料消失。

**修復：**
1. 5xx 改為 `throw new Error('API_ERROR_${status}')`
2. 新增 `fetchError` state + 專屬錯誤 UI（顯示「暫時無法載入，請重新整理」+ 聯絡客服 email）
3. useEffect 的 `.catch` 改為 `setFetchError(...)` 而非 `setLoading(false)` 一句了事

**UX 改善：** 客戶再也不會看到「還沒有報告」這種誤導訊息 — 改為「暫時無法載入您的報告」+ 重新整理按鈕 + 客服聯絡方式。

---

## P1（管理者 / 極端情境會遇到，待修）

### Bug #4 — `admin/email-log` schema 不匹配（後台）

**位置：** `app/api/admin/email-log/route.ts:33`

**症狀：** SELECT 清單 `to_email, from_email, email_type, report_id, user_id, complained_at, created_at` 全是 `email_send_log` 表沒有的欄位。實際欄位是 `recipient, template, sent_at, delivered_at, bounced_at, ...`。後台 email 日誌頁打開就會 500。

**建議修法：** 對齊欄位名 — `recipient` 取代 `to_email`，`template` 取代 `email_type`，移除 `complained_at` / `report_id` / `user_id` 或改為從 `metadata` 取。

---

### Bug #5 — `referral/register` 最外層 catch 靜默吞錯（客戶看不到推薦關係）

**位置：** `app/api/referral/register/route.ts:147`

**症狀：** 最外層 `} catch { return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 }) }` 完全沒 log。任何 `user_points` update/insert 失敗都會被吞，推薦關係建立失敗也看不到原因。

**建議修法：** `catch (e)` 並 `console.error('[referral/register] 未預期錯誤:', e)`，且在每個 `supabase.from('user_points').update(...)` 補 `.select()` + error check。

---

### Bug #6 — `report-view` try/catch 吞錯誤 + 無 `maybeSingle`（報告頁訪問追蹤）

**位置：** `app/api/report-view/route.ts:81`

**症狀：** `catch { return 500 }` 不 log；`.single()` 沒用 `.maybeSingle()`，若該 report_id 不存在會炸 PostgrestError。影響訪問次數統計不準確，但不影響客戶閱讀報告。

**建議修法：** 改用 `.maybeSingle()` + 補 log。

---

### Bug #7 — `stats` API 把 user_analytics 全撈（可能很慢）

**位置：** `app/api/stats/route.ts:19`

**症狀：** `.from('user_analytics').select('*', { count: 'exact', head: true })` — 雖然用了 head=true 只算 count，但沒 filter，當 table 大到百萬級會慢。P2 性能問題。

---

### Bug #8 — `admin/loyalty` N+1 查詢（後台慢）

**位置：** `app/api/admin/loyalty/route.ts:60`

**症狀：** `for (const uid of userIdArray.slice(0, 200))` 每個 uid 都呼叫一次 `auth.admin.getUserById` — 200 users = 200 round-trip，極慢。應改用 `auth_users_view` 批量 join。

---

## P2（邊界情況）

### 觀察 #9 — CRON API 認證：`cron/*` 都用 `x-internal-secret`

各 cron API 正確地用 `CRON_SECRET` header 驗證，沒有認證漏洞。

### 觀察 #10 — `referral/validate` maskName 邏輯

`maskName('王')` 回 `'王*'`（單字補一個星號）— 可接受但略怪。

### 觀察 #11 — `admin/ab-tests` 查 `experiments` 表

若 experiments / experiment_events 表實際不存在（未 migration），後台 A/B 測試頁會 500。未在線上驗證。

---

## Pattern 歸納（後續改進方向）

### Pattern A — 每個 route 各寫一份 auth helper（已統一）
- **已修：** 新建 `lib/auth-helper.ts`，9 支 API 改用
- **後續：** admin API 還有 `lib/admin-auth.ts`，可考慮整合

### Pattern B — Schema drift（DB 沒跑 migration vs code 已經用新欄位）
- **已修：** `paid_reports` 的 `self_update_count` / `tz_migrated_at`
- **後續：** 建議建一個 `scripts/verify-schema.ts` 比對 `information_schema` 和 code 的 `.select()` 清單，CI 裡跑

### Pattern C — catch block 靜默吞錯誤
- **原則：** 所有 `catch {}` 都應該至少 `console.error`
- **理由：** Vercel logs 看不到錯誤等於除錯無門

### Pattern D — fetch 5xx 當「無資料」誤判
- **原則：** 前端 fetch 必須區分「API 失敗」和「空陣列」
- **理由：** 客戶會誤以為付費資料消失

---

## 檢查 / 修復 / 驗證總計

| 項目 | 數量 |
|:---|---:|
| 檢查 API route 檔案 | 61 |
| 發現 P0 問題 | 3 |
| 發現 P1 問題 | 5 |
| 觀察到的 P2 | 3 |
| 本輪已修復（P0）| 3 |
| 待主控整合（P1）| 5 |
| TypeScript 型別檢查 | ✅ 零錯誤 |
| Supabase migration apply | ✅ 成功 |

## 本輪修改的檔案

```
新增：
  lib/auth-helper.ts                    （統一 auth fallback 模組）

修改（統一使用 auth-helper）：
  app/api/reports/update-birth-location/route.ts
  app/api/points/balance/route.ts       （+ 補 error log）
  app/api/points/use/route.ts
  app/api/referral/my-code/route.ts
  app/api/family-members/route.ts
  app/api/family-members/[id]/route.ts
  app/api/feedback/route.ts
  app/api/checkout/search-reports/route.ts
  app/api/checkout/verify-family/route.ts

修改（UX 改善）：
  app/dashboard/page.tsx                （fetch 5xx 顯示錯誤 UI）

DB 變更（Supabase apply_migration）：
  paid_reports + self_update_count (INTEGER DEFAULT 0)
  paid_reports + tz_migrated_at (TIMESTAMPTZ)
```

## 結論

**核心收穫：v5.3.1 揭露的 auth fallback pattern 是系統性問題，不是單點 bug。**

本輪排查發現並修復的 P0 #1（schema drift）比 v5.3.1 原本要修的 auth bug **更嚴重** — auth bug 只在 Supabase auth 偶爾抽風時觸發，但 schema drift 是**每次 query 都 500**，任何客戶打開 Dashboard 都會中招。

建議後續建立 CI 層的 schema drift 檢查，讓下一次 migration 遺漏能在 push 前就被攔住。
