# AI 成本追蹤 v5.3.5 — 全面建設成本監控

> 日期：2026-04-18
> 版本：v5.3.5
> 任務：補齊所有 AI 呼叫點 + 固定訂閱 + 單位經濟學 + 盈虧率 KPI

---

## 1. 原問題

- **Anthropic 官方後台**：10 把 Claude key 累計 **$243.18**（最大 key $181.90）
- **鑑源 `/jamie/ai-costs`**：過去 30 天只顯示 **$44.49**（28 筆）
- **差距 $199，約 5.5 倍未記錄**

根因：`ai_cost_log` 只在 `workflows/generate-report/steps.ts` 的 3 個 Claude call（Call 1/2/3）有寫入；其他所有 Claude 呼叫點都沒捕獲（團隊 pipeline、peer review、修訂、5 LLM QA、免費工具、fallback 路徑、ai-moderator、RAG embed、legacy 自審）。

---

## 2. 找到的遺漏 Call Site（共 9 類）

| # | 位置 | 修復方式 |
|:---:|:---|:---|
| 1 | `lib/ai/provider-registry.ts` `generateWithFailover` / `generateParallel` | **Registry 層 hook**：每個 attempt（含熔斷器 open + 失敗）都自動 `recordAIUsage`，無需個別 caller 補寫 |
| 2 | `lib/ai/team/author.ts` `generateDraft` | 傳入 `reportId`，registry 自動帶 `call_stage='team_author'` |
| 3 | `lib/ai/team/peer-review.ts` `peerReview` | 傳入 `reportId`，`call_stage='team_peer_review'` |
| 4 | `lib/ai/team/revision.ts` `reviseDraft` | 傳入 `reportId`，`call_stage='team_revision_rN'` |
| 5 | `lib/ai/team/five-llm-qa.ts` `fiveLLMQualityReview` | 傳入 `reportId`，`call_stage='qa_5llm'`（5 位 reviewer 各一筆） |
| 6 | `workflows/generate-report/steps.ts` `aiReviewReportLegacy` | 直接 fetch，補 `recordAIUsage`（input_tokens/output_tokens 取自 response） |
| 7 | `app/api/generate-report/route.ts` `callClaudeStreaming` / `callDeepSeekFallback` | Streaming 無 usage 事件時用 char/3 粗估 tokens，`status='success'` 但 metadata 註明 |
| 8 | `app/api/free-bazi/route.ts` / `free-ziwei` / `free-name` | DeepSeek 主 + Kimi fallback 雙路徑都補 `recordAIUsage`（`free_bazi` / `free_ziwei` / `free_name` / `*_fallback`） |
| 9 | `lib/content-moderation/ai-moderator.ts` | OpenAI `omni-moderation-latest`（免費）+ Claude Haiku fallback 各補一筆 |
| 10 | `lib/ai/rag.ts` `embedText` | Voyage `voyage-3-large`，`call_stage='embed'`，tokens 取 `usage.total_tokens` |

**新增 call_stage 分類**：
- `team_author` / `team_peer_review` / `team_revision_r[1-3]` / `qa_5llm`
- `review_legacy` / `C_fallback_single` / `D_fallback_single` / `*_fallback_deepseek`
- `free_bazi` / `free_ziwei` / `free_name` / `*_fallback`
- `moderation_openai` / `moderation_claude_haiku`
- `embed` / `historical_backfill`

---

## 3. 定價表校正（`lib/ai/pricing.ts` 新檔，單一真相源）

