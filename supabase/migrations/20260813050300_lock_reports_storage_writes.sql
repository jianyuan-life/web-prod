BEGIN;

-- C/G15 future PDFs move to a separate private bucket. The legacy reports
-- bucket remains unchanged because E3 has four live PDFs there and is frozen.
DO $private_reports_bucket_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE (bucket.id = 'private-reports' OR bucket.name = 'private-reports')
      AND NOT (
        bucket.id = 'private-reports'
        AND bucket.name = 'private-reports'
        AND bucket.public IS NOT DISTINCT FROM false
        AND bucket.file_size_limit IS NOT DISTINCT FROM 5 * 1024 * 1024
        AND bucket.allowed_mime_types IS NOT DISTINCT FROM ARRAY['application/pdf']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'private-reports bucket already exists with a conflicting contract';
  END IF;
END
$private_reports_bucket_preflight$;

DO $private_reports_storage_acl_preflight$
BEGIN
  IF to_regclass('storage.objects') IS NULL
    OR to_regrole('service_role') IS NULL
  THEN
    RAISE EXCEPTION 'storage.objects or service_role is missing';
  END IF;

  IF NOT has_table_privilege('service_role', 'storage.objects', 'SELECT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE')
  THEN
    RAISE EXCEPTION 'storage.objects service_role table privileges are missing';
  END IF;
END
$private_reports_storage_acl_preflight$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) SELECT
  'private-reports',
  'private-reports',
  false,
  5 * 1024 * 1024,
  ARRAY['application/pdf']::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets AS bucket
  WHERE bucket.id = 'private-reports'
);

DROP POLICY IF EXISTS "Service role upload for private reports"
ON storage.objects;

DROP POLICY IF EXISTS "Service role update for private reports"
ON storage.objects;

DROP POLICY IF EXISTS "Deny client access to private reports"
ON storage.objects;

CREATE POLICY "Service role upload for private reports"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'private-reports'::text);

CREATE POLICY "Service role update for private reports"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'private-reports'::text)
WITH CHECK (bucket_id = 'private-reports'::text);

-- A bucket-scoped permissive policy elsewhere can be broader than its name or
-- a simple expression regex suggests. This restrictive policy is ANDed with
-- every permissive policy applicable to anon/authenticated, so neither role
-- can read, list, insert, update, or delete objects in private-reports while
-- policies for every other bucket retain their existing behavior.
CREATE POLICY "Deny client access to private reports"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'private-reports'::text)
WITH CHECK (bucket_id <> 'private-reports'::text);

DO $private_reports_storage_postcondition$
DECLARE
  bucket_expressions CONSTANT text[] := ARRAY[
    'bucket_id=''private-reports''::text',
    '''private-reports''::text=bucket_id'
  ]::text[];
  bucket_deny_expressions CONSTANT text[] := ARRAY[
    'bucket_id<>''private-reports''::text',
    '''private-reports''::text<>bucket_id'
  ]::text[];
BEGIN
  IF to_regclass('storage.objects') IS NULL
    OR to_regrole('service_role') IS NULL
    OR NOT has_table_privilege('service_role', 'storage.objects', 'SELECT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE')
  THEN
    RAISE EXCEPTION 'storage.objects service_role table privileges are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'private-reports'
      AND bucket.name = 'private-reports'
      AND bucket.public IS NOT DISTINCT FROM false
      AND bucket.file_size_limit IS NOT DISTINCT FROM 5 * 1024 * 1024
      AND bucket.allowed_mime_types IS NOT DISTINCT FROM ARRAY['application/pdf']::text[]
  ) THEN
    RAISE EXCEPTION 'private-reports bucket is missing or drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.roles::text[] && ARRAY['public', 'anon', 'authenticated']::text[]
      AND (
        lower(COALESCE(policy.qual, 'true')) ~ '''private-reports'''
        OR lower(COALESCE(policy.with_check, 'true')) ~ '''private-reports'''
        OR (
          lower(COALESCE(policy.qual, 'true')) !~ 'bucket_id'
          AND lower(COALESCE(policy.with_check, 'true')) !~ 'bucket_id'
        )
      )
  ) THEN
    RAISE EXCEPTION 'a public, anon, or authenticated policy covers private-reports';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Deny client access to private reports'
      AND policy.permissive = 'RESTRICTIVE'
      AND policy.cmd = 'ALL'
      AND policy.roles::text[] @> ARRAY['anon', 'authenticated']::text[]
      AND cardinality(policy.roles::text[]) = 2
      AND regexp_replace(lower(policy.qual), '[[:space:]()]', '', 'g')
        = ANY (bucket_deny_expressions)
      AND regexp_replace(lower(policy.with_check), '[[:space:]()]', '', 'g')
        = ANY (bucket_deny_expressions)
      AND EXISTS (
        SELECT 1
        FROM pg_policy AS catalog_policy
        WHERE catalog_policy.polrelid = 'storage.objects'::regclass
          AND catalog_policy.polname = policy.policyname
          AND catalog_policy.polpermissive IS NOT DISTINCT FROM false
      )
  ) THEN
    RAISE EXCEPTION 'private-reports restrictive client deny policy is missing or drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Service role upload for private reports'
      AND policy.cmd = 'INSERT'
      AND policy.roles::text[] = ARRAY['service_role']::text[]
      AND policy.qual IS NULL
      AND policy.with_check IS NOT NULL
      AND regexp_replace(lower(policy.with_check), '[[:space:]()]', '', 'g')
        = ANY (bucket_expressions)
  ) THEN
    RAISE EXCEPTION 'private-reports service_role INSERT policy is missing or drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Service role update for private reports'
      AND policy.cmd = 'UPDATE'
      AND policy.roles::text[] = ARRAY['service_role']::text[]
      AND policy.qual IS NOT NULL
      AND regexp_replace(lower(policy.qual), '[[:space:]()]', '', 'g')
        = ANY (bucket_expressions)
      AND policy.with_check IS NOT NULL
      AND regexp_replace(lower(policy.with_check), '[[:space:]()]', '', 'g')
        = ANY (bucket_expressions)
  ) THEN
    RAISE EXCEPTION 'private-reports service_role UPDATE policy is missing or drifted';
  END IF;
END
$private_reports_storage_postcondition$;

COMMIT;
