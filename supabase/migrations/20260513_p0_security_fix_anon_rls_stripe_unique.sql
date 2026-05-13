-- 🔴🔴🔴 P0 SECURITY FIX(applied 2026-05-13 via Supabase MCP)
--
-- 對應 Codex L3 + Gemini L4 共識 P0(Jamie 嚴謹 audit 後抓):
-- 兩個獨立 P0 漏洞、都涉客戶花錢買報告的核心安全:
--
-- ======================================================================
-- Finding 1:RLS 漏洞 — anon role 可掃全 paid_reports 表
-- ======================================================================
-- Pre-fix state:
--   policyname: anon_token_holder_read
--   roles: {anon}
--   cmd: SELECT
--   qual: true   ← 任何人 SELECT 全表
-- Risk:
--   - NEXT_PUBLIC_SUPABASE_ANON_KEY 屬公開 client key、anyone 拿到可 SELECT * paid_reports
--   - 80 個客戶 email/姓名/出生資料/ai_content 全裸給網路
--   - GDPR Article 32 違反 + 台灣個資法第 27 條違反
-- Mitigation rationale:
--   - 實證:app/report/[token]/page.tsx line 1192/1252 + /lib/* + /workflows/* 全用 SUPABASE_SERVICE_ROLE_KEY
--   - anon policy 為 dead but dangerous(攻擊面 100%)
--   - customers_read_own policy(authenticated)足夠 cover 真實 use case
-- Action: DROP POLICY anon_token_holder_read
-- Verified post-fix: 只剩 customers_read_own(authenticated only)
--
-- ======================================================================
-- Finding 2:stripe_session_id 無 UNIQUE → race condition 雙 webhook
-- ======================================================================
-- Pre-fix state:
--   constraints: paid_reports_pkey(id)、paid_reports_access_token_key(access_token)
--   stripe_session_id 無 UNIQUE
-- Risk:
--   - Stripe webhook 重送(網路 jitter / 主機臨時掛)
--   - 兩個 webhook handler 同時跑 idempotency check(SELECT WHERE stripe_session_id=X)
--   - Both see no existing → both INSERT → 兩個 paid_reports row + 兩封確認信 + 雙 trigger AI 生成
--   - 客戶刷一次卡、收兩份報告、付一次但雲端被算兩次 cost(~$10 USD/重複)
-- Pre-check: 0 個 duplicate stripe_session_id row(safe to add UNIQUE)
-- Action: ADD CONSTRAINT paid_reports_stripe_session_id_key UNIQUE (stripe_session_id)
-- Verified post-fix: UNIQUE 已建、未來 race-condition 雙 insert 會 PG 拒絕
--
-- ======================================================================
-- Migration SQL(applied successfully):

DROP POLICY IF EXISTS anon_token_holder_read ON paid_reports;

ALTER TABLE paid_reports
ADD CONSTRAINT paid_reports_stripe_session_id_key UNIQUE (stripe_session_id);

COMMENT ON CONSTRAINT paid_reports_stripe_session_id_key ON paid_reports IS
'P0 security:防 Stripe webhook race condition 雙 insert(2026-05-13 Codex L3 audit 修)';

-- ======================================================================
-- Rollback(緊急用、若有 production regression、慎用):
-- CREATE POLICY anon_token_holder_read ON paid_reports FOR SELECT TO anon USING (true);  -- 回到不安全狀態
-- ALTER TABLE paid_reports DROP CONSTRAINT paid_reports_stripe_session_id_key;
-- ======================================================================

-- 對應 lessons:
--   - tasks/lessons.md #125(本 commit 寫)
--   - tasks/sprint_2_5_db_migration_plan.md
--   - CLAUDE.md 第 1 條鐵律「絕不幻覺」+ 第 8 條「動真錢不停下」
