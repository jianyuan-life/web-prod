-- ============================================================
-- visitor_events 聚合 RPC（效能優化 v5.3.35）
-- 取代 admin 儀表板原本 `select('*')` 撈全部資料進記憶體再 aggregate 的作法。
-- 在 SQL 層直接做 COUNT / GROUP BY，只把聚合後的結果回傳。
--
-- 使用：
--   supabase.rpc('admin_visitor_stats', {
--     start_date: '2026-04-12T00:00:00Z',
--     end_date:   '2026-04-19T00:00:00Z',
--   })
--
-- 回傳 TABLE：
--   bucket      — 'overview' / 'top_page' / 'country' / 'device'
--   key         — 對應 bucket 的分組鍵（overview 用 'all'，其餘為 page_path/country/device_type）
--   sessions    — 去重 session_id 數
--   pageviews   — 事件筆數
--   is_bot      — bool，bot 流量獨立分桶（non-bot 聚合用 is_bot = false）
--
-- Bot 過濾：與 app/api/admin/route.ts BOT_UA_PATTERNS 對齊
--   HeadlessChrome / vercel-screenshot / bot / crawler / spider /
--   Googlebot / Bingbot / Slurp / DuckDuckBot / Baiduspider / YandexBot /
--   facebookexternalhit / Twitterbot
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_visitor_stats(
  start_date timestamptz,
  end_date   timestamptz DEFAULT now()
)
RETURNS TABLE (
  bucket     text,
  key        text,
  sessions   bigint,
  pageviews  bigint,
  is_bot     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      v.session_id,
      COALESCE(v.page_path, '')           AS page_path,
      COALESCE(v.country,   'Unknown')    AS country,
      COALESCE(v.device_type, 'unknown')  AS device_type,
      -- Bot 判斷：大小寫不敏感包含任一關鍵字
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
    WHERE v.created_at >= start_date
      AND v.created_at <  end_date
  )
  -- Overview：一筆，把總 sessions 和 pageviews 聚合
  SELECT 'overview'::text AS bucket,
         'all'::text       AS key,
         COUNT(DISTINCT session_id)::bigint AS sessions,
         COUNT(*)::bigint                    AS pageviews,
         is_bot
  FROM base
  GROUP BY is_bot

  UNION ALL

  -- Top pages（by page_path）— 只計非空 path
  SELECT 'top_page'::text AS bucket,
         page_path        AS key,
         COUNT(DISTINCT session_id)::bigint AS sessions,
         COUNT(*)::bigint                    AS pageviews,
         is_bot
  FROM base
  WHERE page_path <> ''
  GROUP BY page_path, is_bot

  UNION ALL

  -- Country 分佈
  SELECT 'country'::text AS bucket,
         country          AS key,
         COUNT(DISTINCT session_id)::bigint AS sessions,
         COUNT(*)::bigint                    AS pageviews,
         is_bot
  FROM base
  GROUP BY country, is_bot

  UNION ALL

  -- Device 分佈
  SELECT 'device'::text  AS bucket,
         device_type     AS key,
         COUNT(DISTINCT session_id)::bigint AS sessions,
         COUNT(*)::bigint                    AS pageviews,
         is_bot
  FROM base
  GROUP BY device_type, is_bot
$$;

-- 只允許 service_role / authenticated 呼叫（一般 anon 不需）
REVOKE ALL ON FUNCTION public.admin_visitor_stats(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_visitor_stats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_visitor_stats(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.admin_visitor_stats(timestamptz, timestamptz) IS
  'Admin 儀表板訪客聚合統計：overview / top_page / country / device，含 bot 分桶。取代拉全表再聚合的低效做法。';
