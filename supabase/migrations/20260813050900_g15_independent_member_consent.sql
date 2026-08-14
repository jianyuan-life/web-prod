BEGIN;

DO $preflight$
DECLARE
  object_count integer;
  service_bypass boolean;
  fn_create oid := to_regprocedure(
    'public.create_or_replace_g15_consent_selection(uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb)'
  )::oid;
  fn_transition oid := to_regprocedure('public.transition_g15_consent(text,text,uuid)')::oid;
  fn_consume oid := to_regprocedure('public.consume_g15_consent_for_order(uuid,uuid,text,uuid)')::oid;
BEGIN
  IF to_regrole('anon') IS NULL
     OR to_regrole('authenticated') IS NULL
     OR to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'g15 consent preflight failed: required Supabase roles are missing';
  END IF;

  SELECT rolbypassrls INTO service_bypass
  FROM pg_roles
  WHERE oid = to_regrole('service_role')::oid;
  IF service_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'g15 consent preflight failed: service_role must BYPASSRLS';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_class
  WHERE oid IN (
    to_regclass('public.g15_consent_selections')::oid,
    to_regclass('public.g15_consent_receipts')::oid
  );
  IF object_count NOT IN (0, 2) THEN
    RAISE EXCEPTION 'g15 consent preflight failed: partial table state';
  END IF;

  IF object_count = 2 THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid IN (
        to_regclass('public.g15_consent_selections')::oid,
        to_regclass('public.g15_consent_receipts')::oid
      )
        AND (relowner <> current_user::regrole OR NOT relrowsecurity OR NOT relforcerowsecurity)
    ) THEN
      RAISE EXCEPTION 'g15 consent preflight failed: table owner or RLS drifted';
    END IF;
    IF (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.g15_consent_selections'::regclass AND attnum > 0 AND NOT attisdropped) <> 16
       OR (SELECT count(*) FROM pg_attribute
           WHERE attrelid = 'public.g15_consent_receipts'::regclass AND attnum > 0 AND NOT attisdropped) <> 13 THEN
      RAISE EXCEPTION 'g15 consent preflight failed: table schema drifted';
    END IF;
    IF has_table_privilege('anon', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('service_role', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('service_role', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'g15 consent preflight failed: table ACL drifted';
    END IF;
  END IF;

  IF ((fn_create IS NOT NULL)::integer
      + (fn_transition IS NOT NULL)::integer
      + (fn_consume IS NOT NULL)::integer) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'g15 consent preflight failed: partial function state';
  END IF;
  IF fn_create IS NOT NULL AND EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid IN (fn_create, fn_transition, fn_consume)
      AND (
        proowner <> current_user::regrole
        OR NOT prosecdef
        OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'g15 consent preflight failed: function security attributes drifted';
  END IF;
  IF fn_create IS NOT NULL AND (
    has_function_privilege('anon', fn_create, 'EXECUTE')
    OR has_function_privilege('authenticated', fn_create, 'EXECUTE')
    OR NOT has_function_privilege('service_role', fn_create, 'EXECUTE')
    OR has_function_privilege('anon', fn_transition, 'EXECUTE')
    OR has_function_privilege('authenticated', fn_transition, 'EXECUTE')
    OR NOT has_function_privilege('service_role', fn_transition, 'EXECUTE')
    OR has_function_privilege('anon', fn_consume, 'EXECUTE')
    OR has_function_privilege('authenticated', fn_consume, 'EXECUTE')
    OR NOT has_function_privilege('service_role', fn_consume, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'g15 consent preflight failed: function ACL drifted';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.g15_consent_selections (
  id uuid PRIMARY KEY,
  request_key uuid NOT NULL,
  request_payload_hash text NOT NULL CHECK (request_payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  purchaser_user_id uuid NOT NULL,
  selected_report_ids uuid[] NOT NULL CHECK (cardinality(selected_report_ids) BETWEEN 2 AND 8),
  selected_report_ids_hash text NOT NULL CHECK (selected_report_ids_hash ~ '^sha256:[0-9a-f]{64}$'),
  policy_version text NOT NULL,
  purpose text NOT NULL,
  sharing_scope text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  superseded_at timestamp with time zone,
  consumed_at timestamp with time zone,
  consumed_stripe_session_id text,
  consumed_report_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT g15_consent_selection_request_unique UNIQUE (purchaser_user_id, request_key),
  CONSTRAINT g15_consent_selection_policy_check CHECK (policy_version = 'g15-family-member-consent/v4.0.0'),
  CONSTRAINT g15_consent_selection_purpose_check CHECK (purpose = 'prepare_and_generate_g15_family_blueprint'),
  CONSTRAINT g15_consent_selection_scope_check CHECK (sharing_scope = 'purchaser_and_selected_adult_members_summary_only'),
  CONSTRAINT g15_consent_selection_consumed_check CHECK (
    (consumed_at IS NULL AND consumed_stripe_session_id IS NULL AND consumed_report_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_stripe_session_id IS NOT NULL AND consumed_report_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS g15_consent_one_active_selection
  ON public.g15_consent_selections(purchaser_user_id, selected_report_ids_hash)
  WHERE superseded_at IS NULL AND consumed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS g15_consent_consumed_stripe_session_unique
  ON public.g15_consent_selections(consumed_stripe_session_id)
  WHERE consumed_stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS g15_consent_consumed_report_unique
  ON public.g15_consent_selections(consumed_report_id)
  WHERE consumed_report_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.g15_consent_receipts (
  id uuid PRIMARY KEY,
  selection_id uuid NOT NULL REFERENCES public.g15_consent_selections(id) ON DELETE RESTRICT,
  subject_report_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  subject_email_hmac text NOT NULL CHECK (subject_email_hmac ~ '^hmac-sha256:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  accept_token_hash text CHECK (accept_token_hash IS NULL OR accept_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  revoke_token_hash text CHECK (revoke_token_hash IS NULL OR revoke_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT g15_consent_receipt_subject_unique UNIQUE (selection_id, subject_report_id),
  CONSTRAINT g15_consent_receipt_owner_unique UNIQUE (selection_id, subject_user_id),
  CONSTRAINT g15_consent_receipt_email_unique UNIQUE (selection_id, subject_email_hmac),
  CONSTRAINT g15_consent_receipt_time_check CHECK (
    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status = 'expired')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS g15_consent_accept_token_unique
  ON public.g15_consent_receipts(accept_token_hash)
  WHERE accept_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS g15_consent_revoke_token_unique
  ON public.g15_consent_receipts(revoke_token_hash)
  WHERE revoke_token_hash IS NOT NULL;

ALTER TABLE public.g15_consent_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g15_consent_selections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.g15_consent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g15_consent_receipts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.g15_consent_selections FROM PUBLIC;
REVOKE ALL ON TABLE public.g15_consent_selections FROM anon;
REVOKE ALL ON TABLE public.g15_consent_selections FROM authenticated;
REVOKE ALL ON TABLE public.g15_consent_selections FROM service_role;
REVOKE ALL ON TABLE public.g15_consent_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.g15_consent_receipts FROM anon;
REVOKE ALL ON TABLE public.g15_consent_receipts FROM authenticated;
REVOKE ALL ON TABLE public.g15_consent_receipts FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.g15_consent_selections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.g15_consent_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.create_or_replace_g15_consent_selection(
  p_selection_id uuid,
  p_request_key uuid,
  p_request_payload_hash text,
  p_purchaser_user_id uuid,
  p_report_ids uuid[],
  p_selected_report_ids_hash text,
  p_policy_version text,
  p_purpose text,
  p_sharing_scope text,
  p_expires_at timestamp with time zone,
  p_receipts jsonb
)
RETURNS TABLE(
  outcome text,
  selection_id uuid,
  receipt_status text,
  subject_report_id uuid,
  selection_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  existing_selection public.g15_consent_selections%ROWTYPE;
  receipt_count integer;
  eligible_count integer;
  owner_count integer;
  active_selection_ids uuid[];
BEGIN
  IF p_selection_id IS NULL OR p_request_key IS NULL OR p_purchaser_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent identifiers are required';
  END IF;
  IF p_request_payload_hash !~ '^sha256:[0-9a-f]{64}$'
     OR p_selected_report_ids_hash !~ '^sha256:[0-9a-f]{64}$'
     OR p_policy_version <> 'g15-family-member-consent/v4.0.0'
     OR p_purpose <> 'prepare_and_generate_g15_family_blueprint'
     OR p_sharing_scope <> 'purchaser_and_selected_adult_members_summary_only' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent immutable contract mismatch';
  END IF;
  IF cardinality(p_report_ids) NOT BETWEEN 2 AND 8
     OR (SELECT count(DISTINCT report_id) FROM unnest(p_report_ids) AS report_id) <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent report set is invalid';
  END IF;
  IF p_expires_at <= clock_timestamp() + interval '5 minutes'
     OR p_expires_at > clock_timestamp() + interval '7 days' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent expiry is outside the allowed window';
  END IF;
  IF jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent receipt set is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_receipts) AS item(value)
    WHERE jsonb_typeof(value) <> 'object'
       OR COALESCE(value->>'report_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       OR COALESCE(value->>'subject_user_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       OR COALESCE(value->>'email_hmac', '') !~ '^hmac-sha256:[0-9a-f]{64}$'
       OR COALESCE(value->>'accept_token_hash', '') !~ '^sha256:[0-9a-f]{64}$'
       OR COALESCE(value->>'revoke_token_hash', '') !~ '^sha256:[0-9a-f]{64}$'
       OR value->>'accept_token_hash' = value->>'revoke_token_hash'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent receipt hash or owner contract is invalid';
  END IF;

  SELECT count(*), count(DISTINCT (value->>'report_id')::uuid), count(DISTINCT (value->>'subject_user_id')::uuid)
    INTO receipt_count, eligible_count, owner_count
  FROM jsonb_array_elements(p_receipts) AS item(value);
  IF receipt_count <> cardinality(p_report_ids)
     OR eligible_count <> cardinality(p_report_ids)
     OR owner_count <> cardinality(p_report_ids)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_receipts) AS item(value)
       WHERE NOT ((value->>'report_id')::uuid = ANY(p_report_ids))
     )
     OR (SELECT count(DISTINCT value->>'email_hmac') FROM jsonb_array_elements(p_receipts) AS item(value)) <> cardinality(p_report_ids)
     OR (
       SELECT count(DISTINCT token_hash)
       FROM (
         SELECT value->>'accept_token_hash' AS token_hash FROM jsonb_array_elements(p_receipts) AS item(value)
         UNION ALL
         SELECT value->>'revoke_token_hash' AS token_hash FROM jsonb_array_elements(p_receipts) AS item(value)
       ) AS hashes
     ) <> cardinality(p_report_ids) * 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent receipts do not exactly cover distinct authenticated adults';
  END IF;

  PERFORM report.id
  FROM public.paid_reports AS report
  JOIN jsonb_array_elements(p_receipts) AS item(value)
    ON report.id = (item.value->>'report_id')::uuid
  WHERE report.id = ANY(p_report_ids)
    AND report.plan_code = 'C'
    AND report.status = 'completed'
    AND report.deleted_at IS NULL
    AND report.user_id IS NOT NULL
    AND report.user_id = (item.value->>'subject_user_id')::uuid
    AND COALESCE(report.birth_data->>'year', '') ~ '^[0-9]{4}$'
    AND COALESCE(report.birth_data->>'month', '') ~ '^[0-9]{1,2}$'
    AND COALESCE(report.birth_data->>'day', '') ~ '^[0-9]{1,2}$'
    AND make_date(
      (report.birth_data->>'year')::integer,
      (report.birth_data->>'month')::integer,
      (report.birth_data->>'day')::integer
    ) <= (timezone('Asia/Hong_Kong', clock_timestamp())::date - interval '18 years')::date
  FOR SHARE OF report;
  GET DIAGNOSTICS eligible_count = ROW_COUNT;
  IF eligible_count <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'g15 selected reports are not eligible adults bound to authenticated owners';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_purchaser_user_id::text || ':' || p_selected_report_ids_hash, 0)
  );

  SELECT * INTO existing_selection
  FROM public.g15_consent_selections
  WHERE purchaser_user_id = p_purchaser_user_id
    AND request_key = p_request_key
  FOR UPDATE;

  IF FOUND THEN
    IF existing_selection.request_payload_hash <> p_request_payload_hash
       OR existing_selection.selected_report_ids_hash <> p_selected_report_ids_hash
       OR existing_selection.selected_report_ids <> p_report_ids
       OR existing_selection.policy_version <> p_policy_version
       OR existing_selection.purpose <> p_purpose
       OR existing_selection.sharing_scope <> p_sharing_scope THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent request payload conflict';
    END IF;
    IF existing_selection.superseded_at IS NOT NULL
       OR existing_selection.expires_at <= clock_timestamp()
       OR existing_selection.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent request is no longer reusable';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.g15_consent_receipts AS stored
      JOIN jsonb_array_elements(p_receipts) AS item(value)
        ON stored.subject_report_id = (item.value->>'report_id')::uuid
      WHERE stored.selection_id = existing_selection.id
        AND stored.subject_user_id <> (item.value->>'subject_user_id')::uuid
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent subject owner drifted';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.g15_consent_receipts AS stored
      CROSS JOIN LATERAL jsonb_array_elements(p_receipts) AS item(value)
      WHERE stored.selection_id <> existing_selection.id
        AND (
          stored.accept_token_hash IN (item.value->>'accept_token_hash', item.value->>'revoke_token_hash')
          OR stored.revoke_token_hash IN (item.value->>'accept_token_hash', item.value->>'revoke_token_hash')
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'g15 consent token hash collision';
    END IF;

    UPDATE public.g15_consent_receipts AS receipt
    SET subject_email_hmac = item.value->>'email_hmac',
        accept_token_hash = item.value->>'accept_token_hash',
        revoke_token_hash = item.value->>'revoke_token_hash',
        expires_at = p_expires_at,
        updated_at = clock_timestamp()
    FROM jsonb_array_elements(p_receipts) AS item(value)
    WHERE receipt.selection_id = existing_selection.id
      AND receipt.subject_report_id = (item.value->>'report_id')::uuid
      AND receipt.subject_user_id = (item.value->>'subject_user_id')::uuid
      AND receipt.status = 'pending';
    GET DIAGNOSTICS receipt_count = ROW_COUNT;
    IF receipt_count = 0 THEN
      RETURN QUERY
      SELECT 'already'::text, existing_selection.id, receipt.status,
             receipt.subject_report_id, stored_selection.expires_at
      FROM public.g15_consent_receipts AS receipt
      JOIN public.g15_consent_selections AS stored_selection ON stored_selection.id = receipt.selection_id
      WHERE receipt.selection_id = existing_selection.id
      ORDER BY receipt.subject_report_id;
      RETURN;
    END IF;
    IF receipt_count = cardinality(p_report_ids) THEN
      UPDATE public.g15_consent_selections
      SET expires_at = p_expires_at, updated_at = clock_timestamp()
      WHERE id = existing_selection.id;
    ELSE
      UPDATE public.g15_consent_receipts AS pending_receipt
      SET expires_at = existing_selection.expires_at, updated_at = clock_timestamp()
      WHERE pending_receipt.selection_id = existing_selection.id
        AND pending_receipt.status = 'pending';
    END IF;

    RETURN QUERY
    SELECT CASE WHEN receipt.status = 'pending' THEN 'rotated' ELSE 'already' END,
           existing_selection.id, receipt.status, receipt.subject_report_id,
           stored_selection.expires_at
    FROM public.g15_consent_receipts AS receipt
    JOIN public.g15_consent_selections AS stored_selection ON stored_selection.id = receipt.selection_id
    WHERE receipt.selection_id = existing_selection.id
    ORDER BY receipt.subject_report_id;
    RETURN;
  END IF;

  SELECT array_agg(locked_selection.id) INTO active_selection_ids
  FROM (
    SELECT candidate.id
    FROM public.g15_consent_selections AS candidate
    WHERE candidate.purchaser_user_id = p_purchaser_user_id
      AND candidate.selected_report_ids_hash = p_selected_report_ids_hash
      AND candidate.superseded_at IS NULL
      AND candidate.consumed_at IS NULL
    FOR UPDATE
  ) AS locked_selection;

  IF active_selection_ids IS NOT NULL THEN
    UPDATE public.g15_consent_receipts AS old_receipt
    SET status = 'revoked',
        revoked_at = COALESCE(revoked_at, clock_timestamp()),
        accept_token_hash = NULL,
        revoke_token_hash = NULL,
        updated_at = clock_timestamp()
    WHERE old_receipt.selection_id = ANY(active_selection_ids)
      AND old_receipt.status IN ('pending', 'accepted');
    UPDATE public.g15_consent_selections AS old_selection
    SET superseded_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE old_selection.id = ANY(active_selection_ids);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.g15_consent_receipts AS stored
    CROSS JOIN LATERAL jsonb_array_elements(p_receipts) AS item(value)
    WHERE stored.accept_token_hash IN (item.value->>'accept_token_hash', item.value->>'revoke_token_hash')
       OR stored.revoke_token_hash IN (item.value->>'accept_token_hash', item.value->>'revoke_token_hash')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'g15 consent token hash collision';
  END IF;

  INSERT INTO public.g15_consent_selections(
    id, request_key, request_payload_hash, purchaser_user_id,
    selected_report_ids, selected_report_ids_hash, policy_version,
    purpose, sharing_scope, expires_at
  ) VALUES (
    p_selection_id, p_request_key, p_request_payload_hash, p_purchaser_user_id,
    p_report_ids, p_selected_report_ids_hash, p_policy_version,
    p_purpose, p_sharing_scope, p_expires_at
  );

  INSERT INTO public.g15_consent_receipts(
    id, selection_id, subject_report_id, subject_user_id, subject_email_hmac,
    status, expires_at, accept_token_hash, revoke_token_hash
  )
  SELECT
    md5(p_selection_id::text || ':' || (item.value->>'report_id'))::uuid,
    p_selection_id,
    (item.value->>'report_id')::uuid,
    (item.value->>'subject_user_id')::uuid,
    item.value->>'email_hmac',
    'pending',
    p_expires_at,
    item.value->>'accept_token_hash',
    item.value->>'revoke_token_hash'
  FROM jsonb_array_elements(p_receipts) AS item(value);
  GET DIAGNOSTICS receipt_count = ROW_COUNT;
  IF receipt_count <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'g15 consent receipt creation was incomplete';
  END IF;

  RETURN QUERY
  SELECT 'created'::text, p_selection_id, receipt.status, receipt.subject_report_id,
         stored_selection.expires_at
  FROM public.g15_consent_receipts AS receipt
  JOIN public.g15_consent_selections AS stored_selection ON stored_selection.id = receipt.selection_id
  WHERE receipt.selection_id = p_selection_id
  ORDER BY receipt.subject_report_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.transition_g15_consent(
  p_action text,
  p_token_hash text,
  p_subject_user_id uuid
)
RETURNS TABLE(
  outcome text,
  selection_id uuid,
  receipt_status text,
  subject_report_id uuid,
  policy_version text,
  purpose text,
  sharing_scope text,
  expires_at timestamp with time zone,
  consumed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  receipt public.g15_consent_receipts%ROWTYPE;
  selection public.g15_consent_selections%ROWTYPE;
  located_receipt_id uuid;
  located_selection_id uuid;
  matching_count integer;
BEGIN
  IF p_action NOT IN ('inspect', 'accept', 'revoke')
     OR p_token_hash !~ '^sha256:[0-9a-f]{64}$'
     OR p_subject_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent transition input is invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 0));
  SELECT count(*) INTO matching_count
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND (
      (p_action IN ('inspect', 'accept') AND candidate.accept_token_hash = p_token_hash)
      OR (p_action IN ('inspect', 'revoke') AND candidate.revoke_token_hash = p_token_hash)
    );
  IF matching_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  SELECT candidate.id, candidate.selection_id
    INTO located_receipt_id, located_selection_id
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND (
      (p_action IN ('inspect', 'accept') AND candidate.accept_token_hash = p_token_hash)
      OR (p_action IN ('inspect', 'revoke') AND candidate.revoke_token_hash = p_token_hash)
    );

  -- Every transition and the consume RPC lock selection first, then receipt.
  -- This gives revoke-vs-consume one serial order instead of a lock inversion.
  SELECT * INTO selection
  FROM public.g15_consent_selections
  WHERE id = located_selection_id
  FOR UPDATE;

  SELECT locked_receipt.* INTO receipt
  FROM public.g15_consent_receipts AS locked_receipt
  WHERE locked_receipt.id = located_receipt_id
    AND locked_receipt.selection_id = selection.id
    AND locked_receipt.subject_user_id = p_subject_user_id
    AND (
      (p_action IN ('inspect', 'accept') AND locked_receipt.accept_token_hash = p_token_hash)
      OR (p_action IN ('inspect', 'revoke') AND locked_receipt.revoke_token_hash = p_token_hash)
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;

  IF selection.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT
      'consumed'::text, selection.id, receipt.status, receipt.subject_report_id,
      selection.policy_version, selection.purpose, selection.sharing_scope,
      selection.expires_at, selection.consumed_at;
    RETURN;
  END IF;

  IF selection.superseded_at IS NOT NULL
     OR selection.expires_at <= clock_timestamp()
     OR receipt.expires_at <= clock_timestamp() THEN
    UPDATE public.g15_consent_receipts AS expired_receipt
    SET status = 'expired', accept_token_hash = NULL, revoke_token_hash = NULL,
        updated_at = clock_timestamp()
    WHERE expired_receipt.id = receipt.id AND expired_receipt.status <> 'revoked';
    receipt.status := 'expired';
    RETURN QUERY SELECT
      'expired'::text, selection.id, receipt.status, receipt.subject_report_id,
      selection.policy_version, selection.purpose, selection.sharing_scope,
      selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;

  IF p_action = 'accept' THEN
    IF receipt.status <> 'pending' OR receipt.accept_token_hash IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot be accepted from current state';
    END IF;
    UPDATE public.g15_consent_receipts
    SET status = 'accepted', accepted_at = clock_timestamp(), accept_token_hash = NULL,
        updated_at = clock_timestamp()
    WHERE id = receipt.id;
    receipt.status := 'accepted';
    RETURN QUERY SELECT
      'accepted'::text, selection.id, receipt.status, receipt.subject_report_id,
      selection.policy_version, selection.purpose, selection.sharing_scope,
      selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;

  IF p_action = 'revoke' THEN
    IF receipt.status NOT IN ('pending', 'accepted') OR receipt.revoke_token_hash IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot be revoked from current state';
    END IF;
    UPDATE public.g15_consent_receipts
    SET status = 'revoked', revoked_at = clock_timestamp(), accept_token_hash = NULL,
        revoke_token_hash = NULL, updated_at = clock_timestamp()
    WHERE id = receipt.id;
    receipt.status := 'revoked';
    RETURN QUERY SELECT
      'revoked'::text, selection.id, receipt.status, receipt.subject_report_id,
      selection.policy_version, selection.purpose, selection.sharing_scope,
      selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'inspected'::text, selection.id, receipt.status, receipt.subject_report_id,
    selection.policy_version, selection.purpose, selection.sharing_scope,
    selection.expires_at, NULL::timestamp with time zone;
END
$function$;

CREATE OR REPLACE FUNCTION public.consume_g15_consent_for_order(
  p_selection_id uuid,
  p_purchaser_user_id uuid,
  p_stripe_session_id text,
  p_report_id uuid
)
RETURNS TABLE(
  outcome text,
  selection_id uuid,
  selected_report_ids uuid[],
  selected_report_ids_hash text,
  policy_version text,
  purpose text,
  sharing_scope text,
  selection_expires_at timestamp with time zone,
  accepted_at_by_report jsonb,
  subject_user_ids_by_report jsonb,
  consumed_at timestamp with time zone,
  stripe_session_id text,
  report_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  selection public.g15_consent_selections%ROWTYPE;
  receipt_count integer;
  eligible_count integer;
  consume_outcome text;
BEGIN
  IF p_selection_id IS NULL OR p_purchaser_user_id IS NULL OR p_report_id IS NULL
     OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent order binding is invalid';
  END IF;

  SELECT * INTO selection
  FROM public.g15_consent_selections
  WHERE id = p_selection_id AND purchaser_user_id = p_purchaser_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent selection not found';
  END IF;

  IF selection.consumed_at IS NOT NULL THEN
    IF selection.consumed_stripe_session_id <> p_stripe_session_id THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent already consumed by another order';
    END IF;
    consume_outcome := 'already_consumed';
  ELSE
    IF selection.superseded_at IS NOT NULL OR selection.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent is expired or superseded';
    END IF;
    consume_outcome := 'consumed';
  END IF;

  PERFORM 1
  FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id
  ORDER BY receipt.id
  FOR UPDATE;

  SELECT count(*) INTO receipt_count
  FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id
    AND receipt.subject_report_id = ANY(selection.selected_report_ids)
    AND receipt.status = 'accepted'
    AND receipt.accepted_at IS NOT NULL
    AND receipt.revoked_at IS NULL
    AND receipt.accept_token_hash IS NULL
    AND receipt.revoke_token_hash ~ '^sha256:[0-9a-f]{64}$'
    AND (selection.consumed_at IS NOT NULL OR receipt.expires_at > clock_timestamp());
  IF receipt_count <> cardinality(selection.selected_report_ids)
     OR (SELECT count(*) FROM public.g15_consent_receipts AS all_receipts
         WHERE all_receipts.selection_id = selection.id)
        <> cardinality(selection.selected_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent receipt set is not fully accepted';
  END IF;

  PERFORM report.id
  FROM public.paid_reports AS report
  JOIN public.g15_consent_receipts AS receipt
    ON receipt.selection_id = selection.id AND receipt.subject_report_id = report.id
  WHERE report.id = ANY(selection.selected_report_ids)
    AND report.plan_code = 'C'
    AND report.status = 'completed'
    AND report.deleted_at IS NULL
    AND report.user_id IS NOT NULL
    AND report.user_id = receipt.subject_user_id
    AND COALESCE(report.birth_data->>'year', '') ~ '^[0-9]{4}$'
    AND COALESCE(report.birth_data->>'month', '') ~ '^[0-9]{1,2}$'
    AND COALESCE(report.birth_data->>'day', '') ~ '^[0-9]{1,2}$'
    AND make_date(
      (report.birth_data->>'year')::integer,
      (report.birth_data->>'month')::integer,
      (report.birth_data->>'day')::integer
    ) <= (timezone('Asia/Hong_Kong', clock_timestamp())::date - interval '18 years')::date
  FOR SHARE OF report;
  GET DIAGNOSTICS eligible_count = ROW_COUNT;
  IF eligible_count <> cardinality(selection.selected_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 report owner binding changed before order consumption';
  END IF;

  IF selection.consumed_at IS NULL THEN
    UPDATE public.g15_consent_selections AS consumed_selection
    SET consumed_at = clock_timestamp(),
        consumed_stripe_session_id = p_stripe_session_id,
        consumed_report_id = p_report_id,
        updated_at = clock_timestamp()
    WHERE consumed_selection.id = selection.id AND consumed_selection.consumed_at IS NULL
    RETURNING consumed_selection.* INTO selection;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'g15 consent consume compare-and-swap lost';
    END IF;
  END IF;

  RETURN QUERY
  SELECT consume_outcome, selection.id, selection.selected_report_ids,
         selection.selected_report_ids_hash, selection.policy_version,
         selection.purpose, selection.sharing_scope, selection.expires_at,
         (SELECT jsonb_object_agg(receipt.subject_report_id::text, receipt.accepted_at)
          FROM public.g15_consent_receipts AS receipt WHERE receipt.selection_id = selection.id),
         (SELECT jsonb_object_agg(receipt.subject_report_id::text, receipt.subject_user_id::text)
          FROM public.g15_consent_receipts AS receipt WHERE receipt.selection_id = selection.id),
         selection.consumed_at, selection.consumed_stripe_session_id, selection.consumed_report_id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_or_replace_g15_consent_selection(
  uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_or_replace_g15_consent_selection(
  uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.create_or_replace_g15_consent_selection(
  uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_replace_g15_consent_selection(
  uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transition_g15_consent(text,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.consume_g15_consent_for_order(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_g15_consent_for_order(uuid,uuid,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consume_g15_consent_for_order(uuid,uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_g15_consent_for_order(uuid,uuid,text,uuid) TO service_role;

DO $postcondition$
DECLARE
  fn_create oid := 'public.create_or_replace_g15_consent_selection(uuid,uuid,text,uuid,uuid[],text,text,text,text,timestamp with time zone,jsonb)'::regprocedure::oid;
  fn_transition oid := 'public.transition_g15_consent(text,text,uuid)'::regprocedure::oid;
  fn_consume oid := 'public.consume_g15_consent_for_order(uuid,uuid,text,uuid)'::regprocedure::oid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN ('public.g15_consent_selections'::regclass, 'public.g15_consent_receipts'::regclass)
      AND (relowner <> current_user::regrole OR NOT relrowsecurity OR NOT relforcerowsecurity)
  )
  OR has_table_privilege('anon', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  OR NOT has_table_privilege('service_role', 'public.g15_consent_selections', 'SELECT,INSERT,UPDATE,DELETE')
  OR NOT has_table_privilege('service_role', 'public.g15_consent_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  OR EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid IN (fn_create, fn_transition, fn_consume)
      AND (
        proowner <> current_user::regrole OR NOT prosecdef
        OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
      )
  )
  OR has_function_privilege('anon', fn_create, 'EXECUTE')
  OR has_function_privilege('authenticated', fn_create, 'EXECUTE')
  OR NOT has_function_privilege('service_role', fn_create, 'EXECUTE')
  OR has_function_privilege('anon', fn_transition, 'EXECUTE')
  OR has_function_privilege('authenticated', fn_transition, 'EXECUTE')
  OR NOT has_function_privilege('service_role', fn_transition, 'EXECUTE')
  OR has_function_privilege('anon', fn_consume, 'EXECUTE')
  OR has_function_privilege('authenticated', fn_consume, 'EXECUTE')
  OR NOT has_function_privilege('service_role', fn_consume, 'EXECUTE') THEN
    RAISE EXCEPTION 'g15 consent postcondition failed';
  END IF;
END
$postcondition$;

COMMIT;
