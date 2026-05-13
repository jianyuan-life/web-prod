-- Sprint 2.5 Phase 2:Backfill paid_reports.user_id from auth.users (case-insensitive email match)
-- Applied: 2026-05-13 via Supabase MCP execute_sql
-- 結果:26 → 76 matched(95.0% match rate、4 真孤兒留 NULL)
--
-- 風險評估:
--   - 零 — UPDATE 只填 NULL row(WHERE user_id IS NULL)
--   - 既有 26 個 user_id 已對齊不動(case-insensitive lower())
--   - 既有 customer_email-based RLS policy 不受影響(dual policy 仍 work)
--
-- 4 真孤兒(訪客購買、無 auth account 對應):
--   - jchien@mba20.rsm.nl × 2(用 email 但未註冊 auth.users — 可能社交登入或外部 invite)
--   - 2 個 empty email(訪客模式 / Stripe guest checkout)
--
-- 對應:
--   - tasks/sprint_2_5_db_migration_plan.md(Codex+Gemini 共識草案)
--   - supabase/migrations/20260513_sprint_2_5_phase_1_add_partner_family_columns.sql(Phase 1 已完成)
--   - 既有 RLS policy `customers_read_own`:dual auth.uid() OR jwt email match(已含 fallback、無需 swap)
--
-- 不該繼續做的 Phase 4-6(strict RLS swap):
--   - Phase 4 app dual-write:scope 大、需多檔改 + observation 24-48h
--   - Phase 5 strict RLS auth.uid() 切換:會 break 4 真孤兒(無法 view 自己報告)、需先處理孤兒
--   - Phase 6 NOT NULL constraint:同上、孤兒未解前不可加

-- ===== 實際 backfill SQL =====
UPDATE paid_reports pr
SET user_id = u.id
FROM auth.users u
WHERE pr.user_id IS NULL
  AND lower(pr.customer_email) = lower(u.email)
  AND pr.deleted_at IS NULL;

-- ===== 驗證 =====
SELECT
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS matched,
  COUNT(*) FILTER (WHERE user_id IS NULL) AS orphan,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE user_id IS NOT NULL) / COUNT(*), 1) AS match_pct
FROM paid_reports
WHERE deleted_at IS NULL;
-- Expected: 76 matched, 4 orphan, 80 total, 95.0%

-- ===== 4 真孤兒 row 列表(供 admin 後續處理) =====
SELECT id, customer_email, plan_code, created_at, status
FROM paid_reports
WHERE user_id IS NULL AND deleted_at IS NULL
ORDER BY created_at DESC;

-- 後續 (optional) 處理策略:
--   1. 發 email 邀請 jchien@mba20.rsm.nl 註冊綁定(2 個 row 自動匹配)
--   2. 2 個 empty email 訪客模式 → 用 access_token 持有者驗證(無 auth)
--   3. 全部留 NULL、靠 dual RLS policy 持續 work
