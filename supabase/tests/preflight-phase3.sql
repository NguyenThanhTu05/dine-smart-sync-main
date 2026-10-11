-- Read-only metadata/counts. Review results before approving any deployment.
SELECT to_regprocedure('restaurant_private.lock_writes()') AS lock_dependency,
  to_regprocedure('restaurant_private.table_ids(uuid)') AS group_dependency,
  to_regprocedure('restaurant_private.require_role(text[])') AS role_dependency,
  has_table_privilege(current_user,'auth.users','TRIGGER') AS can_install_auth_guard;
SELECT count(DISTINCT user_id) FILTER (WHERE role='admin') AS admin_count FROM public.user_roles;
SELECT count(*) AS ambiguous_role_users FROM (
  SELECT user_id FROM public.user_roles GROUP BY user_id HAVING count(*)>1
) roles;
SELECT count(*) AS invalid_settings FROM public.attendance_settings
WHERE NOT(latitude BETWEEN -90 AND 90) OR NOT(longitude BETWEEN -180 AND 180)
  OR radius_m<=0 OR radius_m::text IN ('NaN','Infinity','-Infinity');
SELECT schemaname,tablename,policyname,cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('attendance_logs','profiles','user_roles');
SELECT schemaname,tablename FROM pg_publication_tables
WHERE schemaname='public' AND tablename IN
  ('restaurant_tables','areas','orders','order_items','user_roles','attendance_logs','attendance_settings','ingredients','menu_items','categories');
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND ((n.nspname='auth' AND c.relname='users')
  OR (n.nspname='public' AND c.relname IN ('user_roles','attendance_logs')));
SELECT transaction_timestamp() AS server_time,
  (transaction_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vietnam_day;
