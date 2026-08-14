BEGIN;

-- Free checkout moves money-equivalent coupon quota and points together with
-- the order/report records.  A SECURITY DEFINER routine is acceptable only
-- when the migration role owns every referenced table and can bypass RLS.
DO $free_checkout_owner_preflight$
DECLARE
  v_expected_owner oid;
  v_relation text;
  v_relation_oid oid;
BEGIN
  SELECT oid INTO v_expected_owner
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user AND (rolsuper OR rolbypassrls);

  IF v_expected_owner IS NULL THEN
    RAISE EXCEPTION 'free checkout migration owner must be superuser or BYPASSRLS';
  END IF;

  FOREACH v_relation IN ARRAY ARRAY[
    'checkout_drafts', 'orders', 'paid_reports', 'coupons', 'coupon_uses',
    'user_points', 'point_transactions', 'products', 'birth_profiles'
  ] LOOP
    v_relation_oid := to_regclass(format('public.%I', v_relation))::oid;
    IF v_relation_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = v_relation_oid AND relkind = 'r' AND relowner = v_expected_owner
    ) THEN
      RAISE EXCEPTION 'free checkout schema/owner preflight failed for %', v_relation;
    END IF;
  END LOOP;
END
$free_checkout_owner_preflight$;

DO $free_checkout_required_columns$
DECLARE
  v_missing text;
BEGIN
  WITH required(table_name, column_name, udt_name) AS (
    VALUES
      ('checkout_drafts','id','uuid'), ('checkout_drafts','plan_code','text'),
      ('checkout_drafts','birth_data','jsonb'), ('checkout_drafts','locale','text'),
      ('checkout_drafts','used_at','timestamptz'),
      ('orders','stripe_checkout_session_id','text'), ('orders','user_id','uuid'),
      ('orders','amount_usd','numeric'), ('orders','status','text'),
      ('orders','currency','text'), ('orders','payment_method','text'),
      ('orders','coupon_id','uuid'), ('orders','language','text'),
      ('orders','additional_options','jsonb'), ('orders','paid_at','timestamptz'),
      ('products','id','uuid'), ('products','code','text'), ('products','is_active','bool'),
      ('birth_profiles','id','uuid'), ('birth_profiles','user_id','uuid'),
      ('birth_profiles','full_name','text'), ('birth_profiles','birth_date','date'),
      ('birth_profiles','birth_time','time'), ('birth_profiles','birth_time_known','bool'),
      ('birth_profiles','gender','text'), ('birth_profiles','birth_city','text'),
      ('birth_profiles','birth_country','text'), ('birth_profiles','birth_timezone','text'),
      ('birth_profiles','birth_longitude','numeric'), ('birth_profiles','birth_latitude','numeric'),
      ('birth_profiles','metadata','jsonb'),
      ('paid_reports','id','uuid'), ('paid_reports','client_name','text'),
      ('paid_reports','plan_code','text'), ('paid_reports','amount_usd','numeric'),
      ('paid_reports','stripe_session_id','text'), ('paid_reports','birth_data','jsonb'),
      ('paid_reports','status','text'), ('paid_reports','access_token','text'),
      ('paid_reports','customer_email','text'), ('paid_reports','user_id','uuid'),
      ('paid_reports','error_message','text'),
      ('coupons','id','uuid'), ('coupons','code','text'),
      ('coupons','discount_type','text'), ('coupons','discount_value','numeric'),
      ('coupons','used_count','int4'), ('coupons','max_uses','int4'),
      ('coupons','is_active','bool'), ('coupons','valid_until','timestamptz'),
      ('coupons','applicable_products','_text'),
      ('coupon_uses','coupon_id','uuid'), ('coupon_uses','coupon_code','text'),
      ('coupon_uses','order_id','text'), ('coupon_uses','customer_email','text'),
      ('coupon_uses','plan_code','text'), ('coupon_uses','original_amount','numeric'),
      ('coupon_uses','discount_applied','numeric'),
      ('user_points','user_id','uuid'), ('user_points','balance','int4'),
      ('user_points','total_used','int4'), ('user_points','updated_at','timestamptz'),
      ('point_transactions','user_id','uuid'), ('point_transactions','type','text'),
      ('point_transactions','amount','int4'), ('point_transactions','balance_after','int4'),
      ('point_transactions','description','text'), ('point_transactions','reference_id','text')
  )
  SELECT string_agg(format('%I.%I:%s', r.table_name, r.column_name, r.udt_name), ', ')
  INTO v_missing
  FROM required AS r
  LEFT JOIN information_schema.columns AS c
    ON c.table_schema = 'public'
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name
   AND c.udt_name = r.udt_name
  WHERE c.column_name IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'free checkout required schema drift: %', v_missing;
  END IF;
