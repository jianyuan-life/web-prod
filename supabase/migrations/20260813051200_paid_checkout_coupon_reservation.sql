BEGIN;

-- A paid checkout promises money-equivalent coupon capacity or points before
-- Stripe is allowed to collect money.  The promise is durable and replayable:
-- the request identity, exact provider body, provider Session and final
-- consumption all share this one ledger row.
DO $paid_checkout_owner_preflight$
DECLARE
  expected_owner oid;
  relation_name text;
  relation_oid oid;
BEGIN
  SELECT oid INTO expected_owner
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user AND (rolsuper OR rolbypassrls);
  IF expected_owner IS NULL THEN
    RAISE EXCEPTION 'paid checkout migration owner must be superuser or BYPASSRLS';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'checkout_drafts', 'coupons', 'coupon_uses', 'user_points', 'point_transactions'
  ] LOOP
    relation_oid := to_regclass(format('public.%I', relation_name))::oid;
    IF relation_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = relation_oid AND relkind = 'r' AND relowner = expected_owner
    ) THEN
      RAISE EXCEPTION 'paid checkout owner/schema preflight failed for %', relation_name;
    END IF;
  END LOOP;

  relation_oid := to_regclass('public.coupons')::oid;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    WHERE i.indrelid = relation_oid
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indislive
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indkey::text = (
        SELECT a.attnum::text
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = relation_oid
          AND a.attname = 'code'
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'paid checkout coupon code requires one valid ready non-partial UNIQUE index';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
  THEN
    RAISE EXCEPTION 'paid checkout role preflight failed';
  END IF;
END
$paid_checkout_owner_preflight$;

DO $paid_checkout_required_columns$
DECLARE
  missing_columns text;
BEGIN
  WITH required(table_name, column_name, udt_name) AS (
    VALUES
      ('checkout_drafts','id','uuid'), ('checkout_drafts','plan_code','text'),
      ('checkout_drafts','birth_data','jsonb'), ('checkout_drafts','locale','text'),
      ('checkout_drafts','used_at','timestamptz'),
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
  INTO missing_columns
  FROM required AS r
  LEFT JOIN information_schema.columns AS c
    ON c.table_schema = 'public'
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name
   AND c.udt_name = r.udt_name
  WHERE c.column_name IS NULL;
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'paid checkout required schema drift: %', missing_columns;
  END IF;
END
$paid_checkout_required_columns$;

DO $paid_checkout_replay_preflight$
DECLARE
  ledger_oid oid := to_regclass('public.paid_checkout_reservations')::oid;
  expected_owner oid;
BEGIN
  IF ledger_oid IS NULL THEN RETURN; END IF;
  SELECT oid INTO expected_owner FROM pg_catalog.pg_roles WHERE rolname = current_user;
  IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = ledger_oid AND relkind = 'r' AND relowner = expected_owner
        AND relpersistence = 'p' AND relrowsecurity AND relforcerowsecurity
        AND reloptions IS NULL
    )
    OR (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='paid_checkout_reservations') <> 22
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='request_key' AND ordinal_position=1 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='payload_hash' AND ordinal_position=2 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='plan_code' AND ordinal_position=3 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='resource_kind' AND ordinal_position=4 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='checkout_user_id' AND ordinal_position=5 AND udt_name='uuid' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='coupon_id' AND ordinal_position=6 AND udt_name='uuid' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='coupon_code' AND ordinal_position=7 AND udt_name='text' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='coupon_discount_type' AND ordinal_position=8 AND udt_name='text' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='coupon_discount_value' AND ordinal_position=9 AND udt_name='numeric' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='points_user_id' AND ordinal_position=10 AND udt_name='uuid' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='points_amount' AND ordinal_position=11 AND udt_name='int4' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='base_amount_cents' AND ordinal_position=12 AND udt_name='int4' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='final_amount_cents' AND ordinal_position=13 AND udt_name='int4' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='checkout_draft_id' AND ordinal_position=14 AND udt_name='uuid' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='stripe_request_body' AND ordinal_position=15 AND udt_name='text' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='stripe_session_id' AND ordinal_position=16 AND udt_name='text' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='status' AND ordinal_position=17 AND udt_name='text' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='expires_at' AND ordinal_position=18 AND udt_name='timestamptz' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='created_at' AND ordinal_position=19 AND udt_name='timestamptz' AND is_nullable='NO' AND regexp_replace(column_default,'\s+','','g')='now()')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='bound_at' AND ordinal_position=20 AND udt_name='timestamptz' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='consumed_at' AND ordinal_position=21 AND udt_name='timestamptz' AND is_nullable='YES')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='paid_checkout_reservations' AND column_name='released_at' AND ordinal_position=22 AND udt_name='timestamptz' AND is_nullable='YES')
    OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=ledger_oid) <> 10
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=ledger_oid AND conname='paid_checkout_reservations_pkey' AND contype='p' AND convalidated)
    OR (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid=ledger_oid) <> 4
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=ledger_oid AND c.relname='paid_checkout_reservations_stripe_session_unique' AND i.indisunique AND i.indisvalid AND i.indisready)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=ledger_oid AND c.relname='paid_checkout_reservations_coupon_active_idx' AND i.indisvalid AND i.indisready)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=ledger_oid AND c.relname='paid_checkout_reservations_points_active_idx' AND i.indisvalid AND i.indisready)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=ledger_oid AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=ledger_oid)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=ledger_oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS t
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl, pg_catalog.acldefault('r',t.relowner))) AS a
      WHERE t.oid=ledger_oid AND a.grantee<>t.relowner
    )
  THEN
    RAISE EXCEPTION 'paid checkout reservation ledger drift detected';
  END IF;
