-- ============================================================
-- Sprint 5 國際化遷移：paid_reports 加 timezone 欄位
-- 版本：v5.2.4（2026-04-17）
--
-- 目的：
--   1. 讓既有報告支援 IANA 時區（自動含 DST）
--   2. 新報告一律帶 timezone，不再依賴 birth_data JSON 裡的 timezone_offset
--   3. 欄位缺值的既有紀錄預設 'Asia/Taipei'（因為現有客戶幾乎都中港台）
--
-- 執行方式：由主控透過 Supabase MCP `apply_migration` 統一執行，不要在本地直跑。
-- 確認欄位未存在後再執行；重複執行會失敗（IF NOT EXISTS 已守護）。
-- ============================================================

-- 1. 加欄位（皆為 nullable，向後相容）
ALTER TABLE paid_reports
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS birth_city TEXT,
  ADD COLUMN IF NOT EXISTS birth_country TEXT,
  ADD COLUMN IF NOT EXISTS birth_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS birth_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tz_migrated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS self_update_count INTEGER DEFAULT 0;

COMMENT ON COLUMN paid_reports.timezone IS
  'IANA 時區（如 Asia/Taipei）。有值時命理引擎會自動計算 DST。NULL 代表用舊 timezone_offset（限中港台）';
COMMENT ON COLUMN paid_reports.birth_country IS 'ISO 3166-1 alpha-2 國家碼';
COMMENT ON COLUMN paid_reports.tz_migrated_at IS
  '此紀錄時區資料回填時間。NULL 代表尚未回填，需管理員人工處理';

-- 2. 索引：用於後台 /jamie/recalculate 快速查 timezone=null 的紀錄
CREATE INDEX IF NOT EXISTS idx_paid_reports_tz_null
  ON paid_reports (created_at DESC)
  WHERE timezone IS NULL;

-- 3. 回填：從 birth_data JSON 拷貝現有欄位到 top-level
UPDATE paid_reports
SET
  birth_city    = COALESCE(birth_city,    birth_data->>'birth_city', birth_data->>'city'),
  birth_country = COALESCE(birth_country, UPPER(birth_data->>'birth_country')),
  birth_lat     = COALESCE(birth_lat,
                           (birth_data->>'latitude')::DOUBLE PRECISION,
                           (birth_data->>'cityLat')::DOUBLE PRECISION),
  birth_lng     = COALESCE(birth_lng,
                           (birth_data->>'longitude')::DOUBLE PRECISION,
                           (birth_data->>'cityLng')::DOUBLE PRECISION),
  timezone      = COALESCE(timezone, birth_data->>'timezone')
WHERE
  birth_city IS NULL
   OR birth_country IS NULL
   OR birth_lat IS NULL
   OR birth_lng IS NULL
   OR timezone IS NULL;

-- 4. 智能推測 timezone（純中港台客戶預設 Asia/Taipei）
-- 規則：
--   (a) birth_country = 'TW' → Asia/Taipei
--   (b) birth_country = 'HK' → Asia/Hong_Kong
--   (c) birth_country = 'MO' → Asia/Macau
--   (d) birth_country = 'CN' → Asia/Shanghai
--   (e) birth_country = 'SG' → Asia/Singapore
--   (f) birth_country = 'MY' → Asia/Kuala_Lumpur
--   (g) birth_country = 'JP' → Asia/Tokyo
--   (h) birth_country = 'KR' → Asia/Seoul
--   (i) 其他：保持 NULL 讓 /jamie/recalculate 人工處理
UPDATE paid_reports
SET
  timezone = CASE UPPER(COALESCE(birth_country, ''))
    WHEN 'TW' THEN 'Asia/Taipei'
    WHEN 'HK' THEN 'Asia/Hong_Kong'
    WHEN 'MO' THEN 'Asia/Macau'
    WHEN 'CN' THEN 'Asia/Shanghai'
    WHEN 'SG' THEN 'Asia/Singapore'
    WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
    WHEN 'JP' THEN 'Asia/Tokyo'
    WHEN 'KR' THEN 'Asia/Seoul'
    WHEN 'TH' THEN 'Asia/Bangkok'
    WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
    WHEN 'PH' THEN 'Asia/Manila'
    WHEN 'GB' THEN 'Europe/London'
    WHEN 'FR' THEN 'Europe/Paris'
    WHEN 'DE' THEN 'Europe/Berlin'
    WHEN 'AU' THEN 'Australia/Sydney'  -- 保守選雪梨；伯斯客戶要手動改
    WHEN 'NZ' THEN 'Pacific/Auckland'
    ELSE NULL
  END
WHERE timezone IS NULL
  AND birth_country IS NOT NULL;

