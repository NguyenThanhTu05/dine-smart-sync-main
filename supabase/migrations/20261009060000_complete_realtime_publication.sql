-- PROPOSAL ONLY. Not applied to cloud. Run after all six frozen migrations.
-- Adds membership only; preserves table data, RLS, grants and replica identity.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(20261009, 2);

DO $publication$
DECLARE
  table_name text;
  relation_id regclass;
  publication_id oid;
  publishes_all boolean;
BEGIN
  IF to_regprocedure('public.restaurant_attendance(text,numeric,numeric,uuid)') IS NULL
     OR to_regprocedure('public.restaurant_open_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the six frozen migrations first';
  END IF;

  SELECT oid, puballtables INTO publication_id, publishes_all
  FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF NOT FOUND OR publishes_all THEN
    RAISE EXCEPTION 'Expected an explicit supabase_realtime publication; review configuration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE oid = publication_id
                 AND pubinsert AND pubupdate AND pubdelete) THEN
    RAISE EXCEPTION 'Publication event configuration differs; review before applying';
  END IF;

  -- Validate the entire list before changing publication membership.
  FOREACH table_name IN ARRAY ARRAY[
    'areas', 'menu_items', 'categories', 'user_roles',
    'attendance_logs', 'attendance_settings'
  ] LOOP
    relation_id := to_regclass(format('public.%I', table_name));
    IF relation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = relation_id
        AND relkind = 'r' AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Missing ordinary table or disabled RLS: public.%', table_name;
    END IF;
    IF NOT has_table_privilege('authenticated', relation_id, 'SELECT')
       OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = relation_id
                       AND polcmd IN ('r', '*')) THEN
      RAISE EXCEPTION 'Missing SELECT grant/policy: public.%', table_name;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'areas', 'menu_items', 'categories', 'user_roles',
    'attendance_logs', 'attendance_settings'
  ] LOOP
    relation_id := to_regclass(format('public.%I', table_name));
    IF NOT EXISTS (SELECT 1 FROM pg_publication_rel
                   WHERE prpubid = publication_id AND prrelid = relation_id) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$publication$;
COMMIT;
