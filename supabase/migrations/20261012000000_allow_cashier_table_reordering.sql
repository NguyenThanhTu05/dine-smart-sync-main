-- Adds only cashier access to the existing layout RPC. No RLS/grant/data changes.
-- Stop on source drift instead of replacing an unreviewed function implementation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(20261009,1);
DO $migration$
DECLARE fn regprocedure := to_regprocedure('public.restaurant_move_table(uuid,uuid,uuid)');
        source_hash text; definition text;
BEGIN
 IF fn IS NULL THEN RAISE EXCEPTION 'Missing restaurant_move_table dependency; stop deployment.'; END IF;
 SELECT md5(prosrc),pg_get_functiondef(oid) INTO source_hash,definition
 FROM pg_proc WHERE oid=fn AND prosecdef AND prorettype='void'::regtype
  AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND proconfig=ARRAY['search_path=pg_catalog, public'];
 IF source_hash IS NULL OR source_hash NOT IN ('ea53b74fa8ea561a81c79f3092df3681','39539300196b08de96aa25c5a00bc8ba') THEN
  RAISE EXCEPTION 'restaurant_move_table differs from the reviewed version; stop deployment.';
 END IF;
 IF NOT has_function_privilege('authenticated',fn,'EXECUTE')
    OR has_function_privilege('anon',fn,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
              WHERE p.oid=fn AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'Unexpected restaurant_move_table grants; stop deployment.';
 END IF;
 IF source_hash='ea53b74fa8ea561a81c79f3092df3681' THEN
  EXECUTE replace(definition,
   $old$PERFORM restaurant_private.require_role(ARRAY['admin']);$old$,
   $new$PERFORM restaurant_private.require_role(ARRAY['admin','cashier']);$new$);
 END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=fn) <> '39539300196b08de96aa25c5a00bc8ba' THEN
  RAISE EXCEPTION 'restaurant_move_table permission update did not match the reviewed version.';
 END IF;
END $migration$;
COMMIT;
