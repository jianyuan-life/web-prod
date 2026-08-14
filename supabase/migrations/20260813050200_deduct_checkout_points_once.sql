BEGIN;

-- The SECURITY DEFINER routine is only trustworthy when its owner and both
-- referenced money tables share the canonical migration owner. Live read-only
-- preflight observed postgres for current_user, user_points, point_transactions,
-- and the existing deduct_points routine; this check re-observes the tables at
-- apply time instead of trusting that earlier receipt.
DO $checkout_points_owner_preflight$
DECLARE
  v_expected_owner_oid oid;
  v_user_points_oid oid := to_regclass('public.user_points')::oid;
  v_point_transactions_oid oid := to_regclass('public.point_transactions')::oid;
BEGIN
  SELECT role_row.oid
  INTO v_expected_owner_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = current_user
    AND (role_row.rolsuper OR role_row.rolbypassrls);

  IF v_expected_owner_oid IS NULL
    OR v_user_points_oid IS NULL
    OR v_point_transactions_oid IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = v_user_points_oid
        AND relkind = 'r'
        AND relowner = v_expected_owner_oid
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = v_point_transactions_oid
        AND relkind = 'r'
        AND relowner = v_expected_owner_oid
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'checkout-points owner preflight failed for migration role or referenced table';
  END IF;
END
$checkout_points_owner_preflight$;

-- C/G15 must not impose an idempotency index, constraint, trigger, or policy on
-- the shared ledger because E3 and the other plans keep their legacy behavior.
-- Snapshot the complete index/constraint surface and fail closed if this
-- migration changes it in either direction.
CREATE TEMP TABLE pg_temp._cg15_point_transactions_schema_before
ON COMMIT DROP
AS
SELECT
  'index'::text AS object_kind,
  index_class.relname::text AS object_name,
  pg_get_indexdef(index_row.indexrelid)::text AS object_definition
FROM pg_catalog.pg_index AS index_row
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid = index_row.indexrelid
WHERE index_row.indrelid = 'public.point_transactions'::regclass
UNION ALL
SELECT
  'constraint'::text AS object_kind,
  constraint_row.conname::text AS object_name,
  pg_get_constraintdef(constraint_row.oid, true)::text AS object_definition
FROM pg_catalog.pg_constraint AS constraint_row
WHERE constraint_row.conrelid = 'public.point_transactions'::regclass
UNION ALL
SELECT
  'trigger'::text AS object_kind,
  trigger_row.tgname::text AS object_name,
  pg_get_triggerdef(trigger_row.oid, true)::text AS object_definition
FROM pg_catalog.pg_trigger AS trigger_row
WHERE trigger_row.tgrelid = 'public.point_transactions'::regclass
  AND NOT trigger_row.tgisinternal
UNION ALL
SELECT
  'policy'::text AS object_kind,
  policy_row.polname::text AS object_name,
  concat_ws(
    '|',
    policy_row.polcmd::text,
    policy_row.polpermissive::text,
    policy_row.polroles::text,
    COALESCE(pg_get_expr(policy_row.polqual, policy_row.polrelid, true), ''),
    COALESCE(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true), '')
  )::text AS object_definition
FROM pg_catalog.pg_policy AS policy_row
WHERE policy_row.polrelid = 'public.point_transactions'::regclass;

-- Version migrations may be replayed by recovery tooling. IF NOT EXISTS is
-- permitted only after an already-present table proves it is exactly the
-- canonical table; any extra/missing column, constraint, index, policy,
-- trigger, RLS flag, or privilege aborts before mutation.
DO $cg15_dedupe_replay_preflight$
DECLARE
  v_table_oid oid := to_regclass('public.cg15_checkout_point_dedupe')::oid;
  v_service_role_oid oid;
  v_expected_owner_oid oid;
  v_owner_oid oid;
