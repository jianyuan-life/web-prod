BEGIN;

-- A completion-email attempt is a durable outbox claim, not a read-side
-- convention.  The migration owner must be able to cross FORCE RLS because
-- the SECURITY DEFINER routines lock paid_reports and the private claim table.
DO $completion_email_owner_preflight$
DECLARE
  v_owner oid;
  v_paid_reports oid := to_regclass('public.paid_reports')::oid;
  v_missing text;
BEGIN
  SELECT oid INTO v_owner
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user AND (rolsuper OR rolbypassrls);

  IF v_owner IS NULL OR v_paid_reports IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = v_paid_reports AND relkind = 'r' AND relowner = v_owner
  ) THEN
    RAISE EXCEPTION 'completion email migration owner/paid_reports preflight failed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
  THEN
    RAISE EXCEPTION 'completion email runtime roles are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'completion email service_role must BYPASSRLS';
  END IF;

  WITH required(column_name, udt_name) AS (
    VALUES
      ('id', 'uuid'),
      ('status', 'text'),
      ('deleted_at', 'timestamptz'),
      ('email_sent_at', 'timestamptz')
  )
  SELECT string_agg(format('%I:%s', required.column_name, required.udt_name), ', ')
  INTO v_missing
  FROM required
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'paid_reports'
   AND actual.column_name = required.column_name
   AND actual.udt_name = required.udt_name
  WHERE actual.column_name IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'completion email paid_reports schema drift: %', v_missing;
  END IF;
END
$completion_email_owner_preflight$;

-- CREATE TABLE IF NOT EXISTS is safe only when an existing relation is the
-- exact ledger we expect.  Extra/missing columns fail before any ACL/function
-- mutation, which makes replay a drift detector instead of a silent repair.
DO $completion_email_claim_replay_preflight$
DECLARE
  v_claims oid := to_regclass('public.report_email_delivery_claims')::oid;
  v_owner oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user);
BEGIN
  IF v_claims IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = v_claims AND relkind = 'r' AND relowner = v_owner
        AND relpersistence = 'p' AND relrowsecurity AND relforcerowsecurity
    )
    OR (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'report_email_delivery_claims') <> 10
    OR EXISTS (
      WITH required(column_name, ordinal_position, udt_name, is_nullable) AS (
        VALUES
          ('report_id', 1, 'uuid', 'NO'),
          ('event_type', 2, 'text', 'NO'),
          ('payload_sha256', 3, 'text', 'NO'),
          ('provider_idempotency_key', 4, 'text', 'NO'),
          ('status', 5, 'text', 'NO'),
          ('provider_message_id', 6, 'text', 'YES'),
          ('manual_reason', 7, 'text', 'YES'),
          ('claimed_at', 8, 'timestamptz', 'NO'),
          ('sent_at', 9, 'timestamptz', 'YES'),
          ('updated_at', 10, 'timestamptz', 'NO')
      )
      SELECT 1
      FROM required
      LEFT JOIN information_schema.columns AS actual
        ON actual.table_schema = 'public'
       AND actual.table_name = 'report_email_delivery_claims'
       AND actual.column_name = required.column_name
       AND actual.ordinal_position = required.ordinal_position
       AND actual.udt_name = required.udt_name
       AND actual.is_nullable = required.is_nullable
      WHERE actual.column_name IS NULL
    )
    OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = v_claims) <> 8
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_claims
        AND conname = 'report_email_delivery_claims_pkey'
        AND contype = 'p' AND convalidated AND NOT condeferrable
        AND pg_get_constraintdef(oid, true) = 'PRIMARY KEY (report_id, event_type)'
    )
    OR (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid = v_claims) <> 1
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = v_claims)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = v_claims AND NOT tgisinternal)
  THEN
    RAISE EXCEPTION 'completion email delivery claim schema drift';
  END IF;
END
$completion_email_claim_replay_preflight$;

