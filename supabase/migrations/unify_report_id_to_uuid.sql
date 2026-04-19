-- ============================================================================
-- Migration：統一 report_id 欄位型別為 UUID（修復 schema drift）
-- ============================================================================
--
-- 背景：
--   Bug #10 + #21：8 個含 report_id 的表型別不一致
--     - text 型別（2 個）：ai_cost_log, moderation_log
--     - uuid 型別（6 個）：expense_log, revenue_log, report_qa_log,
--                         report_feedback, report_views, revenue_net_view
--
--   code 層面 reportId 以字串傳遞，寫入 uuid 表時 Supabase JS SDK 會自動 cast，
--   但如果兩邊型別不一致，某些 JOIN / FK 約束會失敗；且兩個 text 表導致
--   report 分析類 query 無法跨表 JOIN on report_id。
--
-- 決策：
--   統一為 UUID（與 paid_reports.id 的 PK 型別一致）
--
-- ⚠️ 執行前必做：
--   1. Supabase Dashboard → 先 backup 這兩張表（pg_dump 或手動 snapshot）
--   2. 確認 ai_cost_log.report_id 和 moderation_log.report_id 裡沒有
--      「非 UUID 格式」的舊資料（歷史資料可能有 'test-xxx' 這種字串）
--      查詢驗證：
--        SELECT report_id FROM ai_cost_log
--        WHERE report_id IS NOT NULL
--          AND report_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
--        SELECT report_id FROM moderation_log
--        WHERE report_id IS NOT NULL
--          AND report_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
--      如果有任何 row 返回，必須先 UPDATE 成 NULL 或刪除，否則 ALTER 會失敗。
--
--   3. 確認沒有正在進行中的 workflow 在寫這兩張表（建議部署窗期執行）
--
-- 執行方式：
--   由老闆透過 Supabase Dashboard → SQL Editor 手動執行（不自動 apply）
--   或透過 Supabase MCP `apply_migration` 工具手動觸發
-- ============================================================================

BEGIN;

-- ── Step 1: 清理 ai_cost_log 中不合法的 UUID 字串（如果有）──
-- 如果確認歷史資料都是合法 UUID，這段可以跳過
UPDATE public.ai_cost_log
SET report_id = NULL
WHERE report_id IS NOT NULL
  AND report_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── Step 2: 清理 moderation_log 中不合法的 UUID 字串 ──
UPDATE public.moderation_log
SET report_id = NULL
WHERE report_id IS NOT NULL
  AND report_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── Step 3: 變更 ai_cost_log.report_id 為 UUID ──
ALTER TABLE public.ai_cost_log
  ALTER COLUMN report_id TYPE UUID USING report_id::uuid;

-- ── Step 4: 變更 moderation_log.report_id 為 UUID ──
ALTER TABLE public.moderation_log
  ALTER COLUMN report_id TYPE UUID USING report_id::uuid;

-- ── Step 5: 補上 FK 約束（與其他 6 個表一致）──
-- 注意：如果已經有 FK 約束會失敗，可以先跳過，另外手動檢查
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ai_cost_log'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%report_id%'
  ) THEN
    ALTER TABLE public.ai_cost_log
      ADD CONSTRAINT ai_cost_log_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES public.paid_reports(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'moderation_log'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%report_id%'
  ) THEN
    ALTER TABLE public.moderation_log
      ADD CONSTRAINT moderation_log_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES public.paid_reports(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

-- ── 驗證 query（執行完後手動跑一次確認）──
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE column_name = 'report_id'
--   AND table_schema = 'public'
-- ORDER BY table_name;
--
-- 預期結果：全部 8 個表的 report_id 都應該是 uuid