-- 5. 針對已知 city 字串進一步推測（無 country 時）
UPDATE paid_reports
SET
  timezone = CASE
    WHEN birth_city ILIKE '%台北%' OR birth_city ILIKE '%新北%' OR birth_city ILIKE '%桃園%'
      OR birth_city ILIKE '%台中%' OR birth_city ILIKE '%台南%' OR birth_city ILIKE '%高雄%'
      OR birth_city ILIKE '%台灣%' OR birth_city ILIKE '%Taipei%' OR birth_city ILIKE '%Taiwan%'
      THEN 'Asia/Taipei'
    WHEN birth_city ILIKE '%香港%' OR birth_city ILIKE '%Hong Kong%' THEN 'Asia/Hong_Kong'
    WHEN birth_city ILIKE '%澳門%' OR birth_city ILIKE '%Macau%' THEN 'Asia/Macau'
    WHEN birth_city ILIKE '%上海%' OR birth_city ILIKE '%北京%' OR birth_city ILIKE '%深圳%'
      OR birth_city ILIKE '%廣州%' OR birth_city ILIKE '%中國%' OR birth_city ILIKE '%China%'
      THEN 'Asia/Shanghai'
    WHEN birth_city ILIKE '%新加坡%' OR birth_city ILIKE '%Singapore%' THEN 'Asia/Singapore'
    WHEN birth_city ILIKE '%吉隆坡%' OR birth_city ILIKE '%Malaysia%' THEN 'Asia/Kuala_Lumpur'
    WHEN birth_city ILIKE '%東京%' OR birth_city ILIKE '%大阪%' OR birth_city ILIKE '%Tokyo%'
      THEN 'Asia/Tokyo'
    WHEN birth_city ILIKE '%首爾%' OR birth_city ILIKE '%Seoul%' THEN 'Asia/Seoul'
    WHEN birth_city ILIKE '%紐約%' OR birth_city ILIKE '%New York%' OR birth_city ILIKE '%波士頓%'
      OR birth_city ILIKE '%華盛頓%' OR birth_city ILIKE '%邁阿密%'
      THEN 'America/New_York'
    WHEN birth_city ILIKE '%洛杉磯%' OR birth_city ILIKE '%Los Angeles%' OR birth_city ILIKE '%舊金山%'
      OR birth_city ILIKE '%西雅圖%' OR birth_city ILIKE '%San Francisco%'
      THEN 'America/Los_Angeles'
    WHEN birth_city ILIKE '%芝加哥%' OR birth_city ILIKE '%Chicago%' THEN 'America/Chicago'
    WHEN birth_city ILIKE '%多倫多%' OR birth_city ILIKE '%Toronto%' THEN 'America/Toronto'
    WHEN birth_city ILIKE '%溫哥華%' OR birth_city ILIKE '%Vancouver%' THEN 'America/Vancouver'
    WHEN birth_city ILIKE '%倫敦%' OR birth_city ILIKE '%London%' THEN 'Europe/London'
    WHEN birth_city ILIKE '%巴黎%' OR birth_city ILIKE '%Paris%' THEN 'Europe/Paris'
    WHEN birth_city ILIKE '%柏林%' OR birth_city ILIKE '%Berlin%' THEN 'Europe/Berlin'
    WHEN birth_city ILIKE '%雪梨%' OR birth_city ILIKE '%悉尼%' OR birth_city ILIKE '%Sydney%'
      THEN 'Australia/Sydney'
    WHEN birth_city ILIKE '%墨爾本%' OR birth_city ILIKE '%Melbourne%' THEN 'Australia/Melbourne'
    WHEN birth_city ILIKE '%奧克蘭%' OR birth_city ILIKE '%Auckland%' THEN 'Pacific/Auckland'
    WHEN birth_city ILIKE '%杜拜%' OR birth_city ILIKE '%Dubai%' THEN 'Asia/Dubai'
    ELSE NULL
  END
WHERE timezone IS NULL
  AND birth_city IS NOT NULL;

-- 6. 最後 fallback：完全沒有地區資訊的舊紀錄（Mac/Win 早期純台灣客戶），預設 Asia/Taipei
-- 設計決策：現有 12 位客戶都是中港台，預設 Asia/Taipei 比 NULL 安全。
-- 若推斷錯誤（例如少數非中港台客戶），管理員會在 /jamie/recalculate 介面看到並手動修正。
UPDATE paid_reports
SET
  timezone = 'Asia/Taipei',
  tz_migrated_at = NOW()
WHERE timezone IS NULL
  AND created_at < '2026-04-17 00:00:00+00';  -- 只處理 Phase 2 上線前的既有紀錄

-- 7. 驗證查詢（不會實際執行，留著給 DBA 參考）
-- SELECT timezone, COUNT(*) FROM paid_reports GROUP BY timezone ORDER BY 2 DESC;
-- SELECT id, client_name, birth_city, birth_country, timezone, tz_migrated_at
-- FROM paid_reports WHERE timezone IS NULL ORDER BY created_at DESC;