BEGIN
  IF v_table_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT role_row.oid
  INTO v_service_role_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = 'service_role';

  IF v_service_role_oid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: service_role is missing';
  END IF;

  SELECT role_row.oid
  INTO v_expected_owner_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = current_user
    AND (role_row.rolsuper OR role_row.rolbypassrls);

  IF v_expected_owner_oid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: migration owner is missing';
  END IF;

  SELECT table_row.relowner
  INTO v_owner_oid
  FROM pg_catalog.pg_class AS table_row
  WHERE table_row.oid = v_table_oid
    AND table_row.relkind = 'r'
    AND table_row.relpersistence = 'p'
    AND table_row.reltablespace = 0
    AND table_row.reloptions IS NULL
    AND NOT table_row.relispartition
    AND table_row.relrowsecurity
    AND table_row.relforcerowsecurity;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: table kind or RLS flags differ';
  END IF;

  IF v_owner_oid <> v_expected_owner_oid THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: owner differs from migration role';
  END IF;

  IF (SELECT count(*)
      FROM information_schema.columns AS column_row
      WHERE column_row.table_schema = 'public'
        AND column_row.table_name = 'cg15_checkout_point_dedupe') <> 6
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'reference_id' AND ordinal_position = 1
        AND udt_name = 'text' AND is_nullable = 'NO' AND column_default IS NULL
        AND collation_name IS NULL
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'user_id' AND ordinal_position = 2
        AND udt_name = 'uuid' AND is_nullable = 'NO' AND column_default IS NULL
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'plan_code' AND ordinal_position = 3
        AND udt_name = 'text' AND is_nullable = 'NO' AND column_default IS NULL
        AND collation_name IS NULL
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'amount' AND ordinal_position = 4
        AND udt_name = 'int4' AND is_nullable = 'NO' AND column_default IS NULL
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'balance_after' AND ordinal_position = 5
        AND udt_name = 'int4' AND is_nullable = 'NO' AND column_default IS NULL
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cg15_checkout_point_dedupe'
        AND column_name = 'created_at' AND ordinal_position = 6
        AND udt_name = 'timestamptz' AND is_nullable = 'NO'
        AND regexp_replace(column_default, '\s+', '', 'g') = 'now()'
        AND is_identity = 'NO' AND is_generated = 'NEVER'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: column shape differs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency_row
    JOIN pg_catalog.pg_class AS dependent_relation
      ON dependent_relation.oid = dependency_row.objid
    WHERE dependency_row.refobjid = v_table_oid
      AND dependent_relation.relkind = 'S'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: sequence dependency exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid = v_table_oid
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
      AND attribute_row.attacl IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: column privileges exist';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = v_table_oid) <> 4
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_table_oid
        AND (
          NOT convalidated
          OR condeferrable
          OR condeferred
          OR (contype = 'c' AND connoinherit)
        )
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_table_oid
        AND conname = 'cg15_checkout_point_dedupe_pkey'
        AND pg_get_constraintdef(oid, true) = 'PRIMARY KEY (reference_id)'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_table_oid
        AND conname = 'cg15_checkout_point_dedupe_plan_code_check'
        AND pg_get_constraintdef(oid, true) = 'CHECK (plan_code = ANY (ARRAY[''C''::text, ''G15''::text]))'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_table_oid
        AND conname = 'cg15_checkout_point_dedupe_amount_check'
        AND pg_get_constraintdef(oid, true) = 'CHECK (amount > 0)'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_table_oid
        AND conname = 'cg15_checkout_point_dedupe_balance_after_check'
        AND pg_get_constraintdef(oid, true) = 'CHECK (balance_after >= 0)'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: constraints differ';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid = v_table_oid) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index
      WHERE indrelid = v_table_oid
        AND indisprimary
        AND indisunique
        AND indisvalid
        AND indisready
        AND indislive
        AND indimmediate
        AND indexprs IS NULL
        AND indpred IS NULL
        AND pg_get_indexdef(indexrelid) =
          'CREATE UNIQUE INDEX cg15_checkout_point_dedupe_pkey ON public.cg15_checkout_point_dedupe USING btree (reference_id)'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: indexes differ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = v_table_oid AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: trigger exists';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid = v_table_oid) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = v_table_oid
        AND polname = 'cg15_checkout_point_dedupe_service_select'
        AND polpermissive
        AND polcmd = 'r'
        AND polroles = ARRAY[v_service_role_oid]
        AND pg_get_expr(polqual, polrelid, true) = 'true'
        AND polwithcheck IS NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = v_table_oid
        AND polname = 'cg15_checkout_point_dedupe_service_insert'
        AND polpermissive
        AND polcmd = 'a'
        AND polroles = ARRAY[v_service_role_oid]
        AND polqual IS NULL
        AND pg_get_expr(polwithcheck, polrelid, true) = 'plan_code = ANY (ARRAY[''C''::text, ''G15''::text])'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: policies differ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(table_row.relacl, pg_catalog.acldefault('r', table_row.relowner))
    ) AS acl_row
    WHERE table_row.oid = v_table_oid
      AND (
        acl_row.grantee NOT IN (v_expected_owner_oid, v_service_role_oid)
        OR (
          acl_row.grantee = v_service_role_oid
          AND acl_row.privilege_type NOT IN ('SELECT', 'INSERT')
        )
      )
  )
    OR (SELECT count(DISTINCT acl_row.privilege_type)
        FROM pg_catalog.pg_class AS table_row
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(table_row.relacl, pg_catalog.acldefault('r', table_row.relowner))
        ) AS acl_row
        WHERE table_row.oid = v_table_oid
          AND acl_row.grantee = v_service_role_oid) <> 2
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'cg15 checkout dedupe drift: privileges differ';
  END IF;