END
$free_checkout_required_columns$;

DO $free_checkout_ledger_replay_preflight$
DECLARE
  v_oid oid := to_regclass('public.free_checkout_idempotency')::oid;
  v_expected_owner oid;
BEGIN
  IF v_oid IS NULL THEN RETURN; END IF;
  SELECT oid INTO v_expected_owner FROM pg_catalog.pg_roles WHERE rolname = current_user;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = v_oid AND relkind = 'r' AND relowner = v_expected_owner
      AND relrowsecurity AND relforcerowsecurity
      AND relpersistence = 'p' AND reloptions IS NULL
  ) OR (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'free_checkout_idempotency') <> 7
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='request_key' AND ordinal_position=1 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='payload_hash' AND ordinal_position=2 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='plan_code' AND ordinal_position=3 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='report_id' AND ordinal_position=4 AND udt_name='uuid' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='session_id' AND ordinal_position=5 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='workflow_failed' AND ordinal_position=6 AND udt_name='bool' AND is_nullable='NO' AND column_default='false')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='free_checkout_idempotency' AND column_name='created_at' AND ordinal_position=7 AND udt_name='timestamptz' AND is_nullable='NO' AND regexp_replace(column_default, '\s+', '', 'g')='now()')
    OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = v_oid) <> 4
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=v_oid AND conname='free_checkout_idempotency_pkey' AND contype='p' AND convalidated AND NOT condeferrable AND pg_get_constraintdef(oid,true)='PRIMARY KEY (request_key)')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=v_oid AND conname='free_checkout_idempotency_payload_hash_check' AND contype='c' AND convalidated AND pg_get_constraintdef(oid,true) ~ '^CHECK \(payload_hash ~ ')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=v_oid AND conname='free_checkout_idempotency_plan_code_check' AND contype='c' AND convalidated AND pg_get_constraintdef(oid,true) ~ '^CHECK \(plan_code = ANY ')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=v_oid AND conname='free_checkout_idempotency_session_id_check' AND contype='c' AND convalidated AND pg_get_constraintdef(oid,true) ~ '^CHECK \(session_id ~ ')
    OR (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid = v_oid) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index WHERE indrelid=v_oid AND indisprimary AND indisunique AND indisvalid AND indisready AND indislive AND indimmediate AND indexprs IS NULL AND indpred IS NULL)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = v_oid AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = v_oid)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=v_oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS t
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl, pg_catalog.acldefault('r', t.relowner))) AS a
      WHERE t.oid = v_oid AND a.grantee <> t.relowner
    )
  THEN
    RAISE EXCEPTION 'free checkout idempotency ledger drift detected';
  END IF;
END
$free_checkout_ledger_replay_preflight$;

CREATE TABLE IF NOT EXISTS public.free_checkout_idempotency (
  request_key text NOT NULL,
  payload_hash text NOT NULL,
  plan_code text NOT NULL,
  report_id uuid NOT NULL,
  session_id text NOT NULL,
  workflow_failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_checkout_idempotency_pkey PRIMARY KEY (request_key),
  CONSTRAINT free_checkout_idempotency_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT free_checkout_idempotency_plan_code_check CHECK (plan_code IN ('C', 'G15')),
  CONSTRAINT free_checkout_idempotency_session_id_check CHECK (session_id ~ '^free_[0-9a-f-]{36}$')
);

ALTER TABLE public.free_checkout_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_checkout_idempotency FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.free_checkout_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.free_checkout_idempotency FROM anon;
REVOKE ALL ON TABLE public.free_checkout_idempotency FROM authenticated;
REVOKE ALL ON TABLE public.free_checkout_idempotency FROM service_role;

DROP FUNCTION IF EXISTS public.create_free_checkout_once(
  text, text, text, jsonb, text, text, uuid, text, integer, integer, text, boolean
);

