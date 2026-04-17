-- L7 P0 修復 (2026-04-17)：後台稽核日誌表
-- 目的：所有 /api/admin/* 的敏感寫入動作留痕，出事可追溯
--
-- 執行方式（Jamie 手動執行）：
--   1. 在 Supabase SQL Editor 貼上本檔案內容
--   2. 執行
--   3. 確認 admin_audit_log 表存在
--
-- 注意：RLS 只允許 service_role 存取（anon/authenticated 都不能讀寫）

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 動作類型（login / refund / grant_points / delete_coupon / ...）
  action TEXT NOT NULL,
  -- 目標類型（user / order / report / coupon / promotion / refund / ...）
  target_type TEXT,
  -- 目標 ID（對應表的 id 或 email）
  target_id TEXT,
  -- 額外 metadata（例如退款金額、Stripe refund id、操作原因）
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 操作者 IP
  ip TEXT,
  -- 操作者 User-Agent
  user_agent TEXT,
  -- 預留：未來若支援多個 admin 帳號
  admin_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 查詢優化索引
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log (target_type, target_id);

-- RLS 保護：只有 service_role 能讀寫
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 刪除舊 policy（如果有）以免衝突
DROP POLICY IF EXISTS "admin_audit_log_service_only" ON public.admin_audit_log;

-- service_role 透過 SUPABASE_SERVICE_ROLE_KEY 繞過 RLS 操作，所以不需要 policy；
-- 以下 policy 明確拒絕所有其他角色
CREATE POLICY "admin_audit_log_no_public_access"
  ON public.admin_audit_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ================================================================
-- 退款欄位：paid_reports 表補上退款紀錄
-- ================================================================

-- 檢查 paid_reports 是否存在（應該存在），補上退款相關欄位
ALTER TABLE public.paid_reports
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount_usd NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

COMMENT ON COLUMN public.paid_reports.refunded_at IS '退款時間（NULL=未退款）';
COMMENT ON COLUMN public.paid_reports.refunded_amount_usd IS '退款金額（USD），可能與 amount_usd 不同（部分退款）';
COMMENT ON COLUMN public.paid_reports.refund_reason IS '退款原因（admin 填寫或 Stripe 回傳）';
COMMENT ON COLUMN public.paid_reports.stripe_refund_id IS 'Stripe refund 物件 id（re_xxx）';

-- 驗證訊息
SELECT 'admin_audit_log table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
);
