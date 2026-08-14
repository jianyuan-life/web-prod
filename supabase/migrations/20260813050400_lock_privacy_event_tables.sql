BEGIN;

DO $privacy_event_tables_preflight$
DECLARE
  target_tables CONSTANT text[] := ARRAY[
    'user_analytics',
    'email_unsubscribes',
    'free_tool_usage',
    'visitor_events'
  ]::text[];
  target_table text;
  relation_oid oid;
  column_list text;
  existing_policy record;
  backing_sequence record;
BEGIN
  IF pg_catalog.to_regrole('anon') IS NULL THEN
    RAISE EXCEPTION 'required role anon is missing';
  END IF;

  IF pg_catalog.to_regrole('authenticated') IS NULL THEN
    RAISE EXCEPTION 'required role authenticated is missing';
  END IF;

  IF pg_catalog.to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'required role service_role is missing';
  END IF;

  FOREACH target_table IN ARRAY target_tables
  LOOP
    SELECT relation.oid
      INTO relation_oid
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = target_table
      AND relation.relkind IN ('r', 'p');

    IF relation_oid IS NULL THEN
      RAISE EXCEPTION 'required table public.% is missing', target_table;
    END IF;

    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target_table
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY',
      target_table
    );

    FOR existing_policy IN
      SELECT policy.polname
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation_oid
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY %I ON public.%I',
        existing_policy.polname,
        target_table
      );
    END LOOP;

    SELECT pg_catalog.string_agg(
             pg_catalog.format('%I', attribute.attname),
             ', '
             ORDER BY attribute.attnum
           )
      INTO column_list
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = relation_oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    IF column_list IS NULL THEN
      RAISE EXCEPTION 'public.% has no live columns to secure', target_table;
    END IF;

    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      target_table
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      column_list,
      target_table
    );
    EXECUTE pg_catalog.format(
      'GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role',
      target_table
    );
  END LOOP;

  -- pg_get_serial_sequence resolves both SERIAL and identity ownership. The
  -- loop is intentionally empty for UUID/default-free tables.
  FOR backing_sequence IN
    SELECT DISTINCT
      sequence_namespace.nspname AS schema_name,
      sequence_relation.relname AS sequence_name
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL (
      SELECT pg_catalog.to_regclass(
        pg_catalog.pg_get_serial_sequence(
          pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
          attribute.attname
        )
      ) AS sequence_oid
    ) AS owned_sequence
    JOIN pg_catalog.pg_class AS sequence_relation
      ON sequence_relation.oid = owned_sequence.sequence_oid
    JOIN pg_catalog.pg_namespace AS sequence_namespace
      ON sequence_namespace.oid = sequence_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (target_tables)
      AND relation.relkind IN ('r', 'p')
      AND sequence_relation.relkind = 'S'
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated',
      backing_sequence.schema_name,
      backing_sequence.sequence_name
    );
    EXECUTE pg_catalog.format(
      'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO service_role',
      backing_sequence.schema_name,
      backing_sequence.sequence_name
    );
  END LOOP;
END
$privacy_event_tables_preflight$;

DO $privacy_event_tables_postcondition$
DECLARE
  target_tables CONSTANT text[] := ARRAY[
    'user_analytics',
    'email_unsubscribes',
    'free_tool_usage',
    'visitor_events'
  ]::text[];
  anon_oid oid := pg_catalog.to_regrole('anon')::oid;
  authenticated_oid oid := pg_catalog.to_regrole('authenticated')::oid;
  service_role_oid oid := pg_catalog.to_regrole('service_role')::oid;
  service_role_bypasses_rls boolean;
  target_table text;
  relation_oid oid;
  relation_owner oid;
  rls_enabled boolean;
  rls_forced boolean;
  checked_role_oid oid;
  checked_role_name text;
  checked_privilege text;
  target_attribute record;
  backing_sequence record;
