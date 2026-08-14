BEGIN;
SET LOCAL search_path = public, pg_catalog;

DO $g15_reservation_replay_preflight$
DECLARE
  actual_columns integer;
  exact_columns integer;
  actual_constraints integer;
  exact_constraints integer;
  actual_custom_indexes integer;
  exact_custom_indexes integer;
BEGIN
  IF to_regclass('public.g15_checkout_consent_reservations') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'g15_checkout_consent_reservations';

  SELECT count(*) INTO exact_columns
  FROM information_schema.columns AS column_info
  JOIN (VALUES
    ('id','uuid','NO'),
    ('selection_id','uuid','NO'),
    ('purchaser_user_id','uuid','NO'),
    ('request_payload_hash','text','NO'),
    ('checkout_draft_id','uuid','NO'),
    ('report_id','uuid','NO'),
    ('status','text','NO'),
    ('stripe_session_id','text','YES'),
    ('reserved_at','timestamp with time zone','NO'),
    ('bound_at','timestamp with time zone','YES'),
    ('consumed_at','timestamp with time zone','YES'),
    ('expires_at','timestamp with time zone','NO'),
    ('updated_at','timestamp with time zone','NO')
  ) AS expected(column_name, data_type, is_nullable)
    ON expected.column_name = column_info.column_name
   AND expected.data_type = column_info.data_type
   AND expected.is_nullable = column_info.is_nullable
  WHERE column_info.table_schema = 'public'
    AND column_info.table_name = 'g15_checkout_consent_reservations';

  IF actual_columns <> 13 OR exact_columns <> 13 THEN
    RAISE EXCEPTION 'g15 checkout reservation preflight failed: table schema drifted';
  END IF;

  SELECT count(*) INTO actual_constraints
  FROM pg_constraint AS constraint_info
  WHERE constraint_info.conrelid = 'public.g15_checkout_consent_reservations'::regclass;
  SELECT count(*) INTO exact_constraints
  FROM pg_constraint AS constraint_info
  JOIN (VALUES
    ('g15_checkout_consent_reservations_pkey', 'p',
      $constraint$PRIMARY KEY (id)$constraint$),
    ('g15_checkout_consent_reservations_selection_id_fkey', 'f',
      $constraint$FOREIGN KEY (selection_id) REFERENCES g15_consent_selections(id) ON DELETE RESTRICT$constraint$),
    ('g15_checkout_consent_reservations_checkout_draft_id_fkey', 'f',
      $constraint$FOREIGN KEY (checkout_draft_id) REFERENCES checkout_drafts(id) ON DELETE RESTRICT$constraint$),
    ('g15_checkout_consent_reservations_request_payload_hash_check', 'c',
      $constraint$CHECK ((request_payload_hash ~ '^sha256:[0-9a-f]{64}$'::text))$constraint$),
    ('g15_checkout_consent_reservations_status_check', 'c',
      $constraint$CHECK ((status = ANY (ARRAY['reserved'::text, 'bound'::text, 'consumed'::text, 'expired'::text, 'released'::text])))$constraint$),
    ('g15_checkout_consent_reservation_binding_check', 'c',
      $constraint$CHECK ((((status = 'reserved'::text) AND (stripe_session_id IS NULL) AND (bound_at IS NULL) AND (consumed_at IS NULL)) OR ((status = 'bound'::text) AND (stripe_session_id IS NOT NULL) AND (bound_at IS NOT NULL) AND (consumed_at IS NULL)) OR ((status = 'consumed'::text) AND (stripe_session_id IS NOT NULL) AND (bound_at IS NOT NULL) AND (consumed_at IS NOT NULL)) OR ((status = ANY (ARRAY['expired'::text, 'released'::text])) AND (consumed_at IS NULL))))$constraint$)
  ) AS expected(conname, contype, definition)
    ON expected.conname = constraint_info.conname
   AND expected.contype = constraint_info.contype::text
   AND expected.definition = pg_get_constraintdef(constraint_info.oid)
  WHERE constraint_info.conrelid = 'public.g15_checkout_consent_reservations'::regclass;
  IF actual_constraints <> 6 OR exact_constraints <> 6 THEN
    RAISE EXCEPTION 'g15 checkout reservation preflight failed: constraint definitions drifted';
  END IF;

  SELECT count(*) INTO actual_custom_indexes
  FROM pg_indexes AS index_info
  WHERE index_info.schemaname = 'public'
    AND index_info.tablename = 'g15_checkout_consent_reservations'
    AND index_info.indexname <> 'g15_checkout_consent_reservations_pkey';
  SELECT count(*) INTO exact_custom_indexes
  FROM pg_indexes AS index_info
  JOIN (VALUES
    ('g15_checkout_consent_active_selection_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_active_selection_unique ON public.g15_checkout_consent_reservations USING btree (selection_id) WHERE (status = ANY (ARRAY['reserved'::text, 'bound'::text, 'consumed'::text]))$index$),
    ('g15_checkout_consent_draft_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_draft_unique ON public.g15_checkout_consent_reservations USING btree (checkout_draft_id)$index$),
    ('g15_checkout_consent_report_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_report_unique ON public.g15_checkout_consent_reservations USING btree (report_id)$index$),
    ('g15_checkout_consent_stripe_session_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_stripe_session_unique ON public.g15_checkout_consent_reservations USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL)$index$)
  ) AS expected(indexname, indexdef)
    ON expected.indexname = index_info.indexname
   AND expected.indexdef = index_info.indexdef
  WHERE index_info.schemaname = 'public'
    AND index_info.tablename = 'g15_checkout_consent_reservations';
  IF actual_custom_indexes <> 4 OR exact_custom_indexes <> 4 THEN
    RAISE EXCEPTION 'g15 checkout reservation preflight failed: index definitions drifted';
  END IF;
END
$g15_reservation_replay_preflight$;

CREATE TABLE IF NOT EXISTS public.g15_checkout_consent_reservations (
  id uuid PRIMARY KEY,
  selection_id uuid NOT NULL REFERENCES public.g15_consent_selections(id) ON DELETE RESTRICT,
  purchaser_user_id uuid NOT NULL,
  request_payload_hash text NOT NULL CHECK (request_payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  checkout_draft_id uuid NOT NULL REFERENCES public.checkout_drafts(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'bound', 'consumed', 'expired', 'released')),
  stripe_session_id text,
  reserved_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  bound_at timestamp with time zone,
  consumed_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT g15_checkout_consent_reservation_binding_check CHECK (
    (status = 'reserved' AND stripe_session_id IS NULL AND bound_at IS NULL AND consumed_at IS NULL)
    OR (status = 'bound' AND stripe_session_id IS NOT NULL AND bound_at IS NOT NULL AND consumed_at IS NULL)
    OR (status = 'consumed' AND stripe_session_id IS NOT NULL AND bound_at IS NOT NULL AND consumed_at IS NOT NULL)
    OR (status IN ('expired', 'released') AND consumed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS g15_checkout_consent_active_selection_unique
  ON public.g15_checkout_consent_reservations(selection_id)
  WHERE status IN ('reserved', 'bound', 'consumed');
CREATE UNIQUE INDEX IF NOT EXISTS g15_checkout_consent_draft_unique
  ON public.g15_checkout_consent_reservations(checkout_draft_id);
CREATE UNIQUE INDEX IF NOT EXISTS g15_checkout_consent_report_unique
  ON public.g15_checkout_consent_reservations(report_id);
CREATE UNIQUE INDEX IF NOT EXISTS g15_checkout_consent_stripe_session_unique
  ON public.g15_checkout_consent_reservations(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

ALTER TABLE public.g15_checkout_consent_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g15_checkout_consent_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.g15_checkout_consent_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.g15_checkout_consent_reservations FROM anon;
REVOKE ALL ON TABLE public.g15_checkout_consent_reservations FROM authenticated;

-- Once checkout has reserved a consent selection, another tab/request must not
-- supersede that selection while the Stripe Session can still be paid. The
-- predecessor create_or_replace RPC updates receipts before superseded_at; a
-- trigger exception aborts the whole statement, rolling both mutations back.
-- Both paths lock the same selection row, so reserve-vs-replace is serialized.
CREATE OR REPLACE FUNCTION public.fence_g15_reserved_selection_supersede()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
     AND NEW.superseded_at IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.g15_checkout_consent_reservations AS reservation
       WHERE reservation.selection_id = OLD.id
         AND reservation.status IN ('reserved', 'bound', 'consumed')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'g15 consent selection has an active checkout reservation';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS fence_g15_reserved_selection_supersede
  ON public.g15_consent_selections;
CREATE TRIGGER fence_g15_reserved_selection_supersede
BEFORE UPDATE OF superseded_at ON public.g15_consent_selections
FOR EACH ROW
EXECUTE FUNCTION public.fence_g15_reserved_selection_supersede();

REVOKE ALL ON FUNCTION public.fence_g15_reserved_selection_supersede() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fence_g15_reserved_selection_supersede() FROM anon;
REVOKE ALL ON FUNCTION public.fence_g15_reserved_selection_supersede() FROM authenticated;

CREATE OR REPLACE FUNCTION public.reserve_g15_consent_for_checkout(
  p_selection_id uuid,
  p_purchaser_user_id uuid,
  p_reservation_id uuid,
  p_request_payload_hash text,
  p_birth_data jsonb,
  p_locale text,
  p_expires_at timestamp with time zone
)
RETURNS TABLE(
  outcome text,
  reservation_id uuid,
  checkout_draft_id uuid,
  report_id uuid,
  reservation_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  selection public.g15_consent_selections%ROWTYPE;
  existing_reservation public.g15_checkout_consent_reservations%ROWTYPE;
  requested_report_ids uuid[];
  accepted_at_by_report jsonb;
  subject_user_ids_by_report jsonb;
  canonical_birth_data jsonb;
  receipt_count integer;
  eligible_count integer;
  draft_hash text := md5(p_reservation_id::text || ':draft');
  report_hash text := md5(p_reservation_id::text || ':report');
  draft_id uuid := (
    substr(draft_hash, 1, 12) || '4' || substr(draft_hash, 14, 3)
    || '8' || substr(draft_hash, 18, 15)
  )::uuid;
  reserved_report_id uuid := (
    substr(report_hash, 1, 12) || '4' || substr(report_hash, 14, 3)
    || '8' || substr(report_hash, 18, 15)
  )::uuid;
BEGIN
  IF p_selection_id IS NULL OR p_purchaser_user_id IS NULL OR p_reservation_id IS NULL
     OR p_request_payload_hash !~ '^sha256:[0-9a-f]{64}$'
     OR jsonb_typeof(p_birth_data) <> 'object'
     OR p_birth_data->>'plan_type' <> 'family_reports'
     OR p_birth_data->>'consent_selection_id' <> p_selection_id::text
     OR jsonb_typeof(p_birth_data->'report_ids') <> 'array'
     OR COALESCE(NULLIF(btrim(p_locale), ''), '') = ''
     OR p_expires_at < clock_timestamp() + interval '30 minutes'
     OR p_expires_at > clock_timestamp() + interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 checkout reservation input is invalid';
  END IF;

  SELECT array_agg(value::uuid ORDER BY value::uuid) INTO requested_report_ids
  FROM jsonb_array_elements_text(p_birth_data->'report_ids') AS item(value)
  WHERE value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

  PERFORM pg_advisory_xact_lock(hashtextextended(p_selection_id::text, 0));
  SELECT * INTO selection
  FROM public.g15_consent_selections
  WHERE id = p_selection_id AND purchaser_user_id = p_purchaser_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent selection not found';
  END IF;

  SELECT * INTO existing_reservation
  FROM public.g15_checkout_consent_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing_reservation.selection_id <> p_selection_id
       OR existing_reservation.purchaser_user_id <> p_purchaser_user_id
       OR existing_reservation.request_payload_hash <> p_request_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 checkout reservation payload conflict';
    END IF;
    IF existing_reservation.status = 'reserved' AND existing_reservation.expires_at > clock_timestamp() THEN
      RETURN QUERY SELECT 'already_reserved'::text, existing_reservation.id,
        existing_reservation.checkout_draft_id, existing_reservation.report_id,
        existing_reservation.expires_at;
      RETURN;
    END IF;
    IF existing_reservation.status = 'bound' THEN
      RETURN QUERY SELECT 'already_bound'::text, existing_reservation.id,
        existing_reservation.checkout_draft_id, existing_reservation.report_id,
        existing_reservation.expires_at;
      RETURN;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 checkout reservation is no longer reusable';
  END IF;

  IF selection.consumed_at IS NOT NULL
     OR selection.consumed_stripe_session_id IS NOT NULL
     OR selection.consumed_report_id IS NOT NULL
     OR selection.superseded_at IS NOT NULL
     OR selection.expires_at <= p_expires_at
     OR requested_report_ids IS NULL
     OR jsonb_array_length(p_birth_data->'report_ids') <> cardinality(requested_report_ids)
     OR cardinality(requested_report_ids) <> cardinality(selection.selected_report_ids)
     OR requested_report_ids <> (SELECT array_agg(value ORDER BY value) FROM unnest(selection.selected_report_ids) AS item(value)) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot authorize this checkout reservation';
  END IF;

  UPDATE public.g15_checkout_consent_reservations AS expired_reservation
  SET status = 'expired', updated_at = clock_timestamp()
  WHERE expired_reservation.selection_id = selection.id
    AND expired_reservation.status = 'reserved'
    AND expired_reservation.expires_at <= clock_timestamp();

  IF EXISTS (
    SELECT 1 FROM public.g15_checkout_consent_reservations AS active_reservation
    WHERE active_reservation.selection_id = selection.id
      AND active_reservation.status IN ('reserved', 'bound', 'consumed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent already has an active checkout reservation';
  END IF;

  PERFORM 1
  FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id
  ORDER BY receipt.id
  FOR UPDATE;

  SELECT count(*),
         jsonb_object_agg(receipt.subject_report_id::text, receipt.accepted_at),
         jsonb_object_agg(receipt.subject_report_id::text, receipt.subject_user_id::text)
    INTO receipt_count, accepted_at_by_report, subject_user_ids_by_report
  FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id
    AND receipt.subject_report_id = ANY(selection.selected_report_ids)
    AND receipt.status = 'accepted'
    AND receipt.accepted_at IS NOT NULL
    AND receipt.revoked_at IS NULL
    AND receipt.accept_token_hash IS NULL
    AND receipt.revoke_token_hash ~ '^sha256:[0-9a-f]{64}$'
    AND receipt.expires_at > p_expires_at;
  IF receipt_count <> cardinality(selection.selected_report_ids)
     OR (SELECT count(*) FROM public.g15_consent_receipts AS all_receipts
         WHERE all_receipts.selection_id = selection.id) <> cardinality(selection.selected_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent receipt set is not fully accepted for checkout reservation';
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
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 report owner binding changed before checkout reservation';
  END IF;

  canonical_birth_data := p_birth_data || jsonb_build_object(
    'report_ids', to_jsonb(selection.selected_report_ids),
    'consent_selection_id', selection.id::text,
    'consent_authority', jsonb_build_object(
      'selection_id', selection.id::text,
      'policy_version', selection.policy_version,
      'purpose', selection.purpose,
      'sharing_scope', selection.sharing_scope,
      'expires_at', to_jsonb(selection.expires_at),
      'accepted_at_by_report', accepted_at_by_report,
      'subject_user_ids_by_report', subject_user_ids_by_report
    )
  );

  INSERT INTO public.checkout_drafts(id, plan_code, birth_data, locale, used_at)
  VALUES (draft_id, 'G15', canonical_birth_data, btrim(p_locale), NULL);
  INSERT INTO public.g15_checkout_consent_reservations(
    id, selection_id, purchaser_user_id, request_payload_hash,
    checkout_draft_id, report_id, status, expires_at
  ) VALUES (
    p_reservation_id, selection.id, p_purchaser_user_id, p_request_payload_hash,
    draft_id, reserved_report_id, 'reserved', p_expires_at
  );

  RETURN QUERY SELECT 'reserved'::text, p_reservation_id, draft_id,
    reserved_report_id, p_expires_at;
END
$function$;

CREATE OR REPLACE FUNCTION public.bind_g15_checkout_consent_session(
  p_reservation_id uuid,
  p_purchaser_user_id uuid,
  p_stripe_session_id text
)
RETURNS TABLE(outcome text, reservation_id uuid, checkout_draft_id uuid, report_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  reservation public.g15_checkout_consent_reservations%ROWTYPE;
  selection_id uuid;
BEGIN
  IF p_reservation_id IS NULL OR p_purchaser_user_id IS NULL
     OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 checkout session binding is invalid';
  END IF;
  SELECT candidate.selection_id INTO selection_id
  FROM public.g15_checkout_consent_reservations AS candidate
  WHERE candidate.id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 checkout reservation not found';
  END IF;
  PERFORM 1 FROM public.g15_consent_selections WHERE id = selection_id FOR UPDATE;
  SELECT * INTO reservation
  FROM public.g15_checkout_consent_reservations
  WHERE id = p_reservation_id AND purchaser_user_id = p_purchaser_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 checkout reservation not found';
  END IF;
  IF reservation.status = 'bound' AND reservation.stripe_session_id = p_stripe_session_id THEN
    RETURN QUERY SELECT 'already_bound'::text, reservation.id,
      reservation.checkout_draft_id, reservation.report_id;
    RETURN;
  END IF;
  IF reservation.status <> 'reserved' OR reservation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 checkout reservation cannot bind this session';
  END IF;
  UPDATE public.g15_checkout_consent_reservations AS bound_reservation
  SET status = 'bound', stripe_session_id = p_stripe_session_id,
      bound_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE bound_reservation.id = reservation.id
  RETURNING bound_reservation.* INTO reservation;
  RETURN QUERY SELECT 'bound'::text, reservation.id,
    reservation.checkout_draft_id, reservation.report_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.consume_g15_checkout_consent_for_order(
  p_reservation_id uuid,
  p_purchaser_user_id uuid,
  p_stripe_session_id text
)
RETURNS TABLE(
  outcome text,
  reservation_id uuid,
  selection_id uuid,
  checkout_draft_id uuid,
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
  reservation public.g15_checkout_consent_reservations%ROWTYPE;
  selection public.g15_consent_selections%ROWTYPE;
  located_selection_id uuid;
  receipt_count integer;
  eligible_count integer;
  consume_outcome text;
BEGIN
  IF p_reservation_id IS NULL OR p_purchaser_user_id IS NULL
     OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 checkout consumption input is invalid';
  END IF;
  SELECT candidate.selection_id INTO located_selection_id
  FROM public.g15_checkout_consent_reservations AS candidate
  WHERE candidate.id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 checkout reservation not found';
  END IF;
  SELECT * INTO selection
  FROM public.g15_consent_selections
  WHERE id = located_selection_id AND purchaser_user_id = p_purchaser_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent selection not found';
  END IF;
  PERFORM 1 FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id ORDER BY receipt.id FOR UPDATE;
  SELECT locked_reservation.* INTO reservation
  FROM public.g15_checkout_consent_reservations AS locked_reservation
  WHERE locked_reservation.id = p_reservation_id
    AND locked_reservation.selection_id = selection.id
    AND locked_reservation.purchaser_user_id = p_purchaser_user_id
  FOR UPDATE;
  IF NOT FOUND OR reservation.stripe_session_id <> p_stripe_session_id
     OR reservation.status NOT IN ('bound', 'consumed') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 checkout reservation is not bound to this paid session';
  END IF;

  IF selection.consumed_at IS NOT NULL THEN
    IF selection.consumed_stripe_session_id <> p_stripe_session_id
       OR selection.consumed_report_id <> reservation.report_id
       OR reservation.status <> 'consumed' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent was consumed by another order';
    END IF;
    consume_outcome := 'already_consumed';
  ELSE
    IF selection.superseded_at IS NOT NULL OR reservation.status <> 'bound' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 checkout reservation cannot be consumed';
    END IF;
    consume_outcome := 'consumed';
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.g15_consent_receipts AS receipt
  WHERE receipt.selection_id = selection.id
    AND receipt.subject_report_id = ANY(selection.selected_report_ids)
    AND receipt.status = 'accepted'
    AND receipt.accepted_at IS NOT NULL
    AND receipt.revoked_at IS NULL
    AND receipt.accept_token_hash IS NULL
    AND receipt.revoke_token_hash ~ '^sha256:[0-9a-f]{64}$';
  IF receipt_count <> cardinality(selection.selected_report_ids)
     OR (SELECT count(*) FROM public.g15_consent_receipts AS all_receipts
         WHERE all_receipts.selection_id = selection.id) <> cardinality(selection.selected_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 reserved consent receipt set drifted before payment';
  END IF;

  PERFORM report.id
  FROM public.paid_reports AS report
  JOIN public.g15_consent_receipts AS receipt
    ON receipt.selection_id = selection.id AND receipt.subject_report_id = report.id
  WHERE report.id = ANY(selection.selected_report_ids)
    AND report.plan_code = 'C' AND report.status = 'completed'
    AND report.deleted_at IS NULL AND report.user_id = receipt.subject_user_id
  FOR SHARE OF report;
  GET DIAGNOSTICS eligible_count = ROW_COUNT;
  IF eligible_count <> cardinality(selection.selected_report_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 report owner binding changed before payment';
  END IF;

  IF selection.consumed_at IS NULL THEN
    UPDATE public.g15_consent_selections AS consumed_selection
    SET consumed_at = clock_timestamp(),
        consumed_stripe_session_id = p_stripe_session_id,
        consumed_report_id = reservation.report_id,
        updated_at = clock_timestamp()
    WHERE consumed_selection.id = selection.id AND consumed_selection.consumed_at IS NULL
    RETURNING consumed_selection.* INTO selection;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'g15 reserved consent consume compare-and-swap lost';
    END IF;
    UPDATE public.g15_checkout_consent_reservations AS consumed_reservation
    SET status = 'consumed', consumed_at = selection.consumed_at,
        updated_at = clock_timestamp()
    WHERE consumed_reservation.id = reservation.id
    RETURNING consumed_reservation.* INTO reservation;
  END IF;

  RETURN QUERY SELECT consume_outcome, reservation.id, selection.id,
    reservation.checkout_draft_id, selection.selected_report_ids,
    selection.selected_report_ids_hash, selection.policy_version,
    selection.purpose, selection.sharing_scope, selection.expires_at,
    (SELECT jsonb_object_agg(receipt.subject_report_id::text, receipt.accepted_at)
     FROM public.g15_consent_receipts AS receipt WHERE receipt.selection_id = selection.id),
    (SELECT jsonb_object_agg(receipt.subject_report_id::text, receipt.subject_user_id::text)
     FROM public.g15_consent_receipts AS receipt WHERE receipt.selection_id = selection.id),
    selection.consumed_at, selection.consumed_stripe_session_id,
    selection.consumed_report_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.release_g15_checkout_consent_reservation(
  p_reservation_id uuid,
  p_stripe_session_id text
)
RETURNS TABLE(outcome text, reservation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  reservation public.g15_checkout_consent_reservations%ROWTYPE;
  located_selection_id uuid;
BEGIN
  IF p_reservation_id IS NULL
     OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 checkout reservation release input is invalid';
  END IF;
  SELECT candidate.selection_id INTO located_selection_id
  FROM public.g15_checkout_consent_reservations AS candidate
  WHERE candidate.id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 checkout reservation not found';
  END IF;
  PERFORM 1 FROM public.g15_consent_selections WHERE id = located_selection_id FOR UPDATE;
  SELECT * INTO reservation
  FROM public.g15_checkout_consent_reservations
  WHERE id = p_reservation_id AND stripe_session_id = p_stripe_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 checkout reservation not found';
  END IF;
  IF reservation.status = 'consumed' THEN
    RETURN QUERY SELECT 'already_consumed'::text, reservation.id;
    RETURN;
  END IF;
  IF reservation.status = 'released' THEN
    RETURN QUERY SELECT 'already_released'::text, reservation.id;
    RETURN;
  END IF;
  IF reservation.status <> 'bound' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 checkout reservation cannot be released';
  END IF;
  UPDATE public.g15_checkout_consent_reservations AS released_reservation
  SET status = 'released', updated_at = clock_timestamp()
  WHERE released_reservation.id = reservation.id;
  RETURN QUERY SELECT 'released'::text, reservation.id;
END
$function$;

-- A revoke has two phases only when a Stripe Session is already bound. The
-- prepare phase never marks consent revoked while a provider payment page can
-- still complete. Reserved (not yet bound) rows can be released atomically.
CREATE OR REPLACE FUNCTION public.prepare_g15_consent_revocation(
  p_token_hash text,
  p_subject_user_id uuid
)
RETURNS TABLE(
  outcome text, selection_id uuid, receipt_status text, subject_report_id uuid,
  policy_version text, purpose text, sharing_scope text,
  expires_at timestamp with time zone, consumed_at timestamp with time zone,
  checkout_reservation_id uuid, checkout_stripe_session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  receipt public.g15_consent_receipts%ROWTYPE;
  selection public.g15_consent_selections%ROWTYPE;
  active_reservation public.g15_checkout_consent_reservations%ROWTYPE;
  located_receipt_id uuid;
  located_selection_id uuid;
  matching_count integer;
BEGIN
  IF p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_subject_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent revocation input is invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 0));
  SELECT count(*) INTO matching_count
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND candidate.revoke_token_hash = p_token_hash;
  IF matching_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  SELECT candidate.id, candidate.selection_id
    INTO located_receipt_id, located_selection_id
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND candidate.revoke_token_hash = p_token_hash;

  SELECT * INTO selection
  FROM public.g15_consent_selections AS locked_selection
  WHERE locked_selection.id = located_selection_id
  FOR UPDATE;
  SELECT locked_receipt.* INTO receipt
  FROM public.g15_consent_receipts AS locked_receipt
  WHERE locked_receipt.id = located_receipt_id
    AND locked_receipt.selection_id = selection.id
    AND locked_receipt.subject_user_id = p_subject_user_id
    AND locked_receipt.revoke_token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;

  IF selection.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, selection.consumed_at,
      NULL::uuid, selection.consumed_stripe_session_id;
    RETURN;
  END IF;

  UPDATE public.g15_checkout_consent_reservations AS expired_reservation
  SET status = 'expired', updated_at = clock_timestamp()
  WHERE expired_reservation.selection_id = selection.id
    AND expired_reservation.status = 'reserved'
    AND expired_reservation.expires_at <= clock_timestamp();

  SELECT candidate.* INTO active_reservation
  FROM public.g15_checkout_consent_reservations AS candidate
  WHERE candidate.selection_id = selection.id
    AND (
      candidate.status = 'bound'
      OR (candidate.status = 'reserved' AND candidate.expires_at > clock_timestamp())
    )
  FOR UPDATE;

  IF FOUND AND active_reservation.status = 'bound' THEN
    RETURN QUERY SELECT 'provider_expire_required'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone,
      active_reservation.id, active_reservation.stripe_session_id;
    RETURN;
  END IF;

  IF selection.superseded_at IS NOT NULL OR selection.expires_at <= clock_timestamp()
     OR receipt.expires_at <= clock_timestamp() THEN
    UPDATE public.g15_consent_receipts AS expired_receipt
    SET status = 'expired', accept_token_hash = NULL, revoke_token_hash = NULL,
        updated_at = clock_timestamp()
    WHERE expired_receipt.id = receipt.id AND expired_receipt.status <> 'revoked';
    receipt.status := 'expired';
    RETURN QUERY SELECT 'expired'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone,
      NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF receipt.status NOT IN ('pending', 'accepted') OR receipt.revoke_token_hash IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot be revoked from current state';
  END IF;

  IF active_reservation.id IS NOT NULL AND active_reservation.status = 'reserved' THEN
    UPDATE public.g15_checkout_consent_reservations AS released_reservation
    SET status = 'released', updated_at = clock_timestamp()
    WHERE released_reservation.id = active_reservation.id
      AND released_reservation.status = 'reserved';
  END IF;
  UPDATE public.g15_consent_receipts AS revoked_receipt
  SET status = 'revoked', revoked_at = clock_timestamp(),
      accept_token_hash = NULL, revoke_token_hash = NULL,
      updated_at = clock_timestamp()
  WHERE revoked_receipt.id = receipt.id;
  receipt.status := 'revoked';
  RETURN QUERY SELECT 'revoked'::text, selection.id, receipt.status,
    receipt.subject_report_id, selection.policy_version, selection.purpose,
    selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone,
    NULL::uuid, NULL::text;
END
$function$;

-- The caller may invoke this only after Stripe reports the exact bound Session
-- as expired. Selection-first locking serializes this with webhook consume.
CREATE OR REPLACE FUNCTION public.finalize_g15_consent_revocation(
  p_token_hash text,
  p_subject_user_id uuid,
  p_reservation_id uuid,
  p_stripe_session_id text
)
RETURNS TABLE(
  outcome text, selection_id uuid, receipt_status text, subject_report_id uuid,
  policy_version text, purpose text, sharing_scope text,
  expires_at timestamp with time zone, consumed_at timestamp with time zone,
  checkout_reservation_id uuid, checkout_stripe_session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  receipt public.g15_consent_receipts%ROWTYPE;
  selection public.g15_consent_selections%ROWTYPE;
  reservation public.g15_checkout_consent_reservations%ROWTYPE;
  located_receipt_id uuid;
  located_selection_id uuid;
  matching_count integer;
BEGIN
  IF p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_subject_user_id IS NULL
     OR p_reservation_id IS NULL
     OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent revocation finalization input is invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 0));
  SELECT count(*) INTO matching_count
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND candidate.revoke_token_hash = p_token_hash;
  IF matching_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  SELECT candidate.id, candidate.selection_id
    INTO located_receipt_id, located_selection_id
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id
    AND candidate.revoke_token_hash = p_token_hash;
  SELECT * INTO selection
  FROM public.g15_consent_selections AS locked_selection
  WHERE locked_selection.id = located_selection_id
  FOR UPDATE;
  SELECT locked_receipt.* INTO receipt
  FROM public.g15_consent_receipts AS locked_receipt
  WHERE locked_receipt.id = located_receipt_id
    AND locked_receipt.selection_id = selection.id
    AND locked_receipt.subject_user_id = p_subject_user_id
    AND locked_receipt.revoke_token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  SELECT * INTO reservation
  FROM public.g15_checkout_consent_reservations AS candidate
  WHERE candidate.id = p_reservation_id
    AND candidate.selection_id = selection.id
    AND candidate.stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF selection.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, selection.consumed_at,
      CASE WHEN FOUND THEN reservation.id ELSE NULL::uuid END,
      selection.consumed_stripe_session_id;
    RETURN;
  END IF;
  IF NOT FOUND OR reservation.status <> 'bound'
     OR selection.superseded_at IS NOT NULL
     OR receipt.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent revocation cannot finalize this checkout reservation';
  END IF;

  UPDATE public.g15_checkout_consent_reservations AS released_reservation
  SET status = 'released', updated_at = clock_timestamp()
  WHERE released_reservation.id = reservation.id
    AND released_reservation.status = 'bound';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'g15 consent revocation reservation compare-and-swap lost';
  END IF;
  UPDATE public.g15_consent_receipts AS revoked_receipt
  SET status = 'revoked', revoked_at = clock_timestamp(),
      accept_token_hash = NULL, revoke_token_hash = NULL,
      updated_at = clock_timestamp()
  WHERE revoked_receipt.id = receipt.id;
  receipt.status := 'revoked';
  RETURN QUERY SELECT 'revoked'::text, selection.id, receipt.status,
    receipt.subject_report_id, selection.policy_version, selection.purpose,
    selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone,
    reservation.id, reservation.stripe_session_id;
END
$function$;

-- Override the v4 transition with the same token contract plus the checkout
-- reservation fence. Both paths lock selection before receipt/reservation.
CREATE OR REPLACE FUNCTION public.transition_g15_consent(
  p_action text,
  p_token_hash text,
  p_subject_user_id uuid
)
RETURNS TABLE(
  outcome text, selection_id uuid, receipt_status text, subject_report_id uuid,
  policy_version text, purpose text, sharing_scope text,
  expires_at timestamp with time zone, consumed_at timestamp with time zone
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
  checkout_reserved boolean;
BEGIN
  IF p_action NOT IN ('inspect', 'accept', 'revoke')
     OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_subject_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'g15 consent transition input is invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 0));
  SELECT count(*) INTO matching_count
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id AND (
    (p_action IN ('inspect', 'accept') AND candidate.accept_token_hash = p_token_hash)
    OR (p_action IN ('inspect', 'revoke') AND candidate.revoke_token_hash = p_token_hash)
  );
  IF matching_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  SELECT candidate.id, candidate.selection_id INTO located_receipt_id, located_selection_id
  FROM public.g15_consent_receipts AS candidate
  WHERE candidate.subject_user_id = p_subject_user_id AND (
    (p_action IN ('inspect', 'accept') AND candidate.accept_token_hash = p_token_hash)
    OR (p_action IN ('inspect', 'revoke') AND candidate.revoke_token_hash = p_token_hash)
  );
  SELECT * INTO selection FROM public.g15_consent_selections
  WHERE id = located_selection_id FOR UPDATE;
  SELECT locked_receipt.* INTO receipt FROM public.g15_consent_receipts AS locked_receipt
  WHERE locked_receipt.id = located_receipt_id
    AND locked_receipt.selection_id = selection.id
    AND locked_receipt.subject_user_id = p_subject_user_id AND (
      (p_action IN ('inspect', 'accept') AND locked_receipt.accept_token_hash = p_token_hash)
      OR (p_action IN ('inspect', 'revoke') AND locked_receipt.revoke_token_hash = p_token_hash)
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'g15 consent token not found';
  END IF;
  IF selection.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, selection.consumed_at;
    RETURN;
  END IF;

  UPDATE public.g15_checkout_consent_reservations AS expired_reservation
  SET status = 'expired', updated_at = clock_timestamp()
  WHERE expired_reservation.selection_id = selection.id
    AND expired_reservation.status = 'reserved'
    AND expired_reservation.expires_at <= clock_timestamp();
  SELECT EXISTS (
    SELECT 1 FROM public.g15_checkout_consent_reservations AS active_reservation
    WHERE active_reservation.selection_id = selection.id
      AND (
        active_reservation.status = 'bound'
        OR (active_reservation.status = 'reserved' AND active_reservation.expires_at > clock_timestamp())
      )
    FOR UPDATE
  ) INTO checkout_reserved;
  IF checkout_reserved THEN
    RETURN QUERY SELECT 'reserved'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;

  IF selection.superseded_at IS NOT NULL OR selection.expires_at <= clock_timestamp()
     OR receipt.expires_at <= clock_timestamp() THEN
    UPDATE public.g15_consent_receipts AS expired_receipt
    SET status = 'expired', accept_token_hash = NULL, revoke_token_hash = NULL,
        updated_at = clock_timestamp()
    WHERE expired_receipt.id = receipt.id AND expired_receipt.status <> 'revoked';
    receipt.status := 'expired';
    RETURN QUERY SELECT 'expired'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;
  IF p_action = 'accept' THEN
    IF receipt.status <> 'pending' OR receipt.accept_token_hash IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot be accepted from current state';
    END IF;
    UPDATE public.g15_consent_receipts SET status = 'accepted',
      accepted_at = clock_timestamp(), accept_token_hash = NULL,
      updated_at = clock_timestamp() WHERE id = receipt.id;
    receipt.status := 'accepted';
    RETURN QUERY SELECT 'accepted'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;
  IF p_action = 'revoke' THEN
    IF receipt.status NOT IN ('pending', 'accepted') OR receipt.revoke_token_hash IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'g15 consent cannot be revoked from current state';
    END IF;
    UPDATE public.g15_consent_receipts SET status = 'revoked',
      revoked_at = clock_timestamp(), accept_token_hash = NULL,
      revoke_token_hash = NULL, updated_at = clock_timestamp()
    WHERE id = receipt.id;
    receipt.status := 'revoked';
    RETURN QUERY SELECT 'revoked'::text, selection.id, receipt.status,
      receipt.subject_report_id, selection.policy_version, selection.purpose,
      selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'inspected'::text, selection.id, receipt.status,
    receipt.subject_report_id, selection.policy_version, selection.purpose,
    selection.sharing_scope, selection.expires_at, NULL::timestamp with time zone;
END
$function$;

REVOKE ALL ON FUNCTION public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.bind_g15_checkout_consent_session(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_g15_checkout_consent_session(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.bind_g15_checkout_consent_session(uuid,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_g15_checkout_consent_session(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.consume_g15_checkout_consent_for_order(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_g15_checkout_consent_for_order(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_g15_checkout_consent_for_order(uuid,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_g15_checkout_consent_for_order(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.release_g15_checkout_consent_reservation(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_g15_checkout_consent_reservation(uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.release_g15_checkout_consent_reservation(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_g15_checkout_consent_reservation(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.prepare_g15_consent_revocation(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_g15_consent_revocation(text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_g15_consent_revocation(text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_g15_consent_revocation(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_g15_consent_revocation(text,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_g15_consent_revocation(text,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_g15_consent_revocation(text,uuid,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_g15_consent_revocation(text,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transition_g15_consent(text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transition_g15_consent(text,text,uuid) TO service_role;

-- The v4 one-step consumer is unsafe after introducing checkout reservation
-- binding. Removing it prevents any service-role caller from bypassing the
-- reservation/session identity fence.
DROP FUNCTION IF EXISTS public.consume_g15_consent_for_order(uuid,uuid,text,uuid);

DO $postcondition$
DECLARE
  reservation_relation record;
  required_index_count integer;
  exact_constraint_count integer;
  insecure_function_count integer;
  supersede_trigger_count integer;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO reservation_relation
  FROM pg_class WHERE oid = 'public.g15_checkout_consent_reservations'::regclass;
  SELECT count(*) INTO required_index_count
  FROM pg_indexes AS index_info
  JOIN (VALUES
    ('g15_checkout_consent_active_selection_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_active_selection_unique ON public.g15_checkout_consent_reservations USING btree (selection_id) WHERE (status = ANY (ARRAY['reserved'::text, 'bound'::text, 'consumed'::text]))$index$),
    ('g15_checkout_consent_draft_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_draft_unique ON public.g15_checkout_consent_reservations USING btree (checkout_draft_id)$index$),
    ('g15_checkout_consent_report_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_report_unique ON public.g15_checkout_consent_reservations USING btree (report_id)$index$),
    ('g15_checkout_consent_stripe_session_unique',
      $index$CREATE UNIQUE INDEX g15_checkout_consent_stripe_session_unique ON public.g15_checkout_consent_reservations USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL)$index$)
  ) AS expected(indexname, indexdef)
    ON expected.indexname = index_info.indexname
   AND expected.indexdef = index_info.indexdef
  WHERE index_info.schemaname = 'public'
    AND index_info.tablename = 'g15_checkout_consent_reservations';
  SELECT count(*) INTO exact_constraint_count
  FROM pg_constraint AS constraint_info
  JOIN (VALUES
    ('g15_checkout_consent_reservations_pkey', 'p', $constraint$PRIMARY KEY (id)$constraint$),
    ('g15_checkout_consent_reservations_selection_id_fkey', 'f', $constraint$FOREIGN KEY (selection_id) REFERENCES g15_consent_selections(id) ON DELETE RESTRICT$constraint$),
    ('g15_checkout_consent_reservations_checkout_draft_id_fkey', 'f', $constraint$FOREIGN KEY (checkout_draft_id) REFERENCES checkout_drafts(id) ON DELETE RESTRICT$constraint$),
    ('g15_checkout_consent_reservations_request_payload_hash_check', 'c', $constraint$CHECK ((request_payload_hash ~ '^sha256:[0-9a-f]{64}$'::text))$constraint$),
    ('g15_checkout_consent_reservations_status_check', 'c', $constraint$CHECK ((status = ANY (ARRAY['reserved'::text, 'bound'::text, 'consumed'::text, 'expired'::text, 'released'::text])))$constraint$),
    ('g15_checkout_consent_reservation_binding_check', 'c', $constraint$CHECK ((((status = 'reserved'::text) AND (stripe_session_id IS NULL) AND (bound_at IS NULL) AND (consumed_at IS NULL)) OR ((status = 'bound'::text) AND (stripe_session_id IS NOT NULL) AND (bound_at IS NOT NULL) AND (consumed_at IS NULL)) OR ((status = 'consumed'::text) AND (stripe_session_id IS NOT NULL) AND (bound_at IS NOT NULL) AND (consumed_at IS NOT NULL)) OR ((status = ANY (ARRAY['expired'::text, 'released'::text])) AND (consumed_at IS NULL))))$constraint$)
  ) AS expected(conname, contype, definition)
    ON expected.conname = constraint_info.conname
   AND expected.contype = constraint_info.contype::text
   AND expected.definition = pg_get_constraintdef(constraint_info.oid)
  WHERE constraint_info.conrelid = 'public.g15_checkout_consent_reservations'::regclass;
  SELECT count(*) INTO insecure_function_count
  FROM pg_proc
  WHERE oid IN (
    'public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone)'::regprocedure::oid,
    'public.bind_g15_checkout_consent_session(uuid,uuid,text)'::regprocedure::oid,
    'public.consume_g15_checkout_consent_for_order(uuid,uuid,text)'::regprocedure::oid,
    'public.release_g15_checkout_consent_reservation(uuid,text)'::regprocedure::oid,
    'public.prepare_g15_consent_revocation(text,uuid)'::regprocedure::oid,
    'public.finalize_g15_consent_revocation(text,uuid,uuid,text)'::regprocedure::oid,
    'public.transition_g15_consent(text,text,uuid)'::regprocedure::oid
  )
    AND (
      NOT prosecdef
      OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
    );

  SELECT count(*) INTO supersede_trigger_count
  FROM pg_trigger AS trigger_info
  JOIN pg_proc AS function_info ON function_info.oid = trigger_info.tgfoid
  WHERE trigger_info.tgrelid = 'public.g15_consent_selections'::regclass
    AND trigger_info.tgname = 'fence_g15_reserved_selection_supersede'
    AND NOT trigger_info.tgisinternal
    AND function_info.proname = 'fence_g15_reserved_selection_supersede'
    AND function_info.prosecdef
    AND function_info.proconfig = ARRAY['search_path=pg_catalog, public']::text[];

  IF NOT reservation_relation.relrowsecurity
     OR NOT reservation_relation.relforcerowsecurity
     OR required_index_count <> 4
     OR exact_constraint_count <> 6
     OR insecure_function_count <> 0
     OR supersede_trigger_count <> 1
     OR has_table_privilege('anon', 'public.g15_checkout_consent_reservations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.g15_checkout_consent_reservations', 'SELECT')
     OR has_function_privilege('anon', 'public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_g15_consent_for_checkout(uuid,uuid,uuid,text,jsonb,text,timestamp with time zone)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bind_g15_checkout_consent_session(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bind_g15_checkout_consent_session(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consume_g15_checkout_consent_for_order(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_g15_checkout_consent_for_order(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.release_g15_checkout_consent_reservation(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.release_g15_checkout_consent_reservation(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.prepare_g15_consent_revocation(text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalize_g15_consent_revocation(text,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fence_g15_reserved_selection_supersede()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fence_g15_reserved_selection_supersede()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.prepare_g15_consent_revocation(text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalize_g15_consent_revocation(text,uuid,uuid,text)', 'EXECUTE')
     OR to_regprocedure('public.consume_g15_consent_for_order(uuid,uuid,text,uuid)') IS NOT NULL
     OR NOT has_function_privilege('service_role', 'public.bind_g15_checkout_consent_session(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.prepare_g15_consent_revocation(text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finalize_g15_consent_revocation(text,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'g15 checkout reservation postcondition failed';
  END IF;
END
$postcondition$;

COMMIT;
