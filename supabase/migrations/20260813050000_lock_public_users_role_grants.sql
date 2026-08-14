BEGIN;

-- Table-level grants make every writable column reachable. Remove them before
-- rebuilding the narrower authenticated contract. Column-level grants are
-- revoked separately because they survive a table-level REVOKE.
REVOKE INSERT, UPDATE
ON TABLE public.users
FROM PUBLIC, anon, authenticated;

-- Clear every known write-column ACL, including the privilege drift on role
-- and created_at. Repeating these REVOKEs is safe and leaves owner/service_role
-- privileges untouched because neither principal is a revocation target.
REVOKE INSERT (id, email, name, role, created_at),
       UPDATE (id, email, name, role, created_at)
ON TABLE public.users
FROM PUBLIC, anon, authenticated;

-- Authenticated callers may create their auth-bound profile and maintain only
-- the two user-editable attributes. The database continues to own role and
-- created_at; id cannot be changed after insertion.
GRANT INSERT (id, email, name)
ON TABLE public.users
TO authenticated;

GRANT UPDATE (email, name)
ON TABLE public.users
TO authenticated;

DO $users_role_lock$
DECLARE
  own_row_expressions CONSTANT text[] := ARRAY['id=auth.uid', 'auth.uid=id']::text[];
  checked_role text;
  checked_column text;
  should_insert boolean;
  should_update boolean;
  can_insert boolean;
  can_update boolean;
BEGIN
  -- The column grant is only one layer of the boundary. Abort and roll the
  -- transaction back if RLS or either existing self-write policy is missing.
  IF NOT COALESCE(
    (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'users'
        AND relation.relkind IN ('r', 'p')
    ),
    false
  ) THEN
    RAISE EXCEPTION 'public.users must have row-level security enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.users'::regclass
      AND policy.polcmd IN ('a', '*')
      AND policy.polwithcheck IS NOT NULL
      AND (
        0::oid = ANY (policy.polroles)
        OR to_regrole('authenticated')::oid = ANY (policy.polroles)
      )
      AND regexp_replace(
        lower(pg_get_expr(policy.polwithcheck, policy.polrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = ANY (own_row_expressions)
  ) THEN
    RAISE EXCEPTION 'public.users requires an exact INSERT WITH CHECK auth.uid() = id policy for authenticated callers';
  END IF;

  -- PostgreSQL reuses an UPDATE policy's USING expression as WITH CHECK when
  -- polwithcheck is null. Verify the USING boundary independently, then verify
  -- the effective new-row check through explicit-check-or-USING fallback.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.users'::regclass
      AND policy.polcmd IN ('w', '*')
      AND policy.polqual IS NOT NULL
      AND (
        0::oid = ANY (policy.polroles)
        OR to_regrole('authenticated')::oid = ANY (policy.polroles)
      )
      AND regexp_replace(
        lower(pg_get_expr(policy.polqual, policy.polrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = ANY (own_row_expressions)
      AND regexp_replace(
        lower(
          COALESCE(
            pg_get_expr(policy.polwithcheck, policy.polrelid),
            pg_get_expr(policy.polqual, policy.polrelid)
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = ANY (own_row_expressions)
  ) THEN
    RAISE EXCEPTION 'public.users requires exact UPDATE USING and effective WITH CHECK auth.uid() = id policies for authenticated callers';
  END IF;

  -- Column grants must not be masked by a broader inherited table grant.
  FOR checked_role IN
    SELECT unnest(ARRAY['anon', 'authenticated']::text[])
  LOOP
    IF has_table_privilege(checked_role, 'public.users', 'INSERT')
       OR has_table_privilege(checked_role, 'public.users', 'UPDATE') THEN
      RAISE EXCEPTION '% retains table-level INSERT or UPDATE on public.users', checked_role;
    END IF;
  END LOOP;

  -- has_column_privilege reports effective rights, including inherited and
  -- table-wide grants. Verify every known write column, not merely role.
  FOR checked_role, checked_column, should_insert, should_update IN
    SELECT *
    FROM (VALUES
      ('anon',          'id',         false, false),
      ('anon',          'email',      false, false),
      ('anon',          'name',       false, false),
      ('anon',          'role',       false, false),
      ('anon',          'created_at', false, false),
      ('authenticated', 'id',         true,  false),
      ('authenticated', 'email',      true,  true),
      ('authenticated', 'name',       true,  true),
      ('authenticated', 'role',       false, false),
      ('authenticated', 'created_at', false, false)
    ) AS expected(role_name, column_name, can_insert, can_update)
  LOOP
    can_insert := has_column_privilege(
      checked_role,
      'public.users',
      checked_column,
      'INSERT'
    );
    can_update := has_column_privilege(
      checked_role,
      'public.users',
      checked_column,
      'UPDATE'
    );

    IF can_insert IS DISTINCT FROM should_insert
       OR can_update IS DISTINCT FROM should_update THEN
      RAISE EXCEPTION
        'unexpected public.users privileges for %.%: INSERT %, UPDATE %',
        checked_role,
        checked_column,
        can_insert,
        can_update;
    END IF;
  END LOOP;

  -- PUBLIC is a PostgreSQL pseudo-role and has no pg_roles row, so the
  -- has_*_privilege helpers cannot name it directly. In ACL catalogs its
  -- grantee OID is 0; inspect both table and column ACLs explicitly.
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'users'
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains table-level INSERT or UPDATE on public.users';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL aclexplode(
      COALESCE(attribute.attacl, acldefault('c', relation.relowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'users'
      AND attribute.attname = ANY (ARRAY['id', 'email', 'name', 'role', 'created_at']::text[])
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains column-level INSERT or UPDATE on public.users';
  END IF;
END
$users_role_lock$;

COMMIT;
