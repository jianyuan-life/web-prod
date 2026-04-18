# 監控系統 v5.3.2 交付文件

> 版本：v5.3.3（2026-04-18）
> 範圍：Telegram 告警 + 後台監控儀表板 + LLM 餘額自動檢查 + 漏斗追蹤 + 寄信 log
> 交付人：DevOps + 監控 agent
> 交付方式：檔案改動完成，**未 commit**（由主控統一整合推送）

---

## 一、改動清單

### 1.1 新增檔案（11 個）

| # | 檔案 | 用途 |
|---|---|---|
| 1 | `lib/ai/observability/telegram.ts` | 擴充 11 個告警函式（原有 4 + 新增 7，另主控又加 2 個 5LLM 告警共 13 個） |
| 2 | `components/FunnelPageHit.tsx` | 頁面級 funnel 事件追蹤 client 元件 |
| 3 | `supabase/migrations/create_llm_balance_log.sql` | LLM 餘額歷史表 + `llm_balance_latest` view |
| 4 | `scripts/check_llm_balances.py` | Python 版餘額檢查（Windows Task Scheduler 用） |
| 5 | `app/api/admin/monitoring-dashboard/route.ts` | 監控儀表板聚合 API（一次回傳所有指標） |
| 6 | `app/api/admin/telegram-test/route.ts` | Telegram 告警測試端點（12 種事件） |
| 7 | `app/api/cron/check-stuck-reports/route.ts` | 每 15 分檢查卡住報告 |
| 8 | `app/api/cron/check-llm-balances/route.ts` | 每小時檢查 LLM 餘額（Node 版，雲端跑） |
| 9 | `app/api/cron/daily-digest/route.ts` | 每天 08:00（UTC+8）晨報 |
| 10 | `app/jamie/monitoring/page.tsx` | 監控總覽儀表板 UI（30 秒刷新） |
| 11 | `MONITORING_SYSTEM_V532.md` | 本文件 |

### 1.2 修改檔案

| 檔案 | 改動摘要 |
|---|---|
| `vercel.json` | 新增 3 個 cron（check-stuck-reports / check-llm-balances / daily-digest） |
| `workflows/generate-report/steps.ts` | 3 個 resend.emails.send 包裝為「成功/失敗都寫 email_send_log + 失敗 Telegram 告警」；markReportFailed 新增「3 次失敗後觸發 notifyWorkflowFailed」 |
| `app/api/webhook/stripe/route.ts` | 1. 訂單確認信寫 email_send_log；2. 付款成功寫 customer_funnel_events (payment_success)；3. Stripe 失敗 webhook 觸發 notifyStripeFailed |
| `app/api/checkout/route.ts` | 1. 免費方案確認信寫 email_send_log；2. 建立 Stripe session 成功寫 funnel (begin_payment)；3. Stripe 建立 session 失敗 notifyStripeFailed |
| `app/api/feedback/route.ts` | 評分 < 3 星時觸發 notifyLowRating |
| `app/pricing/page.tsx` | 加 `<FunnelPageHit step="visit_pricing" />` |
| `app/checkout/page.tsx` | 加 `<FunnelPageHit step="start_checkout" planCode={...} />` |
| `app/report/[token]/ReportTracker.tsx` | 既有瀏覽追蹤旁加 `trackFunnelClient('report_viewed')` |
| `app/report/[token]/ReportClientButtons.tsx` | PDF 下載旁加 `trackFunnelClient('pdf_downloaded')` |
| `app/jamie/layout.tsx` | 側邊欄加「監控總覽」入口連到 `/jamie/monitoring` |
| `lib/funnel-tracker.ts` | 優先用既有 `sessionStorage['jy_session']`（與 visitor_events 同軌） |

---

## 二、Telegram 告警事件清單（13 種）

> 測試 URL：`POST /api/admin/telegram-test?event=<event>`

