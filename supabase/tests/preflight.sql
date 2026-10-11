-- REVIEW ONLY: SELECT queries; do not execute against cloud without choosing the intended environment.
-- Never prints password values, Auth hashes or tokens.
SELECT current_database() AS database_name, current_setting('server_version') AS server_version;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('orders','order_items','restaurant_tables','table_groups','profiles','payment_settings','recipes','ingredients')
ORDER BY table_name,ordinal_position;
SELECT count(*) AS tables_with_duplicate_open_orders FROM (
 SELECT table_id FROM public.orders WHERE NOT is_paid GROUP BY table_id HAVING count(*)>1
) duplicates;
SELECT count(*) AS groups_with_duplicate_open_orders FROM (
 SELECT t.merged_group_id FROM public.orders o JOIN public.restaurant_tables t ON t.id=o.table_id
 WHERE NOT o.is_paid AND t.merged_group_id IS NOT NULL GROUP BY t.merged_group_id HAVING count(*)>1
) duplicates;
SELECT count(*) AS password_copies_to_clear FROM public.profiles WHERE visible_password IS NOT NULL;
SELECT count(*) AS order_rows,count(*) FILTER(WHERE is_paid) AS paid_rows,sum(total) AS stored_original_subtotal_sum FROM public.orders;
SELECT count(*) AS profile_rows FROM public.profiles;
SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname;
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT tgrelid::regclass AS relation,tgname,pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace);
SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','restaurant_private') AND p.prokind='f';
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname IN ('public','restaurant_private') ORDER BY tablename,policyname;
SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema IN ('public','restaurant_private') AND grantee IN ('anon','authenticated','service_role','PUBLIC') ORDER BY table_name,grantee,privilege_type;
SELECT pid,state,wait_event_type,wait_event,clock_timestamp()-xact_start AS transaction_age
FROM pg_stat_activity WHERE datname=current_database() AND xact_start IS NOT NULL ORDER BY xact_start;