| Provider | Model | Input | Output | 備註 |
|:---|:---|:---:|:---:|:---|
| anthropic | claude-opus-4-7 / 4-6 / 4-5 / 4 | 15 | 75 | USD/1M |
| anthropic | claude-sonnet-4-6 / 4-5 / 4 | 3 | 15 | |
| anthropic | claude-haiku-4-5 | 1 | 5 | |
| openai | gpt-4o | 2.5 | 10 | |
| openai | gpt-4o-mini | 0.15 | 0.6 | |
| openai | omni-moderation-latest | 0 | 0 | 官方免費 |
| deepseek | deepseek-chat / v3 | 0.27 | 1.10 | 舊值 0.14/0.28 過期已改 |
| deepseek | deepseek-reasoner | 0.55 | 2.19 | |
| moonshot | moonshot-v1-128k | 8.33 | 8.33 | ¥60/1M 統一 |
| moonshot | kimi-k2.5 / kimi-k2-thinking | 4.17 | 4.17 | ¥30/1M |
| moonshot | moonshot-v1-auto / 32k | 0.42 | 0.83 | ¥3/¥6 |
| qwen | qwen-max | 1.4 | 5.6 | 舊值 1.6/6.4 過期已改 |
| qwen | qwen-plus | 0.4 | 1.2 | |
| qwen | qwen-turbo | 0.04 | 0.2 | |
| gemini | gemini-2.5-flash | 0.3 | 2.5 | |
| gemini | gemini-2.5-pro | 1.25 | 10 | |
| gemini | gemini-1.5-flash | 0.075 | 0.3 | |
| voyage | voyage-3 | 0.06 | 0 | embed 沒 output |
| voyage | voyage-3-large | 0.18 | 0 | RAG 主力 |

**核心函式**：
- `calcCostUsd(model, inTok, outTok)` — 換算 USD（內建 normalizeModel 處理日期後綴）
- `canonicalProvider(rawName)` — alibaba→qwen / google→gemini / claude→anthropic
- `providerFromModel(model)` — 由 model 反查 provider

**`lib/ai-cost-tracker.ts` 變更**：
- Provider type 擴到 8 家（+ qwen + gemini + voyage）
- 刪掉內建 PRICING，直接調 `calcCostUsd`
- 單筆 > $5 自動觸發 `notifyAICostSingleCallExpensive`（telegram）

---

## 4. 歷史數據回填（API）

新建 `POST /api/admin/accounting/anthropic-historical`：
1. 若有 `ANTHROPIC_ADMIN_KEY` → 呼叫 Admin API `/v1/organizations/cost_report`（header `anthropic-beta: admin-2025-04-15`），把每日 amount 拆成 N 筆寫 `expense_log(category='ai_cost', subcategory='anthropic_historical')`
2. **Admin API 不可用**（鑑源目前沒 Admin Key，只有一般 API Key）→ fallback 手動輸入 `manual_amount`（例如 $243.18）寫一筆聚合記錄，description 註明「2026-04-06~04-18 Anthropic 歷史成本（來源：console.anthropic.com）」
3. 兩種來源都在 metadata 標註以便稽核：`{ source: 'admin_api' | 'manual', start_date, end_date }`
4. **絕不虛構金額**；API 不可用時必須由老闆手動輸入，不亂猜

**使用方式**：後台呼叫
```bash
curl -X POST https://jianyuan.life/api/admin/accounting/anthropic-historical \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{"try_admin_api": true, "manual_amount": 243.18, "start_date": "2026-04-06"}'
```

---

## 5. UI 擴充

### 5.1 `/jamie/ai-cost` 擴充（不動 `/jamie/dashboard` 餘額卡片）
- **每日花費趨勢圖**：Legend 從 5 條 → **7 條（Claude/OpenAI/DeepSeek/Kimi/Qwen/Gemini/Voyage + 其他）**
- **新增「異常告警」紅色卡片**（頁首）：單筆 > $5 或單日 > $30 自動列出
- **Provider 圓餅**：已有（Bar Chart by provider）
- **Call Stage 柱狀圖**：由新增的 `by_stage` 資料驅動（前端 table 可加，目前 API 已回傳，UI 留給主控整合）

