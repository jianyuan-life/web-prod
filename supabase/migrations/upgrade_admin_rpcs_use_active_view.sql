-- v5.10.283 — 升級 admin RPC 改 query v_paid_reports_active(soft-delete safe + 加 net_revenue_usd)
-- Migration timestamp: 20260513152319
-- Migration name (Supabase): upgrade_admin_rpcs_use_active_view
--
-- 問題:
--   - admin_dashboard_snapshot 直接 query paid_reports、未過濾 deleted_at IS NULL
--     → 軟刪報告(v5.10.272 起支援)會被算進今日營收 / 訂單數、metrics 失準
--   - admin_funnel_analysis 同樣問題、payment_success / report_generated fallback 含軟刪
--   - 兩 RPC 也只算 gross revenue、未提供 net revenue(扣退款後實際入帳)
--
-- 解法:
--   - admin_dashboard_snapshot:改 v_paid_reports_active + 加 today.net_revenue_usd / yesterday.net_revenue_usd
--   - admin_funnel_analysis:reports_base CTE 改 v_paid_reports_active(funnel 不需 net、暫不加)
--
-- 影響:
--   - 前端 dashboard /jamie 主頁今日快照、新增「淨營收(扣退款)」欄位選項(後續 UI 升級)
--   - 軟刪報告永久不再進 metrics(符合「軟刪即視同不存在」語義)

CREATE OR REPLACE FUNCTION public.admin_dashboard_snapshot(
  start_today timestamp with time zone,
  start_yesterday timestamp with time zone,
  end_ts timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  reports_today AS (
    SELECT
      COUNT(*)::bigint                                           AS orders,
      COALESCE(SUM(CASE WHEN amount_usd > 0 THEN amount_usd END), 0)::numeric
                                                                 AS revenue_usd,
      COALESCE(SUM(CASE WHEN net_amount_usd > 0 THEN net_amount_usd END), 0)::numeric
                                                                 AS net_revenue_usd,
      COUNT(*) FILTER (WHERE status = 'completed')::bigint        AS reports_completed,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint           AS reports_failed,
      COUNT(*) FILTER (WHERE status IN ('generating', 'pending'))::bigint
                                                                 AS reports_generating,
      COUNT(DISTINCT LOWER(COALESCE(customer_email, '')))
        FILTER (WHERE COALESCE(customer_email, '') <> '')::bigint AS paying_customers
    FROM public.v_paid_reports_active
    WHERE created_at >= start_today
      AND created_at <  end_ts
  ),
  reports_yesterday AS (
    SELECT
      COUNT(*)::bigint                                           AS orders,
      COALESCE(SUM(CASE WHEN amount_usd > 0 THEN amount_usd END), 0)::numeric
                                                                 AS revenue_usd,
      COALESCE(SUM(CASE WHEN net_amount_usd > 0 THEN net_amount_usd END), 0)::numeric
                                                                 AS net_revenue_usd,
      COUNT(DISTINCT LOWER(COALESCE(customer_email, '')))
        FILTER (WHERE COALESCE(customer_email, '') <> '')::bigint AS paying_customers
    FROM public.v_paid_reports_active
    WHERE created_at >= start_yesterday
      AND created_at <  start_today
  ),
  visitors_base AS (
    SELECT
      v.session_id,
      v.created_at,
      (
        COALESCE(v.user_agent, '') ILIKE '%HeadlessChrome%' OR
        COALESCE(v.user_agent, '') ILIKE '%vercel-screenshot%' OR
        COALESCE(v.user_agent, '') ILIKE '%bot%' OR
        COALESCE(v.user_agent, '') ILIKE '%crawler%' OR
        COALESCE(v.user_agent, '') ILIKE '%spider%' OR
        COALESCE(v.user_agent, '') ILIKE '%Googlebot%' OR
        COALESCE(v.user_agent, '') ILIKE '%Bingbot%' OR
        COALESCE(v.user_agent, '') ILIKE '%Slurp%' OR
        COALESCE(v.user_agent, '') ILIKE '%DuckDuckBot%' OR
        COALESCE(v.user_agent, '') ILIKE '%Baiduspider%' OR
        COALESCE(v.user_agent, '') ILIKE '%YandexBot%' OR
        COALESCE(v.user_agent, '') ILIKE '%facebookexternalhit%' OR
        COALESCE(v.user_agent, '') ILIKE '%Twitterbot%'
      ) AS is_bot
    FROM public.visitor_events v
    WHERE v.created_at >= start_yesterday
      AND v.created_at <  end_ts
      AND v.session_id IS NOT NULL
  ),
  dau_today AS (
    SELECT COUNT(DISTINCT session_id)::bigint AS dau
    FROM visitors_base
    WHERE NOT is_bot
      AND created_at >= start_today
      AND created_at <  end_ts
  ),
  dau_yesterday AS (
    SELECT COUNT(DISTINCT session_id)::bigint AS dau
    FROM visitors_base
    WHERE NOT is_bot
      AND created_at >= start_yesterday
      AND created_at <  start_today
  ),
  free_tool_today AS (
    SELECT COUNT(*)::bigint AS usage_count
    FROM public.free_tool_usage
    WHERE created_at >= start_today
      AND created_at <  end_ts
  )
  SELECT jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'today', jsonb_build_object(
      'orders',              (SELECT orders FROM reports_today),
      'revenue_usd',         ROUND((SELECT revenue_usd FROM reports_today)::numeric, 2),
      'net_revenue_usd',     ROUND((SELECT net_revenue_usd FROM reports_today)::numeric, 2),
      'reports_completed',   (SELECT reports_completed FROM reports_today),
      'reports_failed',      (SELECT reports_failed FROM reports_today),
      'reports_generating',  (SELECT reports_generating FROM reports_today),
      'dau',                 (SELECT dau FROM dau_today),
      'paying_customers',    (SELECT paying_customers FROM reports_today),
      'free_tool_usage',     (SELECT usage_count FROM free_tool_today)
    ),
    'yesterday', jsonb_build_object(
      'orders',           (SELECT orders FROM reports_yesterday),
      'revenue_usd',      ROUND((SELECT revenue_usd FROM reports_yesterday)::numeric, 2),
      'net_revenue_usd',  ROUND((SELECT net_revenue_usd FROM reports_yesterday)::numeric, 2),
      'dau',              (SELECT dau FROM dau_yesterday),
      'paying_customers', (SELECT paying_customers FROM reports_yesterday)
    )
  );