| Event | 觸發時機 | 函式 |
|---|---|---|
| `failed` | 報告 workflow 失敗 | `notifyFailed(reportId, reason)` |
| `high-cost` | 單筆 AI 呼叫超成本 | `notifyHighCost(amount, threshold)` |
| `quality-gate` | 品質閘門 3 次失敗 | `notifyQualityGate(reportId, score)` |
| `balance-low` | LLM 餘額 < $10 | `notifyLLMBalanceLow(provider, balance, currency)` |
| `balance-critical` | LLM 餘額 < $3 | `notifyLLMBalanceCritical(provider, balance, currency)` |
| `stripe-failed` | Stripe 付款失敗/session 過期 | `notifyStripeFailed(sessionId, reason, amount?)` |
| `email-failed` | Resend 寄信失敗 | `notifyEmailFailed(reportId, toEmail, reason)` |
| `stuck` | 報告卡住 > 20 分鐘 | `notifyReportStuck(reportId, minutes, clientName?)` |
| `abnormal-cost` | 單日 AI 成本超預算 | `notifyAbnormalCost(dailyCost, budget)` |
| `low-rating` | 客戶評分 < 3 星 | `notifyLowRating(reportId, stars, comment?)` |
| `workflow-failed` | Workflow 崩潰 / 3 次重試全敗 | `notifyWorkflowFailed(reportId, error, stage?)` |
| `five-llm-warning` | 5 LLM 黃色（min<95 且 avg>=90） | `notifyFiveLLMWarning(reportId, plan, avg, min, scores, issues)` |
| `five-llm-critical` | 5 LLM 紅色（min<85 或 critical errors） | `notifyFiveLLMCritical(reportId, plan, avg, min, scores, errors)` |
| `daily` | 每日 08:00 晨報 | `notifyDaily(summary)` |

---

## 三、監控儀表板（/jamie/monitoring）

### 頁面資訊密度
- **頂部 KPI 5 張卡片**：今日報告 / 今日營收 / 今日 AI 成本 / 本月 AI 成本 / 卡住報告
- **告警條（紅色）**：集中顯示所有當前異常（餘額、卡住、超預算、低評分…）
- **LLM 餘額面板**：每 provider 紅綠燈 + 餘額 + status
- **今日成本 × Provider**：水平 bar 圖顯示各 provider 花費 + 失敗次數
- **本月預算進度**：進度條（>80% 黃、>100% 紅） + 分 provider 累計
- **卡住報告表**：> 20 分的 generating 報告列表
- **7 日客戶評分**：5 星分佈 + 平均分 + 低評分警示
- **7 日轉化漏斗**：5 層漏斗（訪問 → 結帳 → 付款 → 查看 → PDF） + 轉化率百分比
- **7 日 Email 送達**：成功率 + 分類型統計（報告完成 / 致歉 / 推薦獎勵 …）

### 自動刷新
- 每 30 秒自動拉 `/api/admin/monitoring-dashboard`
- 右上角「立即刷新」按鈕
- 最後更新時間顯示在標題下

### Telegram 測試按鈕
- 右上角「Telegram 測試 ▾」→ hover 下拉選單有 12 個事件按鈕
- 每個按鈕觸發對應 `/api/admin/telegram-test?event=X`
- 老闆會收到 `[TEST]` 前綴的訊息

---

## 四、Cron 排程

| Cron | 頻率 | 用途 | 認證 |
|---|---|---|---|
| `/api/cron/retry-pending` | 每 5 分 | 重試 pending/failed 報告（既有） | `Bearer ${CRON_SECRET}` |
| `/api/cron/keep-alive` | 每 4 分 | Supabase keep-alive（既有） | 同 |
| `/api/cron/expire-points` | 每天 03:00 | 點數到期（既有） | 同 |
| `/api/cron/feedback-reminder` | 每 4 小時 | 評分提醒（既有） | 同 |
| `/api/cron/followup-email` | 每 1 小時 | 後續信（既有） | 同 |
| `/api/cron/check-stuck-reports` | **每 15 分** | **卡住報告告警**（新） | 同 |
| `/api/cron/check-llm-balances` | **每 1 小時** | **LLM 餘額檢查**（新） | 同 |
| `/api/cron/daily-digest` | **每天 00:00 UTC** | **晨報**（台灣 08:00）（新） | 同 |
| `/api/cron/monthly-fixed-costs` | 每月 1 號 00:00 | 月度固定成本（既有） | 同 |
| `/api/cron/monthly-pnl` | 每月 1 號 01:00 | 月度 P&L（既有） | 同 |

### 所有 cron 已強制驗證 `Authorization: Bearer ${CRON_SECRET}`，未設定 env 時回 401。

---

## 五、新增資料庫表

### `llm_balance_log`
```sql
id              UUID PK
provider        TEXT NOT NULL    -- openai / anthropic / moonshot / deepseek / gemini / qwen
balance         NUMERIC(14,4)    -- 原幣別數值
currency        TEXT             -- USD / CNY / FREE / UNKNOWN
balance_usd     NUMERIC(14,4)    -- 換算 USD
status          TEXT             -- ok / low / critical / unknown / error
error_message   TEXT
raw             JSONB
checked_at      TIMESTAMPTZ
```

### `llm_balance_latest` view
> 每個 provider 最新一筆（供儀表板讀）

---

## 六、客戶漏斗事件時點表

