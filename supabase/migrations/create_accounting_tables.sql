-- ============================================================
-- 鑑源完整會計系統 (v5.3.3 2026-04-18)
-- ============================================================
-- 用途：建立完整會計系統
--   1. revenue_log      每筆付款收入（Stripe 成功後寫入）
--   2. expense_log      所有支出（AI/Hosting/退款/Marketing/一次性）
--   3. monthly_pnl_snapshot  月結快照（cron 每月 1 日寫入）
--
-- 關鍵公式：
--   毛利 = 收入 - Stripe 手續費 - 積分折抵 - 優惠碼折抵
--   淨利 = 毛利 - AI 成本 - Hosting 成本 - 退款
--   利潤率 = 淨利 / 收入 × 100%
--
-- 執行方式（由主控 Supabase MCP 跑）：
--   1. 於 Supabase SQL Editor 執行本檔案
--   2. 確認 revenue_log / expense_log / monthly_pnl_snapshot 三表都建立成功
--   3. 確認 RLS 只允許 service_role 存取
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Table 1: revenue_log — 收入記錄（每筆 Stripe 付款）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 關聯的付費報告
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE SET NULL,

  -- 方案代碼（C / D / G15 / R / E1 / E2）
  plan_code TEXT NOT NULL,

  -- 原始金額（客戶支付的總金額，USD）
  amount_usd NUMERIC(10, 2) NOT NULL,

  -- Stripe session id（冪等檢查用）
  stripe_session_id TEXT UNIQUE,

  -- Stripe 手續費（2.9% + $0.30）
  stripe_fee_usd NUMERIC(10, 4) DEFAULT 0,

  -- 積分折抵金額（USD）
  points_discount_usd NUMERIC(10, 2) DEFAULT 0,

  -- 優惠碼折抵金額（USD）
  coupon_discount_usd NUMERIC(10, 2) DEFAULT 0,

  -- 實收淨額（自動計算：amount - Stripe fee - 折抵）
  -- 注意：amount_usd 是客戶實際扣款金額（已扣完折抵後），這裡再扣 Stripe 手續費就是我們實收
  net_revenue_usd NUMERIC(10, 2) GENERATED ALWAYS AS (
    amount_usd - COALESCE(stripe_fee_usd, 0)
  ) STORED,

  -- 客戶 email（分析用）
  customer_email TEXT,

  -- 幣別（若不是 USD 則需轉換）
  currency TEXT DEFAULT 'usd',

  -- 任意 metadata（promo_code / utm / ip / country 等）
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.revenue_log IS '收入記錄（每筆 Stripe 付款一筆）';
COMMENT ON COLUMN public.revenue_log.amount_usd IS '客戶實際支付金額（已扣完折抵）USD';
COMMENT ON COLUMN public.revenue_log.stripe_fee_usd IS 'Stripe 手續費（2.9% + $0.30）';
COMMENT ON COLUMN public.revenue_log.net_revenue_usd IS '我方實收（amount - stripe_fee），自動計算';

