-- v5.10.283 — 單一 metrics truth source(Codex P0#1 + Gemini P0#2)
-- Migration timestamp: 20260513152318
-- Migration name (Supabase): add_metrics_truth_source_views
--
-- 問題:
--   - 後台 dashboard 顯示「80 訂單」、Stripe 顯示「77」、recent activity 顯示「11」、無單一 truth
--   - 各 admin route 自己 join paid_reports + 過濾條件、規則 drift 嚴重
--   - 軟刪報告(deleted_at)在不同地方有不同 filter 行為
--
-- 解法:
--   建 3 個 view、所有 dashboard / metrics route 改 query view、規則寫死 SQL
--
--   1. v_paid_reports_active — 軟刪過濾 + net_amount_usd(扣退款後) computed
--   2. v_revenue_metrics — 7d/30d/total reports + completed counts + gross/net revenue + status breakdown
--   3. v_customer_metrics — unique paying customers + repeat + LTV(email lower-case 正規化)+ new customers
--
-- 套用後規範:
--   - app/api/admin/dashboard/snapshot/route.ts 改 query v_revenue_metrics(原 join 邏輯刪)
--   - app/api/admin/dashboard/revenue/route.ts 改 query v_revenue_metrics(原 .reduce() 計算刪)
--   - 任何「金額/筆數」陳述 一律 SELECT 自 view、不再寫 raw paid_reports
--
-- 注意:
--   - 純 VIEW、無 trigger、無 materialized、即時 query 即時算(50 行紀錄無壓力)
--   - 將來 paid_reports > 1M rows 時、可改 MATERIALIZED VIEW + REFRESH(本 migration 不做)

-- ============================================================
-- View 1: v_paid_reports_active
-- 過濾軟刪報告 + 計算淨金額(扣退款後)
-- ============================================================
CREATE OR REPLACE VIEW v_paid_reports_active AS
SELECT
  id,
  plan_code,
  status,
  customer_email,
  client_name,
  amount_usd,
  COALESCE(refunded_amount_usd, 0::numeric) AS refunded_amount_usd,
  GREATEST(0::numeric, COALESCE(amount_usd, 0::numeric) - COALESCE(refunded_amount_usd, 0::numeric)) AS net_amount_usd,
  refunded_at,
  refund_reason,
  created_at,
  user_id,
  stripe_session_id,
  retry_count,
  error_message
FROM paid_reports
WHERE deleted_at IS NULL;

COMMENT ON VIEW v_paid_reports_active IS
  'v5.10.283 — 軟刪過濾(deleted_at IS NULL)+ net_amount_usd 自動扣退款後. dashboard / metrics 唯一 truth source.';

-- ============================================================
-- View 2: v_revenue_metrics
-- 7d / 30d / total 維度的 訂單數 / 完成數 / gross / net revenue / status breakdown
-- ============================================================
CREATE OR REPLACE VIEW v_revenue_metrics AS
SELECT
  -- 7d window
  count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') AS reports_7d,
  count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days' AND status = 'completed') AS completed_7d,
  COALESCE(sum(amount_usd) FILTER (WHERE created_at > now() - INTERVAL '7 days' AND amount_usd > 0), 0::numeric) AS gross_revenue_7d,
  COALESCE(sum(net_amount_usd) FILTER (WHERE created_at > now() - INTERVAL '7 days' AND net_amount_usd > 0), 0::numeric) AS net_revenue_7d,

  -- 30d window
  count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') AS reports_30d,
  count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days' AND status = 'completed') AS completed_30d,
  COALESCE(sum(amount_usd) FILTER (WHERE created_at > now() - INTERVAL '30 days' AND amount_usd > 0), 0::numeric) AS gross_revenue_30d,
  COALESCE(sum(net_amount_usd) FILTER (WHERE created_at > now() - INTERVAL '30 days' AND net_amount_usd > 0), 0::numeric) AS net_revenue_30d,

  -- Total + status breakdown
  count(*) AS total_reports,
  count(*) FILTER (WHERE status = 'completed') AS total_completed,
  count(*) FILTER (WHERE status = 'pending') AS total_pending,
  count(*) FILTER (WHERE status = 'generating') AS total_generating,
  count(*) FILTER (WHERE status = 'failed') AS total_failed,
  count(*) FILTER (WHERE status = 'needs_human_review') AS total_needs_review,
  count(*) FILTER (WHERE refunded_at IS NOT NULL) AS total_refunded_count,

  -- Total revenue
  COALESCE(sum(amount_usd) FILTER (WHERE amount_usd > 0), 0::numeric) AS total_gross_revenue,
  COALESCE(sum(net_amount_usd) FILTER (WHERE net_amount_usd > 0), 0::numeric) AS total_net_revenue,
  COALESCE(sum(refunded_amount_usd), 0::numeric) AS total_refunded_amount,

  -- Distinct customers
  count(DISTINCT customer_email) FILTER (WHERE customer_email IS NOT NULL) AS unique_customers
FROM v_paid_reports_active;

COMMENT ON VIEW v_revenue_metrics IS
  'v5.10.283 — 唯一 dashboard / 後台 metrics truth source. 7d/30d/total + gross/net revenue.';

-- ============================================================
-- View 3: v_customer_metrics
-- 唯一付款客戶(email lower-case 正規化)+ 回購率 + LTV + 新客戶
-- ============================================================
CREATE OR REPLACE VIEW v_customer_metrics AS
WITH customer_stats AS (
  SELECT
    lower(customer_email) AS email,
    count(*) AS purchase_count,
    sum(net_amount_usd) FILTER (WHERE net_amount_usd > 0) AS lifetime_value,
    min(created_at) AS first_purchase_at,
    max(created_at) AS last_purchase_at
  FROM v_paid_reports_active
  WHERE customer_email IS NOT NULL
    AND amount_usd > 0
  GROUP BY lower(customer_email)
)
SELECT
  count(*) AS unique_paying_customers,
  count(*) FILTER (WHERE purchase_count >= 2) AS repeat_customers,
  COALESCE(avg(lifetime_value), 0::numeric) AS avg_ltv,
  COALESCE(avg(purchase_count), 0::numeric) AS avg_purchase_count,
  count(*) FILTER (WHERE first_purchase_at > now() - INTERVAL '7 days') AS new_customers_7d,
  count(*) FILTER (WHERE first_purchase_at > now() - INTERVAL '30 days') AS new_customers_30d
FROM customer_stats;

COMMENT ON VIEW v_customer_metrics IS
  'v5.10.283 — unique paying customers(email lower-case 正規化、防大小寫差視為不同人)+ repeat rate + LTV + new customers.';

-- ============================================================
-- 給 service_role 讀權限(views 預設繼承 base table 權限、明確 grant 防 RLS 干擾)
-- ============================================================
GRANT SELECT ON v_paid_reports_active TO service_role;
GRANT SELECT ON v_revenue_metrics TO service_role;
GRANT SELECT ON v_customer_metrics TO service_role;

-- 完成
SELECT 'v5.10.283 metrics truth source views created' AS migration_status;
