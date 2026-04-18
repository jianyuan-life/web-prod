-- ============================================================
-- 固定訂閱管理（v5.3.5 2026-04-18）
-- ============================================================
-- 用途：
--   1. 記錄 Vercel Pro / Supabase Pro / Fly.io / 域名 / 字體授權 等「可預測」的固定成本
--   2. 月費、年費、一次性付費、按量付費 credit 都能塞進來
--   3. 計算「累計至今」支出，匯入 expense_log 形成完整盈虧視圖
--   4. 後台 /jamie/accounting 「固定訂閱」tab 透過 CRUD API 管理
--
-- 執行方式：
--   於 Supabase SQL Editor 執行本檔案
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fixed_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 服務識別
  service_name TEXT NOT NULL,            -- 例：Vercel Pro / Supabase Pro / jianyuan.life domain
  vendor TEXT,                           -- 例：Vercel Inc / Supabase / Namecheap
  service_url TEXT,                      -- 後台登入網址（點一下可跳到帳單頁）

  -- 對應 expense_log.category
  -- 'hosting_monthly' / 'domain_annual' / 'domain_setup' / 'ai_subscription'
  -- 'api_credit_topup' / 'font_license' / 'external_service' / 'other'
  category TEXT NOT NULL,

  -- 金額（統一 USD 儲存）
  amount_usd NUMERIC(10, 2) NOT NULL,
  original_currency TEXT DEFAULT 'USD',  -- 若非 USD，記錄原幣別以便對帳
  original_amount NUMERIC(10, 2),

  -- 頻率
  -- 'monthly'    月付（自動按月發生）
  -- 'annual'     年付（每年發生一次）
  -- 'one_time'   一次性（只發生一次，例如網域購買、字體授權）
  -- 'prepaid'    預付額度（例如 Anthropic 一次充 $200 credit 按量扣款，訂閱本身不自動重發，僅記一筆）
  frequency TEXT NOT NULL,

  -- 生效期
  started_at DATE NOT NULL,
  ended_at DATE,                         -- NULL = 還在續訂

  -- 是否啟用（暫停訂閱時關閉但保留歷史）
  is_active BOOLEAN DEFAULT TRUE,

  -- 備註
  notes TEXT,

  -- 任意 metadata（例如 Vercel 帳號、Stripe customer id 等）
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.fixed_subscriptions IS '固定訂閱 / 一次性 / 預付成本清單（v5.3.5）';
COMMENT ON COLUMN public.fixed_subscriptions.frequency IS 'monthly / annual / one_time / prepaid';
COMMENT ON COLUMN public.fixed_subscriptions.category IS 'hosting_monthly / domain_annual / domain_setup / ai_subscription / api_credit_topup / font_license / external_service / other';

CREATE INDEX IF NOT EXISTS idx_fixed_subs_active ON public.fixed_subscriptions (is_active, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fixed_subs_category ON public.fixed_subscriptions (category);
CREATE INDEX IF NOT EXISTS idx_fixed_subs_service ON public.fixed_subscriptions (service_name);

-- 更新時間觸發器
CREATE OR REPLACE FUNCTION public.fixed_subs_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fixed_subs_touch ON public.fixed_subscriptions;
CREATE TRIGGER trg_fixed_subs_touch
  BEFORE UPDATE ON public.fixed_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.fixed_subs_touch_updated_at();

ALTER TABLE public.fixed_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_subs_no_public_access" ON public.fixed_subscriptions;
CREATE POLICY "fixed_subs_no_public_access"
  ON public.fixed_subscriptions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


-- ============================================================
-- 輔助函式：計算某訂閱「累計至今」金額
-- 給 API 直接 call，避免在 JS 端重算邏輯
-- ============================================================
CREATE OR REPLACE FUNCTION public.fixed_sub_accumulated_usd(sub_id UUID, as_of TIMESTAMPTZ DEFAULT NOW())
RETURNS NUMERIC AS $$
DECLARE
  sub RECORD;
  end_date DATE;
  months INT;
  years INT;
BEGIN
  SELECT * INTO sub FROM public.fixed_subscriptions WHERE id = sub_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  end_date := LEAST(COALESCE(sub.ended_at, as_of::DATE), as_of::DATE);
  IF end_date < sub.started_at THEN RETURN 0; END IF;

  IF sub.frequency = 'monthly' THEN
    months := EXTRACT(YEAR FROM AGE(end_date, sub.started_at)) * 12
            + EXTRACT(MONTH FROM AGE(end_date, sub.started_at)) + 1;
    RETURN sub.amount_usd * months;
  ELSIF sub.frequency = 'annual' THEN
    years := EXTRACT(YEAR FROM AGE(end_date, sub.started_at)) + 1;
    RETURN sub.amount_usd * years;
  ELSIF sub.frequency = 'one_time' OR sub.frequency = 'prepaid' THEN
    RETURN sub.amount_usd;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- 驗證訊息
-- ============================================================
SELECT 'fixed_subscriptions table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'fixed_subscriptions'
);
