-- ============================================================
-- 殭屍表清理 Migration（2026-04-19）
-- ============================================================
-- 用途：清理非鑑源命理平台使用的 public schema 表
-- 來源：跨專案混入（香港賽馬、股票量化、基金業務、客戶管理 CIES）
--
-- ⚠️ 嚴重警告：執行前必做
--   1. 老闆必須手動審閱本檔案
--   2. 執行前先做 pg_dump 完整備份（資料消失不可逆）
--   3. 先在 staging / 另一個 Supabase project 試跑
--   4. 建議分三階段執行：A (立即可刪) → B (確認後刪) → C (絕對保留)
--
-- 稽查時間：2026-04-19
-- 稽查者：資深 Supabase 工程師（Claude）
-- 稽查範圍：20 個疑似殭屍表
-- 稽查方法：row count + 欄位結構 + code 引用交叉比對
-- ============================================================


-- ============================================================
-- A 類：確定可以 DROP（row count = 0 且 code 無引用）
-- ============================================================
-- 共 9 個，合計 0 筆資料，刪除無風險
--
-- | 表名               | Rows | 推測用途                          | code 引用 |
-- |-------------------|-----:|----------------------------------|----------|
-- | ab_tests          |    0 | 舊版 A/B test（鑑源已改用 ab_experiments）| 無       |
-- | ab_test_events    |    0 | 舊版 A/B test（鑑源已改用 ab_events）      | 無       |
-- | clients           |    0 | 客戶管理系統（舊）                | 無       |
-- | divination_reports|    0 | 其他命理專案（跟 paid_reports 重複）| 無       |
-- | email_log         |    0 | 舊版郵件 log（鑑源用 email_send_log）| 無     |
-- | macro_indicators  |    0 | 金融研究網：總經指標              | 無       |
-- | macro_market_data |    0 | 金融研究網：市場數據              | 無       |
-- | macro_news        |    0 | 金融研究網：財經新聞              | 無       |
-- | racing_predictions|    0 | 香港賽馬研究專案                  | 無       |
-- | reports           |    0 | 舊版 reports（鑑源實際用 paid_reports；code 裡的 .from('reports') 都是 Supabase Storage bucket） | 無 |
-- | stock_screening   |    0 | 股票量化：選股結果                | 無       |

DROP TABLE IF EXISTS public.ab_test_events CASCADE;
DROP TABLE IF EXISTS public.ab_tests CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.divination_reports CASCADE;
DROP TABLE IF EXISTS public.email_log CASCADE;
DROP TABLE IF EXISTS public.macro_indicators CASCADE;
DROP TABLE IF EXISTS public.macro_market_data CASCADE;
DROP TABLE IF EXISTS public.macro_news CASCADE;
DROP TABLE IF EXISTS public.racing_predictions CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.stock_screening CASCADE;


-- ============================================================
-- B 類：有資料但 code 無引用（保守保留，建議手動確認後刪）
-- ============================================================
-- 這些表是基金業務/CIES 客戶管理專案的資料，鑑源完全不用
-- 但裡面有資料（可能是歷史備份或另一個專案還在寫），執行前請確認：
--   ① 是不是其他專案（Claude-jamie 基金網管理、Claude-客戶管理線上系統、
--      Claude-客戶持倉存續管理）正在寫入這個 DB？
--   ② 如果是 → 建議把資料搬到別的 Supabase project 再刪
--   ③ 如果不是 → 可以執行下方 DROP
--
-- | 表名                 |  Rows  | 推測用途                                    |
-- |---------------------|-------:|--------------------------------------------|
-- | cies_clients        |      2 | CIES（香港資本投資入境計劃）客戶管理        |
-- | exchange_rates      |    200 | 匯率資料（基金淨值換算 HKD 用）             |
-- | fund_monthly_returns|  74500 | 基金月報酬率（基金對比專案核心）             |
-- | fund_prices         |   1237 | 基金每日 NAV                               |
-- | funds               |   1206 | 基金主檔（含 ISIN/Bloomberg ticker）        |
-- | transactions        |     33 | 客戶持倉交易紀錄                            |
-- | users               |      1 | 舊版 users（鑑源實際用 auth.users+profiles）|
--
-- ⚠️ 別的專案可能在寫！執行前跟老闆確認「現在還有哪個專案在用這個 Supabase？」
--
-- 如確認可刪，取消下方註解：
-- DROP TABLE IF EXISTS public.transactions CASCADE;  -- 先刪外鍵來源
-- DROP TABLE IF EXISTS public.fund_monthly_returns CASCADE;
-- DROP TABLE IF EXISTS public.fund_prices CASCADE;
-- DROP TABLE IF EXISTS public.funds CASCADE;
-- DROP TABLE IF EXISTS public.exchange_rates CASCADE;
-- DROP TABLE IF EXISTS public.cies_clients CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;


-- ============================================================
-- C 類：表面是殭屍實則要保留（code 或 Supabase 本身有引用）
-- ============================================================
-- 這兩個表一開始被列為可疑，但實際上不能刪：
--
-- 【profiles（14 筆，全部對應 auth.users）】
--   - 雖然鑑源 code 沒有直接 .from('profiles') 呼叫，但：
--     ① 14 筆全部 id 對應 auth.users.id，是 Supabase 官方推薦的 user profile 擴展表
--     ② 可能被 auth trigger（on_auth_user_created）自動寫入
--     ③ RLS policy 可能間接引用
--     ④ 最近一筆 updated_at = 2026-04-15（還活著）
--   → 保留，不動
--
-- 【products（11 筆）】
--   - 資料看起來是「舊版方案定義」（含已砍除的 A/G3/M/Y/E3，價格也過時
--     E1 顯示 $119 實際 $89；E2 顯示 $89 實際 $99）
--   - code 裡的「products」都是：
--     ① coupons.applicable_products（欄位名，JSON 陣列）
--     ② /api/admin 的 top_products（變數名）
--     ③ lib/profiles.ts / lib/ziwei-profiles.ts（命格封號模組，跟 DB 無關）
--   - 目前鑑源方案定義在前端程式碼（lib/plans.ts 或硬編碼），不從此表讀
--   → 其實也是殭屍，但保留資料當作歷史定價紀錄。確認無引用可移到 B 類再刪。
--
-- 不執行任何 DROP。


-- ============================================================
-- 執行後驗證
-- ============================================================
-- 執行完 A 類 DROP 後，跑以下 SQL 確認鑑源核心功能未受影響：

-- 1. 付款報告數量正常（> 0）
-- SELECT COUNT(*) FROM public.paid_reports;

-- 2. 推薦積分系統正常
-- SELECT COUNT(*) FROM public.user_points;
-- SELECT COUNT(*) FROM public.referrals;

-- 3. 鑑源 A/B 測試（新的三表結構）正常
-- SELECT COUNT(*) FROM public.ab_experiments;
-- SELECT COUNT(*) FROM public.ab_assignments;
-- SELECT COUNT(*) FROM public.ab_events;

-- 4. 確認殭屍表已清除
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('ab_tests','ab_test_events','clients','divination_reports',
--                       'email_log','macro_indicators','macro_market_data','macro_news',
--                       'racing_predictions','reports','stock_screening');
-- 預期結果：0 rows（表已全部刪除）