### 5.2 `/jamie/accounting` 大改版（5 個 Tab）
```
📊 總覽（保留現有內容 + 新增盈虧率 KPI 卡片：毛利率/淨利率/ROI 回本率/每份平均 AI 成本/損益兩平）
🔁 固定訂閱（CRUD + 一鍵回填 + 累計至今計算）
💸 建設成本明細（expense_log 流水 + 類別 filter + 合計）
📈 單位經濟學（6 方案排行榜 + 戰略 KPI + 異常預警 + 自動建議 + 單份 breakdown）
📥 報表匯出（收入/支出/完整 CSV）
```

#### 固定訂閱 Tab 細節
- **表**：`fixed_subscriptions`（新建 migration `create_fixed_subscriptions.sql`）
  - 欄位：service_name, vendor, category, amount_usd, frequency, started_at, ended_at, is_active, notes, metadata
  - frequency: `monthly` / `annual` / `one_time` / `prepaid`
  - 輔助函式 `fixed_sub_accumulated_usd(id)` 計算累計至今（plpgsql）
- **API**：`/api/admin/accounting/subscriptions` GET/POST/PATCH/DELETE（軟刪 is_active=false + ended_at）
- **一鍵回填 API**：`/api/admin/accounting/subscriptions/backfill`，預設 12 項常見服務（Vercel/Supabase/Fly.io/Resend/Cloudflare/Upstash/Sentry/LangFuse/jianyuan.life/Claude Max/Cursor/Anthropic topup）
- **冪等**：相同 service_name + started_at 自動跳過
- **新增訂閱時**同步寫 `expense_log`（首期）讓看板立刻反映

#### 單位經濟學 Tab 細節
- **API**：`/api/admin/accounting/unit-economics?period=30d|90d|all`
- **6 方案排行榜**：每方案一張卡（綠 >=80% / 黃 60-80% / 紅 <60%），顯示售出數、平均成本、平均毛利、毛利率
- **戰略 KPI**：最強/最弱方案、平均每份毛利、CAC 上限（= avg margin × 80%）
- **異常預警**：毛利率 < 50% 的報告列表（最多 30 筆）
- **自動建議**（規則型）：
  - 樣本 < 3 份 → 提醒先累積數據
  - 毛利率 >= 85% → 可加大廣告投放
  - 毛利率 < 70% → 檢查 AI prompt 過長或調價
  - 異常 > 0 → 提示查單份成本
- **單份明細 table**：每筆可「展開」看 `cost_by_stage` + `cost_by_model` breakdown
- **樣本數警告**：< 10 份總樣本時頂部顯示「可信度低」
- **不虛構**：無報告時直接顯示「期間內無報告記錄」，不生假數據

### 5.3 盈虧率 KPI（總覽 Tab 新增）
`/api/admin/accounting/summary` 新增 `kpi` 欄位：
```json
{
  "kpi": {
    "period": { "gross_margin_pct": 87.3, "net_margin_pct": 65.2, "avg_ai_cost_per_report": 6.7, "samples": 12, "margin_color": "green" },
    "all_time": { ... },
    "this_month": { ... },
    "last_month": { ... },
    "roi_pct": 35.7,
    "roi_color": "green"
  }
}
```
- 毛利率 = (收入 − AI 成本 − Stripe 手續費) / 收入
- 淨利率 = 淨利 / 收入
- ROI 回本率 = 累計淨利 / 累計總支出
- 顏色：>60% 綠、30-60% 黃、<30% 紅

---

## 6. Telegram 告警

`lib/ai/observability/telegram.ts` 新增：
- `notifyAICostDailyExceed(amount, threshold=20)` — 單日 AI 總成本超 $20 預警
- `notifyAICostSingleCallExpensive(model, cost, reportId, callStage)` — 單筆 > $5 即時告警（由 `recordAIUsage` 自動觸發）

