-- LOCAL REVIEW ONLY. Requires all three phase 1 migrations. No legacy backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(20261009,1);
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND NOT tgisinternal
   AND tgname IN ('trg_deduct_stock_insert','trg_restore_stock_update','trg_restore_stock_delete')) <> 3
 OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND NOT tgisinternal AND tgname='trg_deduct_stock')
 OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.order_items'::regclass AND NOT t.tgisinternal
  AND ((t.tgname='trg_deduct_stock_insert' AND p.proname<>'deduct_stock_on_insert')
    OR (t.tgname='trg_restore_stock_update' AND p.proname<>'restore_stock_on_update')
    OR (t.tgname='trg_restore_stock_delete' AND p.proname<>'restore_stock_on_delete')
    OR (p.proname IN ('deduct_stock_on_insert','restore_stock_on_update','restore_stock_on_delete') AND t.tgname NOT IN ('trg_deduct_stock_insert','trg_restore_stock_update','trg_restore_stock_delete'))))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND NOT tgisinternal
  AND (tgtype::integer & 1)=1 AND (tgtype::integer & 2)=0
  AND tgname NOT IN ('trg_deduct_stock_insert','trg_restore_stock_update','trg_restore_stock_delete')) THEN
   RAISE EXCEPTION 'Preflight: inventory trigger layout differs; manual review required';
 END IF;