CREATE TABLE IF NOT EXISTS public.report_email_delivery_claims (
  report_id uuid NOT NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL,
  provider_idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'claimed',
  provider_message_id text,
  manual_reason text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_email_delivery_claims_pkey PRIMARY KEY (report_id, event_type),
  CONSTRAINT report_email_delivery_claims_event_check
    CHECK (event_type = 'report_completed'),
  CONSTRAINT report_email_delivery_claims_payload_check
    CHECK (payload_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT report_email_delivery_claims_provider_key_check
    CHECK (provider_idempotency_key ~ '^report-completed/[0-9a-fA-F-]{36}$'),
  CONSTRAINT report_email_delivery_claims_status_check
    CHECK (status IN ('claimed', 'sent', 'needs_manual')),
  CONSTRAINT report_email_delivery_claims_provider_message_check
    CHECK (provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 256),
  CONSTRAINT report_email_delivery_claims_manual_reason_check
    CHECK (manual_reason IS NULL OR length(manual_reason) BETWEEN 1 AND 160),
  CONSTRAINT report_email_delivery_claims_state_check CHECK (
    (status = 'claimed' AND sent_at IS NULL AND manual_reason IS NULL AND provider_message_id IS NULL)
    OR (status = 'sent' AND sent_at IS NOT NULL AND manual_reason IS NULL AND provider_message_id IS NOT NULL)
    OR (status = 'needs_manual' AND sent_at IS NULL AND manual_reason IS NOT NULL)
  )
);

ALTER TABLE public.report_email_delivery_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_email_delivery_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_email_delivery_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.report_email_delivery_claims FROM anon;
REVOKE ALL ON TABLE public.report_email_delivery_claims FROM authenticated;
REVOKE ALL ON TABLE public.report_email_delivery_claims FROM service_role;
GRANT SELECT ON TABLE public.report_email_delivery_claims TO service_role;

DROP TRIGGER IF EXISTS fence_report_completion_email_claims ON public.paid_reports;
DROP FUNCTION IF EXISTS public.fence_report_completion_email_claims();
DROP FUNCTION IF EXISTS public.claim_report_completion_email(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.finalize_report_completion_email(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.mark_report_completion_email_needs_manual(uuid, text, text, text, text, text);

CREATE FUNCTION public.claim_report_completion_email(
  p_report_id uuid,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_idempotency_key text
)
RETURNS TABLE(outcome text, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $claim_report_completion_email$
DECLARE
  v_report_found boolean := false;
  v_report_status text;
  v_deleted_at timestamptz;
  v_email_sent_at timestamptz;
  v_claim_found boolean := false;
  v_claim_status text;
  v_claim_payload text;
  v_claim_provider_key text;
BEGIN
  IF p_event_type IS DISTINCT FROM 'report_completed'
    OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^sha256:[0-9a-f]{64}$'
    OR p_provider_idempotency_key IS DISTINCT FROM
      ('report-completed/' || lower(p_report_id::text))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid completion email claim identity';
  END IF;

  SELECT report.status, report.deleted_at, report.email_sent_at
  INTO v_report_status, v_deleted_at, v_email_sent_at
  FROM public.paid_reports AS report
  WHERE report.id = p_report_id
  FOR UPDATE;
  v_report_found := FOUND;

  SELECT claim.status, claim.payload_sha256, claim.provider_idempotency_key
  INTO v_claim_status, v_claim_payload, v_claim_provider_key
  FROM public.report_email_delivery_claims AS claim
  WHERE claim.report_id = p_report_id AND claim.event_type = p_event_type
  FOR UPDATE;
  v_claim_found := FOUND;

  IF NOT v_report_found THEN
    RETURN QUERY SELECT 'not_found'::text, CASE WHEN v_claim_found THEN v_claim_status ELSE NULL::text END;
    RETURN;
  END IF;

  IF v_email_sent_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_sent'::text, CASE WHEN v_claim_found THEN v_claim_status ELSE NULL::text END;
    RETURN;
  END IF;

  IF v_report_status IS DISTINCT FROM 'completed' OR v_deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT 'terminal_state'::text, CASE WHEN v_claim_found THEN v_claim_status ELSE NULL::text END;
    RETURN;
  END IF;

  IF v_claim_found THEN
    IF v_claim_payload IS DISTINCT FROM p_payload_sha256
      OR v_claim_provider_key IS DISTINCT FROM p_provider_idempotency_key
    THEN
      -- The first successful claim is authoritative. A later producer can use
      -- a different template, but it must not poison or reopen the winner's
      -- in-flight claim. It simply loses closed with payload_conflict.
      RETURN QUERY SELECT 'payload_conflict'::text, v_claim_status;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      CASE v_claim_status
        WHEN 'claimed' THEN 'already_claimed'
        WHEN 'sent' THEN 'already_sent'
        ELSE 'already_needs_manual'
      END::text,
      v_claim_status;
    RETURN;
  END IF;

  INSERT INTO public.report_email_delivery_claims(
    report_id, event_type, payload_sha256, provider_idempotency_key
  ) VALUES (
    p_report_id, p_event_type, p_payload_sha256, p_provider_idempotency_key
  );

  RETURN QUERY SELECT 'claimed'::text, 'claimed'::text;
END
$claim_report_completion_email$;

CREATE FUNCTION public.finalize_report_completion_email(
  p_report_id uuid,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_idempotency_key text,
  p_provider_message_id text
)
RETURNS TABLE(outcome text, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $finalize_report_completion_email$
DECLARE
  v_report_found boolean := false;
  v_report_status text;
  v_deleted_at timestamptz;
  v_email_sent_at timestamptz;
  v_claim_status text;
  v_claim_payload text;
  v_claim_provider_key text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_event_type IS DISTINCT FROM 'report_completed'
    OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^sha256:[0-9a-f]{64}$'
    OR p_provider_idempotency_key IS DISTINCT FROM
      ('report-completed/' || lower(p_report_id::text))
    OR p_provider_message_id IS NULL
    OR length(p_provider_message_id) NOT BETWEEN 1 AND 256
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid completion email finalize identity';
  END IF;

  SELECT report.status, report.deleted_at, report.email_sent_at
  INTO v_report_status, v_deleted_at, v_email_sent_at
  FROM public.paid_reports AS report
  WHERE report.id = p_report_id
  FOR UPDATE;
  v_report_found := FOUND;

  SELECT claim.status, claim.payload_sha256, claim.provider_idempotency_key
  INTO v_claim_status, v_claim_payload, v_claim_provider_key
  FROM public.report_email_delivery_claims AS claim
  WHERE claim.report_id = p_report_id AND claim.event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing_claim'::text, NULL::text;
    RETURN;
  END IF;

  IF v_claim_payload IS DISTINCT FROM p_payload_sha256
    OR v_claim_provider_key IS DISTINCT FROM p_provider_idempotency_key
  THEN
    -- A non-owner cannot mutate the authoritative claim during finalize.
    RETURN QUERY SELECT 'payload_conflict'::text, v_claim_status;
    RETURN;
  END IF;

  IF v_claim_status = 'sent' THEN
    RETURN QUERY SELECT 'already_sent'::text, v_claim_status;
    RETURN;
  END IF;

  IF NOT v_report_found OR v_report_status IS DISTINCT FROM 'completed' OR v_deleted_at IS NOT NULL THEN
    UPDATE public.report_email_delivery_claims
    SET status = 'needs_manual',
        manual_reason = COALESCE(manual_reason, 'report-terminal-before-finalize'),
        provider_message_id = COALESCE(provider_message_id, p_provider_message_id),
        updated_at = v_now
    WHERE report_id = p_report_id AND event_type = p_event_type AND status <> 'sent';
    RETURN QUERY SELECT 'terminal_state'::text, 'needs_manual'::text;
    RETURN;
  END IF;

  IF v_email_sent_at IS NOT NULL THEN
    UPDATE public.report_email_delivery_claims
    SET status = 'needs_manual',
        manual_reason = COALESCE(manual_reason, 'email-sent-outside-claim-finalize'),
        provider_message_id = COALESCE(provider_message_id, p_provider_message_id),
        updated_at = v_now
    WHERE report_id = p_report_id AND event_type = p_event_type AND status = 'claimed';
    RETURN QUERY SELECT 'already_sent'::text,
      (SELECT status FROM public.report_email_delivery_claims
       WHERE report_id = p_report_id AND event_type = p_event_type);
    RETURN;
  END IF;

  IF v_claim_status = 'needs_manual' THEN
    RETURN QUERY SELECT 'needs_manual'::text, v_claim_status;
    RETURN;
  END IF;

  -- Claim and report completion timestamp become visible in one transaction.
  -- Marking the claim first lets the paid_reports trigger distinguish this
  -- authorized finalize from a competing/legacy email_sent_at write.
  UPDATE public.report_email_delivery_claims
  SET status = 'sent', provider_message_id = p_provider_message_id,
      sent_at = v_now, updated_at = v_now
  WHERE report_id = p_report_id AND event_type = p_event_type AND status = 'claimed';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'needs_manual'::text,
      (SELECT status FROM public.report_email_delivery_claims
       WHERE report_id = p_report_id AND event_type = p_event_type);
    RETURN;
  END IF;

  UPDATE public.paid_reports
  SET email_sent_at = v_now
  WHERE id = p_report_id AND status = 'completed'
    AND deleted_at IS NULL AND email_sent_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion email terminal state changed while finalizing';
  END IF;

  RETURN QUERY SELECT 'sent'::text, 'sent'::text;
END
$finalize_report_completion_email$;

CREATE FUNCTION public.mark_report_completion_email_needs_manual(
  p_report_id uuid,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_idempotency_key text,
  p_manual_reason text,
  p_provider_message_id text DEFAULT NULL
)
RETURNS TABLE(outcome text, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $mark_report_completion_email_needs_manual$
DECLARE
  v_claim_status text;
  v_claim_payload text;
  v_claim_provider_key text;
BEGIN
  IF p_event_type IS DISTINCT FROM 'report_completed'
    OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^sha256:[0-9a-f]{64}$'
    OR p_provider_idempotency_key IS DISTINCT FROM
      ('report-completed/' || lower(p_report_id::text))
    OR p_manual_reason IS NULL
    OR length(p_manual_reason) NOT BETWEEN 1 AND 160
    OR (p_provider_message_id IS NOT NULL AND length(p_provider_message_id) NOT BETWEEN 1 AND 256)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid completion email manual identity';
  END IF;

  -- Preserve the global lock order used by claim/finalize and the report
  -- fencing trigger: paid_reports first, delivery claim second.
  PERFORM report.id
  FROM public.paid_reports AS report
  WHERE report.id = p_report_id
  FOR UPDATE;

  SELECT claim.status, claim.payload_sha256, claim.provider_idempotency_key
  INTO v_claim_status, v_claim_payload, v_claim_provider_key
  FROM public.report_email_delivery_claims AS claim
  WHERE claim.report_id = p_report_id AND claim.event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing_claim'::text, NULL::text;
    RETURN;
  END IF;

  IF v_claim_payload IS DISTINCT FROM p_payload_sha256
    OR v_claim_provider_key IS DISTINCT FROM p_provider_idempotency_key
  THEN
    -- Likewise, a non-owner cannot force the winner into manual review.
    RETURN QUERY SELECT 'payload_conflict'::text, v_claim_status;
    RETURN;
  END IF;

  IF v_claim_status = 'sent' THEN
    RETURN QUERY SELECT 'already_sent'::text, v_claim_status;
    RETURN;
  END IF;
  IF v_claim_status = 'needs_manual' THEN
    RETURN QUERY SELECT 'already_needs_manual'::text, v_claim_status;
    RETURN;
  END IF;

  UPDATE public.report_email_delivery_claims
  SET status = 'needs_manual', manual_reason = p_manual_reason,
      provider_message_id = p_provider_message_id, updated_at = clock_timestamp()
  WHERE report_id = p_report_id AND event_type = p_event_type AND status = 'claimed';

  RETURN QUERY SELECT 'needs_manual'::text, 'needs_manual'::text;
END
$mark_report_completion_email_needs_manual$;

CREATE FUNCTION public.fence_report_completion_email_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fence_report_completion_email_claims$
DECLARE
  v_reason text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_reason := 'report-hard-deleted-before-finalize';
  ELSIF NEW.deleted_at IS NOT NULL THEN
    v_reason := 'report-deleted-before-finalize';
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    v_reason := 'report-terminal-before-finalize';
  ELSIF NEW.email_sent_at IS NOT NULL AND OLD.email_sent_at IS NULL THEN
    v_reason := 'email-sent-outside-claim-finalize';
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.report_email_delivery_claims
  SET status = 'needs_manual', manual_reason = v_reason, updated_at = clock_timestamp()
  WHERE report_id = OLD.id
    AND event_type = 'report_completed'
    AND status = 'claimed';

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fence_report_completion_email_claims$;

CREATE TRIGGER fence_report_completion_email_claims
BEFORE UPDATE OF status, deleted_at, email_sent_at OR DELETE
ON public.paid_reports
FOR EACH ROW
EXECUTE FUNCTION public.fence_report_completion_email_claims();

REVOKE ALL ON FUNCTION public.claim_report_completion_email(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_report_completion_email(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_report_completion_email(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_completion_email(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_report_completion_email(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_report_completion_email(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_report_completion_email(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_report_completion_email(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_report_completion_email_needs_manual(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_report_completion_email_needs_manual(uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_report_completion_email_needs_manual(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_report_completion_email_needs_manual(uuid, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fence_report_completion_email_claims() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fence_report_completion_email_claims() FROM anon;
REVOKE ALL ON FUNCTION public.fence_report_completion_email_claims() FROM authenticated;
REVOKE ALL ON FUNCTION public.fence_report_completion_email_claims() FROM service_role;

DO $completion_email_acl_postcondition$
DECLARE
  v_claims oid := to_regclass('public.report_email_delivery_claims')::oid;
  v_owner oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user);
  v_service oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role');
  v_function oid;
BEGIN
  IF v_claims IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = v_claims AND relowner = v_owner AND relrowsecurity AND relforcerowsecurity
    )
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = v_claims)
    OR NOT pg_catalog.has_table_privilege('service_role', v_claims, 'SELECT')
    OR pg_catalog.has_table_privilege('service_role', v_claims, 'INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('anon', v_claims, 'SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('authenticated', v_claims, 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.paid_reports'::regclass
        AND tgname = 'fence_report_completion_email_claims' AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'completion email table/trigger ACL postcondition failed';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.claim_report_completion_email(uuid,text,text,text)'::regprocedure::oid,
    'public.finalize_report_completion_email(uuid,text,text,text,text)'::regprocedure::oid,
    'public.mark_report_completion_email_needs_manual(uuid,text,text,text,text,text)'::regprocedure::oid
  ] LOOP
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc
        WHERE oid = v_function AND proowner = v_owner AND prosecdef AND proconfig IS NOT NULL
      )
      OR NOT pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS routine
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
        ) AS acl
        WHERE routine.oid = v_function AND acl.privilege_type = 'EXECUTE'
          AND acl.grantee NOT IN (v_owner, v_service)
      )
    THEN
      RAISE EXCEPTION 'completion email RPC ACL postcondition failed';
    END IF;
  END LOOP;
END
$completion_email_acl_postcondition$;

COMMIT;
