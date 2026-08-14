BEGIN;

-- This deployable migration closes recurrence only for objects created by
-- postgres. The live executor is not a member of supabase_admin, so that
-- owner's insecure defaults are a remaining blocker handled by the separate,
-- authority-gated script under supabase/manual/.
DO $postgres_default_acl_preflight$
BEGIN
  IF pg_catalog.to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'required schema public is missing';
  END IF;

  IF pg_catalog.to_regrole('postgres') IS NULL
     OR pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'postgres, anon, authenticated, and service_role must exist';
  END IF;

  IF NOT pg_catalog.pg_has_role(current_user, 'postgres', 'MEMBER') THEN
    RAISE EXCEPTION
      'migration executor % cannot alter default privileges for role postgres',
      current_user;
  END IF;
END
$postgres_default_acl_preflight$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated;

-- Function EXECUTE is granted to PUBLIC by PostgreSQL's hard-wired global
-- default. A schema-scoped REVOKE cannot subtract that global grant, so this
-- revoke intentionally applies to every future postgres-owned function.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO service_role;

DO $postgres_default_acl_postcondition$
DECLARE
  owner_oid oid := pg_catalog.to_regrole('postgres')::oid;
  schema_oid oid := pg_catalog.to_regnamespace('public')::oid;
  anon_oid oid := pg_catalog.to_regrole('anon')::oid;
  authenticated_oid oid := pg_catalog.to_regrole('authenticated')::oid;
  service_role_oid oid := pg_catalog.to_regrole('service_role')::oid;
  object_kind "char";
  default_acl aclitem[];
  global_function_acl aclitem[];
  privilege_name text;
BEGIN
  FOREACH object_kind IN ARRAY ARRAY['r'::"char", 'S'::"char", 'f'::"char"]
  LOOP
    SELECT defaults.defaclacl
      INTO default_acl
    FROM pg_catalog.pg_default_acl AS defaults
    WHERE defaults.defaclrole = owner_oid
      AND defaults.defaclnamespace = schema_oid
      AND defaults.defaclobjtype = object_kind;

    IF NOT FOUND OR default_acl IS NULL THEN
      RAISE EXCEPTION
        'missing explicit postgres default ACL for public object kind %',
        object_kind;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(default_acl) AS acl
      WHERE acl.grantee = 0
         OR acl.grantee = anon_oid
         OR acl.grantee = authenticated_oid
    ) THEN
      RAISE EXCEPTION
        'postgres public default ACL kind % still grants a client role',
        object_kind;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(default_acl) AS acl
      WHERE acl.grantee NOT IN (owner_oid, service_role_oid)
    ) THEN
      RAISE EXCEPTION
        'postgres public default ACL kind % grants an unexpected role',
        object_kind;
    END IF;

    FOR privilege_name IN
      SELECT DISTINCT acl.privilege_type
      FROM pg_catalog.aclexplode(
        pg_catalog.acldefault(object_kind, owner_oid)
      ) AS acl
      WHERE acl.grantee = owner_oid
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(default_acl) AS acl
        WHERE acl.grantee = service_role_oid
          AND acl.privilege_type = privilege_name
      ) THEN
        RAISE EXCEPTION
          'service_role lacks default % for postgres public object kind %',
          privilege_name,
          object_kind;
      END IF;
    END LOOP;
  END LOOP;

  SELECT defaults.defaclacl
    INTO global_function_acl
  FROM pg_catalog.pg_default_acl AS defaults
  WHERE defaults.defaclrole = owner_oid
    AND defaults.defaclnamespace = 0
    AND defaults.defaclobjtype = 'f'::"char";

  IF NOT FOUND OR global_function_acl IS NULL THEN
    RAISE EXCEPTION 'missing explicit postgres global function default ACL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.aclexplode(global_function_acl) AS acl
    WHERE acl.grantee = 0
       OR acl.grantee = anon_oid
       OR acl.grantee = authenticated_oid
       OR acl.grantee <> owner_oid
  ) THEN
    RAISE EXCEPTION
      'postgres global function defaults still grant a non-owner role';
  END IF;
END
$postgres_default_acl_postcondition$;

COMMIT;
