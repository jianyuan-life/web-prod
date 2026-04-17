-- ============================================================================
--  Migration: add_referred_email
--  目的：修復「推薦獎勵從未發放過」的致命 bug (L5 Audit P0)
--  日期：2026-04-17
--  原因：
--    1. 原本 create_referral_system.sql 的 referrals 表沒有 referred_email 欄位。
--    2. 但 webhook (app/api/webhook/stripe/route.ts:406) 和
--       admin API (app/api/admin/referrals/route.ts:23,62) 都用
--       `.eq('referred_email', customerEmail)` 來查詢。
--    3. 結果：首購 10 點、回購 5 點的發放邏輯 100% 失效。
--
--  這支 migration 做了以下事情：
--    A) 新增 referred_email 欄位（可重跑，IF NOT EXISTS）
--    B) 從 auth.users 回填歷史資料
--    C) 建立 index 加速查詢
--    D) 補 2 個 反作弊用的欄位（referred_ip / referrer_last_ip）
--    E) 補 idempotency 輔助 index
--
--  執行位置：Supabase Dashboard → SQL Editor → New Query → 貼上 → Run
--  這支 SQL 是【可重跑】的，多跑幾次不會出錯。
-- ============================================================================


-- A) 新增 referred_email 欄位 ----------------------------------------------
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referred_email TEXT;

COMMENT ON COLUMN referrals.referred_email IS
  '被推薦人註冊時的 email（用於 Stripe webhook 用 email 反查推薦關係）';


-- B) 回填歷史資料 ----------------------------------------------------------
-- 從 auth.users 拿 email 回填（僅回填還是 NULL 的記錄，不覆蓋現有值）
UPDATE referrals r
   SET referred_email = u.email
  FROM auth.users u
 WHERE r.referred_user_id = u.id
   AND r.referred_email IS NULL;


-- C) 加 index 加速 email 查詢 ---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_referrals_referred_email
  ON referrals(referred_email);

-- webhook 最常用的複合條件是 (referred_email, status)
CREATE INDEX IF NOT EXISTS idx_referrals_email_status
  ON referrals(referred_email, status);


-- D) 反作弊欄位：IP 追蹤（可選，L5 P1）--------------------------------------
-- 推薦人的「最後一次活動 IP」與 被推薦人的「註冊 IP」
-- 之後可以做：同 IP 註冊 24h 內觸發積分延遲 7 天 或 人工審核。
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referred_ip TEXT;

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referrer_last_ip TEXT;

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS suspicious_flag BOOLEAN DEFAULT false;

COMMENT ON COLUMN referrals.referred_ip       IS '被推薦人註冊當下的客戶端 IP（反作弊用）';
COMMENT ON COLUMN referrals.referrer_last_ip  IS '推薦人發送推薦當下的 IP（可為 NULL）';
COMMENT ON COLUMN referrals.suspicious_flag   IS '疑似刷獎標記（同 IP / disposable email 等）';


-- E) point_transactions 補複合 index（冪等查詢用）--------------------------
-- webhook 用 (reference_id, type) 去重發積分
CREATE INDEX IF NOT EXISTS idx_point_tx_ref_type
  ON point_transactions(reference_id, type);


-- F) auth_users_view 定義（如果專案還沒建過）------------------------------
-- webhook fallback 查詢會用到這個 view，用來把 email 換成 user_id。
-- 這是 SECURITY DEFINER view，讓 service_role 能查 auth.users。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE viewname = 'auth_users_view'
  ) THEN
    EXECUTE $v$
      CREATE VIEW auth_users_view AS
        SELECT id, email, created_at
          FROM auth.users
    $v$;
  END IF;
END $$;

-- 只有 service_role 能讀這個 view（不能讓前端 anon 看到所有 email）
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON auth_users_view FROM anon, authenticated';
EXCEPTION WHEN undefined_table THEN
  -- view 剛建好也可能還沒 grant，忽略
  NULL;
END $$;

GRANT SELECT ON auth_users_view TO service_role;


-- G) 驗證：回報有多少筆 referred_email 被成功回填 ---------------------------
DO $$
DECLARE
  v_total   INTEGER;
  v_filled  INTEGER;
  v_null    INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total  FROM referrals;
  SELECT COUNT(*) INTO v_filled FROM referrals WHERE referred_email IS NOT NULL;
  SELECT COUNT(*) INTO v_null   FROM referrals WHERE referred_email IS NULL;

  RAISE NOTICE '==========================================';
  RAISE NOTICE '   referrals 回填結果                     ';
  RAISE NOTICE '   總筆數:           %', v_total;
  RAISE NOTICE '   已填 email:       %', v_filled;
  RAISE NOTICE '   仍為 NULL:        % (可能是 user 已被刪除)', v_null;
  RAISE NOTICE '==========================================';
END $$;

-- ============================================================================
--  Migration 結束
--  執行完成後，請接著跑 check_referral_rewards.py 確認應補發的積分名單。
-- ============================================================================
