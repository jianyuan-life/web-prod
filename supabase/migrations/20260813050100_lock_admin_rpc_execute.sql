BEGIN;

-- Resolve every live overload before changing any ACL. A missing or drifted
-- signature aborts the transaction instead of silently securing the wrong
-- routine.
DO $admin_rpc_preflight$
DECLARE
  dashboard_snapshot_oid oid := to_regprocedure(
    'public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone)'
  )::oid;
  funnel_analysis_oid oid := to_regprocedure(
    'public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone)'
  )::oid;
  visitor_stats_oid oid := to_regprocedure(
    'public.admin_visitor_stats(timestamp with time zone,timestamp with time zone)'
  )::oid;
  target_name text;
  overload_count bigint;
BEGIN
  IF dashboard_snapshot_oid IS NULL THEN
    RAISE EXCEPTION 'required function public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone) is missing';
  END IF;

  IF funnel_analysis_oid IS NULL THEN
    RAISE EXCEPTION 'required function public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone) is missing';
  END IF;

  IF visitor_stats_oid IS NULL THEN
    RAISE EXCEPTION 'required function public.admin_visitor_stats(timestamp with time zone,timestamp with time zone) is missing';
  END IF;

  -- REVOKE binds to one identity signature. An additional overload could keep
  -- PUBLIC/authenticated EXECUTE and silently preserve the same admin bypass,
  -- so schema drift must abort before any ACL is changed.
  FOREACH target_name IN ARRAY ARRAY[
    'admin_dashboard_snapshot',
    'admin_funnel_analysis',
    'admin_visitor_stats'
  ]::text[]
  LOOP
    SELECT count(*)
      INTO overload_count
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = target_name;

    IF overload_count <> 1 THEN
      RAISE EXCEPTION
        'expected exactly one public.% overload, observed %',
        target_name,
        overload_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
        AND routine.proname = target_name
        AND routine.proowner = current_user::regrole
        AND routine.prosecdef
        AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[]
    ) THEN
      RAISE EXCEPTION
        'admin RPC security attributes drifted for public.%',
        target_name;
    END IF;
  END LOOP;
END
$admin_rpc_preflight$;

REVOKE EXECUTE
ON FUNCTION public.admin_dashboard_snapshot(
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone
)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.admin_funnel_analysis(
  timestamp with time zone,
  timestamp with time zone
)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.admin_visitor_stats(
  timestamp with time zone,
  timestamp with time zone
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_dashboard_snapshot(
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone
)
TO service_role;

GRANT EXECUTE
ON FUNCTION public.admin_funnel_analysis(
  timestamp with time zone,
  timestamp with time zone
)
TO service_role;

GRANT EXECUTE
ON FUNCTION public.admin_visitor_stats(
  timestamp with time zone,
  timestamp with time zone
)
TO service_role;

-- Verify effective privileges for real roles. PUBLIC is not a pg_roles row,
-- so its default/direct ACL entry is checked separately through grantee OID 0.
DO $admin_rpc_postcondition$
DECLARE
  dashboard_snapshot_oid oid := to_regprocedure(
    'public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone)'
  )::oid;
  funnel_analysis_oid oid := to_regprocedure(
    'public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone)'
  )::oid;
  visitor_stats_oid oid := to_regprocedure(
    'public.admin_visitor_stats(timestamp with time zone,timestamp with time zone)'
  )::oid;
  target_signature text;
  target_oid oid;
  checked_role text;
  should_execute boolean;
  actual_execute boolean;
  overload_count bigint;
BEGIN
  IF dashboard_snapshot_oid IS NULL THEN
    RAISE EXCEPTION 'postcondition target admin_dashboard_snapshot is missing';
  END IF;

  IF funnel_analysis_oid IS NULL THEN
    RAISE EXCEPTION 'postcondition target admin_funnel_analysis is missing';
  END IF;

  IF visitor_stats_oid IS NULL THEN
    RAISE EXCEPTION 'postcondition target admin_visitor_stats is missing';
  END IF;

  FOR target_signature, target_oid IN
    VALUES
      (
        'public.admin_dashboard_snapshot(timestamp with time zone,timestamp with time zone,timestamp with time zone)',
        dashboard_snapshot_oid
      ),
      (
        'public.admin_funnel_analysis(timestamp with time zone,timestamp with time zone)',
        funnel_analysis_oid
      ),
      (
        'public.admin_visitor_stats(timestamp with time zone,timestamp with time zone)',
        visitor_stats_oid
      )
  LOOP
    SELECT count(*)
      INTO overload_count
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = split_part(
        split_part(target_signature, '(', 1),
        '.',
        2
      );

    IF overload_count <> 1 THEN
      RAISE EXCEPTION
        'admin RPC overload set drifted while locking %: observed %',
        target_signature,
        overload_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = target_oid
        AND routine.proowner = current_user::regrole
        AND routine.prosecdef
        AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[]
    ) THEN
      RAISE EXCEPTION
        'admin RPC security attributes changed while locking %',
        target_signature;
    END IF;

    FOR checked_role, should_execute IN
      VALUES
        ('anon', false),
        ('authenticated', false),
        ('service_role', true)
    LOOP
      actual_execute := has_function_privilege(
        checked_role,
        target_oid,
        'EXECUTE'
      );

      IF actual_execute IS DISTINCT FROM should_execute THEN
        RAISE EXCEPTION
          'unexpected EXECUTE privilege on % for %: expected %, observed %',
          target_signature,
          checked_role,
          should_execute,
          actual_execute;
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      WHERE routine.oid = target_oid
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains EXECUTE privilege on %', target_signature;
    END IF;
  END LOOP;
END
$admin_rpc_postcondition$;

COMMIT;