END $$;
-- Cloud recipes currently allow NULL links and duplicate ingredient rows.
-- Do not guess which quantity is correct or silently merge existing recipes.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.recipes WHERE menu_item_id IS NULL OR ingredient_id IS NULL OR quantity<=0 OR quantity::text IN ('NaN','Infinity','-Infinity'))
 OR EXISTS(SELECT 1 FROM public.recipes GROUP BY menu_item_id,ingredient_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Preflight: invalid or duplicate recipes; reconcile separately, no automatic data conversion';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_one_ingredient_per_menu ON public.recipes(menu_item_id,ingredient_id);

CREATE TABLE IF NOT EXISTS restaurant_private.item_stock (
 item_id uuid PRIMARY KEY, amounts jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurant_private.stock_requests (
 actor_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
REVOKE ALL ON restaurant_private.item_stock,restaurant_private.stock_requests FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['ingredients','stock_movements','areas','categories'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS phase2_lock_writes ON public.%I',tbl);
  EXECUTE format('CREATE TRIGGER phase2_lock_writes BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION restaurant_private.lock_writes()',tbl);
 END LOOP;
END $$;

-- Validate raw numbers before PostgreSQL numeric(scale) can round them.
CREATE OR REPLACE FUNCTION restaurant_private.decimal_value(v jsonb, label text, scale integer, maximum numeric, positive boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE s text; n numeric;
BEGIN
 s:=v#>>'{}';
 IF s IS NULL OR s !~ ('^[0-9]+(\.[0-9]{1,'||scale||'})?$') OR length(s)>32 THEN
  RAISE EXCEPTION '%: nhập số hợp lệ, tối đa % chữ số thập phân.',label,scale;
 END IF;
 n:=s::numeric;
 IF n>maximum OR (positive AND n<=0) THEN RAISE EXCEPTION '% ngoài giới hạn cho phép.',label; END IF;
 RETURN n;
END $$;

-- Replace the functions behind the EXISTING three triggers. Never add a second
-- deduction trigger. An empty recipe still records a marker (empty snapshot).
CREATE OR REPLACE FUNCTION public.deduct_stock_on_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT coalesce(jsonb_object_agg(ingredient_id::text,quantity),'{}'::jsonb) INTO snapshot
 FROM public.recipes WHERE menu_item_id=NEW.menu_item_id;
 INSERT INTO restaurant_private.item_stock VALUES(NEW.id,snapshot);
 UPDATE public.ingredients i SET stock=i.stock-(x.value::numeric*NEW.quantity)
 FROM jsonb_each_text(snapshot) x WHERE i.id=x.key::uuid;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.restore_stock_on_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT amounts INTO snapshot FROM restaurant_private.item_stock WHERE item_id=OLD.id;
 IF NOT FOUND THEN
  -- Legacy items have no trustworthy historical recipe. Preserve the verified
  -- old behavior; recipe mutation is blocked while such an open item exists.
  SELECT coalesce(jsonb_object_agg(ingredient_id::text,quantity),'{}'::jsonb) INTO snapshot
  FROM public.recipes WHERE menu_item_id=OLD.menu_item_id;
 END IF;
 UPDATE public.ingredients i SET stock=i.stock+(x.value::numeric*OLD.quantity)
 FROM jsonb_each_text(snapshot) x WHERE i.id=x.key::uuid;
 DELETE FROM restaurant_private.item_stock WHERE item_id=OLD.id;
 RETURN OLD;
END $$;
CREATE OR REPLACE FUNCTION public.restore_stock_on_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NEW.menu_item_id<>OLD.menu_item_id OR NEW.quantity>OLD.quantity THEN
  RAISE EXCEPTION 'Không được đổi món hoặc tăng số lượng trên dòng đã trừ kho; hãy đặt thêm món.';
 END IF;
 IF NEW.quantity<OLD.quantity THEN
  SELECT amounts INTO snapshot FROM restaurant_private.item_stock WHERE item_id=OLD.id;
  IF NOT FOUND THEN
   SELECT coalesce(jsonb_object_agg(ingredient_id::text,quantity),'{}'::jsonb) INTO snapshot
   FROM public.recipes WHERE menu_item_id=OLD.menu_item_id;
  END IF;
  UPDATE public.ingredients i SET stock=i.stock+(x.value::numeric*(OLD.quantity-NEW.quantity))
  FROM jsonb_each_text(snapshot) x WHERE i.id=x.key::uuid;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deduct_stock_on_insert(),public.restore_stock_on_delete(),public.restore_stock_on_update() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION restaurant_private.guard_recipe() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
  WHERE NOT o.is_paid AND oi.menu_item_id IN (
   CASE WHEN TG_OP<>'INSERT' THEN OLD.menu_item_id END, CASE WHEN TG_OP<>'DELETE' THEN NEW.menu_item_id END)
  AND NOT EXISTS (SELECT 1 FROM restaurant_private.item_stock s WHERE s.item_id=oi.id)) THEN
  RAISE EXCEPTION 'Món còn đơn cũ chưa có snapshot kho. Hoàn tất đơn trước khi sửa định mức.';
 END IF;
 IF TG_OP<>'DELETE' AND (NEW.menu_item_id IS NULL OR NEW.ingredient_id IS NULL OR NEW.quantity<=0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'Định mức nguyên liệu phải lớn hơn 0.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase2_recipe_guard ON public.recipes;
CREATE TRIGGER phase2_recipe_guard BEFORE INSERT OR UPDATE OR DELETE ON public.recipes FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_recipe();

CREATE OR REPLACE FUNCTION public.restaurant_stock(p_action text,p_id uuid,p_data jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE oldrow public.ingredients; result jsonb; prior restaurant_private.stock_requests;
 payload jsonb; amount numeric; initial numeric; minimum numeric; label text; unit_name text;
BEGIN
 PERFORM restaurant_private.require_role(ARRAY['admin']); PERFORM pg_advisory_xact_lock(20261009,1);
 IF p_request IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Yêu cầu kho không hợp lệ.'; END IF;
 payload:=jsonb_build_object('action',p_action,'id',p_id,'data',p_data);
 SELECT * INTO prior FROM restaurant_private.stock_requests WHERE actor_id=auth.uid() AND request_id=p_request;
 IF FOUND THEN
  IF prior.payload<>payload THEN RAISE EXCEPTION 'Mã yêu cầu đã dùng với nội dung khác.'; END IF;
  RETURN prior.result;
 END IF;
 IF p_action<>'create' THEN
  SELECT * INTO oldrow FROM public.ingredients WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nguyên liệu không còn tồn tại.'; END IF;
 END IF;
 IF p_action IN ('create','edit') THEN
  label:=btrim(p_data->>'name'); unit_name:=btrim(p_data->>'unit');
  IF label IS NULL OR length(label) NOT BETWEEN 1 AND 200 OR unit_name IS NULL OR length(unit_name) NOT BETWEEN 1 AND 32 THEN
   RAISE EXCEPTION 'Tên hoặc đơn vị nguyên liệu không hợp lệ.';
  END IF;
  initial:=restaurant_private.decimal_value(p_data->'stock','Tồn kho',3,99999999999.999);
  minimum:=restaurant_private.decimal_value(p_data->'min_stock','Tồn tối thiểu',3,99999999999.999);
  IF p_action='create' THEN
   INSERT INTO public.ingredients(name,unit,stock,min_stock) VALUES(label,unit_name,initial,minimum) RETURNING to_jsonb(ingredients.*) INTO result;
   p_id:=(result->>'id')::uuid;
   amount:=initial;
  ELSE
   IF (p_data->>'expected_stock') IS NULL OR (p_data->>'expected_stock')::numeric IS DISTINCT FROM oldrow.stock
    OR jsonb_typeof(p_data->'expected') IS DISTINCT FROM 'object' OR NOT to_jsonb(oldrow) @> ((p_data->'expected')-'created_at') THEN
    RAISE EXCEPTION 'Tồn kho vừa thay đổi. Mở lại nguyên liệu để kiểm tra trước khi lưu.' USING ERRCODE='40001';
   END IF;
   IF unit_name<>oldrow.unit AND (oldrow.stock<>0 OR EXISTS(SELECT 1 FROM public.recipes WHERE ingredient_id=p_id)
     OR EXISTS(SELECT 1 FROM restaurant_private.item_stock s JOIN public.order_items oi ON oi.id=s.item_id JOIN public.orders o ON o.id=oi.order_id WHERE NOT o.is_paid AND s.amounts ? p_id::text)) THEN
    RAISE EXCEPTION 'Nguyên liệu đang có tồn hoặc định mức/đơn mở; không thể đổi đơn vị.';
   END IF;
   amount:=initial-oldrow.stock;
   UPDATE public.ingredients SET name=label,unit=unit_name,stock=initial,min_stock=minimum WHERE id=p_id RETURNING to_jsonb(ingredients.*) INTO result;
  END IF;
 ELSIF p_action='adjust' THEN
  -- Signed adjustment exists in the current Admin/AI workflow; never clamp it
  -- silently. The existing import dialog submits a positive amount only.
  IF p_data->>'delta' IS NULL OR (p_data->>'delta') !~ '^-?[0-9]+(\.[0-9]{1,3})?$' THEN RAISE EXCEPTION 'Số lượng kho không hợp lệ.'; END IF;
  amount:=restaurant_private.decimal_value(to_jsonb(ltrim(p_data->>'delta','-')),'Số lượng kho',3,99999999999.999,true);
  IF left(p_data->>'delta',1)='-' THEN amount:=-amount; END IF;
  IF oldrow.stock+amount<0 OR oldrow.stock+amount>99999999999.999 THEN RAISE EXCEPTION 'Tồn kho sau điều chỉnh ngoài giới hạn.'; END IF;
  UPDATE public.ingredients SET stock=stock+amount WHERE id=p_id RETURNING to_jsonb(ingredients.*) INTO result;
 ELSIF p_action='delete' THEN
  IF EXISTS(SELECT 1 FROM public.recipes WHERE ingredient_id=p_id) OR EXISTS(
   SELECT 1 FROM restaurant_private.item_stock s JOIN public.order_items oi ON oi.id=s.item_id JOIN public.orders o ON o.id=oi.order_id
   WHERE NOT o.is_paid AND s.amounts ? p_id::text) OR EXISTS(SELECT 1 FROM public.stock_movements WHERE ingredient_id=p_id) THEN
   RAISE EXCEPTION 'Nguyên liệu còn định mức, đơn mở hoặc lịch sử kho; không thể xóa.';
  END IF;
  DELETE FROM public.ingredients WHERE id=p_id; result:=jsonb_build_object('id',p_id); amount:=0;
 ELSE RAISE EXCEPTION 'Thao tác kho không hợp lệ.';
 END IF;
 IF amount<>0 THEN
  INSERT INTO public.stock_movements(ingredient_id,delta,reason,created_by)
  VALUES(p_id,amount,coalesce(nullif(btrim(p_data->>'reason'),''),'Điều chỉnh kho'),auth.uid());
 END IF;
 INSERT INTO restaurant_private.stock_requests VALUES(auth.uid(),p_request,payload,result);
 RETURN result;
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.ingredients,public.stock_movements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurant_stock(text,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_stock(text,uuid,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION restaurant_private.guard_layout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='areas' THEN
  IF EXISTS(SELECT 1 FROM public.restaurant_tables WHERE area_id=OLD.id) THEN RAISE EXCEPTION 'Khu vực còn bàn; chuyển hoặc xóa bàn hợp lệ trước.'; END IF;
  RETURN OLD;
 END IF;
 IF (NEW.area_id IS DISTINCT FROM OLD.area_id OR NEW.sort_order IS DISTINCT FROM OLD.sort_order)
   AND (OLD.status<>'empty' OR OLD.merged_group_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.orders WHERE table_id=OLD.id AND NOT is_paid)) THEN
  RAISE EXCEPTION 'Bàn đang hoạt động hoặc ghép nhóm; không thể đổi vị trí.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase2_area_guard ON public.areas;
CREATE TRIGGER phase2_area_guard BEFORE DELETE ON public.areas FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_layout();
DROP TRIGGER IF EXISTS phase2_layout_guard ON public.restaurant_tables;
CREATE TRIGGER phase2_layout_guard BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_layout();

CREATE OR REPLACE FUNCTION public.restaurant_move_table(p_source uuid,p_target uuid DEFAULT NULL,p_area uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.restaurant_tables; b public.restaurant_tables; n integer;
BEGIN
 PERFORM restaurant_private.require_role(ARRAY['admin']); PERFORM pg_advisory_xact_lock(20261009,1);
 SELECT * INTO a FROM public.restaurant_tables WHERE id=p_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bàn không còn tồn tại.'; END IF;
 IF a.status<>'empty' OR a.merged_group_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.orders WHERE table_id=a.id AND NOT is_paid) THEN RAISE EXCEPTION 'Bàn đang hoạt động hoặc ghép nhóm; không thể đổi vị trí.'; END IF;
 IF p_target IS NOT NULL THEN
  SELECT * INTO b FROM public.restaurant_tables WHERE id=p_target;
  IF NOT FOUND OR b.id=a.id THEN RAISE EXCEPTION 'Bàn đích không hợp lệ.'; END IF;
  IF a.area_id IS NOT DISTINCT FROM b.area_id THEN
   IF b.status<>'empty' OR b.merged_group_id IS NOT NULL THEN RAISE EXCEPTION 'Bàn đích đang hoạt động hoặc ghép nhóm.'; END IF;
   IF a.sort_order=b.sort_order THEN
    WITH ranks AS(SELECT id,row_number() OVER(ORDER BY sort_order,id)::integer n FROM public.restaurant_tables WHERE area_id IS NOT DISTINCT FROM a.area_id)
    UPDATE public.restaurant_tables t SET sort_order=r.n FROM ranks r WHERE t.id=r.id AND t.status='empty' AND t.merged_group_id IS NULL;
    SELECT * INTO a FROM public.restaurant_tables WHERE id=p_source;
    SELECT * INTO b FROM public.restaurant_tables WHERE id=p_target;
   END IF;
   UPDATE public.restaurant_tables SET sort_order=CASE WHEN id=a.id THEN b.sort_order ELSE a.sort_order END WHERE id IN(a.id,b.id);
  ELSE UPDATE public.restaurant_tables SET area_id=b.area_id,sort_order=b.sort_order WHERE id=a.id;
  END IF;
 ELSE
  IF p_area IS NULL OR NOT EXISTS(SELECT 1 FROM public.areas WHERE id=p_area) THEN RAISE EXCEPTION 'Khu vực không còn tồn tại.'; END IF;
  SELECT coalesce(max(sort_order),0)+1 INTO n FROM public.restaurant_tables WHERE area_id=p_area;
  UPDATE public.restaurant_tables SET area_id=p_area,sort_order=n WHERE id=a.id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.restaurant_move_table(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_move_table(uuid,uuid,uuid) TO authenticated;

-- Check the completed transaction, allowing merge/release to update its rows
-- in any order while rejecting partial groups at COMMIT.
CREATE OR REPLACE FUNCTION restaurant_private.check_group_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE gids uuid[]; gid uuid; members integer; states integer; open_orders integer; primary_id uuid;
BEGIN
 IF TG_TABLE_NAME='restaurant_tables' THEN
  gids:=ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.merged_group_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.merged_group_id END];
 ELSIF TG_TABLE_NAME='table_groups' THEN
  gids:=ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.id END];
 ELSE
  SELECT array_agg(merged_group_id) INTO gids FROM public.restaurant_tables WHERE id IN(
   CASE WHEN TG_OP<>'INSERT' THEN OLD.table_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.table_id END);
 END IF;
 FOREACH gid IN ARRAY coalesce(gids,ARRAY[]::uuid[]) LOOP
  IF gid IS NULL THEN CONTINUE; END IF;
  SELECT primary_table_id INTO primary_id FROM public.table_groups WHERE id=gid;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT count(*),count(DISTINCT status) INTO members,states FROM public.restaurant_tables WHERE merged_group_id=gid;
  SELECT count(*) INTO open_orders FROM public.orders o JOIN public.restaurant_tables t ON t.id=o.table_id WHERE t.merged_group_id=gid AND NOT o.is_paid;
  IF members<2 OR states<>1 OR open_orders>1 OR NOT EXISTS(SELECT 1 FROM public.restaurant_tables WHERE id=primary_id AND merged_group_id=gid) THEN
   RAISE EXCEPTION 'Nhóm bàn không nhất quán; giao dịch đã được hoàn tác.';
  END IF;
  IF open_orders>0 AND EXISTS(SELECT 1 FROM public.restaurant_tables WHERE merged_group_id=gid AND status NOT IN ('serving','awaiting_payment')) THEN
   RAISE EXCEPTION 'Nhóm bàn có hóa đơn mở không thể ở trạng thái trống hoặc chờ dọn.';
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['restaurant_tables','table_groups','orders'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS phase2_group_consistency ON public.%I',tbl);
  EXECUTE format('CREATE CONSTRAINT TRIGGER phase2_group_consistency AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restaurant_private.check_group_consistency()',tbl);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA restaurant_private FROM PUBLIC,anon,authenticated;
COMMIT;
