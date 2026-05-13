-- v5.10.265 Codex L3 final audit 修 P1#2:DB migration SQL 入 repo(可重現)
--
-- Applied: 2026-05-13 via Supabase MCP `apply_migration`
-- Migration name: sprint_2_5_add_partner_family_columns
-- Project: jvmnntavizbjsgofnusy(jamie-unified-db)
--
-- 風險評估:nullable column add = 零 downtime + 可 DROP rollback、安全
-- user_id UUID 已存在(2026-05-13 query 確認、32.5% match 中)、本 migration 不重加

ALTER TABLE paid_reports
ADD COLUMN IF NOT EXISTS partner_name TEXT,
ADD COLUMN IF NOT EXISTS partner_birth_date DATE,
ADD COLUMN IF NOT EXISTS partner_birth_city TEXT,
ADD COLUMN IF NOT EXISTS family_name TEXT,
ADD COLUMN IF NOT EXISTS report_result_json JSONB,
ADD COLUMN IF NOT EXISTS schema_version TEXT,
ADD COLUMN IF NOT EXISTS parse_status TEXT;

-- Index for user_id lookups(Sprint 2.5 RLS policy 用)
CREATE INDEX IF NOT EXISTS paid_reports_user_id_idx ON paid_reports(user_id);

-- Comment for future maintenance
COMMENT ON COLUMN paid_reports.partner_name IS 'R 方案合盤對方姓名(Sprint 2.5 加、目前 NULL、Sprint 2.x adapter 開始寫入)';
COMMENT ON COLUMN paid_reports.family_name IS 'G15 方案家族名稱(Sprint 2.5 加、目前 NULL、避免 charAt(0) 推姓不準)';
COMMENT ON COLUMN paid_reports.report_result_json IS 'Sprint 2.x LLM Extraction migration:markdown → JSON schema、render 優先序 json > raw_markdown';
COMMENT ON COLUMN paid_reports.parse_status IS '''full'' | ''partial'' | ''failed'' — Sprint 2.x extraction migration 狀態';

-- 對應:
--   - tasks/sprint_2_5_db_migration_plan.md(Codex+Gemini 共識草案)
--   - tasks/sprint_2_x_markdown_parser_plan.md(extraction 用)
--   - lib/report-adapter.ts:PaidReportRow type 對應(v5.10.260)

-- Rollback(若需):
-- ALTER TABLE paid_reports
-- DROP COLUMN IF EXISTS partner_name,
-- DROP COLUMN IF EXISTS partner_birth_date,
-- DROP COLUMN IF EXISTS partner_birth_city,
-- DROP COLUMN IF EXISTS family_name,
-- DROP COLUMN IF EXISTS report_result_json,
-- DROP COLUMN IF EXISTS schema_version,
-- DROP COLUMN IF EXISTS parse_status;
-- DROP INDEX IF EXISTS paid_reports_user_id_idx;
