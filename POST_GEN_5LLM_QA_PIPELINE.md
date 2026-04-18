# Post-Gen 5 LLM QA Pipeline

> 建立時間：2026-04-18
> 負責：AI 品質控制工程師
> 狀態：完成（type-check 全過、migration 已上線、後台頁面已建）

## 目的

每份報告生成完成後，自動用 5 個 LLM (GPT / Qwen / Gemini / Kimi / DeepSeek) 並行評分，
不合格自動 retry，連續 3 次失敗則轉為 `needs_human_review`，並觸發 Telegram 告警。

這是對既有 `qualityGate`（結構硬比對）的補強——`qualityGate` 管格式/禁用詞/章節，
**5 LLM QA 管內容**（命理正確性、可讀性、深度與誠意）。

## 架構圖

```
報告生成完 (AI Call 1-3 / G15 / R / E1 / E2)
  ↓
qualityGate（章節/字眼/結構硬比對）
  ↓
aiReviewReport  ←←← 本次改造目標
  ↓
  5 LLM 並行評分（generateParallel）
    ├─ GPT-4o           (openai)
    ├─ Qwen Max         (alibaba)
    ├─ Gemini 2.5 Pro   (google)
    ├─ Kimi             (moonshot)  ← 新增 provider
    └─ DeepSeek V3      (deepseek)
  ↓
  寫入 report_qa_log（5 筆/輪）
  ↓
  判決 min ≥ 95 且 avg ≥ 93
    ├─ Pass  → 繼續 Step 3.7 內容審查
    ├─ Fail  → Telegram 警告（yellow/red）→ 重試 C 方案
    └─ Fail 3 次 → needs_human_review + Telegram 紅色告警
```

## 變更清單

### 1. 新增檔案

| 檔案 | 作用 |
|:---|:---|
| `lib/ai/providers/moonshot.ts` | 新增 Moonshot (Kimi) provider，OpenAI 相容格式 |
| `lib/ai/team/five-llm-qa.ts` | 5 LLM 並行評分核心模組，含統一 system prompt |
| `supabase/migrations/create_report_qa_log.sql` | 評分紀錄表 + paid_reports needs_human_review 索引 |
| `app/api/admin/quality-reports/route.ts` | 後台 API (GET list / GET detail / PATCH release/regenerate) |
| `app/jamie/quality-reports/page.tsx` | 後台頁面（表格、篩選、詳情展開、操作按鈕） |

### 2. 修改檔案

| 檔案 | 變更 |
|:---|:---|
| `lib/ai/providers/index.ts` | 註冊 moonshotProvider |
| `lib/ai/observability/telegram.ts` | 新增 `notifyFiveLLMWarning` / `notifyFiveLLMCritical` / `notifyNeedsHumanReview` |
| `workflows/generate-report/steps.ts` | `aiReviewReport` 改為呼叫 5 LLM QA，新增 `markReportNeedsHumanReview`、`aiReviewReportLegacy` |
| `workflows/generate-report/index.ts` | 品質閘門循環改用 min/avg 雙門檻；失敗 3 次走 needs_human_review；G15/R 路徑加入 5 LLM 告警 |
| `app/jamie/layout.tsx` | 側邊欄加入「5 LLM 品質 QA」入口 |

## 判決門檻

| 門檻 | 數值 | 觸發行為 |
|:---|:---:|:---|
| 單一 reviewer 最低分 | < 95 | hardFailure → retry |
| 5 位 reviewer 平均分 | < 93 | hardFailure → retry |
| 5 位平均分 | < 85 | **紅色**告警（立刻 Telegram） |
| retry 上限 | 3 次 | 超過 → `status = needs_human_review` |
| legacy fallback | < 75 | 5 LLM 整個掛掉才走這個（全部 provider 都 error） |

## 成本與延遲

| 項目 | 預估 |
|:---|:---|
| 單份報告 5 LLM tokens | ≈ 15-20K 輸入 × 5 + 2K 輸出 × 5 |
| 單份額外成本 | $0.08-0.15（C 方案長報告） / $0.05-0.10（D/E1/E2） |
| 單份額外延遲 | 30-60 秒（並行，取最慢的那個） |
| 月成本預估 | 約 $40-75（依每日報告量 10-15 份） |

## 環境變數需求

必須設（缺少會降級）：

| Env | 用途 |
|:---|:---|
| `OPENAI_API_KEY` | GPT-4o |
| `QWEN_API_KEY` 或 `DASHSCOPE_API_KEY` | Qwen Max |
| `GEMINI_API_KEY` | Gemini 2.5 Pro |
| `MOONSHOT_API_KEY` | Kimi / Moonshot（**新**，部署前須設） |
| `DEEPSEEK_API_KEY` | DeepSeek V3 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 告警推送（已有） |

