-- ============================================================
-- 鑑源 RAG 規則庫 — Supabase pgvector 檢索系統
-- ============================================================
-- 用途：儲存命理規則（八字/紫微/奇門/姓名學等古籍知識）
--       搭配 Voyage AI voyage-3-large（1024 維）向量檢索
--       供 AI 寫報告時 retrieve → ground 在真實規則上
-- 建立日期：2026-04-18
-- 維度：1024（voyage-3-large 預設輸出維度）
-- ============================================================

-- 1. 啟用 pgvector 擴充
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 規則庫主表
CREATE TABLE IF NOT EXISTS public.rules_library (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system          TEXT NOT NULL,              -- 命理系統：'bazi' / 'ziwei' / 'qimen' / 'name' / 'fengshui' / 'tarot' / ...
  rule_type       TEXT,                       -- 規則類型：'geju' / 'shishen' / 'dayun' / 'sihua' / 'bamen' / ...
  title           TEXT NOT NULL,              -- 規則標題（章節名或規則名）
  content         TEXT NOT NULL,              -- 規則正文（embed 用）
  source          TEXT,                       -- 古籍出處（如「淵海子平」「紫微斗數全書」）
  source_chapter  TEXT,                       -- 章節定位（如「卷一 十神總論」）
  embedding       vector(1024),               -- Voyage voyage-3-large 向量
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 擴充欄位（關鍵字、tags、file_path 等）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 索引
-- 系統別快速篩選（where system = 'bazi'）
CREATE INDEX IF NOT EXISTS idx_rules_system
  ON public.rules_library(system);

-- 規則類型篩選
CREATE INDEX IF NOT EXISTS idx_rules_rule_type
  ON public.rules_library(rule_type);

-- metadata 全域 GIN 索引（供 tags/keywords 查詢）
CREATE INDEX IF NOT EXISTS idx_rules_metadata
  ON public.rules_library USING gin(metadata);

-- 向量相似度索引（cosine）
-- IVFFlat lists=100：適合 1-10k 筆資料；若後續超過 50k 可改 hnsw
CREATE INDEX IF NOT EXISTS idx_rules_embedding
  ON public.rules_library
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. updated_at 自動觸發器
CREATE OR REPLACE FUNCTION public.set_rules_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rules_library_updated_at ON public.rules_library;
CREATE TRIGGER trg_rules_library_updated_at
  BEFORE UPDATE ON public.rules_library
  FOR EACH ROW
  EXECUTE FUNCTION public.set_rules_library_updated_at();

-- 5. 檢索 RPC：基於 cosine similarity 的 top-K 查詢
-- 呼叫方式（TypeScript）：
--   supabase.rpc('match_rules', {
--     query_embedding: embedding,       -- number[] 1024 維
--     match_system: 'bazi' | null,      -- 限定系統（null 表全系統）
--     match_count: 30                   -- top-K
--   })
CREATE OR REPLACE FUNCTION public.match_rules(
  query_embedding vector(1024),
  match_system    TEXT DEFAULT NULL,
  match_count     INT DEFAULT 30
)
RETURNS TABLE (
  id              UUID,
  system          TEXT,
  rule_type       TEXT,
  title           TEXT,
  content         TEXT,
  source          TEXT,
  source_chapter  TEXT,
  metadata        JSONB,
  similarity      FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    r.id,
    r.system,
    r.rule_type,
    r.title,
    r.content,
    r.source,
    r.source_chapter,
    r.metadata,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.rules_library r
  WHERE
    r.embedding IS NOT NULL
    AND (match_system IS NULL OR r.system = match_system)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6. RLS（僅伺服器端呼叫，服務角色 key 繞過；anon 禁止）
ALTER TABLE public.rules_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules_library_no_anon" ON public.rules_library;
CREATE POLICY "rules_library_no_anon"
  ON public.rules_library
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 備註：
--   - 服務角色 key（service_role）預設繞過 RLS，後端讀寫不受影響
--   - 匯入腳本與 retrieveRules() 都應用 service_role key