| Funnel Step | 觸發點 | 觸發方式 |
|---|---|---|
| `visit_pricing` | `/pricing` 首次渲染 | `<FunnelPageHit step="visit_pricing" />` client |
| `start_checkout` | `/checkout?plan=X` 首次渲染 | `<FunnelPageHit step="start_checkout" planCode={X} />` client |
| `begin_payment` | Stripe session 建立成功 | `trackFunnelServer()` in `/api/checkout` |
| `payment_success` | Stripe webhook `checkout.session.completed` | `trackFunnelServer()` in `/api/webhook/stripe` |
| `report_generated` | workflow 報告完成 | `trackFunnelServer()` in `saveReportToSupabase` |
| `report_viewed` | `/report/[token]` 首次載入 | `trackFunnelClient()` in `ReportTracker.tsx` |
| `pdf_downloaded` | 按下 PDF 下載按鈕 | `trackFunnelClient()` in `ReportClientButtons.tsx` |

> **同一 session_id + step 有 UNIQUE index**，重複觸發會被 DB 擋掉不會重複計數。

---

## 七、Email 寄信 log（email_send_log）覆蓋

| 發信點 | 檔案 | email_type |
|---|---|---|
| 付款後訂單確認信 | `app/api/webhook/stripe/route.ts` | `welcome` |
| 免費方案訂單確認信 | `app/api/checkout/route.ts` | `welcome` |
| 報告完成通知信 | `workflows/generate-report/steps.ts:sendReportEmail` | `report_ready` |
| 管理員失敗告警信 | `workflows/generate-report/steps.ts:markReportFailed` | `admin_alert` |
| 客戶失敗致歉信 | `workflows/generate-report/steps.ts:markReportFailed` | `report_failed_apology` |

> 失敗時會同時：(1) 寫 status=failed 到 email_send_log；(2) 發 `notifyEmailFailed` Telegram。

---

## 八、老闆部署指令（手動操作）

### 步驟 1：Supabase 建表
在 Supabase SQL Editor 執行：
```sql
-- 來源：supabase/migrations/create_llm_balance_log.sql
```

### 步驟 2：Vercel 環境變數（如未設）
```
TELEGRAM_BOT_TOKEN=<已設>
TELEGRAM_CHAT_ID=6919458961
CRON_SECRET=<已設>
MONTHLY_AI_BUDGET_USD=500          # 可選，預設 500
DAILY_AI_BUDGET_USD=16.67          # 可選，預設 monthly/30
DEEPSEEK_API_KEY=<已設>
MOONSHOT_API_KEY=<已設，或 KIMI_API_KEY>
CLAUDE_API_KEY=<已設>
GEMINI_API_KEY=<可選，Gemini 免費配額驗證用>
```

### 步驟 3：Windows Task Scheduler 排程（本機跑 Python 版）
```powershell
# 每小時跑一次餘額檢查（雲端 cron 也會跑，這裡多一層保險）
schtasks /Create /TN "JamieLLMBalanceCheck" /SC HOURLY /TR "python D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\scripts\check_llm_balances.py"
```

### 步驟 4：驗證 Telegram 告警能收到
1. 打開 `/jamie/monitoring`
2. 點右上角「Telegram 測試 ▾」
3. 逐個點 12 種事件
4. 手機要看到 12 則訊息（都有 `[TEST]` 前綴）

### 步驟 5：驗證監控儀表板
1. 打開 `/jamie/monitoring`
2. 數據應該自動載入，無紅色告警條
3. 30 秒後應該自動刷新
4. LLM 餘額區塊：手動在 Supabase 執行一次 `/api/cron/check-llm-balances` 確認 `llm_balance_log` 有資料

---

## 九、設計決策與取捨

### 9.1 為什麼 Anthropic 顯示為 "unknown"？
Anthropic 官方沒有 balance REST API，只能在 `console.anthropic.com` 看。
我們的策略：
- 用最便宜的 Haiku 打一次 ping，確認 key 有效
- 若回 402 → 標 `critical`（額度耗盡）
- 若回 200 → 標 `unknown`（可用但無餘額可查）
- 老闆需手動監控 console

### 9.2 為什麼用 Python + Node 雙套腳本？
- **Node 版（Vercel cron）**：雲端高可用，老闆不用管
- **Python 版（Windows Task Scheduler）**：本機 redundant，就算 Vercel 掛掉也有資料
- 兩者都寫同一張表，同一套閾值

### 9.3 為什麼告警有「冷卻期」？
- 卡住報告告警：同一份 6 小時內不重發（用 `generation_progress.last_stuck_alert_at` 判斷）
- LLM 餘額告警：每小時查一次，但只在跨 threshold 時才真發（避免刷屏）
- 日預算告警：每日第一次超過才發（避免 1 小時發 60 次）

