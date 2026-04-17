-- ============================================================
-- L7+ BI 後台優化（2026-04-17）：Email 送達紀錄表
-- ============================================================
-- 用途：記錄每一封透過 Resend 發送的系統信（報告完成信、退訂確認、
--       推薦獎勵、退款通知、管理員致歉信等）的狀態，支援後台送達率
--       監控與 CAN-SPAM 留痕合規。
--
-- 執行方式（由主控 Supabase MCP 跑）：
--   1. 於 Supabase SQL Editor 執行本檔案
--   2. 確認 email_send_log 表建立成功
--
-- 未來可額外接 Resend Webhook 把 delivered / bounced / complained 回寫。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Resend 回傳的 message id（成功送出才有）
  resend_id TEXT,

  -- 收件人
  to_email TEXT NOT NULL,

  -- 寄件人（通常 noreply@jianyuan.life）
  from_email TEXT NOT NULL DEFAULT 'noreply@jianyuan.life',

  -- 信件類型：
  -- report_ready / report_failed_apology / referral_reward / refund_notice
  -- welcome / password_reset / weekly_digest / admin_alert / other
  email_type TEXT NOT NULL,

  -- 主旨
  subject TEXT NOT NULL,

  -- 對應的報告（可選）
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE SET NULL,

  -- 對應的用戶（可選）
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 狀態：queued / sent / delivered / bounced / complained / failed
  status TEXT NOT NULL DEFAULT 'queued',

  -- 錯誤訊息（若失敗）
  error_message TEXT,

  -- 實際送達時間（Resend webhook 回填）
  delivered_at TIMESTAMPTZ,

  -- 退信/投訴時間
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,

  -- 任意 metadata（Resend 完整回傳、trigger 來源）
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_send_log IS '系統 Email 送達紀錄（Resend 送出 + 狀態追蹤）';
COMMENT ON COLUMN public.email_send_log.status IS 'queued / sent / delivered / bounced / complained / failed';

-- 索引
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to ON public.email_send_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON public.email_send_log (email_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_send_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_report ON public.email_send_log (report_id);
CREATE INDEX IF NOT EXISTS idx_email_log_resend_id ON public.email_send_log (resend_id);

-- RLS：只允許 service_role 存取（anon / authenticated 一律拒絕）
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_send_log_no_public_access" ON public.email_send_log;

CREATE POLICY "email_send_log_no_public_access"
  ON public.email_send_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 驗證訊息
SELECT 'email_send_log table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'email_send_log'
);
