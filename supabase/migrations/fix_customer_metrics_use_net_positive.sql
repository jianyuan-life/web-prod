-- v5.10.285 P2 修(Codex L3 audit v5.10.283 finding):
-- Migration timestamp: 20260513XXXXXX
-- Migration name (Supabase): fix_customer_metrics_use_net_positive
--
-- 問題:
--   v_customer_metrics 使用 amount_usd > 0 過濾、不算 net
--   = 全退款客戶仍會被算進 unique_paying_customers / repeat_customers / LTV
--   = 客戶 metrics 高估
--
-- 解法:
--   改用 net_amount_usd > 0(扣退款後仍正)、退款後不算付費客戶(語義對齊「真實付費」)
--   + HAVING 過濾、防全退款客戶進 unique 清單

CREATE OR REPLACE VIEW v_customer_metrics AS
WITH customer_stats AS (
  SELECT
    lower(customer_email) AS email,
    count(*) FILTER (WHERE net_amount_usd > 0) AS purchase_count,
    sum(net_amount_usd) FILTER (WHERE net_amount_usd > 0) AS lifetime_value,
    min(created_at) FILTER (WHERE net_amount_usd > 0) AS first_purchase_at,
    max(created_at) FILTER (WHERE net_amount_usd > 0) AS last_purchase_at
  FROM v_paid_reports_active
  WHERE customer_email IS NOT NULL
  GROUP BY lower(customer_email)
  -- v5.10.285 P2 修:HAVING 過濾、防 全退款客戶 進 unique 清單
  HAVING count(*) FILTER (WHERE net_amount_usd > 0) > 0
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
  'v5.10.285 — net_amount_usd > 0 過濾(全退款不算付費客戶、Codex P2 修)+ unique paying customers + repeat rate + LTV + new customers';

-- 完成
SELECT 'v5.10.285 v_customer_metrics fixed (net-positive only)' AS migration_status;