END
$paid_checkout_replay_preflight$;

CREATE TABLE IF NOT EXISTS public.paid_checkout_reservations (
  request_key text NOT NULL,
  payload_hash text NOT NULL,
  plan_code text NOT NULL,
  resource_kind text NOT NULL,
  checkout_user_id uuid,
  coupon_id uuid,
  coupon_code text,
  coupon_discount_type text,
  coupon_discount_value numeric,
  points_user_id uuid,
  points_amount integer,
  base_amount_cents integer NOT NULL,
  final_amount_cents integer NOT NULL,
  checkout_draft_id uuid,
  stripe_request_body text,
  stripe_session_id text,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  bound_at timestamptz,
  consumed_at timestamptz,
  released_at timestamptz,
  CONSTRAINT paid_checkout_reservations_pkey PRIMARY KEY (request_key),
  CONSTRAINT paid_checkout_reservations_request_key_check CHECK (request_key ~ '^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT paid_checkout_reservations_payload_hash_check CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT paid_checkout_reservations_plan_code_check CHECK (plan_code IN ('C','D','G15','R','E1','E2','E3','E4')),
  CONSTRAINT paid_checkout_reservations_resource_kind_check CHECK (resource_kind IN ('none','coupon','points')),
  CONSTRAINT paid_checkout_reservations_amount_check CHECK (base_amount_cents > 0 AND final_amount_cents > 0 AND final_amount_cents <= base_amount_cents),
  CONSTRAINT paid_checkout_reservations_status_check CHECK (status IN ('reserved','bound','consumed','released')),
  CONSTRAINT paid_checkout_reservations_stripe_session_check CHECK (stripe_session_id IS NULL OR stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$'),
  CONSTRAINT paid_checkout_reservations_body_check CHECK (stripe_request_body IS NULL OR (length(stripe_request_body) BETWEEN 1 AND 32768)),
  CONSTRAINT paid_checkout_reservations_resource_shape_check CHECK (
    (resource_kind='none' AND coupon_id IS NULL AND coupon_code IS NULL AND coupon_discount_type IS NULL AND coupon_discount_value IS NULL AND points_user_id IS NULL AND points_amount IS NULL)
    OR
    (resource_kind='coupon' AND coupon_id IS NOT NULL AND coupon_code IS NOT NULL AND coupon_discount_type IN ('percentage','fixed') AND coupon_discount_value IS NOT NULL AND points_user_id IS NULL AND points_amount IS NULL)
    OR
    (resource_kind='points' AND coupon_id IS NULL AND coupon_code IS NULL AND coupon_discount_type IS NULL AND coupon_discount_value IS NULL AND points_user_id IS NOT NULL AND points_amount > 0 AND checkout_user_id=points_user_id AND plan_code IN ('C','G15'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS paid_checkout_reservations_stripe_session_unique
  ON public.paid_checkout_reservations(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paid_checkout_reservations_coupon_active_idx
  ON public.paid_checkout_reservations(coupon_id, expires_at)
  WHERE resource_kind='coupon' AND status IN ('reserved','bound');
CREATE INDEX IF NOT EXISTS paid_checkout_reservations_points_active_idx
  ON public.paid_checkout_reservations(points_user_id, expires_at)
  WHERE resource_kind='points' AND status IN ('reserved','bound');

ALTER TABLE public.paid_checkout_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_checkout_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paid_checkout_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.paid_checkout_reservations FROM anon;
REVOKE ALL ON TABLE public.paid_checkout_reservations FROM authenticated;
REVOKE ALL ON TABLE public.paid_checkout_reservations FROM service_role;

DROP FUNCTION IF EXISTS public.reserve_paid_checkout_value(text,text,text,uuid,text,uuid,integer,jsonb,text,integer,integer,integer,boolean,timestamptz);
CREATE FUNCTION public.reserve_paid_checkout_value(
  p_request_key text,
  p_payload_hash text,
  p_plan_code text,
  p_checkout_user_id uuid,
  p_coupon_code text,
  p_points_user_id uuid,
  p_points_amount integer,
  p_birth_data jsonb,
  p_locale text,
  p_base_amount_cents integer,
  p_promotion_amount_cents integer,
  p_final_amount_cents integer,
  p_create_checkout_draft boolean,
  p_expires_at timestamptz
)
RETURNS TABLE(
  outcome text, request_key text, resource_kind text, checkout_user_id uuid,
  coupon_code text, coupon_discount_type text, coupon_discount_value numeric,
  points_user_id uuid, points_amount integer, checkout_draft_id uuid,
  reservation_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
SET lock_timeout='5s'
AS $reserve_paid_checkout_value$
DECLARE
  existing public.paid_checkout_reservations%ROWTYPE;
  requested_resource text;
  normalized_coupon text := NULLIF(upper(btrim(COALESCE(p_coupon_code,''))), '');
  locked_coupon_id uuid;
  locked_coupon_code text;
  locked_coupon_type text;
  locked_coupon_value numeric;
  locked_coupon_used integer;
  locked_coupon_max integer;
  locked_coupon_active boolean;
  locked_coupon_valid_until timestamptz;
  locked_coupon_products text[];
  active_holds bigint;
  locked_points_balance integer;
  expected_final_amount integer;
  draft_id uuid;
BEGIN
  requested_resource := CASE
    WHEN normalized_coupon IS NOT NULL THEN 'coupon'
    WHEN COALESCE(p_points_amount,0) > 0 THEN 'points'
    ELSE 'none'
  END;
  IF p_request_key IS NULL OR p_request_key !~ '^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_payload_hash IS NULL OR p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_plan_code NOT IN ('C','D','G15','R','E1','E2','E3','E4')
    OR p_birth_data IS NULL OR jsonb_typeof(p_birth_data)<>'object'
    OR COALESCE(NULLIF(btrim(p_locale),''),'')=''
    OR p_base_amount_cents IS NULL OR p_base_amount_cents<=0
    OR p_promotion_amount_cents IS NULL OR p_promotion_amount_cents<=0 OR p_promotion_amount_cents>p_base_amount_cents
    OR p_final_amount_cents IS NULL OR p_final_amount_cents<=0 OR p_final_amount_cents>p_base_amount_cents
    OR p_expires_at < clock_timestamp()+interval '34 minutes'
    OR p_expires_at > clock_timestamp()+interval '36 minutes'
    OR (normalized_coupon IS NOT NULL AND COALESCE(p_points_amount,0)<>0)
    OR (requested_resource='points' AND (p_points_user_id IS NULL OR p_points_user_id IS DISTINCT FROM p_checkout_user_id OR p_plan_code NOT IN ('C','G15')))
    OR (requested_resource<>'points' AND (p_points_user_id IS NOT NULL OR COALESCE(p_points_amount,0)<>0))
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout reservation input is invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key,0));
  SELECT * INTO existing FROM public.paid_checkout_reservations AS r
  WHERE r.request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    IF existing.payload_hash<>p_payload_hash OR existing.plan_code<>p_plan_code
      OR existing.checkout_user_id IS DISTINCT FROM p_checkout_user_id
      OR existing.resource_kind<>requested_resource
      OR existing.coupon_code IS DISTINCT FROM normalized_coupon
      OR existing.points_user_id IS DISTINCT FROM p_points_user_id
      OR existing.points_amount IS DISTINCT FROM (CASE WHEN requested_resource='points' THEN p_points_amount ELSE NULL END)
      OR existing.base_amount_cents<>p_base_amount_cents
      OR existing.final_amount_cents<>p_final_amount_cents
    THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout idempotency payload conflict';
    END IF;
    IF existing.status='released' THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout reservation is released';
    END IF;
    IF existing.status='reserved' AND existing.expires_at<=clock_timestamp() THEN
      UPDATE public.paid_checkout_reservations
      SET status='released', released_at=clock_timestamp()
      WHERE paid_checkout_reservations.request_key=p_request_key;
      RETURN QUERY SELECT
        'expired'::text, existing.request_key, existing.resource_kind, existing.checkout_user_id,
        existing.coupon_code, existing.coupon_discount_type, existing.coupon_discount_value,
        existing.points_user_id, existing.points_amount, existing.checkout_draft_id, existing.expires_at;
      RETURN;
    END IF;
    RETURN QUERY SELECT
      CASE existing.status WHEN 'reserved' THEN 'already_reserved' WHEN 'bound' THEN 'already_bound' ELSE 'already_consumed' END,
      existing.request_key, existing.resource_kind, existing.checkout_user_id,
      existing.coupon_code, existing.coupon_discount_type, existing.coupon_discount_value,
      existing.points_user_id, existing.points_amount, existing.checkout_draft_id, existing.expires_at;
    RETURN;
  END IF;

  IF requested_resource='coupon' THEN
    SELECT id,code,discount_type,discount_value,used_count,max_uses,is_active,valid_until,applicable_products
    INTO locked_coupon_id,locked_coupon_code,locked_coupon_type,locked_coupon_value,
         locked_coupon_used,locked_coupon_max,locked_coupon_active,locked_coupon_valid_until,locked_coupon_products
    FROM public.coupons WHERE code=normalized_coupon FOR UPDATE;
    IF NOT FOUND OR NOT locked_coupon_active
      OR locked_coupon_type NOT IN ('percentage','fixed')
      OR locked_coupon_value IS NULL OR locked_coupon_value<=0
      OR (locked_coupon_type='percentage' AND locked_coupon_value>100)
      OR (locked_coupon_valid_until IS NOT NULL AND locked_coupon_valid_until<=clock_timestamp())
      OR (locked_coupon_products IS NOT NULL AND NOT (p_plan_code=ANY(locked_coupon_products)))
    THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='paid coupon is not eligible';
    END IF;
    SELECT count(*) INTO active_holds
    FROM public.paid_checkout_reservations AS r
    -- `expires_at` limits only an unbound provider attempt. Once Stripe has
    -- accepted and bound the Session, delayed-payment success may arrive after
    -- that local TTL; the signed terminal webhook/reconciliation owns release.
    WHERE r.coupon_id=locked_coupon_id
      AND (r.status='bound' OR (r.status='reserved' AND r.expires_at>clock_timestamp()));
    IF locked_coupon_max IS NOT NULL AND COALESCE(locked_coupon_used,0)+active_holds>=locked_coupon_max THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='paid coupon capacity is exhausted';
    END IF;
  ELSIF requested_resource='points' THEN
    SELECT balance INTO locked_points_balance
    FROM public.user_points WHERE user_id=p_points_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='paid checkout points account is missing';
    END IF;
    SELECT COALESCE(sum(r.points_amount),0) INTO active_holds
    FROM public.paid_checkout_reservations AS r
    WHERE r.points_user_id=p_points_user_id
      AND (r.status='bound' OR (r.status='reserved' AND r.expires_at>clock_timestamp()));
    IF COALESCE(locked_points_balance,0)-active_holds<p_points_amount THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='paid checkout points are already reserved';
    END IF;
  END IF;

  expected_final_amount := CASE requested_resource
    WHEN 'coupon' THEN
      LEAST(
        p_promotion_amount_cents,
        CASE locked_coupon_type
          WHEN 'percentage' THEN round(p_base_amount_cents*(1-locked_coupon_value/100.0))::integer
          ELSE GREATEST(0::numeric,p_base_amount_cents-round(locked_coupon_value*100))::integer
        END
      )
    WHEN 'points' THEN
      CASE WHEN p_promotion_amount_cents=p_base_amount_cents
        THEN p_base_amount_cents-(p_points_amount*100)
        ELSE -1
      END
    ELSE p_promotion_amount_cents
  END;
  IF expected_final_amount<>p_final_amount_cents OR expected_final_amount<50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout final amount does not match locked discount authority';
  END IF;

  IF p_create_checkout_draft THEN
    INSERT INTO public.checkout_drafts(plan_code,birth_data,locale,used_at)
    VALUES(p_plan_code,p_birth_data,btrim(p_locale),NULL)
    RETURNING id INTO draft_id;
  END IF;
  INSERT INTO public.paid_checkout_reservations(
    request_key,payload_hash,plan_code,resource_kind,checkout_user_id,
    coupon_id,coupon_code,coupon_discount_type,coupon_discount_value,
    points_user_id,points_amount,base_amount_cents,final_amount_cents,
    checkout_draft_id,status,expires_at
  ) VALUES(
    p_request_key,p_payload_hash,p_plan_code,requested_resource,p_checkout_user_id,
    locked_coupon_id,locked_coupon_code,locked_coupon_type,locked_coupon_value,
    CASE WHEN requested_resource='points' THEN p_points_user_id ELSE NULL END,
    CASE WHEN requested_resource='points' THEN p_points_amount ELSE NULL END,
    p_base_amount_cents,p_final_amount_cents,draft_id,'reserved',p_expires_at
  );
  RETURN QUERY SELECT 'reserved'::text,p_request_key,requested_resource,p_checkout_user_id,
    locked_coupon_code,locked_coupon_type,locked_coupon_value,
    CASE WHEN requested_resource='points' THEN p_points_user_id ELSE NULL END,
    CASE WHEN requested_resource='points' THEN p_points_amount ELSE NULL END,
    draft_id,p_expires_at;
END
$reserve_paid_checkout_value$;

DROP FUNCTION IF EXISTS public.freeze_paid_checkout_session(text,text,uuid,text);
CREATE FUNCTION public.freeze_paid_checkout_session(
  p_request_key text,p_payload_hash text,p_checkout_draft_id uuid,p_stripe_request_body text
)
RETURNS TABLE(outcome text,request_key text,checkout_draft_id uuid,stripe_request_body text,reservation_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $freeze_paid_checkout_session$
DECLARE existing public.paid_checkout_reservations%ROWTYPE;
BEGIN
  IF p_checkout_draft_id IS NULL OR p_stripe_request_body IS NULL OR length(p_stripe_request_body) NOT BETWEEN 1 AND 32768 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout provider body is invalid';
  END IF;
  SELECT * INTO existing FROM public.paid_checkout_reservations AS r WHERE r.request_key=p_request_key FOR UPDATE;
  IF NOT FOUND OR existing.payload_hash<>p_payload_hash OR existing.status NOT IN ('reserved','bound')
    OR (existing.status='reserved' AND existing.expires_at<=clock_timestamp())
    OR (existing.checkout_draft_id IS NOT NULL AND existing.checkout_draft_id<>p_checkout_draft_id)
    OR (existing.stripe_request_body IS NOT NULL AND existing.stripe_request_body<>p_stripe_request_body)
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout provider body conflicts with reservation';
  END IF;
  UPDATE public.paid_checkout_reservations AS reservation
  SET checkout_draft_id=COALESCE(reservation.checkout_draft_id,p_checkout_draft_id),
      stripe_request_body=COALESCE(reservation.stripe_request_body,p_stripe_request_body)
  WHERE reservation.request_key=p_request_key;
  RETURN QUERY SELECT
    CASE WHEN existing.stripe_request_body IS NULL THEN 'prepared'::text ELSE 'already_prepared'::text END,
    p_request_key,p_checkout_draft_id,COALESCE(existing.stripe_request_body,p_stripe_request_body),existing.expires_at;
END
$freeze_paid_checkout_session$;

DROP FUNCTION IF EXISTS public.bind_paid_checkout_session(text,text,text);
CREATE FUNCTION public.bind_paid_checkout_session(p_request_key text,p_payload_hash text,p_stripe_session_id text)
RETURNS TABLE(outcome text,request_key text,checkout_draft_id uuid,stripe_session_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $bind_paid_checkout_session$
DECLARE existing public.paid_checkout_reservations%ROWTYPE;
BEGIN
  IF p_stripe_session_id IS NULL OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout Stripe Session identity is invalid';
  END IF;
  SELECT * INTO existing FROM public.paid_checkout_reservations AS r WHERE r.request_key=p_request_key FOR UPDATE;
  IF NOT FOUND OR existing.payload_hash<>p_payload_hash OR existing.status='released'
    OR existing.checkout_draft_id IS NULL OR existing.stripe_request_body IS NULL
    OR (existing.stripe_session_id IS NOT NULL AND existing.stripe_session_id<>p_stripe_session_id)
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout reservation cannot bind this Stripe Session';
  END IF;
  IF existing.status='consumed' THEN
    RETURN QUERY SELECT 'already_consumed'::text,existing.request_key,existing.checkout_draft_id,existing.stripe_session_id;
    RETURN;
  END IF;
  IF existing.status='bound' THEN
    RETURN QUERY SELECT 'already_bound'::text,existing.request_key,existing.checkout_draft_id,existing.stripe_session_id;
    RETURN;
  END IF;
  IF existing.expires_at<=clock_timestamp() THEN
    UPDATE public.paid_checkout_reservations
    SET status='released',released_at=clock_timestamp()
    WHERE paid_checkout_reservations.request_key=p_request_key;
    RETURN QUERY SELECT 'expired'::text,existing.request_key,existing.checkout_draft_id,NULL::text;
    RETURN;
  END IF;
  UPDATE public.paid_checkout_reservations
  SET status='bound',stripe_session_id=p_stripe_session_id,bound_at=clock_timestamp()
  WHERE paid_checkout_reservations.request_key=p_request_key;
  RETURN QUERY SELECT 'bound'::text,existing.request_key,existing.checkout_draft_id,p_stripe_session_id;
END
$bind_paid_checkout_session$;

DROP FUNCTION IF EXISTS public.get_paid_checkout_order_authority(text);
CREATE FUNCTION public.get_paid_checkout_order_authority(p_stripe_session_id text)
RETURNS TABLE(
  request_key text,plan_code text,checkout_user_id uuid,checkout_draft_id uuid,
  final_amount_cents integer,currency text,status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $get_paid_checkout_order_authority$
BEGIN
  IF p_stripe_session_id IS NULL OR p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]{10,220}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='paid checkout Stripe Session identity is invalid';
  END IF;
  RETURN QUERY
  SELECT r.request_key,r.plan_code,r.checkout_user_id,r.checkout_draft_id,
         r.final_amount_cents,'usd'::text,r.status
  FROM public.paid_checkout_reservations AS r
  WHERE r.stripe_session_id=p_stripe_session_id;
END
$get_paid_checkout_order_authority$;

DROP FUNCTION IF EXISTS public.consume_paid_checkout_for_order(text,text,text,uuid);
DROP FUNCTION IF EXISTS public.consume_paid_checkout_for_order(text,text,text,uuid,integer,text);
CREATE FUNCTION public.consume_paid_checkout_for_order(
  p_request_key text,p_stripe_session_id text,p_plan_code text,p_checkout_draft_id uuid,
  p_amount_total integer,p_currency text
)
RETURNS TABLE(
  outcome text,request_key text,resource_kind text,checkout_user_id uuid,
  coupon_code text,points_user_id uuid,points_amount integer,checkout_draft_id uuid,
  final_amount_cents integer,currency text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $consume_paid_checkout_for_order$
DECLARE
  existing public.paid_checkout_reservations%ROWTYPE;
  coupon_row public.coupons%ROWTYPE;
  locked_balance integer;
  new_balance integer;
BEGIN
  SELECT * INTO existing FROM public.paid_checkout_reservations AS r WHERE r.request_key=p_request_key FOR UPDATE;
  IF NOT FOUND OR existing.plan_code<>p_plan_code OR existing.checkout_draft_id IS DISTINCT FROM p_checkout_draft_id
    OR existing.stripe_session_id IS DISTINCT FROM p_stripe_session_id OR existing.status='released'
    OR p_amount_total IS DISTINCT FROM existing.final_amount_cents
    OR lower(btrim(COALESCE(p_currency,'')))<>'usd'
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout order identity does not match its reservation';
  END IF;
  IF existing.status='consumed' THEN
    RETURN QUERY SELECT 'already_consumed'::text,existing.request_key,existing.resource_kind,
      existing.checkout_user_id,existing.coupon_code,existing.points_user_id,existing.points_amount,
      existing.checkout_draft_id,existing.final_amount_cents,'usd'::text;
    RETURN;
  END IF;
  IF existing.status<>'bound' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout order is not bound to this Stripe Session';
  END IF;

  -- Marking consumed first is intentional. Capacity triggers then exclude this
  -- hold while keeping every other live hold protected. Any later exception
  -- rolls this state transition back with the money-equivalent mutation.
  UPDATE public.paid_checkout_reservations
  SET status='consumed',consumed_at=clock_timestamp()
  WHERE paid_checkout_reservations.request_key=p_request_key;

  IF existing.resource_kind='coupon' THEN
    SELECT * INTO coupon_row FROM public.coupons WHERE id=existing.coupon_id FOR UPDATE;
    IF NOT FOUND OR coupon_row.code<>existing.coupon_code THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid coupon authority changed before consumption';
    END IF;
    UPDATE public.coupons SET used_count=COALESCE(used_count,0)+1 WHERE id=existing.coupon_id;
    INSERT INTO public.coupon_uses(
      coupon_id,coupon_code,order_id,customer_email,plan_code,original_amount,discount_applied
    ) VALUES(
      existing.coupon_id,existing.coupon_code,p_stripe_session_id,'',existing.plan_code,
      existing.base_amount_cents/100.0,(existing.base_amount_cents-existing.final_amount_cents)/100.0
    );
  ELSIF existing.resource_kind='points' THEN
    SELECT balance INTO locked_balance FROM public.user_points WHERE user_id=existing.points_user_id FOR UPDATE;
    IF NOT FOUND OR COALESCE(locked_balance,0)<existing.points_amount THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout points authority changed before consumption';
    END IF;
    new_balance:=locked_balance-existing.points_amount;
    UPDATE public.user_points
    SET balance=new_balance,total_used=COALESCE(total_used,0)+existing.points_amount,updated_at=clock_timestamp()
    WHERE user_id=existing.points_user_id;
    INSERT INTO public.point_transactions(user_id,type,amount,balance_after,description,reference_id)
    VALUES(existing.points_user_id,'use_checkout',-existing.points_amount,new_balance,
           existing.plan_code||' paid checkout reservation',p_stripe_session_id);
  END IF;
  RETURN QUERY SELECT 'consumed'::text,existing.request_key,existing.resource_kind,
    existing.checkout_user_id,existing.coupon_code,existing.points_user_id,existing.points_amount,
    existing.checkout_draft_id,existing.final_amount_cents,'usd'::text;
END
$consume_paid_checkout_for_order$;

DROP FUNCTION IF EXISTS public.release_paid_checkout_reservation(text,text);
CREATE FUNCTION public.release_paid_checkout_reservation(p_request_key text,p_stripe_session_id text)
RETURNS TABLE(outcome text,request_key text,resource_kind text,stripe_session_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $release_paid_checkout_reservation$
DECLARE existing public.paid_checkout_reservations%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.paid_checkout_reservations AS r WHERE r.request_key=p_request_key FOR UPDATE;
  IF NOT FOUND OR existing.stripe_session_id IS DISTINCT FROM p_stripe_session_id THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout failure identity does not match its reservation';
  END IF;
  IF existing.status='consumed' THEN
    RETURN QUERY SELECT 'already_consumed'::text,existing.request_key,existing.resource_kind,existing.stripe_session_id;
    RETURN;
  END IF;
  IF existing.status='released' THEN
    RETURN QUERY SELECT 'already_released'::text,existing.request_key,existing.resource_kind,existing.stripe_session_id;
    RETURN;
  END IF;
  IF existing.status<>'bound' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='only an exact bound paid checkout may be released';
  END IF;
  UPDATE public.paid_checkout_reservations SET status='released',released_at=clock_timestamp()
  WHERE paid_checkout_reservations.request_key=p_request_key;
  RETURN QUERY SELECT 'released'::text,existing.request_key,existing.resource_kind,existing.stripe_session_id;
END
$release_paid_checkout_reservation$;

DROP FUNCTION IF EXISTS public.abandon_paid_checkout_before_provider(text,text);
CREATE FUNCTION public.abandon_paid_checkout_before_provider(
  p_request_key text,p_payload_hash text
)
RETURNS TABLE(outcome text,request_key text,resource_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s'
AS $abandon_paid_checkout_before_provider$
DECLARE existing public.paid_checkout_reservations%ROWTYPE;
BEGIN
  SELECT * INTO existing
  FROM public.paid_checkout_reservations AS r
  WHERE r.request_key=p_request_key
  FOR UPDATE;
  IF NOT FOUND OR existing.payload_hash<>p_payload_hash THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout pre-provider abandonment identity does not match';
  END IF;
  IF existing.status='released' THEN
    RETURN QUERY SELECT 'already_released'::text,existing.request_key,existing.resource_kind;
    RETURN;
  END IF;
  IF existing.status<>'reserved' OR existing.stripe_session_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid checkout is no longer safe to abandon before provider';
  END IF;
  UPDATE public.paid_checkout_reservations
  SET status='released',released_at=clock_timestamp()
  WHERE paid_checkout_reservations.request_key=p_request_key;
  RETURN QUERY SELECT 'abandoned'::text,existing.request_key,existing.resource_kind;
END
$abandon_paid_checkout_before_provider$;

-- Existing free-checkout transactions lock the same source row. These two
-- triggers make them respect paid holds without changing their direct atomic
-- deduction/consumption path.
DROP TRIGGER IF EXISTS enforce_paid_coupon_reservation_capacity ON public.coupons;
DROP FUNCTION IF EXISTS public.enforce_paid_coupon_reservation_capacity();
CREATE FUNCTION public.enforce_paid_coupon_reservation_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $enforce_paid_coupon_reservation_capacity$
DECLARE active_holds bigint;
BEGIN
  IF NEW.max_uses IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO active_holds FROM public.paid_checkout_reservations AS r
  WHERE r.coupon_id=NEW.id
    AND (r.status='bound' OR (r.status='reserved' AND r.expires_at>clock_timestamp()));
  IF COALESCE(NEW.used_count,0)+active_holds>NEW.max_uses THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='coupon update would spend paid checkout reserved capacity';
  END IF;
  RETURN NEW;
END
$enforce_paid_coupon_reservation_capacity$;

CREATE TRIGGER enforce_paid_coupon_reservation_capacity
BEFORE UPDATE OF used_count,max_uses ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_coupon_reservation_capacity();

DROP TRIGGER IF EXISTS enforce_paid_point_reservation_capacity ON public.user_points;
DROP FUNCTION IF EXISTS public.enforce_paid_point_reservation_capacity();
CREATE FUNCTION public.enforce_paid_point_reservation_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $enforce_paid_point_reservation_capacity$
DECLARE active_holds bigint;
BEGIN
  SELECT COALESCE(sum(r.points_amount),0) INTO active_holds
  FROM public.paid_checkout_reservations AS r
  WHERE r.points_user_id=NEW.user_id
    AND (r.status='bound' OR (r.status='reserved' AND r.expires_at>clock_timestamp()));
  IF COALESCE(NEW.balance,0)<active_holds THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='points update would spend paid checkout reserved capacity';
  END IF;
  RETURN NEW;
END
$enforce_paid_point_reservation_capacity$;

CREATE TRIGGER enforce_paid_point_reservation_capacity
BEFORE UPDATE OF balance ON public.user_points
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_point_reservation_capacity();

REVOKE ALL ON FUNCTION public.reserve_paid_checkout_value(text,text,text,uuid,text,uuid,integer,jsonb,text,integer,integer,integer,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.freeze_paid_checkout_session(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bind_paid_checkout_session(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_paid_checkout_order_authority(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_paid_checkout_for_order(text,text,text,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_paid_checkout_reservation(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.abandon_paid_checkout_before_provider(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paid_checkout_value(text,text,text,uuid,text,uuid,integer,jsonb,text,integer,integer,integer,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.freeze_paid_checkout_session(text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_paid_checkout_session(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_paid_checkout_order_authority(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_paid_checkout_for_order(text,text,text,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_paid_checkout_reservation(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_paid_checkout_before_provider(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_paid_coupon_reservation_capacity() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.enforce_paid_point_reservation_capacity() FROM PUBLIC,anon,authenticated,service_role;

DO $paid_checkout_acl_postcondition$
DECLARE
  function_name text;
  function_oid oid;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'reserve_paid_checkout_value(text,text,text,uuid,text,uuid,integer,jsonb,text,integer,integer,integer,boolean,timestamp with time zone)',
    'freeze_paid_checkout_session(text,text,uuid,text)',
    'bind_paid_checkout_session(text,text,text)',
    'get_paid_checkout_order_authority(text)',
    'consume_paid_checkout_for_order(text,text,text,uuid,integer,text)',
    'release_paid_checkout_reservation(text,text)',
    'abandon_paid_checkout_before_provider(text,text)'
  ] LOOP
    function_oid:=to_regprocedure('public.'||function_name)::oid;
    IF function_oid IS NULL
      OR NOT pg_catalog.has_function_privilege('service_role',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('anon',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated',function_oid,'EXECUTE')
    THEN
      RAISE EXCEPTION 'paid checkout function ACL postcondition failed for %', function_name;
    END IF;
  END LOOP;
  IF pg_catalog.has_table_privilege('service_role','public.paid_checkout_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('anon','public.paid_checkout_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('authenticated','public.paid_checkout_reservations','SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'paid checkout ledger direct ACL postcondition failed';
  END IF;
END
$paid_checkout_acl_postcondition$;

COMMIT;