**測試**：需要 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` 設定才會真的發送；未設定時 console.warn 降級（既有設計），主流程不阻塞。

---

## 7. LLM 餘額 cron 擴充

`app/api/cron/check-llm-balances/route.ts`：
- 原本：DeepSeek / Moonshot / Anthropic / Gemini（4 家）
- v5.3.5 擴充：+ **OpenAI / Qwen / Voyage**（共 **7 家**）
- 每家有獨立 `checkXXX()` 函式（無 balance API 的用 ping 驗證 key）
- `llm_balance_log` schema 不變（同樣欄位）

---

## 8. expense_log category 擴充（lib/accounting.ts）

舊（8 類）→ 新（15 類）：
```
新增：
  domain_annual     網域年費（jianyuan.life 續約）
  domain_setup      網域一次性購買
  ai_subscription   開發訂閱（Claude Pro / Cursor / ...）
  api_credit_topup  API 一次性充值（Anthropic $200 credit）
  stripe_fee        Stripe 手續費
  font_license      字體授權
  external_service  其他付費 SaaS

保留向下相容：
  ai_cost / hosting_monthly / api_setup / domain / refund / marketing / email / other
```

`calcPeriodPnL` 把新類別全部累加進 `other_usd`（暫時，避免欄位爆炸）。

---

## 9. TypeScript 驗證

```bash
$ npm run type-check
> fortune-reports@5.3.4 type-check
> tsc --noEmit
(零錯誤)
```

**修正 TS 錯誤**：
- 新增 `admin-audit-log.ts` 的 `AdminAction`: `update` / `deactivate` / `backfill`
- 新增 `AdminTargetType`: `fixed_subscription` / `fixed_subscriptions` / `anthropic_historical`

---

## 10. 新建檔案清單

| 路徑 | 用途 |
|:---|:---|
| `lib/ai/pricing.ts` | 定價單一真相源 + canonicalProvider + calcCostUsd |
| `supabase/migrations/create_fixed_subscriptions.sql` | 固定訂閱表 migration + 累計計算 plpgsql |
| `app/api/admin/accounting/subscriptions/route.ts` | 訂閱 CRUD API |
| `app/api/admin/accounting/subscriptions/backfill/route.ts` | 一鍵回填歷史訂閱 |
| `app/api/admin/accounting/anthropic-historical/route.ts` | Anthropic 歷史成本回填（Admin API + 手動 fallback）|
| `app/api/admin/accounting/unit-economics/route.ts` | 單位經濟學 BI API |
| `AI_COST_TRACKING_V535.md` | 本文件 |

## 11. 已修改檔案清單

| 路徑 | 變更 |
|:---|:---|
| `lib/ai-cost-tracker.ts` | 8 provider + 統一定價 + 高金額告警 hook |
| `lib/ai/provider-registry.ts` | TrackingContext + 所有 attempt 自動 log |
| `lib/ai/team/author.ts` | 接收 reportId 傳 registry |
| `lib/ai/team/peer-review.ts` | 接收 reportId 傳 registry |
| `lib/ai/team/revision.ts` | 接收 reportId 傳 registry |
| `lib/ai/team/five-llm-qa.ts` | 接收 reportId 傳 registry |
| `lib/ai/pipeline/index.ts` | 把 reportId 傳給 team 呼叫 |
| `lib/ai/observability/telegram.ts` | notifyAICostDailyExceed + notifyAICostSingleCallExpensive |
| `lib/ai/rag.ts` | Voyage embed 記 ai_cost_log |
| `lib/content-moderation/ai-moderator.ts` | OpenAI/Claude Haiku 兩路徑都記 log |
| `lib/accounting.ts` | expense category 擴 15 類、calcPeriodPnL 加總新類別 |
| `lib/admin-audit-log.ts` | AdminAction/TargetType 擴充 |
| `workflows/generate-report/steps.ts` | aiReviewReportLegacy 補 recordAIUsage + fiveLLMQualityReview 傳 reportId |
| `app/api/generate-report/route.ts` | callClaudeStreaming + callDeepSeekFallback 補 log（SSE 用 char/3 估算）|
| `app/api/free-bazi/route.ts` | DeepSeek + Kimi 雙路徑補 log |
| `app/api/free-ziwei/route.ts` | 同上 |
| `app/api/free-name/route.ts` | 同上 |
| `app/api/cron/check-llm-balances/route.ts` | +OpenAI +Qwen +Voyage（7 家） |
| `app/api/admin/accounting/summary/route.ts` | 新增 kpi 區塊（盈虧率/淨利率/ROI/平均成本） |
| `app/api/admin/accounting/expense/route.ts` | VALID_CATEGORIES 擴 15 類 |
| `app/api/admin/dashboard/ai-cost/route.ts` | 7 家 provider 分桶 + by_stage + anomalies |
| `app/jamie/ai-cost/page.tsx` | 異常告警卡片 + 7 家 Legend |
| `app/jamie/accounting/page.tsx` | 5 Tab 結構 + KPI 卡片 + 訂閱/明細/單位經濟學 子頁面 |

---

## 12. 上線後迭代項（刻意未處理）

老闆明確指示「**現在還沒開始收費，上線後再做**」，以下保留給主控後續加待辦：

| # | 項目 | 為何延遲 |
|:---|:---|:---|
| 1 | Stripe 手續費去重邏輯 | `revenue_log.stripe_fee_usd` 和 `expense_log.category='stripe_fee'` 可能雙計；上線後再設計一致性規則 |
| 2 | 退款去重邏輯 | `revenue_log.refunded_amount_usd` vs `expense_log.category='refund'`；calcPeriodPnL 目前用 Math.max 保守處理 |
| 3 | 時區分界統一 | 月結快照、日報、cron 目前混用 UTC/本機時區；上線前統一設 `Asia/Taipei` |
| 4 | 日報/月報邊界 | 每月 1 日 cron 可能跨時區抓錯日；上線後換成 UTC+8 邊界 |
| 5 | 舊 `ai_cost_log.provider='kimi'` 資料遷移 | 目前 DB 有少量 kimi 欄位值；正規化 API 已處理顯示，DB 清理留給 migration script |
| 6 | 每日 AI 成本超 $20 自動 cron 告警 | `notifyAICostDailyExceed` 已實作但未接 cron；上線後加 `/api/cron/check-ai-daily`（每 2 小時） |
| 7 | 單位經濟學支援 period=year | UE API 目前支援 7d/30d/90d/all，年度維度留給主控需要時補 |
| 8 | Anthropic Admin Key 申請 | 目前無 Admin Key，cost_report API 不可用；申請到後可取代 manual backfill |

---

## 13. 限制遵守確認

- ✅ 不動 `workflows/generate-report/` 的 Call 1/2/3 主生成邏輯（只改 aiReviewReportLegacy 補 log + fiveLLMQualityReview 多傳 reportId）
- ✅ 不動 `/jamie/dashboard` AI 餘額卡片
- ✅ TypeScript 零錯誤（npm run type-check 通過）
- ✅ 不 commit（主控統一整合 v5.3.5）

---

## 14. 主控整合前建議

1. **跑 migration**：
   ```
   supabase/migrations/create_fixed_subscriptions.sql
   ```
2. **手動回填 Anthropic 歷史**（無 Admin Key 版本）：
   ```bash
   curl -X POST .../anthropic-historical \
     -d '{"try_admin_api": false, "manual_amount": 243.18, "start_date": "2026-04-06", "note": "10 把 key 累計，主 key 181.90"}'
   ```
3. **一鍵回填固定訂閱**（後台 `/jamie/accounting` → 固定訂閱 tab → 一鍵回填）
4. **驗證 ai_cost_log 有新記錄**：觸發一次報告生成，查 ai_cost_log 看是否有 `call_stage='team_author'` / `qa_5llm` / `team_peer_review` 等新 stage
5. **測試 Telegram 告警**：手動在 Supabase 執行 `UPDATE ai_cost_log SET cost_usd = 5.5 WHERE id = xxx`（不會觸發，因為 notify 只在 insert 時觸發）。實際測試需要觸發一次大 prompt 的 Opus 呼叫
