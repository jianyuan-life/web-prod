-- 原子點數扣除 RPC 函式
-- 用 SQL 層級的原子操作確保不會出現負數餘額
-- 返回扣除後的新餘額，如果餘額不足則返回 -1

CREATE OR REPLACE FUNCTION deduct_points(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  -- 原子更新：只在餘額足夠時扣除
  UPDATE user_points
  SET
    balance = balance - p_amount,
    total_used = total_used + p_amount
  WHERE user_id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  -- 如果沒有更新到任何行（餘額不足或用戶不存在）
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_new_balance;
END;
$$;
