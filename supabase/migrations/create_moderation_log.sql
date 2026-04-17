-- Content Moderation 日誌表（2026-04-17）
-- 目的：AI 報告的內容安全稽核紀錄，flagged 後可人工審查/強制放行/重新生成
--
-- 執行方式（Jamie 手動執行）：
--   1. 在 Supabase SQL Editor 貼上本檔案內容
--   2. 執行
--   3. 確認 moderation_log 表存在
--
-- 欄位說明：
--   report_id       — 對應 paid_reports.id
--   plan_code       — 方案代碼（C/D/G15/R/E1/E2）
--   action          — 最終動作（pass/warn/retry_with_guard/hard_block/force_pass/regenerated）
--   blocked         — 是否曾經被阻擋（布林，供後台快速篩）
--   reason          — 主要觸發原因（截斷 500 字）
--   hits            — 黑名單命中陣列（jsonb，含 category/severity/pattern/matched/snippet）
--   ai_scores       — AI 審查各類別分數（jsonb）
--   content_preview — 報告前 500 字預覽（給 admin 判斷）
--   retry_attempt   — 第幾次重試
--   status          — 狀態（passed/flagged/force_passed/regenerated）
--   admin_note      — 管理員處置備註
--   created_at / updated_at

CREATE TABLE IF NOT EXISTS public.moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('pass', 'warn', 'retry_with_guard', 'hard_block', 'force_pass', 'regenerated')),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_preview TEXT,
  retry_attempt INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('passed', 'flagged', 'force_passed', 'regenerated', 'dismissed')),
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_moderation_log_created_at ON public.moderation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_status ON public.moderation_log (status);
CREATE INDEX IF NOT EXISTS idx_moderation_log_blocked ON public.moderation_log (blocked) WHERE blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_moderation_log_report_id ON public.moderation_log (report_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_plan_code ON public.moderation_log (plan_code);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION public.set_moderation_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_moderation_log_updated_at ON public.moderation_log;
CREATE TRIGGER trg_moderation_log_updated_at
  BEFORE UPDATE ON public.moderation_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_moderation_log_updated_at();

-- RLS：只有 service_role 能讀寫
ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moderation_log_service_only" ON public.moderation_log;
CREATE POLICY "moderation_log_no_public_access"
  ON public.moderation_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 備註
COMMENT ON TABLE public.moderation_log IS 'AI 報告內容安全審查日誌';
COMMENT ON COLUMN public.moderation_log.action IS 'pass=全過/warn=警告放行/retry_with_guard=加警語重跑/hard_block=強擋/force_pass=人工放行/regenerated=重新生成';
COMMENT ON COLUMN public.moderation_log.status IS 'passed=通過/flagged=已標記待審/force_passed=人工放行/regenerated=已重生/dismissed=忽略';
COMMENT ON COLUMN public.moderation_log.hits IS '黑名單命中陣列，每項含 category/severity/pattern/matched_text/snippet/reason';
COMMENT ON COLUMN public.moderation_log.ai_scores IS 'AI Moderation API 回傳的各類別分數 (0~1)';

-- 驗證訊息
SELECT 'moderation_log table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'moderation_log'
);
