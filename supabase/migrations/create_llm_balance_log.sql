-- ============================================================
-- v5.3.2 監控系統（2026-04-18）：LLM 餘額歷史表
-- ============================================================
-- 用途：每小時排程抓各 provider 當下餘額，供監控儀表板與告警使用。
--
-- 執行方式（由主控 Supabase MCP 跑）：
--   1. 於 Supabase SQL Editor 執行本檔案
--   2. 確認 llm_balance_log 表建立成功
--
-- 資料來源：
--   - OpenAI    → billing / usage API
--   - Anthropic → 無 balance API（寫 unknown，依賴 console 人看）
--   - Moonshot  → /v1/users/me/balance
--   - DeepSeek  → /user/balance
--   - Gemini    → 免費配額，記當日用量
--   - Qwen      → DashScope 需要額外 key
-- ============================================================

CREATE TABLE IF NOT EXISTS public.llm_balance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- provider：openai / anthropic / moonshot / deepseek / gemini / qwen
  provider TEXT NOT NULL,

  -- 餘額（原始幣別數值）
  balance NUMERIC(14, 4),

  -- 幣別：USD / CNY / UNKNOWN
  currency TEXT NOT NULL DEFAULT 'USD',

  -- 換算成 USD 的餘額（便於跨 provider 比較）
  balance_usd NUMERIC(14, 4),

  -- 狀態：ok / low / critical / unknown / error
  -- low      < $10
  -- critical < $3
  -- unknown  → API 查不到（Anthropic 等）
  -- error    → 呼叫失敗
  status TEXT NOT NULL DEFAULT 'ok',

  -- 若 error，紀錄錯誤訊息
  error_message TEXT,

  -- 原始回傳（除錯用）
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 檢查時間
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.llm_balance_log IS 'LLM provider 餘額歷史（每小時 cron 寫一筆/provider）';
COMMENT ON COLUMN public.llm_balance_log.status IS 'ok / low (<$10) / critical (<$3) / unknown / error';

-- 索引：按 provider + 時間取最新一筆
CREATE INDEX IF NOT EXISTS idx_llm_balance_provider_time
  ON public.llm_balance_log (provider, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_balance_status
  ON public.llm_balance_log (status, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_balance_time
  ON public.llm_balance_log (checked_at DESC);

-- RLS：只允許 service_role 存取
ALTER TABLE public.llm_balance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_balance_no_public_access" ON public.llm_balance_log;

CREATE POLICY "llm_balance_no_public_access"
  ON public.llm_balance_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- View：每個 provider 的最新一筆餘額
CREATE OR REPLACE VIEW public.llm_balance_latest AS
SELECT DISTINCT ON (provider)
  provider,
  balance,
  currency,
  balance_usd,
  status,
  error_message,
  checked_at
FROM public.llm_balance_log
ORDER BY provider, checked_at DESC;

COMMENT ON VIEW public.llm_balance_latest IS '每個 LLM provider 最新一筆餘額（供儀表板讀）';

-- 驗證訊息
SELECT 'llm_balance_log table + view created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'llm_balance_log'
);
