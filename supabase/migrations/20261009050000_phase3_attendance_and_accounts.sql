-- Pending LOCAL migration. Apply only after all five approved migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(20261009,1);

CREATE TABLE IF NOT EXISTS restaurant_private.attendance_requests (
  actor_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(actor_id,request_id)
);
REVOKE ALL ON restaurant_private.attendance_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_attendance(p_kind text,p_lat numeric,p_lon numeric,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); s public.attendance_settings; day_start timestamptz;
  distance double precision; previous_kind text; payload jsonb; saved restaurant_private.attendance_requests;
  result jsonb; stamp timestamptz;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['staff','cashier','kitchen']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('in','out') OR p_lat IS NULL OR p_lon IS NULL
    OR NOT(p_lat BETWEEN -90 AND 90) OR NOT(p_lon BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Dữ liệu chấm công không hợp lệ';
  END IF;
  payload:=jsonb_build_object('kind',p_kind,'lat',p_lat,'lon',p_lon);
  SELECT * INTO saved FROM restaurant_private.attendance_requests WHERE actor_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF saved.payload<>payload THEN RAISE EXCEPTION 'Yêu cầu chấm công đã thay đổi'; END IF;
    RETURN saved.result;
  END IF;
  SELECT * INTO s FROM public.attendance_settings WHERE id=1 FOR SHARE;
  IF NOT FOUND OR NOT(s.latitude BETWEEN -90 AND 90) OR NOT(s.longitude BETWEEN -180 AND 180)
    OR s.radius_m<=0 OR s.radius_m::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Chưa cấu hình vị trí chấm công hợp lệ';
  END IF;
  distance:=2*6371000*asin(sqrt(least(1::double precision,greatest(0::double precision,
    power(sin(radians((p_lat-s.latitude)::double precision)/2),2)+
    cos(radians(p_lat::double precision))*cos(radians(s.latitude::double precision))*
    power(sin(radians((p_lon-s.longitude)::double precision)/2),2)))));
  IF distance>s.radius_m THEN RAISE EXCEPTION 'Bạn đang ngoài phạm vi chấm công'; END IF;
  stamp:=clock_timestamp();
  day_start:=date_trunc('day',stamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  SELECT kind INTO previous_kind FROM public.attendance_logs WHERE user_id=actor
    AND at>=day_start AND at<day_start+interval '1 day' ORDER BY at DESC,id DESC LIMIT 1;
  IF (p_kind='in' AND previous_kind IS NOT NULL) OR (p_kind='out' AND previous_kind IS DISTINCT FROM 'in') THEN
    RAISE EXCEPTION 'Trạng thái chấm công đã thay đổi, vui lòng tải lại';
  END IF;
  INSERT INTO public.attendance_logs(user_id,kind,latitude,longitude,distance_m,at)
    VALUES(actor,p_kind,p_lat,p_lon,round(distance),stamp) RETURNING to_jsonb(attendance_logs.*) INTO result;
  INSERT INTO restaurant_private.attendance_requests VALUES(actor,p_request,payload,result);
  RETURN result;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.attendance_logs FROM authenticated;
REVOKE ALL ON FUNCTION public.restaurant_attendance(text,numeric,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_attendance(text,numeric,numeric,uuid) TO authenticated;

-- Serialize role changes and Auth deletion before rows are touched, including
-- service-role requests. The row guard can then safely count surviving admins.
DROP TRIGGER IF EXISTS phase3_role_lock ON public.user_roles;
CREATE TRIGGER phase3_role_lock BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION restaurant_private.lock_writes();
DROP TRIGGER IF EXISTS phase3_auth_lock ON auth.users;
CREATE TRIGGER phase3_auth_lock BEFORE DELETE ON auth.users
  FOR EACH STATEMENT EXECUTE FUNCTION restaurant_private.lock_writes();
CREATE OR REPLACE FUNCTION restaurant_private.protect_last_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_SCHEMA='auth' THEN target:=OLD.id;
  ELSE
    IF OLD.role<>'admin' THEN
      IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
      RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' AND NEW.role='admin' AND NEW.user_id=OLD.user_id THEN RETURN NEW; END IF;
    target:=OLD.user_id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target AND role='admin')
    AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id<>target AND role='admin') THEN
    RAISE EXCEPTION 'Không thể xóa hoặc hạ quyền Admin cuối cùng';
  END IF;
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS phase3_last_admin ON public.user_roles;
DROP TRIGGER IF EXISTS phase3_last_admin ON auth.users;
CREATE TRIGGER phase3_last_admin BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION restaurant_private.protect_last_admin();
CREATE TRIGGER phase3_last_admin BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION restaurant_private.protect_last_admin();

CREATE OR REPLACE FUNCTION public.restaurant_staff(p_user uuid,p_profile jsonb,p_role text DEFAULT NULL,p_initialize boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user)
    OR p_profile IS NULL OR jsonb_typeof(p_profile)<>'object'
    OR (p_profile-ARRAY['username','full_name','phone','birthday','address'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Thông tin nhân viên không hợp lệ';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('staff','cashier','kitchen') THEN RAISE EXCEPTION 'Không được cấp quyền này'; END IF;
  IF p_initialize THEN
    IF p_role IS NULL OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user) THEN
      RAISE EXCEPTION 'Tài khoản đã được thiết lập hoặc thiếu vai trò';
    END IF;
    INSERT INTO public.profiles(id,username,full_name,phone,birthday,address)
    VALUES(p_user,p_profile->>'username',p_profile->>'full_name',nullif(p_profile->>'phone',''),
      nullif(p_profile->>'birthday','')::date,nullif(p_profile->>'address',''))
    ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,full_name=EXCLUDED.full_name,
      phone=EXCLUDED.phone,birthday=EXCLUDED.birthday,address=EXCLUDED.address;
  ELSE
    UPDATE public.profiles SET
      full_name=CASE WHEN p_profile?'full_name' THEN p_profile->>'full_name' ELSE full_name END,
      phone=CASE WHEN p_profile?'phone' THEN nullif(p_profile->>'phone','') ELSE phone END,
      birthday=CASE WHEN p_profile?'birthday' THEN nullif(p_profile->>'birthday','')::date ELSE birthday END,
      address=CASE WHEN p_profile?'address' THEN nullif(p_profile->>'address','') ELSE address END
    WHERE id=p_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy nhân viên'; END IF;
    IF p_profile?'username' THEN RAISE EXCEPTION 'Không được đổi tên đăng nhập'; END IF;
  END IF;
  IF p_role IS NOT NULL THEN
    -- Delete/insert is atomic and the last-admin guard applies to the deletion.
    DELETE FROM public.user_roles WHERE user_id=p_user;
    INSERT INTO public.user_roles(user_id,role) VALUES(p_user,p_role::public.app_role);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.restaurant_staff(uuid,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_staff(uuid,jsonb,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION restaurant_private.protect_last_admin() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.restaurant_open_order(p_table uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[]; found_orders jsonb;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff','kitchen']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  ids:=restaurant_private.table_ids(p_table);
  SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',
    (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at,i.id),'[]'::jsonb) FROM public.order_items i WHERE i.order_id=o.id)))
  INTO found_orders FROM public.orders o WHERE o.table_id=ANY(ids) AND NOT o.is_paid;
  IF jsonb_array_length(found_orders)>1 THEN RAISE EXCEPTION 'Nhóm bàn có nhiều hóa đơn mở'; END IF;
  RETURN found_orders->0;
END $$;
REVOKE ALL ON FUNCTION public.restaurant_open_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_open_order(uuid) TO authenticated;
COMMIT;
