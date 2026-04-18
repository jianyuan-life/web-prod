-- ============================================================
-- Post-Gen 5 LLM QA Pipeline（2026-04-18）：報告 QA 評分紀錄
-- ============================================================
-- 用途：每份報告生成後，5 LLM 並行評分結果都寫一筆。
--       支撐 /jamie/quality-reports 後台分析與 Telegram 告警。
--
-- 對應程式：
--   - lib/ai/team/five-llm-qa.ts（評分邏輯）
--   - workflows/generate-report/steps.ts aiReviewReport（整合點）
--   - app/jamie/quality-reports/page.tsx（後台）
--
-- 執行方式（由 Supabase MCP 或 SQL Editor 跑）：
--   1. apply_migration: create_report_qa_log.sql
--   2. 確認 report_qa_log 表建立成功
--   3. RLS 只允許 service_role 存取
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_qa_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 關聯的報告（報告被刪除時一起清掉）
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE CASCADE,

  -- 方案代碼（冗餘欄位，方便分析）
  plan_code TEXT,

  -- 第幾輪評分（1 = first pass, 2 = 第一次 retry 後, ...）
  round INT NOT NULL DEFAULT 1,

  -- Reviewer 識別：gpt / qwen / gemini / kimi / deepseek
  reviewer TEXT NOT NULL,

  -- 實際使用的模型（例 gpt-4o、qwen-max、gemini-2.5-pro）
  model TEXT NOT NULL,

  -- 評分 0-100
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),

  -- 問題清單（JSONB 陣列）
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 致命錯誤（命理幻覺、不存在關係等）
  critical_errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 優點 / 建議
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 單一 reviewer 是否通過（score >= 95）
  passed BOOLEAN NOT NULL DEFAULT FALSE,

  -- 本次呼叫延遲與花費
  latency_ms INTEGER,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,

  -- 錯誤訊息（Reviewer 呼叫失敗時填）
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.report_qa_log IS '每份報告 Post-Gen 5 LLM QA 評分紀錄';
COMMENT ON COLUMN public.report_qa_log.round IS '第幾輪評分（1=first, 2=after first retry...）';
COMMENT ON COLUMN public.report_qa_log.reviewer IS 'gpt / qwen / gemini / kimi / deepseek';
COMMENT ON COLUMN public.report_qa_log.passed IS '單一 reviewer 是否 >= 95 分';

-- 查詢索引
CREATE INDEX IF NOT EXISTS idx_report_qa_log_report ON public.report_qa_log (report_id, round);
CREATE INDEX IF NOT EXISTS idx_report_qa_log_created ON public.report_qa_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_qa_log_reviewer ON public.report_qa_log (reviewer, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_qa_log_score ON public.report_qa_log (score);
CREATE INDEX IF NOT EXISTS idx_report_qa_log_plan ON public.report_qa_log (plan_code, created_at DESC);

-- ============================================================
-- paid_reports：加 needs_human_review 狀態支援
-- ============================================================
-- 5 LLM 連續 3 次不通過時，workflow 會把 status 設為 'needs_human_review'
-- 後台可直接從 /jamie/quality-reports 手動觸發重生或放行
-- 現有 status 欄位是 TEXT 沒 CHECK constraint，直接用即可；只要確保稽核一致

-- 為了加速後台 /jamie/quality-reports 查詢（最近 50 份報告的 QA 摘要）
-- 在 paid_reports 補一個部分索引：needs_human_review 快速查
CREATE INDEX IF NOT EXISTS idx_paid_reports_needs_human_review
  ON public.paid_reports (updated_at DESC)
  WHERE status = 'needs_human_review';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.report_qa_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_qa_log_no_public_access" ON public.report_qa_log;

CREATE POLICY "report_qa_log_no_public_access"
  ON public.report_qa_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 驗證
-- ============================================================
SELECT 'report_qa_log table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'report_qa_log'
);
