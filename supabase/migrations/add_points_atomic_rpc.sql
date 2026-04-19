-- ============================================================================
--  Migration: add_points_atomic_rpc
--  目的：防止「推薦積分發放」race condition（同一秒兩筆 webhook 造成積分錯算）
--  日期：2026-04-19
--
--  背景：
--    原本 webhook 用 addPointsSafe() 做「先 select → 再 update」兩步：
--      const { data } = await supabase.from('user_points').select(...).eq(...)
--      if (data) { update } else { insert }
--    如果同時兩筆 webhook（e.g. 用戶同一秒買兩個方案），會出現：
--      T1: select balance=100
--      T2: select balance=100
--      T1: update balance=110 (+10)
--      T2: update balance=110 (+10)  ← 少記 10 點！
--    這在 Stripe 大促/批量結帳時會發生，金額上會直接是錢流 bug。
--
--  修法：
--    用 PostgreSQL 原子 UPSERT（ON CONFLICT DO UPDATE）一條 SQL 搞定：
--    - 不存在 → INSERT
--    - 已存在 → UPDATE balance = balance + p_delta
--    並同時 INSERT point_transactions，兩步放進單一 transaction。
--
--  冪等性：
--    p_reference_id 不為 NULL 時，先檢查 point_transactions 是否已有同一
--    (reference_id, type) 的記錄，有就 skip（實現冪等，webhook 重送不會重複發）。
--
--  安全：
--    SECURITY DEFINER 讓 service_role 呼叫時仍走 RLS 繞過（本來 service 就該能寫）。
--    p_user_id 強型別 uuid，擋住 SQL injection。
--
--  執行：Supabase Dashboard → SQL Editor 或透過 MCP apply_migration。
--  可重跑（CREATE OR REPLACE）。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference_id text DEFAULT NULL,
  p_type text DEFAULT 'earn_referral',
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE(balance_after integer, skipped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_existing_id uuid;
BEGIN
  -- 參數驗證
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;
  IF p_delta IS NULL THEN
    RAISE EXCEPTION 'p_delta cannot be NULL';
  END IF;

  -- 冪等性檢查：如果同一個 (reference_id, type) 已經處理過，直接跳過
  IF p_reference_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM point_transactions
     WHERE reference_id = p_reference_id
       AND type = p_type
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- 已處理過，返回當前餘額 + skipped=true
      SELECT COALESCE(balance, 0) INTO v_new_balance
        FROM user_points
       WHERE user_id = p_user_id;
      RETURN QUERY SELECT COALESCE(v_new_balance, 0), true;
      RETURN;
    END IF;
  END IF;

  -- 原子 UPSERT：不存在就建，存在就加
  INSERT INTO user_points (user_id, balance, total_earned, total_used)
  VALUES (
    p_user_id,
    GREATEST(0, p_delta),  -- 新建時 balance 不能為負
    GREATEST(0, p_delta),  -- 正值才計入 total_earned
    CASE WHEN p_delta < 0 THEN -p_delta ELSE 0 END  -- 負值計入 total_used
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    balance = GREATEST(0, user_points.balance + p_delta),  -- 防負數
    total_earned = user_points.total_earned + GREATEST(0, p_delta),
    total_used = user_points.total_used + CASE WHEN p_delta < 0 THEN -p_delta ELSE 0 END,
    updated_at = NOW()
  RETURNING balance INTO v_new_balance;

  -- 同一個 transaction 寫入 point_transactions
  INSERT INTO point_transactions (
    user_id,
    type,
    amount,
    balance_after,
    description,
    reference_id,
    expires_at
  ) VALUES (
    p_user_id,
    p_type,
    p_delta,
    v_new_balance,
    p_reason,
    p_reference_id,
    p_expires_at
  );

  RETURN QUERY SELECT v_new_balance, false;
END;
$$;

COMMENT ON FUNCTION public.add_points IS
  '原子加點 RPC：防 race condition + 支援冪等（reference_id 已存在則 skip）。取代 webhook 的 addPointsSafe。';

-- 授權給 service_role 和 authenticated（webhook 和 API 呼叫時用）
GRANT EXECUTE ON FUNCTION public.add_points TO service_role;
GRANT EXECUTE ON FUNCTION public.add_points TO authenticated;

-- 驗證：列出當前 add_points 函式簽名
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '   add_points RPC 建立/更新完成          ';
  RAISE NOTICE '   簽名：add_points(uuid, int, text, text, text, timestamptz)';
  RAISE NOTICE '   返回：TABLE(balance_after int, skipped bool)';
  RAISE NOTICE '   冪等：同一 reference_id + type 只發一次';
  RAISE NOTICE '==========================================';
END $$;

-- ============================================================================
--  Migration 結束
--  後續 webhook/referral code 只要改為：
--    const { data, error } = await supabase.rpc('add_points', {
--      p_user_id: userId,
--      p_delta: 10,
--      p_reason: '推薦首購獎勵',
--      p_reference_id: session.id,
--      p_type: 'earn_referral',
--      p_expires_at: expiresAtIso,
--    })
--    const { balance_after, skipped } = data[0]
-- ============================================================================
