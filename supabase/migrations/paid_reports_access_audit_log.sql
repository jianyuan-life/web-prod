-- v5.10.291 Phase 5-6 MVP — paid_reports 訪問 audit log(不切 strict RLS、保留 dual policy)
-- Applied: 2026-05-14 via Supabase MCP apply_migration
--
-- 背景:
--   Phase 5-6 spec 是 strict RLS swap(auth.uid()=user_id only)、但有 4 真孤兒會 break:
--     - 2 個 empty email 訪客(從 Stripe guest checkout)
--     - 2 個 jchien@... 未註冊 auth 帳號
--   切 strict 後孤兒無法查自己報告。
--
-- MVP 解法(不切 strict、保留 dual policy):
--   加 audit log 紀錄哪些 access 走 email-match fallback(視作 deprecated path)
--   未來 4 孤兒處理完(發 email 邀請註冊 / 走訪客 access_token)、就可切 strict
--   本 audit log 提供切換證據(deprecated path 訪問量 → 0 時即可 cutover)
--
-- 風險:零 — 純新 table、不動既有 RLS policy、production 0 影響
-- 後續(下 sprint):
--   - lib/auth-helper-server.ts 加 logAccessMatch() helper
--   - 主要 read path(/report/[token]/page.tsx + /api/admin/orders 等)埋點
--   - 7 天觀察 deprecated path 訪問量趨勢
--   - 趨近 0 時切 strict RLS、本 table 仍保留作 historical 證據

CREATE TABLE IF NOT EXISTS public.paid_reports_access_log (
  id BIGSERIAL PRIMARY KEY,
  report_id UUID,
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  auth_uid UUID,                  -- jwt 的 auth.uid()
  auth_email TEXT,                -- jwt 的 email
  matched_via TEXT,               -- 'user_id' | 'email_fallback' | 'service_role' | 'unknown'
  ip_hash TEXT,                   -- IP hash(SHA256、隱私)
  user_agent_fragment TEXT        -- UA 前 80 chars
);

CREATE INDEX IF NOT EXISTS paid_reports_access_log_report_idx
  ON public.paid_reports_access_log(report_id);
CREATE INDEX IF NOT EXISTS paid_reports_access_log_time_idx
  ON public.paid_reports_access_log(accessed_at DESC);
CREATE INDEX IF NOT EXISTS paid_reports_access_log_matched_idx
  ON public.paid_reports_access_log(matched_via);

-- RLS:只 service_role 可讀寫(隱私 log、admin only)
ALTER TABLE public.paid_reports_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY paid_reports_access_log_admin_only
ON public.paid_reports_access_log
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

COMMENT ON TABLE public.paid_reports_access_log IS
  'v5.10.291 — 訪問審計 log、追蹤哪些 access 走 email fallback(Phase 5-6 strict RLS 切換證據基礎)';
COMMENT ON COLUMN public.paid_reports_access_log.matched_via IS
  '''user_id'' = strict match;''email_fallback'' = deprecated 路徑(需轉訪客或註冊);''service_role'' = admin / cron';