### 9.4 為什麼 funnel 用 UNIQUE 擋重複？
- 前端可能因 StrictMode / 路由切換 / 網路 retry 打好幾次
- DB 層 `UNIQUE (session_id, step, plan_code)` 會擋掉
- 取代昂貴的前端去重邏輯

### 9.5 為什麼儀表板 30 秒刷新而不是 WebSocket？
- 後台只有老闆看，並發 1 人
- Supabase 聚合查詢 < 200ms，30 秒刷新完全夠
- 省掉 WebSocket 基礎建設成本

---

## 十、測試步驟

### 10.1 Type-check
```bash
npx tsc --noEmit
```
**結果：0 error**（2026-04-18 驗證通過）

### 10.2 Telegram 測試（老闆手動做）
見「步驟 4」。

### 10.3 監控儀表板（老闆手動做）
見「步驟 5」。

### 10.4 Cron 手動觸發測試
```bash
# 卡住報告檢查
curl -H "Authorization: Bearer $CRON_SECRET" https://jianyuan.life/api/cron/check-stuck-reports

# LLM 餘額檢查
curl -H "Authorization: Bearer $CRON_SECRET" https://jianyuan.life/api/cron/check-llm-balances

# 每日晨報（會立刻發 Telegram）
curl -H "Authorization: Bearer $CRON_SECRET" https://jianyuan.life/api/cron/daily-digest
```

### 10.5 Funnel 事件測試
1. 無痕模式打開 `https://jianyuan.life/pricing` → DB 應該有 `visit_pricing` 記錄
2. 點任一方案進 checkout → 應該有 `start_checkout`
3. 點付款 → 應該有 `begin_payment`
4. 完成付款 → 應該有 `payment_success`
5. 報告完成時 workflow 寫 `report_generated`
6. 點報告連結 → `report_viewed`
7. 下載 PDF → `pdf_downloaded`

驗證 SQL：
```sql
SELECT step, count(*) FROM customer_funnel_events
WHERE created_at > now() - interval '1 hour'
GROUP BY step
ORDER BY 1;
```

---

## 十一、注意事項

### 11.1 告警門檻調整
所有閾值集中在以下位置，需調整時改一處即可：
- `lib/ai/observability/telegram.ts` — 訊息模板
- `scripts/check_llm_balances.py` 第 54-55 行 — Python 版閾值
- `app/api/cron/check-llm-balances/route.ts` 第 18-19 行 — Node 版閾值
- `app/api/admin/monitoring-dashboard/route.ts` 第 31-32 行 — 日/月預算
- `app/api/cron/check-stuck-reports/route.ts` 第 15 行 — 卡住分鐘數

### 11.2 env 未設時行為
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 未設 → console.warn 不會 throw
- `SUPABASE_SERVICE_ROLE_KEY` 未設 → `recordEmailSend` / `trackFunnelServer` 靜默跳過
- `CRON_SECRET` 未設 → cron 回 401（不能執行）

### 11.3 監控儀表板無資料？
- **LLM 餘額空**：需先執行一次 `/api/cron/check-llm-balances`
- **funnel 空**：需有客戶實際走過流程（或手動戳各頁）
- **email 空**：需有客戶實際觸發寄信流程
- **feedback 空**：需有客戶提交評分

---

## 十二、5 LLM UI/邏輯審核（老闆要求 ≥95）

此項需要另一個 agent 用 5 LLM 審核後再補入（本 agent 為建置 agent，不跑審核）。主控請在整合前呼叫：

```python
python scripts/post_gen_5llm_qa.py --target monitoring_v532
```

審核面向建議：
- **資訊密度**：KPI 卡 + 告警條 + 漏斗 + 餘額 9 個區塊是否清晰
- **一眼可看性**：紅綠燈標示是否明顯、關鍵數字是否大字
- **告警規則合理性**：<$10 低/<$3 急/<3 星/20 分卡住/月預算 $500 是否正常
- **響應式**：lg:col-span-2 / md:grid-cols 排版在手機/平板/桌面是否 OK

---

## 尾：交付摘要

- **新增 11 檔 + 修改 11 檔**，全部 type-check 通過
- **13 種 Telegram 告警 + 12 個手動測試按鈕**
- **4 個新 cron（含 3 個監控用）**
- **6 個供應商餘額自動檢查（OpenAI / Anthropic / Moonshot / DeepSeek / Gemini / Qwen）**
- **5 層客戶漏斗事件追蹤（從 visit 到 pdf_download）**
- **監控儀表板 9 區塊，30 秒自動刷新**

**未 commit，等主控整合推送。**
