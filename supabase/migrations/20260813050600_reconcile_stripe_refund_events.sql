BEGIN;

-- One privileged transaction is the only refund accounting authority. It owns
-- paid_reports, revenue_log, expense_log, referral-point clawback, and Stripe
-- event idempotency for both the admin API and external Stripe webhooks.
DO $refund_reconciliation_preflight$
DECLARE
  v_migration_owner_oid oid;
  v_table_name text;
  v_table_owner_oid oid;
BEGIN
  SELECT role_row.oid
  INTO v_migration_owner_oid
  FROM pg_catalog.pg_roles AS role_row
  WHERE role_row.rolname = current_user
    AND (role_row.rolsuper OR role_row.rolbypassrls);

  IF v_migration_owner_oid IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = 'service_role'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation owner or service-role preflight failed';
  END IF;

  FOREACH v_table_name IN ARRAY ARRAY[
    'paid_reports',
    'revenue_log',
    'expense_log',
    'referrals',
    'user_points',
    'point_transactions'
  ]
  LOOP
    SELECT relation_row.relowner
    INTO v_table_owner_oid
    FROM pg_catalog.pg_class AS relation_row
    WHERE relation_row.oid = to_regclass('public.' || v_table_name)
      AND relation_row.relkind = 'r';

    IF v_table_owner_oid IS NULL OR v_table_owner_oid <> v_migration_owner_oid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reconciliation table ownership preflight failed';
    END IF;
  END LOOP;

  IF to_regclass('auth.users') IS NULL OR EXISTS (
    SELECT required.table_name, required.column_name
    FROM (
      VALUES
        ('paid_reports', 'id'),
        ('paid_reports', 'stripe_session_id'),
        ('paid_reports', 'customer_email'),
        ('paid_reports', 'amount_usd'),
        ('paid_reports', 'refunded_at'),
        ('paid_reports', 'refunded_amount_usd'),
        ('paid_reports', 'refund_reason'),
        ('paid_reports', 'stripe_refund_id'),
        ('paid_reports', 'status'),
        ('revenue_log', 'id'),
        ('revenue_log', 'stripe_session_id'),
        ('expense_log', 'id'),
        ('expense_log', 'report_id'),
        ('expense_log', 'category'),
        ('expense_log', 'subcategory'),
        ('expense_log', 'amount_usd'),
        ('expense_log', 'description'),
        ('expense_log', 'source'),
        ('expense_log', 'created_by'),
        ('expense_log', 'metadata'),
        ('expense_log', 'occurred_at'),
        ('referrals', 'id'),
        ('referrals', 'referrer_user_id'),
        ('referrals', 'referred_user_id'),
        ('referrals', 'referred_email'),
        ('referrals', 'status'),
        ('referrals', 'referrer_points_awarded'),
        ('user_points', 'id'),
        ('user_points', 'user_id'),
        ('user_points', 'balance'),
        ('user_points', 'total_earned'),
        ('user_points', 'updated_at'),
        ('point_transactions', 'id'),
        ('point_transactions', 'user_id'),
        ('point_transactions', 'type'),
        ('point_transactions', 'amount'),
        ('point_transactions', 'balance_after'),
        ('point_transactions', 'description'),
        ('point_transactions', 'reference_id')
    ) AS required(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = required.table_name
        AND actual.column_name = required.column_name
    )
  ) OR EXISTS (
    SELECT required.column_name
    FROM (VALUES ('id'), ('email')) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS actual
      WHERE actual.table_schema = 'auth'
        AND actual.table_name = 'users'
        AND actual.column_name = required.column_name
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation schema preflight failed';
  END IF;
END
$refund_reconciliation_preflight$;

-- Replay is allowed only from the exact migration cohort. IF NOT EXISTS and
-- CREATE OR REPLACE must never silently bless a partial object set, a changed
-- owner, SECURITY INVOKER drift, or a writable search_path.
DO $refund_reconciliation_replay_preflight$
DECLARE
  v_owner_oid oid := (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = current_user);
  v_table_names text[] := ARRAY[
    'stripe_refund_event_ledger',
    'stripe_refund_accounting_state',
    'referral_refund_point_ledger',
    'admin_refund_intent',
    'admin_refund_point_hold',
    'stripe_refund_reversal_ledger'
  ];
  v_function_signatures text[] := ARRAY[
    'public.reserve_admin_refund_intent(uuid,text,text,bigint,text,text,text)',
    'public.start_admin_refund_provider_attempt(uuid,text,text)',
    'public.bind_admin_refund_intent_provider_result(uuid,text,text,text,text,bigint)',
    'public.complete_admin_refund_intent(uuid,text,text,text,bigint)',
    'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)',
    'public.reverse_stripe_refund_event(text,text,text,text,text,text,text,bigint,bigint,text,text,text)'
  ];
  v_function_names text[] := ARRAY[
    'reserve_admin_refund_intent',
    'start_admin_refund_provider_attempt',
    'bind_admin_refund_intent_provider_result',
    'complete_admin_refund_intent',
    'reconcile_stripe_refund_event',
    'reverse_stripe_refund_event'
  ];
  v_existing_tables integer;
  v_existing_functions integer;
  v_named_functions integer;
  v_name text;
  v_signature text;
  v_proc_oid oid;
BEGIN
  SELECT count(*)
  INTO v_existing_tables
  FROM unnest(v_table_names) AS expected(name)
  WHERE to_regclass(format('public.%I', expected.name)) IS NOT NULL;

  IF v_existing_tables NOT IN (0, cardinality(v_table_names)) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation table cohort is partial';
  END IF;

  IF v_existing_tables = cardinality(v_table_names) THEN
    FOREACH v_name IN ARRAY v_table_names LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_row
        JOIN pg_catalog.pg_namespace AS namespace_row
          ON namespace_row.oid = relation_row.relnamespace
        WHERE namespace_row.nspname = 'public'
          AND relation_row.relname = v_name
          AND relation_row.relkind = 'r'
          AND relation_row.relowner = v_owner_oid
          AND relation_row.relrowsecurity
          AND relation_row.relforcerowsecurity
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reconciliation table replay preflight failed';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_row
        JOIN pg_catalog.pg_namespace AS namespace_row
          ON namespace_row.oid = relation_row.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            relation_row.relacl,
            pg_catalog.acldefault('r', relation_row.relowner)
          )
        ) AS acl_row
        WHERE namespace_row.nspname = 'public'
          AND relation_row.relname = v_name
          AND acl_row.grantee IN (
            0,
            (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'anon'),
            (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'authenticated'),
            (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'service_role')
          )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reconciliation table privilege replay preflight failed';
      END IF;
    END LOOP;
  END IF;

  SELECT count(*)
  INTO v_existing_functions
  FROM unnest(v_function_signatures) AS expected(signature)
  WHERE to_regprocedure(expected.signature) IS NOT NULL;

  SELECT count(*)
  INTO v_named_functions
  FROM pg_catalog.pg_proc AS proc_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = proc_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND proc_row.proname = ANY (v_function_names);

  IF v_existing_functions NOT IN (0, cardinality(v_function_signatures))
    OR v_named_functions <> v_existing_functions
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation function cohort is partial';
  END IF;

  IF v_existing_functions = cardinality(v_function_signatures) THEN
    FOREACH v_signature IN ARRAY v_function_signatures LOOP
      v_proc_oid := to_regprocedure(v_signature);
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS proc_row
        WHERE proc_row.oid = v_proc_oid
          AND proc_row.proowner = v_owner_oid
          AND proc_row.prosecdef
          AND proc_row.proconfig @> ARRAY['search_path=pg_catalog', 'lock_timeout=5s']::text[]
          AND cardinality(proc_row.proconfig) = 2
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reconciliation function replay preflight failed';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS proc_row
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            proc_row.proacl,
            pg_catalog.acldefault('f', proc_row.proowner)
          )
        ) AS acl_row
        WHERE proc_row.oid = v_proc_oid
          AND acl_row.grantee IN (
            0,
            (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'anon'),
            (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'authenticated')
          )
      ) OR NOT pg_catalog.has_function_privilege(
        'service_role',
        v_proc_oid,
        'EXECUTE'
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reconciliation function privilege replay preflight failed';
      END IF;
    END LOOP;
  END IF;
END
$refund_reconciliation_replay_preflight$;

ALTER TABLE public.revenue_log
  ADD COLUMN IF NOT EXISTS refunded_amount_usd numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.stripe_refund_event_ledger (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_session_id text NOT NULL,
  charge_id text NOT NULL,
  payment_intent_id text NOT NULL,
  refund_id text,
  canonical_amount_refunded_cents bigint NOT NULL,
  effective_amount_refunded_cents bigint NOT NULL DEFAULT 0,
  reason text NOT NULL,
  report_id uuid REFERENCES public.paid_reports(id) ON DELETE RESTRICT,
  outcome text NOT NULL,
  is_full_refund boolean NOT NULL DEFAULT false,
  points_clawed_back integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  CONSTRAINT stripe_refund_event_ledger_event_type_check
    CHECK (event_type IN ('charge.refunded', 'refund.created', 'refund.updated')),
  CONSTRAINT stripe_refund_event_ledger_identity_check
    CHECK (
      btrim(event_id) <> ''
      AND btrim(stripe_session_id) <> ''
      AND btrim(charge_id) <> ''
      AND btrim(payment_intent_id) <> ''
      AND (
        (event_type = 'charge.refunded' AND refund_id IS NULL)
        OR
        (
          event_type IN ('refund.created', 'refund.updated')
          AND refund_id IS NOT NULL
          AND btrim(refund_id) <> ''
        )
      )
    ),
  CONSTRAINT stripe_refund_event_ledger_amount_check
    CHECK (
      canonical_amount_refunded_cents > 0
      AND effective_amount_refunded_cents >= 0
      AND points_clawed_back >= 0
    ),
  CONSTRAINT stripe_refund_event_ledger_outcome_check
    CHECK (outcome IN ('pending', 'applied', 'stale'))
);

CREATE TABLE IF NOT EXISTS public.stripe_refund_accounting_state (
  report_id uuid PRIMARY KEY REFERENCES public.paid_reports(id) ON DELETE RESTRICT,
  revenue_log_id uuid NOT NULL UNIQUE REFERENCES public.revenue_log(id) ON DELETE RESTRICT,
  expense_log_id uuid NOT NULL UNIQUE REFERENCES public.expense_log(id) ON DELETE RESTRICT,
  canonical_amount_refunded_cents bigint NOT NULL,
  pre_refund_report_status text,
  pre_refund_at timestamptz,
  pre_refund_reason text,
  pre_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_refund_accounting_state_amount_check
    CHECK (canonical_amount_refunded_cents >= 0)
);

CREATE TABLE IF NOT EXISTS public.referral_refund_point_ledger (
  report_id uuid PRIMARY KEY REFERENCES public.paid_reports(id) ON DELETE RESTRICT,
  first_event_id text NOT NULL UNIQUE REFERENCES public.stripe_refund_event_ledger(event_id) ON DELETE RESTRICT,
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE RESTRICT,
  source_point_transaction_id uuid UNIQUE REFERENCES public.point_transactions(id) ON DELETE RESTRICT,
  clawback_point_transaction_id uuid UNIQUE REFERENCES public.point_transactions(id) ON DELETE RESTRICT,
  canonical_refunded_cents bigint NOT NULL,
  points_awarded integer NOT NULL,
  points_clawed_back integer NOT NULL,
  balance_before integer,
  balance_after integer,
  last_reversal_event_id text,
  last_reversal_point_transaction_id uuid UNIQUE REFERENCES public.point_transactions(id) ON DELETE RESTRICT,
  points_restored integer NOT NULL DEFAULT 0,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_refund_point_ledger_amount_check
    CHECK (
      canonical_refunded_cents > 0
      AND points_awarded >= 0
      AND points_clawed_back >= 0
      AND points_clawed_back <= points_awarded
      AND points_restored >= 0
      AND points_restored <= points_clawed_back
      AND (balance_before IS NULL OR balance_before >= 0)
      AND (balance_after IS NULL OR balance_after >= 0)
      AND (
        (reversed_at IS NULL AND points_restored = 0 AND last_reversal_event_id IS NULL)
        OR
        (
          reversed_at IS NOT NULL
          AND points_restored = points_clawed_back
          AND last_reversal_event_id IS NOT NULL
          AND btrim(last_reversal_event_id) <> ''
        )
      )
    )
);

CREATE TABLE IF NOT EXISTS public.admin_refund_intent (
  report_id uuid NOT NULL REFERENCES public.paid_reports(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  payload_sha256 text NOT NULL,
  requested_amount_cents bigint NOT NULL,
  reason text NOT NULL,
  stripe_session_id text NOT NULL,
  payment_intent_id text NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  stripe_refund_id text UNIQUE,
  stripe_charge_id text,
  stripe_refund_amount_cents bigint,
  cumulative_refunded_cents bigint,
  provider_attempted_at timestamptz,
  terminal_at timestamptz,
  terminal_reason text,
  terminal_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  PRIMARY KEY (report_id, request_id),
  CONSTRAINT admin_refund_intent_request_id_check
    CHECK (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  CONSTRAINT admin_refund_intent_payload_hash_check
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_refund_intent_amount_check
    CHECK (
      requested_amount_cents > 0
      AND (stripe_refund_amount_cents IS NULL OR stripe_refund_amount_cents > 0)
      AND (cumulative_refunded_cents IS NULL OR cumulative_refunded_cents >= 0)
    ),
  CONSTRAINT admin_refund_intent_reason_check
    CHECK (reason IN ('duplicate', 'fraudulent', 'requested_by_customer')),
  CONSTRAINT admin_refund_intent_state_check
    CHECK (
      state IN (
        'reserved',
        'provider_pending',
        'provider_applied',
        'reconciled',
        'provider_failed',
        'provider_canceled'
      )
    ),
  CONSTRAINT admin_refund_intent_provider_identity_check
    CHECK (
      (
        state = 'reserved'
        AND stripe_refund_id IS NULL
        AND stripe_charge_id IS NULL
        AND stripe_refund_amount_cents IS NULL
        AND cumulative_refunded_cents IS NULL
        AND provider_attempted_at IS NULL
        AND reconciled_at IS NULL
        AND terminal_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_event_id IS NULL
      )
      OR
      (
        state = 'provider_pending'
        AND stripe_refund_id IS NULL
        AND stripe_charge_id IS NULL
        AND stripe_refund_amount_cents IS NULL
        AND cumulative_refunded_cents IS NULL
        AND provider_attempted_at IS NOT NULL
        AND reconciled_at IS NULL
        AND terminal_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_event_id IS NULL
      )
      OR
      (
        state = 'provider_applied'
        AND stripe_refund_id IS NOT NULL
        AND btrim(stripe_refund_id) <> ''
        AND stripe_charge_id IS NOT NULL
        AND btrim(stripe_charge_id) <> ''
        AND stripe_refund_amount_cents = requested_amount_cents
        AND cumulative_refunded_cents IS NULL
        AND provider_attempted_at IS NOT NULL
        AND reconciled_at IS NULL
        AND terminal_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_event_id IS NULL
      )
      OR
      (
        state = 'reconciled'
        AND stripe_refund_id IS NOT NULL
        AND btrim(stripe_refund_id) <> ''
        AND stripe_charge_id IS NOT NULL
        AND btrim(stripe_charge_id) <> ''
        AND stripe_refund_amount_cents = requested_amount_cents
        AND cumulative_refunded_cents IS NOT NULL
        AND cumulative_refunded_cents >= stripe_refund_amount_cents
        AND provider_attempted_at IS NOT NULL
        AND reconciled_at IS NOT NULL
        AND terminal_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_event_id IS NULL
      )
      OR
      (
        state IN ('provider_failed', 'provider_canceled')
        AND stripe_refund_id IS NOT NULL
        AND btrim(stripe_refund_id) <> ''
        AND stripe_charge_id IS NOT NULL
        AND btrim(stripe_charge_id) <> ''
        AND stripe_refund_amount_cents = requested_amount_cents
        AND cumulative_refunded_cents IS NOT NULL
        AND provider_attempted_at IS NOT NULL
        AND reconciled_at IS NULL
        AND terminal_at IS NOT NULL
        AND terminal_reason IS NOT NULL
        AND btrim(terminal_reason) <> ''
        AND terminal_event_id IS NOT NULL
        AND btrim(terminal_event_id) <> ''
      )
    )
);

CREATE TABLE IF NOT EXISTS public.admin_refund_point_hold (
  report_id uuid NOT NULL,
  request_id text NOT NULL,
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE RESTRICT,
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_point_transaction_id uuid NOT NULL REFERENCES public.point_transactions(id) ON DELETE RESTRICT,
  held_points integer NOT NULL,
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  state text NOT NULL DEFAULT 'held',
  clawback_point_transaction_id uuid UNIQUE REFERENCES public.point_transactions(id) ON DELETE RESTRICT,
  terminal_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  converted_at timestamptz,
  PRIMARY KEY (report_id, request_id),
  FOREIGN KEY (report_id, request_id)
    REFERENCES public.admin_refund_intent(report_id, request_id)
    ON DELETE RESTRICT,
  CONSTRAINT admin_refund_point_hold_amount_check
    CHECK (
      held_points > 0
      AND balance_before >= held_points
      AND balance_after = balance_before - held_points
    ),
  CONSTRAINT admin_refund_point_hold_state_check
    CHECK (
      (state = 'held' AND released_at IS NULL AND converted_at IS NULL AND clawback_point_transaction_id IS NULL)
      OR
      (state = 'released' AND released_at IS NOT NULL AND converted_at IS NULL AND clawback_point_transaction_id IS NULL)
      OR
      (state = 'clawed_back' AND released_at IS NULL AND converted_at IS NOT NULL AND clawback_point_transaction_id IS NOT NULL)
      OR
      (state = 'restored' AND released_at IS NOT NULL AND converted_at IS NOT NULL AND clawback_point_transaction_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.stripe_refund_reversal_ledger (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_session_id text NOT NULL,
  charge_id text NOT NULL,
  payment_intent_id text NOT NULL,
  refund_id text NOT NULL,
  refund_status text NOT NULL,
  refund_amount_cents bigint NOT NULL,
  canonical_amount_refunded_cents bigint NOT NULL,
  previous_amount_refunded_cents bigint NOT NULL,
  effective_amount_refunded_cents bigint NOT NULL,
  failure_reason text NOT NULL,
  report_id uuid NOT NULL REFERENCES public.paid_reports(id) ON DELETE RESTRICT,
  outcome text NOT NULL,
  is_full_refund boolean NOT NULL,
  points_restored integer NOT NULL DEFAULT 0,
  intent_state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_refund_reversal_ledger_event_type_check
    CHECK (event_type IN ('refund.failed', 'refund.updated')),
  CONSTRAINT stripe_refund_reversal_ledger_status_check
    CHECK (refund_status IN ('failed', 'canceled')),
  CONSTRAINT stripe_refund_reversal_ledger_amount_check
    CHECK (
      refund_amount_cents > 0
      AND canonical_amount_refunded_cents >= 0
      AND previous_amount_refunded_cents >= 0
      AND effective_amount_refunded_cents >= 0
      AND points_restored >= 0
    ),
  CONSTRAINT stripe_refund_reversal_ledger_identity_check
    CHECK (
      btrim(event_id) <> ''
      AND btrim(stripe_session_id) <> ''
      AND btrim(charge_id) <> ''
      AND btrim(payment_intent_id) <> ''
      AND btrim(refund_id) <> ''
    ),
  CONSTRAINT stripe_refund_reversal_ledger_outcome_check
    CHECK (outcome IN ('reversed', 'stale')),
  CONSTRAINT stripe_refund_reversal_ledger_intent_state_check
    CHECK (intent_state IS NULL OR intent_state IN ('provider_failed', 'provider_canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_refund_intent_one_active_per_report
  ON public.admin_refund_intent (report_id)
  WHERE state IN ('reserved', 'provider_pending', 'provider_applied');

ALTER TABLE public.stripe_refund_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_event_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_accounting_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_accounting_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.referral_refund_point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_refund_point_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refund_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refund_intent FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refund_point_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refund_point_hold FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_reversal_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_reversal_ledger FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_refund_event_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_refund_event_ledger FROM anon;
REVOKE ALL ON TABLE public.stripe_refund_event_ledger FROM authenticated;
REVOKE ALL ON TABLE public.stripe_refund_event_ledger FROM service_role;
REVOKE ALL ON TABLE public.stripe_refund_accounting_state FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_refund_accounting_state FROM anon;
REVOKE ALL ON TABLE public.stripe_refund_accounting_state FROM authenticated;
REVOKE ALL ON TABLE public.stripe_refund_accounting_state FROM service_role;
REVOKE ALL ON TABLE public.referral_refund_point_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.referral_refund_point_ledger FROM anon;
REVOKE ALL ON TABLE public.referral_refund_point_ledger FROM authenticated;
REVOKE ALL ON TABLE public.referral_refund_point_ledger FROM service_role;
REVOKE ALL ON TABLE public.admin_refund_intent FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_refund_intent FROM anon;
REVOKE ALL ON TABLE public.admin_refund_intent FROM authenticated;
REVOKE ALL ON TABLE public.admin_refund_intent FROM service_role;
REVOKE ALL ON TABLE public.admin_refund_point_hold FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_refund_point_hold FROM anon;
REVOKE ALL ON TABLE public.admin_refund_point_hold FROM authenticated;
REVOKE ALL ON TABLE public.admin_refund_point_hold FROM service_role;
REVOKE ALL ON TABLE public.stripe_refund_reversal_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_refund_reversal_ledger FROM anon;
REVOKE ALL ON TABLE public.stripe_refund_reversal_ledger FROM authenticated;
REVOKE ALL ON TABLE public.stripe_refund_reversal_ledger FROM service_role;

CREATE OR REPLACE FUNCTION public.reserve_admin_refund_intent(
  p_report_id uuid,
  p_request_id text,
  p_payload_sha256 text,
  p_requested_amount_cents bigint,
  p_reason text,
  p_stripe_session_id text,
  p_payment_intent_id text
)
RETURNS TABLE (
  outcome text,
  state text,
  request_id text,
  payload_sha256 text,
  requested_amount_cents bigint,
  reason text,
  stripe_refund_id text,
  stripe_charge_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $reserve_admin_refund_intent$
DECLARE
  v_existing public.admin_refund_intent%ROWTYPE;
  v_report_amount_cents bigint;
  v_previous_refunded_cents bigint;
  v_report_session_id text;
  v_customer_email text;
  v_referral_id uuid;
  v_referrer_user_id uuid;
  v_referral_status text;
  v_referrer_points_awarded integer;
  v_source_transaction_id uuid;
  v_source_points integer;
  v_points_row_id uuid;
  v_available_points integer;
  v_total_earned integer;
  v_updated_rows integer;
BEGIN
  IF p_report_id IS NULL
    OR p_request_id IS NULL
    OR p_request_id !~ '^[A-Za-z0-9_-]{8,64}$'
    OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^[0-9a-f]{64}$'
    OR p_requested_amount_cents IS NULL
    OR p_requested_amount_cents <= 0
    OR p_reason NOT IN ('duplicate', 'fraudulent', 'requested_by_customer')
    OR p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = ''
    OR p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid admin refund intent input';
  END IF;

  SELECT
    round(report.amount_usd * 100)::bigint,
    round(COALESCE(report.refunded_amount_usd, 0) * 100)::bigint,
    report.stripe_session_id,
    report.customer_email
  INTO STRICT
    v_report_amount_cents,
    v_previous_refunded_cents,
    v_report_session_id,
    v_customer_email
  FROM public.paid_reports AS report
  WHERE report.id = p_report_id
  FOR UPDATE OF report;

  SELECT intent.*
  INTO v_existing
  FROM public.admin_refund_intent AS intent
  WHERE intent.report_id = p_report_id
    AND intent.request_id = p_request_id
  FOR UPDATE OF intent;

  IF FOUND THEN
    IF v_existing.payload_sha256 IS DISTINCT FROM p_payload_sha256
      OR v_existing.requested_amount_cents IS DISTINCT FROM p_requested_amount_cents
      OR v_existing.reason IS DISTINCT FROM p_reason
      OR v_existing.stripe_session_id IS DISTINCT FROM p_stripe_session_id
      OR v_existing.payment_intent_id IS DISTINCT FROM p_payment_intent_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'admin refund request id conflicts with immutable payload';
    END IF;

    RETURN QUERY SELECT
      'existing'::text,
      v_existing.state,
      v_existing.request_id,
      v_existing.payload_sha256,
      v_existing.requested_amount_cents,
      v_existing.reason,
      v_existing.stripe_refund_id,
      v_existing.stripe_charge_id;
    RETURN;
  END IF;

  IF v_report_session_id IS DISTINCT FROM p_stripe_session_id
    OR v_report_amount_cents <= 0
    OR v_previous_refunded_cents < 0
    OR v_previous_refunded_cents >= v_report_amount_cents
    OR p_requested_amount_cents > v_report_amount_cents - v_previous_refunded_cents
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'admin refund intent exceeds canonical refundable balance';
  END IF;

  -- A refund that would become full must be able to claw back the entire
  -- referral award. Spent credits are a manual-settlement HOLD, never a
  -- silently forgiven zero clawback.
  IF v_previous_refunded_cents + p_requested_amount_cents = v_report_amount_cents
    AND v_customer_email IS NOT NULL
    AND btrim(v_customer_email) <> ''
  THEN
    BEGIN
      SELECT
        referral.id,
        referral.referrer_user_id,
        referral.status,
        referral.referrer_points_awarded
      INTO STRICT
        v_referral_id,
        v_referrer_user_id,
        v_referral_status,
        v_referrer_points_awarded
      FROM public.referrals AS referral
      LEFT JOIN auth.users AS referred_user
        ON referred_user.id = referral.referred_user_id
      WHERE lower(btrim(referral.referred_email)) = lower(btrim(v_customer_email))
         OR lower(btrim(referred_user.email)) = lower(btrim(v_customer_email))
      FOR UPDATE OF referral;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_referral_id := NULL;
        v_referrer_user_id := NULL;
        v_referrer_points_awarded := 0;
      WHEN TOO_MANY_ROWS THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'admin refund customer maps to ambiguous referrals';
    END;

    IF v_referral_id IS NOT NULL AND (
      v_referrer_points_awarded IS NULL
      OR v_referrer_points_awarded < 0
      OR v_referral_status IS NULL
      OR v_referral_status NOT IN ('purchased', 'refunded')
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'admin refund referral award state is invalid';
    END IF;

    IF v_referrer_user_id IS NOT NULL AND v_referrer_points_awarded > 0 THEN
      BEGIN
        SELECT source_tx.id, source_tx.amount
        INTO STRICT v_source_transaction_id, v_source_points
        FROM public.point_transactions AS source_tx
        WHERE source_tx.user_id = v_referrer_user_id
          AND source_tx.type = 'earn_referral'
          AND source_tx.reference_id = p_stripe_session_id
        FOR SHARE OF source_tx;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'admin refund source point transaction is missing';
        WHEN TOO_MANY_ROWS THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'admin refund source point transaction is ambiguous';
      END;

      SELECT points.id, points.balance, points.total_earned
      INTO STRICT v_points_row_id, v_available_points, v_total_earned
      FROM public.user_points AS points
      WHERE points.user_id = v_referrer_user_id
      FOR UPDATE OF points;

      IF v_source_points IS NULL
        OR v_source_points <= 0
        OR v_source_points <> v_referrer_points_awarded
        OR v_available_points IS NULL
        OR v_total_earned IS NULL
        OR v_total_earned < v_source_points
        OR v_available_points < v_source_points
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'admin refund referral credits require manual settlement';
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.admin_refund_intent (
      report_id,
      request_id,
      payload_sha256,
      requested_amount_cents,
      reason,
      stripe_session_id,
      payment_intent_id,
      state
    ) VALUES (
      p_report_id,
      p_request_id,
      p_payload_sha256,
      p_requested_amount_cents,
      p_reason,
      p_stripe_session_id,
      p_payment_intent_id,
      'reserved'
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'another admin refund intent is awaiting reconciliation';
  END;

  -- A full-refund request escrows the referral award before any provider
  -- mutation. Moving it out of spendable balance closes every checkout path,
  -- including legacy ones that only read user_points.balance.
  IF v_source_transaction_id IS NOT NULL THEN
    UPDATE public.user_points
    SET
      balance = v_available_points - v_source_points,
      updated_at = now()
    WHERE id = v_points_row_id
      AND balance = v_available_points
      AND total_earned = v_total_earned;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'admin refund point escrow could not be reserved';
    END IF;

    INSERT INTO public.admin_refund_point_hold (
      report_id,
      request_id,
      referral_id,
      referrer_user_id,
      source_point_transaction_id,
      held_points,
      balance_before,
      balance_after
    ) VALUES (
      p_report_id,
      p_request_id,
      v_referral_id,
      v_referrer_user_id,
      v_source_transaction_id,
      v_source_points,
      v_available_points,
      v_available_points - v_source_points
    );
  END IF;

  RETURN QUERY SELECT
    'created'::text,
    'reserved'::text,
    p_request_id,
    p_payload_sha256,
    p_requested_amount_cents,
    p_reason,
    NULL::text,
    NULL::text;
END
$reserve_admin_refund_intent$;

CREATE OR REPLACE FUNCTION public.start_admin_refund_provider_attempt(
  p_report_id uuid,
  p_request_id text,
  p_payload_sha256 text
)
RETURNS TABLE (
  outcome text,
  state text,
  request_id text,
  payload_sha256 text,
  requested_amount_cents bigint,
  reason text,
  stripe_refund_id text,
  stripe_charge_id text,
  provider_attempted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $start_admin_refund_provider_attempt$
DECLARE
  v_intent public.admin_refund_intent%ROWTYPE;
  v_outcome text := 'existing';
BEGIN
  SELECT intent.*
  INTO STRICT v_intent
  FROM public.admin_refund_intent AS intent
  WHERE intent.report_id = p_report_id
    AND intent.request_id = p_request_id
  FOR UPDATE OF intent;

  IF v_intent.payload_sha256 IS DISTINCT FROM p_payload_sha256
    OR v_intent.state NOT IN (
      'reserved',
      'provider_pending',
      'provider_applied',
      'reconciled',
      'provider_failed',
      'provider_canceled'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'admin refund provider attempt conflicts with durable intent';
  END IF;

  IF v_intent.state = 'reserved' THEN
    UPDATE public.admin_refund_intent AS intent
    SET
      state = 'provider_pending',
      provider_attempted_at = now(),
      updated_at = now()
    WHERE intent.report_id = p_report_id
      AND intent.request_id = p_request_id
      AND intent.state = 'reserved'
    RETURNING intent.* INTO STRICT v_intent;
    v_outcome := 'started';
  END IF;

  RETURN QUERY SELECT
    v_outcome,
    v_intent.state,
    v_intent.request_id,
    v_intent.payload_sha256,
    v_intent.requested_amount_cents,
    v_intent.reason,
    v_intent.stripe_refund_id,
    v_intent.stripe_charge_id,
    v_intent.provider_attempted_at;
END
$start_admin_refund_provider_attempt$;

CREATE OR REPLACE FUNCTION public.bind_admin_refund_intent_provider_result(
  p_report_id uuid,
  p_request_id text,
  p_payload_sha256 text,
  p_refund_id text,
  p_charge_id text,
  p_refund_amount_cents bigint
)
RETURNS TABLE (
  state text,
  request_id text,
  payload_sha256 text,
  requested_amount_cents bigint,
  reason text,
  stripe_refund_id text,
  stripe_charge_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $bind_admin_refund_intent_provider_result$
DECLARE
  v_intent public.admin_refund_intent%ROWTYPE;
BEGIN
  SELECT intent.*
  INTO STRICT v_intent
  FROM public.admin_refund_intent AS intent
  WHERE intent.report_id = p_report_id
    AND intent.request_id = p_request_id
  FOR UPDATE OF intent;

  IF v_intent.payload_sha256 IS DISTINCT FROM p_payload_sha256
    OR p_refund_id IS NULL OR btrim(p_refund_id) = ''
    OR p_charge_id IS NULL OR btrim(p_charge_id) = ''
    OR p_refund_amount_cents IS DISTINCT FROM v_intent.requested_amount_cents
    OR v_intent.state NOT IN ('provider_pending', 'provider_applied', 'reconciled')
    OR (
      v_intent.state IN ('provider_applied', 'reconciled')
      AND (
        v_intent.stripe_refund_id IS DISTINCT FROM p_refund_id
        OR v_intent.stripe_charge_id IS DISTINCT FROM p_charge_id
        OR v_intent.stripe_refund_amount_cents IS DISTINCT FROM p_refund_amount_cents
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'admin refund provider result conflicts with durable intent';
  END IF;

  IF v_intent.state = 'provider_pending' THEN
    UPDATE public.admin_refund_intent AS intent
    SET
      stripe_refund_id = p_refund_id,
      stripe_charge_id = p_charge_id,
      stripe_refund_amount_cents = p_refund_amount_cents,
      state = 'provider_applied',
      updated_at = now()
    WHERE intent.report_id = p_report_id
      AND intent.request_id = p_request_id
      AND intent.state = 'provider_pending'
    RETURNING intent.* INTO STRICT v_intent;
  END IF;

  RETURN QUERY SELECT
    v_intent.state,
    v_intent.request_id,
    v_intent.payload_sha256,
    v_intent.requested_amount_cents,
    v_intent.reason,
    v_intent.stripe_refund_id,
    v_intent.stripe_charge_id;
END
$bind_admin_refund_intent_provider_result$;

CREATE OR REPLACE FUNCTION public.complete_admin_refund_intent(
  p_report_id uuid,
  p_request_id text,
  p_payload_sha256 text,
  p_refund_id text,
  p_cumulative_refunded_cents bigint
)
RETURNS TABLE (
  state text,
  request_id text,
  payload_sha256 text,
  requested_amount_cents bigint,
  reason text,
  stripe_refund_id text,
  stripe_charge_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $complete_admin_refund_intent$
DECLARE
  v_intent public.admin_refund_intent%ROWTYPE;
BEGIN
  SELECT intent.*
  INTO STRICT v_intent
  FROM public.admin_refund_intent AS intent
  WHERE intent.report_id = p_report_id
    AND intent.request_id = p_request_id
  FOR UPDATE OF intent;

  IF v_intent.payload_sha256 IS DISTINCT FROM p_payload_sha256
    OR v_intent.stripe_refund_id IS DISTINCT FROM p_refund_id
    OR v_intent.state NOT IN ('provider_applied', 'reconciled')
    OR p_cumulative_refunded_cents IS NULL
    OR p_cumulative_refunded_cents < v_intent.requested_amount_cents
    OR (
      v_intent.state = 'reconciled'
      AND v_intent.cumulative_refunded_cents IS DISTINCT FROM p_cumulative_refunded_cents
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'admin refund completion conflicts with durable intent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stripe_refund_event_ledger AS event_ledger
    WHERE event_ledger.event_id = format(
        'admin_refund:%s:%s',
        p_report_id,
        p_request_id
      )
      AND event_ledger.report_id = p_report_id
      AND event_ledger.refund_id = p_refund_id
      AND event_ledger.effective_amount_refunded_cents = p_cumulative_refunded_cents
      AND event_ledger.outcome IN ('applied', 'stale')
      AND event_ledger.reconciled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'admin refund intent has no matching canonical reconciliation';
  END IF;

  IF v_intent.state = 'provider_applied' THEN
    UPDATE public.admin_refund_intent AS intent
    SET
      cumulative_refunded_cents = p_cumulative_refunded_cents,
      state = 'reconciled',
      reconciled_at = now(),
      updated_at = now()
    WHERE intent.report_id = p_report_id
      AND intent.request_id = p_request_id
      AND intent.state = 'provider_applied'
    RETURNING intent.* INTO STRICT v_intent;
  END IF;

  RETURN QUERY SELECT
    v_intent.state,
    v_intent.request_id,
    v_intent.payload_sha256,
    v_intent.requested_amount_cents,
    v_intent.reason,
    v_intent.stripe_refund_id,
    v_intent.stripe_charge_id;
END
$complete_admin_refund_intent$;

CREATE OR REPLACE FUNCTION public.reconcile_stripe_refund_event(
  p_event_id text,
  p_event_type text,
  p_stripe_session_id text,
  p_charge_id text,
  p_payment_intent_id text,
  p_refund_id text,
  p_refunded_amount_cents bigint,
  p_reason text
)
RETURNS TABLE (
  outcome text,
  refunded_amount_cents bigint,
  is_full_refund boolean,
  points_clawed_back integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $reconcile_stripe_refund_event$
DECLARE
  v_inserted_event_id text;
  v_existing_event public.stripe_refund_event_ledger%ROWTYPE;
  v_report_id uuid;
  v_report_amount_usd numeric;
  v_report_refunded_usd numeric;
  v_report_refunded_at timestamptz;
  v_report_refund_reason text;
  v_report_refund_id text;
  v_report_status text;
  v_customer_email text;
  v_existing_refunded_cents bigint;
  v_effective_refunded_cents bigint;
  v_is_full_refund boolean;
  v_outcome text;
  v_revenue_log_id uuid;
  v_revenue_refunded_usd numeric;
  v_accounting public.stripe_refund_accounting_state%ROWTYPE;
  v_expense_log_id uuid;
  v_expense_amount_usd numeric;
  v_referral_id uuid;
  v_referrer_user_id uuid;
  v_referral_status text;
  v_referrer_points_awarded integer;
  v_referral_ledger public.referral_refund_point_ledger%ROWTYPE;
  v_point_hold public.admin_refund_point_hold%ROWTYPE;
  v_source_transaction_id uuid;
  v_source_points integer;
  v_points_row_id uuid;
  v_balance_before integer;
  v_total_earned_before integer;
  v_balance_after integer;
  v_total_earned_after integer;
  v_points_clawed_back integer := 0;
  v_clawback_transaction_id uuid;
  v_release_transaction_id uuid;
  v_legacy_clawback_points integer;
  v_legacy_balance_after integer;
  v_updated_rows integer;
BEGIN
  IF p_event_type NOT IN ('charge.refunded', 'refund.created', 'refund.updated')
    OR p_event_id IS NULL OR btrim(p_event_id) = ''
    OR p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = ''
    OR p_charge_id IS NULL OR btrim(p_charge_id) = ''
    OR p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = ''
    OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents <= 0
    OR p_reason IS NULL
    OR p_reason NOT IN (
      'charge.refunded',
      'refund.created',
      'refund.updated',
      'duplicate',
      'fraudulent',
      'requested_by_customer',
      'expired_uncaptured_charge'
    )
    OR (p_event_type = 'charge.refunded' AND p_refund_id IS NOT NULL)
    OR (
      p_event_type IN ('refund.created', 'refund.updated')
      AND (p_refund_id IS NULL OR btrim(p_refund_id) = '')
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid refund reconciliation input';
  END IF;

  INSERT INTO public.stripe_refund_event_ledger (
    event_id,
    event_type,
    stripe_session_id,
    charge_id,
    payment_intent_id,
    refund_id,
    canonical_amount_refunded_cents,
    reason,
    outcome
  )
  VALUES (
    p_event_id,
    p_event_type,
    p_stripe_session_id,
    p_charge_id,
    p_payment_intent_id,
    p_refund_id,
    p_refunded_amount_cents,
    p_reason,
    'pending'
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO v_inserted_event_id;

  IF v_inserted_event_id IS NULL THEN
    SELECT ledger.*
    INTO STRICT v_existing_event
    FROM public.stripe_refund_event_ledger AS ledger
    WHERE ledger.event_id = p_event_id;

    IF v_existing_event.event_type IS DISTINCT FROM p_event_type
      OR v_existing_event.stripe_session_id IS DISTINCT FROM p_stripe_session_id
      OR v_existing_event.charge_id IS DISTINCT FROM p_charge_id
      OR v_existing_event.payment_intent_id IS DISTINCT FROM p_payment_intent_id
      OR v_existing_event.refund_id IS DISTINCT FROM p_refund_id
      -- The route retrieves a fresh Charge for every delivery. After a later
      -- partial refund, redelivery of this same older event legitimately sees
      -- a higher Charge.amount_refunded. A lower value is the unsafe conflict.
      OR v_existing_event.canonical_amount_refunded_cents > p_refunded_amount_cents
      OR v_existing_event.reason IS DISTINCT FROM p_reason
      OR v_existing_event.outcome = 'pending'
      OR v_existing_event.effective_amount_refunded_cents <= 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund event id was reused with conflicting or incomplete state';
    END IF;

    RETURN QUERY SELECT
      'already'::text,
      v_existing_event.effective_amount_refunded_cents,
      v_existing_event.is_full_refund,
      v_existing_event.points_clawed_back;
    RETURN;
  END IF;

  SELECT
    report.id,
    report.amount_usd,
    report.refunded_amount_usd,
    report.refunded_at,
    report.refund_reason,
    report.stripe_refund_id,
    report.status,
    report.customer_email
  INTO STRICT
    v_report_id,
    v_report_amount_usd,
    v_report_refunded_usd,
    v_report_refunded_at,
    v_report_refund_reason,
    v_report_refund_id,
    v_report_status,
    v_customer_email
  FROM public.paid_reports AS report
  WHERE report.stripe_session_id = p_stripe_session_id
  FOR UPDATE OF report;

  IF v_report_amount_usd IS NULL OR v_report_amount_usd <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund report amount is unavailable';
  END IF;

  v_existing_refunded_cents := round(COALESCE(v_report_refunded_usd, 0) * 100)::bigint;
  IF v_existing_refunded_cents < 0
    OR v_existing_refunded_cents > round(v_report_amount_usd * 100)::bigint
    OR p_refunded_amount_cents > round(v_report_amount_usd * 100)::bigint
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund cumulative amount conflicts with report total';
  END IF;

  IF v_existing_refunded_cents >= p_refunded_amount_cents THEN
    v_outcome := 'stale';
    v_effective_refunded_cents := v_existing_refunded_cents;
  ELSE
    v_outcome := 'applied';
    v_effective_refunded_cents := p_refunded_amount_cents;

    UPDATE public.paid_reports
    SET
      refunded_at = COALESCE(refunded_at, now()),
      refunded_amount_usd = p_refunded_amount_cents::numeric / 100,
      refund_reason = p_reason,
      stripe_refund_id = COALESCE(p_refund_id, stripe_refund_id),
      status = CASE
        WHEN p_refunded_amount_cents >= round(v_report_amount_usd * 100)::bigint
          THEN 'refunded'
        ELSE status
      END
    WHERE id = v_report_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund report update affected an unexpected row count';
    END IF;
  END IF;

  v_is_full_refund := v_effective_refunded_cents >= round(v_report_amount_usd * 100)::bigint;

  IF NOT v_is_full_refund AND v_report_status = 'refunded' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'partial refund conflicts with refunded report status';
  END IF;

  UPDATE public.paid_reports
  SET
    refunded_at = COALESCE(refunded_at, now()),
    refund_reason = COALESCE(refund_reason, p_reason),
    stripe_refund_id = COALESCE(stripe_refund_id, p_refund_id),
    status = CASE WHEN v_is_full_refund THEN 'refunded' ELSE status END
  WHERE id = v_report_id;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund report repair affected an unexpected row count';
  END IF;

  SELECT revenue.id, revenue.refunded_amount_usd
  INTO STRICT v_revenue_log_id, v_revenue_refunded_usd
  FROM public.revenue_log AS revenue
  WHERE revenue.stripe_session_id = p_stripe_session_id
  FOR UPDATE OF revenue;

  IF round(COALESCE(v_revenue_refunded_usd, 0) * 100)::bigint > v_effective_refunded_cents THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'revenue refund state exceeds canonical cumulative amount';
  END IF;

  SELECT accounting.*
  INTO v_accounting
  FROM public.stripe_refund_accounting_state AS accounting
  WHERE accounting.report_id = v_report_id
  FOR UPDATE OF accounting;

  IF FOUND THEN
    IF v_accounting.revenue_log_id IS DISTINCT FROM v_revenue_log_id
      OR v_accounting.canonical_amount_refunded_cents > v_effective_refunded_cents
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund accounting state conflicts with canonical identities';
    END IF;
    v_expense_log_id := v_accounting.expense_log_id;
  ELSE
    BEGIN
      SELECT expense.id, expense.amount_usd
      INTO STRICT v_expense_log_id, v_expense_amount_usd
      FROM public.expense_log AS expense
      WHERE expense.report_id = v_report_id
        AND expense.category = 'refund'
      FOR UPDATE OF expense;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        INSERT INTO public.expense_log (
          category,
          subcategory,
          report_id,
          amount_usd,
          description,
          source,
          created_by,
          metadata,
          occurred_at
        )
        VALUES (
          'refund',
          'stripe_refund',
          v_report_id,
          v_effective_refunded_cents::numeric / 100,
          'Stripe refund reconciliation',
          'webhook',
          'system',
          jsonb_build_object('reconciliation', 'stripe_refund_event'),
          now()
        )
        RETURNING id, amount_usd INTO v_expense_log_id, v_expense_amount_usd;
      WHEN TOO_MANY_ROWS THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund expense state is ambiguous';
    END;

    IF round(COALESCE(v_expense_amount_usd, 0) * 100)::bigint > v_effective_refunded_cents THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund expense state exceeds canonical cumulative amount';
    END IF;

    INSERT INTO public.stripe_refund_accounting_state (
      report_id,
      revenue_log_id,
      expense_log_id,
      canonical_amount_refunded_cents,
      pre_refund_report_status,
      pre_refund_at,
      pre_refund_reason,
      pre_refund_id
    ) VALUES (
      v_report_id,
      v_revenue_log_id,
      v_expense_log_id,
      v_effective_refunded_cents,
      CASE
        WHEN v_existing_refunded_cents = 0 AND v_report_status <> 'refunded'
          THEN v_report_status
        ELSE NULL
      END,
      CASE WHEN v_existing_refunded_cents = 0 THEN v_report_refunded_at ELSE NULL END,
      CASE WHEN v_existing_refunded_cents = 0 THEN v_report_refund_reason ELSE NULL END,
      CASE WHEN v_existing_refunded_cents = 0 THEN v_report_refund_id ELSE NULL END
    );
  END IF;

  UPDATE public.revenue_log
  SET
    refunded_amount_usd = v_effective_refunded_cents::numeric / 100,
    refunded_at = COALESCE(refunded_at, now())
  WHERE id = v_revenue_log_id;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund revenue update affected an unexpected row count';
  END IF;

  UPDATE public.expense_log
  SET amount_usd = v_effective_refunded_cents::numeric / 100
  WHERE id = v_expense_log_id
    AND report_id = v_report_id
    AND category = 'refund';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund expense update affected an unexpected row count';
  END IF;

  UPDATE public.stripe_refund_accounting_state
  SET
    canonical_amount_refunded_cents = v_effective_refunded_cents,
    updated_at = now()
  WHERE report_id = v_report_id;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund accounting update affected an unexpected row count';
  END IF;

  SELECT point_hold.*
  INTO v_point_hold
  FROM public.admin_refund_point_hold AS point_hold
  WHERE point_hold.report_id = v_report_id
    AND point_hold.state = 'held'
  FOR UPDATE OF point_hold;

  IF NOT v_is_full_refund AND v_point_hold.report_id IS NOT NULL THEN
    SELECT up.id, up.balance, up.total_earned
    INTO STRICT v_points_row_id, v_balance_before, v_total_earned_before
    FROM public.user_points AS up
    WHERE up.user_id = v_point_hold.referrer_user_id
    FOR UPDATE OF up;

    IF v_balance_before IS NULL
      OR v_total_earned_before IS NULL
      OR v_balance_before < 0
      OR v_total_earned_before < v_point_hold.held_points
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund point escrow release state is invalid';
    END IF;

    v_balance_after := v_balance_before + v_point_hold.held_points;
    UPDATE public.user_points
    SET balance = v_balance_after, updated_at = now()
    WHERE id = v_points_row_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund point escrow release affected an unexpected row count';
    END IF;

    INSERT INTO public.point_transactions (
      user_id,
      type,
      amount,
      balance_after,
      description,
      reference_id
    ) VALUES (
      v_point_hold.referrer_user_id,
      'refund_hold_release',
      v_point_hold.held_points,
      v_balance_after,
      'Refund referral reward hold released after partial settlement',
      format('refund-hold-release:%s:%s', v_report_id, v_point_hold.request_id)
    ) RETURNING id INTO v_release_transaction_id;

    UPDATE public.admin_refund_point_hold
    SET
      state = 'released',
      terminal_event_id = p_event_id,
      released_at = now(),
      updated_at = now()
    WHERE report_id = v_point_hold.report_id
      AND request_id = v_point_hold.request_id
      AND state = 'held';
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund point escrow release ledger affected an unexpected row count';
    END IF;
  END IF;

  IF v_is_full_refund THEN
    IF v_customer_email IS NOT NULL AND btrim(v_customer_email) <> '' THEN
      BEGIN
        SELECT
          referral.id,
          referral.referrer_user_id,
          referral.status,
          referral.referrer_points_awarded
        INTO STRICT
          v_referral_id,
          v_referrer_user_id,
          v_referral_status,
          v_referrer_points_awarded
        FROM public.referrals AS referral
        LEFT JOIN auth.users AS referred_user
          ON referred_user.id = referral.referred_user_id
        WHERE lower(btrim(referral.referred_email)) = lower(btrim(v_customer_email))
           OR lower(btrim(referred_user.email)) = lower(btrim(v_customer_email))
        FOR UPDATE OF referral;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          v_referral_id := NULL;
        WHEN TOO_MANY_ROWS THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'refund customer maps to ambiguous referrals';
      END;
    END IF;

    IF v_referral_id IS NOT NULL THEN
      IF v_referrer_points_awarded IS NULL OR v_referrer_points_awarded < 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund referral award is invalid';
      END IF;

      SELECT ledger.*
      INTO v_referral_ledger
      FROM public.referral_refund_point_ledger AS ledger
      WHERE ledger.report_id = v_report_id;

      IF FOUND THEN
        IF v_referral_ledger.referral_id IS DISTINCT FROM v_referral_id
          OR v_referral_ledger.canonical_refunded_cents IS DISTINCT FROM v_effective_refunded_cents
        THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'refund referral ledger conflicts with canonical identities';
        END IF;

        -- A terminal provider failure restores the original referral award and
        -- closes that immutable request. A later explicit request may succeed,
        -- so convert its new escrow into a new clawback instead of treating the
        -- historical ledger row as proof that points are still removed.
        IF v_referral_ledger.reversed_at IS NOT NULL THEN
          IF v_referral_ledger.points_restored IS DISTINCT FROM v_referral_ledger.points_clawed_back
            OR v_referral_ledger.points_awarded IS DISTINCT FROM v_referrer_points_awarded
            OR v_referral_ledger.points_clawed_back IS DISTINCT FROM v_referrer_points_awarded
            OR v_referral_status IS DISTINCT FROM 'purchased'
          THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'restored refund referral ledger conflicts with current award state';
          END IF;

          v_source_transaction_id := v_referral_ledger.source_point_transaction_id;
          v_source_points := v_referral_ledger.points_awarded;
          v_points_clawed_back := v_referral_ledger.points_clawed_back;

          IF v_source_points > 0 THEN
            IF v_source_transaction_id IS NULL THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'restored refund source point transaction is missing';
            END IF;

            PERFORM 1
            FROM public.point_transactions AS source_tx
            WHERE source_tx.id = v_source_transaction_id
              AND source_tx.user_id = v_referrer_user_id
              AND source_tx.type = 'earn_referral'
              AND source_tx.reference_id = p_stripe_session_id
              AND source_tx.amount = v_source_points
            FOR SHARE OF source_tx;
            IF NOT FOUND THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'restored refund source point transaction conflicts with referral award';
            END IF;

            SELECT up.id, up.balance, up.total_earned
            INTO STRICT v_points_row_id, v_balance_before, v_total_earned_before
            FROM public.user_points AS up
            WHERE up.user_id = v_referrer_user_id
            FOR UPDATE OF up;

            IF v_balance_before IS NULL
              OR v_total_earned_before IS NULL
              OR v_balance_before < 0
              OR v_total_earned_before < v_source_points
            THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'restored refund points balance is invalid';
            END IF;

            v_total_earned_after := v_total_earned_before - v_source_points;
            IF v_point_hold.report_id IS NOT NULL THEN
              IF v_point_hold.referral_id IS DISTINCT FROM v_referral_id
                OR v_point_hold.referrer_user_id IS DISTINCT FROM v_referrer_user_id
                OR v_point_hold.source_point_transaction_id IS DISTINCT FROM v_source_transaction_id
                OR v_point_hold.held_points IS DISTINCT FROM v_source_points
              THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'restored refund point escrow conflicts with canonical referral award';
              END IF;
              -- Reservation already moved the award out of spendable balance.
              v_balance_after := v_balance_before;
            ELSE
              IF v_balance_before < v_source_points THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'restored refund referral credits require manual settlement';
              END IF;
              v_balance_after := v_balance_before - v_source_points;
            END IF;

            UPDATE public.user_points
            SET
              balance = v_balance_after,
              total_earned = v_total_earned_after,
              updated_at = now()
            WHERE id = v_points_row_id;
            GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
            IF v_updated_rows <> 1 THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'restored refund points update affected an unexpected row count';
            END IF;

            INSERT INTO public.point_transactions (
              user_id,
              type,
              amount,
              balance_after,
              description,
              reference_id
            ) VALUES (
              v_referrer_user_id,
              'refund_clawback',
              -v_points_clawed_back,
              v_balance_after,
              'Refunded referral reward clawback after terminal retry',
              format('refund-report:%s:event:%s', v_report_id, p_event_id)
            )
            RETURNING id INTO v_clawback_transaction_id;

            IF v_point_hold.report_id IS NOT NULL THEN
              UPDATE public.admin_refund_point_hold
              SET
                state = 'clawed_back',
                clawback_point_transaction_id = v_clawback_transaction_id,
                terminal_event_id = p_event_id,
                converted_at = now(),
                updated_at = now()
              WHERE report_id = v_point_hold.report_id
                AND request_id = v_point_hold.request_id
                AND state = 'held';
              GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
              IF v_updated_rows <> 1 THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'restored refund point escrow conversion affected an unexpected row count';
              END IF;
            END IF;
          ELSIF v_source_transaction_id IS NOT NULL THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'zero-point restored refund has a source transaction';
          END IF;

          UPDATE public.referrals
          SET status = 'refunded'
          WHERE id = v_referral_id
            AND status = 'purchased';
          GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
          IF v_updated_rows <> 1 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'restored refund referral update affected an unexpected row count';
          END IF;

          UPDATE public.referral_refund_point_ledger AS point_ledger
          SET
            clawback_point_transaction_id = v_clawback_transaction_id,
            canonical_refunded_cents = v_effective_refunded_cents,
            points_clawed_back = v_points_clawed_back,
            balance_before = v_balance_before,
            balance_after = v_balance_after,
            last_reversal_event_id = NULL,
            last_reversal_point_transaction_id = NULL,
            points_restored = 0,
            reversed_at = NULL
          WHERE point_ledger.report_id = v_report_id
            AND point_ledger.reversed_at IS NOT NULL
            AND point_ledger.points_restored = point_ledger.points_clawed_back;
          GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
          IF v_updated_rows <> 1 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'restored refund referral ledger update affected an unexpected row count';
          END IF;
        END IF;
      ELSE
        IF v_referral_status IS NULL OR v_referral_status NOT IN ('purchased', 'refunded') THEN
          IF v_referrer_points_awarded <> 0 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'refund referral status conflicts with awarded points';
          END IF;
        ELSE
          BEGIN
            SELECT source_tx.id, source_tx.amount
            INTO STRICT v_source_transaction_id, v_source_points
            FROM public.point_transactions AS source_tx
            WHERE source_tx.user_id = v_referrer_user_id
              AND source_tx.type = 'earn_referral'
              AND source_tx.reference_id = p_stripe_session_id
            FOR SHARE OF source_tx;
          EXCEPTION
            WHEN NO_DATA_FOUND THEN
              v_source_transaction_id := NULL;
              v_source_points := 0;
            WHEN TOO_MANY_ROWS THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'refund source point transaction is ambiguous';
          END;

          IF v_source_transaction_id IS NULL AND v_referrer_points_awarded > 0 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'refund source point transaction is missing';
          END IF;
          IF v_source_transaction_id IS NOT NULL
            AND (v_source_points <= 0 OR v_source_points <> v_referrer_points_awarded)
          THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'refund source point transaction conflicts with referral award';
          END IF;

          IF v_source_transaction_id IS NOT NULL AND v_referral_status = 'refunded' THEN
            IF v_report_refund_id IS NULL OR btrim(v_report_refund_id) = '' THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'legacy refund clawback identity is unavailable';
            END IF;

            BEGIN
              SELECT
                legacy_tx.id,
                -legacy_tx.amount,
                legacy_tx.balance_after
              INTO STRICT
                v_clawback_transaction_id,
                v_legacy_clawback_points,
                v_legacy_balance_after
              FROM public.point_transactions AS legacy_tx
              WHERE legacy_tx.user_id = v_referrer_user_id
                AND legacy_tx.type = 'refund_clawback'
                AND legacy_tx.reference_id = format('refund_%s', v_report_refund_id)
              FOR SHARE OF legacy_tx;
            EXCEPTION
              WHEN NO_DATA_FOUND THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'legacy refund clawback transaction is missing';
              WHEN TOO_MANY_ROWS THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'legacy refund clawback transaction is ambiguous';
            END;

            IF v_legacy_clawback_points <> v_source_points
              OR v_legacy_clawback_points <= 0
              OR v_legacy_balance_after < 0
            THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'legacy refund clawback transaction conflicts with referral award';
            END IF;

            -- The pre-ledger admin route already changed user_points. Adopt its
            -- immutable transaction marker instead of deducting a second time.
            v_points_clawed_back := v_legacy_clawback_points;
            v_balance_before := NULL;
            v_balance_after := v_legacy_balance_after;
          ELSIF v_source_transaction_id IS NOT NULL THEN
            SELECT up.id, up.balance, up.total_earned
            INTO STRICT v_points_row_id, v_balance_before, v_total_earned_before
            FROM public.user_points AS up
            WHERE up.user_id = v_referrer_user_id
            FOR UPDATE OF up;

            IF v_balance_before IS NULL
              OR v_total_earned_before IS NULL
              OR v_balance_before < 0
              OR v_total_earned_before < v_source_points
            THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'refund points balance is invalid';
            END IF;

            v_points_clawed_back := v_source_points;
            v_total_earned_after := v_total_earned_before - v_source_points;

            IF v_point_hold.report_id IS NOT NULL THEN
              IF v_point_hold.referral_id IS DISTINCT FROM v_referral_id
                OR v_point_hold.referrer_user_id IS DISTINCT FROM v_referrer_user_id
                OR v_point_hold.source_point_transaction_id IS DISTINCT FROM v_source_transaction_id
                OR v_point_hold.held_points IS DISTINCT FROM v_source_points
              THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'refund point escrow conflicts with canonical referral award';
              END IF;
              -- Spendable balance was already reduced at reservation time.
              v_balance_after := v_balance_before;
            ELSE
              IF v_balance_before < v_source_points THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'refund referral credits require manual settlement';
              END IF;
              v_balance_after := v_balance_before - v_source_points;
            END IF;

            UPDATE public.user_points
            SET
              balance = v_balance_after,
              total_earned = v_total_earned_after,
              updated_at = now()
            WHERE id = v_points_row_id;
            GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
            IF v_updated_rows <> 1 THEN
              RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'refund points update affected an unexpected row count';
            END IF;

            INSERT INTO public.point_transactions (
              user_id,
              type,
              amount,
              balance_after,
              description,
              reference_id
            ) VALUES (
              v_referrer_user_id,
              'refund_clawback',
              -v_points_clawed_back,
              v_balance_after,
              'Refunded referral reward clawback',
              format('refund-report:%s:event:%s', v_report_id, p_event_id)
            )
            RETURNING id INTO v_clawback_transaction_id;

            IF v_point_hold.report_id IS NOT NULL THEN
              UPDATE public.admin_refund_point_hold
              SET
                state = 'clawed_back',
                clawback_point_transaction_id = v_clawback_transaction_id,
                terminal_event_id = p_event_id,
                converted_at = now(),
                updated_at = now()
              WHERE report_id = v_point_hold.report_id
                AND request_id = v_point_hold.request_id
                AND state = 'held';
              GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
              IF v_updated_rows <> 1 THEN
                RAISE EXCEPTION USING
                  ERRCODE = 'P0001',
                  MESSAGE = 'refund point escrow conversion affected an unexpected row count';
              END IF;
            END IF;
          END IF;

          UPDATE public.referrals
          SET status = 'refunded'
          WHERE id = v_referral_id
            AND status IN ('purchased', 'refunded');
          GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
          IF v_updated_rows <> 1 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0001',
              MESSAGE = 'refund referral update affected an unexpected row count';
          END IF;

          INSERT INTO public.referral_refund_point_ledger (
            report_id,
            first_event_id,
            referral_id,
            source_point_transaction_id,
            clawback_point_transaction_id,
            canonical_refunded_cents,
            points_awarded,
            points_clawed_back,
            balance_before,
            balance_after
          ) VALUES (
            v_report_id,
            p_event_id,
            v_referral_id,
            v_source_transaction_id,
            v_clawback_transaction_id,
            v_effective_refunded_cents,
            COALESCE(v_source_points, 0),
            v_points_clawed_back,
            v_balance_before,
            v_balance_after
          );
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_full_refund AND v_points_clawed_back <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'partial refund attempted referral point clawback';
  END IF;

  UPDATE public.stripe_refund_event_ledger AS event_ledger
  SET
    report_id = v_report_id,
    effective_amount_refunded_cents = v_effective_refunded_cents,
    outcome = v_outcome,
    is_full_refund = v_is_full_refund,
    points_clawed_back = v_points_clawed_back,
    reconciled_at = now()
  WHERE event_ledger.event_id = p_event_id
    AND event_ledger.outcome = 'pending';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund event ledger update affected an unexpected row count';
  END IF;

  RETURN QUERY SELECT
    v_outcome,
    v_effective_refunded_cents,
    v_is_full_refund,
    v_points_clawed_back;
END
$reconcile_stripe_refund_event$;

CREATE OR REPLACE FUNCTION public.reverse_stripe_refund_event(
  p_event_id text,
  p_event_type text,
  p_stripe_session_id text,
  p_charge_id text,
  p_payment_intent_id text,
  p_refund_id text,
  p_refund_status text,
  p_refund_amount_cents bigint,
  p_refunded_amount_cents bigint,
  p_failure_reason text,
  p_admin_request_id text DEFAULT NULL,
  p_admin_payload_sha256 text DEFAULT NULL
)
RETURNS TABLE (
  outcome text,
  refunded_amount_cents bigint,
  is_full_refund boolean,
  points_restored integer,
  intent_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $reverse_stripe_refund_event$
DECLARE
  v_existing public.stripe_refund_reversal_ledger%ROWTYPE;
  v_report_id uuid;
  v_report_amount_usd numeric;
  v_report_refunded_usd numeric;
  v_report_refunded_at timestamptz;
  v_report_refund_reason text;
  v_report_refund_id text;
  v_report_status text;
  v_report_amount_cents bigint;
  v_previous_refunded_cents bigint;
  v_outcome text;
  v_is_full_refund boolean;
  v_revenue_log_id uuid;
  v_accounting public.stripe_refund_accounting_state%ROWTYPE;
  v_expense_log_id uuid;
  v_point_hold public.admin_refund_point_hold%ROWTYPE;
  v_referral_ledger public.referral_refund_point_ledger%ROWTYPE;
  v_referrer_user_id uuid;
  v_referral_status text;
  v_points_row_id uuid;
  v_balance_before integer;
  v_total_earned_before integer;
  v_balance_after integer;
  v_restore_points integer;
  v_restore_transaction_id uuid;
  v_points_restored integer := 0;
  v_intent public.admin_refund_intent%ROWTYPE;
  v_intent_state text;
  v_updated_rows integer;
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = ''
    OR p_event_type NOT IN ('refund.failed', 'refund.updated')
    OR p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = ''
    OR p_charge_id IS NULL OR btrim(p_charge_id) = ''
    OR p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = ''
    OR p_refund_id IS NULL OR btrim(p_refund_id) = ''
    OR p_refund_status NOT IN ('failed', 'canceled')
    OR p_refund_amount_cents IS NULL OR p_refund_amount_cents <= 0
    OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents < 0
    OR p_failure_reason IS NULL OR btrim(p_failure_reason) = ''
    OR ((p_admin_request_id IS NULL) <> (p_admin_payload_sha256 IS NULL))
    OR (
      p_admin_request_id IS NOT NULL
      AND p_admin_request_id !~ '^[A-Za-z0-9_-]{8,64}$'
    )
    OR (
      p_admin_payload_sha256 IS NOT NULL
      AND p_admin_payload_sha256 !~ '^[0-9a-f]{64}$'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid refund reversal input';
  END IF;

  -- Serialize one Stripe event before inspecting the append-only final ledger.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id, 0));

  SELECT reversal.*
  INTO v_existing
  FROM public.stripe_refund_reversal_ledger AS reversal
  WHERE reversal.event_id = p_event_id;

  IF FOUND THEN
    IF v_existing.event_type IS DISTINCT FROM p_event_type
      OR v_existing.stripe_session_id IS DISTINCT FROM p_stripe_session_id
      OR v_existing.charge_id IS DISTINCT FROM p_charge_id
      OR v_existing.payment_intent_id IS DISTINCT FROM p_payment_intent_id
      OR v_existing.refund_id IS DISTINCT FROM p_refund_id
      OR v_existing.refund_status IS DISTINCT FROM p_refund_status
      OR v_existing.refund_amount_cents IS DISTINCT FROM p_refund_amount_cents
      OR v_existing.canonical_amount_refunded_cents IS DISTINCT FROM p_refunded_amount_cents
      OR v_existing.failure_reason IS DISTINCT FROM p_failure_reason
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal event id conflicts with immutable Stripe truth';
    END IF;

    RETURN QUERY SELECT
      'already'::text,
      v_existing.effective_amount_refunded_cents,
      v_existing.is_full_refund,
      v_existing.points_restored,
      v_existing.intent_state;
    RETURN;
  END IF;

  SELECT
    report.id,
    report.amount_usd,
    report.refunded_amount_usd,
    report.refunded_at,
    report.refund_reason,
    report.stripe_refund_id,
    report.status
  INTO STRICT
    v_report_id,
    v_report_amount_usd,
    v_report_refunded_usd,
    v_report_refunded_at,
    v_report_refund_reason,
    v_report_refund_id,
    v_report_status
  FROM public.paid_reports AS report
  WHERE report.stripe_session_id = p_stripe_session_id
  FOR UPDATE OF report;

  v_report_amount_cents := round(v_report_amount_usd * 100)::bigint;
  v_previous_refunded_cents := round(COALESCE(v_report_refunded_usd, 0) * 100)::bigint;
  IF v_report_amount_cents <= 0
    OR v_previous_refunded_cents < 0
    OR v_previous_refunded_cents > v_report_amount_cents
    OR p_refunded_amount_cents > v_report_amount_cents
    OR p_refunded_amount_cents > v_previous_refunded_cents
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reversal conflicts with canonical report amount';
  END IF;

  SELECT revenue.id
  INTO STRICT v_revenue_log_id
  FROM public.revenue_log AS revenue
  WHERE revenue.stripe_session_id = p_stripe_session_id
  FOR UPDATE OF revenue;

  SELECT accounting.*
  INTO v_accounting
  FROM public.stripe_refund_accounting_state AS accounting
  WHERE accounting.report_id = v_report_id
  FOR UPDATE OF accounting;

  IF NOT FOUND THEN
    IF v_previous_refunded_cents <> 0 OR p_refunded_amount_cents <> 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal accounting authority is missing';
    END IF;
  ELSE
    IF v_accounting.revenue_log_id IS DISTINCT FROM v_revenue_log_id
      OR v_accounting.canonical_amount_refunded_cents IS DISTINCT FROM v_previous_refunded_cents
      OR v_accounting.pre_refund_report_status IS NULL
      OR btrim(v_accounting.pre_refund_report_status) = ''
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal accounting identity is unavailable';
    END IF;
    v_expense_log_id := v_accounting.expense_log_id;
  END IF;

  v_is_full_refund := p_refunded_amount_cents >= v_report_amount_cents;
  v_outcome := CASE
    WHEN p_refunded_amount_cents = v_previous_refunded_cents THEN 'stale'
    ELSE 'reversed'
  END;

  IF v_accounting.report_id IS NOT NULL THEN
    UPDATE public.paid_reports
    SET
      refunded_amount_usd = p_refunded_amount_cents::numeric / 100,
      refunded_at = CASE
        WHEN p_refunded_amount_cents > 0 THEN COALESCE(refunded_at, now())
        ELSE v_accounting.pre_refund_at
      END,
      refund_reason = CASE
        WHEN p_refunded_amount_cents > 0 AND stripe_refund_id IS DISTINCT FROM p_refund_id
          THEN refund_reason
        ELSE v_accounting.pre_refund_reason
      END,
      stripe_refund_id = CASE
        WHEN stripe_refund_id IS DISTINCT FROM p_refund_id AND p_refunded_amount_cents > 0
          THEN stripe_refund_id
        ELSE v_accounting.pre_refund_id
      END,
      status = CASE
        WHEN v_is_full_refund THEN 'refunded'
        ELSE v_accounting.pre_refund_report_status
      END
    WHERE id = v_report_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal report update affected an unexpected row count';
    END IF;

    UPDATE public.revenue_log
    SET
      refunded_amount_usd = p_refunded_amount_cents::numeric / 100,
      refunded_at = CASE WHEN p_refunded_amount_cents > 0 THEN COALESCE(refunded_at, now()) ELSE NULL END
    WHERE id = v_revenue_log_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal revenue update affected an unexpected row count';
    END IF;

    UPDATE public.expense_log
    SET amount_usd = p_refunded_amount_cents::numeric / 100
    WHERE id = v_expense_log_id
      AND report_id = v_report_id
      AND category = 'refund';
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal expense update affected an unexpected row count';
    END IF;

    UPDATE public.stripe_refund_accounting_state
    SET
      canonical_amount_refunded_cents = p_refunded_amount_cents,
      updated_at = now()
    WHERE report_id = v_report_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal accounting update affected an unexpected row count';
    END IF;
  END IF;

  SELECT point_hold.*
  INTO v_point_hold
  FROM public.admin_refund_point_hold AS point_hold
  WHERE point_hold.report_id = v_report_id
    AND point_hold.state = 'held'
    AND (p_admin_request_id IS NULL OR point_hold.request_id = p_admin_request_id)
  FOR UPDATE OF point_hold;

  IF v_point_hold.report_id IS NOT NULL THEN
    SELECT up.id, up.balance, up.total_earned
    INTO STRICT v_points_row_id, v_balance_before, v_total_earned_before
    FROM public.user_points AS up
    WHERE up.user_id = v_point_hold.referrer_user_id
    FOR UPDATE OF up;

    IF v_balance_before IS NULL
      OR v_total_earned_before IS NULL
      OR v_balance_before < 0
      OR v_total_earned_before < v_point_hold.held_points
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal point hold is corrupt';
    END IF;

    v_balance_after := v_balance_before + v_point_hold.held_points;
    UPDATE public.user_points
    SET balance = v_balance_after, updated_at = now()
    WHERE id = v_points_row_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal point hold release affected an unexpected row count';
    END IF;

    INSERT INTO public.point_transactions (
      user_id,
      type,
      amount,
      balance_after,
      description,
      reference_id
    ) VALUES (
      v_point_hold.referrer_user_id,
      'refund_hold_release',
      v_point_hold.held_points,
      v_balance_after,
      'Refund referral reward hold released after provider terminal state',
      format('refund-hold-terminal:%s:%s', v_report_id, p_event_id)
    );

    UPDATE public.admin_refund_point_hold
    SET
      state = 'released',
      terminal_event_id = p_event_id,
      released_at = now(),
      updated_at = now()
    WHERE report_id = v_point_hold.report_id
      AND request_id = v_point_hold.request_id
      AND state = 'held';
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal point hold ledger affected an unexpected row count';
    END IF;
    v_points_restored := v_points_restored + v_point_hold.held_points;
  END IF;

  IF NOT v_is_full_refund THEN
    SELECT ledger.*
    INTO v_referral_ledger
    FROM public.referral_refund_point_ledger AS ledger
    WHERE ledger.report_id = v_report_id
    FOR UPDATE OF ledger;

    IF v_referral_ledger.report_id IS NOT NULL
      AND v_referral_ledger.points_clawed_back > v_referral_ledger.points_restored
    THEN
      v_restore_points := v_referral_ledger.points_clawed_back - v_referral_ledger.points_restored;
      SELECT referral.referrer_user_id, referral.status
      INTO STRICT v_referrer_user_id, v_referral_status
      FROM public.referrals AS referral
      WHERE referral.id = v_referral_ledger.referral_id
      FOR UPDATE OF referral;

      IF v_referral_status <> 'refunded'
        OR v_restore_points <= 0
        OR v_referral_ledger.source_point_transaction_id IS NULL
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reversal referral ledger is corrupt';
      END IF;

      SELECT up.id, up.balance, up.total_earned
      INTO STRICT v_points_row_id, v_balance_before, v_total_earned_before
      FROM public.user_points AS up
      WHERE up.user_id = v_referrer_user_id
      FOR UPDATE OF up;

      IF v_balance_before IS NULL OR v_total_earned_before IS NULL
        OR v_balance_before < 0 OR v_total_earned_before < 0
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reversal referral point balance is corrupt';
      END IF;

      v_balance_after := v_balance_before + v_restore_points;
      UPDATE public.user_points
      SET
        balance = v_balance_after,
        total_earned = v_total_earned_before + v_restore_points,
        updated_at = now()
      WHERE id = v_points_row_id;
      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reversal referral point update affected an unexpected row count';
      END IF;

      INSERT INTO public.point_transactions (
        user_id,
        type,
        amount,
        balance_after,
        description,
        reference_id
      ) VALUES (
        v_referrer_user_id,
        'refund_clawback_reversal',
        v_restore_points,
        v_balance_after,
        'Failed or canceled refund referral reward restoration',
        format('refund-reversal:%s:%s', v_report_id, p_event_id)
      ) RETURNING id INTO v_restore_transaction_id;

      UPDATE public.referrals
      SET status = 'purchased'
      WHERE id = v_referral_ledger.referral_id
        AND status = 'refunded';
      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reversal referral update affected an unexpected row count';
      END IF;

      UPDATE public.referral_refund_point_ledger AS point_ledger
      SET
        points_restored = point_ledger.points_clawed_back,
        last_reversal_event_id = p_event_id,
        last_reversal_point_transaction_id = v_restore_transaction_id,
        reversed_at = now()
      WHERE point_ledger.report_id = v_report_id
        AND point_ledger.points_clawed_back > point_ledger.points_restored;
      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'refund reversal referral ledger update affected an unexpected row count';
      END IF;

      UPDATE public.admin_refund_point_hold
      SET
        state = 'restored',
        terminal_event_id = p_event_id,
        released_at = now(),
        updated_at = now()
      WHERE report_id = v_report_id
        AND state = 'clawed_back';

      v_points_restored := v_points_restored + v_restore_points;
    END IF;
  END IF;

  IF p_admin_request_id IS NOT NULL THEN
    SELECT intent.*
    INTO STRICT v_intent
    FROM public.admin_refund_intent AS intent
    WHERE intent.report_id = v_report_id
      AND intent.request_id = p_admin_request_id
    FOR UPDATE OF intent;

    IF v_intent.payload_sha256 IS DISTINCT FROM p_admin_payload_sha256
      OR v_intent.stripe_session_id IS DISTINCT FROM p_stripe_session_id
      OR v_intent.payment_intent_id IS DISTINCT FROM p_payment_intent_id
      OR v_intent.requested_amount_cents IS DISTINCT FROM p_refund_amount_cents
      OR v_intent.provider_attempted_at IS NULL
      OR v_intent.state NOT IN (
        'provider_pending',
        'provider_applied',
        'reconciled',
        'provider_failed',
        'provider_canceled'
      )
      OR (v_intent.stripe_refund_id IS NOT NULL AND v_intent.stripe_refund_id IS DISTINCT FROM p_refund_id)
      OR (v_intent.stripe_charge_id IS NOT NULL AND v_intent.stripe_charge_id IS DISTINCT FROM p_charge_id)
      OR (
        v_intent.stripe_refund_amount_cents IS NOT NULL
        AND v_intent.stripe_refund_amount_cents IS DISTINCT FROM p_refund_amount_cents
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal conflicts with durable admin intent';
    END IF;

    v_intent_state := CASE
      WHEN p_refund_status = 'failed' THEN 'provider_failed'
      ELSE 'provider_canceled'
    END;
    UPDATE public.admin_refund_intent
    SET
      state = v_intent_state,
      stripe_refund_id = p_refund_id,
      stripe_charge_id = p_charge_id,
      stripe_refund_amount_cents = p_refund_amount_cents,
      cumulative_refunded_cents = p_refunded_amount_cents,
      reconciled_at = NULL,
      terminal_at = now(),
      terminal_reason = p_failure_reason,
      terminal_event_id = p_event_id,
      updated_at = now()
    WHERE report_id = v_report_id
      AND request_id = p_admin_request_id;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reversal intent update affected an unexpected row count';
    END IF;
  END IF;

  INSERT INTO public.stripe_refund_reversal_ledger (
    event_id,
    event_type,
    stripe_session_id,
    charge_id,
    payment_intent_id,
    refund_id,
    refund_status,
    refund_amount_cents,
    canonical_amount_refunded_cents,
    previous_amount_refunded_cents,
    effective_amount_refunded_cents,
    failure_reason,
    report_id,
    outcome,
    is_full_refund,
    points_restored,
    intent_state
  ) VALUES (
    p_event_id,
    p_event_type,
    p_stripe_session_id,
    p_charge_id,
    p_payment_intent_id,
    p_refund_id,
    p_refund_status,
    p_refund_amount_cents,
    p_refunded_amount_cents,
    v_previous_refunded_cents,
    p_refunded_amount_cents,
    p_failure_reason,
    v_report_id,
    v_outcome,
    v_is_full_refund,
    v_points_restored,
    v_intent_state
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reversal event ledger insert affected an unexpected row count';
  END IF;

  RETURN QUERY SELECT
    v_outcome,
    p_refunded_amount_cents,
    v_is_full_refund,
    v_points_restored,
    v_intent_state;
END
$reverse_stripe_refund_event$;

REVOKE ALL ON FUNCTION public.reverse_stripe_refund_event(
  text, text, text, text, text, text, text, bigint, bigint, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_stripe_refund_event(
  text, text, text, text, text, text, text, bigint, bigint, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_stripe_refund_event(
  text, text, text, text, text, text, text, bigint, bigint, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stripe_refund_event(
  text, text, text, text, text, text, text, bigint, bigint, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_stripe_refund_event(
  text, text, text, text, text, text, bigint, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_stripe_refund_event(
  text, text, text, text, text, text, bigint, text
) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_stripe_refund_event(
  text, text, text, text, text, text, bigint, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stripe_refund_event(
  text, text, text, text, text, text, bigint, text
) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_admin_refund_intent(
  uuid, text, text, bigint, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_admin_refund_intent(
  uuid, text, text, bigint, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_admin_refund_intent(
  uuid, text, text, bigint, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_admin_refund_intent(
  uuid, text, text, bigint, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.start_admin_refund_provider_attempt(
  uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_admin_refund_provider_attempt(
  uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.start_admin_refund_provider_attempt(
  uuid, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_admin_refund_provider_attempt(
  uuid, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.bind_admin_refund_intent_provider_result(
  uuid, text, text, text, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_admin_refund_intent_provider_result(
  uuid, text, text, text, text, bigint
) FROM anon;
REVOKE ALL ON FUNCTION public.bind_admin_refund_intent_provider_result(
  uuid, text, text, text, text, bigint
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_admin_refund_intent_provider_result(
  uuid, text, text, text, text, bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_admin_refund_intent(
  uuid, text, text, text, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_admin_refund_intent(
  uuid, text, text, text, bigint
) FROM anon;
REVOKE ALL ON FUNCTION public.complete_admin_refund_intent(
  uuid, text, text, text, bigint
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_refund_intent(
  uuid, text, text, text, bigint
) TO service_role;

DO $refund_reconciliation_postcondition$
DECLARE
  v_owner_oid oid := (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = current_user);
  v_table_names text[] := ARRAY[
    'stripe_refund_event_ledger',
    'stripe_refund_accounting_state',
    'referral_refund_point_ledger',
    'admin_refund_intent',
    'admin_refund_point_hold',
    'stripe_refund_reversal_ledger'
  ];
  v_function_signatures text[] := ARRAY[
    'public.reserve_admin_refund_intent(uuid,text,text,bigint,text,text,text)',
    'public.start_admin_refund_provider_attempt(uuid,text,text)',
    'public.bind_admin_refund_intent_provider_result(uuid,text,text,text,text,bigint)',
    'public.complete_admin_refund_intent(uuid,text,text,text,bigint)',
    'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)',
    'public.reverse_stripe_refund_event(text,text,text,text,text,text,text,bigint,bigint,text,text,text)'
  ];
  v_function_names text[] := ARRAY[
    'reserve_admin_refund_intent',
    'start_admin_refund_provider_attempt',
    'bind_admin_refund_intent_provider_result',
    'complete_admin_refund_intent',
    'reconcile_stripe_refund_event',
    'reverse_stripe_refund_event'
  ];
  v_check_constraints text[] := ARRAY[
    'stripe_refund_event_ledger_event_type_check',
    'stripe_refund_event_ledger_identity_check',
    'stripe_refund_event_ledger_amount_check',
    'stripe_refund_event_ledger_outcome_check',
    'stripe_refund_accounting_state_amount_check',
    'referral_refund_point_ledger_amount_check',
    'admin_refund_intent_request_id_check',
    'admin_refund_intent_payload_hash_check',
    'admin_refund_intent_amount_check',
    'admin_refund_intent_reason_check',
    'admin_refund_intent_state_check',
    'admin_refund_intent_provider_identity_check',
    'admin_refund_point_hold_amount_check',
    'admin_refund_point_hold_state_check',
    'stripe_refund_reversal_ledger_event_type_check',
    'stripe_refund_reversal_ledger_status_check',
    'stripe_refund_reversal_ledger_amount_check',
    'stripe_refund_reversal_ledger_identity_check',
    'stripe_refund_reversal_ledger_outcome_check',
    'stripe_refund_reversal_ledger_intent_state_check'
  ];
  v_name text;
  v_signature text;
  v_proc_oid oid;
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS proc_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = proc_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND proc_row.proname = ANY (v_function_names)
  ) <> cardinality(v_function_signatures) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation function cohort postcondition failed';
  END IF;

  FOREACH v_name IN ARRAY v_table_names LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND relation_row.relname = v_name
        AND relation_row.relkind = 'r'
        AND relation_row.relowner = v_owner_oid
        AND relation_row.relrowsecurity
        AND relation_row.relforcerowsecurity
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(relation_row.relacl, pg_catalog.acldefault('r', relation_row.relowner))
      ) AS acl_row
      WHERE namespace_row.nspname = 'public'
        AND relation_row.relname = v_name
        AND acl_row.grantee IN (
          0,
          (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'anon'),
          (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'authenticated'),
          (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'service_role')
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reconciliation table postcondition failed';
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_function_signatures LOOP
    v_proc_oid := to_regprocedure(v_signature);
    IF v_proc_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc_row
      WHERE proc_row.oid = v_proc_oid
        AND proc_row.proowner = v_owner_oid
        AND proc_row.prosecdef
        AND proc_row.proconfig @> ARRAY['search_path=pg_catalog', 'lock_timeout=5s']::text[]
        AND cardinality(proc_row.proconfig) = 2
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(proc_row.proacl, pg_catalog.acldefault('f', proc_row.proowner))
      ) AS acl_row
      WHERE proc_row.oid = v_proc_oid
        AND acl_row.grantee IN (
          0,
          (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'anon'),
          (SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row WHERE role_row.rolname = 'authenticated')
        )
    ) OR NOT pg_catalog.has_function_privilege('service_role', v_proc_oid, 'EXECUTE') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'refund reconciliation function postcondition failed';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT expected.table_name, expected.column_name
    FROM (VALUES
      ('stripe_refund_accounting_state', 'pre_refund_report_status'),
      ('referral_refund_point_ledger', 'last_reversal_event_id'),
      ('referral_refund_point_ledger', 'points_restored'),
      ('admin_refund_intent', 'provider_attempted_at'),
      ('admin_refund_intent', 'terminal_event_id'),
      ('admin_refund_point_hold', 'state'),
      ('stripe_refund_reversal_ledger', 'canonical_amount_refunded_cents'),
      ('stripe_refund_reversal_ledger', 'points_restored')
    ) AS expected(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = expected.table_name
        AND actual.column_name = expected.column_name
    )
  ) OR EXISTS (
    SELECT expected.name
    FROM unnest(v_check_constraints) AS expected(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation_row
        ON relation_row.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND relation_row.relname = ANY (v_table_names)
        AND constraint_row.conname = expected.name
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
    )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS index_row
    WHERE index_row.schemaname = 'public'
      AND index_row.indexname = 'admin_refund_intent_one_active_per_report'
      AND index_row.indexdef ~* 'UNIQUE'
      AND index_row.indexdef ~* $$WHERE \(state = ANY \(ARRAY\['reserved'::text, 'provider_pending'::text, 'provider_applied'::text\]\)\)$$
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'refund reconciliation schema postcondition failed';
  END IF;
END
$refund_reconciliation_postcondition$;

COMMENT ON TABLE public.stripe_refund_event_ledger IS
  'PII-free Stripe/admin refund event idempotency ledger.';
COMMENT ON TABLE public.stripe_refund_accounting_state IS
  'One-per-report canonical revenue and refund-expense reconciliation state.';
COMMENT ON TABLE public.referral_refund_point_ledger IS
  'One-per-report referral reward clawback state; no customer identity stored.';
COMMENT ON TABLE public.admin_refund_intent IS
  'Durable server-side admin refund intent; immutable payload identity precedes provider mutation.';
COMMENT ON TABLE public.admin_refund_point_hold IS
  'Durable referral-point escrow held outside spendable balance until Stripe reaches a terminal state.';
COMMENT ON TABLE public.stripe_refund_reversal_ledger IS
  'Append-only final record of failed or canceled Stripe refund reconciliation.';
COMMENT ON FUNCTION public.reconcile_stripe_refund_event(
  text, text, text, text, text, text, bigint, text
) IS
  'Atomically reconcile report, accounting, referral points, and refund event idempotency.';
COMMENT ON FUNCTION public.reserve_admin_refund_intent(
  uuid, text, text, bigint, text, text, text
) IS
  'Lock canonical refund balances and persist an immutable refund request before provider mutation.';
COMMENT ON FUNCTION public.start_admin_refund_provider_attempt(
  uuid, text, text
) IS
  'CAS a reserved refund intent into provider-pending before the first Stripe call.';
COMMENT ON FUNCTION public.bind_admin_refund_intent_provider_result(
  uuid, text, text, text, text, bigint
) IS
  'Bind one Stripe refund identity to its durable request for response-loss recovery.';
COMMENT ON FUNCTION public.complete_admin_refund_intent(
  uuid, text, text, text, bigint
) IS
  'Mark a durable refund request reconciled only after matching canonical accounting exists.';
COMMENT ON FUNCTION public.reverse_stripe_refund_event(
  text, text, text, text, text, text, text, bigint, bigint, text, text, text
) IS
  'Atomically reverse report, accounting, referral points, and admin intent to fresh terminal Stripe truth.';

COMMIT;
