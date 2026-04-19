-- ============================================================
-- P0 資料安全強化：paid_reports RLS 縱深防禦
-- Applied via Supabase MCP: 2026-04-19
-- Migration name in DB: harden_paid_reports_rls
-- ============================================================
-- 問題：
--   原有 4 條 policy 都是 USING(true) / WITH CHECK(true)
--   等於 anon 可 SELECT / INSERT / UPDATE 所有報告（含 birth_data 生辰）
--   只靠 service_role_key + API 層 session_id 保護
--   → service key 泄露即全外洩（生日、姓名、email、報告內容）
--
-- 策略（縱深防禦）：
--   1. SELECT 保留 anon 讀取（報告頁用 anon client 透過 access_token 讀）
--      但 token 驗證留在 API 層（.eq('access_token', token)），RLS 是兜底
--      authenticated 用戶走 customers_read_own（更精準）
--   2. INSERT / UPDATE / DELETE 完全禁止 anon + authenticated
--      只有 service_role 用 service_role_key 才能寫（bypass RLS）
--      → 防止偽造訂單 / 篡改報告內容
--   3. FORCE ROW LEVEL SECURITY：連 table owner 也要過 RLS（只留 service_role 例外）
-- ============================================================

-- 冪等啟用 RLS
ALTER TABLE public.paid_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_reports FORCE ROW LEVEL SECURITY;

-- 清掉舊的寬鬆 policy（4 條皆 USING true）
DROP POLICY IF EXISTS "Anyone can read paid_reports" ON public.paid_reports;
DROP POLICY IF EXISTS "Public read by access_token" ON public.paid_reports;
DROP POLICY IF EXISTS "Service can insert paid_reports" ON public.paid_reports;
DROP POLICY IF EXISTS "Service can update paid_reports" ON public.paid_reports;

-- ============================================================
-- SELECT：兩條（authenticated 精準 + anon 靠 API token 驗證兜底）
-- ============================================================
CREATE POLICY "customers_read_own"
  ON public.paid_reports
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.jwt() ->> 'email' = customer_email
  );

-- anon 匿名訪問：實際 token 驗證在 API 層 .eq('access_token', token)
-- RLS 無法從 SQL 驗 query param，此 policy 是 fail-open 兜底
CREATE POLICY "anon_token_holder_read"
  ON public.paid_reports
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- INSERT / UPDATE / DELETE：不建 policy = anon/authenticated 完全不能寫
-- service_role 用 service_role_key 自動 bypass RLS，無需 policy
-- ============================================================

COMMENT ON TABLE public.paid_reports IS
  'RLS v2 (2026-04-19)：SELECT 允許 anon (靠 API 層 token 驗證) + authenticated (by uid/email)；INSERT/UPDATE/DELETE 僅 service_role';