END
$cg15_dedupe_replay_preflight$;

CREATE TABLE IF NOT EXISTS public.cg15_checkout_point_dedupe (
  reference_id text NOT NULL,
  user_id uuid NOT NULL,
  plan_code text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cg15_checkout_point_dedupe_pkey PRIMARY KEY (reference_id),
  CONSTRAINT cg15_checkout_point_dedupe_plan_code_check
    CHECK (plan_code IN ('C', 'G15')),
  CONSTRAINT cg15_checkout_point_dedupe_amount_check CHECK (amount > 0),
  CONSTRAINT cg15_checkout_point_dedupe_balance_after_check CHECK (balance_after >= 0)
);

ALTER TABLE public.cg15_checkout_point_dedupe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cg15_checkout_point_dedupe FORCE ROW LEVEL SECURITY;

DO $cg15_dedupe_acl_reset$
DECLARE
  v_owner_oid oid;
  v_grantee_oid oid;
BEGIN
  SELECT table_row.relowner
  INTO v_owner_oid
  FROM pg_catalog.pg_class AS table_row
  WHERE table_row.oid = 'public.cg15_checkout_point_dedupe'::regclass;

  FOR v_grantee_oid IN
    SELECT DISTINCT acl_row.grantee
    FROM pg_catalog.pg_class AS table_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(table_row.relacl, pg_catalog.acldefault('r', table_row.relowner))
    ) AS acl_row
    WHERE table_row.oid = 'public.cg15_checkout_point_dedupe'::regclass
      AND acl_row.grantee <> v_owner_oid
  LOOP
    IF v_grantee_oid = 0 THEN
      REVOKE ALL ON TABLE public.cg15_checkout_point_dedupe FROM PUBLIC;
    ELSE
      EXECUTE format(
        'REVOKE ALL ON TABLE public.cg15_checkout_point_dedupe FROM %I',
        pg_catalog.pg_get_userbyid(v_grantee_oid)
      );
    END IF;
  END LOOP;
END
$cg15_dedupe_acl_reset$;

GRANT SELECT, INSERT ON TABLE public.cg15_checkout_point_dedupe TO service_role;

