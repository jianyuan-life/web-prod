-- 🔴 P0 fix(Codex L3 backend audit P0#2):防 /api/reports DELETE hard delete 造成 revenue_log 永久分叉
--
-- Pre-fix state:
--   /api/reports DELETE 端點直接 hard delete paid_reports row
--   不刪 revenue_log 對應 entry
--   結果:後台會計 vs 報告數永久數據分叉(report 沒了但 revenue_log 還在)
--   結果:客戶刪除自己報告後若 dispute「我沒買過」、平台無證據
--
-- Mitigation:Soft delete pattern
--   1. 加 deleted_at TIMESTAMPTZ column
--   2. 改 DELETE handler 為 UPDATE set deleted_at = NOW()
--   3. 所有 SELECT query 加 WHERE deleted_at IS NULL
--   4. 加 partial index for active rows perf

ALTER TABLE paid_reports
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index 給之後 query 「WHERE deleted_at IS NULL」 加速
CREATE INDEX IF NOT EXISTS paid_reports_active_idx ON paid_reports(created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON COLUMN paid_reports.deleted_at IS
'Soft delete timestamp(v5.10.272、Codex P0#2 修):防 hard delete 跟 revenue_log 數據分叉、保留 audit trail';

-- ============================================================
-- 對應 app code 改動(v5.10.272):
--   - app/api/reports/route.ts DELETE handler:.delete() → .update({ deleted_at: NOW() })
--   - app/api/reports/route.ts GET handler:加 .is('deleted_at', null) filter
--   - app/report/[token]/page.tsx 2 處 query:加 .is('deleted_at', null) filter
-- 後續 SELECT query 也要逐步加 filter(其他 18 個檔案、Sprint 2.x.x 漸進)
-- ============================================================

-- Rollback(緊急用):
-- ALTER TABLE paid_reports DROP COLUMN deleted_at;
-- DROP INDEX paid_reports_active_idx;
