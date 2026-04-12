-- Email 退訂表：記錄已退訂的 email 地址
-- 用於 cron 發信前檢查，避免發送給已退訂的用戶

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  unsubscribed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- 只允許 service_role 完整存取（API route 使用 service_role key）
CREATE POLICY "Service role full access" ON email_unsubscribes
  FOR ALL USING (true) WITH CHECK (true);

-- 索引：加速 email 查詢
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email ON email_unsubscribes (email);
