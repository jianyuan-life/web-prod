-- ============================================================
-- Admin Dashboard RPC — v5.3.38
-- 把 /api/admin/dashboard/snapshot 和 /api/admin/dashboard/funnel
-- 原本 `select('*')` 撈全表到 Node 記憶體再 aggregate 的低效作法，
-- 改為在 SQL 層直接聚合，只回傳結果。
--
-- 同時補三個 visitor_events index 加速聚合：
--   - created_at DESC（時間範圍掃描）
--   - session_id（DISTINCT session_id 去重聚合）
--   - (page_path, created_at DESC)（pricing/checkout 路徑過濾）
--
-- 兩個 RPC：
--   1. admin_dashboard_snapshot(start_today, start_yesterday, end_ts)
--      → 今日/昨日訂單、營收、DAU、活躍付費客戶、免費工具使用，一次算完
--   2. admin_funnel_analysis(since_ts)
--      → 7 步漏斗轉換（含 paid_reports 回退補位）
--
-- Bot 判定與 app/api/admin/route.ts BOT_UA_PATTERNS 對齊。
-- ============================================================

-- ---------- visitor_events 聚合 index ----------
CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at
  ON public.visitor_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_events_session
  ON public.visitor_events (session_id);

CREATE INDEX IF NOT EXISTS idx_visitor_events_path
  ON public.visitor_events (page_path, created_at DESC);


-- ============================================================
-- RPC 1 : admin_dashboard_snapshot
--   回傳：jsonb（含 today / yesterday / exchange_rate）
--   邏輯與原 snapshot/route.ts 對齊：
--     - paid_reports 今日/昨日訂單、營收、status 分桶、unique paying customers
--     - visitor_events 今日/昨日 DAU（去重 session_id，排除 bot）
--     - free_tool_usage 今日使用數
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_snapshot(
  start_today     timestamptz,
  start_yesterday timestamptz,
  end_ts          timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- ===== paid_reports 今日/昨日聚合 =====
  reports_today AS (
    SELECT
      COUNT(*)::bigint                                           AS orders,
      COALESCE(SUM(CASE WHEN amount_usd > 0 THEN amount_usd END), 0)::numeric
                                                                 AS revenue_usd,
      COUNT(*) FILTER (WHERE status = 'completed')::bigint        AS reports_completed,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint           AS reports_failed,
      COUNT(*) FILTER (WHERE status IN ('generating', 'pending'))::bigint
                                                                 AS reports_generating,
      COUNT(DISTINCT LOWER(COALESCE(customer_email, '')))
        FILTER (WHERE COALESCE(customer_email, '') <> '')::bigint AS paying_customers
    FROM public.paid_reports
    WHERE created_at >= start_today
      AND created_at <  end_ts
  ),
  reports_yesterday AS (
    SELECT
      COUNT(*)::bigint                                           AS orders,
      COALESCE(SUM(CASE WHEN amount_usd > 0 THEN amount_usd END), 0)::numeric
                                                                 AS revenue_usd,
      COUNT(DISTINCT LOWER(COALESCE(customer_email, '')))
        FILTER (WHERE COALESCE(customer_email, '') <> '')::bigint AS paying_customers
    FROM public.paid_reports
    WHERE created_at >= start_yesterday
      AND created_at <  start_today
  ),
  -- ===== visitor_events DAU（排除 bot）=====
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
  -- ===== free_tool_usage 今日使用數 =====
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
      'dau',              (SELECT dau FROM dau_yesterday),
      'paying_customers', (SELECT paying_customers FROM reports_yesterday)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_snapshot(timestamptz, timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_snapshot(timestamptz, timestamptz, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_snapshot(timestamptz, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.admin_dashboard_snapshot(timestamptz, timestamptz, timestamptz) IS
  'Admin Dashboard 今日/昨日聚合快照：paid_reports 訂單/營收/狀態、visitor_events DAU、free_tool_usage 使用數，在 SQL 層一次算完。';


-- ============================================================
-- RPC 2 : admin_funnel_analysis
--   回傳：jsonb（含 funnel[] + funnel_events_count）
--   邏輯：
--     - customer_funnel_events 為主（用 event_type 欄位，對齊實際 schema）
--     - visitor_events 回退補位 visit_pricing / start_checkout（path = /pricing、/checkout）
--     - paid_reports 回退補位 payment_success / report_generated
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_funnel_analysis(
  since_ts timestamptz,
  end_ts   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- ===== customer_funnel_events 為主 =====
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
  -- ===== visitor_events 回退補位（/pricing、/checkout）=====
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
  -- ===== paid_reports 回退補位 =====
  reports_base AS (
    SELECT status, amount_usd
    FROM public.paid_reports
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
  -- ===== 套回退取較大值 =====
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
  -- 算相對/絕對轉換率（top = step1）
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
$$;

REVOKE ALL ON FUNCTION public.admin_funnel_analysis(timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_funnel_analysis(timestamptz, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_funnel_analysis(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.admin_funnel_analysis(timestamptz, timestamptz) IS
  'Admin Dashboard 漏斗分析：customer_funnel_events 為主 + visitor_events/paid_reports 回退補位，在 SQL 層一次算完 7 步轉換率。';