CREATE FUNCTION public.create_free_checkout_once(
  p_request_key text,
  p_payload_hash text,
  p_plan_code text,
  p_birth_data jsonb,
  p_locale text,
  p_customer_email text,
  p_user_id uuid,
  p_coupon_code text,
  p_points_to_use integer,
  p_base_amount_cents integer,
  p_client_name text,
  p_mark_workflow_failed boolean DEFAULT false
)
RETURNS TABLE(outcome text, report_id uuid, session_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
AS $create_free_checkout_once$
DECLARE
  v_existing public.free_checkout_idempotency%ROWTYPE;
  v_coupon_id uuid;
  v_coupon_type text;
  v_coupon_value numeric;
  v_coupon_used integer;
  v_coupon_max integer;
  v_coupon_active boolean;
  v_coupon_valid_until timestamptz;
  v_coupon_products text[];
  v_coupon_amount integer;
  v_balance integer;
  v_new_balance integer;
  v_report_id uuid;
  v_session_id text;
  v_draft_id uuid;
  v_product_id uuid;
  v_birth_profile_id uuid;
  v_profile_birth_data jsonb;
  v_birth_date date;
  v_birth_time time;
  v_source_report_expected integer;
  v_source_report_count integer;
BEGIN
  IF p_request_key IS NULL OR p_request_key !~ '^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
    OR p_plan_code NOT IN ('C', 'G15')
    OR p_birth_data IS NULL OR jsonb_typeof(p_birth_data) <> 'object'
    OR p_customer_email IS NULL OR btrim(p_customer_email) = ''
    OR p_user_id IS NULL
    OR p_base_amount_cents IS NULL OR p_base_amount_cents <= 0
    OR p_client_name IS NULL OR btrim(p_client_name) = ''
    OR p_points_to_use IS NULL OR p_points_to_use < 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid free checkout request';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key, 0));

  SELECT * INTO v_existing
  FROM public.free_checkout_idempotency AS idem
  WHERE idem.request_key = p_request_key;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash OR v_existing.plan_code <> p_plan_code THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'free checkout idempotency payload conflict';
    END IF;
    IF p_mark_workflow_failed THEN
      UPDATE public.paid_reports
      SET status = 'failed', error_message = 'Durable workflow start requires retry'
      WHERE id = v_existing.report_id AND status = 'pending';
      UPDATE public.free_checkout_idempotency
      SET workflow_failed = true
      WHERE request_key = p_request_key;
    END IF;
    RETURN QUERY SELECT 'already'::text, v_existing.report_id, v_existing.session_id;
    RETURN;
  END IF;

  IF p_mark_workflow_failed THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cannot mark an unknown free checkout';
  END IF;

  IF NULLIF(btrim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    IF p_points_to_use <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'coupon and points are mutually exclusive';
    END IF;
    SELECT id, discount_type, discount_value, used_count, max_uses, is_active,
           valid_until, applicable_products
    INTO v_coupon_id, v_coupon_type, v_coupon_value, v_coupon_used, v_coupon_max,
         v_coupon_active, v_coupon_valid_until, v_coupon_products
    FROM public.coupons
    WHERE code = upper(btrim(p_coupon_code))
    FOR UPDATE;

    IF NOT FOUND OR NOT v_coupon_active
      OR (v_coupon_valid_until IS NOT NULL AND v_coupon_valid_until <= now())
      OR (v_coupon_max IS NOT NULL AND COALESCE(v_coupon_used, 0) >= v_coupon_max)
      OR (v_coupon_products IS NOT NULL AND NOT (p_plan_code = ANY(v_coupon_products)))
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'coupon is no longer eligible';
    END IF;

    v_coupon_amount := CASE v_coupon_type
      WHEN 'free' THEN 0
      WHEN 'percentage' THEN round(p_base_amount_cents * (1 - v_coupon_value / 100.0))::integer
      WHEN 'fixed' THEN greatest(0, p_base_amount_cents - round(v_coupon_value * 100)::integer)
      ELSE NULL
    END;
    IF v_coupon_amount IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'coupon does not fully cover checkout';
    END IF;
  ELSE
    IF p_points_to_use <= 0 OR p_points_to_use * 100 < p_base_amount_cents THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'points do not fully cover checkout';
    END IF;
    SELECT balance INTO v_balance
    FROM public.user_points
    WHERE user_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND OR COALESCE(v_balance, 0) < p_points_to_use THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient points';
    END IF;
  END IF;

  SELECT product.id INTO v_product_id
  FROM public.products AS product
  WHERE product.code = p_plan_code AND product.is_active
  FOR SHARE OF product;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'active checkout product is missing';
  END IF;

  IF p_plan_code = 'C' THEN
    v_profile_birth_data := p_birth_data;
  ELSE
    IF jsonb_typeof(p_birth_data -> 'report_ids') <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'G15 source report identity is missing';
    END IF;
    v_source_report_expected := jsonb_array_length(p_birth_data -> 'report_ids');
    IF v_source_report_expected < 1 OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_birth_data -> 'report_ids') AS source_identity(value)
        WHERE jsonb_typeof(source_identity.value) <> 'string'
          OR btrim(source_identity.value #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      )
      OR (
        SELECT count(DISTINCT btrim(source_report_id))
        FROM jsonb_array_elements_text(p_birth_data -> 'report_ids') AS source_report_id
      ) <> v_source_report_expected
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'G15 source report identity is missing';
    END IF;

    -- Lock every selected source in a deterministic order.  Any missing,
    -- unfinished, or differently owned member makes the whole transaction fail.
    PERFORM source_report.id
    FROM jsonb_array_elements_text(p_birth_data -> 'report_ids') WITH ORDINALITY
      AS source_input(report_id_text, source_ordinality)
    JOIN public.paid_reports AS source_report
      ON source_report.id = btrim(source_input.report_id_text)::uuid
    WHERE source_report.user_id = p_user_id
      AND source_report.status = 'completed'
    ORDER BY source_report.id
    FOR SHARE OF source_report;
    GET DIAGNOSTICS v_source_report_count = ROW_COUNT;
    IF v_source_report_count <> v_source_report_expected THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G15 source report is unavailable';
    END IF;

    SELECT source_report.birth_data INTO v_profile_birth_data
    FROM public.paid_reports AS source_report
    WHERE source_report.id = (p_birth_data -> 'report_ids' ->> 0)::uuid
      AND source_report.user_id = p_user_id;
  END IF;

  BEGIN
    v_birth_date := make_date(
      (v_profile_birth_data ->> 'year')::integer,
      (v_profile_birth_data ->> 'month')::integer,
      (v_profile_birth_data ->> 'day')::integer
    );
    v_birth_time := CASE
      WHEN COALESCE((v_profile_birth_data ->> 'time_unknown')::boolean, false) THEN NULL
      ELSE make_time(
        COALESCE((v_profile_birth_data ->> 'hour')::integer, 12),
        COALESCE((v_profile_birth_data ->> 'minute')::integer, 0),
        0
      )
    END;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'birth profile date/time is invalid';
  END;

  INSERT INTO public.birth_profiles(
    user_id, full_name, birth_date, birth_time, birth_time_known, gender,
    birth_city, birth_country, birth_timezone, birth_longitude, birth_latitude, metadata
  ) VALUES (
    p_user_id,
    COALESCE(NULLIF(btrim(v_profile_birth_data ->> 'name'), ''), btrim(p_client_name)),
    v_birth_date,
    v_birth_time,
    v_birth_time IS NOT NULL,
    NULLIF(btrim(v_profile_birth_data ->> 'gender'), ''),
    NULLIF(btrim(v_profile_birth_data ->> 'birth_city'), ''),
    NULLIF(btrim(v_profile_birth_data ->> 'birth_country'), ''),
    NULLIF(btrim(v_profile_birth_data ->> 'timezone'), ''),
    NULLIF(v_profile_birth_data ->> 'longitude', '')::numeric,
    NULLIF(v_profile_birth_data ->> 'latitude', '')::numeric,
    jsonb_build_object(
      'checkout_request_key', p_request_key,
      'source_plan', p_plan_code,
      'source_report_count', CASE WHEN p_plan_code = 'G15' THEN v_source_report_count ELSE 0 END
    )
  ) RETURNING id INTO v_birth_profile_id;

  v_session_id := 'free_' || gen_random_uuid()::text;
  INSERT INTO public.checkout_drafts(plan_code, birth_data, locale, used_at)
  VALUES (p_plan_code, p_birth_data, COALESCE(NULLIF(btrim(p_locale), ''), 'zh-TW'), now())
  RETURNING id INTO v_draft_id;

  INSERT INTO public.orders(
    user_id, product_id, birth_profile_id, stripe_checkout_session_id,
    amount_usd, currency, payment_method,
    coupon_id, status, language, additional_options, paid_at
  ) VALUES (
    p_user_id, v_product_id, v_birth_profile_id, v_session_id,
    0, 'usd', CASE WHEN v_coupon_id IS NULL THEN 'points' ELSE 'coupon' END,
    v_coupon_id, 'paid',
    COALESCE(NULLIF(btrim(p_locale), ''), 'zh-TW'),
    jsonb_build_object('plan_code', p_plan_code, 'checkout_request_key', p_request_key),
    now()
  );

  INSERT INTO public.paid_reports(
    client_name, plan_code, amount_usd, stripe_session_id, birth_data, status,
    access_token, customer_email, user_id
  ) VALUES (
    btrim(p_client_name), p_plan_code, 0, v_session_id, p_birth_data, 'pending',
    gen_random_uuid()::text, lower(btrim(p_customer_email)), p_user_id
  ) RETURNING id INTO v_report_id;

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = COALESCE(used_count, 0) + 1
    WHERE id = v_coupon_id;
    INSERT INTO public.coupon_uses(
      coupon_id, coupon_code, order_id, customer_email, plan_code,
      original_amount, discount_applied
    ) VALUES (
      v_coupon_id, upper(btrim(p_coupon_code)), v_session_id,
      lower(btrim(p_customer_email)), p_plan_code,
      p_base_amount_cents / 100.0, p_base_amount_cents / 100.0
    );
  ELSE
    v_new_balance := v_balance - p_points_to_use;
    UPDATE public.user_points
    SET balance = v_new_balance,
        total_used = COALESCE(total_used, 0) + p_points_to_use,
        updated_at = now()
    WHERE user_id = p_user_id;
    INSERT INTO public.point_transactions(
      user_id, type, amount, balance_after, description, reference_id
    ) VALUES (
      p_user_id, 'use_checkout', -p_points_to_use, v_new_balance,
      p_plan_code || ' order redemption', v_session_id
    );
  END IF;

  INSERT INTO public.free_checkout_idempotency(
    request_key, payload_hash, plan_code, report_id, session_id
  ) VALUES (
    p_request_key, p_payload_hash, p_plan_code, v_report_id, v_session_id
  );

  RETURN QUERY SELECT 'applied'::text, v_report_id, v_session_id;
END
$create_free_checkout_once$;

REVOKE ALL ON FUNCTION public.create_free_checkout_once(
  text, text, text, jsonb, text, text, uuid, text, integer, integer, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_free_checkout_once(
  text, text, text, jsonb, text, text, uuid, text, integer, integer, text, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.create_free_checkout_once(
  text, text, text, jsonb, text, text, uuid, text, integer, integer, text, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_free_checkout_once(
  text, text, text, jsonb, text, text, uuid, text, integer, integer, text, boolean
) TO service_role;

DO $free_checkout_acl_postcondition$
DECLARE
  v_fn oid := to_regprocedure('public.create_free_checkout_once(text,text,text,jsonb,text,text,uuid,text,integer,integer,text,boolean)')::oid;
  v_service oid;
  v_owner oid;
BEGIN
  SELECT oid INTO v_service FROM pg_catalog.pg_roles WHERE rolname = 'service_role';
  SELECT proowner INTO v_owner FROM pg_catalog.pg_proc WHERE oid = v_fn;
  IF v_fn IS NULL OR v_service IS NULL
    OR (SELECT count(*) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_free_checkout_once') <> 1
    OR v_owner <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
    OR NOT pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE')
    OR pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
      WHERE p.oid = v_fn AND a.privilege_type = 'EXECUTE'
        AND a.grantee NOT IN (v_owner, v_service)
    )
    OR pg_catalog.has_table_privilege('service_role', 'public.free_checkout_idempotency', 'SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('anon', 'public.free_checkout_idempotency', 'SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('authenticated', 'public.free_checkout_idempotency', 'SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'free checkout ACL postcondition failed';
  END IF;
END
$free_checkout_acl_postcondition$;

COMMIT;
