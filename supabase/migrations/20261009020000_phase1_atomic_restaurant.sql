-- REVIEW/STAGING ONLY. Never apply to production without final approval.
-- Legacy paid rows are not backfilled. A duplicate-open-order preflight aborts
-- instead of silently changing historical data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND tgname='trg_deduct_stock' AND NOT tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND tgname='trg_deduct_stock_insert' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Preflight: stock trigger layout differs from verified cloud; review before applying';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS restaurant_private;
REVOKE ALL ON SCHEMA restaurant_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS restaurant_private.submit_requests (
  actor_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  PRIMARY KEY(actor_id,request_id)
);
REVOKE ALL ON restaurant_private.submit_requests FROM PUBLIC,anon,authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_snapshot jsonb;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE NOT is_paid GROUP BY table_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Preflight: duplicate open orders; reconcile explicitly before deployment';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o JOIN public.restaurant_tables t ON t.id=o.table_id
    WHERE NOT o.is_paid AND t.merged_group_id IS NOT NULL
    GROUP BY t.merged_group_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Preflight: multiple open orders in a group; no automatic repair'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_per_table ON public.orders(table_id) WHERE NOT is_paid;

-- One lock order for all restaurant financial writes. Intentionally serialize
-- short restaurant transactions; no network work is performed under this lock.
CREATE OR REPLACE FUNCTION restaurant_private.lock_writes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN PERFORM pg_advisory_xact_lock(20261009, 1); RETURN NULL; END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['orders','order_items','restaurant_tables','table_groups','payment_settings','menu_items','recipes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS phase1_lock_writes ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER phase1_lock_writes BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION restaurant_private.lock_writes()', tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION restaurant_private.require_role(allowed text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text=ANY(allowed)
  ) THEN RAISE EXCEPTION 'Không có quyền thực hiện thao tác này.' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION restaurant_private.table_ids(p_table uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE gid uuid; ids uuid[];
BEGIN
  SELECT merged_group_id INTO gid FROM public.restaurant_tables WHERE id=p_table;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn không còn tồn tại.'; END IF;
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.restaurant_tables
    WHERE id=p_table OR (gid IS NOT NULL AND merged_group_id=gid);
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION restaurant_private.actor_label() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce((SELECT CASE r.role::text WHEN 'admin' THEN 'Quản lý' WHEN 'cashier' THEN 'Thu ngân'
    WHEN 'staff' THEN 'Nhân viên' ELSE 'Bếp' END || ' - ' || p.full_name
    FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
    WHERE p.id=auth.uid() ORDER BY r.role::text LIMIT 1), 'Nhân viên')
$$;

CREATE OR REPLACE FUNCTION restaurant_private.quote(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE o public.orders; ps public.payment_settings; items jsonb; ids uuid[];
  sub numeric; svc numeric; vat numeric; disc numeric; pct numeric; result jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hóa đơn không tồn tại.'; END IF;
  IF o.is_paid THEN
    IF o.payment_snapshot IS NULL THEN RAISE EXCEPTION 'Hóa đơn cũ chưa có dữ liệu chốt, cần đối soát riêng.'; END IF;
    RETURN o.payment_snapshot;
  END IF;
  ids := restaurant_private.table_ids(o.table_id);
  IF (SELECT count(*) FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid) <> 1 THEN
    RAISE EXCEPTION 'Nhóm bàn có nhiều hóa đơn mở; cần đối soát trước khi thanh toán.';
  END IF;
  SELECT * INTO ps FROM public.payment_settings WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có cấu hình thanh toán.'; END IF;
  pct := CASE WHEN coalesce(o.discount_percent,0)>0 THEN o.discount_percent ELSE coalesce(ps.global_discount_percent,0) END;
  IF ps.service_percent NOT BETWEEN 0 AND 100 OR ps.vat_percent NOT BETWEEN 0 AND 100
    OR pct NOT BETWEEN 0 AND 100 OR ps.service_percent IS NULL OR ps.vat_percent IS NULL THEN
    RAISE EXCEPTION 'Cấu hình phí hoặc giảm giá không hợp lệ.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order AND (quantity<=0 OR price_snapshot NOT BETWEEN 0 AND 9999999999.99)) THEN
    RAISE EXCEPTION 'Số lượng hoặc giá món không hợp lệ.';
  END IF;
  SELECT coalesce(sum(price_snapshot*quantity),0),
    coalesce(jsonb_agg(jsonb_build_object('id',id,'menu_item_id',menu_item_id,'name_snapshot',name_snapshot,
      'price_snapshot',price_snapshot,'quantity',quantity,'notes',notes,'status',status,'no_cook',no_cook) ORDER BY id),'[]'::jsonb)
    INTO sub,items FROM public.order_items WHERE order_id=p_order;
  svc := round(sub*ps.service_percent/100);
  vat := round((sub+svc)*ps.vat_percent/100);
  disc := round((sub+svc+vat)*pct/100);
  result := jsonb_build_object('version',1,'currency','VND','order_id',o.id,'subtotal',sub,'service_percent',ps.service_percent,
    'service_fee',svc,'vat_percent',ps.vat_percent,'vat_fee',vat,'discount_percent',pct,
    'discount_amount',disc,'table_discount_percent',coalesce(o.discount_percent,0),
    'global_discount_percent',coalesce(ps.global_discount_percent,0),
    'discount_source',CASE WHEN coalesce(o.discount_percent,0)>0 THEN 'table' ELSE 'global' END,
    'total',sub+svc+vat-disc,'items',items,'table_ids',to_jsonb(ids),'order_notes',o.notes,'staff_id',o.staff_id,
    'table_name',(SELECT string_agg(name,' + ' ORDER BY id) FROM public.restaurant_tables WHERE id=ANY(ids)),
    'staff_name',(SELECT full_name FROM public.profiles WHERE id=o.staff_id));
  RETURN result || jsonb_build_object('fingerprint',md5(result::text));
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_quote(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  RETURN restaurant_private.quote(p_order);
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_submit_order(p_table uuid,p_lines jsonb,p_notes text DEFAULT '',p_request uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ids uuid[]; oid uuid; line jsonb; m public.menu_items; qty integer; n integer;
  previous restaurant_private.submit_requests; request_payload jsonb;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF p_request IS NULL THEN RAISE EXCEPTION 'Thiếu mã yêu cầu order.'; END IF;
  request_payload := jsonb_build_object('table',p_table,'lines',p_lines,'notes',p_notes);
  SELECT * INTO previous FROM restaurant_private.submit_requests WHERE actor_id=auth.uid() AND request_id=p_request;
  IF FOUND THEN
    IF previous.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Mã yêu cầu đã dùng cho nội dung khác.'; END IF;
    RETURN previous.order_id;
  END IF;
  ids := restaurant_private.table_ids(p_table);
  IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status NOT IN ('empty','serving')) THEN
    RAISE EXCEPTION 'Bàn đã chuyển trạng thái; vui lòng mở lại bàn.';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Danh sách món không hợp lệ.';
  END IF;
  SELECT count(*), (array_agg(id ORDER BY created_at,id))[1] INTO n,oid FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid;
  IF n>1 THEN RAISE EXCEPTION 'Nhóm bàn có nhiều hóa đơn mở; cần đối soát.'; END IF;
  IF oid IS NULL THEN
    INSERT INTO public.orders(table_id,staff_id,notes) VALUES(ids[1],auth.uid(),nullif(p_notes,'')) RETURNING id INTO oid;
  ELSIF coalesce(p_notes,'')<>'' THEN UPDATE public.orders SET notes=p_notes WHERE id=oid;
  END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF coalesce(line->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Số lượng không hợp lệ.'; END IF;
    qty := (line->>'quantity')::integer;
    IF qty>1000 THEN RAISE EXCEPTION 'Số lượng vượt giới hạn.'; END IF;
    SELECT * INTO m FROM public.menu_items WHERE id=(line->>'menu_item_id')::uuid AND is_available;
    IF NOT FOUND OR m.price NOT BETWEEN 0 AND 9999999999.99 THEN RAISE EXCEPTION 'Món không còn bán hoặc giá không hợp lệ.'; END IF;
    -- Keep one row per unit, preserving existing kitchen/return workflow.
    INSERT INTO public.order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,notes,no_cook,status)
      SELECT oid,m.id,m.name,m.price,1,nullif(line->>'notes',''),coalesce(m.no_cook,false),
        CASE WHEN coalesce(m.no_cook,false) THEN 'done'::public.order_item_status ELSE 'pending'::public.order_item_status END
      FROM generate_series(1,qty);
  END LOOP;
  UPDATE public.orders SET total=(SELECT coalesce(sum(price_snapshot*quantity),0) FROM public.order_items WHERE order_id=oid) WHERE id=oid;
  UPDATE public.restaurant_tables SET status='serving' WHERE id=ANY(ids);
  INSERT INTO restaurant_private.submit_requests VALUES(auth.uid(),p_request,request_payload,oid);
  RETURN oid;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_payment(p_order uuid,p_action text,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE o public.orders; q jsonb; ids uuid[]; method public.payment_method;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF p_action NOT IN ('request_qr','confirm_qr','confirm_cash') OR p_action IS NULL THEN RAISE EXCEPTION 'Thao tác không hợp lệ.'; END IF;
  IF p_action='confirm_qr' THEN PERFORM restaurant_private.require_role(ARRAY['admin','cashier']); END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hóa đơn không tồn tại.'; END IF;
  IF o.is_paid THEN
    IF o.payment_snapshot IS NOT NULL THEN
      IF p_action='request_qr' OR (p_action='confirm_cash' AND o.payment_method<>'cash')
        OR (p_action='confirm_qr' AND o.payment_method<>'qr') THEN
        RAISE EXCEPTION 'Hóa đơn đã thanh toán; không thể đổi phương thức hoặc yêu cầu lại.';
      END IF;
      RETURN o.payment_snapshot;
    END IF;
    RAISE EXCEPTION 'Hóa đơn cũ đã thanh toán; không được chốt lại.';
  END IF;
  ids := restaurant_private.table_ids(o.table_id);
  IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status NOT IN ('serving','awaiting_payment')) THEN
    RAISE EXCEPTION 'Trạng thái bàn không hợp lệ để thanh toán.';
  END IF;
  IF p_action='confirm_qr' AND (o.payment_method IS DISTINCT FROM 'qr' OR EXISTS (
    SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status<>'awaiting_payment')) THEN
    RAISE EXCEPTION 'Hóa đơn chưa yêu cầu thanh toán QR.';
  END IF;
  q := restaurant_private.quote(p_order);
  IF p_fingerprint IS DISTINCT FROM q->>'fingerprint' THEN
    RAISE EXCEPTION 'Hóa đơn hoặc phí vừa thay đổi. Vui lòng kiểm tra lại số tiền rồi xác nhận.' USING ERRCODE='40001';
  END IF;
  IF p_action='request_qr' THEN
    UPDATE public.orders SET payment_method='qr',total=(q->>'subtotal')::numeric WHERE id=p_order;
    UPDATE public.restaurant_tables SET status='awaiting_payment' WHERE id=ANY(ids);
    RETURN q;
  END IF;
  method := CASE WHEN p_action='confirm_cash' THEN 'cash'::public.payment_method ELSE 'qr'::public.payment_method END;
  q := q || jsonb_build_object('payment_method',method,'paid_at',transaction_timestamp(),
    'cashier_id',auth.uid(),'cashier_name',restaurant_private.actor_label());
  UPDATE public.orders SET is_paid=true,paid_at=transaction_timestamp(),payment_method=method,
    total=(q->>'subtotal')::numeric,payment_snapshot=q,
    notes=concat_ws(E'\n',nullif(notes,''),'[Người thu: '||restaurant_private.actor_label()||']') WHERE id=p_order;
  UPDATE public.restaurant_tables SET status='needs_cleanup' WHERE id=ANY(ids);
  RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_merge(p_source uuid,p_target uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.restaurant_tables; b public.restaurant_tables; ids uuid[]; gid uuid; n integer; next_status public.table_status;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  SELECT * INTO a FROM public.restaurant_tables WHERE id=p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn nguồn không tồn tại.'; END IF;
  SELECT * INTO b FROM public.restaurant_tables WHERE id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn đích không tồn tại.'; END IF;
  IF a.id=b.id OR (a.merged_group_id IS NOT NULL AND a.merged_group_id=b.merged_group_id) THEN RETURN a.merged_group_id; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(restaurant_private.table_ids(a.id)||restaurant_private.table_ids(b.id)) x;
  IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status NOT IN ('empty','serving'))
     OR (a.status<>'empty' AND b.status<>'empty') THEN RAISE EXCEPTION 'Chỉ ghép bàn Trống với Trống hoặc Đang phục vụ.'; END IF;
  SELECT count(*) INTO n FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid;
  IF n>1 THEN RAISE EXCEPTION 'Có nhiều hóa đơn mở; không tự xóa hoặc hợp nhất dữ liệu.'; END IF;
  gid := coalesce(a.merged_group_id,b.merged_group_id);
  IF gid IS NULL THEN INSERT INTO public.table_groups(display_name,primary_table_id) VALUES(a.name||' + '||b.name, a.id) RETURNING id INTO gid; END IF;
  next_status := CASE WHEN n>0 OR EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status='serving') THEN 'serving'::public.table_status ELSE 'empty'::public.table_status END;
  UPDATE public.restaurant_tables SET merged_group_id=gid,status=next_status WHERE id=ANY(ids);
  UPDATE public.table_groups SET display_name=(SELECT string_agg(name,' + ' ORDER BY id) FROM public.restaurant_tables WHERE id=ANY(ids)),
    primary_table_id=coalesce((SELECT table_id FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid LIMIT 1),ids[1]) WHERE id=gid;
  DELETE FROM public.table_groups WHERE id IN (a.merged_group_id,b.merged_group_id) AND id<>gid
    AND NOT EXISTS (SELECT 1 FROM public.restaurant_tables WHERE merged_group_id=public.table_groups.id);
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_release(p_table uuid,p_cleanup boolean DEFAULT false) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ids uuid[]; gid uuid;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  ids := restaurant_private.table_ids(p_table);
  SELECT merged_group_id INTO gid FROM public.restaurant_tables WHERE id=p_table;
  IF EXISTS (SELECT 1 FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid)
    OR EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND
      ((p_cleanup AND status<>'needs_cleanup') OR (NOT p_cleanup AND status<>'empty'))) THEN
    RAISE EXCEPTION 'Không thể dọn hoặc tách bàn đang có đơn/chưa đúng trạng thái.';
  END IF;
  UPDATE public.restaurant_tables SET status='empty',merged_group_id=NULL WHERE id=ANY(ids);
  IF gid IS NOT NULL THEN DELETE FROM public.table_groups WHERE id=gid; END IF;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_item(p_item uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE it public.order_items;
BEGIN
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF p_action IN ('start','finish') THEN PERFORM restaurant_private.require_role(ARRAY['admin','kitchen']);
  ELSE PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']); END IF;
  SELECT * INTO it FROM public.order_items WHERE id=p_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Món đã thay đổi hoặc đã hủy.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=it.order_id AND NOT is_paid) THEN RAISE EXCEPTION 'Hóa đơn đã chốt.'; END IF;
  IF p_action='cancel' AND it.status='pending' THEN DELETE FROM public.order_items WHERE id=p_item;
  ELSIF p_action='start' AND it.status='pending' THEN UPDATE public.order_items SET status='cooking' WHERE id=p_item;
  ELSIF p_action='finish' AND it.status IN ('pending','cooking') THEN UPDATE public.order_items SET status='done',done_at=transaction_timestamp() WHERE id=p_item;
  ELSIF p_action='serve' AND it.status='done' THEN UPDATE public.order_items SET status='served',served_at=transaction_timestamp() WHERE id=p_item;
  ELSE RAISE EXCEPTION 'Trạng thái món đã thay đổi, không thể thực hiện thao tác.'; END IF;
  UPDATE public.orders SET total=(SELECT coalesce(sum(price_snapshot*quantity),0) FROM public.order_items WHERE order_id=it.order_id) WHERE id=it.order_id;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_edit_table(p_table uuid,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ids uuid[]; requested public.table_status; result jsonb;
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  ids := restaurant_private.table_ids(p_table);
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('name','seats','status')) THEN RAISE EXCEPTION 'Thông tin bàn không hợp lệ.'; END IF;
  IF p_patch ? 'status' THEN
    requested := (p_patch->>'status')::public.table_status;
    IF requested IS NULL THEN RAISE EXCEPTION 'Trạng thái bàn không hợp lệ.'; END IF;
    IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id=ANY(ids) AND status<>requested) THEN
      IF EXISTS (SELECT 1 FROM public.orders WHERE table_id=ANY(ids) AND NOT is_paid)
        OR requested NOT IN ('empty','serving') THEN
        RAISE EXCEPTION 'Bàn có hóa đơn phải đổi trạng thái qua quy trình thanh toán/dọn bàn.';
      END IF;
      UPDATE public.restaurant_tables SET status=requested WHERE id=ANY(ids);
    END IF;
  END IF;
  IF p_patch ? 'name' AND coalesce(btrim(p_patch->>'name'),'')='' THEN RAISE EXCEPTION 'Tên bàn không hợp lệ.'; END IF;
  IF p_patch ? 'seats' AND (coalesce(p_patch->>'seats','') !~ '^[1-9][0-9]*$' OR (p_patch->>'seats')::numeric>1000) THEN RAISE EXCEPTION 'Số chỗ không hợp lệ.'; END IF;
  UPDATE public.restaurant_tables SET name=CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
    seats=CASE WHEN p_patch ? 'seats' THEN (p_patch->>'seats')::integer ELSE seats END WHERE id=p_table RETURNING to_jsonb(restaurant_tables.*) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.restaurant_adjust(p_order uuid,p_action text,p_value jsonb,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE line jsonb; it public.order_items; qty integer; pct numeric; summary text := '';
BEGIN
  PERFORM restaurant_private.require_role(ARRAY['admin','cashier','staff']);
  PERFORM pg_advisory_xact_lock(20261009,1);
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=p_order AND NOT is_paid) THEN RAISE EXCEPTION 'Hóa đơn không còn mở.'; END IF;
  IF p_action='discount' THEN
    pct := (p_value->>'percent')::numeric;
    IF pct IS NULL OR pct NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Giảm giá không hợp lệ.'; END IF;
    UPDATE public.orders SET discount_percent=pct,notes=concat_ws(E'\n',nullif(notes,''),'Giảm giá: '||pct||'%'||E'\nLý do giảm giá: ['||coalesce(p_reason,'')||']'||E'\nNgười thực hiện giảm giá: ['||restaurant_private.actor_label()||']') WHERE id=p_order;
  ELSIF p_action='return' THEN
    IF jsonb_typeof(p_value) IS DISTINCT FROM 'array' OR jsonb_array_length(p_value) NOT BETWEEN 1 AND 200
      OR (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(p_value)) THEN RAISE EXCEPTION 'Danh sách trả món không hợp lệ.'; END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(p_value) LOOP
      SELECT * INTO it FROM public.order_items WHERE id=(line->>'id')::uuid AND order_id=p_order;
      IF NOT FOUND OR NOT it.no_cook THEN RAISE EXCEPTION 'Món không thuộc hóa đơn hoặc không được trả theo quy trình hiện tại.'; END IF;
      IF coalesce(line->>'quantity','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Số lượng trả không hợp lệ.'; END IF;
      qty := (line->>'quantity')::integer;
      IF qty>it.quantity OR (line->>'expected_quantity')::integer IS DISTINCT FROM it.quantity THEN RAISE EXCEPTION 'Số lượng món vừa thay đổi; vui lòng tải lại.'; END IF;
      summary := concat_ws(', ',nullif(summary,''),it.name_snapshot||' ×'||qty);
      IF qty=it.quantity THEN DELETE FROM public.order_items WHERE id=it.id;
      ELSE UPDATE public.order_items SET quantity=quantity-qty WHERE id=it.id; END IF;
    END LOOP;
    UPDATE public.orders SET total=(SELECT coalesce(sum(price_snapshot*quantity),0) FROM public.order_items WHERE order_id=p_order),
      notes=concat_ws(E'\n',nullif(notes,''),'Trả món: '||summary||E'\nLý do trả: ['||coalesce(p_reason,'')||']'||E'\nNgười thực hiện trả món: ['||restaurant_private.actor_label()||']') WHERE id=p_order;
  ELSE RAISE EXCEPTION 'Thao tác không hợp lệ.'; END IF;
END $$;

-- Defense in depth for service-side code too: paid money/items never change.
CREATE OR REPLACE FUNCTION restaurant_private.freeze_paid() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME='orders' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.is_paid OR NEW.payment_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Hóa đơn mới phải được tạo mở rồi chốt qua giao dịch thanh toán.'; END IF;
      RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' AND NOT OLD.is_paid AND NEW.is_paid AND NEW.payment_snapshot IS NULL THEN
      RAISE EXCEPTION 'Hóa đơn mới phải có dữ liệu chốt thanh toán.';
    END IF;
    IF OLD.is_paid AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'staff_id') IS DISTINCT FROM (to_jsonb(OLD)-'staff_id')
      OR (NEW.staff_id IS DISTINCT FROM OLD.staff_id AND NEW.staff_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Không được sửa hoặc xóa hóa đơn đã thanh toán.';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.orders WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.order_id ELSE OLD.order_id END AND is_paid)
      OR (TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM public.orders WHERE id=NEW.order_id AND is_paid)) THEN
      RAISE EXCEPTION 'Không được sửa món của hóa đơn đã thanh toán.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase1_freeze_paid ON public.orders;
CREATE TRIGGER phase1_freeze_paid BEFORE INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION restaurant_private.freeze_paid();
DROP TRIGGER IF EXISTS phase1_freeze_paid ON public.order_items;
CREATE TRIGGER phase1_freeze_paid BEFORE INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION restaurant_private.freeze_paid();

-- Metadata editing stays available to Admin/Cashier, but status/group changes
-- must use the authorized atomic RPCs (which run as the function owner).
CREATE OR REPLACE FUNCTION restaurant_private.guard_table_metadata() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF (TG_OP='INSERT' AND (NEW.status<>'empty' OR NEW.merged_group_id IS NOT NULL)) OR
      (TG_OP='UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.merged_group_id IS DISTINCT FROM OLD.merged_group_id)) THEN
      RAISE EXCEPTION 'Đổi trạng thái hoặc ghép bàn phải qua giao dịch server.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase1_table_metadata ON public.restaurant_tables;
CREATE TRIGGER phase1_table_metadata BEFORE INSERT OR UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_table_metadata();

-- Replace broad policies, not merely add restrictive-looking permissive ones.
DO $$ DECLARE p record; tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['orders','order_items','table_groups','restaurant_tables','payment_settings','menu_items','categories','recipes','ingredients','stock_movements','profiles','user_roles'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,tbl);
    END LOOP;
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['orders','order_items','table_groups','restaurant_tables','payment_settings','menu_items','categories','recipes','ingredients','stock_movements','user_roles'] LOOP
    EXECUTE format('CREATE POLICY phase1_read ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''cashier'') OR public.has_role(auth.uid(),''staff'') OR public.has_role(auth.uid(),''kitchen''))',tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['payment_settings','menu_items','categories','recipes','ingredients','stock_movements'] LOOP
    EXECUTE format('CREATE POLICY phase1_admin_write ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(),''admin'')) WITH CHECK (public.has_role(auth.uid(),''admin''))',tbl);
  END LOOP;
END $$;
CREATE POLICY phase1_table_admin_cashier ON public.restaurant_tables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY phase1_profile_read ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY phase1_profile_update ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY phase1_profile_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id=auth.uid() OR public.has_role(auth.uid(),'admin'));
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.orders,public.order_items,public.table_groups,public.user_roles FROM PUBLIC,anon,authenticated;

-- Directory keeps the existing hide-personal behavior, enforced on the server.
CREATE OR REPLACE FUNCTION public.restaurant_directory() RETURNS TABLE(
  id uuid,full_name text,username text,phone text,address text,birthday date,avatar_url text,hide_personal boolean,hire_date date,role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT p.id,p.full_name,p.username,
   CASE WHEN NOT p.hide_personal OR p.id=auth.uid() OR public.has_role(auth.uid(),'admin') THEN p.phone END,
   CASE WHEN NOT p.hide_personal OR p.id=auth.uid() OR public.has_role(auth.uid(),'admin') THEN p.address END,
   CASE WHEN NOT p.hide_personal OR p.id=auth.uid() OR public.has_role(auth.uid(),'admin') THEN p.birthday END,
   p.avatar_url,p.hide_personal,
   CASE WHEN NOT p.hide_personal OR p.id=auth.uid() OR public.has_role(auth.uid(),'admin') THEN p.hire_date END,r.role
 FROM public.profiles p LEFT JOIN LATERAL (
   SELECT role FROM public.user_roles WHERE user_id=p.id ORDER BY role::text LIMIT 1
 ) r ON true
 WHERE auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid())
$$;

-- Private helpers cannot be invoked as public RPCs. Public functions are
-- explicitly allowlisted and always check the authenticated actor internally.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA restaurant_private FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('restaurant_quote','restaurant_submit_order','restaurant_payment','restaurant_merge','restaurant_release','restaurant_item','restaurant_adjust','restaurant_directory','restaurant_edit_table') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
  END LOOP;
END $$;
COMMIT;