CREATE INDEX IF NOT EXISTS idx_revenue_log_created_at ON public.revenue_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_log_report ON public.revenue_log (report_id);
CREATE INDEX IF NOT EXISTS idx_revenue_log_plan ON public.revenue_log (plan_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_log_stripe_session ON public.revenue_log (stripe_session_id);

ALTER TABLE public.revenue_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_log_no_public_access" ON public.revenue_log;
CREATE POLICY "revenue_log_no_public_access"
  ON public.revenue_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────
-- Table 2: expense_log — 支出記錄（所有花費）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 支出大類
  -- ai_cost        每次 AI call（自動由 recordAIUsage() 鏡像寫入）
  -- hosting_monthly 月固定費（Vercel/Supabase/Fly.io/Cloudflare/Resend）
  -- api_setup      一次性 API 開通費
  -- domain         域名購買/續費
  -- refund         退款
  -- marketing      廣告投放
  -- email          Email 服務額外用量
  -- other          其他雜支
  category TEXT NOT NULL,

  -- 子分類（例：ai_cost -> claude/deepseek/kimi ; hosting_monthly -> vercel/supabase/fly.io）
  subcategory TEXT,

  -- 若關聯特定報告（例如 AI 成本、refund）
  report_id UUID REFERENCES public.paid_reports(id) ON DELETE SET NULL,

  -- 支出金額（USD）
  amount_usd NUMERIC(10, 4) NOT NULL,

  -- 描述（人類可讀）
  description TEXT,

  -- 是否已確認/自動寫入（cron 自動寫入 vs 手動記錄）
  source TEXT DEFAULT 'auto',  -- auto / manual / refund_api / webhook

  -- 由哪個 admin 手動錄入（若 source=manual）
  created_by TEXT,

  -- 任意 metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 實際發生的日期（可與 created_at 不同：如 cron 補錄歷史支出）
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.expense_log IS '所有支出記錄（AI/Hosting/退款/Marketing 等）';
COMMENT ON COLUMN public.expense_log.category IS 'ai_cost / hosting_monthly / api_setup / domain / refund / marketing / email / other';
COMMENT ON COLUMN public.expense_log.subcategory IS '例：claude/deepseek(AI) 或 vercel/supabase(hosting)';
COMMENT ON COLUMN public.expense_log.source IS 'auto（自動鏡像） / manual（後台手動） / refund_api / webhook';

CREATE INDEX IF NOT EXISTS idx_expense_log_created_at ON public.expense_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_log_occurred_at ON public.expense_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_log_category ON public.expense_log (category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_log_report ON public.expense_log (report_id);

ALTER TABLE public.expense_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_log_no_public_access" ON public.expense_log;
CREATE POLICY "expense_log_no_public_access"
  ON public.expense_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────
-- Table 3: monthly_pnl_snapshot — 月結快照
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_pnl_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 月份（格式：'2026-04'）
  year_month TEXT NOT NULL UNIQUE,

  -- 營收
  total_revenue_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net_revenue_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,    -- 扣除 Stripe 手續費後
  stripe_fee_total_usd NUMERIC(10, 2) DEFAULT 0,
  points_discount_total_usd NUMERIC(10, 2) DEFAULT 0,
  coupon_discount_total_usd NUMERIC(10, 2) DEFAULT 0,

  -- 支出分解
  ai_cost_usd NUMERIC(10, 2) DEFAULT 0,
  hosting_cost_usd NUMERIC(10, 2) DEFAULT 0,
  refund_usd NUMERIC(10, 2) DEFAULT 0,
  marketing_cost_usd NUMERIC(10, 2) DEFAULT 0,
  other_expense_usd NUMERIC(10, 2) DEFAULT 0,

  -- 總結
  total_expense_usd NUMERIC(10, 2) DEFAULT 0,
  gross_profit_usd NUMERIC(10, 2) DEFAULT 0,    -- net_revenue - 退款
  net_profit_usd NUMERIC(10, 2) DEFAULT 0,      -- gross_profit - AI - Hosting - Marketing - Other
  profit_margin_pct NUMERIC(6, 2) DEFAULT 0,    -- net_profit / total_revenue * 100

  -- 報告統計
  report_count INT DEFAULT 0,
  refund_count INT DEFAULT 0,
  avg_revenue_per_report NUMERIC(10, 2) DEFAULT 0,
  avg_cost_per_report NUMERIC(10, 4) DEFAULT 0,
  avg_profit_per_report NUMERIC(10, 2) DEFAULT 0,

  -- 方案分解（JSON）
  by_plan JSONB DEFAULT '{}'::jsonb,

  -- 自動 vs 手動標記
  is_finalized BOOLEAN DEFAULT FALSE,
  finalized_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.monthly_pnl_snapshot IS '月結快照（每月 1 日由 cron 寫入上月數據）';

CREATE INDEX IF NOT EXISTS idx_monthly_pnl_year_month ON public.monthly_pnl_snapshot (year_month DESC);

ALTER TABLE public.monthly_pnl_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_pnl_no_public_access" ON public.monthly_pnl_snapshot;
CREATE POLICY "monthly_pnl_no_public_access"
  ON public.monthly_pnl_snapshot
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────
-- 自動鏡像：ai_cost_log → expense_log（Trigger）
-- 每次 ai_cost_log insert 後自動寫入 expense_log(category='ai_cost')
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_ai_cost_to_expense()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.expense_log (
    category, subcategory, report_id, amount_usd, description, source, occurred_at, metadata
  ) VALUES (
    'ai_cost',
    COALESCE(NEW.provider, 'unknown'),
    NEW.report_id,
    COALESCE(NEW.cost_usd, 0),
    CONCAT(NEW.provider, '/', NEW.model, ' (', COALESCE(NEW.call_stage, 'call'), ')'),
    'auto',
    NEW.created_at,
    jsonb_build_object(
      'ai_cost_log_id', NEW.id,
      'model', NEW.model,
      'prompt_tokens', NEW.prompt_tokens,
      'completion_tokens', NEW.completion_tokens,
      'call_stage', NEW.call_stage,
      'plan_code', NEW.plan_code
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mirror_ai_cost ON public.ai_cost_log;
CREATE TRIGGER trg_mirror_ai_cost
  AFTER INSERT ON public.ai_cost_log
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_ai_cost_to_expense();


-- ────────────────────────────────────────────────────────────
-- 驗證訊息
-- ────────────────────────────────────────────────────────────
SELECT 'accounting tables created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'revenue_log'
) AND EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'expense_log'
) AND EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'monthly_pnl_snapshot'
);