BEGIN
  IF anon_oid IS NULL
     OR authenticated_oid IS NULL
     OR service_role_oid IS NULL THEN
    RAISE EXCEPTION 'anon, authenticated, and service_role must all exist';
  END IF;

  SELECT role.rolbypassrls
    INTO service_role_bypasses_rls
  FROM pg_catalog.pg_roles AS role
  WHERE role.oid = service_role_oid;

  IF service_role_bypasses_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service_role must have BYPASSRLS before privacy event policies are removed';
  END IF;

  FOREACH target_table IN ARRAY target_tables
  LOOP
    SELECT
      relation.oid,
      relation.relowner,
      relation.relrowsecurity,
      relation.relforcerowsecurity
      INTO relation_oid, relation_owner, rls_enabled, rls_forced
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = target_table
      AND relation.relkind IN ('r', 'p');

    IF relation_oid IS NULL THEN
      RAISE EXCEPTION 'postcondition target public.% is missing', target_table;
    END IF;

    IF NOT rls_enabled OR rls_forced THEN
      RAISE EXCEPTION
        'unexpected RLS flags on public.%: enabled %, forced %',
        target_table,
        rls_enabled,
        rls_forced;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation_oid
    ) THEN
      RAISE EXCEPTION 'public.% still has one or more policies', target_table;
    END IF;

    FOREACH checked_role_oid IN ARRAY ARRAY[anon_oid, authenticated_oid]
    LOOP
      checked_role_name := pg_catalog.pg_get_userbyid(checked_role_oid);
      FOR checked_privilege IN
        SELECT DISTINCT acl.privilege_type
        FROM pg_catalog.aclexplode(
          pg_catalog.acldefault('r', relation_owner)
        ) AS acl
        WHERE acl.grantee = relation_owner
      LOOP
        IF pg_catalog.has_table_privilege(
          checked_role_oid,
          relation_oid,
          checked_privilege
        ) THEN
          RAISE EXCEPTION
            '% retains effective % on public.%',
            checked_role_name,
            checked_privilege,
            target_table;
        END IF;
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (
            SELECT relation.relacl
            FROM pg_catalog.pg_class AS relation
            WHERE relation.oid = relation_oid
          ),
          pg_catalog.acldefault('r', relation_owner)
        )
      ) AS acl
      WHERE acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains a table privilege on public.%', target_table;
    END IF;

    FOR target_attribute IN
      SELECT
        attribute.attnum,
        attribute.attname,
        attribute.attacl
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = relation_oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    LOOP
      FOREACH checked_role_oid IN ARRAY ARRAY[anon_oid, authenticated_oid]
      LOOP
        checked_role_name := pg_catalog.pg_get_userbyid(checked_role_oid);
        FOREACH checked_privilege IN ARRAY ARRAY[
          'SELECT',
          'INSERT',
          'UPDATE',
          'REFERENCES'
        ]::text[]
        LOOP
          IF pg_catalog.has_column_privilege(
            checked_role_oid,
            relation_oid,
            target_attribute.attnum,
            checked_privilege
          ) THEN
            RAISE EXCEPTION
              '% retains effective % on public.%.%',
              checked_role_name,
              checked_privilege,
              target_table,
              target_attribute.attname;
          END IF;
        END LOOP;
      END LOOP;

      IF EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            target_attribute.attacl,
            pg_catalog.acldefault('c', relation_owner)
          )
        ) AS acl
        WHERE acl.grantee = 0
      ) THEN
        RAISE EXCEPTION
          'PUBLIC retains a column privilege on public.%.%',
          target_table,
          target_attribute.attname;
      END IF;
    END LOOP;

    FOR checked_privilege IN
      SELECT DISTINCT acl.privilege_type
      FROM pg_catalog.aclexplode(
        pg_catalog.acldefault('r', relation_owner)
      ) AS acl
      WHERE acl.grantee = relation_owner
    LOOP
      IF NOT pg_catalog.has_table_privilege(
        service_role_oid,
        relation_oid,
        checked_privilege
      ) THEN
        RAISE EXCEPTION
          'service_role lacks effective % on public.%',
          checked_privilege,
          target_table;
      END IF;
    END LOOP;
  END LOOP;

  FOR backing_sequence IN
    SELECT DISTINCT
      sequence_relation.oid AS sequence_oid,
      sequence_relation.relowner AS sequence_owner,
      sequence_relation.relacl AS sequence_acl,
      sequence_namespace.nspname AS schema_name,
      sequence_relation.relname AS sequence_name
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL (
      SELECT pg_catalog.to_regclass(
        pg_catalog.pg_get_serial_sequence(
          pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
          attribute.attname
        )
      ) AS sequence_oid
    ) AS owned_sequence
    JOIN pg_catalog.pg_class AS sequence_relation
      ON sequence_relation.oid = owned_sequence.sequence_oid
    JOIN pg_catalog.pg_namespace AS sequence_namespace
      ON sequence_namespace.oid = sequence_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (target_tables)
      AND relation.relkind IN ('r', 'p')
      AND sequence_relation.relkind = 'S'
  LOOP
    FOREACH checked_role_oid IN ARRAY ARRAY[anon_oid, authenticated_oid]
    LOOP
      checked_role_name := pg_catalog.pg_get_userbyid(checked_role_oid);
      FOREACH checked_privilege IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]
      LOOP
        IF pg_catalog.has_sequence_privilege(
          checked_role_oid,
          backing_sequence.sequence_oid,
          checked_privilege
        ) THEN
          RAISE EXCEPTION
            '% retains effective % on sequence %.%',
            checked_role_name,
            checked_privilege,
            backing_sequence.schema_name,
            backing_sequence.sequence_name;
        END IF;
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          backing_sequence.sequence_acl,
          pg_catalog.acldefault('s', backing_sequence.sequence_owner)
        )
      ) AS acl
      WHERE acl.grantee = 0
    ) THEN
      RAISE EXCEPTION
        'PUBLIC retains a privilege on sequence %.%',
        backing_sequence.schema_name,
        backing_sequence.sequence_name;
    END IF;

    IF NOT pg_catalog.has_sequence_privilege(
      service_role_oid,
      backing_sequence.sequence_oid,
      'USAGE'
    ) THEN
      RAISE EXCEPTION
        'service_role lacks USAGE on sequence %.%',
        backing_sequence.schema_name,
        backing_sequence.sequence_name;
    END IF;

    IF NOT pg_catalog.has_sequence_privilege(
      service_role_oid,
      backing_sequence.sequence_oid,
      'SELECT'
    ) THEN
      RAISE EXCEPTION
        'service_role lacks SELECT on sequence %.%',
        backing_sequence.schema_name,
        backing_sequence.sequence_name;
    END IF;
  END LOOP;
END
$privacy_event_tables_postcondition$;

COMMIT;
