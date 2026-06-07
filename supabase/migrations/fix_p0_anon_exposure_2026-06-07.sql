-- ============================================================
-- v5.10.406 P0 安全修復 — anon 訪問敏感表/view/function 個資+營收外洩+刷積分
-- 發現:2026-06-07 全系統零錯誤 audit(Supabase advisor + information_schema/pg_proc grant 實測)
-- 已 apply 到 production(execute_sql、全部驗證 anon 擋 + service_role 保留 + 後端 134 筆仍讀零影響)
-- ============================================================
--
-- 🔴 漏洞(anon=前端公開 key 角色):
--   1. checkout_drafts(134 筆 birth_data 客戶出生 PII)/coupon_uses(23)/promotions(0):
--      RLS off + anon 全權 → 任何人讀全部客戶出生資料 + 篡改/清空
--   2. v_paid_reports_active/v_customer_metrics/v_revenue_metrics/revenue_net_view:
--      SECURITY DEFINER view + anon SELECT → 繞 RLS 讀 admin 營收/客戶/付費報告(商業機密)
--   3. add_points/claim_next_job/handle_new_user/mirror_ai_cost_to_expense:
--      PUBLIC EXECUTE 殘留 → anon 可呼叫 add_points 刷積分(財務損失)、認領 job、觸發 trigger 邏輯
--   4. admin_dashboard_snapshot/admin_funnel_analysis/admin_visitor_stats:anon 可呼叫看 admin 統計
--   5. 7 函式 search_path mutable → 潛在 search_path 注入
--
-- ✅ 安全驗證(grep 全 repo + has_function_privilege 實測):
--   全由後端 createServiceClient()(service_role、BYPASSRLS)訪問:
--     checkout/route.ts + webhook/stripe + referral/register + admin RPC + admin dashboard
--   無任何前端 .tsx anon client 訪問。修復後 svc_exec=true(後端零影響)、anon/auth_exec=false。
--
-- ============================================================

-- 1. 三表啟用 RLS(無 policy = anon/authenticated 全擋、service_role BYPASSRLS 繞)
ALTER TABLE public.checkout_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_uses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions      ENABLE ROW LEVEL SECURITY;

-- 2. admin metrics view:REVOKE anon/authenticated + security_invoker(用查詢者權限、admin RPC/route 用 service_role 不受影響)
REVOKE ALL ON public.v_paid_reports_active FROM anon, authenticated;
REVOKE ALL ON public.v_customer_metrics    FROM anon, authenticated;
REVOKE ALL ON public.v_revenue_metrics     FROM anon, authenticated;
REVOKE ALL ON public.revenue_net_view      FROM anon, authenticated;
ALTER VIEW public.v_paid_reports_active SET (security_invoker = true);
ALTER VIEW public.v_customer_metrics    SET (security_invoker = true);
ALTER VIEW public.v_revenue_metrics     SET (security_invoker = true);
ALTER VIEW public.revenue_net_view      SET (security_invoker = true);

-- 3. SECURITY DEFINER function:REVOKE FROM PUBLIC(根因、非 anon)+ GRANT service_role(後端保留)
REVOKE EXECUTE ON FUNCTION public.add_points(uuid,integer,text,text,text,timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_points(uuid,integer,text,text,text,timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_next_job()            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_next_job()            TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()           FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.handle_new_user()           TO service_role;
REVOKE EXECUTE ON FUNCTION public.mirror_ai_cost_to_expense() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mirror_ai_cost_to_expense() TO service_role;

-- 4. admin 統計 RPC:revoke anon(對齊原 migration REVOKE FROM PUBLIC 意圖、保留 authenticated)
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_snapshot(timestamptz,timestamptz,timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_funnel_analysis(timestamptz,timestamptz)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_visitor_stats(timestamptz,timestamptz)                  FROM anon;

-- 5. 7 函式設 search_path(防注入 hardening)
ALTER FUNCTION public.check_family_member_limit()          SET search_path = public, pg_temp;
ALTER FUNCTION public.update_family_members_updated_at()   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_report_feedback_updated_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.deduct_points(uuid,integer,text,text) SET search_path = public, pg_temp;  -- 簽名以實際為準、DO block 動態 ALTER 已套用
ALTER FUNCTION public.set_rules_library_updated_at()       SET search_path = public, pg_temp;
-- match_rules / mirror_ai_cost_to_expense 同 DO block 套用(簽名見 pg_proc)

SELECT 'v5.10.406 P0 fixed: 3 tables RLS + 4 views invoker + 7 funcs revoked PUBLIC + 3 admin revoked anon + 7 search_path' AS migration_status;
