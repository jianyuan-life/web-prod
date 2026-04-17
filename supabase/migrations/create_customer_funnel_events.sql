-- ============================================================
-- L7+ BI 後台優化（2026-04-17）：客戶 Funnel 事件表
-- ============================================================
-- 用途：記錄客戶從訪客到完成報告的每一步，用於計算轉化率。
--
-- 轉化步驟（step）：
--   1. visit_pricing    → 看方案頁
--   2. start_checkout   → 進入結帳流程（選方案+填表）
--   3. begin_payment    → Stripe 建立 Session（跳到 Stripe）
--   4. payment_success  → Stripe webhook 付款成功
--   5. report_generated → 報告生成完成
--   6. report_viewed    → 打開報告閱讀頁
--   7. pdf_downloaded   → 下載 PDF
--
-- 注意：
--   - `visitor_events` 表已經有 pageview 級別資料，本表只記錄轉化「關鍵事件」
--   - 同一個 session 多次觸發同一 step 只記一次（UNIQUE）
--   - 關聯 visitor_events.session_id 可做 end-to-end 路徑分析
--
-- 執行方式（由主控 Supabase MCP 跑）：
--   1. 於 Supabase SQL Editor 執行本檔案
--   2. 確認 customer_funnel_events 表建立成功
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 追蹤 session（與 visitor_events.session_id 一致）
  session_id TEXT NOT NULL,

  -- 若已登入才有
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 轉化步驟
  step TEXT NOT NULL CHECK (step IN (
    'visit_pricing',
    'start_checkout',
    'begin_payment',
    'payment_success',
    'report_generated',
    'report_viewed',
    'pdf_downloaded'
  )),

  -- 方案代碼（可選）
  plan_code TEXT,

  -- 對應的訂單/報告（可選）
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE SET NULL,

  -- 金額（USD）— 只 begin_payment / payment_success 會填
  amount_usd NUMERIC(10, 2),

  -- 任意 metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.customer_funnel_events IS '客戶轉化漏斗事件（從訪客到完成報告）';

-- session + step 唯一（避免重複計數）
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_session_step
  ON public.customer_funnel_events (session_id, step, COALESCE(plan_code, ''));

-- 查詢優化
CREATE INDEX IF NOT EXISTS idx_funnel_step_time
  ON public.customer_funnel_events (step, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_user
  ON public.customer_funnel_events (user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_plan
  ON public.customer_funnel_events (plan_code, step);

-- RLS：anon 可以寫入（前端追蹤），但只 service_role 可讀
ALTER TABLE public.customer_funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funnel_insert_anon" ON public.customer_funnel_events;
DROP POLICY IF EXISTS "funnel_no_read" ON public.customer_funnel_events;

CREATE POLICY "funnel_insert_anon"
  ON public.customer_funnel_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "funnel_no_read"
  ON public.customer_funnel_events
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- 驗證訊息
SELECT 'customer_funnel_events table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'customer_funnel_events'
);