$function$;

-- 同時升 admin_funnel_analysis 用 v_paid_reports_active
CREATE OR REPLACE FUNCTION public.admin_funnel_analysis(
  since_ts timestamp with time zone,
  end_ts timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  step_defs(idx, step, label) AS (
    VALUES
      (1, 'visit_pricing',    '1. 看方案'),
      (2, 'start_checkout',   '2. 開始結帳'),
      (3, 'begin_payment',    '3. 進入付款'),
      (4, 'payment_success',  '4. 付款成功'),
      (5, 'report_generated', '5. 報告生成'),
      (6, 'report_viewed',    '6. 查看報告'),
      (7, 'pdf_downloaded',   '7. 下載 PDF')
  ),
  funnel_raw AS (
    SELECT session_id, event_type
    FROM public.customer_funnel_events
    WHERE created_at >= since_ts
      AND created_at <  end_ts
      AND session_id IS NOT NULL
  ),
  funnel_count AS (
    SELECT event_type AS step, COUNT(DISTINCT session_id)::bigint AS cnt
    FROM funnel_raw
    GROUP BY event_type
  ),
  funnel_total AS (
    SELECT COUNT(*)::bigint AS total FROM funnel_raw
  ),
  visitors_base AS (
    SELECT
      session_id,
      page_path,
      (
        COALESCE(user_agent, '') ILIKE '%HeadlessChrome%' OR
        COALESCE(user_agent, '') ILIKE '%vercel-screenshot%' OR
        COALESCE(user_agent, '') ILIKE '%bot%' OR
        COALESCE(user_agent, '') ILIKE '%crawler%' OR
        COALESCE(user_agent, '') ILIKE '%spider%' OR
        COALESCE(user_agent, '') ILIKE '%Googlebot%' OR
        COALESCE(user_agent, '') ILIKE '%Bingbot%' OR
        COALESCE(user_agent, '') ILIKE '%Slurp%' OR
        COALESCE(user_agent, '') ILIKE '%facebookexternalhit%' OR
        COALESCE(user_agent, '') ILIKE '%Twitterbot%'
      ) AS is_bot
    FROM public.visitor_events
    WHERE created_at >= since_ts
      AND created_at <  end_ts
      AND session_id  IS NOT NULL
      AND page_path   IN ('/pricing', '/checkout')
  ),
  visit_pricing_fallback AS (
    SELECT COUNT(DISTINCT session_id)::bigint AS cnt
    FROM visitors_base
    WHERE NOT is_bot AND page_path = '/pricing'
  ),
  start_checkout_fallback AS (
    SELECT COUNT(DISTINCT session_id)::bigint AS cnt
    FROM visitors_base
    WHERE NOT is_bot AND page_path = '/checkout'
  ),
  reports_base AS (
    SELECT status, amount_usd
    FROM public.v_paid_reports_active
    WHERE created_at >= since_ts
      AND created_at <  end_ts
  ),
  payment_success_fallback AS (
    SELECT COUNT(*)::bigint AS cnt
    FROM reports_base
    WHERE COALESCE(amount_usd, 0) > 0
  ),
  report_generated_fallback AS (
    SELECT COUNT(*)::bigint AS cnt
    FROM reports_base
    WHERE status = 'completed'
  ),
  step_counts AS (
    SELECT
      s.idx,
      s.step,
      s.label,
      CASE s.step
        WHEN 'visit_pricing'    THEN GREATEST(COALESCE(fc.cnt, 0), (SELECT cnt FROM visit_pricing_fallback))
        WHEN 'start_checkout'   THEN GREATEST(COALESCE(fc.cnt, 0), (SELECT cnt FROM start_checkout_fallback))
        WHEN 'payment_success'  THEN GREATEST(COALESCE(fc.cnt, 0), (SELECT cnt FROM payment_success_fallback))
        WHEN 'report_generated' THEN GREATEST(COALESCE(fc.cnt, 0), (SELECT cnt FROM report_generated_fallback))
        ELSE COALESCE(fc.cnt, 0)
      END::bigint AS cnt
    FROM step_defs s
    LEFT JOIN funnel_count fc ON fc.step = s.step
  ),
  step_with_rates AS (
    SELECT
      idx,
      step,
      label,
      cnt,
      LAG(cnt) OVER (ORDER BY idx)                                 AS prev_cnt,
      FIRST_VALUE(cnt) OVER (ORDER BY idx
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)  AS top_cnt
    FROM step_counts
  ),
  step_json AS (
    SELECT
      idx,
      jsonb_build_object(
        'step',  step,
        'label', label,
        'count', cnt,
        'conversion_from_prev_pct',
          CASE
            WHEN idx = 1 THEN NULL
            WHEN COALESCE(prev_cnt, 0) > 0
              THEN ROUND((cnt::numeric / prev_cnt::numeric) * 1000) / 10
            ELSE NULL
          END,
        'conversion_from_top_pct',
          CASE
            WHEN idx = 1 THEN 100
            WHEN COALESCE(top_cnt, 0) > 0
              THEN ROUND((cnt::numeric / top_cnt::numeric) * 1000) / 10
            ELSE NULL
          END
      ) AS j
    FROM step_with_rates
  )
  SELECT jsonb_build_object(
    'since',               to_jsonb(since_ts),
    'funnel',              (SELECT COALESCE(jsonb_agg(j ORDER BY idx), '[]'::jsonb) FROM step_json),
    'funnel_events_count', (SELECT total FROM funnel_total)
  );
$function$;

-- 完成
SELECT 'v5.10.283 admin RPCs upgraded to use v_paid_reports_active' AS migration_status;
