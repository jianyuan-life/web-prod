-- v5.10.461(2026-07-03)P0 真因修配套:
-- production 實測 paid_reports.apology_sent_at 欄位不存在(42703)、
-- 原 code select 含它 → 整句 400 → 致歉信流程從未運作。
-- code 已改為不依賴此欄位(防重寄查 email_send_log);
-- 本 migration 補上欄位作為第二防線 + 後台可視化「已致歉」狀態。
-- ⚠️ 待老闆在 Supabase SQL Editor 手動執行(對齊 add_referred_email.sql 慣例)。

ALTER TABLE paid_reports
  ADD COLUMN IF NOT EXISTS apology_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN paid_reports.apology_sent_at IS '終局失敗致歉信寄出時間(防重寄第二防線、主防線=email_send_log)';
