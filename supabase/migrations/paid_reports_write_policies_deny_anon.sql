-- v5.10.290 — paid_reports INSERT/UPDATE/DELETE RLS policies(防 anon role 直接寫)
-- Applied: 2026-05-14 via Supabase MCP apply_migration
--
-- 背景:
--   - Sprint 2.5 Phase 1 已加 user_id UUID + 7 columns(2026-05-13)
--   - Phase 2 已 backfill 26→76 matched(95%、2026-05-13)
--   - Phase 3 已存在 SELECT dual policy `customers_read_own`(auth.uid() OR jwt email)
--   - 本 migration = Phase 4 ship MVP:加 deny-anon write policies(不必等 strict swap)
--
-- 現狀(本 migration 前):
--   - SELECT policy 存在
--   - INSERT/UPDATE/DELETE 無 policy = anon 預設 deny(RLS enabled)、但 service role 永遠 bypass
--
-- 修補:
--   明確加 deny-anon policies for INSERT/UPDATE/DELETE、防 RLS bypass bug 或 service role key 外洩時:
--   - INSERT:全 deny(anon 不能新增訂單、必走 Stripe webhook = service role)
--   - UPDATE:全 deny(authenticated 用戶不應透過 RLS 直接 UPDATE 報告、任何更新必走 API)
--   - DELETE:全 deny(軟刪走 UPDATE deleted_at = service role)
--
-- 風險評估:零 — defense-in-depth、service role 永遠 bypass RLS、production 服務 0 影響
--
-- 對應:
--   - tasks/sprint_2_5_db_migration_plan.md Phase 4(MVP 版、不切 strict SELECT)
--   - lesson #129/#130(soft-delete + 完成度規則)

CREATE POLICY paid_reports_deny_insert_anon
ON paid_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY paid_reports_deny_update_anon
ON paid_reports
FOR UPDATE
TO anon, authenticated
USING (false);

CREATE POLICY paid_reports_deny_delete_anon
ON paid_reports
FOR DELETE
TO anon, authenticated
USING (false);

COMMENT ON POLICY paid_reports_deny_insert_anon ON paid_reports IS
  'v5.10.290 defense-in-depth: anon/authenticated 不能直接 INSERT(必走 Stripe webhook + service role)';
COMMENT ON POLICY paid_reports_deny_update_anon ON paid_reports IS
  'v5.10.290 defense-in-depth: anon/authenticated 不能直接 UPDATE(必走 API route + service role)';
COMMENT ON POLICY paid_reports_deny_delete_anon ON paid_reports IS
  'v5.10.290 defense-in-depth: anon/authenticated 不能直接 DELETE(軟刪走 UPDATE + service role)';