缺任一 API Key：該 reviewer 會回 error，但整批不會阻塞——會降級給 80 分 + 標記。

## DB Schema

```sql
CREATE TABLE public.report_qa_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES paid_reports(id) ON DELETE CASCADE,
  plan_code TEXT,
  round INT NOT NULL DEFAULT 1,
  reviewer TEXT NOT NULL,      -- gpt / qwen / gemini / kimi / deepseek
  model TEXT NOT NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  issues JSONB NOT NULL DEFAULT '[]',
  critical_errors JSONB NOT NULL DEFAULT '[]',
  strengths JSONB NOT NULL DEFAULT '[]',
  suggestions JSONB NOT NULL DEFAULT '[]',
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INTEGER,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

索引：
- `idx_report_qa_log_report (report_id, round)` — 查單份報告所有輪次
- `idx_report_qa_log_created` — 時間序
- `idx_report_qa_log_reviewer` — 按 reviewer 分析
- `idx_report_qa_log_score` — 分數過濾
- `idx_paid_reports_needs_human_review` — 快速列人工審核隊列

RLS：只允許 service_role（anon/authenticated 完全禁止）。

## API 介面

### GET `/api/admin/quality-reports?filter=<f>&limit=50`

Header: `x-admin-key`

篩選 `filter`：
- `all` — 全部
- `low_min` — 最低分 < 95
- `low_avg` — 平均分 < 93
- `red` — 紅色警報（平均 < 85）
- `needs_review` — status = needs_human_review

回傳：`{ filter, count, reports: [...], summary: { total, avg_below_93, avg_below_85, min_below_95, needs_review } }`

### GET `/api/admin/quality-reports?report_id=<uuid>`

回傳單一報告的 5 LLM 詳細評分（含每位 reviewer 的 issues/critical_errors/suggestions）。

### PATCH `/api/admin/quality-reports`

Body: `{ report_id, action: 'release' | 'regenerate', reason? }`
- `release` — needs_human_review → completed（手動放行）
- `regenerate` — 拉回 pending + 觸發 `/api/workflows/generate-report`

## 後台頁面

`/jamie/quality-reports`：
- 頂部 5 張卡片：總數 / avg<93 / avg<85 / min<95 / 需人工審核
- 篩選 tabs：全部 / 最低<95 / 平均<93 / 紅色警報 / 需人工審核
- 表格列：報告ID、方案、狀態、avg、min、5 位 reviewer 分數、致命錯誤數、時間、操作
- 點擊 row 展開：每輪評分（5 位 reviewer 的 issues/critical_errors/suggestions）
- 操作：放行（僅 needs_human_review）/ 重生（全部狀態）

## Telegram 告警

| 觸發 | 函式 | 顏色 |
|:---|:---|:---:|
| 5 LLM avg ≥ 85 且 < 93 | `notifyFiveLLMWarning` | 🟡 |
| 5 LLM avg < 85 | `notifyFiveLLMCritical` | 🔴 |
| 連續 3 次失敗 → needs_human_review | `notifyNeedsHumanReview` | 🚨 |

訊息包含：ReportID、方案、avg/min、各 reviewer 分數、issues/critical_errors 摘要。

## 測試驗證（已跑）

1. **type-check**：零錯誤 ✓
2. **migration apply**：透過 Supabase MCP 應用成功 ✓
3. **表結構驗證**：16 欄位全部正確建立 ✓
4. **測試 insert + 聚合**：5 筆 reviewer + AVG/MIN/MAX 聚合正確 ✓（測試後已清理）

## 還沒做的（主控整合時再處理）

- [ ] `MOONSHOT_API_KEY` 須在 Vercel 環境變數設定（否則 Kimi 降級給 80 分）
- [ ] 生產環境跑一次端對端測試（產生真實報告驗證 5 LLM 評分寫入 DB + Telegram 告警送達）
- [ ] A/B 測試：比較啟用 5 LLM QA 前後的報告品質分佈
- [ ] 成本告警：`ai_cost_log` 增加 `call_stage='qa_5llm'` 欄位區分
- [ ] 主控整合後 `git commit` + push（本 agent 不動 commit）

## 關鍵檔案路徑（供主控整合）

所有絕對路徑：

- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\lib\ai\providers\moonshot.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\lib\ai\providers\index.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\lib\ai\team\five-llm-qa.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\lib\ai\observability\telegram.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\workflows\generate-report\steps.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\workflows\generate-report\index.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\supabase\migrations\create_report_qa_log.sql`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\app\api\admin\quality-reports\route.ts`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\app\jamie\quality-reports\page.tsx`
- `D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\app\jamie\layout.tsx`