DO $cg15_dedupe_policies$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.cg15_checkout_point_dedupe'::regclass
      AND polname = 'cg15_checkout_point_dedupe_service_select'
  ) THEN
    CREATE POLICY cg15_checkout_point_dedupe_service_select
      ON public.cg15_checkout_point_dedupe
      FOR SELECT
      TO service_role
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.cg15_checkout_point_dedupe'::regclass
      AND polname = 'cg15_checkout_point_dedupe_service_insert'
  ) THEN
    CREATE POLICY cg15_checkout_point_dedupe_service_insert
      ON public.cg15_checkout_point_dedupe
      FOR INSERT
      TO service_role
      WITH CHECK (plan_code IN ('C', 'G15'));
  END IF;
END
$cg15_dedupe_policies$;

-- DROP/CREATE is deliberate: CREATE OR REPLACE preserves the previous owner
-- and arbitrary EXECUTE ACLs. Removing both the superseded four-argument
-- signature and the canonical signature resets ownership and privileges inside
-- this transaction; unexpected dependencies fail closed.
DROP FUNCTION IF EXISTS public.deduct_checkout_points_once(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.deduct_checkout_points_once(uuid, integer, text, text, text);

CREATE FUNCTION public.deduct_checkout_points_once(
  p_user_id uuid,
  p_amount integer,
  p_reference_id text,
  p_description text,
  p_plan_code text
)
RETURNS TABLE(status text, balance_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
AS $deduct_checkout_points_once$
DECLARE
  v_reference_id text;
  v_existing_user_id uuid;
  v_locked_balance integer;
  v_existing_balance integer;
  v_existing_plan_code text;
  v_existing_amount integer;
  v_new_balance integer;
  v_row_count bigint;
BEGIN
  IF p_user_id IS NULL
    OR p_amount IS NULL
    OR p_amount <= 0
    OR p_reference_id IS NULL
    OR btrim(p_reference_id) = ''
    OR p_plan_code IS NULL
    OR p_plan_code NOT IN ('C', 'G15')
  THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::integer;
    RETURN;
  END IF;

  v_reference_id := btrim(p_reference_id);

  SELECT up.balance
  INTO v_locked_balance
  FROM public.user_points AS up
  WHERE up.user_id = p_user_id
  FOR UPDATE OF up;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing'::text, NULL::integer;
    RETURN;
  END IF;

  -- The same user row serializes concurrent deductions. Recheck the dedicated
  -- C/G15 key only after acquiring that lock; the shared ledger remains
  -- intentionally unconstrained for every other plan.
  SELECT
    dedupe.user_id,
    dedupe.plan_code,
    dedupe.amount,
    dedupe.balance_after
  INTO
    v_existing_user_id,
    v_existing_plan_code,
    v_existing_amount,
    v_existing_balance
  FROM public.cg15_checkout_point_dedupe AS dedupe
  WHERE dedupe.reference_id = v_reference_id;

  IF FOUND THEN
    IF v_existing_user_id <> p_user_id
      OR v_existing_plan_code <> p_plan_code
      OR v_existing_amount <> p_amount
    THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::integer;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'already'::text, v_existing_balance;
    RETURN;
  END IF;

  IF COALESCE(v_locked_balance, 0) < p_amount THEN
    RETURN QUERY SELECT 'insufficient'::text, COALESCE(v_locked_balance, 0);
    RETURN;
  END IF;

  -- PL/pgSQL exception blocks are subtransactions. A dedupe PK conflict rolls
  -- back the balance mutation and normal ledger insert before the handler reads
  -- the winning C/G15 record.
  BEGIN
    UPDATE public.user_points AS up
    SET balance = COALESCE(up.balance, 0) - p_amount,
        total_used = COALESCE(up.total_used, 0) + p_amount,
        updated_at = now()
    WHERE up.user_id = p_user_id
    RETURNING up.balance INTO v_new_balance;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'checkout points update affected an unexpected row count';
    END IF;

    INSERT INTO public.point_transactions (
      user_id,
      type,
      amount,
      balance_after,
      description,
      reference_id
    )
    VALUES (
      p_user_id,
      'use_checkout',
      -p_amount,
      v_new_balance,
      COALESCE(NULLIF(btrim(p_description), ''), '訂單折抵'),
      v_reference_id
    );

    INSERT INTO public.cg15_checkout_point_dedupe (
      reference_id,
      user_id,
      plan_code,
      amount,
      balance_after
    )
    VALUES (
      v_reference_id,
      p_user_id,
      p_plan_code,
      p_amount,
      v_new_balance
    );
  EXCEPTION
    WHEN SQLSTATE '23505' THEN
      SELECT
        dedupe.user_id,
        dedupe.plan_code,
        dedupe.amount,
        dedupe.balance_after
      INTO
        v_existing_user_id,
        v_existing_plan_code,
        v_existing_amount,
        v_existing_balance
      FROM public.cg15_checkout_point_dedupe AS dedupe
      WHERE dedupe.reference_id = v_reference_id;

      IF FOUND THEN
        IF v_existing_user_id = p_user_id
          AND v_existing_plan_code = p_plan_code
          AND v_existing_amount = p_amount
        THEN
          RETURN QUERY SELECT 'already'::text, v_existing_balance;
        ELSE
          RETURN QUERY SELECT 'invalid'::text, NULL::integer;
        END IF;
        RETURN;
      END IF;

      RAISE;
  END;

  RETURN QUERY SELECT 'applied'::text, v_new_balance;
END
$deduct_checkout_points_once$;

DO $checkout_points_function_acl_reset$
DECLARE
  v_function_oid oid := to_regprocedure(
    'public.deduct_checkout_points_once(uuid,integer,text,text,text)'
  )::oid;
  v_owner_oid oid;
  v_grantee_oid oid;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'checkout-points function is missing before ACL reset';
  END IF;

  SELECT routine_row.proowner
  INTO v_owner_oid
  FROM pg_catalog.pg_proc AS routine_row
  WHERE routine_row.oid = v_function_oid;

  FOR v_grantee_oid IN
    SELECT DISTINCT acl_row.grantee
    FROM pg_catalog.pg_proc AS routine_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine_row.proacl, pg_catalog.acldefault('f', routine_row.proowner))
    ) AS acl_row
    WHERE routine_row.oid = v_function_oid
      AND acl_row.grantee <> v_owner_oid
  LOOP
    IF v_grantee_oid = 0 THEN
      REVOKE ALL ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) FROM PUBLIC;
    ELSE
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) FROM %I',
        pg_catalog.pg_get_userbyid(v_grantee_oid)
      );
    END IF;
  END LOOP;
