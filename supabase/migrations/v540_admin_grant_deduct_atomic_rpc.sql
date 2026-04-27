-- v5.4.16 P1(Codex 真審):admin grant/deduct 原子操作 RPC
-- 解 grant-points API 的跨表 race condition:
--   原邏輯:UPDATE user_points → INSERT point_transactions → writeAuditLog
--   問題:point_transactions INSERT 失敗時、餘額已變但流水/audit 不存在、帳不一致
--   解法:用 PostgreSQL function 把 update + insert 包進單一 transaction
--
-- 部署:supabase db push 或 supabase 後台 SQL editor 跑一次
-- 老闆需手動執行(non-destructive、可重複跑)

CREATE OR REPLACE FUNCTION admin_grant_or_deduct_points(
  p_user_id UUID,
  p_points INTEGER,         -- 正數=發、負數=扣
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  before_balance INTEGER,
  after_balance INTEGER,
  delta INTEGER,
  action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
  v_action TEXT;
  v_existing RECORD;
BEGIN
  -- 鎖列防 race(SELECT FOR UPDATE)
  SELECT balance, total_earned, total_used INTO v_existing
  FROM user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 新用戶:扣點不允許
    IF p_points < 0 THEN
      RAISE EXCEPTION '新用戶無歷史餘額、無法扣點(% 點)', p_points;
    END IF;
    -- 發點:初始化
    v_before := 0;
    v_after := p_points;
    INSERT INTO user_points (user_id, balance, total_earned, total_used)
    VALUES (p_user_id, p_points, p_points, 0);
  ELSE
    v_before := v_existing.balance;
    v_after := v_before + p_points;
    -- 防呆:扣點不可讓餘額 < 0
    IF v_after < 0 THEN
      RAISE EXCEPTION '扣點 % 會讓餘額變負(目前 %、扣後 %)', ABS(p_points), v_before, v_after;
    END IF;
    UPDATE user_points
    SET balance = v_after,
        total_earned = v_existing.total_earned + (CASE WHEN p_points > 0 THEN p_points ELSE 0 END),
        total_used = v_existing.total_used + (CASE WHEN p_points < 0 THEN ABS(p_points) ELSE 0 END)
    WHERE user_id = p_user_id;
  END IF;

  -- 寫流水(同 transaction)
  v_action := CASE WHEN p_points < 0 THEN 'admin_deduct' ELSE 'admin_grant' END;
  INSERT INTO point_transactions (user_id, type, amount, balance_after, description, reference_id)
  VALUES (p_user_id, v_action, p_points, v_after, p_description, COALESCE(p_reference_id, 'admin_' || extract(epoch from now())::bigint::text));

  -- 回傳結果
  RETURN QUERY SELECT v_before, v_after, p_points, v_action;
END;
$$;

-- Grant SECURITY DEFINER 後限制:只 service_role 可呼叫
REVOKE ALL ON FUNCTION admin_grant_or_deduct_points(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_or_deduct_points(UUID, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION admin_grant_or_deduct_points IS
  'v5.4.16 atomic admin grant/deduct points. 跨表 transaction、防 race + 原子性。';
