-- 🔴 P0 fix(Gemini P0#4 + Codex P0#6):recalculate-report 覆蓋舊報告無回滾路徑
--
-- Pre-fix state:
--   /jamie/recalculate 重算 → orders PATCH or recalculate-report 直接 update set report_result = null
--   原來客戶看的 ai_content 永久丟失
--   若客戶 dispute「新的不準、要回舊版」、平台無證據也無 restore 路徑
--
-- Mitigation:加 previous_report_result(JSONB) + recalculated_at + recalculated_by
--   每次 recalculate 觸發前 swap report_result → previous_report_result
--   只存最近 1 次(避免肥大、Sprint 2.x.x 視需要加 report_history 獨立 table)
--   admin restore script(Sprint 3 加 UI):UPDATE report_result = previous_report_result
--
-- Applied:2026-05-13 via Supabase MCP

ALTER TABLE paid_reports
ADD COLUMN IF NOT EXISTS previous_report_result JSONB,
ADD COLUMN IF NOT EXISTS recalculated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recalculated_by TEXT;

COMMENT ON COLUMN paid_reports.previous_report_result IS
'Recalculate 前的舊 report_result 母本(v5.10.274、Gemini P0#4 修):防 admin 重算後客戶 dispute 無證據';

COMMENT ON COLUMN paid_reports.recalculated_at IS
'最後一次 recalculate 時間戳(v5.10.274)';

COMMENT ON COLUMN paid_reports.recalculated_by IS
'最後 recalculate 觸發者(admin_key 或 user_email、Sprint 2.x admin actor 化後改 user_id)';

-- ============================================================
-- 對應 app code 改動(v5.10.274):
--   - app/api/admin/recalculate-report/route.ts:select 加 report_result、update 加 swap
--   - app/api/admin/orders/route.ts PATCH:select 加 report_result、update 加 swap
--
-- 後續(Sprint 2.x):
--   - 加 admin UI 在 /jamie/orders/[id] 顯示「上一版報告」+ Restore 按鈕
--   - Restore 按鈕做:UPDATE report_result = previous_report_result, status = 'completed'
-- ============================================================

-- Rollback(緊急用):
-- ALTER TABLE paid_reports DROP COLUMN previous_report_result, DROP COLUMN recalculated_at, DROP COLUMN recalculated_by;