END
$checkout_points_function_acl_reset$;

REVOKE ALL ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) TO service_role;

COMMENT ON FUNCTION public.deduct_checkout_points_once(uuid, integer, text, text, text) IS
  'Atomically deduct C/G15 checkout points with a plan-isolated idempotency record.';

DO $checkout_points_acl_postcondition$
DECLARE
  v_function_oid oid := to_regprocedure(
    'public.deduct_checkout_points_once(uuid,integer,text,text,text)'
  )::oid;
  v_service_role_oid oid;
  v_expected_owner_oid oid;
  v_function_owner_oid oid;
  v_table_owner_oid oid;
BEGIN
  SELECT role_row.oid
  INTO v_service_role_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = 'service_role';

  SELECT role_row.oid
  INTO v_expected_owner_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = current_user
    AND (role_row.rolsuper OR role_row.rolbypassrls);

  IF v_function_oid IS NULL
    OR v_service_role_oid IS NULL
    OR v_expected_owner_oid IS NULL
  THEN
    RAISE EXCEPTION 'checkout-points ACL postcondition target is missing';
  END IF;

  SELECT routine_row.proowner
  INTO v_function_owner_oid
  FROM pg_catalog.pg_proc AS routine_row
  WHERE routine_row.oid = v_function_oid;

  SELECT table_row.relowner
  INTO v_table_owner_oid
  FROM pg_catalog.pg_class AS table_row
  WHERE table_row.oid = 'public.cg15_checkout_point_dedupe'::regclass;

  IF v_function_owner_oid <> v_expected_owner_oid
    OR v_table_owner_oid <> v_expected_owner_oid
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.user_points'::regclass
        AND relowner = v_expected_owner_oid
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.point_transactions'::regclass
        AND relowner = v_expected_owner_oid
    )
  THEN
    RAISE EXCEPTION 'checkout-points owner postcondition failed';
  END IF;

  IF (SELECT count(*)
      FROM pg_catalog.pg_proc AS routine_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = routine_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND routine_row.proname = 'deduct_checkout_points_once') <> 1
  THEN
    RAISE EXCEPTION 'unexpected checkout-points function overload remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine_row.proacl, pg_catalog.acldefault('f', routine_row.proowner))
    ) AS acl_row
    WHERE routine_row.oid = v_function_oid
      AND acl_row.privilege_type = 'EXECUTE'
      AND acl_row.grantee NOT IN (v_function_owner_oid, v_service_role_oid)
  )
    OR NOT pg_catalog.has_function_privilege(
      'service_role', v_function_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon', v_function_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated', v_function_oid, 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'unexpected function privilege on checkout-points RPC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(table_row.relacl, pg_catalog.acldefault('r', table_row.relowner))
    ) AS acl_row
    WHERE table_row.oid = 'public.cg15_checkout_point_dedupe'::regclass
      AND (
        acl_row.grantee NOT IN (v_table_owner_oid, v_service_role_oid)
        OR (
          acl_row.grantee = v_service_role_oid
          AND acl_row.privilege_type NOT IN ('SELECT', 'INSERT')
        )
      )
  )
    OR NOT pg_catalog.has_table_privilege(
      'service_role', 'public.cg15_checkout_point_dedupe', 'SELECT,INSERT'
    )
    OR pg_catalog.has_table_privilege(
      'anon', 'public.cg15_checkout_point_dedupe', 'SELECT,INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated', 'public.cg15_checkout_point_dedupe', 'SELECT,INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'unexpected table privilege on checkout-points dedupe';
  END IF;
END
$checkout_points_acl_postcondition$;

DO $point_transactions_schema_unchanged$
DECLARE
  v_schema_changed boolean;
BEGIN
  WITH current_objects AS (
    SELECT
      'index'::text AS object_kind,
      index_class.relname::text AS object_name,
      pg_get_indexdef(index_row.indexrelid)::text AS object_definition
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    WHERE index_row.indrelid = 'public.point_transactions'::regclass
    UNION ALL
    SELECT
      'constraint'::text AS object_kind,
      constraint_row.conname::text AS object_name,
      pg_get_constraintdef(constraint_row.oid, true)::text AS object_definition
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.point_transactions'::regclass
    UNION ALL
    SELECT
      'trigger'::text AS object_kind,
      trigger_row.tgname::text AS object_name,
      pg_get_triggerdef(trigger_row.oid, true)::text AS object_definition
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.point_transactions'::regclass
      AND NOT trigger_row.tgisinternal
    UNION ALL
    SELECT
      'policy'::text AS object_kind,
      policy_row.polname::text AS object_name,
      concat_ws(
        '|',
        policy_row.polcmd::text,
        policy_row.polpermissive::text,
        policy_row.polroles::text,
        COALESCE(pg_get_expr(policy_row.polqual, policy_row.polrelid, true), ''),
        COALESCE(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true), '')
      )::text AS object_definition
    FROM pg_catalog.pg_policy AS policy_row
    WHERE policy_row.polrelid = 'public.point_transactions'::regclass
  ), schema_differences AS (
    (SELECT * FROM current_objects
     EXCEPT
     SELECT * FROM pg_temp._cg15_point_transactions_schema_before)
    UNION ALL
    (SELECT * FROM pg_temp._cg15_point_transactions_schema_before
     EXCEPT
     SELECT * FROM current_objects)
  )
  SELECT EXISTS (SELECT 1 FROM schema_differences)
  INTO v_schema_changed;

  IF v_schema_changed THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'point_transactions schema changed during C/G15 checkout-points migration';
  END IF;
END
$point_transactions_schema_unchanged$;

COMMIT;
