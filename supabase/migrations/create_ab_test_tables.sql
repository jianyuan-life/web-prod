-- A/B 測試框架 — 資料表建立
-- 2026-04-17 | 網頁製作部門
-- 用途：自建輕量 A/B 測試（不依賴付費 SaaS），支援定價/文案/CTA/佈局/流程測試

-- 1. 實驗定義（每個實驗一筆）
CREATE TABLE IF NOT EXISTS ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,        -- 如 "pricing_c_20260417"
  name TEXT NOT NULL,              -- 顯示用名稱（後台看板用）
  description TEXT,                -- 簡述要測什麼
  variants JSONB NOT NULL,         -- [{key:"A",label:"原版",weight:50},{key:"B",label:"新版",weight:50}]
  primary_metric TEXT DEFAULT 'conversion',  -- conversion / revenue / click
  status TEXT NOT NULL DEFAULT 'active',     -- active / paused / concluded
  winner TEXT,                     -- 結論後填入勝出 variant key
  notes TEXT,                      -- 結論備註
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ab_experiments_status_check CHECK (status IN ('active','paused','concluded'))
);

-- 2. 事件追蹤（曝光/點擊/轉化/收入）
CREATE TABLE IF NOT EXISTS ab_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL,
  variant TEXT NOT NULL,
  visitor_id TEXT NOT NULL,        -- 前端 cookie 存的 UUID
  user_id UUID,                    -- 如果已登入就帶上 auth.users.id
  event_type TEXT NOT NULL,        -- impression / click / conversion / revenue
  value NUMERIC,                   -- 收入事件用（美元數值）
  metadata JSONB,                  -- 自訂欄位（如：page / cta_position / product_sku）
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ab_events_type_check CHECK (event_type IN ('impression','click','conversion','revenue'))
);

-- 3. 訪客分流記錄（保證同一 visitor 永遠看到同一 variant）
CREATE TABLE IF NOT EXISTS ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  user_id UUID,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ab_assignments_unique UNIQUE (experiment_key, visitor_id)
);

-- 索引（查詢熱路徑：看板按 experiment_key+variant+event_type 統計）
CREATE INDEX IF NOT EXISTS idx_ab_events_experiment
  ON ab_events(experiment_key, variant, event_type);

CREATE INDEX IF NOT EXISTS idx_ab_events_created
  ON ab_events(experiment_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ab_events_visitor
  ON ab_events(visitor_id, experiment_key);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_visitor
  ON ab_assignments(visitor_id);

CREATE INDEX IF NOT EXISTS idx_ab_experiments_status
  ON ab_experiments(status) WHERE status = 'active';

-- 4. 範例實驗（首頁 Hero CTA 文案）
INSERT INTO ab_experiments (key, name, description, variants, primary_metric, status)
VALUES (
  'hero_cta_20260417',
  '首頁 Hero CTA 文案測試',
  '測試兩種 CTA 文案對轉化率的影響：情緒訴求 vs 效率訴求',
  '[
    {"key":"A","label":"立即解鎖你的人生藍圖","weight":50},
    {"key":"B","label":"3 分鐘看懂你的命盤","weight":50}
  ]'::jsonb,
  'conversion',
  'active'
)
ON CONFLICT (key) DO NOTHING;

-- 5. RLS（Supabase 預設開 RLS，只讓 service role 寫入）
ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_assignments ENABLE ROW LEVEL SECURITY;

-- 所有寫入都走 service_role（API route 用）；匿名讀 experiments 允許（前端抓當前 active 實驗）
DROP POLICY IF EXISTS "ab_experiments_read_active" ON ab_experiments;
CREATE POLICY "ab_experiments_read_active" ON ab_experiments
  FOR SELECT USING (status = 'active');

-- events / assignments 只有 service role 能寫讀（後台看板一律走 API with x-admin-key）
-- 不建立 select policy = anon 讀不到（RLS default deny）
