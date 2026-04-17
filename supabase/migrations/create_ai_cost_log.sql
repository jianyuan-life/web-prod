-- ============================================================
-- L7+ BI 後台優化（2026-04-17）：AI 成本記錄表
-- ============================================================
-- 用途：記錄每一次 AI API 呼叫（Claude / DeepSeek / Kimi）的
--       tokens 與成本，支撐後台 AI 成本監控儀表板與預算告警。
--
-- 執行方式（由主控 Supabase MCP 跑）：
--   1. 於 Supabase SQL Editor 執行本檔案
--   2. 確認 ai_cost_log 表建立成功
--   3. 確認 RLS 只允許 service_role 存取
--
-- 使用方：`lib/ai-cost-tracker.ts` 於每次 AI 呼叫完成後寫入。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 關聯的報告（可為 NULL：例如審核、測試呼叫）
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE SET NULL,

  -- 方案代碼（冗余欄位，方便分析）
  plan_code TEXT,

  -- 使用的 provider 與 model
  -- provider: claude / deepseek / kimi / moonshot / openai / other
  provider TEXT NOT NULL,
  -- 例如 claude-opus-4-6、deepseek-chat、kimi-k2.5、moonshot-v1-auto
  model TEXT NOT NULL,

  -- 本次呼叫的階段（可選）：例如 analysis / review / compatibility / chumenji
  call_stage TEXT,

  -- Token 計數
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,

  -- 本次花費（USD，以美元精確到 6 位小數）
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,

  -- 延遲毫秒
  latency_ms INTEGER,

  -- 是否成功：成功 / 超時 / 失敗 / 重試
  status TEXT NOT NULL DEFAULT 'success',

  -- 錯誤訊息（失敗時）
  error_message TEXT,

  -- 任意 metadata（例如 temperature、max_tokens、重試次數、fallback 來源）
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_cost_log IS 'AI API 呼叫成本紀錄（每次呼叫一筆）';
COMMENT ON COLUMN public.ai_cost_log.report_id IS '所屬報告（NULL 代表測試/審核非綁報告的呼叫）';
COMMENT ON COLUMN public.ai_cost_log.provider IS 'claude / deepseek / kimi / moonshot / openai / other';
COMMENT ON COLUMN public.ai_cost_log.call_stage IS '可選：analysis / review / compatibility / chumenji / personality';
COMMENT ON COLUMN public.ai_cost_log.cost_usd IS '本次呼叫花費（USD，6 位小數）';

-- 查詢優化索引
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_created_at ON public.ai_cost_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_report ON public.ai_cost_log (report_id);
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_provider ON public.ai_cost_log (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_plan ON public.ai_cost_log (plan_code, created_at DESC);

-- 日/月聚合的部分索引（加速 dashboard 查詢）
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_day
  ON public.ai_cost_log (date_trunc('day', created_at), provider);

-- RLS：只允許 service_role
ALTER TABLE public.ai_cost_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_cost_log_service_only" ON public.ai_cost_log;
DROP POLICY IF EXISTS "ai_cost_log_no_public_access" ON public.ai_cost_log;

CREATE POLICY "ai_cost_log_no_public_access"
  ON public.ai_cost_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 驗證訊息
SELECT 'ai_cost_log table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'ai_cost_log'
);
